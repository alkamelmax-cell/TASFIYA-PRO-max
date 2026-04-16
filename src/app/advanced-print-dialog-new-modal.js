function createAdvancedPrintNewDialogHandlers(context) {
  const document = context.document;
  const windowObj = context.windowObj || globalThis;
  const getBootstrapModal = context.getBootstrapModal;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const logger = context.logger || console;

  function showPrintSectionDialogForNewReconciliation() {
    logger.log('📋 [PRINT] عرض حوار اختيار الأقسام للتصفية الجديدة...');

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
        <div class="modal fade" id="newReconciliationPrintSectionModal" tabindex="-1" aria-labelledby="newReconciliationPrintSectionModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="newReconciliationPrintSectionModalLabel">🖨️ خيارات الطباعة</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="إغلاق"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="mb-3">📊 الأقسام المراد طباعتها:</h6>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="newPrintBankReceipts" checked><label class="form-check-label" for="newPrintBankReceipts">💳 المقبوضات البنكية</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="newPrintCashReceipts" checked><label class="form-check-label" for="newPrintCashReceipts">💰 المقبوضات النقدية</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="newPrintPostpaidSales" checked><label class="form-check-label" for="newPrintPostpaidSales">📱 المبيعات الآجلة</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="newPrintCustomerReceipts" checked><label class="form-check-label" for="newPrintCustomerReceipts">👥 مقبوضات العملاء</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="newPrintReturnInvoices" checked><label class="form-check-label" for="newPrintReturnInvoices">↩️ فواتير المرتجع</label></div>
                                <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="newPrintSuppliers" checked><label class="form-check-label" for="newPrintSuppliers">🏪 الموردين</label></div>
                                <div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="newPrintSummary" checked><label class="form-check-label" for="newPrintSummary">📈 ملخص التصفية</label></div>
                            </div>
                            <div class="col-md-6">
                                <h6 class="mb-3">⚙️ خيارات إضافية:</h6>
                                <div class="mb-3"><label for="newPageSize" class="form-label">حجم الورق:</label><select class="form-select" id="newPageSize"><option value="A4" selected>A4</option><option value="A3">A3</option><option value="Letter">Letter</option></select></div>
                                <div class="mb-3"><label for="newOrientation" class="form-label">اتجاه الورق:</label><select class="form-select" id="newOrientation"><option value="portrait" selected>عمودي</option><option value="landscape">أفقي</option></select></div>
                                <div class="mb-3"><label for="newFontSize" class="form-label">حجم الخط:</label><select class="form-select" id="newFontSize"><option value="small">صغير</option><option value="normal" selected>عادي</option><option value="large">كبير</option></select></div>
                            </div>
                        </div>
                        <div class="row mt-3">
                            <div class="col-12">
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-outline-primary btn-sm" onclick="selectAllNewPrintSections()">تحديد الكل</button>
                                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="deselectAllNewPrintSections()">إلغاء تحديد الكل</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                        <button type="button" class="btn btn-primary" onclick="confirmNewPrintSections()">🖨️ طباعة</button>
                    </div>
                </div>
            </div>
        </div>`;

      const existingModal = document.getElementById('newReconciliationPrintSectionModal');
      if (existingModal) {
        existingModal.remove();
      }

      document.body.insertAdjacentHTML('beforeend', modalHtml);

      const modalElement = document.getElementById('newReconciliationPrintSectionModal');
      const modal = new (getBootstrapModal())(modalElement);
      modal.show();

      windowObj.newPrintSectionResolve = resolveOnce;
      windowObj.selectAllNewPrintSections = selectAllNewPrintSections;
      windowObj.deselectAllNewPrintSections = deselectAllNewPrintSections;
      windowObj.confirmNewPrintSections = confirmNewPrintSections;

      modalElement.addEventListener('hidden.bs.modal', () => {
        modalElement.remove();
        delete windowObj.newPrintSectionResolve;
        resolveOnce(null);
      });
    });
  }

  function selectAllNewPrintSections() {
    const checkboxes = document.querySelectorAll('#newReconciliationPrintSectionModal input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = true;
    });
  }

  function deselectAllNewPrintSections() {
    const checkboxes = document.querySelectorAll('#newReconciliationPrintSectionModal input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
  }

  function confirmNewPrintSections() {
    logger.log('✅ [PRINT] تأكيد اختيار الأقسام للتصفية الجديدة...');

    const sections = {
      bankReceipts: !!document.getElementById('newPrintBankReceipts')?.checked,
      cashReceipts: !!document.getElementById('newPrintCashReceipts')?.checked,
      postpaidSales: !!document.getElementById('newPrintPostpaidSales')?.checked,
      customerReceipts: !!document.getElementById('newPrintCustomerReceipts')?.checked,
      returnInvoices: !!document.getElementById('newPrintReturnInvoices')?.checked,
      suppliers: !!document.getElementById('newPrintSuppliers')?.checked,
      summary: !!document.getElementById('newPrintSummary')?.checked
    };

    const options = {
      sections,
      pageSize: document.getElementById('newPageSize')?.value || 'A4',
      orientation: document.getElementById('newOrientation')?.value || 'portrait',
      fontSize: document.getElementById('newFontSize')?.value || 'normal'
    };

    logger.log('📊 [PRINT] الأقسام المحددة:', sections);
    logger.log('⚙️ [PRINT] الخيارات الإضافية:', options);

    const hasSelectedSections = Object.values(sections).some((selected) => selected);
    if (!hasSelectedSections) {
      getDialogUtils().showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
      return;
    }

    const modalElement = document.getElementById('newReconciliationPrintSectionModal');
    const modal = modalElement ? getBootstrapModal().getInstance(modalElement) : null;
    if (modal) {
      modal.hide();
    }

    if (typeof windowObj.newPrintSectionResolve === 'function') {
      windowObj.newPrintSectionResolve(options);
    }
  }

  return {
    showPrintSectionDialogForNewReconciliation,
    selectAllNewPrintSections,
    deselectAllNewPrintSections,
    confirmNewPrintSections
  };
}

module.exports = {
  createAdvancedPrintNewDialogHandlers
};
