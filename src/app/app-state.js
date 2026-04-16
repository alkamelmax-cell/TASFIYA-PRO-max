function createAppState() {
  const state = {
    currentUser: null,
    currentReconciliation: null,
    bankReceipts: [],
    cashReceipts: [],
    postpaidSales: [],
    customerReceipts: [],
    returnInvoices: [],
    suppliers: [],
    currentPrintReconciliation: null,
    availablePrinters: [],
    currentPrintData: null
  };

  const getCurrentUser = () => state.currentUser;
  const setCurrentUser = (value) => {
    state.currentUser = value;
  };

  const getCurrentReconciliation = () => state.currentReconciliation;
  const setCurrentReconciliation = (value) => {
    state.currentReconciliation = value;
  };

  const getBankReceipts = () => state.bankReceipts;
  const setBankReceipts = (value) => {
    state.bankReceipts = value;
  };

  const getCashReceipts = () => state.cashReceipts;
  const setCashReceipts = (value) => {
    state.cashReceipts = value;
  };

  const getPostpaidSales = () => state.postpaidSales;
  const setPostpaidSales = (value) => {
    state.postpaidSales = value;
  };

  const getCustomerReceipts = () => state.customerReceipts;
  const setCustomerReceipts = (value) => {
    state.customerReceipts = value;
  };

  const getReturnInvoices = () => state.returnInvoices;
  const setReturnInvoices = (value) => {
    state.returnInvoices = value;
  };

  const getSuppliers = () => state.suppliers;
  const setSuppliers = (value) => {
    state.suppliers = value;
  };

  const getCurrentPrintReconciliation = () => state.currentPrintReconciliation;
  const setCurrentPrintReconciliation = (value) => {
    state.currentPrintReconciliation = value;
  };

  const getAvailablePrinters = () => state.availablePrinters;
  const setAvailablePrinters = (value) => {
    state.availablePrinters = value;
  };

  const getCurrentPrintData = () => state.currentPrintData;
  const setCurrentPrintData = (value) => {
    state.currentPrintData = value;
  };

  const getDataCounts = () => ({
    bankReceipts: state.bankReceipts.length,
    cashReceipts: state.cashReceipts.length,
    postpaidSales: state.postpaidSales.length,
    customerReceipts: state.customerReceipts.length,
    returnInvoices: state.returnInvoices.length,
    suppliers: state.suppliers.length
  });

  return {
    getCurrentUser,
    setCurrentUser,
    getCurrentReconciliation,
    setCurrentReconciliation,
    getBankReceipts,
    setBankReceipts,
    getCashReceipts,
    setCashReceipts,
    getPostpaidSales,
    setPostpaidSales,
    getCustomerReceipts,
    setCustomerReceipts,
    getReturnInvoices,
    setReturnInvoices,
    getSuppliers,
    setSuppliers,
    getCurrentPrintReconciliation,
    setCurrentPrintReconciliation,
    getAvailablePrinters,
    setAvailablePrinters,
    getCurrentPrintData,
    setCurrentPrintData,
    getDataCounts
  };
}

module.exports = {
  createAppState
};
