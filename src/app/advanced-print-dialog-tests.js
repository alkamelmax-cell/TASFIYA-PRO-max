function createAdvancedPrintDialogTestHandlers(context) {
  const document = context.document;
  const prepareReconciliationData = context.prepareReconciliationData;
  const getCurrentReconciliation = context.getCurrentReconciliation || (() => null);
  const getCurrentPrintData = context.getCurrentPrintData || (() => null);
  const setCurrentPrintData = context.setCurrentPrintData || (() => {});
  const getAvailablePrinters = context.getAvailablePrinters || (() => []);
  const initializePrintSystem = context.initializePrintSystem;
  const handlePrintReport = context.handlePrintReport;
  const handleQuickPrint = context.handleQuickPrint;
  const preparePrintData = context.preparePrintData;
  const logger = context.logger || console;
  const showPrintSectionDialogForNewReconciliation = context.showPrintSectionDialogForNewReconciliation;
  const selectAllNewPrintSections = context.selectAllNewPrintSections;
  const deselectAllNewPrintSections = context.deselectAllNewPrintSections;
  const confirmNewPrintSections = context.confirmNewPrintSections;

  async function testPrintDataStructure() {
    logger.log('🧪 [TEST] Testing print data structure compatibility...');

    if (typeof prepareReconciliationData !== 'function') {
      logger.log('❌ [TEST] prepareReconciliationData is unavailable');
      return false;
    }

    if (!getCurrentReconciliation()) {
      logger.log('❌ [TEST] No current reconciliation to test');
      return false;
    }

    try {
      const reconciliationData = await prepareReconciliationData();
      logger.log('📊 [TEST] Print data structure:', {
        hasReconciliation: !!reconciliationData.reconciliation,
        reconciliationId: reconciliationData.reconciliation?.id,
        cashierName: reconciliationData.reconciliation?.cashier_name,
        hasBankReceipts: Array.isArray(reconciliationData.bankReceipts),
        hasCashReceipts: Array.isArray(reconciliationData.cashReceipts),
        hasPostpaidSales: Array.isArray(reconciliationData.postpaidSales),
        hasCustomerReceipts: Array.isArray(reconciliationData.customerReceipts),
        hasReturnInvoices: Array.isArray(reconciliationData.returnInvoices),
        hasSuppliers: Array.isArray(reconciliationData.suppliers),
        hasSummary: !!reconciliationData.summary
      });

      const isValid = reconciliationData.reconciliation &&
        reconciliationData.reconciliation.id &&
        reconciliationData.reconciliation.cashier_name &&
        reconciliationData.reconciliation.accountant_name;

      if (isValid) {
        logger.log('✅ [TEST] Print data structure is valid and compatible');
        return true;
      }

      logger.log('❌ [TEST] Print data structure is missing required fields');
      return false;
    } catch (error) {
      logger.error('❌ [TEST] Error testing print data structure:', error);
      return false;
    }
  }

  async function testPrintDialog() {
    logger.log('🧪 [TEST] Testing print dialog functionality...');

    if (typeof prepareReconciliationData !== 'function') {
      logger.log('❌ [TEST] prepareReconciliationData is unavailable');
      return false;
    }

    if (!getCurrentReconciliation()) {
      logger.log('❌ [TEST] No current reconciliation to test');
      return false;
    }

    try {
      const reconciliationData = await prepareReconciliationData();
      setCurrentPrintData(reconciliationData);

      const printers = getAvailablePrinters();
      if (printers.length === 0 && typeof initializePrintSystem === 'function') {
        await initializePrintSystem();
      }

      logger.log('✅ [TEST] Print dialog test completed successfully');
      logger.log('📊 [TEST] Print system status:', {
        hasPrintData: !!getCurrentPrintData(),
        printersAvailable: getAvailablePrinters().length,
        printModalExists: !!document.getElementById('printOptionsModal')
      });

      return true;
    } catch (error) {
      logger.error('❌ [TEST] Error testing print dialog:', error);
      return false;
    }
  }

  async function testNewReconciliationPrintSystem() {
    logger.log('🧪 [TEST] Testing complete New Reconciliation print system...');

    if (!getCurrentReconciliation()) {
      logger.log('❌ [TEST] No current reconciliation to test');
      return false;
    }

    try {
      logger.log('🔍 [TEST] Testing data structure...');
      const dataTest = await testPrintDataStructure();

      logger.log('🔍 [TEST] Testing section selection functions...');
      const sectionFunctions = {
        showPrintSectionDialogForNewReconciliation: typeof showPrintSectionDialogForNewReconciliation === 'function',
        selectAllNewPrintSections: typeof selectAllNewPrintSections === 'function',
        deselectAllNewPrintSections: typeof deselectAllNewPrintSections === 'function',
        confirmNewPrintSections: typeof confirmNewPrintSections === 'function'
      };

      logger.log('🔍 [TEST] Testing print functions...');
      const printFunctions = {
        handlePrintReport: typeof handlePrintReport === 'function',
        handleQuickPrint: typeof handleQuickPrint === 'function',
        preparePrintData: typeof preparePrintData === 'function'
      };

      logger.log('📊 [TEST] Test results:', {
        dataStructure: dataTest,
        sectionFunctions,
        printFunctions
      });

      const allTestsPassed = dataTest &&
        Object.values(sectionFunctions).every((value) => value) &&
        Object.values(printFunctions).every((value) => value);

      if (allTestsPassed) {
        logger.log('✅ [TEST] All tests passed! New Reconciliation print system is ready.');
        return true;
      }

      logger.log('❌ [TEST] Some tests failed.');
      return false;
    } catch (error) {
      logger.error('❌ [TEST] Error testing new reconciliation print system:', error);
      return false;
    }
  }

  return {
    testPrintDataStructure,
    testPrintDialog,
    testNewReconciliationPrintSystem
  };
}

module.exports = {
  createAdvancedPrintDialogTestHandlers
};
