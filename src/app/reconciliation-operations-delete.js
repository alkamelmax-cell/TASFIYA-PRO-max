const { mapDbErrorMessage } = require('./db-error-messages');
const { getSyncUpdateStatusUrl } = require('./sync-endpoints');

function createReconciliationOperationsDeleteHandlers(context) {
  const ipc = context.ipcRenderer;
  const fetchFn = context.fetchFn || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  const windowObj = context.windowObj || globalThis;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const formatDate = context.formatDate;
  const loadSavedReconciliations = context.loadSavedReconciliations || (async () => {});
  const logger = context.logger || console;

  async function deleteReconciliation(reconciliationId) {
    logger.log('🗑️ [DELETE] طلب حذف التصفية - معرف:', reconciliationId);

    try {
      const reconciliation = await ipc.invoke('db-get', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            WHERE r.id = ?
        `, [reconciliationId]);

      if (!reconciliation) {
        getDialogUtils().showError('التصفية غير موجودة', 'خطأ');
        return;
      }

      const reconciliationDisplay = reconciliation.reconciliation_number ? `#${reconciliation.reconciliation_number}` : '(مسودة)';
      const restoreNotice = reconciliation.origin_request_id
        ? '\n\nسيتم إرجاع طلب التصفية المرتبط إلى المعلقات للمراجعة مرة أخرى.'
        : '';
      const confirmMessage = `هل أنت متأكد من أنك تريد حذف التصفية رقم ${reconciliationDisplay}؟\n\nالكاشير: ${reconciliation.cashier_name} (${reconciliation.cashier_number})\nالتاريخ: ${formatDate(reconciliation.reconciliation_date)}${restoreNotice}\n\n⚠️ تحذير: هذا الإجراء لا يمكن التراجع عنه!`;

      const confirmed = await getDialogUtils().showConfirm(confirmMessage, 'تأكيد الحذف');
      if (confirmed) {
        await performSingleDelete(reconciliationId, reconciliation);
      }
    } catch (error) {
      logger.error('Error preparing delete:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'reconciliation',
          fallback: 'حدث خطأ أثناء تحضير الحذف.'
        })
      );
    }
  }

  async function restoreLinkedRequestIfNeeded(reconciliation) {
    const parsedRequestId = Number.parseInt(reconciliation?.origin_request_id ?? reconciliation?.originRequestId, 10);
    const originRequestId = Number.isFinite(parsedRequestId) && parsedRequestId > 0 ? parsedRequestId : null;
    if (!originRequestId) {
      return { restored: false };
    }

    const restoredReason = 'تم حذف التصفية المرتبطة بها وإعادتها للمراجعة';
    const restoreSql = `
      UPDATE reconciliation_requests
      SET status = ?,
          restored_at = CURRENT_TIMESTAMP,
          restored_from_reconciliation_id = ?,
          restored_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    const restoreParams = ['pending', reconciliation.id, restoredReason, originRequestId];
    let restored = false;

    try {
      const result = await ipc.invoke('db-run', restoreSql, restoreParams);
      restored = Number(result?.changes || 0) > 0;
    } catch (error) {
      if (
        String(error?.message || '').includes('restored_at')
        || String(error?.message || '').includes('restored_from_reconciliation_id')
        || String(error?.message || '').includes('restored_reason')
      ) {
        const fallbackResult = await ipc.invoke(
          'db-run',
          'UPDATE reconciliation_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['pending', originRequestId]
        );
        restored = Number(fallbackResult?.changes || 0) > 0;
      } else {
        throw error;
      }
    }

    if (!restored) {
      return { restored: false, requestId: originRequestId };
    }

    let shouldSyncServer = true;
    try {
      const syncStatus = await ipc.invoke('get-sync-status');
      shouldSyncServer = !!(syncStatus && syncStatus.success && syncStatus.isEnabled);
    } catch (_error) {
      shouldSyncServer = true;
    }

    if (shouldSyncServer && fetchFn) {
      try {
        const remoteUrl = getSyncUpdateStatusUrl({ preferLocal: false });
        const localUrl = getSyncUpdateStatusUrl({ preferLocal: true });
        const response = await fetchFn(remoteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: originRequestId,
            status: 'pending',
            restored_from_reconciliation_id: reconciliation.id,
            restored_reason: restoredReason
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) {
          logger.warn('⚠️ [DELETE] تعذر تحديث حالة الطلب على الخادم بعد استرجاعه:', payload.error || response.statusText);
          await fetchFn(localUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: originRequestId,
              status: 'pending',
              restored_from_reconciliation_id: reconciliation.id,
              restored_reason: restoredReason
            })
          }).catch(() => {});
        } else {
          logger.log(`✅ [DELETE] تم إرجاع الطلب ${originRequestId} إلى المعلقات على الخادم`);
        }
      } catch (error) {
        logger.warn('⚠️ [DELETE] تعذر مزامنة استرجاع الطلب مع الخادم:', error);
      }
    }

    const CustomEventCtor = typeof CustomEvent === 'function' ? CustomEvent : (windowObj && windowObj.CustomEvent);
    if (windowObj && typeof windowObj.dispatchEvent === 'function' && CustomEventCtor) {
      windowObj.dispatchEvent(new CustomEventCtor('reconciliation-request-restored', {
        detail: {
          requestId: originRequestId,
          reconciliationId: reconciliation.id,
          restoredReason
        }
      }));
    }

    return { restored, requestId: originRequestId };
  }

  async function performSingleDelete(reconciliationId, reconciliation = null) {
    logger.log('🗑️ [DELETE] تنفيذ حذف التصفية:', reconciliationId);

    try {
      getDialogUtils().showLoading('جاري حذف التصفية...', 'يرجى الانتظار');

      await ipc.invoke('db-run', 'DELETE FROM bank_receipts WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM cash_receipts WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM postpaid_sales WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM customer_receipts WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM return_invoices WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke('db-run', 'DELETE FROM suppliers WHERE reconciliation_id = ?', [reconciliationId]);
      await ipc.invoke(
        'db-run',
        'DELETE FROM cashbox_vouchers WHERE source_reconciliation_id = ? AND COALESCE(is_auto_generated, 0) = 1',
        [reconciliationId]
      );
      await ipc.invoke('db-run', 'DELETE FROM reconciliations WHERE id = ?', [reconciliationId]);

      let restoreResult = { restored: false };
      try {
        restoreResult = await restoreLinkedRequestIfNeeded(reconciliation || {});
      } catch (restoreError) {
        logger.warn('⚠️ [DELETE] تم حذف التصفية، لكن تعذر إرجاع الطلب المرتبط:', restoreError);
      }

      getDialogUtils().close();
      logger.log(`✅ [DELETE] تم حذف التصفية #${reconciliationId} بنجاح`);
      if (restoreResult.restored) {
        getDialogUtils().showSuccessToast('تم حذف التصفية وإرجاع الطلب المرتبط إلى المعلقات للمراجعة');
      } else {
        getDialogUtils().showSuccessToast('تم حذف التصفية بنجاح');
      }
      await loadSavedReconciliations();
    } catch (error) {
      getDialogUtils().close();
      logger.error(`❌ [DELETE] فشل في حذف التصفية #${reconciliationId}:`, error);
      const friendly = mapDbErrorMessage(error, {
        context: 'reconciliation',
        foreignKeyMessage: 'لا يمكن حذف التصفية لوجود قيود مرجعية مرتبطة.',
        fallback: 'حدث خطأ أثناء حذف التصفية.'
      });
      getDialogUtils().showError(friendly, 'خطأ في النظام');
    }
  }

  return {
    deleteReconciliation,
    performSingleDelete
  };
}

module.exports = {
  createReconciliationOperationsDeleteHandlers
};
