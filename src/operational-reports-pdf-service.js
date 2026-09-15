const crypto = require('crypto');
const {
    buildArabicPdfFileName,
    createPdfEtag,
    dateForFile,
    sanitizeFilePart
} = require('./report-pdf-templates');
const { isPdfBuffer, toFiniteNumber } = require('./reconciliation-pdf-service');

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_GENERATION_TIMEOUT_MS = 90 * 1000;
const DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024;

function clean(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeFilters(type, query = {}) {
    const common = {
        branchId: clean(query.branchId),
        dateFrom: clean(query.dateFrom),
        dateTo: clean(query.dateTo)
    };
    return type === 'atm'
        ? {
            ...common,
            cashierId: clean(query.cashierId),
            accountLocation: clean(query.accountLocation),
            specificAmount: clean(query.specificAmount),
            operationType: clean(query.operationType),
            device: clean(query.device)
        }
        : {
            ...common,
            voucherType: clean(query.voucherType),
            search: clean(query.search)
        };
}

function addAtmOperationFilter(where, params, operationType) {
    const selected = {
        mada: ['%mada%', '%مدى%'],
        visa: ['%visa%', '%فيزا%'],
        mastercard: ['%master%', '%ماستر%'],
        transfer: ['%transfer%', '%تحويل%']
    }[clean(operationType).toLowerCase()];
    if (!selected) return;
    where.push(`(
        LOWER(COALESCE(br.operation_type, '')) LIKE ?
        OR LOWER(COALESCE(br.operation_type, '')) LIKE ?
    )`);
    params.push(...selected);
}

function operationLabel(value) {
    const normalized = clean(value).toLowerCase();
    if (normalized === 'mada') return 'مدى';
    if (normalized === 'visa') return 'فيزا';
    if (normalized === 'mastercard') return 'ماستر كارد';
    if (normalized === 'transfer') return 'تحويل';
    return value || '-';
}

class OperationalReportsPdfService {
    constructor(dbManager, options = {}) {
        this.dbManager = dbManager;
        this.pdfRenderer = options.pdfRenderer;
        if (!this.pdfRenderer || typeof this.pdfRenderer.renderOperationalReport !== 'function') {
            throw new Error('Operational PDF renderer is not configured');
        }
        this.cacheTtlMs = options.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
        this.generationTimeoutMs = options.generationTimeoutMs || DEFAULT_GENERATION_TIMEOUT_MS;
        this.maxPdfBytes = options.maxPdfBytes || DEFAULT_MAX_PDF_BYTES;
        this.now = options.now || (() => Date.now());
        this.cache = new Map();
        this.inFlight = new Map();
        this.activeGenerators = 0;
        this.queue = [];
    }

    queryOne(sql, params = []) {
        return this.dbManager.db.prepare(sql).get(params);
    }

    queryAll(sql, params = []) {
        return this.dbManager.db.prepare(sql).all(params);
    }

    buildAtmWhere(filters) {
        const where = ['1=1'];
        const params = [];
        if (filters.dateFrom) { where.push('r.reconciliation_date >= ?'); params.push(filters.dateFrom); }
        if (filters.dateTo) { where.push('r.reconciliation_date <= ?'); params.push(filters.dateTo); }
        if (filters.cashierId && filters.cashierId !== 'all') { where.push('r.cashier_id = ?'); params.push(filters.cashierId); }
        if (filters.branchId && filters.branchId !== 'all') { where.push('atm.branch_id = ?'); params.push(filters.branchId); }
        if (filters.accountLocation && filters.accountLocation !== 'all') { where.push('atm.location = ?'); params.push(filters.accountLocation); }
        if (filters.specificAmount) { where.push('br.amount = ?'); params.push(filters.specificAmount); }
        if (filters.device && filters.device !== 'all') { where.push('atm.name = ?'); params.push(filters.device); }
        addAtmOperationFilter(where, params, filters.operationType);
        return { whereClause: where.join(' AND '), params };
    }

    async loadAtm(filters) {
        const { whereClause, params } = this.buildAtmWhere(filters);
        const rows = await this.queryAll(`
            SELECT br.id, br.amount, br.operation_type, br.created_at,
                   r.id AS reconciliation_id, r.reconciliation_number, r.reconciliation_date,
                   atm.name AS atm_name, atm.bank_name, atm.location,
                   COALESCE(b.branch_name, '-') AS branch_name,
                   COALESCE(c.name, '-') AS cashier_name
            FROM bank_receipts br
            LEFT JOIN reconciliations r ON br.reconciliation_id = r.id
            LEFT JOIN atms atm ON br.atm_id = atm.id
            LEFT JOIN cashiers c ON r.cashier_id = c.id
            LEFT JOIN branches b ON atm.branch_id = b.id
            WHERE ${whereClause}
            ORDER BY br.created_at DESC, br.id DESC
        `, params);
        const data = Array.isArray(rows) ? rows : [];
        const total = data.reduce((sum, row) => sum + toFiniteNumber(row.amount), 0);
        return {
            rows: data,
            summary: {
                count: data.length,
                total,
                average: data.length ? total / data.length : 0,
                maximum: data.reduce((max, row) => Math.max(max, toFiniteNumber(row.amount)), 0)
            }
        };
    }

    buildCashboxWhere(filters) {
        const where = ['1=1'];
        const params = [];
        if (filters.branchId && filters.branchId !== 'all') { where.push('v.branch_id = ?'); params.push(filters.branchId); }
        if (filters.voucherType && filters.voucherType !== 'all') { where.push('v.voucher_type = ?'); params.push(filters.voucherType); }
        if (filters.dateFrom) { where.push('v.voucher_date >= ?'); params.push(filters.dateFrom); }
        if (filters.dateTo) { where.push('v.voucher_date <= ?'); params.push(filters.dateTo); }
        if (filters.search) {
            where.push(`(
                v.counterparty_name LIKE ? OR COALESCE(v.reference_no, '') LIKE ?
                OR COALESCE(v.description, '') LIKE ?
                OR CAST(COALESCE(v.voucher_sequence_number, v.voucher_number) AS TEXT) LIKE ?
            )`);
            const term = `%${filters.search}%`;
            params.push(term, term, term, term);
        }
        return { whereClause: where.join(' AND '), params };
    }

    async loadCashbox(filters) {
        const { whereClause, params } = this.buildCashboxWhere(filters);
        const rows = await this.queryAll(`
            SELECT v.id, v.voucher_number, v.voucher_sequence_number,
                   COALESCE(v.voucher_sequence_number, v.voucher_number) AS voucher_display_number,
                   v.voucher_type, v.branch_id, COALESCE(b.branch_name, '-') AS branch_name,
                   v.counterparty_name, v.amount, v.reference_no, v.description,
                   v.voucher_date, v.created_by, v.created_at
            FROM cashbox_vouchers v
            LEFT JOIN branches b ON b.id = v.branch_id
            WHERE ${whereClause}
            ORDER BY v.voucher_date DESC,
                     COALESCE(v.voucher_sequence_number, v.voucher_number) DESC,
                     v.id DESC
        `, params);
        const data = Array.isArray(rows) ? rows : [];
        const openingRow = await this.queryOne(`
            SELECT COALESCE(SUM(opening_balance), 0) AS total_opening
            FROM branch_cashboxes
            ${filters.branchId && filters.branchId !== 'all' ? 'WHERE branch_id = ?' : ''}
        `, filters.branchId && filters.branchId !== 'all' ? [filters.branchId] : []);
        const openingBalance = toFiniteNumber(openingRow?.total_opening);
        const totalReceipts = data.reduce((sum, row) => row.voucher_type === 'receipt' ? sum + toFiniteNumber(row.amount) : sum, 0);
        const totalPayments = data.reduce((sum, row) => row.voucher_type === 'payment' ? sum + toFiniteNumber(row.amount) : sum, 0);
        return {
            rows: data,
            summary: { openingBalance, totalReceipts, totalPayments, currentBalance: openingBalance + totalReceipts - totalPayments }
        };
    }

    async companyName() {
        try {
            const row = await this.queryOne(`
                SELECT setting_value FROM system_settings
                WHERE category = 'general' AND setting_key = 'company_name'
                ORDER BY id DESC LIMIT 1
            `);
            return clean(row?.setting_value) || 'تصفية برو';
        } catch (_error) {
            return 'تصفية برو';
        }
    }

    async filterLabels(type, filters) {
        const labels = [{
            label: 'الفترة',
            value: filters.dateFrom && filters.dateTo
                ? `${filters.dateFrom} - ${filters.dateTo}`
                : filters.dateFrom ? `من ${filters.dateFrom}` : filters.dateTo ? `حتى ${filters.dateTo}` : 'كل الفترات'
        }];
        if (filters.branchId && filters.branchId !== 'all') {
            const row = await this.queryOne('SELECT branch_name FROM branches WHERE id = ?', [filters.branchId]);
            labels.push({ label: 'الفرع', value: row?.branch_name || filters.branchId });
        }
        if (type === 'atm') {
            if (filters.cashierId && filters.cashierId !== 'all') {
                const row = await this.queryOne('SELECT name FROM cashiers WHERE id = ?', [filters.cashierId]);
                labels.push({ label: 'الكاشير', value: row?.name || filters.cashierId });
            }
            if (filters.operationType && filters.operationType !== 'all') labels.push({ label: 'العملية', value: operationLabel(filters.operationType) });
            if (filters.device && filters.device !== 'all') labels.push({ label: 'الجهاز', value: filters.device });
            if (filters.accountLocation && filters.accountLocation !== 'all') labels.push({ label: 'الحساب', value: filters.accountLocation });
            if (filters.specificAmount) labels.push({ label: 'المبلغ', value: filters.specificAmount });
        } else {
            if (filters.voucherType && filters.voucherType !== 'all') labels.push({ label: 'نوع السند', value: filters.voucherType === 'receipt' ? 'سند قبض' : 'سند صرف' });
            if (filters.search) labels.push({ label: 'البحث', value: filters.search });
        }
        return labels;
    }

    async acquire() {
        if (this.activeGenerators < 1) { this.activeGenerators += 1; return; }
        await new Promise((resolve) => this.queue.push(resolve));
        this.activeGenerators += 1;
    }

    release() {
        this.activeGenerators = Math.max(0, this.activeGenerators - 1);
        const next = this.queue.shift();
        if (next) next();
    }

    async render(payload) {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const error = new Error('PDF generation timed out');
                error.code = 'PDF_GENERATION_TIMEOUT';
                reject(error);
            }, this.generationTimeoutMs);
        });
        try {
            return await Promise.race([this.pdfRenderer.renderOperationalReport(payload), timeout]);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    prune() {
        for (const [key, value] of this.cache.entries()) {
            if (this.now() - value.cachedAt > this.cacheTtlMs) this.cache.delete(key);
        }
        while (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value);
    }

    async getReport(type, query = {}) {
        if (!['atm', 'cashbox'].includes(type)) throw new Error('Unsupported operational report type');
        const filters = normalizeFilters(type, query);
        const [report, companyName, filterLabels] = await Promise.all([
            type === 'atm' ? this.loadAtm(filters) : this.loadCashbox(filters),
            this.companyName(),
            this.filterLabels(type, filters)
        ]);
        const payload = { type, companyName, filters: filterLabels, ...report };
        const version = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('base64url');
        const cacheKey = `${type}:${JSON.stringify(filters)}`;
        this.prune();
        const cached = this.cache.get(cacheKey);
        if (cached?.version === version) return { ...cached, cacheStatus: 'HIT' };

        const inFlightKey = `${cacheKey}:${version}`;
        if (this.inFlight.has(inFlightKey)) return { ...(await this.inFlight.get(inFlightKey)), cacheStatus: 'COALESCED' };
        const promise = (async () => {
            await this.acquire();
            try {
                const raw = await this.render(payload);
                const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw || []);
                if (!isPdfBuffer(buffer)) throw new Error('Generated report is not a valid PDF');
                if (buffer.length > this.maxPdfBytes) throw new Error('Generated report exceeds the size limit');
                const dateValue = filters.dateTo || filters.dateFrom || new Date(this.now());
                const arabicName = type === 'atm' ? 'تقرير-الصراف' : 'تقرير-الصناديق';
                const result = {
                    buffer,
                    etag: createPdfEtag(buffer),
                    version,
                    cachedAt: this.now(),
                    fileName: buildArabicPdfFileName('تصفية', arabicName, dateValue),
                    fallbackFileName: `tasfiya-${type}-report-${sanitizeFilePart(dateForFile(dateValue))}.pdf`
                };
                this.cache.set(cacheKey, result);
                this.prune();
                return result;
            } finally {
                this.release();
            }
        })();
        this.inFlight.set(inFlightKey, promise);
        try {
            return { ...(await promise), cacheStatus: 'MISS' };
        } finally {
            this.inFlight.delete(inFlightKey);
        }
    }

    async close() {
        this.cache.clear();
    }
}

module.exports = { OperationalReportsPdfService, addAtmOperationFilter, normalizeFilters, operationLabel };
