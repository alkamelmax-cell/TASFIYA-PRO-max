const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { createSecureWebPreferences } = require('../window-security');
const { createClientSenderDb } = require('./db');
const {
    DEFAULT_BASE_URL,
    normalizeBaseUrl,
    loginAdmin,
    loginCashier,
    sendReconciliationRequest,
    fetchCustomers,
    fetchAtms,
    logoutCashier,
    fetchCashiersList
} = require('./api');

const CLIENT_APP_NAME = 'Tasfiya Client Sender';
const CLIENT_WINDOW_TITLE = 'تصفية برو - عميل إرسال الطلبات';
const IS_DEV_MODE = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const IS_SMOKE_TEST = process.argv.includes('--smoke-test');

app.setName(CLIENT_APP_NAME);

let mainWindow = null;
let clientDb = null;
let clientState = {
    baseUrl: DEFAULT_BASE_URL,
    sessionCookie: '',
    currentUser: null,
    offlineMode: false
};

function loadClientState() {
    if (!clientDb) {
        return clientState;
    }

    const persistedState = clientDb.loadClientState();
    clientState = {
        baseUrl: persistedState.baseUrl || DEFAULT_BASE_URL,
        sessionCookie: persistedState.sessionCookie || '',
        currentUser: persistedState.currentUser || null,
        offlineMode: Boolean(persistedState.offlineMode)
    };

    return clientState;
}

function getBootstrapPayload() {
    const state = loadClientState();

    return {
        appName: CLIENT_WINDOW_TITLE,
        isDevMode: IS_DEV_MODE,
        databasePath: clientDb ? clientDb.databasePath : '',
        userDataPath: app.getPath('userData'),
        baseUrl: state.baseUrl || DEFAULT_BASE_URL,
        currentUser: state.currentUser || null,
        sessionActive: Boolean(state.sessionCookie),
        offlineMode: Boolean(state.offlineMode),
        authMode: state.sessionCookie ? 'online' : (state.offlineMode ? 'offline' : 'none'),
        versions: {
            electron: process.versions.electron || null,
            node: process.versions.node || null,
            chrome: process.versions.chrome || null
        },
        counts: clientDb ? clientDb.getBootstrapStats() : null
    };
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1240,
        height: 860,
        minWidth: 1024,
        minHeight: 720,
        title: CLIENT_WINDOW_TITLE,
        icon: path.join(__dirname, '..', '..', 'assets', 'client-sender-icon.png'),
        autoHideMenuBar: !IS_DEV_MODE,
        webPreferences: createSecureWebPreferences(__dirname, {
            preloadFile: 'preload.js',
            devTools: IS_DEV_MODE
        })
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    if (IS_SMOKE_TEST) {
        mainWindow.webContents.once('did-finish-load', () => {
            setTimeout(() => app.quit(), 1200);
        });
    }

    if (IS_DEV_MODE) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function persistSessionState() {
    if (!clientDb) {
        return;
    }

    clientDb.saveSession({
        baseUrl: clientState.baseUrl || DEFAULT_BASE_URL,
        sessionCookie: clientState.sessionCookie || '',
        currentUser: clientState.currentUser || null,
        offlineMode: Boolean(clientState.offlineMode)
    });
}

function clearSessionState() {
    clientState = {
        ...clientState,
        sessionCookie: '',
        currentUser: null,
        offlineMode: false
    };

    if (clientDb) {
        clientDb.clearSession();
        clientDb.saveBaseUrl(clientState.baseUrl || DEFAULT_BASE_URL);
    }
}

function applySessionCookieUpdate(nextSessionCookie) {
    if (typeof nextSessionCookie !== 'string') {
        return;
    }

    clientState.sessionCookie = nextSessionCookie || '';
    if (clientState.sessionCookie) {
        clientState.offlineMode = false;
    } else if (!clientState.offlineMode) {
        clientState.currentUser = null;
    }
    persistSessionState();
}

function isAuthError(error) {
    return Boolean(error && (error.code === 'AUTH_REQUIRED' || error.statusCode === 401));
}

function isNetworkFailure(error) {
    return Boolean(error && !error.statusCode && error.code !== 'AUTH_REQUIRED');
}

function beginOfflineSession({ baseUrl, currentUser }) {
    clientState = {
        ...clientState,
        baseUrl: baseUrl || clientState.baseUrl || DEFAULT_BASE_URL,
        sessionCookie: '',
        currentUser: currentUser || null,
        offlineMode: Boolean(currentUser)
    };
    persistSessionState();
}

function fallbackToOfflineSession(baseUrl = clientState.baseUrl, currentUser = clientState.currentUser) {
    if (!clientDb || !currentUser || !currentUser.id) {
        return false;
    }

    const offlineUser = clientDb.getOfflineCashierUser(baseUrl || clientState.baseUrl || DEFAULT_BASE_URL, currentUser.id);
    if (!offlineUser) {
        return false;
    }

    beginOfflineSession({
        baseUrl: baseUrl || clientState.baseUrl || DEFAULT_BASE_URL,
        currentUser: offlineUser
    });

    return true;
}

function createOfflineQueueResponse(request, message) {
    return {
        success: true,
        queuedOffline: true,
        error: message || '',
        request,
        counts: clientDb ? clientDb.getBootstrapStats() : null,
        bootstrap: getBootstrapPayload()
    };
}

function createCacheSuccessResponse(fieldName, values, warning = '', extra = {}) {
    return {
        success: true,
        [fieldName]: values,
        source: 'cache',
        warning: warning || '',
        ...extra,
        bootstrap: getBootstrapPayload()
    };
}

function createRemoteSuccessResponse(fieldName, values, extra = {}) {
    return {
        success: true,
        [fieldName]: values,
        source: 'remote',
        ...extra,
        bootstrap: getBootstrapPayload()
    };
}

async function runAuthenticatedRequest(executor) {
    try {
        const result = await executor(
            clientState.baseUrl || DEFAULT_BASE_URL,
            clientState.sessionCookie,
            clientState.currentUser || null
        );

        applySessionCookieUpdate(result && result.sessionCookie);

        return {
            success: true,
            ...(result || {}),
            bootstrap: getBootstrapPayload()
        };
    } catch (error) {
        applySessionCookieUpdate(error && error.sessionCookie);

        if (isAuthError(error)) {
            clearSessionState();
        }

        return {
            success: false,
            error: error.message,
            authExpired: isAuthError(error),
            bootstrap: getBootstrapPayload()
        };
    }
}

async function submitSingleRequest(payload) {
    if (!clientDb) {
        throw new Error('Client sender database not initialized');
    }

    const queuedRequest = clientDb.queueRequest(payload || {});

    if (clientState.offlineMode) {
        return createOfflineQueueResponse(
            queuedRequest,
            'تم حفظ الطلب محليًا وسيُرسل عند عودة الاتصال ثم تسجيل الدخول أونلاين.'
        );
    }

    try {
        clientDb.markRequestSending(queuedRequest.id);

        const response = await sendReconciliationRequest(
            clientState.baseUrl || DEFAULT_BASE_URL,
            clientState.sessionCookie,
            queuedRequest.payload
        );

        applySessionCookieUpdate(response.sessionCookie);

        const request = clientDb.markRequestSent(queuedRequest.id, response.id);
        return {
            success: true,
            request,
            remoteId: response.id || null,
            counts: clientDb.getBootstrapStats(),
            bootstrap: getBootstrapPayload()
        };
    } catch (error) {
        applySessionCookieUpdate(error.sessionCookie);

        if (isAuthError(error) && fallbackToOfflineSession()) {
            const request = clientDb.markRequestQueued(queuedRequest.id);
            return createOfflineQueueResponse(
                request,
                'انتهت جلسة الخادم، وتم تحويل التطبيق إلى وضع أوفلاين مع حفظ الطلب محليًا.'
            );
        }

        if (isAuthError(error)) {
            clearSessionState();
        }

        const request = isNetworkFailure(error)
            ? clientDb.markRequestQueued(queuedRequest.id)
            : clientDb.markRequestFailed(queuedRequest.id, error.message);

        if (isNetworkFailure(error)) {
            return createOfflineQueueResponse(
                request,
                error.message || 'تعذر الاتصال بالخادم، وتم حفظ الطلب محليًا.'
            );
        }

        return {
            success: false,
            error: error.message,
            authExpired: isAuthError(error),
            request,
            counts: clientDb.getBootstrapStats(),
            bootstrap: getBootstrapPayload()
        };
    }
}

async function resendPendingRequests() {
    if (!clientDb) {
        throw new Error('Client sender database not initialized');
    }

    const pendingRequests = clientDb.listPendingRequests(50);
    const summary = {
        success: true,
        total: pendingRequests.length,
        sent: 0,
        failed: 0,
        authExpired: false,
        errors: []
    };

    if (clientState.offlineMode || !clientState.sessionCookie) {
        return {
            ...summary,
            success: false,
            offlineMode: true,
            error: 'التطبيق يعمل الآن بوضع أوفلاين. أعد الاتصال ثم سجّل الدخول أونلاين لإرسال الطلبات المعلقة.',
            counts: clientDb.getBootstrapStats(),
            bootstrap: getBootstrapPayload()
        };
    }

    if (!pendingRequests.length) {
        return {
            ...summary,
            counts: clientDb.getBootstrapStats(),
            bootstrap: getBootstrapPayload()
        };
    }

    for (const pendingRequest of pendingRequests) {
        try {
            clientDb.markRequestSending(pendingRequest.id);

            const response = await sendReconciliationRequest(
                clientState.baseUrl || DEFAULT_BASE_URL,
                clientState.sessionCookie,
                pendingRequest.payload
            );

            applySessionCookieUpdate(response.sessionCookie);

            clientDb.markRequestSent(pendingRequest.id, response.id);
            summary.sent += 1;
        } catch (error) {
            applySessionCookieUpdate(error.sessionCookie);

            clientDb.markRequestFailed(pendingRequest.id, error.message);
            summary.failed += 1;
            summary.errors.push({
                id: pendingRequest.id,
                message: error.message
            });

            if (isAuthError(error)) {
                if (fallbackToOfflineSession()) {
                    summary.success = false;
                    summary.offlineMode = true;
                    summary.error = 'انتهت جلسة الخادم، وتم تحويل التطبيق إلى وضع أوفلاين. أعد الاتصال لاحقًا لإكمال الإرسال.';
                    break;
                }

                clearSessionState();
                summary.success = false;
                summary.authExpired = true;
                break;
            }
        }
    }

    return {
        ...summary,
        counts: clientDb.getBootstrapStats(),
        bootstrap: getBootstrapPayload()
    };
}

async function resendSingleRequest(requestId) {
    if (!clientDb) {
        throw new Error('Client sender database not initialized');
    }

    const numericRequestId = Number(requestId || 0);
    const existingRequest = clientDb.getRequestById(numericRequestId);

    if (!existingRequest) {
        return {
            success: false,
            error: 'الطلب غير موجود محليًا',
            bootstrap: getBootstrapPayload()
        };
    }

    if (!['queued', 'failed'].includes(existingRequest.status)) {
        return {
            success: false,
            error: 'لا يمكن إعادة إرسال هذا الطلب لأنه ليس معلقًا',
            request: existingRequest,
            bootstrap: getBootstrapPayload()
        };
    }

    if (clientState.offlineMode || !clientState.sessionCookie) {
        return {
            success: false,
            offlineMode: true,
            error: 'التطبيق يعمل الآن بوضع أوفلاين. أعد الاتصال ثم سجّل الدخول أونلاين لإرسال هذا الطلب.',
            request: existingRequest,
            counts: clientDb.getBootstrapStats(),
            bootstrap: getBootstrapPayload()
        };
    }

    try {
        clientDb.markRequestSending(existingRequest.id);

        const response = await sendReconciliationRequest(
            clientState.baseUrl || DEFAULT_BASE_URL,
            clientState.sessionCookie,
            existingRequest.payload
        );

        applySessionCookieUpdate(response.sessionCookie);

        const request = clientDb.markRequestSent(existingRequest.id, response.id);
        return {
            success: true,
            request,
            remoteId: response.id || null,
            counts: clientDb.getBootstrapStats(),
            bootstrap: getBootstrapPayload()
        };
    } catch (error) {
        applySessionCookieUpdate(error.sessionCookie);

        if (isAuthError(error) && fallbackToOfflineSession()) {
            const request = clientDb.markRequestQueued(existingRequest.id);
            return {
                success: false,
                offlineMode: true,
                error: 'انتهت جلسة الخادم، وتم تحويل التطبيق إلى وضع أوفلاين. أعد الاتصال لاحقًا لإرسال هذا الطلب.',
                request,
                counts: clientDb.getBootstrapStats(),
                bootstrap: getBootstrapPayload()
            };
        }

        if (isAuthError(error)) {
            clearSessionState();
        }

        const request = isNetworkFailure(error)
            ? clientDb.markRequestQueued(existingRequest.id)
            : clientDb.markRequestFailed(existingRequest.id, error.message);

        return {
            success: false,
            error: error.message,
            authExpired: isAuthError(error),
            offlineMode: isNetworkFailure(error),
            request,
            counts: clientDb.getBootstrapStats(),
            bootstrap: getBootstrapPayload()
        };
    }
}

async function adminResendSentRequest(requestId, approval = {}) {
    if (!clientDb) {
        throw new Error('Client sender database not initialized');
    }

    const numericRequestId = Number(requestId || 0);
    const existingRequest = clientDb.getRequestById(numericRequestId);

    if (!existingRequest) {
        return {
            success: false,
            error: 'الطلب غير موجود محليًا',
            bootstrap: getBootstrapPayload()
        };
    }

    if (existingRequest.status !== 'sent') {
        return {
            success: false,
            error: 'هذا الإجراء متاح فقط للطلبات المرسلة سابقًا',
            request: existingRequest,
            bootstrap: getBootstrapPayload()
        };
    }

    const normalizedBaseUrl = normalizeBaseUrl(
        approval && approval.baseUrl ? approval.baseUrl : clientState.baseUrl
    );
    const normalizedReason = String(approval && approval.reason ? approval.reason : '').trim();

    if (!normalizedReason) {
        return {
            success: false,
            error: 'سبب إعادة الإرسال مطلوب',
            request: existingRequest,
            bootstrap: getBootstrapPayload()
        };
    }

    let adminAuth = null;
    let clonedRequest = null;

    try {
        adminAuth = await loginAdmin(
            normalizedBaseUrl,
            approval && approval.username ? approval.username : '',
            approval && approval.password ? approval.password : ''
        );

        clonedRequest = clientDb.cloneRequestForApprovedResend(existingRequest, {
            admin_id: adminAuth && adminAuth.user ? adminAuth.user.id : null,
            admin_name: adminAuth && adminAuth.user ? adminAuth.user.name : '',
            admin_username: adminAuth && adminAuth.user ? adminAuth.user.username : '',
            reason: normalizedReason
        });

        clientDb.markRequestSending(clonedRequest.id);

        const response = await sendReconciliationRequest(
            normalizedBaseUrl,
            adminAuth.sessionCookie,
            clonedRequest.payload
        );

        const request = clientDb.markRequestSent(clonedRequest.id, response.id);

        return {
            success: true,
            request,
            sourceRequestId: existingRequest.id,
            remoteId: response.id || null,
            counts: clientDb.getBootstrapStats(),
            bootstrap: getBootstrapPayload()
        };
    } catch (error) {
        if (isNetworkFailure(error) && clonedRequest) {
            const queuedRequest = clientDb.markRequestQueued(clonedRequest.id);

            return {
                success: false,
                offlineMode: true,
                error: 'تم اعتماد إعادة الإرسال، لكن تعذر الإرسال الآن. حُفظت نسخة معلقة لإرسالها لاحقًا.',
                request: queuedRequest,
                counts: clientDb.getBootstrapStats(),
                bootstrap: getBootstrapPayload()
            };
        }

        return {
            success: false,
            error: error.message,
            request: existingRequest,
            counts: clientDb.getBootstrapStats(),
            bootstrap: getBootstrapPayload()
        };
    }
}

function registerIpcHandlers() {
    ipcMain.handle('client-sender:get-bootstrap', async () => getBootstrapPayload());

    ipcMain.handle('client-sender:list-recent-requests', async (_event, limit) => {
        return clientDb ? clientDb.listRecentRequests(limit) : [];
    });

    ipcMain.handle('client-sender:save-draft', async (_event, payload) => {
        if (!clientDb) {
            throw new Error('Client sender database not initialized');
        }

        const draft = clientDb.saveDraft(payload || {});
        return {
            success: true,
            draft,
            counts: clientDb.getBootstrapStats()
        };
    });

    ipcMain.handle('client-sender:save-working-draft', async (_event, payload) => {
        if (!clientDb) {
            throw new Error('Client sender database not initialized');
        }

        const cashierId = payload && payload.cashierId ? payload.cashierId : null;
        const draft = payload ? payload.draft : null;
        return {
            success: true,
            draft: clientDb.saveWorkingDraft(cashierId, draft)
        };
    });

    ipcMain.handle('client-sender:load-working-draft', async (_event, cashierId) => {
        if (!clientDb) {
            throw new Error('Client sender database not initialized');
        }

        return {
            success: true,
            draft: clientDb.loadWorkingDraft(cashierId)
        };
    });

    ipcMain.handle('client-sender:clear-working-draft', async (_event, cashierId) => {
        if (!clientDb) {
            throw new Error('Client sender database not initialized');
        }

        return {
            success: clientDb.clearWorkingDraft(cashierId)
        };
    });

    ipcMain.handle('client-sender:verify-admin-access', async (_event, credentials) => {
        const normalizedBaseUrl = normalizeBaseUrl(
            credentials && credentials.baseUrl ? credentials.baseUrl : clientState.baseUrl
        );

        const result = await loginAdmin(
            normalizedBaseUrl,
            credentials && credentials.username ? credentials.username : '',
            credentials && credentials.password ? credentials.password : ''
        );

        return {
            success: true,
            baseUrl: result.baseUrl || normalizedBaseUrl,
            user: result.user || null
        };
    });

    ipcMain.handle('client-sender:save-base-url', async (_event, baseUrl) => {
        if (!clientDb) {
            throw new Error('Client sender database not initialized');
        }

        const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
        clientState.baseUrl = normalizedBaseUrl;
        clientDb.saveBaseUrl(normalizedBaseUrl);

        return {
            success: true,
            baseUrl: normalizedBaseUrl,
            bootstrap: getBootstrapPayload()
        };
    });

    ipcMain.handle('client-sender:login-cashier', async (_event, credentials) => {
        if (!clientDb) {
            throw new Error('Client sender database not initialized');
        }

        const normalizedBaseUrl = normalizeBaseUrl(
            credentials && credentials.baseUrl ? credentials.baseUrl : clientState.baseUrl
        );
        const normalizedCashierId = credentials && credentials.cashierId ? credentials.cashierId : null;
        const normalizedPin = credentials && credentials.pin ? credentials.pin : '';

        try {
            const result = await loginCashier(
                normalizedBaseUrl,
                normalizedCashierId,
                normalizedPin
            );

            clientState = {
                baseUrl: result.baseUrl || clientState.baseUrl || DEFAULT_BASE_URL,
                sessionCookie: result.sessionCookie || '',
                currentUser: result.user || null,
                offlineMode: false
            };
            persistSessionState();
            clientDb.saveOfflineCashierAuth(clientState.baseUrl, clientState.currentUser, normalizedPin);

            return {
                success: true,
                offline: false,
                baseUrl: clientState.baseUrl,
                currentUser: clientState.currentUser,
                bootstrap: getBootstrapPayload()
            };
        } catch (error) {
            if (!isNetworkFailure(error)) {
                throw error;
            }

            const offlineUser = clientDb.verifyOfflineCashierLogin(
                normalizedBaseUrl,
                normalizedCashierId,
                normalizedPin
            );

            if (!offlineUser) {
                throw new Error('تعذر الاتصال بالخادم ولا توجد نسخة محلية صالحة لهذا الكاشير على هذا الجهاز');
            }

            beginOfflineSession({
                baseUrl: normalizedBaseUrl,
                currentUser: offlineUser
            });

            return {
                success: true,
                offline: true,
                warning: error.message || 'تم الدخول من النسخة المحلية',
                baseUrl: clientState.baseUrl,
                currentUser: clientState.currentUser,
                bootstrap: getBootstrapPayload()
            };
        }
    });

    ipcMain.handle('client-sender:logout', async () => {
        if (clientState.sessionCookie) {
            await runAuthenticatedRequest(async (baseUrl, sessionCookie) => {
                await logoutCashier(baseUrl, sessionCookie);
                return {};
            });
        }

        clearSessionState();
        return {
            success: true,
            bootstrap: getBootstrapPayload()
        };
    });

    ipcMain.handle('client-sender:submit-request', async (_event, payload) => {
        return submitSingleRequest(payload);
    });

    ipcMain.handle('client-sender:send-pending', async () => {
        return resendPendingRequests();
    });

    ipcMain.handle('client-sender:resend-request', async (_event, requestId) => {
        return resendSingleRequest(requestId);
    });

    ipcMain.handle('client-sender:admin-resend-request', async (_event, payload) => {
        return adminResendSentRequest(payload && payload.requestId ? payload.requestId : null, payload || {});
    });

    ipcMain.handle('client-sender:fetch-customers', async () => {
        if (clientState.offlineMode && clientDb) {
            return createCacheSuccessResponse(
                'customers',
                clientDb.listCachedCustomers(),
                'التطبيق يعمل الآن من النسخة المحلية.',
                { offline: true }
            );
        }

        try {
            const result = await fetchCustomers(
                clientState.baseUrl || DEFAULT_BASE_URL,
                clientState.sessionCookie,
                clientState.currentUser && clientState.currentUser.id ? clientState.currentUser.id : null
            );

            applySessionCookieUpdate(result.sessionCookie);
            const customers = result.data && Array.isArray(result.data.customers)
                ? result.data.customers
                : [];
            if (clientDb) {
                clientDb.cacheCustomers(customers);
            }

            return createRemoteSuccessResponse('customers', customers);
        } catch (error) {
            applySessionCookieUpdate(error && error.sessionCookie);

            const authError = isAuthError(error);
            if (!authError && clientDb) {
                const cachedCustomers = clientDb.listCachedCustomers();
                if (cachedCustomers.length > 0) {
                    return createCacheSuccessResponse(
                        'customers',
                        cachedCustomers,
                        error.message,
                        { offline: isNetworkFailure(error) }
                    );
                }
            }

            if (authError && fallbackToOfflineSession()) {
                const cachedCustomers = clientDb ? clientDb.listCachedCustomers() : [];
                return createCacheSuccessResponse(
                    'customers',
                    cachedCustomers,
                    cachedCustomers.length > 0
                        ? 'انتهت جلسة الخادم، وتم الانتقال إلى النسخة المحلية.'
                        : 'انتهت جلسة الخادم، وتم إبقاء التطبيق في وضع أوفلاين حتى دون وجود بيانات عملاء محفوظة.',
                    { offline: true }
                );
            }

            if (authError) {
                clearSessionState();
            }

            return {
                success: false,
                error: error.message,
                authExpired: authError,
                bootstrap: getBootstrapPayload()
            };
        }
    });

    ipcMain.handle('client-sender:fetch-atms', async () => {
        if (clientState.offlineMode && clientDb) {
            return createCacheSuccessResponse(
                'atms',
                clientDb.listCachedAtms(),
                'التطبيق يعمل الآن من النسخة المحلية.',
                { offline: true }
            );
        }

        try {
            const result = await fetchAtms(
                clientState.baseUrl || DEFAULT_BASE_URL,
                clientState.sessionCookie,
                clientState.currentUser && clientState.currentUser.id ? clientState.currentUser.id : null
            );

            applySessionCookieUpdate(result.sessionCookie);
            const atms = result.data && Array.isArray(result.data.atms)
                ? result.data.atms
                : [];
            if (clientDb) {
                clientDb.cacheAtms(atms);
            }

            return createRemoteSuccessResponse('atms', atms);
        } catch (error) {
            applySessionCookieUpdate(error && error.sessionCookie);

            const authError = isAuthError(error);
            if (!authError && clientDb) {
                const cachedAtms = clientDb.listCachedAtms();
                if (cachedAtms.length > 0) {
                    return createCacheSuccessResponse(
                        'atms',
                        cachedAtms,
                        error.message,
                        { offline: isNetworkFailure(error) }
                    );
                }
            }

            if (authError && fallbackToOfflineSession()) {
                const cachedAtms = clientDb ? clientDb.listCachedAtms() : [];
                return createCacheSuccessResponse(
                    'atms',
                    cachedAtms,
                    cachedAtms.length > 0
                        ? 'انتهت جلسة الخادم، وتم الانتقال إلى النسخة المحلية.'
                        : 'انتهت جلسة الخادم، وتم إبقاء التطبيق في وضع أوفلاين حتى دون وجود أجهزة صراف محفوظة.',
                    { offline: true }
                );
            }

            if (authError) {
                clearSessionState();
            }

            return {
                success: false,
                error: error.message,
                authExpired: authError,
                bootstrap: getBootstrapPayload()
            };
        }
    });

    ipcMain.handle('client-sender:fetch-cashiers-list', async (_event, baseUrl) => {
        const normalizedBaseUrl = normalizeBaseUrl(baseUrl || clientState.baseUrl || DEFAULT_BASE_URL);
        clientState.baseUrl = normalizedBaseUrl;
        if (clientDb) {
            clientDb.saveBaseUrl(normalizedBaseUrl);
        }

        try {
            const result = await fetchCashiersList(normalizedBaseUrl);
            const cashiers = result.data && Array.isArray(result.data.data)
                ? result.data.data
                : [];

            if (clientDb) {
                clientDb.cacheCashiers(cashiers);
            }

            return createRemoteSuccessResponse('cashiers', cashiers);
        } catch (error) {
            if (clientDb) {
                const cachedCashiers = clientDb.listCachedCashiers();
                if (cachedCashiers.length > 0) {
                    return createCacheSuccessResponse(
                        'cashiers',
                        cachedCashiers,
                        error.message
                    );
                }
            }

            return {
                success: false,
                error: error.message,
                bootstrap: getBootstrapPayload()
            };
        }
    });

    ipcMain.handle('client-sender:open-data-directory', async () => {
        const targetPath = clientDb ? path.dirname(clientDb.databasePath) : app.getPath('userData');
        const result = await shell.openPath(targetPath);
        return {
            success: !result,
            error: result || null,
            path: targetPath
        };
    });
}

async function initialize() {
    clientDb = createClientSenderDb({
        basePath: app.getPath('userData')
    }).initialize();
    clientDb.recoverInterruptedRequests();
    loadClientState();

    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
}

app.whenReady().then(initialize).catch((error) => {
    console.error('Failed to initialize client sender app:', error);
    app.quit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (clientDb) {
        clientDb.close();
    }
});
