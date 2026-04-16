const { mapDbErrorMessage } = require('./db-error-messages');

function createThermalDirectPrintHandlers(deps) {
  const document = deps.document;
  const Swal = deps.Swal;
  const ipcRenderer = deps.ipcRenderer;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const getCurrentReconciliation = deps.getCurrentReconciliation || (() => null);
  const getBankReceipts = deps.getBankReceipts || (() => []);
  const getCashReceipts = deps.getCashReceipts || (() => []);
  const getPostpaidSales = deps.getPostpaidSales || (() => []);
  const getCustomerReceipts = deps.getCustomerReceipts || (() => []);
  const getReturnInvoices = deps.getReturnInvoices || (() => []);
  const getSuppliers = deps.getSuppliers || (() => []);
  const prepareReconciliationData = deps.prepareReconciliationData;
  const getSectionPrintOptions = deps.getSectionPrintOptions || null;
  const logger = deps.logger || console;

  function hasPrintableData() {
    return getBankReceipts().length > 0 ||
      getCashReceipts().length > 0 ||
      getPostpaidSales().length > 0 ||
      getCustomerReceipts().length > 0 ||
      getReturnInvoices().length > 0 ||
      getSuppliers().length > 0;
  }

  function openSectionOptionsDialog(mode) {
    const title = mode === 'preview' ? '📋 خيارات المعاينة' : '🖨️ خيارات الطباعة الحرارية';
    const description = mode === 'preview'
      ? 'اختر ما تريد رؤيته:'
      : 'اختر ما تريد تضمينه في الطباعة:';
    const actionButtonId = mode === 'preview' ? 'btn-preview' : 'btn-print';
    const actionButtonStyle = mode === 'preview' ? '#007bff' : '#28a745';
    const actionButtonText = mode === 'preview' ? '👁️ معاينة' : '✅ طباعة';

    return new Promise((resolve) => {
      Swal.fire({
        title,
        html: `
                    <div style="text-align: right; direction: rtl; padding: 20px;">
                        <p style="margin-bottom: 20px; font-weight: bold;">${description}</p>
                        <div style="display: flex; flex-direction: column; gap: 15px; text-align: right;">
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>💳 تفاصيل المقبوضات البنكية</span>
                                <input type="checkbox" id="chk-bank" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>💰 تفاصيل مقبوضات النقد</span>
                                <input type="checkbox" id="chk-cash" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>📋 تفاصيل المبيعات الآجلة</span>
                                <input type="checkbox" id="chk-postpaid" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>👥 تفاصيل مقبوضات العملاء</span>
                                <input type="checkbox" id="chk-customer" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>↩️ تفاصيل الفواتير المرتجعة</span>
                                <input type="checkbox" id="chk-returns" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>🏢 تفاصيل الموردين</span>
                                <input type="checkbox" id="chk-suppliers" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                        </div>
                        <div style="margin-top: 25px; display: flex; gap: 10px; justify-content: center;">
                            <button class="swal2-confirm swal2-styled" id="${actionButtonId}" style="background: ${actionButtonStyle}; padding: 10px 25px; font-size: 14px;">
                                ${actionButtonText}
                            </button>
                            <button class="swal2-cancel swal2-styled" id="btn-cancel" style="background: #6c757d; padding: 10px 25px; font-size: 14px;">
                                ❌ إلغاء
                            </button>
                        </div>
                    </div>
                `,
        showConfirmButton: false,
        didOpen: () => {
          document.getElementById(actionButtonId).onclick = () => {
            const printOptions = {
              includeBankDetails: document.getElementById('chk-bank').checked,
              includeCashDetails: document.getElementById('chk-cash').checked,
              includePostpaidDetails: document.getElementById('chk-postpaid').checked,
              includeCustomerDetails: document.getElementById('chk-customer').checked,
              includeReturnsDetails: document.getElementById('chk-returns').checked,
              includeSuppliersDetails: document.getElementById('chk-suppliers').checked
            };
            Swal.close();
            resolve(printOptions);
          };
          document.getElementById('btn-cancel').onclick = () => {
            Swal.close();
            resolve(null);
          };
        },
        customClass: {
          popup: 'rtl-popup',
          title: 'rtl-title',
          content: 'rtl-content'
        }
      });
    });
  }

  async function showThermalPrintOptionsDialog() {
    return Swal.fire({
      title: '🖨️ خيارات الطباعة الحرارية',
      html: `
            <div style="text-align: right; direction: rtl;">
                <p style="margin-bottom: 20px;">اختر ما تريد طباعته:</p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="swal2-confirm swal2-styled" id="btn-summary" style="background: #007bff; width: 100%;">
                        📋 ملخص التصفية فقط
                    </button>
                    <button class="swal2-confirm swal2-styled" id="btn-full" style="background: #28a745; width: 100%;">
                        📄 تقرير كامل مع التفاصيل
                    </button>
                    <button class="swal2-confirm swal2-styled" id="btn-cancel" style="background: #6c757d; width: 100%;">
                        ❌ إلغاء
                    </button>
                </div>
            </div>
        `,
      showConfirmButton: false,
      didOpen: () => {
        document.getElementById('btn-summary').onclick = () => {
          Swal.close();
          return 'summary';
        };
        document.getElementById('btn-full').onclick = () => {
          Swal.close();
          return 'full';
        };
        document.getElementById('btn-cancel').onclick = () => {
          Swal.close();
          return null;
        };
      },
      customClass: {
        popup: 'rtl-popup',
        title: 'rtl-title',
        content: 'rtl-content'
      }
    });
  }

  async function handleThermalPrinterPreview() {
    if (!getCurrentReconciliation()) {
      getDialogUtils().showValidationError('يرجى إنشاء تصفية أولاً');
      return;
    }

    try {
      logger.log('🖨️ [THERMAL] فتح معاينة إيصال الطابعة الحرارية...');

      if (!hasPrintableData()) {
        logger.warn('⚠️ [THERMAL] لا توجد بيانات للطباعة');
        getDialogUtils().showValidationError('لا توجد بيانات للطباعة. يرجى إضافة مقبوضات أو مبيعات أولاً.');
        return;
      }

      const printOptions = getSectionPrintOptions
        ? await getSectionPrintOptions('preview')
        : await openSectionOptionsDialog('preview');

      if (!printOptions) {
        logger.log('⏭️ [THERMAL] تم إلغاء المعاينة من قبل المستخدم');
        return;
      }

      const reconciliationData = await prepareReconciliationData();
      reconciliationData.printOptions = printOptions;

      getDialogUtils().showLoading('جاري فتح معاينة الإيصال...');
      const result = await ipcRenderer.invoke('thermal-printer-preview', reconciliationData);

      await new Promise((resolve) => setTimeoutFn(resolve, 500));
      getDialogUtils().close();

      if (result.success) {
        logger.log('✅ [THERMAL] تم فتح معاينة الإيصال بنجاح');
        getDialogUtils().showSuccessToast('تم فتح معاينة إيصال الطابعة الحرارية');
      } else {
        logger.error('❌ [THERMAL] فشل في فتح المعاينة:', result.error);
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر فتح معاينة الطباعة الحرارية.'
        });
        getDialogUtils().showError(`فشل في فتح المعاينة: ${friendly}`, 'خطأ في الطابعة الحرارية');
      }
    } catch (error) {
      logger.error('❌ [THERMAL] خطأ:', error);
      getDialogUtils().close();
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ معاينة الطباعة الحرارية.'
      });
      getDialogUtils().showError(`حدث خطأ: ${friendly}`, 'خطأ في الطابعة الحرارية');
    }
  }

  async function handleThermalPrinterPrint() {
    if (!getCurrentReconciliation()) {
      getDialogUtils().showValidationError('يرجى إنشاء تصفية أولاً');
      return;
    }

    try {
      logger.log('🖨️ [THERMAL] بدء الطباعة المباشرة على الطابعة الحرارية...');

      if (!hasPrintableData()) {
        logger.warn('⚠️ [THERMAL] لا توجد بيانات للطباعة');
        getDialogUtils().showValidationError('لا توجد بيانات للطباعة. يرجى إضافة مقبوضات أو مبيعات أولاً.');
        return;
      }

      const printOptions = getSectionPrintOptions
        ? await getSectionPrintOptions('print')
        : await openSectionOptionsDialog('print');

      if (!printOptions) {
        logger.log('⏭️ [THERMAL] تم إلغاء الطباعة من قبل المستخدم');
        return;
      }

      const reconciliationData = await prepareReconciliationData();
      reconciliationData.printOptions = printOptions;

      const settingsResult = await ipcRenderer.invoke('thermal-printer-settings-get');
      const printerSettings = settingsResult.success ? settingsResult.settings : {};

      getDialogUtils().showLoading('جاري الطباعة على الطابعة الحرارية...');
      const result = await ipcRenderer.invoke('thermal-printer-print', reconciliationData, printerSettings);

      await new Promise((resolve) => setTimeoutFn(resolve, 500));
      getDialogUtils().close();

      if (result.success) {
        logger.log('✅ [THERMAL] تم إرسال الإيصال للطباعة بنجاح');
        getDialogUtils().showSuccess('تم إرسال الإيصال إلى الطابعة الحرارية بنجاح', 'نجاح الطباعة');
      } else {
        logger.error('❌ [THERMAL] فشل في الطباعة:', result.error);
        const friendly = mapDbErrorMessage(result.error, {
          fallback: 'تعذر إرسال الإيصال إلى الطابعة الحرارية.'
        });
        getDialogUtils().showError(`فشل في الطباعة: ${friendly}`, 'خطأ في الطابعة الحرارية');
      }
    } catch (error) {
      logger.error('❌ [THERMAL] خطأ:', error);
      await new Promise((resolve) => setTimeoutFn(resolve, 300));
      getDialogUtils().close();
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ الطباعة الحرارية.'
      });
      getDialogUtils().showError(`حدث خطأ: ${friendly}`, 'خطأ في الطابعة الحرارية');
    }
  }

  return {
    handleThermalPrinterPreview,
    showThermalPrintOptionsDialog,
    handleThermalPrinterPrint
  };
}

module.exports = {
  createThermalDirectPrintHandlers
};
