// ===================================================
// 📘 واجهة دفتر العملاء مع دعم الحركات اليدوية
// ===================================================

const ledgerIpc = require('electron').ipcRenderer;
const modalHandler = require('./modal-handler');
const { translateReason } = require('./reason-translator');

async function showCustomerStatement(customerName) {
  try {
    const name = (customerName || '').trim();
    if (!name) return;

    // الحصول على الحركات من التصفيات
    const sqlPost = `
      SELECT ps.amount AS amount, 'postpaid' AS type, r.reconciliation_date AS tx_date,
             ps.created_at AS created_at, r.reconciliation_number AS rec_no, '' AS reason
      FROM postpaid_sales ps
      JOIN reconciliations r ON r.id = ps.reconciliation_id
      WHERE r.status='completed' AND ps.customer_name = ?
    `;

    const sqlRec = `
      SELECT cr.amount AS amount, 'receipt' AS type, r.reconciliation_date AS tx_date,
             cr.created_at AS created_at, r.reconciliation_number AS rec_no, '' AS reason
      FROM customer_receipts cr
      JOIN reconciliations r ON r.id = cr.reconciliation_id
      WHERE r.status='completed' AND cr.customer_name = ?
    `;

    // الحصول على الحركات اليدوية
    const sqlManualPost = `
      SELECT amount, 'postpaid' as type, created_at as tx_date, 
             created_at, 'يدوي' as rec_no, reason 
      FROM manual_postpaid_sales 
      WHERE customer_name = ?
    `;

    const sqlManualRec = `
      SELECT amount, 'receipt' as type, created_at as tx_date,
             created_at, 'يدوي' as rec_no, reason
      FROM manual_customer_receipts 
      WHERE customer_name = ?
    `;

    // تنفيذ الاستعلامات
    const postTx = await ledgerIpc.invoke('db-query', sqlPost, [name]) || [];
    const recTx = await ledgerIpc.invoke('db-query', sqlRec, [name]) || [];
    const manualPostTx = await ledgerIpc.invoke('db-query', sqlManualPost, [name]) || [];
    const manualRecTx = await ledgerIpc.invoke('db-query', sqlManualRec, [name]) || [];

    // دمج جميع الحركات
    const allTx = [...postTx, ...recTx, ...manualPostTx, ...manualRecTx].sort((a, b) => {
      const ad = (a.tx_date || '').localeCompare(b.tx_date || '');
      if (ad !== 0) return ad;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    // حساب الإجماليات
    let running = 0;
    let totalPost = 0;
    let totalRec = 0;
    const fmt = getCurrencyFormatter();

    const rowsHtml = allTx.map(t => {
      if (t.type === 'postpaid') {
        running += Number(t.amount || 0);
        totalPost += Number(t.amount || 0);
      } else {
        running -= Number(t.amount || 0);
        totalRec += Number(t.amount || 0);
      }

      const kind = t.type === 'postpaid' ? 'مبيعات آجلة' : 'مقبوض عميل';
      const reasonText = translateReason(t.reason);
      const amt = fmt(t.amount || 0);
      const bal = fmt(running);
      const recNo = t.rec_no || '-';
      const d = t.tx_date || '';

      return `
        <tr>
          <td>${escapeHtml(d)}</td>
          <td>${escapeHtml(kind)}</td>
          <td>${escapeHtml(reasonText)}</td>
          <td>${escapeHtml(recNo)}</td>
          <td class="text-currency ${t.type === 'postpaid' ? 'text-deficit' : 'text-success'}">${amt}</td>
          <td class="text-currency fw-bold">${bal}</td>
        </tr>
      `;
    }).join('');

    const balance = totalPost - totalRec;

    // تحديث الواجهة
    const mTitle = document.getElementById('customerStatementTitle');
    if (mTitle) mTitle.textContent = `كشف حساب - ${name}`;

    const sPost = document.getElementById('statementTotalPostpaid');
    const sRec = document.getElementById('statementTotalReceipts');
    const sBal = document.getElementById('statementBalance');
    if (sPost) sPost.textContent = fmt(totalPost);
    if (sRec) sRec.textContent = fmt(totalRec);
    if (sBal) sBal.textContent = fmt(balance);

    const tbody = document.getElementById('customerStatementTable');
    if (tbody) tbody.innerHTML = rowsHtml || `<tr><td colspan="6" class="text-center">لا توجد حركات</td></tr>`;

    // إعداد أحداث الإضافة والطباعة
    setupStatementEvents(name);

    // عرض المودال
    modalHandler.setupStatementModal(customerName);
  } catch (error) {
    console.error('Error showing customer statement:', error);
  }
}

async function addNewTransaction(customerName) {
  try {
    const type = document.getElementById('newTransactionType').value;
    const amount = parseFloat(document.getElementById('newTransactionAmount').value) || 0;
    const reason = document.getElementById('newTransactionReason').value;
    
    if (!customerName || !type || amount <= 0) {
      showTransactionAlert('الرجاء ملء الحقول المطلوبة بشكل صحيح', 'danger');
      return;
    }
    
    // إضافة حركة يدوية إلى قاعدة البيانات
    const result = await ledgerIpc.invoke('add-manual-transaction', {
      customerName,
      type,
      amount,
      reason,
      date: new Date().toISOString()
    });
    
    if (result && result.success) {
      // إعادة تحميل كشف الحساب
      showCustomerStatement(customerName);
      showTransactionAlert('تمت إضافة الحركة بنجاح', 'success');
      
      // إغلاق المودال بعد ثانيتين
      setTimeout(() => {
        modalHandler.closeStatementModal();
      }, 2000);
    } else {
      showTransactionAlert('فشلت عملية إضافة الحركة: ' + (result?.error || 'خطأ غير معروف'), 'danger');
    }
  } catch (error) {
    console.error('Error adding transaction:', error);
    showTransactionAlert('حدث خطأ أثناء إضافة الحركة: ' + error.message, 'danger');
  }
}

function setupStatementEvents(customerName) {
  const addBtn = document.getElementById('addTransactionBtn');
  if (addBtn) {
    addBtn.replaceWith(addBtn.cloneNode(true));
    const newAddBtn = document.getElementById('addTransactionBtn');
    newAddBtn.addEventListener('click', () => addNewTransaction(customerName));
  }

  const printBtn = document.getElementById('printStatementBtn');
  if (printBtn) {
    printBtn.replaceWith(printBtn.cloneNode(true));
    const newPrintBtn = document.getElementById('printStatementBtn');
    newPrintBtn.addEventListener('click', () => printCustomerStatement(customerName));
  }
}

function showTransactionAlert(message, type) {
  const alertEl = document.getElementById('transactionAlert');
  if (alertEl) {
    alertEl.className = `alert alert-${type}`;
    alertEl.textContent = message;
    alertEl.style.display = 'block';
    
    setTimeout(() => {
      alertEl.style.display = 'none';
    }, 5000);
  }
}

// Helper function to get currency formatter
function getCurrencyFormatter() {
  if (typeof window.formatCurrency === 'function') return window.formatCurrency;
  return function(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '0.00';
    try {
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
    } catch {
      return Number(amount).toFixed(2);
    }
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  showCustomerStatement,
  addNewTransaction,
  setupStatementEvents
};