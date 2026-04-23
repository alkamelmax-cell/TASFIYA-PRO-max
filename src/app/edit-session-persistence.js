function createEditSessionPersistence(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const getEditMode = deps.getEditMode;
  const getCurrentUser = deps.getCurrentUser || (() => null);
  const DialogUtils = deps.DialogUtils;
  const logger = deps.logger || console;
  const trackedCollections = [
    'bankReceipts',
    'cashReceipts',
    'postpaidSales',
    'customerReceipts',
    'returnInvoices',
    'suppliers'
  ];
  const comparableFieldsByType = {
    bankReceipts: ['operation_type', 'atm_id', 'amount'],
    cashReceipts: ['denomination', 'quantity', 'total_amount'],
    postpaidSales: ['customer_name', 'amount'],
    customerReceipts: ['customer_name', 'amount', 'payment_type'],
    returnInvoices: ['invoice_number', 'amount'],
    suppliers: ['supplier_name', 'amount']
  };

  function getMode() {
    return getEditMode() || {};
  }

  function normalizeModifiedFlag(value) {
    return value === 1 || value === '1' || value === true ? 1 : 0;
  }

  function normalizeOptionalBoolean(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return null;
      }
      return value !== 0 ? 1 : 0;
    }

    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
      return 1;
    }
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
      return 0;
    }
    return null;
  }

  function normalizeComparableValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue === '') {
        return null;
      }

      const numericValue = Number(trimmedValue);
      if (!Number.isNaN(numericValue)) {
        return numericValue;
      }

      return trimmedValue;
    }

    return value;
  }

  function getComparableRecord(type, record) {
    const comparableFields = comparableFieldsByType[type] || [];
    const comparableRecord = {};

    comparableFields.forEach((fieldName) => {
      comparableRecord[fieldName] = normalizeComparableValue(record?.[fieldName]);
    });

    return comparableRecord;
  }

  function buildInitialSnapshotIndex() {
    const mode = getMode();
    const snapshot = mode.initialSnapshot || {};
    const snapshotIndex = {};

    trackedCollections.forEach((collectionType) => {
      const records = Array.isArray(snapshot[collectionType]) ? snapshot[collectionType] : [];
      const recordsById = new Map();

      records.forEach((record) => {
        if (record && record.id !== null && record.id !== undefined) {
          recordsById.set(String(record.id), record);
        }
      });

      snapshotIndex[collectionType] = recordsById;
    });

    return snapshotIndex;
  }

  function resolveModifiedFlag(type, record, snapshotIndex) {
    if (!record || typeof record !== 'object') {
      return 0;
    }

    if (normalizeModifiedFlag(record.is_modified) === 1) {
      return 1;
    }

    if (record.id === null || record.id === undefined || record.id === '') {
      return 1;
    }

    const originalRecordsById = snapshotIndex[type];
    if (!originalRecordsById || originalRecordsById.size === 0) {
      return normalizeModifiedFlag(record.is_modified);
    }

    const originalRecord = originalRecordsById.get(String(record.id));
    if (!originalRecord) {
      return 1;
    }

    const currentComparable = getComparableRecord(type, record);
    const originalComparable = getComparableRecord(type, originalRecord);
    const hasSameData = JSON.stringify(currentComparable) === JSON.stringify(originalComparable);
    return hasSameData ? 0 : 1;
  }

  async function deleteExistingRecords(reconciliationId) {
    logger.log('🗑️ [DELETE] حذف السجلات الموجودة...');

    const tables = [
      'bank_receipts',
      'cash_receipts',
      'postpaid_sales',
      'customer_receipts',
      'return_invoices',
      'suppliers'
    ];

    for (const table of tables) {
      await ipcRenderer.invoke('db-run', `DELETE FROM ${table} WHERE reconciliation_id = ?`, [reconciliationId]);
    }

    logger.log('✅ [DELETE] تم حذف السجلات الموجودة');
  }

  async function insertUpdatedRecords(data) {
    logger.log('➕ [INSERT] إدراج السجلات المحدثة...');
    const snapshotIndex = buildInitialSnapshotIndex();

    for (const receipt of data.bankReceipts || []) {
      const isModified = resolveModifiedFlag('bankReceipts', receipt, snapshotIndex);
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO bank_receipts (reconciliation_id, operation_type, atm_id, amount, is_modified) VALUES (?, ?, ?, ?, ?)',
        [data.reconciliationId, receipt.operation_type, receipt.atm_id, receipt.amount, isModified]
      );
    }

    for (const receipt of data.cashReceipts || []) {
      const isModified = resolveModifiedFlag('cashReceipts', receipt, snapshotIndex);
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO cash_receipts (reconciliation_id, denomination, quantity, total_amount, is_modified) VALUES (?, ?, ?, ?, ?)',
        [data.reconciliationId, receipt.denomination, receipt.quantity, receipt.total_amount, isModified]
      );
    }

    for (const sale of data.postpaidSales || []) {
      const isModified = resolveModifiedFlag('postpaidSales', sale, snapshotIndex);
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO postpaid_sales (reconciliation_id, customer_name, amount, is_modified) VALUES (?, ?, ?, ?)',
        [data.reconciliationId, sale.customer_name, sale.amount, isModified]
      );
    }

    for (const receipt of data.customerReceipts || []) {
      const isModified = resolveModifiedFlag('customerReceipts', receipt, snapshotIndex);
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO customer_receipts (reconciliation_id, customer_name, amount, payment_type, is_modified) VALUES (?, ?, ?, ?, ?)',
        [data.reconciliationId, receipt.customer_name, receipt.amount, receipt.payment_type || 'نقدي', isModified]
      );
    }

    for (const invoice of data.returnInvoices || []) {
      const isModified = resolveModifiedFlag('returnInvoices', invoice, snapshotIndex);
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO return_invoices (reconciliation_id, invoice_number, amount, is_modified) VALUES (?, ?, ?, ?)',
        [data.reconciliationId, invoice.invoice_number, invoice.amount, isModified]
      );
    }

    for (const supplier of data.suppliers || []) {
      const isModified = resolveModifiedFlag('suppliers', supplier, snapshotIndex);
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO suppliers (reconciliation_id, supplier_name, amount, is_modified) VALUES (?, ?, ?, ?)',
        [data.reconciliationId, supplier.supplier_name, supplier.amount, isModified]
      );
    }

    logger.log('✅ [INSERT] تم إدراج السجلات المحدثة بنجاح');
  }

  async function updateReconciliationInDatabase(data) {
    logger.log('🗄️ [DB-UPDATE] بدء تحديث البيانات في قاعدة البيانات...');

    try {
      const parsedFormulaProfileId = Number.parseInt(data.formulaProfileId, 10);
      const formulaProfileId = Number.isFinite(parsedFormulaProfileId) && parsedFormulaProfileId > 0
        ? parsedFormulaProfileId
        : null;
      const formulaSettingsJson = data.formulaSettings
        ? JSON.stringify(data.formulaSettings)
        : null;
      const normalizedCashboxPosting = normalizeOptionalBoolean(data.cashboxPostingEnabled);

      await ipcRenderer.invoke(
        'update-reconciliation-modified',
        data.reconciliationId,
        data.systemSales,
        data.totalReceipts,
        data.surplusDeficit,
        'completed',
        formulaSettingsJson,
        formulaProfileId
      );

      try {
        await ipcRenderer.invoke(
          'db-run',
          `UPDATE reconciliations
           SET cashier_id = ?,
               accountant_id = ?,
               reconciliation_date = ?,
               time_range_start = ?,
               time_range_end = ?,
               filter_notes = ?,
               formula_profile_id = COALESCE(?, formula_profile_id),
               formula_settings = COALESCE(?, formula_settings),
               cashbox_posting_enabled = COALESCE(?, cashbox_posting_enabled)
           WHERE id = ?`,
          [
            data.cashierId,
            data.accountantId,
            data.reconciliationDate,
            data.timeRangeStart,
            data.timeRangeEnd,
            data.filterNotes,
            formulaProfileId,
            formulaSettingsJson,
            normalizedCashboxPosting,
            data.reconciliationId
          ]
        );
      } catch (headerUpdateError) {
        const errorMessage = String(headerUpdateError?.message || '');
        if (errorMessage.includes('no such column: cashbox_posting_enabled')) {
          logger.warn('⚠️ [DB-UPDATE] عمود cashbox_posting_enabled غير متاح، سيتم الحفظ بدونه (توافق مؤقت)');
          await ipcRenderer.invoke(
            'db-run',
            `UPDATE reconciliations
             SET cashier_id = ?,
                 accountant_id = ?,
                 reconciliation_date = ?,
                 time_range_start = ?,
                 time_range_end = ?,
                 filter_notes = ?,
                 formula_profile_id = COALESCE(?, formula_profile_id),
                 formula_settings = COALESCE(?, formula_settings)
             WHERE id = ?`,
            [
              data.cashierId,
              data.accountantId,
              data.reconciliationDate,
              data.timeRangeStart,
              data.timeRangeEnd,
              data.filterNotes,
              formulaProfileId,
              formulaSettingsJson,
              data.reconciliationId
            ]
          );
        } else {
          throw headerUpdateError;
        }
      }

      await deleteExistingRecords(data.reconciliationId);
      await insertUpdatedRecords(data);

      let cashboxSyncResult = null;
      let cashboxSyncError = '';
      try {
        cashboxSyncResult = await ipcRenderer.invoke(
          'sync-reconciliation-cashbox-vouchers',
          data.reconciliationId
        );
      } catch (syncError) {
        cashboxSyncError = syncError && syncError.message ? syncError.message : String(syncError || '');
        logger.warn('⚠️ [DB-UPDATE] تعذرت مزامنة سندات الصندوق بعد تعديل التصفية:', cashboxSyncError);
      }

      logger.log('✅ [DB-UPDATE] تم تحديث البيانات في قاعدة البيانات بنجاح');
      return {
        cashboxSyncResult,
        cashboxSyncError
      };
    } catch (error) {
      logger.error('❌ [DB-UPDATE] خطأ في تحديث قاعدة البيانات:', error);
      throw new Error(`فشل في تحديث قاعدة البيانات: ${error.message}`);
    }
  }

  function handleEditError(error, operation, context = {}) {
    const mode = getMode();
    logger.error(`❌ [ERROR-${operation}] خطأ في العملية:`, {
      error: error.message,
      stack: error.stack,
      operation,
      context,
      timestamp: new Date().toISOString(),
      editMode: {
        isActive: mode.isActive,
        reconciliationId: mode.reconciliationId
      }
    });

    let userMessage = 'حدث خطأ غير متوقع';
    let title = 'خطأ في النظام';

    if (error.message.includes('Database') || error.message.includes('SQLITE')) {
      userMessage = 'خطأ في قاعدة البيانات. يرجى المحاولة مرة أخرى.';
      title = 'خطأ في قاعدة البيانات';
    } else if (error.message.includes('Network') || error.message.includes('timeout')) {
      userMessage = 'انتهت مهلة الاتصال. يرجى التحقق من الاتصال والمحاولة مرة أخرى.';
      title = 'خطأ في الاتصال';
    } else if (error.message.includes('not found') || error.message.includes('غير موجود')) {
      userMessage = 'التصفية المطلوبة غير موجودة أو تم حذفها.';
      title = 'تصفية غير موجودة';
    } else if (error.message.includes('validation') || error.message.includes('البيانات')) {
      userMessage = error.message;
      title = 'خطأ في البيانات';
    } else if (error.message.includes('permission') || error.message.includes('صلاحية')) {
      userMessage = 'ليس لديك صلاحية لتنفيذ هذه العملية.';
      title = 'خطأ في الصلاحيات';
    }

    DialogUtils.showError(userMessage, title);
    logger.error(`🚨 [USER-ERROR] ${title}: ${userMessage}`);
  }

  function validateEditModalState() {
    const modal = document.getElementById('editReconciliationModal');
    const mode = getMode();

    if (!modal) {
      return { isValid: false, message: 'نافذة التعديل غير موجودة' };
    }
    if (!mode.isActive) {
      return { isValid: false, message: 'وضع التعديل غير نشط' };
    }
    if (!mode.reconciliationId) {
      return { isValid: false, message: 'معرف التصفية مفقود' };
    }

    return { isValid: true, message: 'الحالة صحيحة' };
  }

  function logEditOperation(operation, data = {}) {
    const mode = getMode();
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      reconciliationId: mode.reconciliationId,
      user: getCurrentUser()?.name || 'غير معروف',
      data,
      success: true
    };

    logger.log(`📝 [AUDIT] ${operation}:`, logEntry);
  }

  return {
    deleteExistingRecords,
    insertUpdatedRecords,
    updateReconciliationInDatabase,
    handleEditError,
    validateEditModalState,
    logEditOperation
  };
}

module.exports = {
  createEditSessionPersistence
};
