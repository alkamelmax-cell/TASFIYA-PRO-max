const { clearActiveFormulaSettingsInDocument } = require('./reconciliation-formula');
const { getSelectedFiscalYear } = require('./fiscal-year');

function createReconciliationStateControls(deps) {
  const doc = deps.document;
  const sessionStore = deps.sessionStorage;
  const getCurrentReconciliation = deps.getCurrentReconciliation;
  const getDataCounts = deps.getDataCounts;
  const logger = deps.logger || console;

  function updateButtonStates(context = 'GENERAL') {
    logger.log(`🔄 [BUTTON-STATE] تحديث حالة الأزرار - السياق: ${context}`);

    const createReconciliationBtn = doc.getElementById('createReconciliationBtn');
    const saveReconciliationBtn = doc.getElementById('saveReconciliationBtn');

    if (createReconciliationBtn) {
      createReconciliationBtn.disabled = false;
      createReconciliationBtn.textContent = 'إنشاء تصفية جديدة';
    }

    if (saveReconciliationBtn) {
      const currentReconciliation = getCurrentReconciliation();
      if (currentReconciliation && currentReconciliation.id) {
        saveReconciliationBtn.disabled = false;
        logger.log(`✅ [BUTTON-STATE] تم تفعيل زر الحفظ - ${context}`);
      } else {
        saveReconciliationBtn.disabled = true;
        logger.log(`❌ [BUTTON-STATE] تم تعطيل زر الحفظ - ${context}`);
      }
    }
  }

  function resetSystemToNewReconciliationState() {
    logger.log('🔄 [RESET] إعادة تهيئة النظام لتصفية جديدة...');

    try {
      clearActiveFormulaSettingsInDocument(doc);
      updateButtonStates('RESET');

      const statusElements = doc.querySelectorAll('.reconciliation-status');
      statusElements.forEach((element) => {
        element.textContent = '';
        element.className = 'reconciliation-status';
      });

      if (sessionStore) {
        sessionStore.removeItem('currentReconciliationData');
        sessionStore.removeItem('tempReconciliationData');
      }

      const forms = doc.querySelectorAll('form');
      forms.forEach((form) => {
        if (form.classList) {
          form.classList.remove('was-validated');
        }
        const invalidElements = form.querySelectorAll('.is-invalid');
        invalidElements.forEach((element) => {
          if (element.classList) {
            element.classList.remove('is-invalid');
          }
        });
      });

      const progressBars = doc.querySelectorAll('.progress-bar');
      progressBars.forEach((bar) => {
        bar.style.width = '0%';
        bar.setAttribute('aria-valuenow', '0');
      });

      logger.log('✅ [RESET] تم إعادة تهيئة النظام بنجاح');
    } catch (error) {
      logger.error('❌ [RESET] خطأ في إعادة تهيئة النظام:', error);
    }
  }

  function validateReconciliationBeforeSave() {
    logger.log('✅ [VALIDATE] فحص صحة بيانات التصفية قبل الحفظ...');
    const errors = [];
    const currentReconciliation = getCurrentReconciliation();

    if (!currentReconciliation) {
      errors.push('لا توجد تصفية حالية');
    }

    const cashierSelect = doc.getElementById('cashierSelect');
    const accountantSelect = doc.getElementById('accountantSelect');
    const reconciliationDate = doc.getElementById('reconciliationDate');

    if (!cashierSelect || !cashierSelect.value) {
      errors.push('يرجى اختيار الكاشير');
    }
    if (!accountantSelect || !accountantSelect.value) {
      errors.push('يرجى اختيار المحاسب');
    }
    if (!reconciliationDate || !reconciliationDate.value) {
      errors.push('يرجى تحديد تاريخ التصفية');
    }
    const selectedFiscalYear = getSelectedFiscalYear();
    if (selectedFiscalYear && reconciliationDate && reconciliationDate.value) {
      const dateYear = Number.parseInt(reconciliationDate.value.slice(0, 4), 10);
      if (Number.isFinite(dateYear) && dateYear !== selectedFiscalYear) {
        errors.push(`تاريخ التصفية خارج السنة المالية المختارة (${selectedFiscalYear})`);
      }
    }

    const counts = getDataCounts();
    const hasData =
      counts.bankReceipts > 0 ||
      counts.cashReceipts > 0 ||
      counts.postpaidSales > 0 ||
      counts.customerReceipts > 0 ||
      counts.returnInvoices > 0 ||
      counts.suppliers > 0;

    if (!hasData) {
      errors.push('لا توجد بيانات مقبوضات أو مبيعات للحفظ');
    }

    const systemSales = parseFloat(doc.getElementById('systemSales').value);
    if (Number.isNaN(systemSales) || systemSales < 0) {
      errors.push('يرجى إدخال مبيعات النظام بشكل صحيح');
    }

    logger.log('📋 [VALIDATE] نتائج الفحص:', {
      errorsCount: errors.length,
      errors,
      hasData,
      reconciliationExists: !!currentReconciliation
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  return {
    updateButtonStates,
    resetSystemToNewReconciliationState,
    validateReconciliationBeforeSave
  };
}

module.exports = {
  createReconciliationStateControls
};
