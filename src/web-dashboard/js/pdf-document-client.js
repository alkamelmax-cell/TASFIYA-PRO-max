(function tasfiyaPdfDocumentClientBootstrap() {
    'use strict';

    const CACHE_TTL_MS = 5 * 60 * 1000;
    const REQUEST_TIMEOUT_MS = 60 * 1000;
    const cache = new Map();
    let activeObjectUrl = '';

    function safeName(value, fallback = 'report.pdf') {
        const name = String(value || fallback)
            .replace(/[\\/:*?"<>|\r\n]+/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
        return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
    }

    function androidBridgeMethod(name) {
        const bridge = window.TasfiyaAndroid;
        return bridge && typeof bridge[name] === 'function' ? bridge[name].bind(bridge) : null;
    }

    function nativeOptions(options) {
        return {
            url: new URL(options.url, window.location.href).href,
            fileName: safeName(options.fileName),
            title: options.title || safeName(options.fileName)
        };
    }

    function runAndroidPdfAction(methodName, options) {
        const method = androidBridgeMethod(methodName);
        if (!method) return false;
        const native = nativeOptions(options);
        const accepted = method(native.url, native.fileName, native.title);
        if (accepted === false) throw new Error('تعذر بدء عملية PDF في التطبيق');
        return true;
    }

    function nameFromHeader(value, fallback) {
        const header = String(value || '');
        const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8) {
            try { return safeName(decodeURIComponent(utf8[1]), fallback); } catch (_error) { /* fallback */ }
        }
        const plain = header.match(/filename="?([^";]+)"?/i);
        return safeName(plain ? plain[1] : fallback, fallback);
    }

    async function responseError(response) {
        try {
            const payload = await response.clone().json();
            const message = String(payload?.error || '').trim();
            const details = [
                payload?.stage ? `stage=${payload.stage}` : '',
                payload?.errorCode ? `code=${payload.errorCode}` : '',
                payload?.detail ? `detail=${payload.detail}` : '',
                payload?.requestId ? `requestId=${payload.requestId}` : ''
            ].filter(Boolean);
            console.error('[PDF API] Error response:', payload);
            return [message, details.length ? `(${details.join(', ')})` : ''].filter(Boolean).join(' ');
        } catch (_error) {
            return '';
        }
    }

    function ensureUi() {
        if (document.getElementById('tasfiyaPdfViewer')) return;
        const style = document.createElement('style');
        style.textContent = `
            .tasfiya-pdf-viewer{position:fixed;inset:0;z-index:20000;background:rgba(2,19,17,.82);backdrop-filter:blur(7px);display:none;align-items:center;justify-content:center;padding:18px;direction:rtl}
            .tasfiya-pdf-viewer.is-open{display:flex}
            .tasfiya-pdf-shell{width:min(1180px,100%);height:min(94vh,920px);background:#f7faf9;border:1px solid rgba(255,255,255,.22);border-radius:18px;overflow:hidden;box-shadow:0 28px 90px rgba(0,0,0,.45);display:flex;flex-direction:column}
            .tasfiya-pdf-toolbar{min-height:66px;background:#0e3a36;color:#fff;display:flex;align-items:center;gap:10px;padding:12px 16px}
            .tasfiya-pdf-title{font:800 16px Tahoma,Arial,sans-serif;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .tasfiya-pdf-action{border:1px solid rgba(255,255,255,.25);background:#fff;color:#153d39;border-radius:11px;padding:10px 15px;font:700 13px Tahoma,Arial,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:7px}
            .tasfiya-pdf-action.primary{background:#47c9bd;border-color:#47c9bd;color:#082d2a}
            .tasfiya-pdf-close{width:42px;height:42px;padding:0;justify-content:center;font-size:22px;background:transparent;color:#fff}
            .tasfiya-pdf-frame{width:100%;height:100%;border:0;background:#e8eeec;flex:1}
            .tasfiya-pdf-toast{position:fixed;z-index:21000;left:50%;bottom:26px;transform:translate(-50%,20px);opacity:0;background:#173d39;color:#fff;border-radius:12px;padding:12px 18px;font:700 13px Tahoma,Arial,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.3);transition:.2s;pointer-events:none;max-width:min(92vw,560px);text-align:center}
            .tasfiya-pdf-toast.show{opacity:1;transform:translate(-50%,0)}
            .tasfiya-pdf-toast.error{background:#a93646}
            @media(max-width:700px){.tasfiya-pdf-viewer{padding:0}.tasfiya-pdf-shell{height:100vh;border-radius:0}.tasfiya-pdf-toolbar{flex-wrap:wrap}.tasfiya-pdf-title{width:100%;flex-basis:100%;order:-1}.tasfiya-pdf-action{flex:1;justify-content:center;padding:9px}.tasfiya-pdf-close{flex:0 0 42px}}
        `;
        document.head.appendChild(style);

        const viewer = document.createElement('div');
        viewer.id = 'tasfiyaPdfViewer';
        viewer.className = 'tasfiya-pdf-viewer';
        viewer.innerHTML = `
            <section class="tasfiya-pdf-shell" role="dialog" aria-modal="true" aria-label="عارض PDF">
                <header class="tasfiya-pdf-toolbar">
                    <div class="tasfiya-pdf-title" id="tasfiyaPdfTitle">معاينة التقرير</div>
                    <button class="tasfiya-pdf-action primary" type="button" data-pdf-action="share">مشاركة</button>
                    <button class="tasfiya-pdf-action" type="button" data-pdf-action="download">تنزيل</button>
                    <button class="tasfiya-pdf-action tasfiya-pdf-close" type="button" data-pdf-action="close" aria-label="إغلاق">×</button>
                </header>
                <iframe class="tasfiya-pdf-frame" id="tasfiyaPdfFrame" title="معاينة ملف PDF"></iframe>
            </section>`;
        document.body.appendChild(viewer);

        const toast = document.createElement('div');
        toast.id = 'tasfiyaPdfToast';
        toast.className = 'tasfiya-pdf-toast';
        document.body.appendChild(toast);

        viewer.addEventListener('click', (event) => {
            if (event.target === viewer || event.target.closest('[data-pdf-action="close"]')) closeViewer();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeViewer();
        });
    }

    let toastTimer = 0;
    function notify(message, type = 'info') {
        ensureUi();
        const toast = document.getElementById('tasfiyaPdfToast');
        toast.textContent = message;
        toast.classList.toggle('error', type === 'error');
        toast.classList.add('show');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove('show'), type === 'error' ? 5200 : 2400);
    }

    async function fetchPdf(options) {
        const url = new URL(options.url, window.location.href).href;
        const key = options.cacheKey || url;
        const cached = cache.get(key);
        if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.value;

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const promise = (async () => {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { Accept: 'application/pdf', 'X-Tasfiya-PDF-Client': '2' },
                signal: controller.signal
            });
            if (!response.ok) {
                const message = await responseError(response);
                throw new Error(message || `تعذر تجهيز التقرير (رمز ${response.status})`);
            }
            const blob = await response.blob();
            const signature = await blob.slice(0, 5).text();
            if (!blob.size || signature !== '%PDF-') throw new Error('الخادم لم يُرجع ملف PDF صالحًا');
            const fileName = nameFromHeader(response.headers.get('content-disposition'), safeName(options.fileName));
            const file = typeof File === 'function'
                ? new File([blob], fileName, { type: 'application/pdf', lastModified: Date.now() })
                : null;
            return { blob, file, fileName, title: options.title || fileName, url };
        })();
        cache.set(key, { createdAt: Date.now(), value: promise });
        try {
            const value = await promise;
            cache.set(key, { createdAt: Date.now(), value });
            return value;
        } catch (error) {
            cache.delete(key);
            if (error?.name === 'AbortError') throw new Error('انتهت مهلة تجهيز التقرير');
            console.error('[PDF CLIENT] Fetch failed:', { url, error });
            throw error;
        } finally {
            window.clearTimeout(timeout);
        }
    }

    function downloadPrepared(prepared) {
        const url = URL.createObjectURL(prepared.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = prepared.fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        notify('تم تنزيل ملف PDF');
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function sharePrepared(prepared) {
        if (androidBridgeMethod('sharePdf')) {
            const accepted = window.TasfiyaAndroid.sharePdf(
                await blobToBase64(prepared.blob), prepared.fileName, prepared.title
            );
            if (accepted !== false) return 'android-share';
        }
        if (prepared.file && typeof navigator.share === 'function') {
            const canShare = typeof navigator.canShare !== 'function' || navigator.canShare({ files: [prepared.file] });
            if (canShare) {
                await navigator.share({ files: [prepared.file], title: prepared.title });
                return 'web-share';
            }
        }
        downloadPrepared(prepared);
        return 'download';
    }

    function closeViewer() {
        const viewer = document.getElementById('tasfiyaPdfViewer');
        if (!viewer) return;
        viewer.classList.remove('is-open');
        document.getElementById('tasfiyaPdfFrame').removeAttribute('src');
        if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = '';
    }

    async function open(options) {
        ensureUi();
        if (runAndroidPdfAction('openPdfFromUrl', options)) {
            return { mode: 'android-preview' };
        }
        notify('جاري تجهيز التقرير...');
        try {
            const prepared = await fetchPdf(options);
            if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
            activeObjectUrl = URL.createObjectURL(prepared.blob);
            const viewer = document.getElementById('tasfiyaPdfViewer');
            document.getElementById('tasfiyaPdfTitle').textContent = prepared.title;
            document.getElementById('tasfiyaPdfFrame').src = activeObjectUrl;
            viewer.querySelector('[data-pdf-action="download"]').onclick = () => downloadPrepared(prepared);
            viewer.querySelector('[data-pdf-action="share"]').onclick = async () => {
                try { await sharePrepared(prepared); } catch (error) {
                    if (error?.name !== 'AbortError') notify(error.message || 'تعذرت المشاركة', 'error');
                }
            };
            viewer.classList.add('is-open');
            return { mode: 'preview', prepared };
        } catch (error) {
            notify(error.message || 'تعذر تجهيز التقرير', 'error');
            throw error;
        }
    }

    async function share(options) {
        if (runAndroidPdfAction('sharePdfFromUrl', options)) {
            return { mode: 'android-share' };
        }
        notify('جاري تجهيز التقرير للمشاركة...');
        try {
            const prepared = await fetchPdf(options);
            return { mode: await sharePrepared(prepared), prepared };
        } catch (error) {
            if (error?.name !== 'AbortError') notify(error.message || 'تعذرت المشاركة', 'error');
            throw error;
        }
    }

    async function download(options) {
        if (runAndroidPdfAction('downloadPdfFromUrl', options)) {
            return { mode: 'android-download' };
        }
        notify('جاري تجهيز التقرير للتنزيل...');
        const prepared = await fetchPdf(options);
        downloadPrepared(prepared);
        return { mode: 'download', prepared };
    }

    window.TasfiyaPdf = Object.freeze({ close: closeViewer, download, fetch: fetchPdf, notify, open, share });
})();
