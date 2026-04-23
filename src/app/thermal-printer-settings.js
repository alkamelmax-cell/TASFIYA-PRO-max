const { mapDbErrorMessage } = require('./db-error-messages');

function createThermalPrinterSettingsHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const getDialogUtils = deps.getDialogUtils;
  const logger = deps.logger || console;

  async function initializeThermalPrinterSettings() {
    try {
      logger.log('🖨️ [THERMAL] تهيئة إعدادات الطابعة الحرارية...');

      const thermalForm = doc.getElementById('thermalPrinterSettingsForm');
      if (thermalForm) {
        thermalForm.addEventListener('submit', handleSaveThermalPrinterSettings);
      }

      const testBtn = doc.getElementById('testThermalPrint');
      if (testBtn) {
        testBtn.addEventListener('click', handleTestThermalPrint);
      }

      const refreshBtn = doc.getElementById('refreshPrintersList');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAvailablePrinters);
      }

      await loadAvailablePrinters();
      await loadThermalPrinterSettings();

      logger.log('✅ [THERMAL] تم تهيئة إعدادات الطابعة الحرارية بنجاح');
    } catch (error) {
      logger.error('❌ [THERMAL] خطأ في تهيئة الطابعة الحرارية:', error);
    }
  }

  async function loadAvailablePrinters() {
    try {
      logger.log('🖨️ [THERMAL] جاري تحميل قائمة الطابعات...');

      const result = await ipc.invoke('thermal-printer-list');
      const select = doc.getElementById('thermalPrinterName');

      if (!select) {
        logger.warn('⚠️ [THERMAL] لم يتم العثور على عنصر اختيار الطابعة');
        return;
      }

      if (result.success && result.printers && result.printers.length > 0) {
        select.innerHTML = '';
        result.printers.forEach((printer) => {
          const option = doc.createElement('option');
          option.value = printer.name;
          option.textContent = `${printer.displayName} ${printer.isDefault ? '(افتراضي)' : ''}`.trim();
          option.selected = printer.isDefault;
          select.appendChild(option);
        });

        logger.log(`✅ [THERMAL] تم تحميل ${result.printers.length} طابعة`);
      } else {
        logger.warn('⚠️ [THERMAL] لم يتم العثور على طابعات أو حدث خطأ:', result.error);
        select.innerHTML = '<option value="">لم يتم العثور على طابعات - اختر يدوياً</option>';
      }
    } catch (error) {
      logger.error('❌ [THERMAL] خطأ في تحميل قائمة الطابعات:', error);
      const select = doc.getElementById('thermalPrinterName');
      if (select) {
        select.innerHTML = '<option value="">خطأ في تحميل الطابعات</option>';
      }
      const dialogUtils = getDialogUtils();
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تحميل قائمة الطابعات.'
      });
      dialogUtils.showError(`فشل في تحميل قائمة الطابعات: ${friendly}`, 'خطأ في الطابعة');
    }
  }

  async function loadThermalPrinterSettings() {
    try {
      logger.log('🖨️ [THERMAL] جاري تحميل الإعدادات المحفوظة...');

      const result = await ipc.invoke('thermal-printer-settings-get');
      if (!result.success || !result.settings) {
        return;
      }

      const settings = result.settings;
      if (doc.getElementById('thermalFontSize')) {
        doc.getElementById('thermalFontSize').value = settings.fontSize || 10;
      }
      if (doc.getElementById('thermalFontName')) {
        doc.getElementById('thermalFontName').value = settings.fontName || 'Courier New';
      }
      if (doc.getElementById('thermalCopies')) {
        doc.getElementById('thermalCopies').value = settings.copies || 1;
      }
      if (doc.getElementById('thermalColorPrint')) {
        doc.getElementById('thermalColorPrint').checked = settings.color || false;
      }
      if (doc.getElementById('thermalAutoFeed')) {
        doc.getElementById('thermalAutoFeed').checked = true;
      }
      if (doc.getElementById('thermalPaperWidth') && settings.paperWidth) {
        doc.getElementById('thermalPaperWidth').value = settings.paperWidth;
      }
      if (doc.getElementById('thermalPrinterName') && settings.printerName) {
        doc.getElementById('thermalPrinterName').value = settings.printerName;
      }

      logger.log('✅ [THERMAL] تم تحميل الإعدادات المحفوظة');
    } catch (error) {
      logger.error('⚠️ [THERMAL] تحذير عند تحميل الإعدادات:', error);
    }
  }

  async function handleSaveThermalPrinterSettings(event) {
    event.preventDefault();

    try {
      logger.log('🖨️ [THERMAL] جاري حفظ إعدادات الطابعة الحرارية...');
      const dialogUtils = getDialogUtils();
      dialogUtils.showLoading('جاري حفظ الإعدادات...');

      const settings = {
        fontName: doc.getElementById('thermalFontName').value || 'Courier New',
        fontSize: parseInt(doc.getElementById('thermalFontSize').value, 10) || 10,
        copies: parseInt(doc.getElementById('thermalCopies').value, 10) || 1,
        color: doc.getElementById('thermalColorPrint').checked,
        printerName: doc.getElementById('thermalPrinterName').value || null,
        paperWidth: parseInt(doc.getElementById('thermalPaperWidth').value, 10) || 80
      };

      const result = await ipc.invoke('thermal-printer-settings-update', settings);
      dialogUtils.hideLoading();

      if (result.success) {
        logger.log('✅ [THERMAL] تم حفظ الإعدادات بنجاح');
        dialogUtils.showSuccessToast('تم حفظ إعدادات الطابعة الحرارية بنجاح');
      } else {
        throw new Error(result.error || 'فشل في حفظ الإعدادات');
      }
    } catch (error) {
      const dialogUtils = getDialogUtils();
      dialogUtils.hideLoading();
      logger.error('❌ [THERMAL] خطأ في حفظ الإعدادات:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر حفظ إعدادات الطابعة الحرارية.'
      });
      dialogUtils.showError(`فشل في حفظ الإعدادات: ${friendly}`, 'خطأ في الحفظ');
    }
  }

  async function handleTestThermalPrint() {
    try {
      logger.log('🖨️ [THERMAL] بدء اختبار الطابعة الحرارية...');
      const dialogUtils = getDialogUtils();
      dialogUtils.showLoading('جاري إرسال نموذج الاختبار...');

      const settings = {
        fontName: doc.getElementById('thermalFontName').value || 'Courier New',
        fontSize: parseInt(doc.getElementById('thermalFontSize').value, 10) || 10,
        copies: 1,
        color: doc.getElementById('thermalColorPrint').checked,
        printerName: doc.getElementById('thermalPrinterName').value || null
      };

      const testData = {
        reconciliation: {
          id: 'TEST-001',
          cashier_name: 'عميل الاختبار',
          cashier_number: '001',
          accountant_name: 'محاسب الاختبار',
          reconciliation_date: new Date().toISOString(),
          system_sales: 1000,
          total_receipts: 1000,
          surplus_deficit: 0,
          status: 'اختبار'
        },
        bankReceipts: [{ amount: 500, date: new Date().toISOString(), note: 'مقبوضة بنكية اختبار' }],
        cashReceipts: [{ total_amount: 500, date: new Date().toISOString(), note: 'مقبوضة نقدية اختبار' }]
      };

      const result = await ipc.invoke('thermal-printer-print', testData, settings);
      dialogUtils.hideLoading();

      if (result.success) {
        logger.log('✅ [THERMAL] تم إرسال اختبار الطباعة بنجاح');
        dialogUtils.showSuccess('تم إرسال نموذج الاختبار إلى الطابعة الحرارية\nتحقق من الطابعة للتأكد من جودة الطباعة', 'اختبار الطباعة');
      } else {
        throw new Error(result.error || 'فشل في إرسال الاختبار');
      }
    } catch (error) {
      const dialogUtils = getDialogUtils();
      dialogUtils.hideLoading();
      logger.error('❌ [THERMAL] خطأ في اختبار الطابعة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تنفيذ اختبار الطابعة.'
      });
      dialogUtils.showError(`فشل في اختبار الطابعة: ${friendly}`, 'خطأ في الاختبار');
    }
  }

  return {
    initializeThermalPrinterSettings,
    loadAvailablePrinters,
    loadThermalPrinterSettings,
    handleSaveThermalPrinterSettings,
    handleTestThermalPrint
  };
}

module.exports = {
  createThermalPrinterSettingsHandlers
};
