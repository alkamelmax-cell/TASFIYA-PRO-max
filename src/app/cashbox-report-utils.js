const { buildCashboxVoucherLabel } = require('./cashbox-voucher-utils');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function defaultFormatCurrency(value) {
  return toNumber(value, 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function defaultFormatDate(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '-';
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    return rawValue;
  }

  return date.toLocaleDateString('en-GB');
}

function getVoucherTypeLabel(voucherType) {
  return voucherType === 'receipt' ? 'سند قبض' : 'سند صرف';
}

function buildVoucherLabel(voucherType, voucherSequenceNumber, fallbackVoucherNumber = 0) {
  return buildCashboxVoucherLabel(voucherType, voucherSequenceNumber, fallbackVoucherNumber);
}

function getCounterpartyTypeLabel(counterpartyType) {
  if (counterpartyType === 'cashier') {
    return 'الكاشير';
  }
  if (counterpartyType === 'supplier') {
    return 'المورد';
  }
  return 'الطرف';
}

function buildAccountingStatement(voucher) {
  const counterpartyName = String(
    voucher?.counterparty_name || voucher?.cashier_name || ''
  ).trim() || 'طرف غير محدد';
  const counterpartyTypeLabel = getCounterpartyTypeLabel(voucher?.counterparty_type);
  const partyAccount = `ح/ ${counterpartyName} (${counterpartyTypeLabel})`;

  const isPayment = voucher?.voucher_type === 'payment';
  const mainLine = isPayment
    ? `إثبات صرف نقدي إلى ${partyAccount}`
    : `إثبات قبض نقدي من ${partyAccount}`;

  const rawDescription = String(voucher?.description || '').trim();
  const detailLine = rawDescription ? `بيان إضافي: ${rawDescription}` : '';

  return {
    mainLine,
    detailLine,
    plainText: detailLine ? `${mainLine} - ${detailLine}` : mainLine
  };
}

function normalizeMeta(meta) {
  if (!Array.isArray(meta)) {
    return [];
  }

  return meta
    .filter((item) => item && String(item.label || '').trim() && String(item.value || '').trim())
    .map((item) => ({
      label: String(item.label).trim(),
      value: String(item.value).trim()
    }));
}

function summarizeCashboxReport(options = {}) {
  const vouchers = Array.isArray(options.vouchers) ? options.vouchers : [];
  const openingBalance = toNumber(options.openingBalance, 0);

  let totalReceipts = 0;
  let totalPayments = 0;

  vouchers.forEach((voucher) => {
    const amount = Math.abs(toNumber(voucher?.amount, 0));
    if (voucher?.voucher_type === 'payment') {
      totalPayments += amount;
      return;
    }

    if (voucher?.voucher_type === 'receipt') {
      totalReceipts += amount;
    }
  });

  const netMovement = totalReceipts - totalPayments;

  return {
    vouchersCount: vouchers.length,
    openingBalance,
    totalReceipts,
    totalPayments,
    netMovement,
    closingBalance: openingBalance + netMovement
  };
}

function prepareCashboxReportExcelData(options = {}) {
  const vouchers = Array.isArray(options.vouchers) ? options.vouchers : [];
  const summary = {
    ...summarizeCashboxReport({
      vouchers,
      openingBalance: options.summary?.openingBalance
    }),
    ...options.summary
  };
  const meta = normalizeMeta(options.meta);

  const rows = vouchers.map((voucher) => ([
    buildVoucherLabel(voucher?.voucher_type, voucher?.voucher_sequence_number, voucher?.voucher_number),
    getVoucherTypeLabel(voucher?.voucher_type),
    voucher?.branch_name || 'غير محدد',
    voucher?.cashbox_name || 'غير محدد',
    voucher?.counterparty_name || voucher?.cashier_name || 'غير محدد',
    defaultFormatDate(voucher?.voucher_date),
    voucher?.reference_no || '-',
    buildAccountingStatement(voucher).plainText,
    Math.abs(toNumber(voucher?.amount, 0)),
    voucher?.created_by || 'غير معروف'
  ]));

  rows.push([]);
  rows.push(['عدد السندات', summary.vouchersCount]);
  rows.push(['الرصيد الافتتاحي', summary.openingBalance]);
  rows.push(['إجمالي القبض', summary.totalReceipts]);
  rows.push(['إجمالي الصرف', summary.totalPayments]);
  rows.push(['صافي الحركة', summary.netMovement]);
  rows.push(['الرصيد الناتج', summary.closingBalance]);

  meta.forEach((item) => {
    rows.push([item.label, item.value]);
  });

  return {
    headers: [
      'رقم السند',
      'النوع',
      'الفرع',
      'الصندوق',
      'الطرف',
      'التاريخ',
      'المرجع',
      'البيان',
      'المبلغ',
      'المنشئ'
    ],
    rows
  };
}

function buildCashboxReportHtml(options = {}) {
  const vouchers = Array.isArray(options.vouchers) ? options.vouchers : [];
  const meta = normalizeMeta(options.meta);
  const title = String(options.title || 'تقرير صناديق الفروع').trim();
  const companyName = String(options.companyName || 'تقرير النظام').trim();
  const reportDate = String(options.reportDate || defaultFormatDate(new Date().toISOString())).trim();
  const formatCurrency = typeof options.formatCurrency === 'function' ? options.formatCurrency : defaultFormatCurrency;
  const formatDate = typeof options.formatDate === 'function' ? options.formatDate : defaultFormatDate;
  const summary = {
    ...summarizeCashboxReport({
      vouchers,
      openingBalance: options.summary?.openingBalance
    }),
    ...options.summary
  };

  const orderedVouchers = [...vouchers].sort((left, right) => {
    const leftDate = String(left?.voucher_date || '').trim();
    const rightDate = String(right?.voucher_date || '').trim();
    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate);
    }

    const leftNumber = toNumber(left?.voucher_number, 0);
    const rightNumber = toNumber(right?.voucher_number, 0);
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return toNumber(left?.id, 0) - toNumber(right?.id, 0);
  });

  const openingBalance = toNumber(summary.openingBalance, 0);
  const openingDebit = openingBalance < 0 ? Math.abs(openingBalance) : 0;
  const openingCredit = openingBalance >= 0 ? openingBalance : 0;
  const closingBalance = toNumber(summary.closingBalance, 0);
  const closingDebit = closingBalance < 0 ? Math.abs(closingBalance) : 0;
  const closingCredit = closingBalance >= 0 ? closingBalance : 0;

  const openingRow = `
    <tr class="opening-row">
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>قيد افتتاحي: رصيد أول المدة للصندوق</td>
      <td>-</td>
      <td class="amount-cell">${openingDebit > 0 ? escapeHtml(formatCurrency(openingDebit)) : ''}</td>
      <td class="amount-cell">${openingCredit > 0 ? escapeHtml(formatCurrency(openingCredit)) : ''}</td>
      <td class="amount-cell">${escapeHtml(formatCurrency(openingBalance))}</td>
    </tr>
  `;

  let runningBalance = openingBalance;
  const movementRows = orderedVouchers.length > 0
    ? orderedVouchers.map((voucher) => {
      const amount = Math.abs(toNumber(voucher?.amount, 0));
      const isPayment = voucher?.voucher_type === 'payment';
      const debit = isPayment ? amount : 0;
      const credit = isPayment ? 0 : amount;
      runningBalance += (credit - debit);
      const statement = buildAccountingStatement(voucher);

      return `
        <tr>
          <td>${escapeHtml(formatDate(voucher?.voucher_date))}</td>
          <td>${escapeHtml(getVoucherTypeLabel(voucher?.voucher_type))}</td>
          <td>${escapeHtml(buildVoucherLabel(voucher?.voucher_type, voucher?.voucher_sequence_number, voucher?.voucher_number))}</td>
          <td class="statement-cell">
            <div class="statement-main">${escapeHtml(statement.mainLine)}</div>
            ${statement.detailLine ? `<div class="statement-detail">${escapeHtml(statement.detailLine)}</div>` : ''}
          </td>
          <td>${escapeHtml(voucher?.reference_no || '-')}</td>
          <td class="amount-cell">${debit > 0 ? escapeHtml(formatCurrency(debit)) : ''}</td>
          <td class="amount-cell">${credit > 0 ? escapeHtml(formatCurrency(credit)) : ''}</td>
          <td class="amount-cell">${escapeHtml(formatCurrency(runningBalance))}</td>
        </tr>
      `;
    }).join('')
    : `
      <tr>
        <td colspan="8" class="empty-row">لا توجد سندات مطابقة للفلاتر الحالية</td>
      </tr>
    `;

  const totalsRows = `
    <tr class="totals-row">
      <td colspan="5">إجمالي الحركات</td>
      <td class="amount-cell">${escapeHtml(formatCurrency(Math.abs(toNumber(summary.totalPayments, 0))))}</td>
      <td class="amount-cell">${escapeHtml(formatCurrency(Math.abs(toNumber(summary.totalReceipts, 0))))}</td>
      <td class="amount-cell">${escapeHtml(formatCurrency(closingBalance))}</td>
    </tr>
    <tr class="closing-row">
      <td colspan="5">الرصيد الختامي</td>
      <td class="amount-cell">${closingDebit > 0 ? escapeHtml(formatCurrency(closingDebit)) : ''}</td>
      <td class="amount-cell">${closingCredit > 0 ? escapeHtml(formatCurrency(closingCredit)) : ''}</td>
      <td class="amount-cell">${escapeHtml(formatCurrency(closingBalance))}</td>
    </tr>
  `;

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(title)} - ${escapeHtml(companyName)}</title>
      <style>
        body {
          font-family: "Cairo", sans-serif;
          margin: 20px;
          color: #0b1f35;
          background: #fff;
        }
        .report-header {
          margin-bottom: 14px;
          text-align: center;
        }
        .report-header .company-name {
          font-weight: 700;
          font-size: 17px;
          margin-bottom: 6px;
        }
        .report-header h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
        }
        .report-meta {
          margin-top: 8px;
          font-size: 12px;
          color: #334155;
          display: flex;
          justify-content: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        table {
          width: 100%;
          direction: rtl;
          border-collapse: collapse;
          font-size: 13px;
          border: 1px solid #738aa3;
        }
        th, td {
          border: 1px solid #738aa3;
          padding: 8px 10px;
          text-align: center;
          vertical-align: top;
        }
        th {
          background: #b6cfe8;
          font-weight: 700;
        }
        .amount-cell {
          font-weight: 700;
          white-space: nowrap;
        }
        .statement-cell {
          text-align: right;
          line-height: 1.6;
        }
        .statement-main {
          font-weight: 700;
          color: #102a43;
        }
        .statement-detail {
          margin-top: 2px;
          font-size: 12px;
          color: #475569;
        }
        .opening-row td {
          color: #b42318;
          font-weight: 700;
        }
        .totals-row td,
        .closing-row td {
          background: #f1f5f9;
          font-weight: 700;
        }
        .empty-row {
          text-align: center;
          color: #64748b;
          padding: 18px;
        }
        @media print {
          body {
            margin: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="report-header">
        <div class="company-name">${escapeHtml(companyName)}</div>
        <h1>${escapeHtml(title)}</h1>
        <div class="report-meta">
          <span>تاريخ التقرير: ${escapeHtml(reportDate)}</span>
          ${meta.map((item) => `<span>${escapeHtml(item.label)}: ${escapeHtml(item.value)}</span>`).join('')}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th rowspan="2">التاريخ</th>
            <th rowspan="2">نوع السند</th>
            <th rowspan="2">رقم السند</th>
            <th rowspan="2">البيان</th>
            <th rowspan="2">رقم المرجع</th>
            <th colspan="2">المبلغ</th>
            <th rowspan="2">الرصيد</th>
          </tr>
          <tr>
            <th>مدين</th>
            <th>دائن</th>
          </tr>
        </thead>
        <tbody>
          ${openingRow}
          ${movementRows}
          ${totalsRows}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

module.exports = {
  summarizeCashboxReport,
  prepareCashboxReportExcelData,
  buildCashboxReportHtml
};
