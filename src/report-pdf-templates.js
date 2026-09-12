const crypto = require('crypto');

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toFiniteNumber(value, fallback = 0) {
    const parsed = typeof value === 'number'
        ? value
        : Number.parseFloat(String(value == null ? '' : value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatAmount(value) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(toFiniteNumber(value));
}

function formatQuantity(value) {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2
    }).format(toFiniteNumber(value));
}

function formatDisplayDate(value) {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Riyadh'
    }).format(date);
}

function formatDisplayDateTime(value) {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Riyadh'
    }).format(date);
}

function dateForFile(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) {
        const match = String(value || '').match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/);
        return match ? match[0].replace(/\//g, '-') : new Date().toISOString().slice(0, 10);
    }
    return new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Riyadh'
    }).format(date);
}

function sanitizeFilePart(value, fallback = 'report') {
    const cleaned = String(value || fallback)
        .normalize('NFKC')
        .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
    return cleaned || fallback;
}

function sanitizeAsciiHeaderFileName(value, fallback = 'report') {
    const cleaned = String(value || fallback)
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]+/g, ' ')
        .replace(/[\\/:*?"<>|;\r\n]+/g, ' ')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
    return cleaned || fallback;
}

function encodeContentDispositionValue(value) {
    return encodeURIComponent(value)
        .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/\*/g, '%2A');
}

function buildArabicPdfFileName(prefix, name, dateValue, fallbackId = '') {
    const parts = [
        sanitizeFilePart(prefix, 'tasfiya'),
        sanitizeFilePart(name, 'report'),
        dateForFile(dateValue)
    ];
    if (fallbackId) parts.push(sanitizeFilePart(fallbackId, 'id'));
    return `${parts.filter(Boolean).join('-')}.pdf`;
}

function buildPdfContentDisposition(disposition, fileName, fallbackFileName = 'report.pdf') {
    const safeDisposition = disposition === 'attachment' ? 'attachment' : 'inline';
    const asciiFallback = sanitizeAsciiHeaderFileName(fallbackFileName.replace(/\.pdf$/i, ''), 'report') + '.pdf';
    return `${safeDisposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeContentDispositionValue(fileName)}`;
}

function createPdfEtag(buffer) {
    return `"${crypto.createHash('sha256').update(buffer).digest('base64url')}"`;
}

function sumRows(rows, key) {
    return (rows || []).reduce((sum, row) => sum + toFiniteNumber(row && row[key]), 0);
}

function tableRows(rows, columns, emptyText = 'لا توجد بيانات') {
    if (!rows || rows.length === 0) {
        return `<tr><td class="empty" colspan="${columns.length}">${escapeHtml(emptyText)}</td></tr>`;
    }

    return rows.map((row, index) => `
        <tr>
            ${columns.map((column) => `<td class="${column.className || ''}">${column.render(row, index)}</td>`).join('')}
        </tr>
    `).join('');
}

function section(title, content) {
    return `
        <section class="report-section">
            <h2>${escapeHtml(title)}</h2>
            ${content}
        </section>
    `;
}

function amountClass(value) {
    const numeric = toFiniteNumber(value);
    if (numeric > 0) return 'positive';
    if (numeric < 0) return 'negative';
    return 'neutral';
}

function statusFromSurplusDeficit(value) {
    const numeric = toFiniteNumber(value);
    if (numeric > 0) {
        return {
            label: 'فائض',
            value: `فائض ${formatAmount(numeric)}`,
            className: 'positive'
        };
    }
    if (numeric < 0) {
        return {
            label: 'عجز',
            value: `عجز ${formatAmount(Math.abs(numeric))}`,
            className: 'negative'
        };
    }
    return {
        label: 'متوازن',
        value: 'متوازن 0.00',
        className: 'neutral'
    };
}

function baseReportHtml(title, header, summaryCards, bodySections) {
    const generatedAt = new Date();
    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
        @page { size: A4; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            direction: rtl;
            color: #17313c;
            background: #ffffff;
            font-family: Arial, Tahoma, "Segoe UI", sans-serif;
            font-size: 10px;
            line-height: 1.45;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .page {
            width: 100%;
            min-height: 100%;
            padding: 0;
        }
        .topbar {
            display: grid;
            grid-template-columns: 1fr 1.6fr 1fr;
            gap: 10px;
            align-items: start;
            padding-bottom: 7px;
            border-bottom: 2px solid #37c7bd;
            margin-bottom: 9px;
        }
        .brand {
            text-align: right;
            color: #1b5962;
            font-weight: 800;
        }
        .brand .name {
            font-size: 14px;
            color: #0b4f5d;
        }
        .brand .sub {
            color: #7a8f93;
            font-size: 8px;
            margin-top: 1px;
        }
        .report-title {
            text-align: center;
            font-size: 16px;
            color: #0b4f5d;
            font-weight: 900;
            margin-top: 2px;
        }
        .meta {
            display: grid;
            gap: 3px;
            text-align: left;
            color: #1d3d49;
            font-weight: 700;
        }
        .meta span {
            display: block;
            color: #667b80;
            font-size: 8px;
            font-weight: 700;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
            margin-bottom: 8px;
        }
        .info-box, .metric-card {
            border: 1px solid #d8eeee;
            background: #f5fbfb;
            border-radius: 3px;
            padding: 7px 8px;
            min-height: 40px;
        }
        .label {
            display: block;
            color: #668286;
            font-size: 8px;
            font-weight: 700;
            margin-bottom: 3px;
        }
        .value {
            color: #17313c;
            font-weight: 900;
            overflow-wrap: anywhere;
        }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
            margin: 8px 0 11px;
        }
        .metric-card {
            text-align: center;
        }
        .metric-card .value {
            direction: ltr;
            font-family: "Segoe UI", Arial, sans-serif;
            font-size: 14px;
            letter-spacing: 0;
        }
        .positive { color: #079c5f; }
        .negative { color: #d84c5b; }
        .neutral { color: #17313c; }
        .report-section {
            margin: 0 0 10px;
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .report-section h2 {
            margin: 0 0 4px;
            padding-right: 6px;
            color: #0b4f5d;
            font-size: 11px;
            font-weight: 900;
            border-right: 3px solid #37c7bd;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            background: #ffffff;
            border: 1px solid #dfe9ea;
            margin: 0;
        }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        th {
            background: #123c4f;
            color: #ffffff;
            padding: 5px 4px;
            font-size: 8.5px;
            font-weight: 900;
            text-align: center;
        }
        td {
            padding: 4px;
            border-bottom: 1px solid #e8eeee;
            color: #17313c;
            text-align: center;
            vertical-align: middle;
            overflow-wrap: anywhere;
        }
        tbody tr:nth-child(even) td { background: #f8fbfb; }
        tfoot td, .total-row td {
            background: #ecfbf7 !important;
            color: #07845a;
            font-weight: 900;
        }
        .amount {
            direction: ltr;
            font-family: "Segoe UI", Arial, sans-serif;
            font-weight: 900;
            text-align: center;
        }
        .empty {
            color: #7b8d91;
            padding: 10px 4px;
            text-align: center;
        }
        .notes {
            border: 1px solid #e1eeee;
            background: #fbfefe;
            border-right: 3px solid #37c7bd;
            color: #415c62;
            padding: 7px;
            border-radius: 3px;
        }
        .footer {
            margin-top: 10px;
            padding-top: 6px;
            border-top: 1px solid #dfe9ea;
            color: #7b8d91;
            font-size: 7.5px;
            display: flex;
            justify-content: space-between;
            gap: 10px;
        }
    </style>
</head>
<body>
    <main class="page">
        <header class="topbar">
            <div class="brand">
                <div class="name">تصفية برو</div>
                <div class="sub">Tasfiya Pro</div>
            </div>
            <div class="report-title">${escapeHtml(title)}</div>
            <div class="meta">
                <div><span>تاريخ الإصدار</span>${formatDisplayDateTime(generatedAt)}</div>
            </div>
        </header>
        ${header}
        ${summaryCards}
        ${bodySections}
        <footer class="footer">
            <span>© 2025 محمد أمين الكامل - جميع الحقوق محفوظة - تصفية برو - Tasfiya Pro</span>
            <span>تم إنشاء التقرير بواسطة نظام تصفية برو</span>
        </footer>
    </main>
</body>
</html>`;
}

function infoGrid(items) {
    return `<div class="info-grid">${items.map((item) => `
        <div class="info-box">
            <span class="label">${escapeHtml(item.label)}</span>
            <div class="value">${escapeHtml(item.value || '-')}</div>
        </div>
    `).join('')}</div>`;
}

function metricGrid(cards) {
    return `<div class="metric-grid">${cards.map((card) => `
        <div class="metric-card">
            <span class="label">${escapeHtml(card.label)}</span>
            <div class="value ${card.className || ''}">${escapeHtml(card.value)}</div>
        </div>
    `).join('')}</div>`;
}

function buildReconciliationReportHtml(data) {
    const summary = data.summary || {};
    const cashReceipts = data.cashReceipts || [];
    const bankReceipts = data.bankReceipts || [];
    const postpaidSales = data.postpaidSales || [];
    const customerReceipts = data.customerReceipts || [];
    const returnInvoices = data.returnInvoices || [];
    const suppliers = data.suppliers || [];
    const reportDate = data.reconciliationDateRaw || data.reconciliationDate;
    const reconciliationStatus = statusFromSurplusDeficit(summary.surplusDeficit);

    const header = infoGrid([
        { label: 'رقم التصفية', value: `#${data.reconciliationId || '-'}` },
        { label: 'التاريخ', value: data.reconciliationDate || formatDisplayDate(reportDate) },
        { label: 'الكاشير', value: `${data.cashierName || '-'}${data.cashierNumber ? ` - ${data.cashierNumber}` : ''}` },
        { label: 'المحاسب', value: data.accountantName || '-' },
        { label: 'الفرع', value: data.reconciliation?.branch_name || data.branchName || '-' },
        { label: 'النطاق الزمني', value: data.timeRangeStart || data.timeRangeEnd ? `${data.timeRangeStart || '-'} إلى ${data.timeRangeEnd || '-'}` : '-' },
        { label: 'حسابات العملاء', value: `${postpaidSales.length + customerReceipts.length} حركة` },
        { label: 'حالة التقرير', value: 'مكتمل' }
    ]);

    const cards = metricGrid([
        { label: 'مبيعات النظام', value: formatAmount(summary.systemSales), className: amountClass(summary.systemSales) },
        { label: 'إجمالي المقبوضات', value: formatAmount(summary.totalReceipts), className: 'positive' },
        { label: 'العجز/الفائض', value: formatAmount(summary.surplusDeficit), className: amountClass(summary.surplusDeficit) },
        { label: 'النقدية', value: formatAmount(summary.cashTotal), className: 'positive' },
        { label: 'الشبكة والبنك', value: formatAmount(summary.bankTotal), className: 'positive' },
        { label: 'الحالة', value: reconciliationStatus.value, className: reconciliationStatus.className }
    ]);

    const bankSection = section('المقبوضات البنكية', `
        <table>
            <thead><tr><th>العملية</th><th>الجهاز</th><th>البنك</th><th>المبلغ</th></tr></thead>
            <tbody>${tableRows(bankReceipts, [
                { render: (row) => escapeHtml(row.operation_type || '-') },
                { render: (row) => escapeHtml(row.atm_name || '-') },
                { render: (row) => escapeHtml(row.bank_name || '-') },
                { className: 'amount', render: (row) => formatAmount(row.amount) }
            ])}</tbody>
            <tfoot><tr><td colspan="3">الإجمالي</td><td class="amount">${formatAmount(sumRows(bankReceipts, 'amount'))}</td></tr></tfoot>
        </table>
    `);

    const cashSection = section('المقبوضات النقدية', `
        <table>
            <thead><tr><th>الفئة</th><th>العدد</th><th>المجموع</th></tr></thead>
            <tbody>${tableRows([...cashReceipts].sort((a, b) => toFiniteNumber(b.denomination) - toFiniteNumber(a.denomination)), [
                { className: 'amount', render: (row) => formatAmount(row.denomination) },
                { className: 'amount', render: (row) => formatQuantity(row.quantity) },
                { className: 'amount', render: (row) => formatAmount(row.total_amount) }
            ])}</tbody>
            <tfoot><tr><td colspan="2">الإجمالي</td><td class="amount">${formatAmount(sumRows(cashReceipts, 'total_amount'))}</td></tr></tfoot>
        </table>
    `);

    const postpaidSection = section('المبيعات الآجلة', `
        <table>
            <thead><tr><th>العميل</th><th>الكود</th><th>المبلغ</th></tr></thead>
            <tbody>${tableRows(postpaidSales, [
                { render: (row) => escapeHtml(row.customer_name || '-') },
                { render: (row) => escapeHtml(row.customer_code || '-') },
                { className: 'amount', render: (row) => formatAmount(row.amount) }
            ])}</tbody>
            <tfoot><tr><td colspan="2">الإجمالي</td><td class="amount">${formatAmount(sumRows(postpaidSales, 'amount'))}</td></tr></tfoot>
        </table>
    `);

    const customerReceiptsSection = section('مقبوضات العملاء', `
        <table>
            <thead><tr><th>العميل</th><th>الكود</th><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
            <tbody>${tableRows(customerReceipts, [
                { render: (row) => escapeHtml(row.customer_name || '-') },
                { render: (row) => escapeHtml(row.customer_code || '-') },
                { render: (row) => escapeHtml(row.payment_type || '-') },
                { className: 'amount', render: (row) => formatAmount(row.amount) }
            ])}</tbody>
            <tfoot><tr><td colspan="3">الإجمالي</td><td class="amount">${formatAmount(sumRows(customerReceipts, 'amount'))}</td></tr></tfoot>
        </table>
    `);

    const returnsSection = section('المرتجعات والموردون', `
        <table>
            <thead><tr><th>النوع</th><th>الاسم/الرقم</th><th>المبلغ</th></tr></thead>
            <tbody>${tableRows([
                ...returnInvoices.map((row) => ({ type: 'مرتجع', name: row.invoice_number, amount: row.amount })),
                ...suppliers.map((row) => ({ type: 'مورد', name: row.supplier_name || row.invoice_number, amount: row.amount }))
            ], [
                { render: (row) => escapeHtml(row.type || '-') },
                { render: (row) => escapeHtml(row.name || '-') },
                { className: 'amount', render: (row) => formatAmount(row.amount) }
            ])}</tbody>
        </table>
    `);

    const notes = data.filterNotes
        ? section('ملاحظات التصفية', `<div class="notes">${escapeHtml(data.filterNotes)}</div>`)
        : '';

    return baseReportHtml('تقرير التصفية', header, cards, [
        bankSection,
        cashSection,
        postpaidSection,
        customerReceiptsSection,
        returnsSection,
        notes
    ].join(''));
}

function buildCustomerLedgerReportHtml(payload) {
    const rows = payload.rows || [];
    let runningBalance = 0;
    const normalizedRows = rows.map((row) => {
        const debit = toFiniteNumber(row.debit);
        const credit = toFiniteNumber(row.credit);
        runningBalance += debit - credit;
        return { ...row, debit, credit, balance: runningBalance };
    });

    const totalDebit = normalizedRows.reduce((sum, row) => row.id === 'opening-balance' ? sum : sum + row.debit, 0);
    const totalCredit = normalizedRows.reduce((sum, row) => row.id === 'opening-balance' ? sum : sum + row.credit, 0);
    const openingBalance = normalizedRows.reduce((sum, row) => row.id === 'opening-balance' ? sum + row.debit - row.credit : sum, 0);
    const finalBalance = openingBalance + totalDebit - totalCredit;

    const header = infoGrid([
        { label: 'العميل', value: payload.customerName || '-' },
        { label: 'من تاريخ', value: payload.dateFrom ? formatDisplayDate(payload.dateFrom) : 'كل الفترات' },
        { label: 'إلى تاريخ', value: payload.dateTo ? formatDisplayDate(payload.dateTo) : 'كل الفترات' },
        { label: 'عدد الحركات', value: String(rows.length) }
    ]);

    const cards = metricGrid([
        { label: 'الرصيد الافتتاحي', value: formatAmount(openingBalance), className: amountClass(openingBalance) },
        { label: 'إجمالي الأجل', value: formatAmount(totalDebit), className: amountClass(totalDebit) },
        { label: 'إجمالي التحصيل', value: formatAmount(totalCredit), className: 'positive' },
        { label: 'الصافي', value: formatAmount(finalBalance), className: amountClass(finalBalance) },
        { label: 'آخر حركة', value: normalizedRows.length ? formatDisplayDate(normalizedRows[normalizedRows.length - 1].created_at) : '-' },
        { label: 'حالة الكشف', value: 'مكتمل' }
    ]);

    const ledgerSection = section('حركات كشف الحساب', `
        <table>
            <thead>
                <tr>
                    <th style="width: 12%">التاريخ</th>
                    <th style="width: 14%">نوع الحركة</th>
                    <th>البيان</th>
                    <th style="width: 12%">الكاشير</th>
                    <th style="width: 11%">مدين</th>
                    <th style="width: 11%">دائن</th>
                    <th style="width: 11%">الرصيد</th>
                </tr>
            </thead>
            <tbody>${tableRows(normalizedRows, [
                { render: (row) => formatDisplayDate(row.created_at) },
                { render: (row) => escapeHtml(row.type || '-') },
                { render: (row) => escapeHtml(row.description || '-') },
                { render: (row) => escapeHtml(row.cashier_name || '-') },
                { className: 'amount negative', render: (row) => row.debit ? formatAmount(row.debit) : '-' },
                { className: 'amount positive', render: (row) => row.credit ? formatAmount(row.credit) : '-' },
                { className: 'amount', render: (row) => formatAmount(row.balance) }
            ])}</tbody>
            <tfoot><tr><td colspan="4">الإجمالي</td><td class="amount">${formatAmount(totalDebit)}</td><td class="amount">${formatAmount(totalCredit)}</td><td class="amount ${amountClass(finalBalance)}">${formatAmount(finalBalance)}</td></tr></tfoot>
        </table>
    `);

    return baseReportHtml('كشف حساب عميل', header, cards, ledgerSection);
}

module.exports = {
    buildArabicPdfFileName,
    buildCustomerLedgerReportHtml,
    buildPdfContentDisposition,
    buildReconciliationReportHtml,
    createPdfEtag,
    dateForFile,
    escapeHtml,
    formatAmount,
    formatDisplayDate,
    sanitizeFilePart,
    toFiniteNumber
};
