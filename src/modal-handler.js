// ===================================================
// 🔄 معالج المودال - Modal Handler
// يتعامل مع فتح وإغلاق المودال بشكل صحيح
// ===================================================

/**
 * يقوم بإعداد وتهيئة مودال كشف الحساب
 * @param {string} customerName اسم العميل
 */
function setupStatementModal(customerName) {
  void customerName;
  const modalEl = document.getElementById('customerStatementModal');
  if (!modalEl) return;

  // Keep modal at document root to avoid stacking-context issues.
  if (modalEl.parentElement !== document.body) {
    document.body.appendChild(modalEl);
  }

  if (!isBootstrapModalAvailable()) {
    modalEl.classList.add('show');
    modalEl.style.display = 'block';
    modalEl.removeAttribute('aria-hidden');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.setAttribute('role', 'dialog');
    return;
  }

  // تنظيف أي بقايا من مودال سابق لتجنب حجب الواجهة بدون داع
  cleanupModalArtifacts();

  const existingModal = bootstrap.Modal.getInstance(modalEl);
  if (existingModal) {
    existingModal.dispose();
  }

  const modal = new bootstrap.Modal(modalEl, {
    backdrop: true,
    keyboard: true,
    focus: true
  });

  modalEl.removeEventListener('hidden.bs.modal', handleModalHidden);
  modalEl.addEventListener('hidden.bs.modal', handleModalHidden);

  modal.show();
}

/**
 * معالجة إغلاق المودال وتنظيف الحقول
 */
function handleModalHidden() {
  const fields = {
    amount: document.getElementById('newTransactionAmount'),
    type: document.getElementById('newTransactionType'),
    reason: document.getElementById('newTransactionReason'),
    alert: document.getElementById('transactionAlert')
  };

  if (fields.amount) fields.amount.value = '';
  if (fields.type) fields.type.selectedIndex = 0;
  if (fields.reason) fields.reason.selectedIndex = 0;
  if (fields.alert) fields.alert.style.display = 'none';

  const refreshLedger = typeof window !== 'undefined' ? window.loadCustomerLedger : null;
  if (typeof refreshLedger === 'function') {
    refreshLedger();
  }

  const modalEl = document.getElementById('customerStatementModal');
  if (modalEl) {
    modalEl.removeEventListener('hidden.bs.modal', handleModalHidden);
  }

  cleanupModalArtifacts();
}

/**
 * إغلاق المودال برمجياً
 */
function closeStatementModal() {
  const modalEl = document.getElementById('customerStatementModal');
  if (!modalEl) return;

  if (isBootstrapModalAvailable()) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) {
      modal.hide();
      return;
    }
  }

  modalEl.classList.remove('show');
  modalEl.style.display = 'none';
  modalEl.setAttribute('aria-hidden', 'true');
  cleanupModalArtifacts();
}

function isBootstrapModalAvailable() {
  return typeof bootstrap !== 'undefined' && bootstrap && typeof bootstrap.Modal === 'function';
}

function cleanupModalArtifacts() {
  if (document.querySelector('.modal.show')) return;
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('padding-right');
  document.body.style.removeProperty('overflow');
}

// تصدير الدوال
module.exports = {
  setupStatementModal,
  handleModalHidden,
  closeStatementModal
};
