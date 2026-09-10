(function reconciliationPdfShareBootstrap() {
    'use strict';

    const preparedReports = new Map();
    const PREPARED_TTL_MS = 5 * 60 * 1000;
    const REQUEST_TIMEOUT_MS = 90 * 1000;

    function normalizeId(value) {
        const numeric = Number(value);
        if (!Number.isInteger(numeric) || numeric <= 0) {
            throw new Error('رقم التصفية غير صالح');
        }
        return numeric;
    }

    function reportPath(id, download) {
        return `/api/reconciliation/${normalizeId(id)}/report.pdf${download ? '?download=1' : ''}`;
    }

    function reportFileName(id) {
        return `tasfiya-reconciliation-${normalizeId(id)}.pdf`;
    }

    async function readError(response) {
        try {
            const payload = await response.clone().json();
            return payload && payload.error ? payload.error : '';
        } catch (_error) {
            return '';
        }
    }

    async function fetchReport(id) {
        const normalizedId = normalizeId(id);
        const existing = preparedReports.get(normalizedId);
        if (existing && Date.now() - existing.createdAt < PREPARED_TTL_MS) {
            return existing.promise;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const promise = (async () => {
            const response = await fetch(reportPath(normalizedId, false), {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { Accept: 'application/pdf' },
                signal: controller.signal
            });

            if (!response.ok) {
                const serverMessage = await readError(response);
                throw new Error(serverMessage || `تعذر تجهيز التقرير (HTTP ${response.status})`);
            }

            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            if (!contentType.includes('application/pdf')) {
                throw new Error('استجابة الخادم ليست ملف PDF');
            }

            const blob = await response.blob();
            const signature = await blob.slice(0, 5).text();
            if (blob.size === 0 || signature !== '%PDF-') {
                throw new Error('ملف التقرير غير صالح');
            }

            const fileName = reportFileName(normalizedId);
            const file = typeof File === 'function'
                ? new File([blob], fileName, { type: 'application/pdf', lastModified: Date.now() })
                : null;
            return { blob, file, fileName };
        })();

        preparedReports.set(normalizedId, { createdAt: Date.now(), promise });
        try {
            return await promise;
        } catch (error) {
            preparedReports.delete(normalizedId);
            if (error && error.name === 'AbortError') {
                throw new Error('انتهت مهلة تجهيز التقرير. حاول مرة أخرى.');
            }
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function downloadBlob(blob, fileName) {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
    }

    async function prepare(id) {
        return fetchReport(id);
    }

    async function share(id, options = {}) {
        const normalizedId = normalizeId(id);
        const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
        const absoluteUrl = new URL(reportPath(normalizedId, false), window.location.origin).href;
        const fileName = reportFileName(normalizedId);

        if (
            window.TasfiyaAndroid
            && typeof window.TasfiyaAndroid.sharePdfFromUrl === 'function'
        ) {
            onStatus('جاري تجهيز ملف PDF للمشاركة...');
            const accepted = window.TasfiyaAndroid.sharePdfFromUrl(
                absoluteUrl,
                fileName,
                `مشاركة تصفية رقم ${normalizedId}`
            );
            if (accepted) return { mode: 'android-share' };
        }

        onStatus('جاري تجهيز ملف PDF للمشاركة...');
        const prepared = await fetchReport(normalizedId);
        if (
            prepared.file
            && navigator.share
            && navigator.canShare
            && navigator.canShare({ files: [prepared.file] })
        ) {
            try {
                await navigator.share({
                    files: [prepared.file],
                    title: `تقرير التصفية رقم ${normalizedId}`
                });
                return { mode: 'web-share' };
            } catch (error) {
                if (error && error.name === 'AbortError') return { mode: 'cancelled' };
                console.warn('[PDF Share] Native web share failed; downloading instead:', error);
            }
        }

        downloadBlob(prepared.blob, prepared.fileName);
        return { mode: 'download' };
    }

    async function download(id, options = {}) {
        const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
        onStatus('جاري تجهيز ملف PDF للتنزيل...');
        const prepared = await fetchReport(id);
        downloadBlob(prepared.blob, prepared.fileName);
        return { mode: 'download' };
    }

    window.TasfiyaPdfShare = Object.freeze({
        download,
        prepare,
        reportPath,
        share
    });
})();

