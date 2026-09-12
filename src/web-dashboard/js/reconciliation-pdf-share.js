(function reconciliationPdfShareBootstrap() {
    'use strict';

    function normalizeId(value) {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0) throw new Error('رقم التصفية غير صالح');
        return id;
    }

    function fileDate(value) {
        const date = value ? new Date(value) : new Date();
        return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
    }

    function safe(value, fallback) {
        return String(value || fallback).replace(/[\\/:*?"<>|\r\n]+/g, '-').replace(/\s+/g, '-').trim();
    }

    function clientOptions(id, options = {}) {
        const normalizedId = normalizeId(id);
        const cashier = options.cashierName || options.cashier_name || 'كاشير';
        const date = options.date || options.reconciliationDate || options.reconciliation_date;
        return {
            url: `/api/reconciliation/${normalizedId}/report.pdf`,
            fileName: `تصفية-${safe(cashier, 'كاشير')}-${fileDate(date)}-${normalizedId}.pdf`,
            title: `تقرير التصفية رقم ${normalizedId}`,
            cacheKey: `reconciliation:${normalizedId}`
        };
    }

    function client() {
        if (!window.TasfiyaPdf) throw new Error('عارض PDF غير جاهز');
        return window.TasfiyaPdf;
    }

    window.TasfiyaPdfShare = Object.freeze({
        prepare(id, options) { return client().fetch(clientOptions(id, options)); },
        preview(id, options) { return client().open(clientOptions(id, options)); },
        share(id, options) { return client().share(clientOptions(id, options)); },
        download(id, options) { return client().download(clientOptions(id, options)); },
        reportPath(id) { return clientOptions(id).url; }
    });
})();
