// ...نفس المحتوى السابق...

async function showCustomerStatement(customerName) {
  try {
    const name = (customerName || '').trim();
    if (!name) return;

    // جلب فلاتر التاريخ من أعلى دفتر العملاء
    const filters = getLedgerFilters();
    const dateFilter = buildDateFilter(filters);
    const params = [name];

    // استعلام المبيعات الآجلة - تم إزالة شرط حالة التصفية
    const sqlPost = `
      SELECT 
        ps.amount AS amount,
        'postpaid' AS type,
        r.reconciliation_date AS tx_date,
        ps.created_at AS created_at,
        r.reconciliation_number AS rec_no,
        ps.notes AS reason
      FROM postpaid_sales ps
      LEFT JOIN reconciliations r ON r.id = ps.reconciliation_id
      WHERE ps.customer_name = ?
      ${dateFilter.sql}
    `;

    // استعلام المقبوضات - تم إزالة شرط حالة التصفية
    const sqlRec = `
      SELECT 
        cr.amount AS amount,
        'receipt' AS type,
        r.reconciliation_date AS tx_date,
        cr.created_at AS created_at,
        r.reconciliation_number AS rec_no,
        cr.notes AS reason
      FROM customer_receipts cr
      LEFT JOIN reconciliations r ON r.id = cr.reconciliation_id
      WHERE cr.customer_name = ?
      ${dateFilter.sql}
    `;

    // تنفيذ الاستعلامات
    const postTx = await ledgerIpc.invoke('db-query', sqlPost, [...params, ...dateFilter.params]) || [];
    const recTx = await ledgerIpc.invoke('db-query', sqlRec, [...params, ...dateFilter.params]) || [];

    // دمج وترتيب النتائج
    const allTx = [...postTx, ...recTx].sort((a, b) => {
      const ad = new Date(a.created_at || a.tx_date || '');
      const bd = new Date(b.created_at || b.tx_date || '');
      return ad - bd;
    });

    // ...باقي الكود كما هو...

    // حساب الإجماليات والرصيد
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
      const reasonText = t.reason || '-';
      const amt = fmt(t.amount || 0);
      const bal = fmt(running);
      const recNo = t.rec_no != null ? `#${t.rec_no}` : '-';
      const d = t.tx_date || t.created_at?.split('T')[0] || '';
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

    // تحديث العناوين والإجماليات
    const mTitle = document.getElementById('customerStatementTitle');
    if (mTitle) mTitle.textContent = `كشف حساب - ${name}`;

    const sPost = document.getElementById('statementTotalPostpaid');
    const sRec = document.getElementById('statementTotalReceipts');
    const sBal = document.getElementById('statementBalance');
    if (sPost) sPost.textContent = fmt(totalPost);
    if (sRec) sRec.textContent = fmt(totalRec);
    if (sBal) sBal.textContent = fmt(balance);

    // تحديث جدول الحركات
    const tbody = document.getElementById('customerStatementTable');
    if (tbody) tbody.innerHTML = rowsHtml || `<tr><td colspan="6" class="text-center">لا توجد حركات</td></tr>`;

    // إعداد أزرار الإضافة والطباعة
    setupStatementEvents(name);

    // عرض النافذة
    const modalEl = document.getElementById('customerStatementModal');
    if (modalEl && window.bootstrap?.Modal) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  } catch (error) {
    console.error('Error showing customer statement:', error);
    showTransactionAlert('حدث خطأ أثناء عرض كشف الحساب: ' + error.message, 'danger');
  }
}