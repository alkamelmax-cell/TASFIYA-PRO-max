function createEditSessionDataHelpers(deps) {
  const document = deps.document;
  const getEditMode = deps.getEditMode;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const logger = deps.logger || console;

  function getMode() {
    return getEditMode() || {};
  }

  function getCurrentEditData(type, index) {
    const mode = getMode();
    if (!mode.originalData || !mode.originalData[type]) {
      logger.error('❌ [GET-DATA] البيانات غير متوفرة:', type);
      return null;
    }

    if (index < 0 || index >= mode.originalData[type].length) {
      logger.error('❌ [GET-DATA] فهرس غير صحيح:', index, 'للنوع:', type);
      return null;
    }

    return mode.originalData[type][index];
  }

  function deleteItemFromEditData(type, index) {
    const mode = getMode();
    if (!mode.originalData || !mode.originalData[type]) {
      logger.error('❌ [DELETE-DATA] البيانات غير متوفرة:', type);
      return;
    }

    if (index < 0 || index >= mode.originalData[type].length) {
      logger.error('❌ [DELETE-DATA] فهرس غير صحيح:', index, 'للنوع:', type);
      return;
    }

    mode.originalData[type].splice(index, 1);
    logger.log('✅ [DELETE-DATA] تم حذف العنصر:', index, 'من:', type);
  }

  function addOrUpdateEditData(type, data, index = null) {
    const mode = getMode();
    if (!mode.originalData) {
      logger.error('❌ [ADD-UPDATE-DATA] البيانات غير متوفرة');
      return;
    }

    if (!mode.originalData[type]) {
      mode.originalData[type] = [];
    }

    if (index !== null && index >= 0 && index < mode.originalData[type].length) {
      const existingData = mode.originalData[type][index] || {};
      mode.originalData[type][index] = {
        ...existingData,
        ...data
      };
      logger.log('✅ [UPDATE-DATA] تم تحديث العنصر:', index, 'في:', type);
      return;
    }

    mode.originalData[type].push(data);
    logger.log('✅ [ADD-DATA] تم إضافة عنصر جديد إلى:', type);
  }

  function updateEditProgress() {
    const mode = getMode();
    if (!mode.originalData) return;

    const sections = [
      'bankReceipts',
      'cashReceipts',
      'postpaidSales',
      'customerReceipts',
      'returnInvoices',
      'suppliers'
    ];

    let completedSections = 0;
    sections.forEach((section) => {
      if (mode.originalData[section] && mode.originalData[section].length > 0) {
        completedSections++;
      }
    });

    const progressBadge = document.getElementById('editProgressBadge');
    if (!progressBadge) return;

    progressBadge.textContent = `${completedSections}/6 مكتمل`;
    progressBadge.classList.remove('bg-secondary', 'bg-warning', 'bg-success');

    if (completedSections === 0) {
      progressBadge.classList.add('bg-secondary');
      return;
    }

    if (completedSections < 6) {
      progressBadge.classList.add('bg-warning');
      return;
    }

    progressBadge.classList.add('bg-success');
  }

  function addSuccessHighlight(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.classList.add('table-success');
    setTimeoutFn(() => {
      element.classList.remove('table-success');
    }, 2000);
  }

  function setButtonLoading(button, loading) {
    if (!button) return;

    if (loading) {
      button.disabled = true;
      button.dataset.originalText = button.innerHTML;
      button.innerHTML = '<span class="edit-loading"></span> جاري المعالجة...';
      return;
    }

    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  return {
    getCurrentEditData,
    deleteItemFromEditData,
    addOrUpdateEditData,
    updateEditProgress,
    addSuccessHighlight,
    setButtonLoading
  };
}

module.exports = {
  createEditSessionDataHelpers
};
