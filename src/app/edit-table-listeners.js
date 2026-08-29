function createEditTableListeners(deps) {
  const document = deps.document;
  const updateEditTotals = deps.updateEditTotals;
  const onResetEditMode = deps.onResetEditMode;
  const formatCurrency = deps.formatCurrency;

  function initializeEditModeEventListeners() {
    const editSystemSales = document.getElementById('editSystemSales');
    if (editSystemSales) {
      editSystemSales.addEventListener('input', updateEditTotals);
      editSystemSales.addEventListener('change', updateEditTotals);
    }

    const editModal = document.getElementById('editReconciliationModal');
    if (editModal) {
      editModal.addEventListener('hidden.bs.modal', function onModalHidden() {
        onResetEditMode();
      });
    }

    initializeModalAmountListeners();
    initializeCashCalculationListeners();
  }

  function initializeModalAmountListeners() {
    const amountFields = [
      'bankReceiptAmount',
      'cashReceiptAmount',
      'postpaidSaleAmount',
      'customerReceiptEditAmount',
      'returnInvoiceAmount',
      'supplierEditAmount'
    ];

    amountFields.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener('input', function onAmountFieldInput() {
          validateAmountField(this);
        });
      }
    });
  }

  function validateAmountField(field) {
    const value = parseFloat(field.value);

    field.classList.remove('is-valid', 'is-invalid');

    if (field.value === '') {
      return;
    }

    if (isNaN(value) || value <= 0) {
      field.classList.add('is-invalid');
    } else {
      field.classList.add('is-valid');
    }
  }

  function initializeCashCalculationListeners() {
    const denominationField = document.getElementById('editDenomination');
    const quantityField = document.getElementById('editQuantity');
    const totalField = document.getElementById('editCashTotal');

    if (denominationField && quantityField && totalField) {
      const calculateTotal = () => {
        const denomination = parseFloat(denominationField.value) || 0;
        const quantity = parseInt(quantityField.value, 10) || 0;
        const total = denomination * quantity;
        totalField.value = formatCurrency(total);
      };

      denominationField.addEventListener('change', calculateTotal);
      quantityField.addEventListener('input', calculateTotal);
    }
  }

  return {
    initializeEditModeEventListeners,
    initializeModalAmountListeners,
    validateAmountField,
    initializeCashCalculationListeners
  };
}

module.exports = {
  createEditTableListeners
};
