function createEventListenersSetup(deps) {
  const doc = deps.document;
  const handlers = deps.handlers;

  function setupEventListeners() {
    doc.getElementById('branchSelect').addEventListener('change', handlers.handleBranchChange);

    doc.getElementById('loginForm').addEventListener('submit', handlers.handleLogin);
    doc.getElementById('logoutBtn').addEventListener('click', handlers.handleLogout);

    const recallReconciliationBtn = doc.getElementById('recallReconciliationBtn');
    if (recallReconciliationBtn) {
      recallReconciliationBtn.addEventListener('click', handlers.handleRecallReconciliation);
    }
    const recallReconciliationNumberInput = doc.getElementById('recallReconciliationNumber');
    if (recallReconciliationNumberInput && recallReconciliationBtn) {
      recallReconciliationNumberInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          recallReconciliationBtn.click();
        }
      });
    }

    doc.querySelectorAll('.menu-item').forEach((item) => {
      item.addEventListener('click', handlers.handleNavigation);
    });

    doc.getElementById('sidebarToggle').addEventListener('click', handlers.toggleSidebar);
    doc.getElementById('fixedSidebarToggle').addEventListener('click', handlers.toggleSidebar);

    doc.getElementById('newReconciliationForm').addEventListener('submit', handlers.handleNewReconciliation);

    doc.getElementById('bankReceiptForm').addEventListener('submit', handlers.handleBankReceipt);
    doc.getElementById('cashReceiptForm').addEventListener('submit', handlers.handleCashReceipt);
    doc.getElementById('postpaidSaleForm').addEventListener('submit', handlers.handlePostpaidSale);
    doc.getElementById('customerReceiptForm').addEventListener('submit', handlers.handleCustomerReceipt);
    doc.getElementById('returnInvoiceForm').addEventListener('submit', handlers.handleReturnInvoice);
    doc.getElementById('supplierForm').addEventListener('submit', handlers.handleSupplier);

    const cancelBankReceiptEditBtn = doc.getElementById('cancelBankReceiptEditBtn');
    if (cancelBankReceiptEditBtn && typeof handlers.cancelBankReceiptEdit === 'function') {
      cancelBankReceiptEditBtn.addEventListener('click', handlers.cancelBankReceiptEdit);
    }

    const cancelCashReceiptEditBtn = doc.getElementById('cancelCashReceiptEditBtn');
    if (cancelCashReceiptEditBtn && typeof handlers.cancelCashReceiptEdit === 'function') {
      cancelCashReceiptEditBtn.addEventListener('click', handlers.cancelCashReceiptEdit);
    }

    const cancelPostpaidSaleEditBtn = doc.getElementById('cancelPostpaidSaleEditBtn');
    if (cancelPostpaidSaleEditBtn && typeof handlers.cancelPostpaidSaleEdit === 'function') {
      cancelPostpaidSaleEditBtn.addEventListener('click', handlers.cancelPostpaidSaleEdit);
    }

    const cancelCustomerReceiptEditBtn = doc.getElementById('cancelCustomerReceiptEditBtn');
    if (cancelCustomerReceiptEditBtn && typeof handlers.cancelCustomerReceiptEdit === 'function') {
      cancelCustomerReceiptEditBtn.addEventListener('click', handlers.cancelCustomerReceiptEdit);
    }

    const cancelReturnInvoiceEditBtn = doc.getElementById('cancelReturnInvoiceEditBtn');
    if (cancelReturnInvoiceEditBtn && typeof handlers.cancelReturnInvoiceEdit === 'function') {
      cancelReturnInvoiceEditBtn.addEventListener('click', handlers.cancelReturnInvoiceEdit);
    }

    const cancelSupplierEditBtn = doc.getElementById('cancelSupplierEditBtn');
    if (cancelSupplierEditBtn && typeof handlers.cancelSupplierEdit === 'function') {
      cancelSupplierEditBtn.addEventListener('click', handlers.cancelSupplierEdit);
    }

    doc.getElementById('cashierSelect').addEventListener('change', handlers.handleCashierChange);
    doc.getElementById('atmSelect').addEventListener('change', handlers.handleAtmChange);

    doc.getElementById('operationType').addEventListener('change', handlers.handleOperationTypeChange);
    doc.getElementById('editOperationType').addEventListener('change', handlers.handleEditOperationTypeChange);

    doc.getElementById('denomination').addEventListener('change', handlers.calculateCashTotal);
    doc.getElementById('quantity').addEventListener('input', handlers.calculateCashTotal);
    doc.getElementById('systemSales').addEventListener('input', handlers.updateSummary);

    doc.getElementById('printNewReconciliationBtn').addEventListener('click', handlers.handlePrintReport);
    doc.getElementById('quickPrintBtn').addEventListener('click', handlers.handleQuickPrint);
    doc.getElementById('thermalPrinterPreviewBtn').addEventListener('click', handlers.handleThermalPrinterPreview);
    doc.getElementById('thermalPrinterPrintBtn').addEventListener('click', handlers.handleThermalPrinterPrint);
    doc.getElementById('savePdfBtn').addEventListener('click', handlers.handleSavePdf);
    doc.getElementById('saveReconciliationBtn').addEventListener('click', handlers.handleSaveReconciliation);

    doc.getElementById('branchForm').addEventListener('submit', handlers.handleBranchForm);
    doc.getElementById('addCashierForm').addEventListener('submit', handlers.handleAddCashier);
    doc.getElementById('addAdminForm').addEventListener('submit', handlers.handleAddAdmin);
    doc.getElementById('addAccountantForm').addEventListener('submit', handlers.handleAddAccountant);
    doc.getElementById('addAtmForm').addEventListener('submit', handlers.handleAddAtm);

    doc.getElementById('cancelCashierEdit').addEventListener('click', () => handlers.resetCashierForm());
    doc.getElementById('cancelAdminEdit').addEventListener('click', () => handlers.resetAdminForm());
    doc.getElementById('cancelAccountantEdit').addEventListener('click', () => handlers.resetAccountantForm());
    doc.getElementById('cancelAtmEdit').addEventListener('click', () => handlers.resetAtmForm());

    doc.getElementById('searchReconciliationsBtn').addEventListener('click', handlers.handleSearchReconciliations);
    doc.getElementById('clearSearchBtn').addEventListener('click', handlers.handleClearSearch);
    doc.getElementById('cancelNewReconciliationBtn').addEventListener('click', handlers.handleCancelNewReconciliation);

    doc.getElementById('generateReportBtn').addEventListener('click', handlers.handleGenerateReport);
    doc.getElementById('exportReportPdfBtn').addEventListener('click', handlers.handleExportReportPdf);
    doc.getElementById('exportReportExcelBtn').addEventListener('click', handlers.handleExportReportExcel);
    doc.getElementById('printReportBtn').addEventListener('click', handlers.handlePrintReportsData);
    doc.getElementById('clearReportFiltersBtn').addEventListener('click', handlers.handleClearReportFilters);
    doc.getElementById('toggleSummaryViewBtn').addEventListener('click', handlers.toggleSummaryView);
    doc.getElementById('toggleChartViewBtn').addEventListener('click', handlers.toggleChartView);
    if (typeof handlers.handleReportBranchFilterChange === 'function') {
      doc.getElementById('reportBranchFilter').addEventListener('change', handlers.handleReportBranchFilterChange);
    }
    const reportSearchTextInput = doc.getElementById('reportSearchText');
    if (reportSearchTextInput && typeof handlers.handleGenerateReport === 'function') {
      reportSearchTextInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          handlers.handleGenerateReport();
        }
      });
    }

    doc.getElementById('generateTimeReportBtn').addEventListener('click', handlers.handleGenerateTimeReport);
    doc.getElementById('generateAtmReportBtn').addEventListener('click', handlers.handleGenerateAtmReport);
    doc.getElementById('generateDetailedAtmReportBtn').addEventListener('click', handlers.handleShowDetailedAtmReportModal);
    if (typeof handlers.handleAdvancedDatePreset === 'function') {
      doc.querySelectorAll('.advanced-date-preset-btn').forEach((btn) => {
        btn.addEventListener('click', handlers.handleAdvancedDatePreset);
      });
    }
    if (typeof handlers.handleAdvancedDateInputChange === 'function') {
      [
        'timeReportFrom',
        'timeReportTo',
        'atmReportFrom',
        'atmReportTo'
      ].forEach((inputId) => {
        const input = doc.getElementById(inputId);
        if (input) {
          input.addEventListener('change', handlers.handleAdvancedDateInputChange);
        }
      });
    }
    const clearTimeReportFiltersBtn = doc.getElementById('clearTimeReportFiltersBtn');
    if (clearTimeReportFiltersBtn && typeof handlers.handleClearTimeReportFilters === 'function') {
      clearTimeReportFiltersBtn.addEventListener('click', handlers.handleClearTimeReportFilters);
    }
    const clearAtmReportFiltersBtn = doc.getElementById('clearAtmReportFiltersBtn');
    if (clearAtmReportFiltersBtn && typeof handlers.handleClearAtmReportFilters === 'function') {
      clearAtmReportFiltersBtn.addEventListener('click', handlers.handleClearAtmReportFilters);
    }

    doc.getElementById('generatePerformanceBtn').addEventListener('click', handlers.handleGeneratePerformanceComparison);
    doc.getElementById('exportPerformancePdfBtn').addEventListener('click', handlers.handleExportPerformancePdf);

    doc.getElementById('applyDetailedFiltersBtn').addEventListener('click', handlers.handleGenerateDetailedAtmReport);
    doc.getElementById('exportDetailedAtmReportExcel').addEventListener('click', handlers.handleExportDetailedAtmReportExcel);
    doc.getElementById('printDetailedAtmReport').addEventListener('click', handlers.handlePrintDetailedAtmReport);
    doc.getElementById('previewDetailedAtmThermalReport').addEventListener('click', handlers.handlePreviewDetailedAtmReportThermal);
    doc.getElementById('printDetailedAtmThermalReport').addEventListener('click', handlers.handlePrintDetailedAtmReportThermal);
    doc.getElementById('detailedReportSearch').addEventListener('input', handlers.handleDetailedReportSearch);
    doc.getElementById('detailedReportSort').addEventListener('change', handlers.handleDetailedReportSort);
    doc.getElementById('detailedReportPageSize').addEventListener('change', handlers.handleDetailedReportPageSize);

    doc.getElementById('exportAdvancedReportPdf').addEventListener('click', handlers.handleExportAdvancedReportPdf);
    doc.getElementById('exportAdvancedReportExcel').addEventListener('click', handlers.handleExportAdvancedReportExcel);
    doc.getElementById('printAdvancedReport').addEventListener('click', handlers.handlePrintAdvancedReport);

    const generalSettingsForm = doc.getElementById('generalSettingsForm');
    if (generalSettingsForm) {
      generalSettingsForm.addEventListener('submit', handlers.handleSaveGeneralSettings);
    }
    const printSettingsForm = doc.getElementById('printSettingsForm');
    if (printSettingsForm) {
      printSettingsForm.addEventListener('submit', handlers.handleSavePrintSettings);
    }
    const reportsSettingsForm = doc.getElementById('reportsSettingsForm');
    if (reportsSettingsForm) {
      reportsSettingsForm.addEventListener('submit', handlers.handleSaveReportsSettings);
    }
    const reconciliationFormulaSettingsForm = doc.getElementById('reconciliationFormulaSettingsForm');
    if (reconciliationFormulaSettingsForm) {
      reconciliationFormulaSettingsForm.addEventListener('submit', handlers.handleSaveReconciliationFormulaSettings);
    }
    const companyLogoInput = doc.getElementById('companyLogo');
    if (companyLogoInput) {
      companyLogoInput.addEventListener('change', handlers.handleLogoUpload);
    }
    const resetGeneralSettingsBtn = doc.getElementById('resetGeneralSettings');
    if (resetGeneralSettingsBtn) {
      resetGeneralSettingsBtn.addEventListener('click', handlers.handleResetGeneralSettings);
    }
    const resetPrintSettingsBtn = doc.getElementById('resetPrintSettings');
    if (resetPrintSettingsBtn) {
      resetPrintSettingsBtn.addEventListener('click', handlers.handleResetPrintSettings);
    }
    const resetReportsSettingsBtn = doc.getElementById('resetReportsSettings');
    if (resetReportsSettingsBtn) {
      resetReportsSettingsBtn.addEventListener('click', handlers.handleResetReportsSettings);
    }
    const resetReconciliationFormulaSettingsBtn = doc.getElementById('resetReconciliationFormulaSettings');
    if (resetReconciliationFormulaSettingsBtn) {
      resetReconciliationFormulaSettingsBtn.addEventListener('click', handlers.handleResetReconciliationFormulaSettings);
    }
    [
      'formulaBankReceipts',
      'formulaCashReceipts',
      'formulaPostpaidSales',
      'formulaCustomerReceipts',
      'formulaReturnInvoices',
      'formulaSuppliers'
    ].forEach((selectId) => {
      const selectEl = doc.getElementById(selectId);
      if (selectEl) {
        selectEl.addEventListener('change', handlers.handleReconciliationFormulaSettingsPreview);
      }
    });
    doc.querySelectorAll('[data-formula-preset]').forEach((presetBtn) => {
      presetBtn.addEventListener('click', handlers.handleApplyReconciliationFormulaPreset);
    });
    const reconciliationFormulaTab = doc.getElementById('reconciliation-formula-tab');
    if (reconciliationFormulaTab) {
      reconciliationFormulaTab.addEventListener('click', handlers.handleLoadReconciliationFormulaProfiles);
    }
    const formulaProfileSelect = doc.getElementById('formulaProfileSelect');
    if (formulaProfileSelect) {
      formulaProfileSelect.addEventListener('change', handlers.handleFormulaProfileSelectionChange);
    }
    const formulaProfilesTableBody = doc.getElementById('formulaProfilesTableBody');
    if (formulaProfilesTableBody) {
      formulaProfilesTableBody.addEventListener('click', handlers.handleFormulaProfilesTableClick);
    }
    const createFormulaProfileBtn = doc.getElementById('createFormulaProfileBtn');
    if (createFormulaProfileBtn) {
      createFormulaProfileBtn.addEventListener('click', handlers.handleOpenCreateFormulaProfileModal);
    }
    const deleteSelectedFormulaProfileBtn = doc.getElementById('deleteSelectedFormulaProfileBtn');
    if (deleteSelectedFormulaProfileBtn) {
      deleteSelectedFormulaProfileBtn.addEventListener('click', handlers.handleDeleteFormulaProfile);
    }
    const saveFormulaProfileModalBtn = doc.getElementById('saveFormulaProfileModalBtn');
    if (saveFormulaProfileModalBtn) {
      saveFormulaProfileModalBtn.addEventListener('click', handlers.handleSaveFormulaProfileModal);
    }
    [
      'formulaModalBankReceipts',
      'formulaModalCashReceipts',
      'formulaModalPostpaidSales',
      'formulaModalCustomerReceipts',
      'formulaModalReturnInvoices',
      'formulaModalSuppliers'
    ].forEach((selectId) => {
      const selectEl = doc.getElementById(selectId);
      if (selectEl) {
        selectEl.addEventListener('change', handlers.handleFormulaProfileModalPreview);
      }
    });
    const applyAndSaveFormulaPresetBtn = doc.getElementById('applyAndSaveFormulaPresetBtn');
    if (applyAndSaveFormulaPresetBtn) {
      applyAndSaveFormulaPresetBtn.addEventListener('click', handlers.handleApplyAndSaveReconciliationFormulaPreset);
    }
    doc.getElementById('selectReportsPath').addEventListener('click', handlers.handleSelectReportsPath);
    doc.getElementById('testPrintSettings').addEventListener('click', handlers.handleTestPrintSettings);
    doc.getElementById('createBackupBtn').addEventListener('click', handlers.handleCreateBackup);
    doc.getElementById('restoreBackupBtn').addEventListener('click', handlers.handleRestoreBackup);
    doc.getElementById('exportDataBtn').addEventListener('click', handlers.handleExportData);
    doc.getElementById('optimizeDbBtn').addEventListener('click', handlers.handleOptimizeDatabase);
    doc.getElementById('repairDbBtn').addEventListener('click', handlers.handleRepairDatabase);
    doc.getElementById('analyzeDbBtn').addEventListener('click', handlers.handleAnalyzeDatabase);
    doc.getElementById('saveDatabaseSettings').addEventListener('click', handlers.handleSaveDatabaseSettings);
    const databaseTab = doc.getElementById('database-tab');
    if (databaseTab && typeof handlers.handleLoadArchiveYears === 'function') {
      databaseTab.addEventListener('click', handlers.handleLoadArchiveYears);
      if (databaseTab.classList && typeof databaseTab.classList.contains === 'function' && databaseTab.classList.contains('active')) {
        handlers.handleLoadArchiveYears();
      }
    }
    const archiveYearSelect = doc.getElementById('archiveYearSelect');
    if (archiveYearSelect && typeof handlers.handleArchiveYearChange === 'function') {
      archiveYearSelect.addEventListener('change', handlers.handleArchiveYearChange);
    }
    const archiveFiscalYearBtn = doc.getElementById('archiveFiscalYearBtn');
    if (archiveFiscalYearBtn && typeof handlers.handleArchiveFiscalYear === 'function') {
      archiveFiscalYearBtn.addEventListener('click', handlers.handleArchiveFiscalYear);
    }
    const archiveBrowseYearSelect = doc.getElementById('archiveBrowseYearSelect');
    if (archiveBrowseYearSelect && typeof handlers.handleArchiveBrowseYearChange === 'function') {
      archiveBrowseYearSelect.addEventListener('change', handlers.handleArchiveBrowseYearChange);
    }
    const loadArchivedReconciliationsBtn = doc.getElementById('loadArchivedReconciliationsBtn');
    if (loadArchivedReconciliationsBtn && typeof handlers.handleLoadArchivedReconciliations === 'function') {
      loadArchivedReconciliationsBtn.addEventListener('click', handlers.handleLoadArchivedReconciliations);
    }
    const archiveBrowseSearchBtn = doc.getElementById('archiveBrowseSearchBtn');
    if (archiveBrowseSearchBtn && typeof handlers.handleArchiveBrowseSearch === 'function') {
      archiveBrowseSearchBtn.addEventListener('click', handlers.handleArchiveBrowseSearch);
    }
    const archiveBrowseClearBtn = doc.getElementById('archiveBrowseClearBtn');
    if (archiveBrowseClearBtn && typeof handlers.handleArchiveBrowseClear === 'function') {
      archiveBrowseClearBtn.addEventListener('click', handlers.handleArchiveBrowseClear);
    }
    const archiveBrowseResetSortBtn = doc.getElementById('archiveBrowseResetSortBtn');
    if (archiveBrowseResetSortBtn && typeof handlers.handleArchiveBrowseResetSort === 'function') {
      archiveBrowseResetSortBtn.addEventListener('click', handlers.handleArchiveBrowseResetSort);
    }
    const archiveBrowseSearchInputs = [
      'archiveBrowseSearchNumber',
      'archiveBrowseSearchDate',
      'archiveBrowseSearchCashier'
    ];
    archiveBrowseSearchInputs.forEach((inputId) => {
      const input = doc.getElementById(inputId);
      if (input && typeof handlers.handleArchiveBrowseSearch === 'function') {
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            handlers.handleArchiveBrowseSearch();
          }
        });
      }
    });
    const archiveSortHeaders = doc.querySelectorAll('th.archived-rec-sortable');
    if (archiveSortHeaders && typeof handlers.handleArchiveBrowseSort === 'function') {
      archiveSortHeaders.forEach((header) => {
        header.addEventListener('click', handlers.handleArchiveBrowseSort);
        header.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handlers.handleArchiveBrowseSort(event);
          }
        });
      });
    }
    const restoreArchivedYearBtn = doc.getElementById('restoreArchivedYearBtn');
    if (restoreArchivedYearBtn && typeof handlers.handleRestoreArchivedYear === 'function') {
      restoreArchivedYearBtn.addEventListener('click', handlers.handleRestoreArchivedYear);
    }
    const archivedRecPrevPage = doc.getElementById('archivedRecPrevPage');
    if (archivedRecPrevPage && typeof handlers.handleArchiveBrowsePrevPage === 'function') {
      archivedRecPrevPage.addEventListener('click', handlers.handleArchiveBrowsePrevPage);
    }
    const archivedRecNextPage = doc.getElementById('archivedRecNextPage');
    if (archivedRecNextPage && typeof handlers.handleArchiveBrowseNextPage === 'function') {
      archivedRecNextPage.addEventListener('click', handlers.handleArchiveBrowseNextPage);
    }
    doc.getElementById('users-tab').addEventListener('click', handlers.handleLoadUserPermissionsManager);
    doc.getElementById('permissionsUserSelect').addEventListener('change', handlers.handlePermissionsUserChange);
    doc.getElementById('selectAllPermissionsBtn').addEventListener('click', handlers.handleSelectAllPermissions);
    doc.getElementById('clearAllPermissionsBtn').addEventListener('click', handlers.handleClearAllPermissions);
    doc.getElementById('saveUserSettings').addEventListener('click', handlers.handleSaveUserSettings);
    doc.getElementById('changePasswordBtn').addEventListener('click', handlers.handleChangePassword);
    doc.getElementById('selectBackupLocation').addEventListener('click', handlers.handleSelectBackupLocation);
    doc.getElementById('autoBackup').addEventListener('change', handlers.handleAutoBackupChange);

    doc.getElementById('directPrintBtn').addEventListener('click', handlers.handleDirectPrint);
    doc.getElementById('previewPrintBtn').addEventListener('click', handlers.handlePrintPreview);

    doc.getElementById('generatePostpaidSalesReportBtn').addEventListener('click', handlers.handleGeneratePostpaidSalesReport);
    doc.getElementById('clearPostpaidSalesFiltersBtn').addEventListener('click', handlers.clearPostpaidSalesReportFilters);
    const postpaidSalesReportMode = doc.getElementById('postpaidSalesReportMode');
    if (postpaidSalesReportMode && typeof handlers.handlePostpaidSalesReportModeChange === 'function') {
      postpaidSalesReportMode.addEventListener('change', handlers.handlePostpaidSalesReportModeChange);
    }
    doc.getElementById('exportPostpaidSalesReportPdf').addEventListener('click', handlers.handleExportPostpaidSalesReportPdf);
    doc.getElementById('exportPostpaidSalesReportExcel').addEventListener('click', handlers.handleExportPostpaidSalesReportExcel);
    doc.getElementById('printPostpaidSalesReport').addEventListener('click', handlers.handlePrintPostpaidSalesReport);
    doc.getElementById('previewPostpaidSalesReportThermal').addEventListener('click', handlers.handlePreviewPostpaidSalesReportThermal);
    doc.getElementById('printPostpaidSalesReportThermal').addEventListener('click', handlers.handlePrintPostpaidSalesReportThermal);
  }

  return {
    setupEventListeners
  };
}

module.exports = {
  createEventListenersSetup
};
