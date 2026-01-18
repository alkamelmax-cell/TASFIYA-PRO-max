/**
 * @file error-handler.js
 * @description وحدة معالجة الأخطاء - تحتوي على آليات معالجة وعرض الأخطاء
 */

const DialogUtils = require('./dialog-utils');

class ErrorHandler {
    constructor() {
        this.loggedErrors = new Map();
        this.errorTypes = new Map();
        this.initialized = false;

        // تعريف أنواع الأخطاء
        this.defineErrorTypes();
    }

    /**
     * تعريف أنواع الأخطاء
     * @private
     */
    defineErrorTypes() {
        this.errorTypes.set('DB_ERROR', {
            title: 'خطأ في قاعدة البيانات',
            severity: 'high',
            needsReporting: true
        });

        this.errorTypes.set('AUTH_ERROR', {
            title: 'خطأ في المصادقة',
            severity: 'medium',
            needsReporting: false
        });

        this.errorTypes.set('VALIDATION_ERROR', {
            title: 'خطأ في التحقق',
            severity: 'low',
            needsReporting: false
        });

        this.errorTypes.set('NETWORK_ERROR', {
            title: 'خطأ في الاتصال',
            severity: 'medium',
            needsReporting: true
        });

        this.errorTypes.set('FILE_SYSTEM_ERROR', {
            title: 'خطأ في نظام الملفات',
            severity: 'medium',
            needsReporting: true
        });

        this.errorTypes.set('PRINT_ERROR', {
            title: 'خطأ في الطباعة',
            severity: 'medium',
            needsReporting: true
        });

        this.errorTypes.set('SYNC_ERROR', {
            title: 'خطأ في المزامنة',
            severity: 'high',
            needsReporting: true
        });

        this.errorTypes.set('UNKNOWN_ERROR', {
            title: 'خطأ غير معروف',
            severity: 'high',
            needsReporting: true
        });
    }

    /**
     * تهيئة معالج الأخطاء
     */
    initialize() {
        if (this.initialized) return;

        console.log('🛠️ [ERROR] تهيئة معالج الأخطاء...');

        // التقاط الأخطاء غير المعالجة
        window.onerror = (message, source, lineno, colno, error) => {
            this.handleError(error || new Error(message), 'UNKNOWN_ERROR');
        };

        // التقاط الوعود المرفوضة غير المعالجة
        window.onunhandledrejection = (event) => {
            this.handleError(event.reason, 'UNKNOWN_ERROR');
        };

        this.initialized = true;
        console.log('✅ [ERROR] تم تهيئة معالج الأخطاء بنجاح');
    }

    /**
     * معالجة الخطأ
     * @param {Error} error - كائن الخطأ
     * @param {string} type - نوع الخطأ
     * @param {Object} context - سياق الخطأ
     */
    handleError(error, type = 'UNKNOWN_ERROR', context = {}) {
        // تجهيز بيانات الخطأ
        const errorInfo = {
            message: error.message || 'حدث خطأ غير معروف',
            stack: error.stack,
            timestamp: new Date().toISOString(),
            type,
            context
        };

        // الحصول على تعريف نوع الخطأ
        const errorType = this.errorTypes.get(type) || this.errorTypes.get('UNKNOWN_ERROR');

        // تسجيل الخطأ
        this.logError(errorInfo);

        // عرض رسالة الخطأ للمستخدم
        this.showErrorMessage(errorInfo, errorType);

        // الإبلاغ عن الخطأ إذا كان ضرورياً
        if (errorType.needsReporting) {
            this.reportError(errorInfo);
        }

        // تنفيذ الإجراءات الإضافية حسب نوع الخطأ
        this.handleErrorType(type, errorInfo);
    }

    /**
     * تسجيل الخطأ
     * @private
     * @param {Object} errorInfo - معلومات الخطأ
     */
    logError(errorInfo) {
        console.error(`❌ [ERROR][${errorInfo.type}] ${errorInfo.message}`, {
            timestamp: errorInfo.timestamp,
            stack: errorInfo.stack,
            context: errorInfo.context
        });

        // تخزين الخطأ في السجل
        const errorKey = `${errorInfo.type}_${errorInfo.timestamp}`;
        this.loggedErrors.set(errorKey, errorInfo);

        // تنظيف السجل (الاحتفاظ بآخر 100 خطأ فقط)
        if (this.loggedErrors.size > 100) {
            const oldestKey = Array.from(this.loggedErrors.keys())[0];
            this.loggedErrors.delete(oldestKey);
        }
    }

    /**
     * عرض رسالة الخطأ
     * @private
     * @param {Object} errorInfo - معلومات الخطأ
     * @param {Object} errorType - نوع الخطأ
     */
    showErrorMessage(errorInfo, errorType) {
        let message = errorInfo.message;
        let icon = '❌';

        // تخصيص الرسالة حسب نوع الخطأ
        switch (errorType.severity) {
            case 'high':
                icon = '🚨';
                message = `خطأ خطير: ${message}`;
                break;
            case 'medium':
                icon = '⚠️';
                message = `تنبيه: ${message}`;
                break;
            case 'low':
                icon = 'ℹ️';
                break;
        }

        // عرض الرسالة المناسبة
        if (errorType.severity === 'high') {
            DialogUtils.showError(errorType.title, `${icon} ${message}`, {
                stack: errorInfo.stack,
                timestamp: errorInfo.timestamp
            });
        } else {
            DialogUtils.showErrorToast(`${icon} ${message}`);
        }
    }

    /**
     * الإبلاغ عن الخطأ
     * @private
     * @param {Object} errorInfo - معلومات الخطأ
     */
    reportError(errorInfo) {
        // تجهيز بيانات التقرير
        const report = {
            ...errorInfo,
            appVersion: process.env.APP_VERSION,
            platform: process.platform,
            timestamp: new Date().toISOString()
        };

        // إرسال التقرير إلى الخادم
        console.log('📝 [ERROR] إرسال تقرير الخطأ:', report);

        // TODO: إرسال التقرير إلى نظام تتبع الأخطاء
    }

    /**
     * معالجة نوع محدد من الأخطاء
     * @private
     * @param {string} type - نوع الخطأ
     * @param {Object} errorInfo - معلومات الخطأ
     */
    handleErrorType(type, errorInfo) {
        switch (type) {
            case 'DB_ERROR':
                // محاولة إعادة الاتصال بقاعدة البيانات
                this.handleDatabaseError(errorInfo);
                break;

            case 'NETWORK_ERROR':
                // التحقق من حالة الاتصال وإعادة المحاولة
                this.handleNetworkError(errorInfo);
                break;

            case 'SYNC_ERROR':
                // تحديث حالة المزامنة وإعادة المحاولة
                this.handleSyncError(errorInfo);
                break;

            case 'FILE_SYSTEM_ERROR':
                // التحقق من الصلاحيات وحالة القرص
                this.handleFileSystemError(errorInfo);
                break;
        }
    }

    /**
     * معالجة أخطاء قاعدة البيانات
     * @private
     * @param {Object} errorInfo - معلومات الخطأ
     */
    handleDatabaseError(errorInfo) {
        // TODO: تنفيذ منطق إعادة الاتصال بقاعدة البيانات
    }

    /**
     * معالجة أخطاء الشبكة
     * @private
     * @param {Object} errorInfo - معلومات الخطأ
     */
    handleNetworkError(errorInfo) {
        // TODO: تنفيذ منطق التعامل مع أخطاء الشبكة
    }

    /**
     * معالجة أخطاء المزامنة
     * @private
     * @param {Object} errorInfo - معلومات الخطأ
     */
    handleSyncError(errorInfo) {
        // TODO: تنفيذ منطق التعامل مع أخطاء المزامنة
    }

    /**
     * معالجة أخطاء نظام الملفات
     * @private
     * @param {Object} errorInfo - معلومات الخطأ
     */
    handleFileSystemError(errorInfo) {
        // TODO: تنفيذ منطق التعامل مع أخطاء نظام الملفات
    }

    /**
     * الحصول على سجل الأخطاء
     */
    getErrorLog() {
        return Array.from(this.loggedErrors.values());
    }

    /**
     * مسح سجل الأخطاء
     */
    clearErrorLog() {
        this.loggedErrors.clear();
        console.log('🧹 [ERROR] تم مسح سجل الأخطاء');
    }
}

module.exports = new ErrorHandler();