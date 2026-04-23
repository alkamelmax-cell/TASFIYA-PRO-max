let bootstrapState = {
    appName: 'تصفية برو - عميل طلب التصفية',
    baseUrl: '',
    currentUser: null,
    sessionActive: false,
    offlineMode: false,
    counts: {}
};

let user = null;
let atmsData = [];
let cashiersList = [];

let cashItems = [];
let bankItems = [];
let postpaidItems = [];
let custReceiptItems = [];
let returnItems = [];
let supplierItems = [];

const REQUEST_DRAFT_STORAGE_PREFIX = 'tasfiya_client_sender_request_draft_v2';
const DRAFT_AUTOSAVE_DELAY_MS = 180;
let draftAutosaveTimer = null;
let draftAutosaveReady = false;
let initializedDraftWatchers = false;
let initializedNavigation = false;
let initializedBankVisibility = false;
let initializedHistoryActions = false;
let lastActivatedUserId = null;
let isSubmittingRequest = false;
let requestHistory = [];
let currentMainView = 'compose';
let isLoginScreenForcedOpen = false;
let draftRestoreAvailable = false;
let isConnectionPanelUnlocked = false;
let draftSaveState = {
    status: 'idle',
    savedAt: '',
    message: ''
};

function setLoginFeedback(message, type = '') {
    const feedbackEl = document.getElementById('loginFeedback');
    if (!feedbackEl) {
        return;
    }

    const normalizedMessage = String(message || '').trim();
    const normalizedType = type || (normalizedMessage && normalizedMessage.includes('جاري') ? 'loading' : 'info');

    const iconClassByType = {
        loading: 'fas fa-spinner fa-spin',
        error: 'fas fa-circle-exclamation',
        success: 'fas fa-circle-check',
        warning: 'fas fa-triangle-exclamation',
        info: 'fas fa-circle-info'
    };

    const ariaLive = normalizedType === 'error' ? 'assertive' : 'polite';
    const textEl = document.createElement('span');
    textEl.className = 'login-feedback-text';
    textEl.textContent = normalizedMessage;

    feedbackEl.innerHTML = '';
    feedbackEl.className = 'login-feedback mt-3';
    feedbackEl.setAttribute('role', normalizedType === 'error' ? 'alert' : 'status');
    feedbackEl.setAttribute('aria-live', ariaLive);

    if (!normalizedMessage) {
        feedbackEl.classList.add('is-empty');
        return;
    }

    feedbackEl.classList.add(normalizedType);

    const iconWrapper = document.createElement('span');
    iconWrapper.className = 'login-feedback-icon';
    iconWrapper.setAttribute('aria-hidden', 'true');

    const iconEl = document.createElement('i');
    iconEl.className = iconClassByType[normalizedType] || iconClassByType.info;
    iconWrapper.appendChild(iconEl);

    feedbackEl.append(iconWrapper, textEl);
}

function toggleLoginScreen(show) {
    const screen = document.getElementById('loginScreen');
    screen.classList.toggle('hidden', !show);
}

function setConnectionPanelOpen(open) {
    const panel = document.getElementById('loginConnectionPanel');
    const toggleBtn = document.getElementById('toggleConnectionPanelBtn');
    const shouldOpen = Boolean(open);

    if (!shouldOpen) {
        isConnectionPanelUnlocked = false;
    }

    panel.classList.toggle('hidden', !shouldOpen);
    toggleBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    toggleBtn.innerHTML = shouldOpen
        ? '<i class="fas fa-lock-open me-1"></i> إخفاء الإعدادات'
        : '<i class="fas fa-lock me-1"></i> إعدادات الاتصال';
    renderConnectionSecurityState();
}

function renderConnectionSecurityState() {
    const chip = document.getElementById('connectionSecurityChip');
    if (!chip) {
        return;
    }

    if (isConnectionPanelUnlocked) {
        chip.className = 'login-security-chip is-unlocked';
        chip.innerHTML = '<i class="fas fa-lock-open"></i><span>الإعدادات مفتوحة الآن</span>';
        return;
    }

    chip.className = 'login-security-chip is-secured';
    chip.innerHTML = '<i class="fas fa-user-shield"></i><span>محمية بحساب الأدمن</span>';
}

function formatBaseUrlLabel(baseUrl) {
    const normalizedValue = String(baseUrl || '').trim();
    if (!normalizedValue) {
        return 'الخادم الافتراضي';
    }

    try {
        const parsed = new URL(normalizedValue);
        const pathSuffix = parsed.pathname && parsed.pathname !== '/'
            ? parsed.pathname.replace(/\/+$/, '')
            : '';
        return `${parsed.host}${pathSuffix}`;
    } catch (_error) {
        return normalizedValue;
    }
}

function openLoginScreen(options = {}) {
    isLoginScreenForcedOpen = true;
    toggleLoginScreen(true);
    setConnectionPanelOpen(Boolean(options.showConnectionSettings));
}

function focusLoginEntry() {
    const cashierSelect = document.getElementById('cashierSelect');
    const pinInput = document.getElementById('loginPin');

    if (cashierSelect && !cashierSelect.value) {
        cashierSelect.focus();
        return;
    }

    if (pinInput) {
        pinInput.focus();
        pinInput.select();
    }
}

function setMainView(mode) {
    currentMainView = mode === 'history' ? 'history' : 'compose';

    const composeBtn = document.getElementById('composeViewBtn');
    const historyBtn = document.getElementById('historyViewBtn');
    const composeSection = document.getElementById('composeViewSection');
    const historySection = document.getElementById('historyViewSection');

    composeBtn.classList.toggle('active', currentMainView === 'compose');
    historyBtn.classList.toggle('active', currentMainView === 'history');
    composeSection.classList.toggle('hidden-section', currentMainView !== 'compose');
    historySection.classList.toggle('hidden-section', currentMainView !== 'history');
}

function formatCurrency(value) {
    return Number(value || 0).toFixed(2);
}

function padDatePart(value) {
    return String(value).padStart(2, '0');
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        const year = date.getFullYear();
        const month = padDatePart(date.getMonth() + 1);
        const day = padDatePart(date.getDate());
        const hours24 = date.getHours();
        const minutes = padDatePart(date.getMinutes());
        const period = hours24 >= 12 ? 'PM' : 'AM';
        const hours12 = hours24 % 12 || 12;

        return `${year}-${month}-${day} ${padDatePart(hours12)}:${minutes} ${period}`;
    } catch (_error) {
        return value;
    }
}

function formatTimeOnly(value) {
    if (!value) {
        return '';
    }

    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        const hours24 = date.getHours();
        const minutes = padDatePart(date.getMinutes());
        const period = hours24 >= 12 ? 'PM' : 'AM';
        const hours12 = hours24 % 12 || 12;

        return `${padDatePart(hours12)}:${minutes} ${period}`;
    } catch (_error) {
        return '';
    }
}

function getRequestStatusMeta(status) {
    switch (status) {
    case 'sent':
        return { label: 'مرسل', className: 'sent' };
    case 'queued':
        return { label: 'معلق', className: 'queued' };
    case 'sending':
        return { label: 'جارٍ الإرسال', className: 'sending' };
    case 'failed':
        return { label: 'فشل', className: 'failed' };
    default:
        return { label: 'مسودة', className: 'queued' };
    }
}

function getVisibleHistoryRequests() {
    const nonDraftRequests = Array.isArray(requestHistory)
        ? requestHistory.filter((request) => request && request.status !== 'draft')
        : [];

    if (!user || !user.id) {
        return nonDraftRequests;
    }

    return nonDraftRequests.filter((request) => (
        !request.cashier_id || String(request.cashier_id) === String(user.id)
    ));
}

function renderCashiersList(selectedCashierId = '') {
    const select = document.getElementById('cashierSelect');
    if (!cashiersList.length) {
        select.innerHTML = '<option value="">لا توجد أسماء متاحة</option>';
        return;
    }

    const options = cashiersList.map((cashier) => {
        const branchName = cashier.branch_name ? ` - ${cashier.branch_name}` : '';
        const pinSuffix = cashier.has_pin ? '' : ' - بدون رمز';
        const disabled = cashier.active === 0 ? ' disabled' : '';
        const selected = String(selectedCashierId || '') === String(cashier.id) ? ' selected' : '';
        return `<option value="${cashier.id}"${selected}${disabled}>${cashier.name}${branchName}${pinSuffix}</option>`;
    });

    select.innerHTML = '<option value="">اختر الكاشير...</option>' + options.join('');
}

function updateControlStatus(message, type = '') {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.textContent = message || '';
    statusEl.className = type ? `control-status ${type}` : 'control-status';
}

function getFriendlyLoginErrorMessage(error) {
    const message = String(error && error.message ? error.message : error || '').trim();

    if (!message) {
        return 'تعذر تسجيل الدخول. حاول مرة أخرى.';
    }

    if (message.includes('رمز الدخول غير صحيح')) {
        return 'رمز الدخول غير صحيح. حاول مرة أخرى.';
    }

    if (message.includes('الكاشير غير موجود')) {
        return 'اسم الكاشير غير متاح حاليًا.';
    }

    if (message.includes('لم يتم تعيين رمز لهذا الكاشير')) {
        return 'هذا الكاشير لا يملك رمز دخول حتى الآن.';
    }

    if (message.includes('تعذر الاتصال بالخادم ولا توجد نسخة محلية صالحة')) {
        return 'تعذر الاتصال بالخادم، ولا توجد نسخة محلية صالحة لهذا الكاشير على هذا الجهاز.';
    }

    if (message.includes('تعذر الاتصال بالخادم')) {
        return 'تعذر الاتصال بالخادم. تحقق من الشبكة أو إعدادات الاتصال ثم حاول مرة أخرى.';
    }

    return message;
}

function setWorkspaceEnabled(enabled) {
    const workspace = document.getElementById('requestWorkspace');
    workspace.classList.toggle('workspace-disabled', !enabled);
}

function hasAuthenticatedSession() {
    return Boolean(
        bootstrapState.currentUser
        && (bootstrapState.sessionActive || bootstrapState.offlineMode)
    );
}

function createUnauthorizedError(message = 'انتهت الجلسة، يرجى تسجيل الدخول من جديد') {
    const error = new Error(message);
    error.code = 401;
    return error;
}

function updateSessionIndicator() {
    const indicator = document.getElementById('sessionIndicator');
    const labelEl = indicator.querySelector('span');

    if (bootstrapState.offlineMode && bootstrapState.currentUser) {
        indicator.className = 'control-badge warning';
        labelEl.textContent = 'وضع أوفلاين';
        return;
    }

    if (bootstrapState.sessionActive && bootstrapState.currentUser) {
        indicator.className = 'control-badge success';
        labelEl.textContent = 'متصل';
        return;
    }

    indicator.className = 'control-badge warning';
    labelEl.textContent = 'بانتظار الدخول';
}

function updatePendingIndicator() {
    const indicator = document.getElementById('pendingIndicator');
    const labelEl = indicator.querySelector('span');
    const counts = bootstrapState.counts || {};
    const pendingCount = Number(counts.queued || 0) + Number(counts.failed || 0) + Number(counts.sending || 0);

    indicator.className = pendingCount > 0 ? 'control-badge warning' : 'control-badge';
    labelEl.textContent = `${pendingCount} معلّق`;
}

function renderRestoreDraftButton() {
    const container = document.getElementById('restoreDraftContainer');
    const button = document.getElementById('restoreDraftBtn');
    if (!button || !container) {
        return;
    }

    const enabled = Boolean(draftRestoreAvailable && hasAuthenticatedSession());
    container.classList.toggle('hidden-section', !enabled);
    button.disabled = !enabled;
    button.title = enabled
        ? 'تحميل آخر مسودة محفوظة على هذا الجهاز'
        : (hasAuthenticatedSession() ? 'لا توجد مسودة محفوظة قابلة للاستعادة' : 'سجّل دخول الكاشير أولاً');
}

function setDraftRestoreAvailability(value) {
    draftRestoreAvailable = Boolean(value);
    renderRestoreDraftButton();
}

function renderDraftSaveState() {
    const badge = document.getElementById('draftSaveIndicator');
    const meta = document.getElementById('draftSaveMeta');
    if (!badge || !meta) {
        return;
    }

    const labelEl = badge.querySelector('span');
    const { status, savedAt, message } = draftSaveState;
    const savedAtLabel = formatTimeOnly(savedAt);

    if (status === 'dirty') {
        badge.className = 'control-badge warning draft-save-badge';
        labelEl.textContent = 'جارٍ حفظ المسودة';
        meta.textContent = message || 'سيتم حفظ آخر التغييرات على هذا الجهاز خلال لحظات.';
        return;
    }

    if (status === 'saved') {
        badge.className = 'control-badge success draft-save-badge';
        labelEl.textContent = 'المسودة محفوظة';
        meta.textContent = message || (savedAtLabel ? `آخر حفظ ${savedAtLabel}` : 'تم حفظ بياناتك على هذا الجهاز.');
        return;
    }

    if (status === 'restored') {
        badge.className = 'control-badge success draft-save-badge';
        labelEl.textContent = 'تمت الاستعادة';
        meta.textContent = message || (savedAtLabel ? `تم تحميل آخر مسودة محفوظة من ${savedAtLabel}` : 'تم تحميل آخر مسودة محفوظة.');
        return;
    }

    if (status === 'error') {
        badge.className = 'control-badge warning draft-save-badge';
        labelEl.textContent = 'حفظ جزئي';
        meta.textContent = message || 'تم حفظ نسخة محلية، لكن النسخة الاحتياطية لم تُحدّث بالكامل.';
        return;
    }

    badge.className = 'control-badge draft-save-badge';
    labelEl.textContent = 'الحفظ التلقائي';
    if (message) {
        meta.textContent = message;
        return;
    }
    meta.textContent = hasAuthenticatedSession()
        ? 'لا توجد مسودة محفوظة حاليًا.'
        : 'سيبدأ الحفظ بعد تسجيل دخول الكاشير.';
}

function setDraftSaveState(status = 'idle', options = {}) {
    draftSaveState = {
        status,
        savedAt: Object.prototype.hasOwnProperty.call(options, 'savedAt')
            ? (options.savedAt || '')
            : draftSaveState.savedAt,
        message: Object.prototype.hasOwnProperty.call(options, 'message')
            ? (options.message || '')
            : ''
    };

    if (status === 'idle' && !Object.prototype.hasOwnProperty.call(options, 'savedAt')) {
        draftSaveState.savedAt = '';
    }

    renderDraftSaveState();
}

function renderBootstrap(bootstrap) {
    bootstrapState = {
        ...bootstrapState,
        ...(bootstrap || {})
    };

    user = bootstrapState.currentUser || null;

    document.title = bootstrapState.appName || document.title;
    document.getElementById('userNameDisplay').textContent = user && user.name ? user.name : 'غير محدد';
    document.getElementById('loginBaseUrl').value = bootstrapState.baseUrl || '';
    document.getElementById('logoutBtn').disabled = !hasAuthenticatedSession();
    document.getElementById('resendPendingBtn').disabled = !hasAuthenticatedSession();
    document.getElementById('newRequestBtn').disabled = !hasAuthenticatedSession();
    document.getElementById('showLoginBtn').disabled = false;
    document.getElementById('closeLoginBtn').style.display = hasAuthenticatedSession() ? '' : 'none';
    document.getElementById('serverSummaryText').textContent = formatBaseUrlLabel(bootstrapState.baseUrl);
    document.getElementById('loginServerSummary').textContent = formatBaseUrlLabel(bootstrapState.baseUrl);

    if (user && user.id) {
        renderCashiersList(user.id);
    }

    updateSessionIndicator();
    updatePendingIndicator();
    renderDraftSaveState();
    renderRestoreDraftButton();
    renderConnectionSecurityState();
    toggleLoginScreen(isLoginScreenForcedOpen || !hasAuthenticatedSession());
}

function renderRequestHistory() {
    const body = document.getElementById('requestHistoryBody');
    const emptyState = document.getElementById('historyEmptyState');
    const tableWrapper = document.getElementById('historyTableWrapper');
    const visibleRequests = getVisibleHistoryRequests();

    if (!visibleRequests.length) {
        body.innerHTML = '';
        emptyState.classList.remove('hidden-section');
        tableWrapper.classList.add('hidden-section');
        return;
    }

    emptyState.classList.add('hidden-section');
    tableWrapper.classList.remove('hidden-section');

    body.innerHTML = visibleRequests.map((request) => {
        const statusMeta = getRequestStatusMeta(request.status);
        const canResend = ['queued', 'failed'].includes(request.status);
        const canAdminResend = request.status === 'sent';
        const localLabel = request.local_request_id
            ? request.local_request_id.replace(/^.*?-(\d+)-(\d+)$/, '#$1-$2')
            : `#${request.id}`;
        const resendMeta = request.payload && request.payload.resend_meta ? request.payload.resend_meta : null;
        const resendSummary = resendMeta
            ? (() => {
                const originLabel = resendMeta.source_remote_request_id
                    ? `إعادة من سيرفر #${resendMeta.source_remote_request_id}`
                    : (resendMeta.source_request_id ? `إعادة من طلب محلي #${resendMeta.source_request_id}` : 'إعادة معتمدة');
                const adminLabel = resendMeta.approved_by_admin_name || resendMeta.approved_by_admin_username || '';
                return `${originLabel}${adminLabel ? ` | الأدمن: ${adminLabel}` : ''}`;
            })()
            : '';

        return `
            <tr>
                <td>
                    <div class="fw-bold">${localLabel}</div>
                    <div class="history-meta-note">${request.remote_request_id ? `سيرفر #${request.remote_request_id}` : 'محلي'}</div>
                    ${resendSummary ? `<div class="history-meta-note">${resendSummary}</div>` : ''}
                </td>
                <td><span class="history-status-badge ${statusMeta.className}">${statusMeta.label}</span></td>
                <td>${formatCurrency(request.total_cash)}</td>
                <td>${formatCurrency(request.total_bank)}</td>
                <td>${formatCurrency(request.system_sales)}</td>
                <td>
                    <div>${formatDateTime(request.updated_at)}</div>
                    ${request.last_error ? `<div class="history-meta-note text-danger">${request.last_error}</div>` : ''}
                </td>
                <td>
                    <div class="history-actions">
                        <button class="history-action-btn preview" type="button" data-action="preview-request" data-request-id="${request.id}">
                            عرض
                        </button>
                        ${canResend ? `
                            <button class="history-action-btn resend" type="button" data-action="resend-request" data-request-id="${request.id}">
                                إعادة إرسال
                            </button>
                        ` : ''}
                        ${canAdminResend ? `
                            <button class="history-action-btn resend" type="button" data-action="admin-resend-request" data-request-id="${request.id}">
                                إعادة بأدمن
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function refreshRequestHistory(limit = 40) {
    try {
        const requests = await window.clientSender.listRecentRequests(limit);
        requestHistory = Array.isArray(requests) ? requests : [];
        renderRequestHistory();
    } catch (error) {
        updateControlStatus(`تعذر تحميل التصفيات المرسلة: ${error.message}`, 'error');
    }
}

const SWEET_ALERT_DIALOG_DEFAULTS = {
    buttonsStyling: false,
    reverseButtons: true,
    scrollbarPadding: false,
    confirmButtonText: 'حسناً',
    cancelButtonText: 'إلغاء',
    customClass: {
        popup: 'client-dialog-popup',
        title: 'client-dialog-title',
        htmlContainer: 'client-dialog-html',
        actions: 'client-dialog-actions',
        confirmButton: 'client-dialog-confirm',
        cancelButton: 'client-dialog-cancel'
    }
};

function mergeSweetAlertOptions(baseOptions, overrideOptions = {}) {
    const merged = {
        ...baseOptions,
        ...overrideOptions
    };

    merged.customClass = {
        ...(baseOptions.customClass || {}),
        ...(overrideOptions.customClass || {})
    };

    return merged;
}

function showDialog(options = {}) {
    return Swal.fire(mergeSweetAlertOptions(SWEET_ALERT_DIALOG_DEFAULTS, options));
}

function showLoadingDialog(title, text) {
    return showDialog({
        title,
        text,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
    });
}

async function promptVerifyAdminAccess() {
    const suggestedBaseUrl = (
        document.getElementById('loginBaseUrl')?.value.trim()
        || bootstrapState.baseUrl
        || ''
    );

    const result = await showDialog({
        title: 'فتح إعدادات الاتصال',
        html: `
            <div class="client-dialog-stack">
                <div class="client-dialog-caption">أدخل رابط الخادم وبيانات نفس الأدمن المعتمد في التطبيق الأساسي.</div>
                <input id="verifyAdminBaseUrlInput" class="client-dialog-input" type="text" dir="ltr" placeholder="https://tasfiya-pro-max.onrender.com">
                <input id="verifyAdminUsernameInput" class="client-dialog-input" type="text" autocomplete="username" placeholder="اسم المستخدم">
                <input id="verifyAdminPasswordInput" class="client-dialog-input" type="password" autocomplete="current-password" placeholder="كلمة المرور">
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'فتح الإعدادات',
        focusConfirm: false,
        didOpen: () => {
            const baseUrlInput = document.getElementById('verifyAdminBaseUrlInput');
            const usernameInput = document.getElementById('verifyAdminUsernameInput');
            if (baseUrlInput) {
                baseUrlInput.value = suggestedBaseUrl;
            }
            if (usernameInput && suggestedBaseUrl) {
                usernameInput.focus();
            } else if (baseUrlInput) {
                baseUrlInput.focus();
                baseUrlInput.select();
            }
        },
        preConfirm: async () => {
            const baseUrlInput = document.getElementById('verifyAdminBaseUrlInput');
            const usernameInput = document.getElementById('verifyAdminUsernameInput');
            const passwordInput = document.getElementById('verifyAdminPasswordInput');
            const baseUrl = baseUrlInput ? String(baseUrlInput.value || '').trim() : '';
            const username = usernameInput ? String(usernameInput.value || '').trim() : '';
            const password = passwordInput ? String(passwordInput.value || '').trim() : '';

            if (!baseUrl) {
                Swal.showValidationMessage('أدخل رابط الخادم أولاً');
                return false;
            }

            if (!username) {
                Swal.showValidationMessage('أدخل اسم مستخدم الأدمن');
                return false;
            }

            if (!password) {
                Swal.showValidationMessage('أدخل كلمة المرور');
                return false;
            }

            try {
                const verifyResult = await window.clientSender.verifyAdminAccess({
                    baseUrl,
                    username,
                    password
                });
                if (!verifyResult || !verifyResult.success) {
                    Swal.showValidationMessage('بيانات الأدمن غير صحيحة');
                    return false;
                }
                return verifyResult;
            } catch (error) {
                Swal.showValidationMessage(error.message || 'تعذر التحقق من بيانات الأدمن');
                return false;
            }
        }
    });

    return result.isConfirmed ? result.value : null;
}

async function ensureConnectionSettingsAccess() {
    const verifyResult = await promptVerifyAdminAccess();

    if (verifyResult && verifyResult.success) {
        isConnectionPanelUnlocked = true;
        renderConnectionSecurityState();
        return verifyResult;
    }

    isConnectionPanelUnlocked = false;
    renderConnectionSecurityState();
    return null;
}

async function openProtectedConnectionPanel() {
    const verifyResult = await ensureConnectionSettingsAccess();
    if (!verifyResult) {
        setLoginFeedback('إعدادات الاتصال تتطلب بيانات الأدمن.', 'error');
        return false;
    }

    setConnectionPanelOpen(true);
    setLoginFeedback('تم فتح إعدادات الاتصال باستخدام حساب الأدمن.', 'success');
    const baseUrlField = document.getElementById('loginBaseUrl');
    if (baseUrlField) {
        baseUrlField.value = verifyResult.baseUrl || baseUrlField.value || bootstrapState.baseUrl || '';
        baseUrlField.focus();
        baseUrlField.select();
    }
    return true;
}

function showToast(icon, title) {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2600,
        timerProgressBar: true,
        buttonsStyling: false,
        customClass: {
            popup: 'client-toast-popup'
        }
    });

    Toast.fire({ icon, title });
}

function updateSubmitRequestButtonState(isSubmitting) {
    const submitBtn = document.getElementById('submitReconciliationRequestBtn');
    if (!submitBtn) {
        return;
    }

    if (isSubmitting) {
        if (!submitBtn.dataset.originalHtml) {
            submitBtn.dataset.originalHtml = submitBtn.innerHTML;
        }
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> جاري الإرسال...';
        return;
    }

    submitBtn.disabled = false;
    if (submitBtn.dataset.originalHtml) {
        submitBtn.innerHTML = submitBtn.dataset.originalHtml;
    }
}

function setupBankFieldVisibility() {
    if (initializedBankVisibility) {
        return;
    }

    initializedBankVisibility = true;

    const bankOpTypeSelect = document.getElementById('bankOpType');
    const atmFieldContainer = document.getElementById('atmFieldContainer');
    const bankNameFieldContainer = document.getElementById('bankNameFieldContainer');
    const atmSelect = document.getElementById('bankAtmName');
    const bankNameInput = document.getElementById('input_bank_name_v2');

    const applyVisibility = () => {
        const selectedType = bankOpTypeSelect.value;
        if (selectedType === 'transfer') {
            atmFieldContainer.style.display = 'none';
            bankNameFieldContainer.style.display = 'none';
            atmSelect.value = '';
            bankNameInput.value = '';
        } else {
            atmFieldContainer.style.display = 'block';
            bankNameFieldContainer.style.display = 'block';
        }
    };

    bankOpTypeSelect.addEventListener('change', applyVisibility);
    applyVisibility();
}

function getDraftStorageKey() {
    const userIdentifier = user && user.id ? String(user.id) : 'anonymous';
    return `${REQUEST_DRAFT_STORAGE_PREFIX}:${userIdentifier}`;
}

function getCurrentDraftCashierId() {
    return user && user.id ? Number(user.id) || null : null;
}

function readFieldValue(fieldId) {
    const el = document.getElementById(fieldId);
    return el ? (el.value || '') : '';
}

function writeFieldValue(fieldId, value) {
    const el = document.getElementById(fieldId);
    if (el) {
        el.value = value == null ? '' : String(value);
    }
}

function getActiveTabTarget() {
    const activeTab = document.querySelector('#pills-tab .nav-link.active');
    return activeTab ? (activeTab.getAttribute('data-bs-target') || '#tab-cash') : '#tab-cash';
}

function hasMeaningfulDraft(draft) {
    if (!draft || typeof draft !== 'object') {
        return false;
    }

    const lists = draft.lists || {};
    const hasListData = (
        Array.isArray(lists.cashItems) && lists.cashItems.length > 0
    ) || (
        Array.isArray(lists.bankItems) && lists.bankItems.length > 0
    ) || (
        Array.isArray(lists.postpaidItems) && lists.postpaidItems.length > 0
    ) || (
        Array.isArray(lists.custReceiptItems) && lists.custReceiptItems.length > 0
    ) || (
        Array.isArray(lists.returnItems) && lists.returnItems.length > 0
    ) || (
        Array.isArray(lists.supplierItems) && lists.supplierItems.length > 0
    );

    if (hasListData) {
        return true;
    }

    const fields = draft.fields || {};
    const meaningfulFieldIds = [
        'systemSales',
        'notes',
        'cashCountInput',
        'input_bank_amount_v2',
        'postpaidName',
        'postpaidAmount',
        'custReceiptName',
        'custReceiptAmount',
        'returnInv',
        'returnAmount',
        'returnNote',
        'supplierName',
        'supplierInv',
        'supplierAmount'
    ];

    return meaningfulFieldIds.some((fieldId) => {
        const value = fields[fieldId];
        return typeof value === 'string' && value.trim() !== '';
    });
}

function createRequestDraftSnapshot() {
    return {
        version: 2,
        savedAt: new Date().toISOString(),
        activeTabTarget: getActiveTabTarget(),
        lists: {
            cashItems,
            bankItems,
            postpaidItems,
            custReceiptItems,
            returnItems,
            supplierItems
        },
        fields: {
            systemSales: readFieldValue('systemSales'),
            notes: readFieldValue('notes'),
            cashDenomSelect: readFieldValue('cashDenomSelect'),
            cashCountInput: readFieldValue('cashCountInput'),
            bankOpType: readFieldValue('bankOpType'),
            bankAtmName: readFieldValue('bankAtmName'),
            input_bank_name_v2: readFieldValue('input_bank_name_v2'),
            input_bank_amount_v2: readFieldValue('input_bank_amount_v2'),
            postpaidName: readFieldValue('postpaidName'),
            postpaidAmount: readFieldValue('postpaidAmount'),
            custReceiptName: readFieldValue('custReceiptName'),
            custReceiptType: readFieldValue('custReceiptType'),
            custReceiptAmount: readFieldValue('custReceiptAmount'),
            returnInv: readFieldValue('returnInv'),
            returnAmount: readFieldValue('returnAmount'),
            returnNote: readFieldValue('returnNote'),
            supplierName: readFieldValue('supplierName'),
            supplierInv: readFieldValue('supplierInv'),
            supplierAmount: readFieldValue('supplierAmount')
        }
    };
}

function getDraftTimestamp(draft) {
    const timestamp = draft && draft.savedAt ? Date.parse(draft.savedAt) : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function readLocalSavedRequestDraft() {
    const raw = localStorage.getItem(getDraftStorageKey());
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn('Failed to parse reconciliation draft from localStorage', error);
        localStorage.removeItem(getDraftStorageKey());
        return null;
    }
}

function persistWorkingDraftToDatabase(draft) {
    const cashierId = getCurrentDraftCashierId();
    if (!cashierId || !window.clientSender || !window.clientSender.saveWorkingDraft) {
        return;
    }

    window.clientSender.saveWorkingDraft({
        cashierId,
        draft
    }).catch((error) => {
        console.warn('Failed to save reconciliation draft to local database', error);
        setDraftSaveState('error', {
            savedAt: draft && draft.savedAt ? draft.savedAt : '',
            message: 'تم حفظ المسودة على هذا الجهاز، لكن النسخة الاحتياطية لم تُحدّث بالكامل.'
        });
    });
}

function clearWorkingDraftFromDatabase() {
    const cashierId = getCurrentDraftCashierId();
    if (!cashierId || !window.clientSender || !window.clientSender.clearWorkingDraft) {
        return;
    }

    window.clientSender.clearWorkingDraft(cashierId).catch((error) => {
        console.warn('Failed to clear reconciliation draft from local database', error);
    });
}

function persistRequestDraftSnapshot(draft) {
    if (!user) {
        return false;
    }

    if (!hasMeaningfulDraft(draft)) {
        localStorage.removeItem(getDraftStorageKey());
        clearWorkingDraftFromDatabase();
        setDraftSaveState('idle');
        return false;
    }

    localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
    persistWorkingDraftToDatabase(draft);
    setDraftSaveState('saved', {
        savedAt: draft.savedAt
    });
    setDraftRestoreAvailability(true);
    return true;
}

function chooseMostRecentDraft(...drafts) {
    const meaningfulDrafts = drafts.filter((draft) => hasMeaningfulDraft(draft));
    if (!meaningfulDrafts.length) {
        return null;
    }

    meaningfulDrafts.sort((left, right) => getDraftTimestamp(right) - getDraftTimestamp(left));
    return meaningfulDrafts[0];
}

async function loadBestSavedDraft() {
    const localDraft = readLocalSavedRequestDraft();
    let databaseDraft = null;

    if (window.clientSender && window.clientSender.loadWorkingDraft) {
        const cashierId = getCurrentDraftCashierId();
        if (cashierId) {
            const result = await window.clientSender.loadWorkingDraft(cashierId);
            databaseDraft = result && result.success ? result.draft : null;
        }
    }

    return chooseMostRecentDraft(databaseDraft, localDraft);
}

async function refreshDraftRestoreAvailability() {
    if (!hasAuthenticatedSession() || !user) {
        setDraftRestoreAvailability(false);
        return false;
    }

    try {
        const draft = await loadBestSavedDraft();
        const hasDraft = hasMeaningfulDraft(draft);
        setDraftRestoreAvailability(hasDraft);
        return hasDraft;
    } catch (error) {
        console.warn('Failed to inspect saved reconciliation draft', error);
        setDraftRestoreAvailability(Boolean(readLocalSavedRequestDraft()));
        return draftRestoreAvailable;
    }
}

function clearSavedRequestDraft() {
    if (draftAutosaveTimer) {
        clearTimeout(draftAutosaveTimer);
        draftAutosaveTimer = null;
    }

    localStorage.removeItem(getDraftStorageKey());
    clearWorkingDraftFromDatabase();
    setDraftSaveState('idle');
    setDraftRestoreAvailability(false);
}

function saveRequestDraftNow() {
    if (!draftAutosaveReady || !user) {
        return false;
    }

    try {
        const draft = createRequestDraftSnapshot();
        return persistRequestDraftSnapshot(draft);
    } catch (error) {
        console.warn('Failed to save reconciliation draft', error);
        return false;
    }
}

function scheduleRequestDraftSave() {
    if (!draftAutosaveReady || !user) {
        return;
    }

    if (draftAutosaveTimer) {
        clearTimeout(draftAutosaveTimer);
    }

    draftAutosaveTimer = setTimeout(() => {
        draftAutosaveTimer = null;
        saveRequestDraftNow();
    }, DRAFT_AUTOSAVE_DELAY_MS);
    setDraftSaveState('dirty');
}

function renderAllTables() {
    renderTable('cashTableBody', cashItems, ['val', 'qty', 'sub']);
    renderTable('bankTableBody', bankItems, ['opText', 'atm', 'entry_bank_name', 'amount']);
    renderTable('postpaidTableBody', postpaidItems, ['customer_name', 'amount']);
    renderTable('custReceiptTableBody', custReceiptItems, ['customer_name', 'type', 'amount']);
    renderTable('returnTableBody', returnItems, ['num', 'amount', 'note']);
    renderTable('supplierTableBody', supplierItems, ['supplier_name', 'invoice_number', 'amount']);
}

function resetFormCollectionsAndFields(options = {}) {
    const preserveSavedDraft = Boolean(options.preserveSavedDraft);
    const previousDraftAutosaveReady = draftAutosaveReady;

    if (preserveSavedDraft) {
        draftAutosaveReady = false;
        if (draftAutosaveTimer) {
            clearTimeout(draftAutosaveTimer);
            draftAutosaveTimer = null;
        }
    }

    cashItems = [];
    bankItems = [];
    postpaidItems = [];
    custReceiptItems = [];
    returnItems = [];
    supplierItems = [];
    renderAllTables();

    [
        'systemSales',
        'notes',
        'cashDenomSelect',
        'cashCountInput',
        'bankOpType',
        'bankAtmName',
        'input_bank_name_v2',
        'input_bank_amount_v2',
        'postpaidName',
        'postpaidAmount',
        'custReceiptName',
        'custReceiptType',
        'custReceiptAmount',
        'returnInv',
        'returnAmount',
        'returnNote',
        'supplierName',
        'supplierInv',
        'supplierAmount'
    ].forEach((fieldId) => writeFieldValue(fieldId, ''));

    const bankOpType = document.getElementById('bankOpType');
    if (bankOpType) {
        bankOpType.value = 'mada';
        bankOpType.dispatchEvent(new Event('change'));
    }

    const custReceiptType = document.getElementById('custReceiptType');
    if (custReceiptType) {
        custReceiptType.value = 'cash';
    }

    updateUI();

    if (preserveSavedDraft) {
        draftAutosaveReady = previousDraftAutosaveReady;
    }
}

async function restoreRequestDraft(options = {}) {
    try {
        const draft = await loadBestSavedDraft();
        if (!hasMeaningfulDraft(draft)) {
            clearSavedRequestDraft();
            return false;
        }

        persistRequestDraftSnapshot(draft);

        const lists = draft.lists || {};
        cashItems = Array.isArray(lists.cashItems) ? lists.cashItems : [];
        bankItems = Array.isArray(lists.bankItems) ? lists.bankItems : [];
        postpaidItems = Array.isArray(lists.postpaidItems) ? lists.postpaidItems : [];
        custReceiptItems = Array.isArray(lists.custReceiptItems) ? lists.custReceiptItems : [];
        returnItems = Array.isArray(lists.returnItems) ? lists.returnItems : [];
        supplierItems = Array.isArray(lists.supplierItems) ? lists.supplierItems : [];

        renderAllTables();

        const fields = draft.fields || {};
        Object.keys(fields).forEach((fieldId) => {
            writeFieldValue(fieldId, fields[fieldId]);
        });

        if (fields.bankOpType) {
            const bankOpField = document.getElementById('bankOpType');
            if (bankOpField) {
                bankOpField.value = fields.bankOpType;
                bankOpField.dispatchEvent(new Event('change'));
            }
        }

        if (fields.bankAtmName) {
            const bankAtmField = document.getElementById('bankAtmName');
            if (bankAtmField) {
                bankAtmField.value = fields.bankAtmName;
                bankAtmField.dispatchEvent(new Event('change'));
            }
        }

        const targetTab = draft.activeTabTarget;
        if (targetTab && window.bootstrap && bootstrap.Tab) {
            const tabButton = document.querySelector(`#pills-tab .nav-link[data-bs-target="${targetTab}"]`);
            if (tabButton) {
                bootstrap.Tab.getOrCreateInstance(tabButton).show();
            }
        }

        updateUI();
        setDraftSaveState('restored', {
            savedAt: draft.savedAt
        });
        setDraftRestoreAvailability(true);
        if (options.toast !== false) {
            showToast('info', options.toastMessage || 'تم استعادة بياناتك تلقائياً');
        }
        return true;
    } catch (error) {
        console.warn('Failed to restore reconciliation draft', error);
        clearSavedRequestDraft();
        return false;
    }
}

function setupRequestDraftAutosave() {
    if (initializedDraftWatchers) {
        return;
    }
    initializedDraftWatchers = true;

    const watchedFieldIds = [
        'systemSales',
        'notes',
        'cashDenomSelect',
        'cashCountInput',
        'bankOpType',
        'bankAtmName',
        'input_bank_name_v2',
        'input_bank_amount_v2',
        'postpaidName',
        'postpaidAmount',
        'custReceiptName',
        'custReceiptType',
        'custReceiptAmount',
        'returnInv',
        'returnAmount',
        'returnNote',
        'supplierName',
        'supplierInv',
        'supplierAmount'
    ];

    watchedFieldIds.forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (!field) {
            return;
        }

        field.addEventListener('input', scheduleRequestDraftSave);
        field.addEventListener('change', scheduleRequestDraftSave);
    });

    document.querySelectorAll('#pills-tab .nav-link').forEach((tabButton) => {
        tabButton.addEventListener('shown.bs.tab', scheduleRequestDraftSave);
    });

    window.addEventListener('beforeunload', () => {
        if (draftAutosaveTimer) {
            clearTimeout(draftAutosaveTimer);
            draftAutosaveTimer = null;
        }
        saveRequestDraftNow();
    });
    window.addEventListener('blur', saveRequestDraftNow);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            saveRequestDraftNow();
        }
    });
}

async function saveBaseUrlSilently() {
    const baseUrl = document.getElementById('loginBaseUrl').value.trim();
    if (!baseUrl || baseUrl === bootstrapState.baseUrl) {
        return true;
    }

    if (!isConnectionPanelUnlocked) {
        setLoginFeedback('أدخل بيانات الأدمن أولاً لفتح إعدادات الاتصال.', 'error');
        return false;
    }

    try {
        const result = await window.clientSender.saveBaseUrl(baseUrl);
        renderBootstrap(result.bootstrap || { baseUrl: result.baseUrl });
        setLoginFeedback('تم حفظ إعدادات الاتصال.', 'success');
        return true;
    } catch (error) {
        updateControlStatus(`تعذر حفظ إعدادات الاتصال: ${error.message}`, 'error');
        setLoginFeedback(`تعذر حفظ إعدادات الاتصال: ${error.message}`, 'error');
        return false;
    }
}

function handleRemoteAuthExpiry(message) {
    saveRequestDraftNow();
    draftAutosaveReady = false;
    user = null;
    bootstrapState.currentUser = null;
    bootstrapState.sessionActive = false;
    bootstrapState.offlineMode = false;
    isLoginScreenForcedOpen = false;
    renderBootstrap(bootstrapState);
    setWorkspaceEnabled(false);
    updateControlStatus(message || 'انتهت الجلسة، يرجى تسجيل الدخول من جديد.', 'error');
    setLoginFeedback(message || 'انتهت الجلسة، يرجى تسجيل الدخول من جديد.', 'error');
    setDraftSaveState('idle', {
        message: 'تم حفظ آخر مسودة محليًا. سجّل الدخول مجددًا لإكمال العمل.'
    });
    setDraftRestoreAvailability(false);
    openLoginScreen();
    focusLoginEntry();
}

async function loadCashiersList(options = {}) {
    const baseUrl = (options.baseUrl || document.getElementById('loginBaseUrl').value || bootstrapState.baseUrl || '').trim();
    const selectedCashierId = options.selectedCashierId || (user && user.id ? user.id : '');

    setLoginFeedback('جاري تحميل قائمة الكاشيرين...', '');

    try {
        const result = await window.clientSender.fetchCashiersList(baseUrl);
        cashiersList = Array.isArray(result.cashiers)
            ? result.cashiers.filter((cashier) => Number(cashier.active || 0) !== 0)
            : [];
        renderBootstrap(result.bootstrap || null);
        renderCashiersList(selectedCashierId);

        if (!cashiersList.length) {
            setLoginFeedback('لم يتم العثور على كاشيرين نشطين في الخادم.', 'error');
            return false;
        }

        if (result.source === 'cache') {
            setLoginFeedback('تم تحميل أسماء الكاشيرين من النسخة المحلية بسبب تعذر الاتصال بالخادم.', '');
        } else {
            setLoginFeedback('اختر اسم الكاشير ثم أدخل رمز الدخول.', '');
        }
        return true;
    } catch (error) {
        cashiersList = [];
        renderCashiersList('');
        setLoginFeedback(`تعذر تحميل الكاشيرين: ${error.message}`, 'error');
        return false;
    }
}

async function loadCustomers() {
    const result = await window.clientSender.fetchCustomers();
    if (!result || !result.success) {
        if (result && result.authExpired) {
            throw createUnauthorizedError(result.error);
        }
        throw new Error(result && result.error ? result.error : 'تعذر تحميل قائمة العملاء');
    }

    renderBootstrap(result.bootstrap || null);
    const list = document.getElementById('customersList');
    list.innerHTML = (result.customers || []).map((name) => `<option value="${name}">`).join('');

    if (result.source === 'cache') {
        updateControlStatus('تم تحميل العملاء من النسخة المحلية بسبب انقطاع الاتصال.', '');
    }

    return result;
}

async function loadAtms() {
    const result = await window.clientSender.fetchAtms();
    if (!result || !result.success) {
        if (result && result.authExpired) {
            throw createUnauthorizedError(result.error);
        }
        throw new Error(result && result.error ? result.error : 'تعذر تحميل قائمة أجهزة الصراف');
    }

    renderBootstrap(result.bootstrap || null);
    atmsData = Array.isArray(result.atms) ? result.atms : [];
    const select = document.getElementById('bankAtmName');
    select.innerHTML = '<option value="" selected disabled>اختر الصراف / الماكينة...</option>' +
        atmsData.map((atm) => `<option value="${atm.name}">${atm.name}</option>`).join('');

    if (result.source === 'cache') {
        updateControlStatus('تم تحميل أجهزة الصراف من النسخة المحلية بسبب انقطاع الاتصال.', '');
    }

    select.onchange = function onAtmChange() {
        const selectedName = this.value;
        const atm = atmsData.find((entry) => entry.name === selectedName);
        const input = document.getElementById('input_bank_name_v2');
        if (input) {
            input.value = atm && atm.bank_name ? atm.bank_name : '';
        }
        scheduleRequestDraftSave();
    };

    return result;
}

async function activateWorkspace() {
    if (!hasAuthenticatedSession()) {
        setWorkspaceEnabled(false);
    updateControlStatus('سجّل الدخول ثم ابدأ تعبئة الطلب.', '');
        setDraftSaveState('idle');
        setDraftRestoreAvailability(false);
        openLoginScreen();
        return false;
    }

    const currentUserId = bootstrapState.currentUser.id || 'unknown';
    user = bootstrapState.currentUser;
    document.getElementById('userNameDisplay').textContent = user.name || 'غير محدد';

    try {
        const customersResult = await loadCustomers();
        const atmsResult = await loadAtms();

        if (String(lastActivatedUserId) !== String(currentUserId)) {
            resetFormCollectionsAndFields();
            const restored = await restoreRequestDraft();
            if (!restored) {
                await refreshDraftRestoreAvailability();
            }
            lastActivatedUserId = currentUserId;
        }

        setupRequestDraftAutosave();
        draftAutosaveReady = true;
        updateUI();
        setWorkspaceEnabled(true);
        if (bootstrapState.offlineMode) {
            updateControlStatus(
                `تم الدخول من النسخة المحلية للكاشير: ${user.name || user.id}. سيتم حفظ الطلبات محليًا حتى يعود الاتصال.`,
                'success'
            );
            setLoginFeedback(
                `تم الدخول أوفلاين للكاشير: ${user.name || user.id}. يمكنك المتابعة الآن.`,
                'success'
            );
        } else if (
            (customersResult && customersResult.source === 'cache')
            || (atmsResult && atmsResult.source === 'cache')
        ) {
            updateControlStatus(
                `تم فتح التطبيق للكاشير: ${user.name || user.id} باستخدام البيانات المحلية.`,
                'success'
            );
        } else {
            updateControlStatus(`تم تسجيل الدخول للكاشير: ${user.name || user.id}`, 'success');
        }
        setLoginFeedback(`تم تسجيل الدخول للكاشير: ${user.name || user.id}`, 'success');
        isLoginScreenForcedOpen = false;
        toggleLoginScreen(false);
        setConnectionPanelOpen(false);
        return true;
    } catch (error) {
        if (error.code === 401) {
            handleRemoteAuthExpiry(error.message);
            return false;
        }

        updateControlStatus(error.message, 'error');
        setWorkspaceEnabled(false);
        return false;
    }
}

async function handleRestoreDraftClick() {
    if (!hasAuthenticatedSession()) {
        showToast('warning', 'سجّل الدخول أولاً');
        return;
    }

    const available = await refreshDraftRestoreAvailability();
    if (!available) {
        updateControlStatus('لا توجد مسودة قابلة للاستعادة.', 'error');
        showToast('info', 'لا توجد مسودة محفوظة');
        return;
    }

    const currentDraft = createRequestDraftSnapshot();
    if (hasMeaningfulDraft(currentDraft)) {
        const confirmation = await showDialog({
            title: 'استعادة آخر مسودة؟',
            text: 'سيتم استبدال البيانات الحالية بالنسخة المحفوظة على هذا الجهاز.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'استعادة'
        });

        if (!confirmation.isConfirmed) {
            return;
        }
    }

    const restored = await restoreRequestDraft({ toast: false });
    if (!restored) {
        updateControlStatus('تعذر استعادة المسودة.', 'error');
        showToast('error', 'تعذر استعادة المسودة');
        return;
    }

    updateControlStatus('تمت استعادة المسودة.', 'success');
    showToast('success', 'تمت استعادة المسودة');
}

async function handleStartNewRequest() {
    if (!hasAuthenticatedSession()) {
        showToast('warning', 'سجّل الدخول أولاً');
        return;
    }

    const currentDraft = createRequestDraftSnapshot();
    const hasCurrentData = hasMeaningfulDraft(currentDraft);
    const hasExistingDraft = Boolean(draftRestoreAvailable || hasCurrentData);

    if (hasExistingDraft) {
        const confirmation = await showDialog({
            title: 'بدء طلب جديد؟',
            text: 'سيتم حذف المسودة الحالية وفتح نموذج فارغ.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ابدأ طلبًا جديدًا'
        });

        if (!confirmation.isConfirmed) {
            return;
        }
    }

    clearSavedRequestDraft();
    resetFormCollectionsAndFields();
    setDraftSaveState('idle', {
        message: 'تم فتح نموذج جديد. لا توجد مسودة محفوظة الآن.'
    });
    updateControlStatus('تم فتح نموذج جديد.', 'success');

    setMainView('compose');
    const systemSalesField = document.getElementById('systemSales');
    if (systemSalesField) {
        systemSalesField.focus();
        systemSalesField.select();
    }

    showToast('success', 'تم فتح طلب جديد');
}

function updateUI() {
    const totalCash = cashItems.reduce((acc, item) => acc + item.sub, 0);
    document.getElementById('totalCashTabDisplay').textContent = totalCash.toFixed(2);
    document.getElementById('sumCash').textContent = totalCash.toFixed(2);

    const sumBank = bankItems.reduce((acc, item) => acc + item.amount, 0);
    const sumPostpaid = postpaidItems.reduce((acc, item) => acc + item.amount, 0);
    const sumCust = custReceiptItems.reduce((acc, item) => acc + item.amount, 0);
    const sumReturn = returnItems.reduce((acc, item) => acc + item.amount, 0);
    const sumSupplier = supplierItems.reduce((acc, item) => acc + item.amount, 0);

    const totalFound = totalCash + sumBank + sumPostpaid - sumCust + sumReturn;
    const systemSales = parseFloat(document.getElementById('systemSales').value) || 0;
    const diff = totalFound - systemSales;

    document.getElementById('sumBank').textContent = sumBank.toFixed(2);
    document.getElementById('sumPostpaid').textContent = sumPostpaid.toFixed(2);
    document.getElementById('sumCustomer').textContent = sumCust.toFixed(2);
    document.getElementById('sumReturns').textContent = sumReturn.toFixed(2);
    document.getElementById('sumSuppliers').textContent = sumSupplier.toFixed(2);
    document.getElementById('totalFound').textContent = totalFound.toFixed(2);

    const diffEl = document.getElementById('diffValue');
    diffEl.textContent = diff.toFixed(2);
    if (diff < 0) {
        diffEl.className = 'summary-diff-value is-negative';
    } else if (diff > 0) {
        diffEl.className = 'summary-diff-value is-positive';
    } else {
        diffEl.className = 'summary-diff-value is-neutral';
    }

    scheduleRequestDraftSave();
}

function addCashItem() {
    const denomSelect = document.getElementById('cashDenomSelect');
    const countInput = document.getElementById('cashCountInput');

    const val = parseFloat(denomSelect.value);
    const qty = parseFloat(countInput.value);

    if (!val || !qty || qty <= 0) {
        showToast('warning', 'اختر الفئة وأدخل العدد بشكل صحيح');
        return;
    }

    const sub = val * qty;
    cashItems.push({ val, qty, sub });
    cashItems.sort((a, b) => b.val - a.val);
    renderTable('cashTableBody', cashItems, ['val', 'qty', 'sub']);

    countInput.value = '';
    document.getElementById('cashDenomSelect').focus();
    updateUI();
    showToast('success', 'تمت الإضافة');
}

function addBankItem() {
    const opEl = document.getElementById('bankOpType');
    const opType = opEl.value;
    const opText = opEl.options[opEl.selectedIndex].text;
    const atm = document.getElementById('bankAtmName').value;
    const bankVal = document.getElementById('input_bank_name_v2').value;
    const amt = parseFloat(document.getElementById('input_bank_amount_v2').value);

    if (!amt || amt <= 0) {
        showToast('warning', 'أدخل المبلغ بشكل صحيح');
        return;
    }

    const atmValue = opType === 'transfer' ? 'تحويل بنكي' : (atm || '-');
    bankItems.push({
        op: opType,
        opText,
        atm: atmValue,
        entry_bank_name: bankVal || '-',
        amount: amt
    });

    renderTable('bankTableBody', bankItems, ['opText', 'atm', 'entry_bank_name', 'amount']);
    document.getElementById('input_bank_amount_v2').value = '';
    document.getElementById('bankOpType').focus();
    updateUI();
    showToast('success', 'تمت الإضافة');
}

function addPostpaidItem() {
    const customer_name = document.getElementById('postpaidName').value;
    const amt = parseFloat(document.getElementById('postpaidAmount').value);

    if (!customer_name) {
        showToast('warning', 'أدخل اسم العميل');
        return;
    }
    if (!amt || amt <= 0) {
        showToast('warning', 'أدخل المبلغ');
        return;
    }

    postpaidItems.push({ customer_name, amount: amt });
    renderTable('postpaidTableBody', postpaidItems, ['customer_name', 'amount']);
    document.getElementById('postpaidName').value = '';
    document.getElementById('postpaidAmount').value = '';
    document.getElementById('postpaidName').focus();
    updateUI();
    showToast('success', 'تمت الإضافة');
}

function addCustomerReceiptItem() {
    const customer_name = document.getElementById('custReceiptName').value;
    const type = document.getElementById('custReceiptType').value;
    const amt = parseFloat(document.getElementById('custReceiptAmount').value);

    if (!customer_name) {
        showToast('warning', 'أدخل اسم العميل');
        return;
    }
    if (!amt || amt <= 0) {
        showToast('warning', 'أدخل المبلغ');
        return;
    }

    custReceiptItems.push({ customer_name, type, amount: amt });
    renderTable('custReceiptTableBody', custReceiptItems, ['customer_name', 'type', 'amount']);
    document.getElementById('custReceiptName').value = '';
    document.getElementById('custReceiptAmount').value = '';
    document.getElementById('custReceiptName').focus();
    updateUI();
    showToast('success', 'تمت الإضافة');
}

function addReturnItem() {
    const num = document.getElementById('returnInv').value;
    const amt = parseFloat(document.getElementById('returnAmount').value);
    const note = document.getElementById('returnNote').value;

    if (!num) {
        showToast('warning', 'أدخل رقم الفاتورة');
        return;
    }
    if (!amt || amt <= 0) {
        showToast('warning', 'أدخل المبلغ');
        return;
    }

    returnItems.push({ num, amount: amt, note });
    renderTable('returnTableBody', returnItems, ['num', 'amount', 'note']);
    document.getElementById('returnInv').value = '';
    document.getElementById('returnAmount').value = '';
    document.getElementById('returnNote').value = '';
    document.getElementById('returnInv').focus();
    updateUI();
    showToast('success', 'تمت الإضافة');
}

function addSupplierItem() {
    const supplier_name = document.getElementById('supplierName').value;
    const invoice_number = document.getElementById('supplierInv').value;
    const amt = parseFloat(document.getElementById('supplierAmount').value);

    if (!supplier_name) {
        showToast('warning', 'أدخل اسم المورد');
        return;
    }
    if (!amt || amt <= 0) {
        showToast('warning', 'أدخل المبلغ');
        return;
    }

    supplierItems.push({ supplier_name, invoice_number, amount: amt });
    renderTable('supplierTableBody', supplierItems, ['supplier_name', 'invoice_number', 'amount']);
    document.getElementById('supplierName').value = '';
    document.getElementById('supplierAmount').value = '';
    document.getElementById('supplierInv').value = '';
    document.getElementById('supplierName').focus();
    updateUI();
    showToast('success', 'تمت الإضافة');
}

function removeSupplierItem(idx) {
    supplierItems.splice(idx, 1);
    renderTable('supplierTableBody', supplierItems, ['supplier_name', 'invoice_number', 'amount']);
    updateUI();
    showToast('info', 'تم الحذف');
}

function removeBankItem(idx) {
    bankItems.splice(idx, 1);
    renderTable('bankTableBody', bankItems, ['opText', 'atm', 'entry_bank_name', 'amount']);
    updateUI();
    showToast('info', 'تم الحذف');
}

function removePostpaidItem(idx) {
    postpaidItems.splice(idx, 1);
    renderTable('postpaidTableBody', postpaidItems, ['customer_name', 'amount']);
    updateUI();
    showToast('info', 'تم الحذف');
}

function removeCustReceiptItem(idx) {
    custReceiptItems.splice(idx, 1);
    renderTable('custReceiptTableBody', custReceiptItems, ['customer_name', 'type', 'amount']);
    updateUI();
    showToast('info', 'تم الحذف');
}

function removeReturnItem(idx) {
    returnItems.splice(idx, 1);
    renderTable('returnTableBody', returnItems, ['num', 'amount', 'note']);
    updateUI();
    showToast('info', 'تم الحذف');
}

function renderTable(id, items, cols) {
    const tbody = document.getElementById(id);
    tbody.innerHTML = '';

    items.forEach((item, idx) => {
        const tr = document.createElement('tr');
        let html = '';
        cols.forEach((col) => {
            const val = item[col];
            html += `<td>${val !== undefined ? val : '-'}</td>`;
        });

        let removeFn = '';
        if (id === 'cashTableBody') removeFn = `removeItem('${id}', ${idx})`;
        else if (id === 'bankTableBody') removeFn = `removeBankItem(${idx})`;
        else if (id === 'postpaidTableBody') removeFn = `removePostpaidItem(${idx})`;
        else if (id === 'custReceiptTableBody') removeFn = `removeCustReceiptItem(${idx})`;
        else if (id === 'returnTableBody') removeFn = `removeReturnItem(${idx})`;
        else if (id === 'supplierTableBody') removeFn = `removeSupplierItem(${idx})`;
        else removeFn = `removeItem('${id}', ${idx})`;

        html += `
            <td class="table-remove-cell">
                <button class="table-remove-btn" type="button" onclick="${removeFn}" title="حذف الصف" aria-label="حذف الصف">
                    <i class="fas fa-trash-can"></i>
                </button>
            </td>
        `;
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
}

function removeItem(tableId, idx) {
    if (tableId === 'cashTableBody') {
        cashItems.splice(idx, 1);
        renderTable(tableId, cashItems, ['val', 'qty', 'sub']);
    }

    updateUI();
    showToast('info', 'تم الحذف');
}

function buildPreviewLines(items, labelBuilder) {
    if (!Array.isArray(items) || !items.length) {
        return '<div class="history-meta-note">لا توجد بيانات</div>';
    }

    return `
        <ul class="preview-lines">
            ${items.map((item) => `<li>${labelBuilder(item || {})}</li>`).join('')}
        </ul>
    `;
}

function buildRequestPreviewHtml(request) {
    const payload = request && request.payload ? request.payload : {};
    const resendMeta = payload && payload.resend_meta ? payload.resend_meta : null;
    const notes = payload.notes ? String(payload.notes) : 'لا توجد ملاحظات';
    const resendMetaHtml = resendMeta ? `
        <div class="preview-block">
            <h6>اعتماد إعادة الإرسال</h6>
            <ul class="preview-lines">
                <li>
                    <span>الأصل</span>
                    <strong>${resendMeta.source_remote_request_id ? `سيرفر #${resendMeta.source_remote_request_id}` : (resendMeta.source_request_id ? `محلي #${resendMeta.source_request_id}` : '-')}</strong>
                </li>
                <li>
                    <span>الأدمن</span>
                    <strong>${resendMeta.approved_by_admin_name || resendMeta.approved_by_admin_username || '-'}</strong>
                </li>
                <li>
                    <span>الاعتماد</span>
                    <strong>${resendMeta.approved_at ? formatDateTime(resendMeta.approved_at) : '-'}</strong>
                </li>
                <li>
                    <span>السبب</span>
                    <strong>${resendMeta.reason || '-'}</strong>
                </li>
            </ul>
        </div>
    ` : '';

    return `
        <div class="preview-grid">
            <div class="preview-stat">
                <span class="preview-stat-label">مبيعات النظام</span>
                <span class="preview-stat-value">${formatCurrency(request.system_sales)}</span>
            </div>
            <div class="preview-stat">
                <span class="preview-stat-label">إجمالي النقد</span>
                <span class="preview-stat-value">${formatCurrency(request.total_cash)}</span>
            </div>
            <div class="preview-stat">
                <span class="preview-stat-label">إجمالي الشبكة</span>
                <span class="preview-stat-value">${formatCurrency(request.total_bank)}</span>
            </div>
        </div>
        <div class="preview-block">
            <h6>ملاحظات</h6>
            <div class="history-meta-note" style="color: var(--text-primary);">${notes}</div>
        </div>
        ${resendMetaHtml}
        <div class="preview-block">
            <h6>تفصيل النقدية</h6>
            ${buildPreviewLines(payload.cash_breakdown, (item) => `
                <span>${item.val || 0} × ${item.qty || 0}</span>
                <strong>${formatCurrency(item.sub)}</strong>
            `)}
        </div>
        <div class="preview-block">
            <h6>الشبكة والبنك</h6>
            ${buildPreviewLines(payload.bank_receipts, (item) => `
                <span>${item.operation_type || '-'} | ${item.atm_name || '-'} | ${item.bank_name || '-'}</span>
                <strong>${formatCurrency(item.amount)}</strong>
            `)}
        </div>
        <div class="preview-block">
            <h6>المبيعات الآجلة</h6>
            ${buildPreviewLines(payload.postpaid_items, (item) => `
                <span>${item.customer_name || '-'}</span>
                <strong>${formatCurrency(item.amount)}</strong>
            `)}
        </div>
        <div class="preview-block">
            <h6>مقبوضات العملاء</h6>
            ${buildPreviewLines(payload.customer_receipts, (item) => `
                <span>${item.customer_name || '-'} | ${item.payment_type || '-'}</span>
                <strong>${formatCurrency(item.amount)}</strong>
            `)}
        </div>
        <div class="preview-block">
            <h6>المرتجعات</h6>
            ${buildPreviewLines(payload.return_items, (item) => `
                <span>${item.invoice_number || '-'}${item.note ? ` | ${item.note}` : ''}</span>
                <strong>${formatCurrency(item.amount)}</strong>
            `)}
        </div>
        <div class="preview-block">
            <h6>الموردون/المصروفات</h6>
            ${buildPreviewLines(payload.supplier_items, (item) => `
                <span>${item.supplier_name || '-'}${item.invoice_number ? ` | ${item.invoice_number}` : ''}</span>
                <strong>${formatCurrency(item.amount)}</strong>
            `)}
        </div>
    `;
}

async function previewHistoryRequest(requestId) {
    const request = getVisibleHistoryRequests().find((entry) => Number(entry.id) === Number(requestId));
    if (!request) {
        showToast('warning', 'الطلب غير موجود على هذا الجهاز');
        return;
    }

    const statusMeta = getRequestStatusMeta(request.status);
    await showDialog({
        title: `عرض الطلب ${request.remote_request_id ? `#${request.remote_request_id}` : request.local_request_id}`,
        html: `
            <div class="history-meta-note mb-3">الحالة الحالية: <span class="history-status-badge ${statusMeta.className}">${statusMeta.label}</span></div>
            ${buildRequestPreviewHtml(request)}
        `,
        width: 960,
        confirmButtonText: 'إغلاق',
        customClass: {
            popup: 'client-dialog-popup client-dialog-wide'
        }
    });
}

async function resendHistoryRequest(requestId) {
    const request = getVisibleHistoryRequests().find((entry) => Number(entry.id) === Number(requestId));
    if (!request) {
        showToast('warning', 'الطلب غير موجود على هذا الجهاز');
        return;
    }

    const confirmation = await showDialog({
        title: 'إعادة إرسال الطلب؟',
        text: 'سيتم إرسال الطلب مرة أخرى عند توفر الاتصال.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'إعادة الإرسال'
    });

    if (!confirmation.isConfirmed) {
        return;
    }

    const result = await window.clientSender.resendRequest(requestId);
    renderBootstrap(result.bootstrap || null);
    await refreshRequestHistory();

    if (result.authExpired) {
        handleRemoteAuthExpiry(result.error);
        return;
    }

    if (result.success) {
        updateControlStatus('تمت إعادة الإرسال.', 'success');
        showToast('success', 'تمت إعادة الإرسال');
        return;
    }

    if (result.offlineMode) {
        updateControlStatus(result.error || 'التطبيق يعمل بوضع أوفلاين.', 'error');
        showToast('warning', result.error || 'التطبيق يعمل أوفلاين');
        return;
    }

    updateControlStatus(result.error || 'تعذر إعادة الإرسال.', 'error');
    showToast('error', result.error || 'تعذر إعادة الإرسال');
}

async function promptAdminResendApproval(request) {
    const requestLabel = request && request.remote_request_id
        ? `سيرفر #${request.remote_request_id}`
        : (request && request.local_request_id ? request.local_request_id : `#${request.id}`);

    const result = await showDialog({
        title: 'اعتماد أدمن لإعادة الإرسال',
        html: `
            <div class="client-dialog-stack">
                <div class="client-dialog-caption">سيتم إنشاء نسخة جديدة من الطلب ${requestLabel} وإرسالها بعد اعتماد الأدمن.</div>
                <input id="adminResendUsernameInput" class="client-dialog-input" type="text" autocomplete="username" placeholder="اسم مستخدم الأدمن">
                <input id="adminResendPasswordInput" class="client-dialog-input" type="password" autocomplete="current-password" placeholder="كلمة مرور الأدمن">
                <textarea id="adminResendReasonInput" class="client-dialog-input" rows="3" placeholder="سبب إعادة الإرسال"></textarea>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'اعتماد وإرسال',
        focusConfirm: false,
        didOpen: () => {
            const usernameInput = document.getElementById('adminResendUsernameInput');
            if (usernameInput) {
                usernameInput.focus();
            }
        },
        preConfirm: () => {
            const username = String(document.getElementById('adminResendUsernameInput')?.value || '').trim();
            const password = String(document.getElementById('adminResendPasswordInput')?.value || '').trim();
            const reason = String(document.getElementById('adminResendReasonInput')?.value || '').trim();

            if (!username) {
                Swal.showValidationMessage('أدخل اسم مستخدم الأدمن');
                return false;
            }

            if (!password) {
                Swal.showValidationMessage('أدخل كلمة مرور الأدمن');
                return false;
            }

            if (!reason) {
                Swal.showValidationMessage('أدخل سبب إعادة الإرسال');
                return false;
            }

            return { username, password, reason };
        }
    });

    return result.isConfirmed ? result.value : null;
}

async function adminResendHistoryRequest(requestId) {
    const request = getVisibleHistoryRequests().find((entry) => Number(entry.id) === Number(requestId));
    if (!request) {
        showToast('warning', 'الطلب غير موجود على هذا الجهاز');
        return;
    }

    const approval = await promptAdminResendApproval(request);
    if (!approval) {
        return;
    }

    showLoadingDialog('جاري إعادة الإرسال...', 'يتم التحقق من الأدمن ثم إنشاء نسخة جديدة من الطلب.');

    try {
        const result = await window.clientSender.adminResendRequest({
            requestId,
            baseUrl: bootstrapState.baseUrl,
            username: approval.username,
            password: approval.password,
            reason: approval.reason
        });

        Swal.close();
        renderBootstrap(result.bootstrap || null);
        await refreshRequestHistory();

        if (result.success) {
            updateControlStatus('تمت إعادة الإرسال بعد اعتماد الأدمن.', 'success');
            showToast('success', 'تمت إعادة الإرسال باعتماد أدمن');
            return;
        }

        if (result.offlineMode) {
            updateControlStatus(result.error || 'تعذر الإرسال الآن.', 'error');
            showToast('warning', result.error || 'تعذر الإرسال الآن');
            return;
        }

        updateControlStatus(result.error || 'تعذر إعادة الإرسال المعتمدة.', 'error');
        showToast('error', result.error || 'تعذر إعادة الإرسال المعتمدة');
    } catch (error) {
        Swal.close();
        const friendlyMessage = String(error && error.message ? error.message : error || 'تعذر إعادة الإرسال المعتمدة');
        updateControlStatus(friendlyMessage, 'error');
        showToast('error', friendlyMessage);
    }
}

function setupHistoryInteractions() {
    if (initializedHistoryActions) {
        return;
    }

    initializedHistoryActions = true;
    document.getElementById('requestHistoryBody').addEventListener('click', async (event) => {
        const actionButton = event.target.closest('button[data-action]');
        if (!actionButton) {
            return;
        }

        const requestId = Number(actionButton.getAttribute('data-request-id') || 0);
        if (!requestId) {
            return;
        }

        if (actionButton.getAttribute('data-action') === 'preview-request') {
            await previewHistoryRequest(requestId);
            return;
        }

        if (actionButton.getAttribute('data-action') === 'resend-request') {
            await resendHistoryRequest(requestId);
            return;
        }

        if (actionButton.getAttribute('data-action') === 'admin-resend-request') {
            await adminResendHistoryRequest(requestId);
        }
    });
}

async function submitFullRequest() {
    if (isSubmittingRequest) {
        return;
    }

    if (!user || (!bootstrapState.sessionActive && !bootstrapState.offlineMode)) {
        showToast('warning', 'سجّل الدخول أولاً');
        return;
    }

    const systemSales = parseFloat(document.getElementById('systemSales').value) || 0;
    const totalCash = cashItems.reduce((acc, item) => acc + item.sub, 0);

    const payload = {
        cashier_id: user.id || null,
        system_sales: systemSales,
        total_cash: totalCash,
        total_bank: bankItems.reduce((acc, item) => acc + item.amount, 0),
        notes: document.getElementById('notes').value,
        cash_breakdown: cashItems,
        bank_receipts: bankItems.map((item) => ({
            operation_type: item.opText,
            atm_name: item.atm,
            bank_name: item.entry_bank_name,
            amount: item.amount
        })),
        postpaid_items: postpaidItems.map((item) => ({
            customer_name: item.customer_name,
            amount: item.amount
        })),
        customer_receipts: custReceiptItems.map((item) => ({
            customer_name: item.customer_name,
            payment_type: item.type,
            amount: item.amount
        })),
        return_items: returnItems.map((item) => ({
            invoice_number: item.num,
            amount: item.amount,
            note: item.note
        })),
        supplier_items: supplierItems.map((item) => ({
            supplier_name: item.supplier_name,
            invoice_number: item.invoice_number,
            amount: item.amount
        }))
    };

    try {
        isSubmittingRequest = true;
        updateSubmitRequestButtonState(true);
        saveRequestDraftNow();

        showLoadingDialog('جاري الإرسال...', 'يتم حفظ الطلب وإرساله');

        const result = await window.clientSender.submitRequest(payload);
        renderBootstrap(result.bootstrap || null);
        await refreshRequestHistory();

        if (result && result.queuedOffline) {
            clearSavedRequestDraft();
            resetFormCollectionsAndFields();
            updateControlStatus(
                result.error || 'تم حفظ الطلب محليًا وسيتم إرساله عند عودة الاتصال.',
                'success'
            );

            await showDialog({
                title: 'تم الحفظ محليًا',
                text: result.error || 'سيتم إرسال الطلب تلقائيًا عند عودة الاتصال.',
                icon: 'success',
                confirmButtonText: 'حسناً'
            });
            return;
        }

        if (!result || !result.success) {
            Swal.close();

            if (result && result.authExpired) {
                handleRemoteAuthExpiry(result.error);
                await showDialog({
                    title: 'انتهت الجلسة',
                    text: result.error || 'يرجى تسجيل الدخول من جديد.',
                    icon: 'warning',
                    confirmButtonText: 'حسناً'
                });
                return;
            }

            const localId = result && result.request && result.request.local_request_id
                ? `\n\nتم حفظ الطلب محليًا بالمعرف: ${result.request.local_request_id}`
                : '';

            await showDialog({
                title: 'تعذر الإرسال',
                text: `${(result && result.error) || 'حدث خطأ غير متوقع'}${localId}`,
                icon: 'warning',
                confirmButtonText: 'حسناً'
            });

            updateControlStatus('تعذر الإرسال، وتم حفظ الطلب محليًا.', 'error');
            return;
        }

        clearSavedRequestDraft();
        resetFormCollectionsAndFields();
        updateControlStatus('تم إرسال الطلب بنجاح.', 'success');

        await showDialog({
            title: 'تم الإرسال',
            text: 'تم إرسال الطلب للمراجعة.',
            icon: 'success',
            confirmButtonText: 'حسناً'
        });
    } catch (error) {
        Swal.close();
        await showDialog({
            title: 'تعذر الاتصال',
            text: error.message || 'تعذر الوصول إلى الخادم.',
            icon: 'error',
            confirmButtonText: 'حسناً'
        });
    } finally {
        isSubmittingRequest = false;
        updateSubmitRequestButtonState(false);
    }
}

async function handleLogin() {
    const baseUrl = document.getElementById('loginBaseUrl').value.trim();
    const cashierId = document.getElementById('cashierSelect').value;
    const pin = document.getElementById('loginPin').value;

    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    updateControlStatus('جاري تسجيل الدخول...', '');
    setLoginFeedback('جاري تسجيل الدخول...', '');

    if (!cashierId) {
        setLoginFeedback('اختر اسم الكاشير أولاً.', 'error');
        loginBtn.disabled = false;
        return;
    }

    try {
        const result = await window.clientSender.loginCashier({
            baseUrl,
            cashierId,
            pin
        });

        document.getElementById('loginPin').value = '';
        renderBootstrap(result.bootstrap || result);
        lastActivatedUserId = null;
        await activateWorkspace();
        await refreshRequestHistory();
        if (result && result.offline) {
            updateControlStatus(
                'تم الدخول من النسخة المحلية. سيبقى التطبيق أوفلاين حتى يعود الاتصال.',
                'success'
            );
        }
        await refreshDraftRestoreAvailability();
    } catch (error) {
        const friendlyMessage = getFriendlyLoginErrorMessage(error);
        updateControlStatus(friendlyMessage, 'error');
        setLoginFeedback(friendlyMessage, 'error');
    } finally {
        loginBtn.disabled = false;
    }
}

async function handleLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.disabled = true;
    updateControlStatus('جاري تسجيل الخروج...', '');

    try {
        const result = await window.clientSender.logout();
        bootstrapState = {
            ...bootstrapState,
            ...(result.bootstrap || {})
        };
        user = null;
        draftAutosaveReady = false;
        isLoginScreenForcedOpen = false;
        setDraftSaveState('idle', {
            message: 'تم الاحتفاظ بآخر مسودة على هذا الجهاز.'
        });
        setDraftRestoreAvailability(false);
        renderBootstrap(result.bootstrap || null);
        setWorkspaceEnabled(false);
        updateControlStatus('تم تسجيل الخروج.', 'success');
        openLoginScreen();
        focusLoginEntry();
        await refreshRequestHistory();
        await loadCashiersList({ baseUrl: bootstrapState.baseUrl });
    } catch (error) {
        updateControlStatus(`تعذر تسجيل الخروج: ${error.message}`, 'error');
    } finally {
        logoutBtn.disabled = !hasAuthenticatedSession();
    }
}

async function handleResendPending() {
    if (!hasAuthenticatedSession()) {
        showToast('warning', 'سجّل الدخول أولاً');
        return;
    }

    if (bootstrapState.offlineMode) {
        showToast('warning', 'أعد الاتصال ثم سجّل الدخول لإرسال الطلبات المعلقة');
        return;
    }

    const button = document.getElementById('resendPendingBtn');
    button.disabled = true;
    updateControlStatus('جاري إرسال الطلبات المعلقة...', '');

    try {
        const result = await window.clientSender.sendPending();
        renderBootstrap(result.bootstrap || null);
        await refreshRequestHistory();

        if (result.offlineMode) {
            updateControlStatus(result.error || 'التطبيق يعمل بوضع أوفلاين.', 'error');
            return;
        }

        if (result.authExpired) {
            handleRemoteAuthExpiry(result.error);
            return;
        }

        if (result.total === 0) {
            updateControlStatus('لا توجد طلبات معلقة.', 'success');
            return;
        }

        if (result.failed > 0) {
            updateControlStatus(`أُرسل ${result.sent} وتعذر ${result.failed} من أصل ${result.total}.`, 'error');
            return;
        }

        updateControlStatus(`تم إرسال ${result.total} طلب بنجاح.`, 'success');
    } catch (error) {
        updateControlStatus(`تعذر الإرسال: ${error.message}`, 'error');
    } finally {
        button.disabled = !hasAuthenticatedSession();
    }
}

function setupNavigation() {
    if (initializedNavigation) {
        return;
    }
    initializedNavigation = true;

    const chain = (id1, id2) => {
        const el = document.getElementById(id1);
        if (!el) {
            return;
        }

        el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const next = document.getElementById(id2);
                if (next) {
                    next.focus();
                }
            }
        });
    };

    const trigger = (id, fn) => {
        const el = document.getElementById(id);
        if (!el) {
            return;
        }

        el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                fn();
            }
        });
    };

    chain('cashDenomSelect', 'cashCountInput');
    trigger('cashCountInput', addCashItem);
    chain('bankOpType', 'bankAtmName');
    chain('bankAtmName', 'input_bank_name_v2');
    chain('input_bank_name_v2', 'input_bank_amount_v2');
    trigger('input_bank_amount_v2', addBankItem);
    chain('postpaidName', 'postpaidAmount');
    trigger('postpaidAmount', addPostpaidItem);
    chain('custReceiptName', 'custReceiptType');
    chain('custReceiptType', 'custReceiptAmount');
    trigger('custReceiptAmount', addCustomerReceiptItem);
    chain('returnInv', 'returnAmount');
    chain('returnAmount', 'returnNote');
    trigger('returnNote', addReturnItem);
    chain('supplierName', 'supplierInv');
    chain('supplierInv', 'supplierAmount');
    trigger('supplierAmount', addSupplierItem);
}

async function initializePage() {
    setupBankFieldVisibility();
    setupNavigation();
    setupHistoryInteractions();

    document.getElementById('systemSales').addEventListener('input', updateUI);
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('resendPendingBtn').addEventListener('click', handleResendPending);
    document.getElementById('newRequestBtn').addEventListener('click', handleStartNewRequest);
    document.getElementById('restoreDraftBtn').addEventListener('click', handleRestoreDraftClick);
    document.getElementById('refreshHistoryBtn').addEventListener('click', () => refreshRequestHistory());
    document.getElementById('reloadCashiersBtn').addEventListener('click', () => loadCashiersList());
    document.getElementById('closeLoginBtn').addEventListener('click', () => {
        isLoginScreenForcedOpen = false;
        toggleLoginScreen(false);
    });
    document.getElementById('composeViewBtn').addEventListener('click', () => setMainView('compose'));
    document.getElementById('historyViewBtn').addEventListener('click', async () => {
        setMainView('history');
        await refreshRequestHistory();
    });
    document.getElementById('toggleConnectionPanelBtn').addEventListener('click', () => {
        const panel = document.getElementById('loginConnectionPanel');
        if (!panel.classList.contains('hidden')) {
            setConnectionPanelOpen(false);
            setLoginFeedback('تم إغلاق إعدادات الاتصال.', '');
            return;
        }

        openProtectedConnectionPanel();
    });
    document.getElementById('applyConnectionBtn').addEventListener('click', async () => {
        const saved = await saveBaseUrlSilently();
        if (saved) {
            await loadCashiersList({ baseUrl: document.getElementById('loginBaseUrl').value.trim() });
            setConnectionPanelOpen(false);
            focusLoginEntry();
        }
    });
    document.getElementById('showLoginBtn').addEventListener('click', async () => {
        setMainView('compose');
        openLoginScreen();
        const loaded = await loadCashiersList({ baseUrl: bootstrapState.baseUrl, selectedCashierId: user && user.id ? user.id : '' });
        if (!loaded) {
            setLoginFeedback('إذا كان الخادم غير صحيح، افتح إعدادات الاتصال ببيانات الأدمن.', 'error');
        }
        focusLoginEntry();
    });
    document.getElementById('serverSummaryChip').addEventListener('click', async () => {
        openLoginScreen();
        await loadCashiersList({ baseUrl: bootstrapState.baseUrl, selectedCashierId: user && user.id ? user.id : '' });
        await openProtectedConnectionPanel();
    });
    document.getElementById('loginBaseUrl').addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const saved = await saveBaseUrlSilently();
            if (saved) {
                await loadCashiersList({ baseUrl: document.getElementById('loginBaseUrl').value.trim() });
                setConnectionPanelOpen(false);
                focusLoginEntry();
            }
        }
    });
    document.getElementById('loginPin').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleLogin();
        }
    });

    const bootstrap = await window.clientSender.getBootstrap();
    setConnectionPanelOpen(false);
    setMainView('compose');
    renderBootstrap(bootstrap);
    updateUI();
    await refreshRequestHistory();
    await loadCashiersList({ baseUrl: bootstrap.baseUrl, selectedCashierId: bootstrap.currentUser && bootstrap.currentUser.id ? bootstrap.currentUser.id : '' });
    await activateWorkspace();
}

window.addCashItem = addCashItem;
window.addBankItem = addBankItem;
window.addPostpaidItem = addPostpaidItem;
window.addCustomerReceiptItem = addCustomerReceiptItem;
window.addReturnItem = addReturnItem;
window.addSupplierItem = addSupplierItem;
window.removeSupplierItem = removeSupplierItem;
window.removeBankItem = removeBankItem;
window.removePostpaidItem = removePostpaidItem;
window.removeCustReceiptItem = removeCustReceiptItem;
window.removeReturnItem = removeReturnItem;
window.removeItem = removeItem;
window.submitFullRequest = submitFullRequest;

document.addEventListener('DOMContentLoaded', () => {
    initializePage().catch((error) => {
        updateControlStatus(`فشل تحميل التطبيق: ${error.message}`, 'error');
    });
});
