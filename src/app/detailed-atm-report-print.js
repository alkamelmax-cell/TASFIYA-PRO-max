const { createDetailedAtmReportPrintTemplate } = require('./detailed-atm-report-print-template');
const { mapDbErrorMessage } = require('./db-error-messages');

function createDetailedAtmReportPrintHandlers(deps) {
  const windowObj = deps.windowObj || globalThis;
  const ipcRenderer = deps.ipcRenderer;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const logger = deps.logger || console;

  const templateBuilders = createDetailedAtmReportPrintTemplate({
    getDetailedAtmReportFilters: deps.getDetailedAtmReportFilters,
    getFilteredDetailedReportData: deps.getFilteredDetailedReportData,
    getCompanyName: deps.getCompanyName,
    formatCurrency: deps.formatCurrency,
    getCurrentDateTime: deps.getCurrentDateTime
  });

  async function handlePrintDetailedAtmReport() {
    logger.log('🖨️ [DETAILED-ATM] طباعة التقرير التحليلي المفصل...');

    try {
      const filteredDetailedReportData = deps.getFilteredDetailedReportData();
      if (!filteredDetailedReportData || filteredDetailedReportData.length === 0) {
        deps.getDialogUtils().showValidationError('لا توجد بيانات للطباعة');
        return;
      }

      deps.getDialogUtils().showLoading('جاري تحضير التقرير للطباعة...', 'يرجى الانتظار');

      const printHtml = await templateBuilders.generateDetailedAtmReportPrintContent();
      const result = await openDetailedAtmReportPrintWindow(printHtml);

      deps.getDialogUtils().close();

      if (result.success) {
        deps.getDialogUtils().showSuccessToast('تم فتح نافذة معاينة الطباعة بنجاح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر فتح معاينة الطباعة.'
        });
        deps.getDialogUtils().showError(`فشل في فتح معاينة الطباعة: ${friendly}`, 'خطأ في الطباعة');
      }
    } catch (error) {
      deps.getDialogUtils().close();
      logger.error('❌ [DETAILED-ATM] خطأ في طباعة التقرير:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء طباعة التقرير.'
      });
      deps.getDialogUtils().showError(`حدث خطأ أثناء طباعة التقرير: ${friendly}`, 'خطأ في الطباعة');
    }
  }

  function buildDetailedAtmThermalData() {
    const filters = deps.getDetailedAtmReportFilters();
    const filteredData = deps.getFilteredDetailedReportData() || [];
    const totalAmount = filteredData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const now = new Date();
    const reportDate = filters.dateTo || now.toISOString().split('T')[0];
    const reconciliationNumber = `ATM-RPT-${now.getTime().toString().slice(-6)}`;

    const cashierLabel = filters.cashierId
      ? (filteredData[0]?.cashier_name || 'كاشير محدد')
      : 'جميع الكاشيرين';

    const branchLabel = filters.atmId
      ? (filteredData[0]?.atm_branch_name || 'فرع محدد')
      : 'جميع الفروع';

    return {
      isDetailedAtmReport: true,
      reconciliation: {
        id: now.getTime(),
        reconciliation_number: reconciliationNumber,
        reconciliation_date: reportDate,
        cashier_name: cashierLabel,
        branch_name: branchLabel,
        system_sales: totalAmount,
        total_receipts: totalAmount,
        surplus_deficit: 0
      },
      bankReceipts: filteredData.map((item, index) => ({
        id: item.receipt_id || index + 1,
        atm_name: [item.atm_name, item.atm_branch_name ? `(${item.atm_branch_name})` : null].filter(Boolean).join(' '),
        bank_name: `${item.bank_name || 'غير محدد'} - ${item.operation_type || 'عملية'}`,
        amount: Number(item.amount) || 0
      })),
      cashReceipts: [],
      postpaidSales: [],
      customerReceipts: [],
      returnInvoices: [],
      suppliers: [],
      printOptions: {
        includeBankDetails: true,
        includeCashDetails: false,
        includePostpaidDetails: false,
        includeCustomerDetails: false,
        includeReturnsDetails: false,
        includeSuppliersDetails: false,
        includeSummary: false
      },
      selectedSections: {
        bankReceipts: true,
        cashReceipts: false,
        postpaidSales: false,
        customerReceipts: false,
        returnInvoices: false,
        suppliers: false,
        summary: false
      }
    };
  }

  async function handlePreviewDetailedAtmReportThermal() {
    logger.log('🔥 [DETAILED-ATM] معاينة التقرير التحليلي على الطابعة الحرارية...');

    try {
      const filteredDetailedReportData = deps.getFilteredDetailedReportData();
      if (!filteredDetailedReportData || filteredDetailedReportData.length === 0) {
        deps.getDialogUtils().showValidationError('لا توجد بيانات للمعاينة الحرارية');
        return;
      }

      deps.getDialogUtils().showLoading('جاري فتح المعاينة الحرارية...', 'يرجى الانتظار');

      const thermalData = buildDetailedAtmThermalData();
      const result = await ipcRenderer.invoke('thermal-printer-preview', thermalData);

      await new Promise((resolve) => setTimeoutFn(resolve, 300));
      deps.getDialogUtils().close();

      if (result.success) {
        deps.getDialogUtils().showSuccessToast('تم فتح المعاينة الحرارية للتقرير بنجاح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر فتح المعاينة الحرارية.'
        });
        deps.getDialogUtils().showError(`فشل في المعاينة الحرارية: ${friendly}`, 'خطأ في الطابعة الحرارية');
      }
    } catch (error) {
      deps.getDialogUtils().close();
      logger.error('❌ [DETAILED-ATM] خطأ في المعاينة الحرارية:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء المعاينة الحرارية.'
      });
      deps.getDialogUtils().showError(`حدث خطأ أثناء المعاينة الحرارية: ${friendly}`, 'خطأ في الطباعة');
    }
  }

  async function handlePrintDetailedAtmReportThermal() {
    logger.log('🔥 [DETAILED-ATM] طباعة التقرير التحليلي على الطابعة الحرارية...');

    try {
      const filteredDetailedReportData = deps.getFilteredDetailedReportData();
      if (!filteredDetailedReportData || filteredDetailedReportData.length === 0) {
        deps.getDialogUtils().showValidationError('لا توجد بيانات للطباعة الحرارية');
        return;
      }

      deps.getDialogUtils().showLoading('جاري الإرسال للطابعة الحرارية...', 'يرجى الانتظار');

      const thermalData = buildDetailedAtmThermalData();
      const settingsResult = await ipcRenderer.invoke('thermal-printer-settings-get');
      const printerSettings = settingsResult.success ? settingsResult.settings : {};
      const result = await ipcRenderer.invoke('thermal-printer-print', thermalData, printerSettings);

      await new Promise((resolve) => setTimeoutFn(resolve, 300));
      deps.getDialogUtils().close();

      if (result.success) {
        deps.getDialogUtils().showSuccessToast('تم إرسال التقرير للطابعة الحرارية بنجاح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر الطباعة الحرارية للتقرير.'
        });
        deps.getDialogUtils().showError(`فشل في الطباعة الحرارية: ${friendly}`, 'خطأ في الطباعة');
      }
    } catch (error) {
      deps.getDialogUtils().close();
      logger.error('❌ [DETAILED-ATM] خطأ في الطباعة الحرارية:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء الطباعة الحرارية.'
      });
      deps.getDialogUtils().showError(`حدث خطأ أثناء الطباعة الحرارية: ${friendly}`, 'خطأ في الطباعة');
    }
  }

  async function openDetailedAtmReportPrintWindow(htmlContent) {
    logger.log('🖨️ [DETAILED-ATM] فتح نافذة طباعة مستقلة...');

    try {
      const printWindow = windowObj.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');

      if (!printWindow) {
        throw new Error('فشل في فتح نافذة الطباعة - قد يكون محجوبة بواسطة مانع النوافذ المنبثقة');
      }

      printWindow.document.write(htmlContent);
      printWindow.document.close();

      await new Promise((resolve) => {
        printWindow.onload = resolve;
        setTimeoutFn(resolve, 1000);
      });

      printWindow.focus();

      logger.log('✅ [DETAILED-ATM] تم فتح نافذة الطباعة بنجاح');
      return { success: true };
    } catch (error) {
      logger.error('❌ [DETAILED-ATM] خطأ في فتح نافذة الطباعة:', error);
      return {
        success: false,
        error: mapDbErrorMessage(error, {
          fallback: 'تعذر فتح نافذة الطباعة.'
        })
      };
    }
  }

  return {
    handlePrintDetailedAtmReport,
    handlePreviewDetailedAtmReportThermal,
    handlePrintDetailedAtmReportThermal,
    openDetailedAtmReportPrintWindow,
    generateDetailedAtmReportPrintContent: templateBuilders.generateDetailedAtmReportPrintContent,
    buildDetailedAtmThermalData
  };
}

module.exports = {
  createDetailedAtmReportPrintHandlers
};
