const { mapDbErrorMessage } = require('./db-error-messages');

function createDetailedAtmReportExportHandlers(context) {
  const ipc = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const getDetailedAtmReportFilters = context.getDetailedAtmReportFilters;
  const getFilteredDetailedReportData = context.getFilteredDetailedReportData;
  const logger = context.logger || console;

  async function handleExportDetailedAtmReportExcel() {
    logger.log('📊 [DETAILED-ATM] تصدير التقرير إلى Excel...');

    try {
      const filteredDetailedReportData = getFilteredDetailedReportData();
      if (!filteredDetailedReportData || filteredDetailedReportData.length === 0) {
        getDialogUtils().showValidationError('لا توجد بيانات للتصدير');
        return;
      }

      getDialogUtils().showLoading('جاري تصدير التقرير إلى Excel...', 'يرجى الانتظار');

      const filters = getDetailedAtmReportFilters();
      const feesModeEnabled = filters.feesMode === 'with_fees';

      const headers = feesModeEnabled
        ? [
          'التاريخ والوقت',
          'نوع العملية',
          'اسم الجهاز',
          'الفرع',
          'رقم الحساب',
          'البنك',
          'المبلغ قبل الرسوم',
          'الرسوم البنكية',
          'ضريبة الرسوم',
          'المبلغ بعد الرسوم',
          'الكاشير',
          'رقم الكاشير',
          'رقم التصفية',
          'تاريخ التصفية'
        ]
        : [
          'التاريخ والوقت',
          'نوع العملية',
          'اسم الجهاز',
          'الفرع',
          'رقم الحساب',
          'البنك',
          'المبلغ',
          'الكاشير',
          'رقم الكاشير',
          'رقم التصفية',
          'تاريخ التصفية'
        ];

      const rows = filteredDetailedReportData.map((item) => (feesModeEnabled
        ? [
          item.formatted_datetime,
          item.operation_type,
          item.atm_name,
          item.atm_branch_name || 'غير محدد',
          item.atm_location || 'غير محدد',
          item.bank_name,
          item.gross_amount ?? item.amount,
          item.fee_amount ?? 0,
          item.fee_vat_amount ?? 0,
          item.net_amount ?? item.amount,
          item.cashier_name,
          item.cashier_number,
          item.reconciliation_id,
          item.formatted_date
        ]
        : [
          item.formatted_datetime,
          item.operation_type,
          item.atm_name,
          item.atm_branch_name || 'غير محدد',
          item.atm_location || 'غير محدد',
          item.bank_name,
          item.amount,
          item.cashier_name,
          item.cashier_number,
          item.reconciliation_id,
          item.formatted_date
        ]));

      const filename = `تقرير_تحليلي_مفصل_أجهزة_الصراف_${filters.dateFrom}_${filters.dateTo}.xlsx`;

      const result = await ipc.invoke('export-excel', {
        data: {
          headers,
          rows
        },
        filename
      });

      getDialogUtils().close();

      if (result.success) {
        getDialogUtils().showSuccessToast('تم تصدير التقرير إلى Excel بنجاح');
      } else {
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر تصدير التقرير إلى Excel.'
        });
        getDialogUtils().showError(`فشل في تصدير Excel: ${friendly}`, 'خطأ في التصدير');
      }
    } catch (error) {
      getDialogUtils().close();
      logger.error('Error exporting detailed ATM report to Excel:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'حدث خطأ أثناء تصدير التقرير.'
      });
      getDialogUtils().showError(`حدث خطأ أثناء تصدير التقرير: ${friendly}`, 'خطأ في التصدير');
    }
  }

  return {
    handleExportDetailedAtmReportExcel
  };
}

module.exports = {
  createDetailedAtmReportExportHandlers
};
