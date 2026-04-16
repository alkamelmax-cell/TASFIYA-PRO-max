function createPrintSelectionModalHandlers(deps) {
  const doc = deps.document;
  const windowObj = deps.windowObj || globalThis;
  const logger = deps.logger || console;

  function showPrintSectionSelectionDialog() {
    logger.log('📋 [NEW-PRINT] عرض حوار اختيار الأقسام للطباعة');

    const currentPrintReconciliation = deps.getCurrentPrintReconciliation();
    if (!currentPrintReconciliation) {
      deps.getDialogUtils().showError('لا توجد بيانات تصفية للطباعة', 'خطأ في البيانات');
      return;
    }

    const reconciliation = currentPrintReconciliation.reconciliation;
    const modalHtml = `
    <div class="modal fade" id="newPrintSectionModal" tabindex="-1" aria-labelledby="newPrintSectionModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title" id="newPrintSectionModalLabel">
                        🖨️ خيارات طباعة التصفية #${reconciliation.id}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="إغلاق"></button>
                </div>
                <div class="modal-body">
                    <!-- Reconciliation Info -->
                    <div class="alert alert-info mb-4">
                        <h6 class="mb-2">📊 معلومات التصفية:</h6>
                        <div class="row">
                            <div class="col-md-6">
                                <strong>الكاشير:</strong> ${reconciliation.cashier_name} (${reconciliation.cashier_number})<br>
                                <strong>المحاسب:</strong> ${reconciliation.accountant_name}
                                ${reconciliation.time_range_start || reconciliation.time_range_end ? `<br>
                                <strong>النطاق الزمني:</strong>
                                ${reconciliation.time_range_start && reconciliation.time_range_end
            ? `من ${reconciliation.time_range_start} إلى ${reconciliation.time_range_end}`
            : reconciliation.time_range_start ? `من ${reconciliation.time_range_start}` : `إلى ${reconciliation.time_range_end}`
}
                            ` : ''}
                            </div>
                            <div class="col-md-6">
                                <strong>التاريخ:</strong> ${deps.formatDate(reconciliation.reconciliation_date)}<br>
                                <strong>إجمالي المقبوضات:</strong> ${deps.formatCurrency(reconciliation.total_receipts)}
                                ${reconciliation.filter_notes ? `<br>
                                <strong>الملاحظات:</strong> ${reconciliation.filter_notes.length > 50
            ? reconciliation.filter_notes.substring(0, 50) + '...'
            : reconciliation.filter_notes}
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-md-6">
                            <h6 class="mb-3">📊 الأقسام المراد طباعتها:</h6>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printBankReceipts" checked>
                                <label class="form-check-label" for="printBankReceipts">
                                    💳 المقبوضات البنكية (${currentPrintReconciliation.bankReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printCashReceipts" checked>
                                <label class="form-check-label" for="printCashReceipts">
                                    💰 المقبوضات النقدية (${currentPrintReconciliation.cashReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printPostpaidSales" checked>
                                <label class="form-check-label" for="printPostpaidSales">
                                    📱 المبيعات الآجلة (${currentPrintReconciliation.postpaidSales.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printCustomerReceipts" checked>
                                <label class="form-check-label" for="printCustomerReceipts">
                                    👥 مقبوضات العملاء (${currentPrintReconciliation.customerReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printReturnInvoices" checked>
                                <label class="form-check-label" for="printReturnInvoices">
                                    ↩️ فواتير المرتجع (${currentPrintReconciliation.returnInvoices.length})
                                </label>
                            </div>
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="checkbox" id="printSuppliers" checked>
                                <label class="form-check-label" for="printSuppliers">
                                    🏪 الموردين (${currentPrintReconciliation.suppliers.length})
                                </label>
                            </div>
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="checkbox" id="printSummary" checked>
                                <label class="form-check-label" for="printSummary">
                                    📈 ملخص التصفية
                                </label>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h6 class="mb-3">⚙️ خيارات الطباعة:</h6>
                            <div class="mb-3">
                                <label for="printPageSize" class="form-label">حجم الورق:</label>
                                <select class="form-select" id="printPageSize">
                                    <option value="A4" selected>A4</option>
                                    <option value="A3">A3</option>
                                    <option value="Letter">Letter</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label for="printOrientation" class="form-label">اتجاه الورق:</label>
                                <select class="form-select" id="printOrientation">
                                    <option value="portrait" selected>عمودي</option>
                                    <option value="landscape">أفقي</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label for="printFontSize" class="form-label">حجم الخط:</label>
                                <select class="form-select" id="printFontSize">
                                    <option value="small">صغير</option>
                                    <option value="normal" selected>عادي</option>
                                    <option value="large">كبير</option>
                                </select>
                            </div>
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="checkbox" id="printColors" checked>
                                <label class="form-check-label" for="printColors">
                                    🎨 طباعة ملونة
                                </label>
                            </div>
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
                    <button type="button" class="btn btn-info" onclick="showPrintPreview()">👁️ معاينة</button>
                    <button type="button" class="btn btn-primary" onclick="proceedToPrint()">🖨️ طباعة</button>
                </div>
            </div>
        </div>
    </div>`;

    const existingModal = doc.getElementById('newPrintSectionModal');
    if (existingModal) {
      existingModal.remove();
    }

    doc.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new (deps.getBootstrap().Modal)(doc.getElementById('newPrintSectionModal'));
    modal.show();
  }

  function selectAllPrintSections() {
    const checkboxes = doc.querySelectorAll('#newPrintSectionModal input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = true;
    });
  }

  function deselectAllPrintSections() {
    const checkboxes = doc.querySelectorAll('#newPrintSectionModal input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
  }

  function getSelectedPrintOptions() {
    return {
      sections: {
        bankReceipts: doc.getElementById('printBankReceipts').checked,
        cashReceipts: doc.getElementById('printCashReceipts').checked,
        postpaidSales: doc.getElementById('printPostpaidSales').checked,
        customerReceipts: doc.getElementById('printCustomerReceipts').checked,
        returnInvoices: doc.getElementById('printReturnInvoices').checked,
        suppliers: doc.getElementById('printSuppliers').checked,
        summary: doc.getElementById('printSummary').checked
      },
      options: {
        pageSize: doc.getElementById('printPageSize').value,
        orientation: doc.getElementById('printOrientation').value,
        fontSize: doc.getElementById('printFontSize').value,
        colors: doc.getElementById('printColors').checked
      }
    };
  }

  function showPrintPreview() {
    logger.log('👁️ [NEW-PRINT] عرض معاينة الطباعة');

    const printOptions = getSelectedPrintOptions();
    const hasSelectedSections = Object.values(printOptions.sections).some((selected) => selected);
    if (!hasSelectedSections) {
      deps.getDialogUtils().showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
      return;
    }

    const modal = deps.getBootstrap().Modal.getInstance(doc.getElementById('newPrintSectionModal'));
    if (modal) {
      modal.hide();
    }

    deps.onGeneratePrintPreview(printOptions);
  }

  function proceedToPrint() {
    logger.log('🖨️ [NEW-PRINT] المتابعة للطباعة المباشرة');

    const printOptions = getSelectedPrintOptions();
    const hasSelectedSections = Object.values(printOptions.sections).some((selected) => selected);
    if (!hasSelectedSections) {
      deps.getDialogUtils().showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
      return;
    }

    const modal = deps.getBootstrap().Modal.getInstance(doc.getElementById('newPrintSectionModal'));
    if (modal) {
      modal.hide();
    }

    deps.onGenerateAndPrint(printOptions);
  }

  // Keep handlers available for inline modal buttons.
  windowObj.selectAllPrintSections = selectAllPrintSections;
  windowObj.deselectAllPrintSections = deselectAllPrintSections;
  windowObj.showPrintPreview = showPrintPreview;
  windowObj.proceedToPrint = proceedToPrint;

  return {
    showPrintSectionSelectionDialog,
    selectAllPrintSections,
    deselectAllPrintSections,
    getSelectedPrintOptions,
    showPrintPreview,
    proceedToPrint
  };
}

module.exports = {
  createPrintSelectionModalHandlers
};
