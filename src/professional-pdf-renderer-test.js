const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ProfessionalPdfRenderer } = require('./professional-pdf-renderer');

function reconciliationFixture() {
    return {
        reconciliationId: 3153,
        reconciliationDate: '12/09/2026',
        reconciliationDateRaw: '2026-09-12',
        cashierName: 'أحمد محمد',
        cashierNumber: '3',
        accountantName: 'عبدالحميد',
        reconciliation: { branch_name: 'الفرع الرئيسي' },
        timeRangeStart: '08:00',
        timeRangeEnd: '16:00',
        filterNotes: 'تمت المراجعة واعتماد التصفية.',
        summary: {
            systemSales: 11579.40,
            totalReceipts: 11623.42,
            surplusDeficit: 44.02,
            cashTotal: 937,
            bankTotal: 1062.75
        },
        cashReceipts: [
            { denomination: 100, quantity: 8, total_amount: 800 },
            { denomination: 10, quantity: 13, total_amount: 130 },
            { denomination: 1, quantity: 7, total_amount: 7 }
        ],
        bankReceipts: [
            { operation_type: 'مدى', atm_name: '15021082', bank_name: 'بنك الراجحي', amount: 937 },
            { operation_type: 'فيزا', atm_name: '15021082', bank_name: 'بنك الراجحي', amount: 125.75 }
        ],
        postpaidSales: Array.from({ length: 12 }, (_, index) => ({
            customer_name: `عميل المبيعات الآجلة رقم ${index + 1}`,
            customer_code: `C1-${String(index + 1).padStart(6, '0')}`,
            amount: 100 + index
        })),
        customerReceipts: Array.from({ length: 8 }, (_, index) => ({
            customer_name: `عميل المقبوضات رقم ${index + 1}`,
            customer_code: `C1-${String(index + 20).padStart(6, '0')}`,
            payment_type: index % 2 ? 'شبكة' : 'نقدي',
            amount: 50 + index
        })),
        returnInvoices: [{ invoice_number: 'RET-101', amount: 25 }],
        suppliers: [{ supplier_name: 'المورد الرئيسي', invoice_number: 'SUP-10', amount: 70 }]
    };
}

function ledgerFixture() {
    return {
        customerName: 'إبراهيم السلاط ضمانة أبو أيمن',
        dateFrom: '2026-01-01',
        dateTo: '2026-09-12',
        rows: [
            {
                id: 'opening-balance',
                created_at: '2026-01-01',
                type: 'رصيد افتتاحي',
                description: 'رصيد مرحل من السنة السابقة',
                cashier_name: 'النظام',
                debit: 150,
                credit: 0
            },
            ...Array.from({ length: 74 }, (_, index) => ({
                id: index + 1,
                created_at: `2026-${String((index % 9) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
                type: index % 3 === 0 ? 'سند قبض' : 'مبيعات آجلة',
                description: index % 3 === 0 ? `سداد الحركة رقم ${index + 1}` : `فاتورة مبيعات رقم ${index + 1}`,
                cashier_name: index % 2 ? 'عادل' : 'أحمد',
                debit: index % 3 === 0 ? 0 : 100 + index,
                credit: index % 3 === 0 ? 75 + index : 0
            }))
        ]
    };
}

async function run() {
    const renderer = new ProfessionalPdfRenderer();
    const [reconciliation, ledger] = await Promise.all([
        renderer.renderReconciliation(reconciliationFixture()),
        renderer.renderCustomerLedger(ledgerFixture())
    ]);

    for (const buffer of [reconciliation, ledger]) {
        assert(Buffer.isBuffer(buffer));
        assert.strictEqual(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
        assert(buffer.length > 25000, 'PDF output should contain embedded Arabic fonts and report content');
    }

    if (process.env.PDF_QA_OUTPUT_DIR) {
        const outputDirectory = path.resolve(process.env.PDF_QA_OUTPUT_DIR);
        fs.mkdirSync(outputDirectory, { recursive: true });
        fs.writeFileSync(path.join(outputDirectory, 'vector-reconciliation.pdf'), reconciliation);
        fs.writeFileSync(path.join(outputDirectory, 'vector-customer-ledger.pdf'), ledger);
    }

    console.log('Professional vector PDF renderer tests passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
