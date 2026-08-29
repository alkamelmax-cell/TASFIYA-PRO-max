const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'https://tasfiya-pro-max.onrender.com';
const SESSION_COOKIE_NAME = 'tasfiya_session';

function normalizeBaseUrl(input = '') {
    let value = String(input || '').trim();
    if (!value) {
        value = DEFAULT_BASE_URL;
    }

    if (!/^https?:\/\//i.test(value)) {
        value = `https://${value}`;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(value);
    } catch (_error) {
        throw new Error('رابط الخادم غير صالح');
    }

    const pathname = parsedUrl.pathname && parsedUrl.pathname !== '/'
        ? parsedUrl.pathname.replace(/\/+$/, '')
        : '';

    return `${parsedUrl.protocol}//${parsedUrl.host}${pathname}`;
}

function buildEndpoint(baseUrl, relativePath) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const safeRelativePath = String(relativePath || '').replace(/^\/+/, '');
    return new URL(safeRelativePath, `${normalizedBaseUrl}/`).toString();
}

function getSetCookieHeaders(response) {
    if (response && response.headers && typeof response.headers.raw === 'function') {
        return response.headers.raw()['set-cookie'] || [];
    }

    const singleHeader = response && response.headers
        ? response.headers.get('set-cookie')
        : '';
    return singleHeader ? [singleHeader] : [];
}

function extractSessionCookie(response) {
    const cookieHeaders = getSetCookieHeaders(response);

    for (const headerValue of cookieHeaders) {
        const cookiePair = String(headerValue || '').split(';')[0].trim();
        if (!cookiePair.startsWith(`${SESSION_COOKIE_NAME}=`)) {
            continue;
        }

        const cookieValue = cookiePair.slice(SESSION_COOKIE_NAME.length + 1).trim();
        return cookieValue ? `${SESSION_COOKIE_NAME}=${cookieValue}` : '';
    }

    return null;
}

async function parseResponseJson(response) {
    const rawText = await response.text();
    if (!rawText) {
        return {};
    }

    try {
        return JSON.parse(rawText);
    } catch (_error) {
        return {
            success: false,
            error: rawText
        };
    }
}

function createRequestError(message, extra = {}) {
    const error = new Error(message);
    Object.assign(error, extra);
    return error;
}

async function requestJson(baseUrl, relativePath, options = {}) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const normalizedSessionCookie = String(options.sessionCookie || '').trim();
    const requestHeaders = {
        ...(options.headers || {})
    };

    if (normalizedSessionCookie) {
        requestHeaders.Cookie = normalizedSessionCookie;
    }

    const response = await fetch(buildEndpoint(normalizedBaseUrl, relativePath), {
        method: options.method || 'GET',
        headers: requestHeaders,
        body: options.body
    });

    const data = await parseResponseJson(response);
    const refreshedSessionCookie = extractSessionCookie(response);

    if (response.status === 401) {
        throw createRequestError(
            data.error || 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى',
            {
                statusCode: response.status,
                code: 'AUTH_REQUIRED',
                response: data,
                sessionCookie: refreshedSessionCookie
            }
        );
    }

    if (!response.ok || data.success === false) {
        throw createRequestError(
            data.error || `تعذر تنفيذ الطلب (${response.status})`,
            {
                statusCode: response.status,
                response: data,
                sessionCookie: refreshedSessionCookie
            }
        );
    }

    return {
        data,
        sessionCookie: refreshedSessionCookie
    };
}

async function loginCashier(baseUrl, cashierId, pin) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const normalizedCashierId = Number(cashierId || 0);
    const normalizedPin = String(pin || '').trim();

    if (!normalizedCashierId) {
        throw new Error('رقم الكاشير مطلوب');
    }

    if (!normalizedPin) {
        throw new Error('رمز الدخول مطلوب');
    }

    const response = await fetch(buildEndpoint(normalizedBaseUrl, 'api/cashier-login'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            cashierId: normalizedCashierId,
            pin: normalizedPin
        })
    });

    const data = await parseResponseJson(response);
    const sessionCookie = extractSessionCookie(response);

    if (!response.ok || !data.success) {
        throw createRequestError(
            data.error || `تعذر تسجيل الدخول (${response.status})`,
            {
                statusCode: response.status,
                response: data
            }
        );
    }

    if (!sessionCookie) {
        throw createRequestError('تم تسجيل الدخول لكن لم يتم استلام جلسة صالحة', {
            statusCode: response.status,
            response: data
        });
    }

    return {
        baseUrl: normalizedBaseUrl,
        user: data.user || null,
        sessionCookie
    };
}

async function loginAdmin(baseUrl, username, password) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '').trim();

    if (!normalizedUsername) {
        throw new Error('اسم مستخدم الأدمن مطلوب');
    }

    if (!normalizedPassword) {
        throw new Error('كلمة مرور الأدمن مطلوبة');
    }

    const response = await fetch(buildEndpoint(normalizedBaseUrl, 'api/login'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: normalizedUsername,
            password: normalizedPassword
        })
    });

    const data = await parseResponseJson(response);
    const sessionCookie = extractSessionCookie(response);

    if (!response.ok || !data.success) {
        throw createRequestError(
            data.error || `تعذر التحقق من الأدمن (${response.status})`,
            {
                statusCode: response.status,
                response: data
            }
        );
    }

    return {
        baseUrl: normalizedBaseUrl,
        user: data.user || null,
        sessionCookie
    };
}

async function sendReconciliationRequest(baseUrl, sessionCookie, payload) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const normalizedSessionCookie = String(sessionCookie || '').trim();

    if (!normalizedSessionCookie) {
        throw createRequestError('لا توجد جلسة تسجيل دخول نشطة', {
            statusCode: 401,
            code: 'AUTH_REQUIRED'
        });
    }

    const { data, sessionCookie: refreshedSessionCookie } = await requestJson(
        normalizedBaseUrl,
        'api/reconciliation-requests',
        {
            method: 'POST',
            sessionCookie: normalizedSessionCookie,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload || {})
        }
    );

    return {
        id: data.id || null,
        response: data,
        sessionCookie: refreshedSessionCookie
    };
}

async function fetchCustomers(baseUrl, sessionCookie, cashierId) {
    const query = new URLSearchParams();
    if (cashierId) {
        query.set('cashierId', String(cashierId));
    }

    return requestJson(
        baseUrl,
        `api/customers${query.toString() ? `?${query.toString()}` : ''}`,
        {
            sessionCookie
        }
    );
}

async function fetchAtms(baseUrl, sessionCookie, cashierId) {
    const query = new URLSearchParams();
    if (cashierId) {
        query.set('cashierId', String(cashierId));
    }

    return requestJson(
        baseUrl,
        `api/atms${query.toString() ? `?${query.toString()}` : ''}`,
        {
            sessionCookie
        }
    );
}

async function logoutCashier(baseUrl, sessionCookie) {
    return requestJson(baseUrl, 'api/logout', {
        method: 'POST',
        sessionCookie
    });
}

async function fetchCashiersList(baseUrl) {
    const result = await requestJson(baseUrl, 'api/cashiers-list');
    return {
        data: result.data,
        sessionCookie: result.sessionCookie
    };
}

module.exports = {
    DEFAULT_BASE_URL,
    normalizeBaseUrl,
    loginAdmin,
    loginCashier,
    sendReconciliationRequest,
    fetchCustomers,
    fetchAtms,
    logoutCashier,
    fetchCashiersList
};
