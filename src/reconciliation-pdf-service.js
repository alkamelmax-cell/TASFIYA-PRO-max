const crypto = require('crypto');
const { ProfessionalPdfRenderer } = require('./professional-pdf-renderer');
const {
    buildArabicPdfFileName,
    dateForFile,
    sanitizeFilePart
} = require('./report-pdf-templates');

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_GENERATION_TIMEOUT_MS = 90 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 30;
const DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024;

function toFiniteNumber(value, fallback = 0) {
    const parsed = typeof value === 'number'
        ? value
        : Number.parseFloat(String(value == null ? '' : value).replace(/,/g, '').trim());
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

function normalizeDate(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Riyadh'
    }).format(date);
}

function isPdfBuffer(value) {
    if (!Buffer.isBuffer(value) || value.length < 8) return false;
    return value.subarray(0, 5).toString('ascii') === '%PDF-';
}

function createPdfEtag(buffer) {
    return `"${crypto.createHash('sha256').update(buffer).digest('base64url')}"`;
}

class ReconciliationPdfService {
    constructor(dbManager, options = {}) {
        this.dbManager = dbManager;
        this.cacheTtlMs = options.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
        this.generationTimeoutMs = options.generationTimeoutMs || DEFAULT_GENERATION_TIMEOUT_MS;
        this.maxCacheEntries = options.maxCacheEntries || DEFAULT_MAX_CACHE_ENTRIES;
        this.maxPdfBytes = options.maxPdfBytes || DEFAULT_MAX_PDF_BYTES;
        this.now = options.now || (() => Date.now());
        this.cache = new Map();
        this.inFlight = new Map();
        this.activeGenerators = 0;
        this.generationQueue = [];

        this.pdfRenderer = options.pdfRenderer || new ProfessionalPdfRenderer(options.pdfRendererOptions);
    }

    async queryOne(sql, params = []) {
        return this.dbManager.db.prepare(sql).get(params);
    }

    async queryAll(sql, params = []) {
        return this.dbManager.db.prepare(sql).all(params);
    }

    async loadReportData(id) {
        const reconciliation = await this.queryOne(`
            SELECT
                r.*,
                c.name AS cashier_name,
                c.cashier_number AS cashier_number,
                c.branch_id AS branch_id,
                a.name AS accountant_name,
                b.branch_name AS branch_name
            FROM reconciliations r
            LEFT JOIN cashiers c ON r.cashier_id = c.id
            LEFT JOIN accountants a ON r.accountant_id = a.id
            LEFT JOIN branches b ON c.branch_id = b.id
            WHERE r.id = ?
        `, [id]);

        if (!reconciliation) return null;

        const [cashReceipts, bankReceipts, customerReceipts, postpaidSales, returnInvoices, suppliers] = await Promise.all([
            this.queryAll('SELECT * FROM cash_receipts WHERE reconciliation_id = ? ORDER BY denomination DESC, id ASC', [id]),
            this.queryAll(`
                SELECT br.*, atm.name AS atm_name, atm.bank_name AS bank_name
                FROM bank_receipts br
                LEFT JOIN atms atm ON br.atm_id = atm.id
                WHERE br.reconciliation_id = ?
                ORDER BY br.id ASC
            `, [id]),
            this.queryAll('SELECT * FROM customer_receipts WHERE reconciliation_id = ? ORDER BY id ASC', [id]),
            this.queryAll('SELECT * FROM postpaid_sales WHERE reconciliation_id = ? ORDER BY id ASC', [id]),
            this.queryAll('SELECT * FROM return_invoices WHERE reconciliation_id = ? ORDER BY id ASC', [id]),
            this.queryAll('SELECT * FROM suppliers WHERE reconciliation_id = ? ORDER BY id ASC', [id])
        ]);

        const normalizedCash = cashReceipts.map((row) => ({
            denomination: toFiniteNumber(row.denomination),
            quantity: toFiniteNumber(row.quantity),
            total_amount: toFiniteNumber(row.total_amount)
        }));
        const normalizedBank = bankReceipts.map((row) => ({
            operation_type: escapeHtml(row.operation_type || 'بطاقة'),
            atm_name: escapeHtml(row.atm_name || '-'),
            bank_name: escapeHtml(row.bank_name || '-'),
            amount: toFiniteNumber(row.amount)
        }));
        const normalizedPostpaid = postpaidSales.map((row) => ({
            customer_name: escapeHtml(row.customer_name || '-'),
            customer_code: escapeHtml(row.customer_code || ''),
            amount: toFiniteNumber(row.amount)
        }));
        const normalizedCustomerReceipts = customerReceipts.map((row) => ({
            customer_name: escapeHtml(row.customer_name || '-'),
            customer_code: escapeHtml(row.customer_code || ''),
            payment_type: escapeHtml(row.payment_type || '-'),
            amount: toFiniteNumber(row.amount)
        }));
        const normalizedReturns = returnInvoices.map((row) => ({
            invoice_number: escapeHtml(row.invoice_number || '-'),
            amount: toFiniteNumber(row.amount)
        }));
        const normalizedSuppliers = suppliers.map((row) => ({
            supplier_name: escapeHtml(row.supplier_name || '-'),
            invoice_number: escapeHtml(row.invoice_number || ''),
            amount: toFiniteNumber(row.amount)
        }));

        const sum = (rows, key) => rows.reduce((total, row) => total + toFiniteNumber(row[key]), 0);
        const bankTotal = sum(normalizedBank, 'amount');
        const cashTotal = sum(normalizedCash, 'total_amount');
        const postpaidTotal = sum(normalizedPostpaid, 'amount');
        const customerTotal = sum(normalizedCustomerReceipts, 'amount');
        const returnTotal = sum(normalizedReturns, 'amount');

        const reportData = {
            reconciliation: {
                branch_name: escapeHtml(reconciliation.branch_name || 'الفرع الرئيسي')
            },
            reconciliationId: reconciliation.reconciliation_number || reconciliation.id,
            sourceReconciliationId: reconciliation.id,
            cashierName: escapeHtml(reconciliation.cashier_name || 'غير معروف'),
            cashierNumber: escapeHtml(reconciliation.cashier_number || reconciliation.cashier_id || '-'),
            accountantName: escapeHtml(reconciliation.accountant_name || 'غير معروف'),
            reconciliationDate: normalizeDate(reconciliation.reconciliation_date),
            reconciliationDateRaw: reconciliation.reconciliation_date,
            timeRangeStart: escapeHtml(reconciliation.time_range_start || ''),
            timeRangeEnd: escapeHtml(reconciliation.time_range_end || ''),
            filterNotes: escapeHtml(reconciliation.notes || ''),
            cashReceipts: normalizedCash,
            bankReceipts: normalizedBank,
            postpaidSales: normalizedPostpaid,
            customerReceipts: normalizedCustomerReceipts,
            returnInvoices: normalizedReturns,
            suppliers: normalizedSuppliers,
            summary: {
                bankTotal,
                cashTotal,
                postpaidTotal,
                customerTotal,
                returnTotal,
                systemSales: toFiniteNumber(reconciliation.system_sales),
                totalReceipts: toFiniteNumber(reconciliation.total_receipts, cashTotal + bankTotal + customerTotal),
                surplusDeficit: toFiniteNumber(reconciliation.surplus_deficit)
            }
        };

        const versionPayload = {
            updatedAt: reconciliation.updated_at || reconciliation.last_modified_date || reconciliation.created_at || '',
            reportData
        };
        const version = crypto.createHash('sha256').update(JSON.stringify(versionPayload)).digest('base64url');
        return { reportData, version };
    }

    async acquireGenerationSlot() {
        if (this.activeGenerators < 1) {
            this.activeGenerators += 1;
            return;
        }

        await new Promise((resolve) => this.generationQueue.push(resolve));
        this.activeGenerators += 1;
    }

    releaseGenerationSlot() {
        this.activeGenerators = Math.max(0, this.activeGenerators - 1);
        const next = this.generationQueue.shift();
        if (next) next();
    }

    async generateWithTimeout(reportData) {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const error = new Error('PDF generation timed out');
                error.code = 'PDF_GENERATION_TIMEOUT';
                reject(error);
            }, this.generationTimeoutMs);
        });

        try {
            return await Promise.race([
                this.pdfRenderer.renderReconciliation(reportData),
                timeoutPromise
            ]);
        } catch (error) {
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    pruneCache() {
        const now = this.now();
        for (const [id, entry] of this.cache.entries()) {
            if (now - entry.cachedAt > this.cacheTtlMs) this.cache.delete(id);
        }

        while (this.cache.size > this.maxCacheEntries) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    async getReport(id) {
        const loaded = await this.loadReportData(id);
        if (!loaded) return null;

        this.pruneCache();
        const cached = this.cache.get(String(id));
        if (cached && cached.version === loaded.version) {
            this.cache.delete(String(id));
            this.cache.set(String(id), cached);
            return { ...cached, cacheStatus: 'HIT' };
        }

        const inFlightKey = `${id}:${loaded.version}`;
        if (this.inFlight.has(inFlightKey)) {
            const report = await this.inFlight.get(inFlightKey);
            return { ...report, cacheStatus: 'COALESCED' };
        }

        const generationPromise = (async () => {
            await this.acquireGenerationSlot();
            try {
                const rawPdf = await this.generateWithTimeout(loaded.reportData);
                const buffer = Buffer.isBuffer(rawPdf) ? rawPdf : Buffer.from(rawPdf || []);
                if (!isPdfBuffer(buffer)) throw new Error('Generated report is not a valid PDF');
                if (buffer.length > this.maxPdfBytes) throw new Error('Generated PDF exceeds the allowed size');

                const report = {
                    buffer,
                    etag: createPdfEtag(buffer),
                    version: loaded.version,
                    cachedAt: this.now(),
                    reconciliationNumber: loaded.reportData.reconciliationId,
                    fileName: buildArabicPdfFileName(
                        'تصفية',
                        loaded.reportData.cashierName,
                        loaded.reportData.reconciliationDateRaw || loaded.reportData.reconciliationDate,
                        loaded.reportData.reconciliationId
                    ),
                    fallbackFileName: `tasfiya-reconciliation-${sanitizeFilePart(loaded.reportData.reconciliationId || id, 'report')}.pdf`,
                    cashierName: loaded.reportData.cashierName,
                    reconciliationDateForFile: dateForFile(loaded.reportData.reconciliationDateRaw || loaded.reportData.reconciliationDate)
                };
                this.cache.delete(String(id));
                this.cache.set(String(id), report);
                this.pruneCache();
                return report;
            } finally {
                this.releaseGenerationSlot();
            }
        })();

        this.inFlight.set(inFlightKey, generationPromise);
        try {
            const report = await generationPromise;
            return { ...report, cacheStatus: 'MISS' };
        } finally {
            this.inFlight.delete(inFlightKey);
        }
    }

    invalidate(id) {
        this.cache.delete(String(id));
    }

    async close() {
        this.cache.clear();
        // The vector renderer has no browser process or native resource to close.
    }
}

module.exports = {
    ReconciliationPdfService,
    createPdfEtag,
    escapeHtml,
    isPdfBuffer,
    normalizeDate,
    toFiniteNumber
};
