const { mapDbErrorMessage } = require('./db-error-messages');

function createThermalPrintSections(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const windowObj = deps.windowObj || {};
  const getBootstrap = deps.getBootstrap;
  const getDialogUtils = deps.getDialogUtils;
  const logger = deps.logger || console;
  const delayMs = deps.postActionDelayMs == null ? 500 : deps.postActionDelayMs;

  function showThermalPrintSectionDialog(reconciliationData) {
    logger.log('🔥 [THERMAL] عرض حوار اختيار أقسام الطباعة...');

    const isPreview = windowObj.thermalPreviewMode === true;
    const title = isPreview ? '👁️ اختيار أقسام المعاينة الحرارية' : '🖨️ اختيار أقسام الطباعة الحرارية';
    const buttonLabel = isPreview ? '👁️ معاينة' : '🖨️ طباعة';
    const buttonClass = isPreview ? 'btn-info' : 'btn-warning';

    const modalHtml = `
    <div class="modal fade" id="thermalPrintSectionModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-warning text-dark">
                    <h5 class="modal-title">${title}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-info mb-3">
                        <small>
                            <strong>التصفية #${reconciliationData.reconciliation.id}</strong><br>
                            الكاشير: ${reconciliationData.reconciliation.cashier_name}<br>
                            التاريخ: ${reconciliationData.reconciliation.reconciliation_date}
                        </small>
                    </div>
                    <p class="mb-3">اختر الأقسام المراد ${isPreview ? 'معاينتها' : 'طباعتها'}:</p>
                    <div class="card">
                        <div class="card-body">
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalBankReceipts" checked>
                                <label class="form-check-label" for="thermalBankReceipts">
                                    💳 المقبوضات البنكية (${reconciliationData.bankReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalCashReceipts" checked>
                                <label class="form-check-label" for="thermalCashReceipts">
                                    💰 المقبوضات النقدية (${reconciliationData.cashReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalPostpaidSales" checked>
                                <label class="form-check-label" for="thermalPostpaidSales">
                                    📱 المبيعات الآجلة (${reconciliationData.postpaidSales.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalCustomerReceipts" checked>
                                <label class="form-check-label" for="thermalCustomerReceipts">
                                    👥 مقبوضات العملاء (${reconciliationData.customerReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalReturnInvoices" checked>
                                <label class="form-check-label" for="thermalReturnInvoices">
                                    ↩️ فواتير المرتجع (${reconciliationData.returnInvoices.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalSuppliers" checked>
                                <label class="form-check-label" for="thermalSuppliers">
                                    🏪 الموردين (${reconciliationData.suppliers.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalSummary" checked>
                                <label class="form-check-label" for="thermalSummary">
                                    📈 ملخص التصفية
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="selectAllThermalSections()">تحديد الكل</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="deselectAllThermalSections()">إلغاء الكل</button>
                    <button type="button" class="btn ${buttonClass}" onclick="proceedWithThermalPrint()">${buttonLabel}</button>
                </div>
            </div>
        </div>
    </div>`;

    const existingModal = doc.getElementById('thermalPrintSectionModal');
    if (existingModal) {
      existingModal.remove();
    }

    doc.body.insertAdjacentHTML('beforeend', modalHtml);
    const bootstrap = getBootstrap();
    const modal = new bootstrap.Modal(doc.getElementById('thermalPrintSectionModal'));
    modal.show();
  }

  function selectAllThermalSections() {
    const checkboxes = doc.querySelectorAll('.thermal-section-checkbox');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = true;
    });
  }

  function deselectAllThermalSections() {
    const checkboxes = doc.querySelectorAll('.thermal-section-checkbox');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
  }

  function getSelectedThermalSections() {
    return {
      bankReceipts: Boolean(doc.getElementById('thermalBankReceipts')?.checked),
      cashReceipts: Boolean(doc.getElementById('thermalCashReceipts')?.checked),
      postpaidSales: Boolean(doc.getElementById('thermalPostpaidSales')?.checked),
      customerReceipts: Boolean(doc.getElementById('thermalCustomerReceipts')?.checked),
      returnInvoices: Boolean(doc.getElementById('thermalReturnInvoices')?.checked),
      suppliers: Boolean(doc.getElementById('thermalSuppliers')?.checked),
      summary: Boolean(doc.getElementById('thermalSummary')?.checked)
    };
  }

  async function proceedWithThermalPrint() {
    logger.log('🔥 [THERMAL] متابعة الطباعة مع الأقسام المختارة');

    try {
      const dialogUtils = getDialogUtils();
      const bootstrap = getBootstrap();
      const isPreview = windowObj.thermalPreviewMode === true;
      const reconciliationData = windowObj.currentThermalReconciliationData;
      const selectedSections = getSelectedThermalSections();

      const hasSections = Object.values(selectedSections).some((value) => value === true);
      if (!hasSections) {
        dialogUtils.showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
        return;
      }

      const modal = bootstrap.Modal.getInstance(doc.getElementById('thermalPrintSectionModal'));
      if (modal) {
        modal.hide();
      }

      const filteredData = {
        reconciliation: reconciliationData.reconciliation,
        bankReceipts: reconciliationData.bankReceipts,
        cashReceipts: reconciliationData.cashReceipts,
        postpaidSales: reconciliationData.postpaidSales,
        customerReceipts: reconciliationData.customerReceipts,
        returnInvoices: reconciliationData.returnInvoices,
        suppliers: reconciliationData.suppliers,
        selectedSections,
        companySettings: reconciliationData.companySettings || {}
      };

      const action = isPreview ? 'المعاينة' : 'الطباعة';
      dialogUtils.showLoading(`جاري إرسال البيانات ل${action}...`);

      const endpoint = isPreview ? 'thermal-printer-preview' : 'thermal-printer-print';
      const result = await ipc.invoke(endpoint, filteredData);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      dialogUtils.close();

      if (result.success) {
        const message = isPreview ? '✅ تم فتح المعاينة الحرارية بنجاح' : '✅ تم إرسال الطباعة الحرارية بنجاح';
        dialogUtils.showSuccessToast(message);
        logger.log(`✅ [THERMAL] ${message}`);
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: `تعذر إتمام ${action} الحرارية.`
        });
        dialogUtils.showError(`خطأ في ${action}: ${friendly}`, 'خطأ في النظام');
      }

      windowObj.currentThermalReconciliationData = null;
      windowObj.thermalPreviewMode = null;
    } catch (error) {
      const dialogUtils = getDialogUtils();
      dialogUtils.close();
      logger.error('❌ [THERMAL] خطأ في المتابعة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر إتمام عملية الطباعة الحرارية.'
      });
      dialogUtils.showError(`خطأ: ${friendly}`, 'خطأ في النظام');
    }
  }

  return {
    showThermalPrintSectionDialog,
    selectAllThermalSections,
    deselectAllThermalSections,
    getSelectedThermalSections,
    proceedWithThermalPrint
  };
}

module.exports = {
  createThermalPrintSections
};
