// ===================================================
// 🔄 معالج المودال - Modal Handler
// يتعامل مع فتح وإغلاق المودال بشكل صحيح
// ===================================================

/**
 * يقوم بإعداد وتهيئة مودال كشف الحساب
 * @param {string} customerName اسم العميل
 */
function setupStatementModal(customerName) {
  const modalEl = document.getElementById('customerStatementModal');
  if (!modalEl) return;

  // التأكد من عدم وجود نسخة سابقة من المودال
  const existingModal = bootstrap.Modal.getInstance(modalEl);
  if (existingModal) {
    existingModal.dispose();
  }

  // إنشاء مودال جديد
  const modal = new bootstrap.Modal(modalEl, {
    backdrop: 'static',
    keyboard: false
  });

  // إزالة المستمعين السابقين
  modalEl.removeEventListener('hidden.bs.modal', handleModalHidden);
  
  // إضافة مستمع جديد لحدث الإغلاق
  modalEl.addEventListener('hidden.bs.modal', handleModalHidden);

  // عرض المودال
  modal.show();
}

/**
 * معالجة إغلاق المودال وتنظيف الحقول
 */
function handleModalHidden() {
  // تنظيف الحقول
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

  // تحديث الجداول الرئيسية
  if (typeof loadCustomerLedger === 'function') {
    loadCustomerLedger();
  }

  // إزالة المستمع
  const modalEl = document.getElementById('customerStatementModal');
  if (modalEl) {
    modalEl.removeEventListener('hidden.bs.modal', handleModalHidden);
  }
}

/**
 * إغلاق المودال برمجياً
 */
function closeStatementModal() {
  const modalEl = document.getElementById('customerStatementModal');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) {
      modal.hide();
    }
  }
}

// تصدير الدوال
module.exports = {
  setupStatementModal,
  handleModalHidden,
  closeStatementModal
};