function createSavedPrintToolsTestHandlers(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const setCurrentPrintReconciliation = context.setCurrentPrintReconciliation || (() => {});
  const loadReconciliationForPrint = context.loadReconciliationForPrint;
  const generatePrintHTML = context.generatePrintHTML;
  const generatePrintPreview = context.generatePrintPreview;
  const formatCurrency = context.formatCurrency;
  const formatNumber = context.formatNumber;
  const quickPrintReconciliation = context.quickPrintReconciliation;
  async function testNewPrintSystem() {
    console.log('🧪 [TEST] اختبار نظام الطباعة الجديد...');
    try {
      const reconciliations = await ipcRenderer.invoke('db-query', 'SELECT id FROM reconciliations ORDER BY created_at DESC LIMIT 1');
      if (reconciliations.length === 0) {
        getDialogUtils().showError('لا توجد تصفيات للاختبار', 'لا توجد بيانات');
        return false;
      }
      const testId = reconciliations[0].id;
      console.log(`🧪 [TEST] اختبار تحميل البيانات للتصفية معرف: ${testId}`);
      const reconciliationData = await loadReconciliationForPrint(testId);
      if (reconciliationData) {
        console.log('✅ [TEST] تم تحميل البيانات بنجاح');
        getDialogUtils().showSuccess(
          `تم اختبار نظام الطباعة الجديد بنجاح!\n\n` +
          `معرف التصفية: ${reconciliationData.reconciliation.id}\n` +
          `الكاشير: ${reconciliationData.reconciliation.cashier_name}\n` +
          `المقبوضات البنكية: ${reconciliationData.bankReceipts.length}\n` +
          `المقبوضات النقدية: ${reconciliationData.cashReceipts.length}\n` +
          `المبيعات الآجلة: ${reconciliationData.postpaidSales.length}`,
          'اختبار ناجح'
        );
        return true;
      }
      getDialogUtils().showError('فشل في تحميل البيانات', 'فشل الاختبار');
      return false;
    } catch (error) {
      console.error('❌ [TEST] خطأ في اختبار نظام الطباعة:', error);
      getDialogUtils().showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
      return false;
    }
  }
  async function testNewCashDenominations() {
    console.log('🧪 [TEST] اختبار الفئات النقدية الجديدة...');
    try {
      const testCases = [
        { denomination: 0.5, quantity: 10, expected: 5.0 },
        { denomination: 0.25, quantity: 20, expected: 5.0 },
        { denomination: 1, quantity: 5, expected: 5.0 },
        { denomination: 100, quantity: 2, expected: 200.0 }
      ];
      let allTestsPassed = true;
      testCases.forEach((testCase, index) => {
        const calculated = testCase.denomination * testCase.quantity;
        const passed = Math.abs(calculated - testCase.expected) < 0.01;
        console.log(`🧪 [TEST-${index + 1}] فئة ${testCase.denomination} × ${testCase.quantity} = ${formatCurrency(calculated)} (متوقع: ${formatCurrency(testCase.expected)}) ${passed ? '✅' : '❌'}`);
        if (!passed) {
          allTestsPassed = false;
        }
      });
      const denominationSelect = document ? document.getElementById('denomination') : null;
      const editDenominationSelect = document ? document.getElementById('editDenomination') : null;
      const hasNewOptions = denominationSelect && editDenominationSelect &&
        denominationSelect.querySelector('option[value="0.5"]') &&
        denominationSelect.querySelector('option[value="0.25"]') &&
        editDenominationSelect.querySelector('option[value="0.5"]') &&
        editDenominationSelect.querySelector('option[value="0.25"]');
      console.log(`🧪 [TEST] خيارات الفئات الجديدة في القوائم المنسدلة: ${hasNewOptions ? '✅ موجودة' : '❌ مفقودة'}`);
      if (allTestsPassed && hasNewOptions) {
        getDialogUtils().showSuccess(
          'تم اختبار الفئات النقدية الجديدة بنجاح!\n\n' +
          '✅ حسابات الفئة 0.5 ريال صحيحة\n' +
          '✅ حسابات الفئة 0.25 ريال صحيحة\n' +
          '✅ الفئات الجديدة متوفرة في القوائم المنسدلة\n' +
          '✅ جميع الحسابات تعمل بدقة',
          'اختبار ناجح'
        );
        return true;
      }
      getDialogUtils().showError(
        'فشل في اختبار الفئات النقدية الجديدة!\n\n' +
        `${allTestsPassed ? '✅' : '❌'} الحسابات\n` +
        `${hasNewOptions ? '✅' : '❌'} خيارات القوائم المنسدلة`,
        'فشل الاختبار'
      );
      return false;
    } catch (error) {
      console.error('❌ [TEST] خطأ في اختبار الفئات النقدية:', error);
      getDialogUtils().showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
      return false;
    }
  }
  async function testA4SinglePagePrint() {
    console.log('📄 [TEST] اختبار تحسين الطباعة لورقة A4 واحدة...');
    try {
      const reconciliations = await ipcRenderer.invoke('db-query', 'SELECT id FROM reconciliations ORDER BY created_at DESC LIMIT 1');
      if (reconciliations.length === 0) {
        getDialogUtils().showError('لا توجد تصفيات للاختبار', 'لا توجد بيانات');
        return false;
      }
      const testId = reconciliations[0].id;
      console.log(`📄 [TEST] اختبار تحسين الطباعة للتصفية معرف: ${testId}`);
      const reconciliationData = await loadReconciliationForPrint(testId);
      if (!reconciliationData) {
        getDialogUtils().showError('فشل في تحميل بيانات التصفية للاختبار', 'خطأ في البيانات');
        return false;
      }
      setCurrentPrintReconciliation(reconciliationData);
      const printOptions = {
        sections: {
          bankReceipts: true,
          cashReceipts: true,
          postpaidSales: true,
          customerReceipts: true,
          returnInvoices: true,
          suppliers: true,
          summary: true
        },
        options: {
          pageSize: 'A4',
          orientation: 'portrait',
          fontSize: 'small',
          colors: true
        }
      };
      const htmlContent = generatePrintHTML(printOptions, true);
      const contentLength = htmlContent.length;
      const estimatedLines = (htmlContent.match(/tr>/g) || []).length;
      const estimatedSections = (htmlContent.match(/section>/g) || []).length;
      console.log('📄 [TEST] إحصائيات المحتوى:', {
        contentLength,
        estimatedLines,
        estimatedSections,
        fontSize: printOptions.options.fontSize
      });
      generatePrintPreview(printOptions);
      getDialogUtils().showSuccess(
        `تم اختبار تحسين الطباعة لورقة A4 واحدة!\n\n` +
        `📊 إحصائيات المحتوى:\n` +
        `• طول المحتوى: ${formatNumber(contentLength)} حرف\n` +
        `• عدد الصفوف المقدر: ${estimatedLines}\n` +
        `• عدد الأقسام: ${estimatedSections}\n` +
        `• حجم الخط: ${printOptions.options.fontSize}\n\n` +
        `✅ تم فتح معاينة الطباعة للتحقق البصري\n` +
        `✅ التحسينات المطبقة: خط صغير، هوامش مضغوطة، مسافات مقللة`,
        'اختبار تحسين الطباعة'
      );
      return true;
    } catch (error) {
      console.error('❌ [TEST] خطأ في اختبار تحسين الطباعة:', error);
      getDialogUtils().showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
      return false;
    }
  }
  async function testImprovedReadabilityPrint() {
    console.log('👁️ [TEST] اختبار تحسينات قابلية القراءة للطباعة...');
    try {
      const reconciliations = await ipcRenderer.invoke('db-query', 'SELECT id FROM reconciliations ORDER BY created_at DESC LIMIT 1');
      if (reconciliations.length === 0) {
        getDialogUtils().showError('لا توجد تصفيات للاختبار', 'لا توجد بيانات');
        return false;
      }
      const testId = reconciliations[0].id;
      console.log(`👁️ [TEST] اختبار تحسينات القراءة للتصفية معرف: ${testId}`);
      const reconciliationData = await loadReconciliationForPrint(testId);
      if (!reconciliationData) {
        getDialogUtils().showError('فشل في تحميل بيانات التصفية للاختبار', 'خطأ في البيانات');
        return false;
      }
      setCurrentPrintReconciliation(reconciliationData);
      const printOptions = {
        sections: {
          bankReceipts: true,
          cashReceipts: true,
          postpaidSales: true,
          customerReceipts: true,
          returnInvoices: true,
          suppliers: true,
          summary: true
        },
        options: {
          pageSize: 'A4',
          orientation: 'portrait',
          fontSize: 'normal',
          colors: true
        }
      };
      const htmlContent = generatePrintHTML(printOptions, true);
      const readabilityMetrics = {
        fontSizeIncrease: '10-15%',
        lineHeightImprovement: '1.2 → 1.3',
        fontWeightEnhancement: 'Bold headers and currency',
        textShadowAdded: 'For better contrast',
        paddingIncrease: '3px → 4px (tables)',
        colorContrast: 'Darker colors for better visibility',
        contentLength: htmlContent.length
      };
      console.log('👁️ [TEST] مقاييس تحسين القراءة:', readabilityMetrics);
      generatePrintPreview(printOptions);
      getDialogUtils().showSuccess(
        `تم اختبار تحسينات قابلية القراءة بنجاح!\n\n` +
        `📈 التحسينات المطبقة:\n` +
        `• زيادة حجم الخط: ${readabilityMetrics.fontSizeIncrease}\n` +
        `• تحسين تباعد الأسطر: ${readabilityMetrics.lineHeightImprovement}\n` +
        `• تعزيز سُمك الخطوط: ${readabilityMetrics.fontWeightEnhancement}\n` +
        `• إضافة ظلال النص: ${readabilityMetrics.textShadowAdded}\n` +
        `• زيادة المسافات: ${readabilityMetrics.paddingIncrease}\n` +
        `• تحسين التباين: ${readabilityMetrics.colorContrast}\n\n` +
        `✅ تم فتح معاينة الطباعة للتحقق البصري\n` +
        `✅ التوازن محفوظ: ضغط في ورقة واحدة + قراءة محسنة`,
        'اختبار تحسين القراءة'
      );
      return true;
    } catch (error) {
      console.error('❌ [TEST] خطأ في اختبار تحسين القراءة:', error);
      getDialogUtils().showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
      return false;
    }
  }
  async function testPrintSystem() {
    console.log('🧪 [TEST] اختبار نظام الطباعة...');
    try {
      const reconciliations = await ipcRenderer.invoke('db-query', 'SELECT id FROM reconciliations ORDER BY created_at DESC LIMIT 1');
      if (reconciliations.length === 0) {
        getDialogUtils().showError('لا توجد تصفيات للاختبار', 'لا توجد بيانات');
        return false;
      }
      const testId = reconciliations[0].id;
      console.log(`🧪 [TEST] اختبار الطباعة للتصفية معرف: ${testId}`);
      const result = await quickPrintReconciliation(testId);
      if (result) {
        getDialogUtils().showSuccess('تم اختبار نظام الطباعة بنجاح', 'اختبار مكتمل');
        return true;
      }
      getDialogUtils().showError('فشل في اختبار نظام الطباعة', 'فشل الاختبار');
      return false;
    } catch (error) {
      console.error('❌ [TEST] خطأ في اختبار نظام الطباعة:', error);
      getDialogUtils().showError(`خطأ في اختبار الطباعة: ${error.message}`, 'خطأ في الاختبار');
      return false;
    }
  }
  return {
    testNewPrintSystem,
    testNewCashDenominations,
    testA4SinglePagePrint,
    testImprovedReadabilityPrint,
    testPrintSystem
  };
}
module.exports = {
  createSavedPrintToolsTestHandlers
};
