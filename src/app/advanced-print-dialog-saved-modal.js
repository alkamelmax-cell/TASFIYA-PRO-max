const { mapDbErrorMessage } = require('./db-error-messages');

function createAdvancedPrintSavedDialogHandlers(context) {
  const document = context.document;
  const windowObj = context.windowObj || globalThis;
  const getBootstrapModal = context.getBootstrapModal;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const printReconciliationAdvanced = context.printReconciliationAdvanced;
  const logger = context.logger || console;

  function showPrintSectionDialog() {
    logger.log('📋 [PRINT] عرض حوار اختيار الأقسام للطباعة...');

    return new Promise((resolve) => {
      let isResolved = false;
      const resolveOnce = (value) => {
        if (isResolved) {
          return;
        }
        isResolved = true;
        resolve(value);
      };

      const modalHtml = `
        <div class="modal fade" id="printSectionModal" tabindex="-1" aria-labelledby="printSectionModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="printSectionModalLabel">🖨️ خيارات الطباعة</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="إغلاق"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="mb-3">📊 الأقسام المراد طباعتها:</h6>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="printBankReceipts" checked><label class="form-check-label" for="printBankReceipts">💳 المقبوضات البنكية</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="printCashReceipts" checked><label class="form-check-label" for="printCashReceipts">💰 المقبوضات النقدية</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="printPostpaidSales" checked><label class="form-check-label" for="printPostpaidSales">📱 المبيعات الآجلة</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="printCustomerReceipts" checked><label class="form-check-label" for="printCustomerReceipts">👥 مقبوضات العملاء</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="printReturnInvoices" checked><label class="form-check-label" for="printReturnInvoices">↩️ فواتير المرتجع</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="printSuppliers" checked><label class="form-check-label" for="printSuppliers">🏪 الموردين</label></div>
                                <div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="printSummary" checked><label class="form-check-label" for="printSummary">📈 ملخص التصفية</label></div>
                            </div>
                            <div class="col-md-6">
                                <h6 class="mb-3">⚙️ خيارات إضافية:</h6>
                                <div class="mb-3"><label for="pageSize" class="form-label">حجم الورق:</label><select class="form-select" id="pageSize"><option value="A4" selected>A4</option><option value="A3">A3</option><option value="Letter">Letter</option></select></div>
                                <div class="mb-3"><label for="orientation" class="form-label">اتجاه الورق:</label><select class="form-select" id="orientation"><option value="portrait" selected>عمودي</option><option value="landscape">أفقي</option></select></div>
                                <div class="mb-3"><label for="fontSize" class="form-label">حجم الخط:</label><select class="form-select" id="fontSize"><option value="small">صغير</option><option value="normal" selected>عادي</option><option value="large">كبير</option></select></div>
                            </div>
                        </div>
                        <div class="row mt-3">
                            <div class="col-12">
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-outline-primary btn-sm" onclick="selectAllPrintSections()">تحديد الكل</button>
                                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="deselectAllPrintSections()">إلغاء تحديد الكل</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                        <button type="button" class="btn btn-primary" onclick="confirmPrintSections()">🖨️ طباعة</button>
                    </div>
                </div>
            </div>
        </div>`;

      const existingModal = document.getElementById('printSectionModal');
      if (existingModal) {
        existingModal.remove();
      }

      document.body.insertAdjacentHTML('beforeend', modalHtml);

      const modalElement = document.getElementById('printSectionModal');
      const modal = new (getBootstrapModal())(modalElement);
      modal.show();

      windowObj.printSectionResolve = resolveOnce;
      windowObj.selectAllPrintSections = selectAllPrintSections;
      windowObj.deselectAllPrintSections = deselectAllPrintSections;
      windowObj.confirmPrintSections = confirmPrintSections;

      modalElement.addEventListener('hidden.bs.modal', () => {
        modalElement.remove();
        delete windowObj.printSectionResolve;
        resolveOnce(null);
      });
    });
  }

  function selectAllPrintSections() {
    const checkboxes = document.querySelectorAll('#printSectionModal input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = true;
    });
  }

  function deselectAllPrintSections() {
    const checkboxes = document.querySelectorAll('#printSectionModal input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
  }

  function confirmPrintSections() {
    logger.log('✅ [PRINT] تأكيد اختيار الأقسام للطباعة...');

    const sections = {
      bankReceipts: !!document.getElementById('printBankReceipts')?.checked,
      cashReceipts: !!document.getElementById('printCashReceipts')?.checked,
      postpaidSales: !!document.getElementById('printPostpaidSales')?.checked,
      customerReceipts: !!document.getElementById('printCustomerReceipts')?.checked,
      returnInvoices: !!document.getElementById('printReturnInvoices')?.checked,
      suppliers: !!document.getElementById('printSuppliers')?.checked,
      summary: !!document.getElementById('printSummary')?.checked
    };

    const options = {
      sections,
      pageSize: document.getElementById('pageSize')?.value || 'A4',
      orientation: document.getElementById('orientation')?.value || 'portrait',
      fontSize: document.getElementById('fontSize')?.value || 'normal'
    };

    logger.log('📊 [PRINT] الأقسام المحددة:', sections);
    logger.log('⚙️ [PRINT] الخيارات الإضافية:', options);

    const hasSelectedSections = Object.values(sections).some((selected) => selected);
    if (!hasSelectedSections) {
      getDialogUtils().showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
      return;
    }

    const modalElement = document.getElementById('printSectionModal');
    const modal = modalElement ? getBootstrapModal().getInstance(modalElement) : null;
    if (modal) {
      modal.hide();
    }

    if (typeof windowObj.printSectionResolve === 'function') {
      windowObj.printSectionResolve(options);
    }
  }

  async function printReconciliationWithOptions(reconciliationId) {
    logger.log('🖨️ [PRINT] بدء الطباعة مع خيارات للتصفية - معرف:', reconciliationId);

    if (typeof printReconciliationAdvanced !== 'function') {
      getDialogUtils().showError('دالة الطباعة المتقدمة غير متاحة', 'خطأ في النظام');
      return false;
    }

    try {
      const selectedSections = await showPrintSectionDialog(reconciliationId);

      if (selectedSections) {
        return await printReconciliationAdvanced(reconciliationId, { sections: selectedSections });
      }

      logger.log('⚠️ [PRINT] تم إلغاء الطباعة من قبل المستخدم');
      return false;
    } catch (error) {
      logger.error('❌ [PRINT] خطأ في الطباعة مع الخيارات:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ عملية الطباعة.'
      });
      getDialogUtils().showError(`خطأ في الطباعة: ${friendly}`, 'خطأ في النظام');
      return false;
    }
  }

  return {
    showPrintSectionDialog,
    selectAllPrintSections,
    deselectAllPrintSections,
    confirmPrintSections,
    printReconciliationWithOptions
  };
}

module.exports = {
  createAdvancedPrintSavedDialogHandlers
};
