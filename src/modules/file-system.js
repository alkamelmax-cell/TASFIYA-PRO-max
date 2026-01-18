/**
 * @file file-system.js
 * @description وحدة إدارة الملفات - تحتوي على عمليات إدارة الملفات والمجلدات
 */

const { ipcRenderer } = require('electron');
const path = require('path');
const DialogUtils = require('./dialog-utils');

class FileSystemManager {
    constructor() {
        this.backupPath = null;
        this.exportPath = null;
    }

    /**
     * تهيئة مسارات الحفظ
     * @param {Object} paths - كائن يحتوي على المسارات الافتراضية
     */
    initializePaths(paths) {
        console.log('📂 [FS] تهيئة مسارات الملفات...');

        try {
            this.backupPath = paths.backupPath;
            this.exportPath = paths.exportPath;

            console.log('✅ [FS] تم تهيئة المسارات بنجاح');
        } catch (error) {
            console.error('❌ [FS] خطأ في تهيئة المسارات:', error);
            throw error;
        }
    }

    /**
     * إنشاء نسخة احتياطية
     * @param {string} customPath - مسار مخصص (اختياري)
     */
    async createBackup(customPath = null) {
        console.log('💾 [BACKUP] إنشاء نسخة احتياطية...');

        try {
            DialogUtils.showLoading('جاري إنشاء نسخة احتياطية...', 'يرجى الانتظار');

            const backupPath = customPath || this.backupPath;
            if (!backupPath) {
                throw new Error('لم يتم تحديد مسار النسخ الاحتياطي');
            }

            // إنشاء النسخة الاحتياطية
            const result = await ipcRenderer.invoke('create-backup', {
                path: backupPath,
                timestamp: new Date().toISOString()
            });

            console.log('✅ [BACKUP] تم إنشاء النسخة الاحتياطية بنجاح:', result.filePath);
            DialogUtils.showSuccessToast('تم إنشاء النسخة الاحتياطية بنجاح');

            return result;

        } catch (error) {
            console.error('❌ [BACKUP] خطأ في إنشاء النسخة الاحتياطية:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * استعادة نسخة احتياطية
     * @param {string} backupFile - مسار ملف النسخة الاحتياطية
     */
    async restoreBackup(backupFile) {
        console.log('📥 [RESTORE] استعادة النسخة الاحتياطية...');

        const confirmed = await DialogUtils.showConfirm(
            'استعادة النسخة الاحتياطية',
            'هل أنت متأكد من استعادة النسخة الاحتياطية؟ سيتم استبدال البيانات الحالية.'
        );

        if (!confirmed) {
            console.log('ℹ️ [RESTORE] تم إلغاء عملية الاستعادة');
            return;
        }

        try {
            DialogUtils.showLoading('جاري استعادة النسخة الاحتياطية...', 'يرجى الانتظار');

            // التحقق من وجود الملف
            if (!backupFile || !(await this.fileExists(backupFile))) {
                throw new Error('ملف النسخة الاحتياطية غير موجود');
            }

            // استعادة النسخة الاحتياطية
            await ipcRenderer.invoke('restore-backup', { filePath: backupFile });

            console.log('✅ [RESTORE] تم استعادة النسخة الاحتياطية بنجاح');
            DialogUtils.showSuccessToast('تم استعادة النسخة الاحتياطية بنجاح');

            // إعادة تشغيل التطبيق
            const restartConfirmed = await DialogUtils.showConfirm(
                'إعادة التشغيل',
                'يجب إعادة تشغيل التطبيق لتطبيق التغييرات. هل تريد إعادة التشغيل الآن؟'
            );

            if (restartConfirmed) {
                await ipcRenderer.invoke('app-restart');
            }

        } catch (error) {
            console.error('❌ [RESTORE] خطأ في استعادة النسخة الاحتياطية:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * تصدير البيانات إلى Excel
     * @param {Array} data - البيانات المراد تصديرها
     * @param {string} filename - اسم الملف
     * @param {Object} options - خيارات التصدير
     */
    async exportToExcel(data, filename, options = {}) {
        console.log('📊 [EXCEL] تصدير البيانات إلى Excel...');

        try {
            DialogUtils.showLoading('جاري التصدير إلى Excel...', 'يرجى الانتظار');

            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('لا توجد بيانات للتصدير');
            }

            // تحديد مسار الملف
            const exportPath = options.customPath || this.exportPath;
            if (!exportPath) {
                throw new Error('لم يتم تحديد مسار التصدير');
            }

            const fullPath = path.join(exportPath, `${filename}.xlsx`);

            // تصدير البيانات
            await ipcRenderer.invoke('export-excel', {
                data,
                filePath: fullPath,
                options: {
                    sheetName: options.sheetName || 'البيانات',
                    columns: options.columns || Object.keys(data[0]),
                    ...options
                }
            });

            console.log('✅ [EXCEL] تم تصدير البيانات بنجاح:', fullPath);
            DialogUtils.showSuccessToast('تم تصدير البيانات بنجاح');

            // فتح المجلد
            await this.openFolder(exportPath);

        } catch (error) {
            console.error('❌ [EXCEL] خطأ في تصدير البيانات:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * تصدير البيانات كملف PDF
     * @param {string} html - محتوى HTML للتصدير
     * @param {string} filename - اسم الملف
     * @param {Object} options - خيارات التصدير
     */
    async exportToPdf(html, filename, options = {}) {
        console.log('📄 [PDF] تصدير البيانات إلى PDF...');

        try {
            DialogUtils.showLoading('جاري التصدير إلى PDF...', 'يرجى الانتظار');

            if (!html) {
                throw new Error('لا يوجد محتوى للتصدير');
            }

            // تحديد مسار الملف
            const exportPath = options.customPath || this.exportPath;
            if (!exportPath) {
                throw new Error('لم يتم تحديد مسار التصدير');
            }

            const fullPath = path.join(exportPath, `${filename}.pdf`);

            // تصدير الملف
            await ipcRenderer.invoke('export-pdf', {
                html,
                filePath: fullPath,
                options: {
                    format: options.format || 'A4',
                    orientation: options.orientation || 'portrait',
                    margin: options.margin || { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
                    ...options
                }
            });

            console.log('✅ [PDF] تم تصدير الملف بنجاح:', fullPath);
            DialogUtils.showSuccessToast('تم تصدير الملف بنجاح');

            // فتح المجلد
            await this.openFolder(exportPath);

        } catch (error) {
            console.error('❌ [PDF] خطأ في تصدير الملف:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * فتح مجلد
     * @param {string} folderPath - مسار المجلد
     */
    async openFolder(folderPath) {
        try {
            await ipcRenderer.invoke('open-folder', folderPath);
        } catch (error) {
            console.error('❌ [FS] خطأ في فتح المجلد:', error);
            throw error;
        }
    }

    /**
     * التحقق من وجود ملف
     * @param {string} filePath - مسار الملف
     */
    async fileExists(filePath) {
        try {
            return await ipcRenderer.invoke('file-exists', filePath);
        } catch (error) {
            console.error('❌ [FS] خطأ في التحقق من وجود الملف:', error);
            throw error;
        }
    }

    /**
     * قراءة محتوى مجلد
     * @param {string} folderPath - مسار المجلد
     */
    async readDirectory(folderPath) {
        try {
            return await ipcRenderer.invoke('read-directory', folderPath);
        } catch (error) {
            console.error('❌ [FS] خطأ في قراءة محتوى المجلد:', error);
            throw error;
        }
    }

    /**
     * حذف ملف
     * @param {string} filePath - مسار الملف
     */
    async deleteFile(filePath) {
        try {
            const confirmed = await DialogUtils.showConfirm(
                'حذف الملف',
                'هل أنت متأكد من حذف هذا الملف؟'
            );

            if (!confirmed) {
                console.log('ℹ️ [FS] تم إلغاء عملية الحذف');
                return;
            }

            await ipcRenderer.invoke('delete-file', filePath);
            console.log('✅ [FS] تم حذف الملف بنجاح:', filePath);
            DialogUtils.showSuccessToast('تم حذف الملف بنجاح');

        } catch (error) {
            console.error('❌ [FS] خطأ في حذف الملف:', error);
            throw error;
        }
    }
}

module.exports = new FileSystemManager();