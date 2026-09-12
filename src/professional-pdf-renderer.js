const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const COLORS = Object.freeze({
    ink: '#17313c',
    muted: '#71868b',
    brand: '#0b4f5d',
    header: '#123c4f',
    accent: '#37c7bd',
    border: '#d8e8e9',
    card: '#f3fafa',
    stripe: '#f7fafb',
    total: '#eaf9f5',
    positive: '#079c5f',
    negative: '#d84c5b',
    white: '#ffffff'
});

const PAGE = Object.freeze({
    margin: 34,
    headerBottom: 78,
    bodyTop: 92,
    footerTop: 798,
    contentBottom: 730
});

function toNumber(value, fallback = 0) {
    const parsed = typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
}

function amount(value) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(toNumber(value));
}

function quantity(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(toNumber(value));
}

function displayDate(value) {
    if (!value) return '-';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Riyadh'
    }).format(parsed);
}

function displayDateTime(value = new Date()) {
    const parsed = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Riyadh'
    }).format(parsed);
}

function sum(rows, key) {
    return (rows || []).reduce((total, row) => total + toNumber(row?.[key]), 0);
}

function findFirstExisting(paths) {
    return paths.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

function resolveArabicFonts(options = {}) {
    const windowsDirectory = process.env.WINDIR || 'C:\\Windows';
    const windowsFonts = path.join(windowsDirectory, 'Fonts');
    const regular = findFirstExisting([
        options.regularFont,
        process.env.TASFIYA_PDF_FONT,
        path.join(windowsFonts, 'tahoma.ttf'),
        path.join(windowsFonts, 'arial.ttf'),
        path.join(windowsFonts, 'segoeui.ttf')
    ]);
    const bold = findFirstExisting([
        options.boldFont,
        process.env.TASFIYA_PDF_BOLD_FONT,
        path.join(windowsFonts, 'tahomabd.ttf'),
        path.join(windowsFonts, 'arialbd.ttf'),
        path.join(windowsFonts, 'segoeuib.ttf'),
        regular
    ]);

    if (!regular || !bold) {
        const error = new Error('Arabic PDF font is not available on this server');
        error.code = 'PDF_ARABIC_FONT_MISSING';
        throw error;
    }
    return { regular, bold };
}

function collectDocument(doc) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        doc.once('error', reject);
        doc.once('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length < 8 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
                const error = new Error('Vector PDF renderer returned an invalid document');
                error.code = 'PDF_INVALID_OUTPUT';
                reject(error);
                return;
            }
            resolve(buffer);
        });
    });
}

function singleLineText(value) {
    const text = String(value ?? '-');
    if (!/[\u0600-\u06FF]/.test(text)) return text;
    return text
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .split(/\s+/)
        .reverse()
        .join('  ') || '-';
}

function displayTimeRange(start, end) {
    if (!start && !end) return '-';
    return `${start || '-'} - ${end || '-'}`;
}

function fitText(doc, value, width, fontSize) {
    const text = String(value ?? '-').replace(/[\r\n]+/g, ' ').trim() || '-';
    doc.fontSize(fontSize);
    if (doc.widthOfString(singleLineText(text)) <= width) return singleLineText(text);
    let low = 0;
    let high = text.length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (doc.widthOfString(singleLineText(`${text.slice(0, middle)}...`)) <= width) low = middle;
        else high = middle - 1;
    }
    return singleLineText(`${text.slice(0, Math.max(1, low))}...`);
}

class ProfessionalPdfRenderer {
    constructor(options = {}) {
        this.fonts = resolveArabicFonts(options);
        this.generatedBy = options.generatedBy || 'تصفية برو';
    }

    createState(title) {
        const doc = new PDFDocument({
            autoFirstPage: false,
            bufferPages: true,
            compress: true,
            info: {
                Title: title,
                Author: 'محمد أمين الكامل',
                Subject: 'تقرير صادر من نظام تصفية برو',
                Creator: 'Tasfiya Pro Vector PDF Engine'
            }
        });
        doc.registerFont('Arabic', this.fonts.regular);
        doc.registerFont('ArabicBold', this.fonts.bold);
        const state = { doc, title, y: PAGE.bodyTop, pageNumber: 0 };
        this.addPage(state);
        return state;
    }

    addPage(state) {
        const { doc } = state;
        doc.addPage({ size: 'A4', margins: { top: 0, right: 0, bottom: 0, left: 0 } });
        state.pageNumber += 1;
        this.drawPageHeader(state);
        state.y = PAGE.bodyTop;
    }

    drawPageHeader(state) {
        const { doc, title } = state;
        const width = doc.page.width - (PAGE.margin * 2);
        doc.font('ArabicBold').fillColor(COLORS.brand).fontSize(14)
            .text(singleLineText('تصفية برو'), doc.page.width - PAGE.margin - 130, 28, { width: 130, align: 'right', lineBreak: false });
        doc.font('Arabic').fillColor(COLORS.muted).fontSize(7)
            .text('Tasfiya Pro', doc.page.width - PAGE.margin - 130, 48, { width: 130, align: 'right', lineBreak: false });
        doc.font('ArabicBold').fillColor(COLORS.brand).fontSize(16)
            .text(singleLineText(title), PAGE.margin + 150, 32, { width: width - 300, align: 'center', lineBreak: false });
        doc.font('Arabic').fillColor(COLORS.muted).fontSize(7)
            .text(singleLineText('تاريخ الإصدار'), PAGE.margin, 27, { width: 120, align: 'left', lineBreak: false });
        doc.font('ArabicBold').fillColor(COLORS.ink).fontSize(9)
            .text(displayDateTime(), PAGE.margin, 43, { width: 120, align: 'left', lineBreak: false });
        doc.moveTo(PAGE.margin, PAGE.headerBottom)
            .lineTo(doc.page.width - PAGE.margin, PAGE.headerBottom)
            .lineWidth(1.5)
            .strokeColor(COLORS.accent)
            .stroke();
    }

    ensureSpace(state, requiredHeight) {
        if (state.y + requiredHeight <= PAGE.contentBottom) return;
        this.addPage(state);
    }

    drawCards(state, cards, columns, options = {}) {
        const { doc } = state;
        const gap = options.gap || 6;
        const height = options.height || 44;
        const width = doc.page.width - (PAGE.margin * 2);
        const cardWidth = (width - (gap * (columns - 1))) / columns;
        const rows = Math.ceil(cards.length / columns);
        this.ensureSpace(state, rows * (height + gap));

        cards.forEach((card, index) => {
            const row = Math.floor(index / columns);
            const columnFromRight = index % columns;
            const x = doc.page.width - PAGE.margin - cardWidth - (columnFromRight * (cardWidth + gap));
            const y = state.y + row * (height + gap);
            doc.roundedRect(x, y, cardWidth, height, 3)
                .fillAndStroke(card.background || COLORS.card, COLORS.border);
            doc.font('Arabic').fillColor(COLORS.muted).fontSize(7)
                .text(singleLineText(card.label || ''), x + 6, y + 7, { width: cardWidth - 12, align: 'right', lineBreak: false });
            const color = card.color || COLORS.ink;
            const valueText = fitText(doc.font('ArabicBold'), card.value, cardWidth - 12, card.valueSize || 10);
            doc.font('ArabicBold').fillColor(color).fontSize(card.valueSize || 10)
                .text(valueText, x + 6, y + 23, { width: cardWidth - 12, align: card.align || 'right', lineBreak: false });
        });
        state.y += rows * (height + gap) + (options.after || 4);
    }

    drawSectionTitle(state, title) {
        this.ensureSpace(state, 34);
        const { doc } = state;
        doc.rect(doc.page.width - PAGE.margin - 3, state.y, 3, 17).fill(COLORS.accent);
        doc.font('ArabicBold').fillColor(COLORS.brand).fontSize(11)
            .text(singleLineText(title), PAGE.margin, state.y + 1, {
                width: doc.page.width - (PAGE.margin * 2) - 9,
                align: 'right',
                lineBreak: false
            });
        state.y += 23;
    }

    drawTable(state, title, columns, rows, options = {}) {
        const { doc } = state;
        const width = doc.page.width - (PAGE.margin * 2);
        const headerHeight = 22;
        const rowHeight = options.rowHeight || 22;
        const normalizedRows = rows && rows.length ? rows : [{ __empty: true }];
        const totalWeight = columns.reduce((total, column) => total + column.weight, 0);
        const calculated = columns.map((column) => ({ ...column, width: width * (column.weight / totalWeight) }));

        const drawHeader = () => {
            let x = PAGE.margin;
            doc.rect(PAGE.margin, state.y, width, headerHeight).fill(COLORS.header);
            calculated.forEach((column) => {
                doc.font('ArabicBold').fillColor(COLORS.white).fontSize(7.5)
                    .text(singleLineText(column.label), x + 3, state.y + 7, {
                        width: column.width - 6,
                        align: 'center',
                        lineBreak: false
                    });
                x += column.width;
            });
            state.y += headerHeight;
        };

        this.drawSectionTitle(state, title);
        drawHeader();
        normalizedRows.forEach((row, rowIndex) => {
            if (state.y + rowHeight > PAGE.contentBottom) {
                this.addPage(state);
                this.drawSectionTitle(state, `${title} - تابع`);
                drawHeader();
            }
            doc.rect(PAGE.margin, state.y, width, rowHeight)
                .fill(rowIndex % 2 ? COLORS.stripe : COLORS.white)
                .strokeColor(COLORS.border)
                .lineWidth(0.35)
                .stroke();

            if (row.__empty) {
                doc.font('Arabic').fillColor(COLORS.muted).fontSize(8)
                    .text(singleLineText(options.emptyText || 'لا توجد بيانات'), PAGE.margin, state.y + 7, { width, align: 'center', lineBreak: false });
            } else {
                let x = PAGE.margin;
                calculated.forEach((column) => {
                    const rawValue = typeof column.value === 'function' ? column.value(row, rowIndex) : row[column.value];
                    const font = column.bold ? 'ArabicBold' : 'Arabic';
                    const fontSize = column.fontSize || 7.5;
                    doc.font(font).fillColor(typeof column.color === 'function' ? column.color(row) : (column.color || COLORS.ink));
                    const text = fitText(doc, rawValue, column.width - 8, fontSize);
                    doc.fontSize(fontSize).text(text, x + 4, state.y + 7, {
                        width: column.width - 8,
                        align: column.align || 'center',
                        lineBreak: false
                    });
                    x += column.width;
                });
            }
            state.y += rowHeight;
        });

        if (options.totalRow) {
            if (state.y + rowHeight > PAGE.contentBottom) {
                this.addPage(state);
                this.drawSectionTitle(state, `${title} - الإجمالي`);
            }
            doc.rect(PAGE.margin, state.y, width, rowHeight).fillAndStroke(COLORS.total, COLORS.border);
            let x = PAGE.margin;
            calculated.forEach((column, index) => {
                const value = options.totalRow[index] ?? '';
                doc.font('ArabicBold').fillColor(COLORS.positive).fontSize(8)
                    .text(singleLineText(value), x + 4, state.y + 7, { width: column.width - 8, align: 'center', lineBreak: false });
                x += column.width;
            });
            state.y += rowHeight;
        }
        state.y += 11;
    }

    drawNotes(state, title, text) {
        if (!String(text || '').trim()) return;
        this.drawSectionTitle(state, title);
        const { doc } = state;
        const width = doc.page.width - (PAGE.margin * 2);
        const content = String(text).replace(/[\r\n]+/g, ' ');
        const textHeight = Math.min(46, Math.max(24, doc.font('Arabic').fontSize(8).heightOfString(content, { width: width - 18 })));
        this.ensureSpace(state, textHeight + 8);
        doc.roundedRect(PAGE.margin, state.y, width, textHeight + 8, 3).fillAndStroke('#fbfefe', COLORS.border);
        doc.font('Arabic').fillColor(COLORS.ink).fontSize(8)
            .text(content, PAGE.margin + 9, state.y + 7, { width: width - 18, align: 'right', height: textHeight });
        state.y += textHeight + 18;
    }

    finalize(state) {
        const { doc } = state;
        const range = doc.bufferedPageRange();
        for (let index = range.start; index < range.start + range.count; index += 1) {
            doc.switchToPage(index);
            const width = doc.page.width - (PAGE.margin * 2);
            doc.moveTo(PAGE.margin, PAGE.footerTop - 8)
                .lineTo(doc.page.width - PAGE.margin, PAGE.footerTop - 8)
                .lineWidth(0.5)
                .strokeColor(COLORS.border)
                .stroke();
            doc.font('Arabic').fillColor(COLORS.muted).fontSize(6.5)
                .text(singleLineText('تصفية برو - جميع الحقوق محفوظة - محمد أمين الكامل - 2025'), PAGE.margin, PAGE.footerTop, {
                    width: width - 80,
                    align: 'right',
                    lineBreak: false
                });
            doc.font('ArabicBold').fillColor(COLORS.muted).fontSize(7)
                .text(`${index + 1} / ${range.count}`, doc.page.width - PAGE.margin - 70, PAGE.footerTop, {
                    width: 70,
                    align: 'right',
                    lineBreak: false
                });
        }
        doc.end();
    }

    async renderReconciliation(data = {}) {
        const state = this.createState('تقرير التصفية');
        const summary = data.summary || {};
        const surplusDeficit = toNumber(summary.surplusDeficit);
        const status = surplusDeficit > 0
            ? { value: `فائض ${amount(surplusDeficit)}`, color: COLORS.positive }
            : surplusDeficit < 0
                ? { value: `عجز ${amount(Math.abs(surplusDeficit))}`, color: COLORS.negative }
                : { value: 'متوازن 0.00', color: COLORS.ink };

        this.drawCards(state, [
            { label: 'رقم التصفية', value: `#${data.reconciliationId || '-'}` },
            { label: 'التاريخ', value: data.reconciliationDate || displayDate(data.reconciliationDateRaw) },
            { label: 'الكاشير', value: `${data.cashierName || '-'} ${data.cashierNumber ? `(${data.cashierNumber})` : ''}` },
            { label: 'المحاسب', value: data.accountantName || '-' },
            { label: 'الفرع', value: data.reconciliation?.branch_name || data.branchName || '-' },
            { label: 'النطاق الزمني', value: displayTimeRange(data.timeRangeStart, data.timeRangeEnd) },
            { label: 'حسابات العملاء', value: `${(data.postpaidSales || []).length + (data.customerReceipts || []).length} حركة` },
            { label: 'حالة التقرير', value: 'مكتمل', color: COLORS.positive }
        ], 4, { height: 43 });

        this.drawCards(state, [
            { label: 'مبيعات النظام', value: amount(summary.systemSales), align: 'center', valueSize: 12 },
            { label: 'إجمالي المقبوضات', value: amount(summary.totalReceipts), align: 'center', valueSize: 12, color: COLORS.positive },
            { label: 'العجز / الفائض', value: amount(surplusDeficit), align: 'center', valueSize: 12, color: surplusDeficit < 0 ? COLORS.negative : COLORS.positive },
            { label: 'النقدية', value: amount(summary.cashTotal), align: 'center', valueSize: 12, color: COLORS.positive },
            { label: 'الشبكة والبنك', value: amount(summary.bankTotal), align: 'center', valueSize: 12, color: COLORS.positive },
            { label: 'الحالة', value: status.value, align: 'center', valueSize: 11, color: status.color }
        ], 3, { height: 48, after: 7 });

        const bankRows = data.bankReceipts || [];
        this.drawTable(state, 'المقبوضات البنكية', [
            { label: 'المبلغ', weight: 1, value: (row) => amount(row.amount), bold: true },
            { label: 'البنك', weight: 1.4, value: 'bank_name' },
            { label: 'الجهاز', weight: 1.2, value: 'atm_name' },
            { label: 'العملية', weight: 1.5, value: 'operation_type' }
        ], bankRows, { totalRow: [amount(sum(bankRows, 'amount')), '', '', 'الإجمالي'] });

        const cashRows = [...(data.cashReceipts || [])].sort((a, b) => toNumber(b.denomination) - toNumber(a.denomination));
        this.drawTable(state, 'المقبوضات النقدية', [
            { label: 'المجموع', weight: 1, value: (row) => amount(row.total_amount), bold: true },
            { label: 'العدد', weight: 1, value: (row) => quantity(row.quantity) },
            { label: 'الفئة', weight: 1, value: (row) => amount(row.denomination) }
        ], cashRows, { totalRow: [amount(sum(cashRows, 'total_amount')), '', 'الإجمالي'] });

        const postpaidRows = data.postpaidSales || [];
        this.drawTable(state, 'المبيعات الآجلة', [
            { label: 'المبلغ', weight: 1, value: (row) => amount(row.amount), bold: true },
            { label: 'الكود', weight: 1.2, value: (row) => row.customer_code || '-' },
            { label: 'العميل', weight: 2.2, value: (row) => row.customer_name || '-', align: 'right' }
        ], postpaidRows, { totalRow: [amount(sum(postpaidRows, 'amount')), '', 'الإجمالي'] });

        const customerRows = data.customerReceipts || [];
        this.drawTable(state, 'مقبوضات العملاء', [
            { label: 'المبلغ', weight: 1, value: (row) => amount(row.amount), bold: true },
            { label: 'طريقة الدفع', weight: 1.2, value: (row) => row.payment_type || '-' },
            { label: 'الكود', weight: 1.2, value: (row) => row.customer_code || '-' },
            { label: 'العميل', weight: 2.1, value: (row) => row.customer_name || '-', align: 'right' }
        ], customerRows, { totalRow: [amount(sum(customerRows, 'amount')), '', '', 'الإجمالي'] });

        const otherRows = [
            ...(data.returnInvoices || []).map((row) => ({ type: 'مرتجع', name: row.invoice_number || '-', amount: row.amount })),
            ...(data.suppliers || []).map((row) => ({ type: 'مورد', name: row.supplier_name || row.invoice_number || '-', amount: row.amount }))
        ];
        this.drawTable(state, 'المرتجعات والموردون', [
            { label: 'المبلغ', weight: 1, value: (row) => amount(row.amount), bold: true },
            { label: 'الاسم / الرقم', weight: 2, value: 'name' },
            { label: 'النوع', weight: 1, value: 'type' }
        ], otherRows);
        this.drawNotes(state, 'ملاحظات التصفية', data.filterNotes);

        const output = collectDocument(state.doc);
        this.finalize(state);
        return output;
    }

    async renderCustomerLedger(payload = {}) {
        const state = this.createState('كشف حساب عميل');
        let runningBalance = 0;
        const rows = (payload.rows || []).map((row) => {
            const debit = toNumber(row.debit);
            const credit = toNumber(row.credit);
            runningBalance += debit - credit;
            return { ...row, debit, credit, balance: runningBalance };
        });
        const openingBalance = rows.reduce((total, row) => row.id === 'opening-balance' ? total + row.debit - row.credit : total, 0);
        const totalDebit = rows.reduce((total, row) => row.id === 'opening-balance' ? total : total + row.debit, 0);
        const totalCredit = rows.reduce((total, row) => row.id === 'opening-balance' ? total : total + row.credit, 0);
        const finalBalance = openingBalance + totalDebit - totalCredit;

        this.drawCards(state, [
            { label: 'العميل', value: payload.customerName || '-', valueSize: 9 },
            { label: 'من تاريخ', value: payload.dateFrom ? displayDate(payload.dateFrom) : 'كل الفترات' },
            { label: 'إلى تاريخ', value: payload.dateTo ? displayDate(payload.dateTo) : 'كل الفترات' },
            { label: 'عدد الحركات', value: String(rows.length) }
        ], 4, { height: 46 });
        this.drawCards(state, [
            { label: 'الرصيد الافتتاحي', value: amount(openingBalance), align: 'center', valueSize: 12, color: openingBalance < 0 ? COLORS.negative : COLORS.positive },
            { label: 'إجمالي الأجل', value: amount(totalDebit), align: 'center', valueSize: 12 },
            { label: 'إجمالي التحصيل', value: amount(totalCredit), align: 'center', valueSize: 12, color: COLORS.positive },
            { label: 'الصافي', value: amount(finalBalance), align: 'center', valueSize: 12, color: finalBalance < 0 ? COLORS.negative : COLORS.positive },
            { label: 'آخر حركة', value: rows.length ? displayDate(rows[rows.length - 1].created_at) : '-', align: 'center' },
            { label: 'حالة الكشف', value: 'مكتمل', align: 'center', color: COLORS.positive }
        ], 3, { height: 48, after: 8 });

        this.drawTable(state, 'حركات كشف الحساب', [
            { label: 'الرصيد', weight: 1, value: (row) => amount(row.balance), bold: true, color: (row) => row.balance < 0 ? COLORS.negative : COLORS.ink },
            { label: 'دائن', weight: 0.85, value: (row) => row.credit ? amount(row.credit) : '-', color: COLORS.positive },
            { label: 'مدين', weight: 0.85, value: (row) => row.debit ? amount(row.debit) : '-', color: COLORS.negative },
            { label: 'الكاشير', weight: 1.1, value: (row) => row.cashier_name || '-' },
            { label: 'البيان', weight: 2.1, value: (row) => row.description || '-', align: 'right' },
            { label: 'نوع الحركة', weight: 1.25, value: (row) => row.type || '-' },
            { label: 'التاريخ', weight: 1, value: (row) => displayDate(row.created_at) }
        ], rows, {
            totalRow: [amount(finalBalance), amount(totalCredit), amount(totalDebit), '', '', 'الإجمالي', '']
        });

        const output = collectDocument(state.doc);
        this.finalize(state);
        return output;
    }
}

module.exports = {
    COLORS,
    ProfessionalPdfRenderer,
    amount,
    displayDate,
    resolveArabicFonts,
    toNumber
};
