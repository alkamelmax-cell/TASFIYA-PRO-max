(function operationalReportShareBootstrap() {
    'use strict';

    const definitions = {
        atm: { path: '/api/reports/atm.pdf', title: 'تقرير عمليات الصراف والبطاقات' },
        cashbox: { path: '/api/reports/cashboxes.pdf', title: 'تقرير حركة الصناديق' }
    };

    function buildPath(type, filters = {}) {
        const definition = definitions[type];
        if (!definition) throw new Error('نوع التقرير غير مدعوم');
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            const normalized = String(value == null ? '' : value).trim();
            if (normalized && normalized !== 'all') params.set(key, normalized);
        });
        const query = params.toString();
        return query ? `${definition.path}?${query}` : definition.path;
    }

    function fileName(type, filters = {}) {
        const date = filters.dateTo || filters.dateFrom || new Date().toISOString().slice(0, 10);
        return `tasfiya-${type}-report-${date}.pdf`;
    }

    function options(type, filters = {}) {
        if (!window.TasfiyaPdf) throw new Error('عارض PDF غير جاهز');
        return {
            url: buildPath(type, filters),
            fileName: fileName(type, filters),
            title: definitions[type].title,
            cacheKey: `${type}:${JSON.stringify(filters)}`
        };
    }

    window.TasfiyaOperationalReport = Object.freeze({
        path: buildPath,
        view(type, filters) { return window.TasfiyaPdf.open(options(type, filters)); },
        share(type, filters) { return window.TasfiyaPdf.share(options(type, filters)); },
        download(type, filters) { return window.TasfiyaPdf.download(options(type, filters)); }
    });
})();
