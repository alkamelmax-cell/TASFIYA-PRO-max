const { contextBridge, ipcRenderer } = require('electron');

function normalizeInvokeError(error) {
    const rawMessage = String(error && error.message ? error.message : error || '').trim();

    if (!rawMessage) {
        return 'حدث خطأ غير متوقع';
    }

    let message = rawMessage
        .replace(/^Error invoking remote method '[^']+':\s*/i, '')
        .replace(/^Error:\s*/i, '')
        .replace(/^cashier'?[:：]\s*/i, '')
        .replace(/^admin'?[:：]\s*/i, '')
        .trim();

    if (/fetch failed|failed to fetch/i.test(message)) {
        return 'تعذر الاتصال بالخادم';
    }

    if (/client sender database not initialized/i.test(message)) {
        return 'تعذر تهيئة بيانات التطبيق';
    }

    return message || 'حدث خطأ غير متوقع';
}

async function invokeClientSender(channel, ...args) {
    try {
        return await ipcRenderer.invoke(channel, ...args);
    } catch (error) {
        const normalizedError = new Error(normalizeInvokeError(error));
        normalizedError.originalMessage = error && error.message ? error.message : String(error || '');
        throw normalizedError;
    }
}

contextBridge.exposeInMainWorld('clientSender', {
    getBootstrap: () => invokeClientSender('client-sender:get-bootstrap'),
    listRecentRequests: (limit) => invokeClientSender('client-sender:list-recent-requests', limit),
    saveDraft: (payload) => invokeClientSender('client-sender:save-draft', payload),
    saveWorkingDraft: (payload) => invokeClientSender('client-sender:save-working-draft', payload),
    loadWorkingDraft: (cashierId) => invokeClientSender('client-sender:load-working-draft', cashierId),
    clearWorkingDraft: (cashierId) => invokeClientSender('client-sender:clear-working-draft', cashierId),
    verifyAdminAccess: (credentials) => invokeClientSender('client-sender:verify-admin-access', credentials),
    saveBaseUrl: (baseUrl) => invokeClientSender('client-sender:save-base-url', baseUrl),
    loginCashier: (credentials) => invokeClientSender('client-sender:login-cashier', credentials),
    logout: () => invokeClientSender('client-sender:logout'),
    submitRequest: (payload) => invokeClientSender('client-sender:submit-request', payload),
    sendPending: () => invokeClientSender('client-sender:send-pending'),
    resendRequest: (requestId) => invokeClientSender('client-sender:resend-request', requestId),
    adminResendRequest: (payload) => invokeClientSender('client-sender:admin-resend-request', payload),
    fetchCustomers: () => invokeClientSender('client-sender:fetch-customers'),
    fetchAtms: () => invokeClientSender('client-sender:fetch-atms'),
    fetchRequestConfig: () => invokeClientSender('client-sender:fetch-request-config'),
    fetchCashiersList: (baseUrl) => invokeClientSender('client-sender:fetch-cashiers-list', baseUrl),
    openDataDirectory: () => invokeClientSender('client-sender:open-data-directory')
});
