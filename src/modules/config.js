/**
 * @file config.js
 * @description وحدة التكوين - تحتوي على إدارة إعدادات التطبيق
 */

const { ipcRenderer } = require('electron');
const path = require('path');
const Joi = require('joi');
const DialogUtils = require('./dialog-utils');

class ConfigManager {
    constructor() {
        this.config = null;
        this.initialized = false;
        this.configPath = null;
        this.defaultConfig = {
            app: {
                name: 'تصفية برو',
                version: '3.0.0',
                locale: 'ar',
                theme: 'light',
                fontSize: 'medium',
                autoBackup: true,
                autoBackupInterval: 24, // ساعات
                maxBackupCount: 10
            },
            paths: {
                data: path.join(process.env.APPDATA, 'تصفية برو', 'data'),
                backup: path.join(process.env.APPDATA, 'تصفية برو', 'backup'),
                export: path.join(process.env.APPDATA, 'تصفية برو', 'export'),
                logs: path.join(process.env.APPDATA, 'تصفية برو', 'logs')
            },
            database: {
                filename: 'database.sqlite',
                backup: true,
                backupOnStart: true,
                backupBeforeUpdate: true,
                maxBackupCount: 5
            },
            printing: {
                defaultPrinter: '',
                paperSize: 'A4',
                orientation: 'portrait',
                margins: {
                    top: '2cm',
                    right: '2cm',
                    bottom: '2cm',
                    left: '2cm'
                },
                header: true,
                footer: true,
                logo: true
            },
            security: {
                passwordMinLength: 6,
                passwordRequireNumbers: true,
                passwordRequireLetters: true,
                sessionTimeout: 30, // دقائق
                maxLoginAttempts: 5,
                lockoutDuration: 15, // دقائق
                enableAutoLock: true
            },
            sync: {
                enabled: false,
                autoSync: false,
                syncInterval: 30, // دقائق
                server: '',
                retryCount: 3,
                retryDelay: 5 // دقائق
            },
            ui: {
                showWelcome: true,
                enableAnimations: true,
                showTips: true,
                confirmBeforeDelete: true,
                confirmBeforePrint: true,
                tableRowsPerPage: 20,
                dateFormat: 'YYYY-MM-DD',
                timeFormat: '24',
                currency: 'SAR',
                currencyPosition: 'after'
            },
            features: {
                enableReconciliation: true,
                enableReports: true,
                enableExport: true,
                enableSync: false,
                enableBackup: true,
                enableAudit: true
            }
        };
    }

    /**
     * تهيئة مدير التكوين
     */
    async initialize() {
        console.log('⚙️ [CONFIG] تهيئة مدير التكوين...');

        try {
            // تحميل التكوين
            this.config = await this.loadConfig();

            // التحقق من صحة التكوين
            this.validateConfig(this.config);

            // تحديث مسارات التطبيق
            await this.updateAppPaths();

            this.initialized = true;
            console.log('✅ [CONFIG] تم تهيئة مدير التكوين بنجاح');

            // نشر حدث تحديث التكوين
            this.notifyConfigUpdate();

        } catch (error) {
            console.error('❌ [CONFIG] خطأ في تهيئة مدير التكوين:', error);
            throw error;
        }
    }

    /**
     * تحميل التكوين
     * @private
     */
    async loadConfig() {
        try {
            // محاولة تحميل التكوين المحفوظ
            const savedConfig = await ipcRenderer.invoke('load-config');

            // دمج التكوين المحفوظ مع الافتراضي
            return this.mergeConfig(this.defaultConfig, savedConfig || {});

        } catch (error) {
            console.warn('⚠️ [CONFIG] تعذر تحميل التكوين المحفوظ:', error);
            return this.defaultConfig;
        }
    }

    /**
     * دمج التكوين
     * @private
     * @param {Object} target - الكائن الهدف
     * @param {Object} source - الكائن المصدر
     */
    mergeConfig(target, source) {
        const merged = { ...target };

        for (const key in source) {
            if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (target[key]) {
                    merged[key] = this.mergeConfig(target[key], source[key]);
                } else {
                    merged[key] = { ...source[key] };
                }
            } else {
                merged[key] = source[key];
            }
        }

        return merged;
    }

    /**
     * التحقق من صحة التكوين
     * @private
     * @param {Object} config - كائن التكوين
     */
    validateConfig(config) {
        // تعريف مخطط التحقق
        const schema = Joi.object({
            app: Joi.object({
                name: Joi.string().required(),
                version: Joi.string().required(),
                locale: Joi.string().valid('ar', 'en').required(),
                theme: Joi.string().valid('light', 'dark').required(),
                fontSize: Joi.string().valid('small', 'medium', 'large').required(),
                autoBackup: Joi.boolean().required(),
                autoBackupInterval: Joi.number().min(1).max(168).required(),
                maxBackupCount: Joi.number().min(1).max(100).required()
            }).required(),

            paths: Joi.object({
                data: Joi.string().required(),
                backup: Joi.string().required(),
                export: Joi.string().required(),
                logs: Joi.string().required()
            }).required(),

            database: Joi.object({
                filename: Joi.string().required(),
                backup: Joi.boolean().required(),
                backupOnStart: Joi.boolean().required(),
                backupBeforeUpdate: Joi.boolean().required(),
                maxBackupCount: Joi.number().min(1).max(100).required()
            }).required(),

            printing: Joi.object({
                defaultPrinter: Joi.string().allow(''),
                paperSize: Joi.string().valid('A4', 'A5', 'Letter').required(),
                orientation: Joi.string().valid('portrait', 'landscape').required(),
                margins: Joi.object({
                    top: Joi.string().required(),
                    right: Joi.string().required(),
                    bottom: Joi.string().required(),
                    left: Joi.string().required()
                }).required(),
                header: Joi.boolean().required(),
                footer: Joi.boolean().required(),
                logo: Joi.boolean().required()
            }).required(),

            security: Joi.object({
                passwordMinLength: Joi.number().min(6).max(50).required(),
                passwordRequireNumbers: Joi.boolean().required(),
                passwordRequireLetters: Joi.boolean().required(),
                sessionTimeout: Joi.number().min(5).max(480).required(),
                maxLoginAttempts: Joi.number().min(1).max(10).required(),
                lockoutDuration: Joi.number().min(5).max(60).required(),
                enableAutoLock: Joi.boolean().required()
            }).required(),

            sync: Joi.object({
                enabled: Joi.boolean().required(),
                autoSync: Joi.boolean().required(),
                syncInterval: Joi.number().min(5).max(1440).required(),
                server: Joi.string().allow(''),
                retryCount: Joi.number().min(1).max(10).required(),
                retryDelay: Joi.number().min(1).max(60).required()
            }).required(),

            ui: Joi.object({
                showWelcome: Joi.boolean().required(),
                enableAnimations: Joi.boolean().required(),
                showTips: Joi.boolean().required(),
                confirmBeforeDelete: Joi.boolean().required(),
                confirmBeforePrint: Joi.boolean().required(),
                tableRowsPerPage: Joi.number().min(10).max(100).required(),
                dateFormat: Joi.string().required(),
                timeFormat: Joi.string().valid('12', '24').required(),
                currency: Joi.string().required(),
                currencyPosition: Joi.string().valid('before', 'after').required()
            }).required(),

            features: Joi.object({
                enableReconciliation: Joi.boolean().required(),
                enableReports: Joi.boolean().required(),
                enableExport: Joi.boolean().required(),
                enableSync: Joi.boolean().required(),
                enableBackup: Joi.boolean().required(),
                enableAudit: Joi.boolean().required()
            }).required()
        });

        const { error } = schema.validate(config, { abortEarly: false });
        if (error) {
            throw new Error('تكوين غير صالح: ' + error.details.map(d => d.message).join(', '));
        }
    }

    /**
     * تحديث مسارات التطبيق
     * @private
     */
    async updateAppPaths() {
        try {
            // إنشاء المسارات إذا لم تكن موجودة
            for (const key in this.config.paths) {
                const dirPath = this.config.paths[key];
                await ipcRenderer.invoke('ensure-dir', dirPath);
            }
        } catch (error) {
            console.error('❌ [CONFIG] خطأ في تحديث مسارات التطبيق:', error);
            throw error;
        }
    }

    /**
     * الحصول على قيمة من التكوين
     * @param {string} key - المفتاح
     * @param {*} defaultValue - القيمة الافتراضية
     */
    get(key, defaultValue = null) {
        if (!this.initialized) {
            throw new Error('لم يتم تهيئة مدير التكوين بعد');
        }

        return key.split('.').reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : defaultValue), this.config);
    }

    /**
     * تحديث قيمة في التكوين
     * @param {string} key - المفتاح
     * @param {*} value - القيمة الجديدة
     */
    async set(key, value) {
        if (!this.initialized) {
            throw new Error('لم يتم تهيئة مدير التكوين بعد');
        }

        try {
            // تحديث القيمة
            const keys = key.split('.');
            let current = this.config;
            
            for (let i = 0; i < keys.length - 1; i++) {
                if (!(keys[i] in current)) {
                    current[keys[i]] = {};
                }
                current = current[keys[i]];
            }
            
            current[keys[keys.length - 1]] = value;

            // التحقق من صحة التكوين الجديد
            this.validateConfig(this.config);

            // حفظ التكوين
            await this.saveConfig();

            // تحديث المسارات إذا تم تغيير الإعدادات ذات الصلة
            if (key.startsWith('paths.')) {
                await this.updateAppPaths();
            }

            // نشر حدث تحديث التكوين
            this.notifyConfigUpdate();

            console.log('✅ [CONFIG] تم تحديث التكوين:', key);

        } catch (error) {
            console.error('❌ [CONFIG] خطأ في تحديث التكوين:', error);
            throw error;
        }
    }

    /**
     * حفظ التكوين
     * @private
     */
    async saveConfig() {
        try {
            await ipcRenderer.invoke('save-config', this.config);
        } catch (error) {
            console.error('❌ [CONFIG] خطأ في حفظ التكوين:', error);
            throw error;
        }
    }

    /**
     * إعادة تعيين التكوين إلى القيم الافتراضية
     */
    async resetToDefault() {
        try {
            const confirmed = await DialogUtils.showConfirm(
                'إعادة تعيين الإعدادات',
                'هل أنت متأكد من إعادة تعيين جميع الإعدادات إلى القيم الافتراضية؟'
            );

            if (!confirmed) {
                console.log('ℹ️ [CONFIG] تم إلغاء إعادة تعيين الإعدادات');
                return;
            }

            // نسخ التكوين الافتراضي
            this.config = { ...this.defaultConfig };

            // حفظ التكوين
            await this.saveConfig();

            // تحديث المسارات
            await this.updateAppPaths();

            // نشر حدث تحديث التكوين
            this.notifyConfigUpdate();

            console.log('✅ [CONFIG] تم إعادة تعيين الإعدادات بنجاح');
            DialogUtils.showSuccessToast('تم إعادة تعيين الإعدادات بنجاح');

        } catch (error) {
            console.error('❌ [CONFIG] خطأ في إعادة تعيين الإعدادات:', error);
            throw error;
        }
    }

    /**
     * تصدير التكوين
     * @param {string} filePath - مسار الملف
     */
    async exportConfig(filePath) {
        try {
            await ipcRenderer.invoke('write-json', {
                path: filePath,
                data: this.config
            });

            console.log('✅ [CONFIG] تم تصدير الإعدادات بنجاح:', filePath);
            DialogUtils.showSuccessToast('تم تصدير الإعدادات بنجاح');

        } catch (error) {
            console.error('❌ [CONFIG] خطأ في تصدير الإعدادات:', error);
            throw error;
        }
    }

    /**
     * استيراد التكوين
     * @param {string} filePath - مسار الملف
     */
    async importConfig(filePath) {
        try {
            const confirmed = await DialogUtils.showConfirm(
                'استيراد الإعدادات',
                'سيتم استبدال الإعدادات الحالية. هل تريد المتابعة؟'
            );

            if (!confirmed) {
                console.log('ℹ️ [CONFIG] تم إلغاء استيراد الإعدادات');
                return;
            }

            // قراءة الملف
            const importedConfig = await ipcRenderer.invoke('read-json', filePath);

            // التحقق من صحة التكوين المستورد
            this.validateConfig(importedConfig);

            // تحديث التكوين
            this.config = importedConfig;

            // حفظ التكوين
            await this.saveConfig();

            // تحديث المسارات
            await this.updateAppPaths();

            // نشر حدث تحديث التكوين
            this.notifyConfigUpdate();

            console.log('✅ [CONFIG] تم استيراد الإعدادات بنجاح');
            DialogUtils.showSuccessToast('تم استيراد الإعدادات بنجاح');

        } catch (error) {
            console.error('❌ [CONFIG] خطأ في استيراد الإعدادات:', error);
            throw error;
        }
    }

    /**
     * نشر حدث تحديث التكوين
     * @private
     */
    notifyConfigUpdate() {
        document.dispatchEvent(new CustomEvent('configChanged', {
            detail: { config: this.config }
        }));
    }
}

module.exports = new ConfigManager();