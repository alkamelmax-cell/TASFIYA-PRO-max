const { createReconciliationDataEntryShared } = require('./reconciliation-data-entry-shared');
const { createReconciliationDataEntryBankCashHandlers } = require('./reconciliation-data-entry-bank-cash');
const { createReconciliationDataEntrySalesHandlers } = require('./reconciliation-data-entry-sales');
const { createReconciliationDataEntryVendorsHandlers } = require('./reconciliation-data-entry-vendors');

function createReconciliationDataEntryHandlers(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const DialogUtils = deps.getDialogUtils();
  const formNavigation = deps.formNavigation;
  const formatCurrency = deps.formatCurrency;
  const getCurrentReconciliation = deps.getCurrentReconciliation;
  const getBankReceipts = deps.getBankReceipts;
  const setBankReceipts = deps.setBankReceipts;
  const getCashReceipts = deps.getCashReceipts;
  const setCashReceipts = deps.setCashReceipts;
  const getPostpaidSales = deps.getPostpaidSales;
  const setPostpaidSales = deps.setPostpaidSales;
  const getCustomerReceipts = deps.getCustomerReceipts;
  const setCustomerReceipts = deps.setCustomerReceipts;
  const getReturnInvoices = deps.getReturnInvoices;
  const setReturnInvoices = deps.setReturnInvoices;
  const getSuppliers = deps.getSuppliers;
  const setSuppliers = deps.setSuppliers;
  const updateSummary = deps.updateSummary;
  const windowObj = deps.windowObj || globalThis;
  const logger = deps.logger || console;

  const shared = createReconciliationDataEntryShared({
    getCurrentReconciliation,
    DialogUtils,
    ipcRenderer,
    logger
  });

  const bankCashHandlers = createReconciliationDataEntryBankCashHandlers({
    document,
    ipcRenderer,
    DialogUtils,
    formNavigation,
    formatCurrency,
    updateSummary,
    logger,
    ensureCurrentReconciliation: shared.ensureCurrentReconciliation,
    getArraySafe: shared.getArraySafe,
    setArray: shared.setArray,
    getBankReceipts,
    setBankReceipts,
    getCashReceipts,
    setCashReceipts
  });

  const salesHandlers = createReconciliationDataEntrySalesHandlers({
    document,
    ipcRenderer,
    DialogUtils,
    formNavigation,
    formatCurrency,
    updateSummary,
    logger,
    ensureCurrentReconciliation: shared.ensureCurrentReconciliation,
    getArraySafe: shared.getArraySafe,
    setArray: shared.setArray,
    isExistingCustomer: shared.isExistingCustomer,
    isExistingCustomerInBranch: shared.isExistingCustomerInBranch,
    resolveReconciliationBranchId: shared.resolveReconciliationBranchId,
    getPostpaidSales,
    setPostpaidSales,
    getCustomerReceipts,
    setCustomerReceipts
  });

  const vendorsHandlers = createReconciliationDataEntryVendorsHandlers({
    document,
    ipcRenderer,
    DialogUtils,
    formNavigation,
    formatCurrency,
    logger,
    ensureCurrentReconciliation: shared.ensureCurrentReconciliation,
    getArraySafe: shared.getArraySafe,
    setArray: shared.setArray,
    isExistingSupplier: shared.isExistingSupplier,
    isExistingSupplierInBranch: shared.isExistingSupplierInBranch,
    resolveReconciliationBranchId: shared.resolveReconciliationBranchId,
    getReturnInvoices,
    setReturnInvoices,
    getSuppliers,
    setSuppliers,
    updateSummary
  });

  if (windowObj) {
    windowObj.editBankReceipt = bankCashHandlers.editBankReceipt;
    windowObj.removeBankReceipt = bankCashHandlers.removeBankReceipt;
    windowObj.cancelBankReceiptEdit = bankCashHandlers.cancelBankReceiptEdit;
    windowObj.editCashReceipt = bankCashHandlers.editCashReceipt;
    windowObj.removeCashReceipt = bankCashHandlers.removeCashReceipt;
    windowObj.cancelCashReceiptEdit = bankCashHandlers.cancelCashReceiptEdit;
    windowObj.editPostpaidSale = salesHandlers.editPostpaidSale;
    windowObj.removePostpaidSale = salesHandlers.removePostpaidSale;
    windowObj.cancelPostpaidSaleEdit = salesHandlers.cancelPostpaidSaleEdit;
    windowObj.editCustomerReceipt = salesHandlers.editCustomerReceipt;
    windowObj.removeCustomerReceipt = salesHandlers.removeCustomerReceipt;
    windowObj.cancelCustomerReceiptEdit = salesHandlers.cancelCustomerReceiptEdit;
    windowObj.editReturnInvoice = vendorsHandlers.editReturnInvoice;
    windowObj.removeReturnInvoice = vendorsHandlers.removeReturnInvoice;
    windowObj.cancelReturnInvoiceEdit = vendorsHandlers.cancelReturnInvoiceEdit;
    windowObj.editSupplier = vendorsHandlers.editSupplier;
    windowObj.removeSupplier = vendorsHandlers.removeSupplier;
    windowObj.cancelSupplierEdit = vendorsHandlers.cancelSupplierEdit;
  }

  return {
    ...bankCashHandlers,
    isExistingCustomer: shared.isExistingCustomer,
    isExistingCustomerInBranch: shared.isExistingCustomerInBranch,
    isExistingSupplier: shared.isExistingSupplier,
    isExistingSupplierInBranch: shared.isExistingSupplierInBranch,
    ...salesHandlers,
    ...vendorsHandlers
  };
}

module.exports = {
  createReconciliationDataEntryHandlers
};
