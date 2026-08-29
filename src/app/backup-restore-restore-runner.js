const { mapDbErrorMessage } = require('./db-error-messages');

function createBackupRestoreRestoreRunnerHandlers(context) {
  const ipcRenderer = context.ipcRenderer;
  const window = context.windowObj || globalThis;
  const setTimeoutFn = context.setTimeoutFn || setTimeout;
  const getDialogUtils = context.getDialogUtils;
  const ensureRequiredTablesExist = context.ensureRequiredTablesExist;
  const validateBackupData = context.validateBackupData;
  const repairBackupForeignKeyReferences = context.repairBackupForeignKeyReferences;
  const validateDataConsistency = context.validateDataConsistency;
  const restoreDatabaseData = context.restoreDatabaseData;
  const performDatabaseIntegrityCheck = context.performDatabaseIntegrityCheck;

async function handleRestoreBackup() {
    console.log('📥 [RESTORE] بدء استعادة النسخة الاحتياطية...');

    try {
        // إنشاء الجداول المفقودة قبل الاستعادة
        console.log('🔧 [RESTORE] التأكد من وجود جميع الجداول المطلوبة...');
        await ensureRequiredTablesExist();
        // Show warning dialog first
        const confirmed = await getDialogUtils().showConfirm(
            'تحذير: ستؤدي هذه العملية إلى استبدال جميع البيانات الحالية بالبيانات من النسخة الاحتياطية.\n\nهل أنت متأكد من المتابعة؟',
            'تأكيد استعادة النسخة الاحتياطية'
        );

        if (!confirmed) {
            return;
        }

        // Get backup file from user
        const backupPath = await ipcRenderer.invoke('show-open-dialog', {
            title: 'اختر ملف النسخة الاحتياطية',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (!backupPath || backupPath.length === 0) {
            return; // User cancelled
        }

        getDialogUtils().showLoading('جاري استعادة النسخة الاحتياطية...', 'يرجى الانتظار قد تستغرق هذه العملية بضع دقائق');

        // Load and validate backup file
        const backupData = await ipcRenderer.invoke('load-backup-file', backupPath[0]);

        if (!backupData.success) {
            getDialogUtils().close();
            const friendly = mapDbErrorMessage(backupData.error, {
                fallback: 'تعذر قراءة ملف النسخة الاحتياطية.'
            });
            getDialogUtils().showError(`فشل في قراءة ملف النسخة الاحتياطية: ${friendly}`, 'خطأ في الاستعادة');
            return;
        }

        // Validate backup data structure
        const validationResult = validateBackupData(backupData.data);
        if (!validationResult.valid) {
            getDialogUtils().close();
            getDialogUtils().showError(`ملف النسخة الاحتياطية غير صالح: ${validationResult.error}`, 'خطأ في التحقق');
            return;
        }

        if (typeof repairBackupForeignKeyReferences === 'function') {
            await repairBackupForeignKeyReferences(backupData.data.data || backupData.data);
        }

        if (typeof validateDataConsistency === 'function') {
            const consistencyResult = validateDataConsistency(backupData.data.data || backupData.data);
            if (!consistencyResult.valid) {
                getDialogUtils().close();
                getDialogUtils().showError(
                    `تعذر استعادة النسخة الاحتياطية بسبب مراجع بيانات غير مكتملة: ${consistencyResult.error}`,
                    'خطأ في التحقق'
                );
                return;
            }
        }

        // Restore data to database
        const restoreResult = await restoreDatabaseData(backupData.data);

        getDialogUtils().close();

        if (restoreResult.success) {
            // Perform final integrity check
            const integrityCheck = await performDatabaseIntegrityCheck();

            let successMessage = `تم استعادة النسخة الاحتياطية بنجاح!\n\nتم استعادة ${restoreResult.recordCount} سجل\nمن ${restoreResult.tableCount} جدول`;

            if (integrityCheck.valid) {
                successMessage += '\n\n✅ تم التحقق من سلامة قاعدة البيانات';
            } else if (integrityCheck.issues) {
                successMessage += `\n\n⚠️ تحذيرات في قاعدة البيانات:\n${integrityCheck.issues.join('\n')}`;
            }

            successMessage += '\n\nسيتم إعادة تحميل التطبيق الآن.';

            getDialogUtils().showSuccess(successMessage, 'تم الاستعادة بنجاح');

            // Reload the application to reflect changes
            setTimeoutFn(() => {
                window.location.reload();
            }, 3000); // Give more time to read the message

            console.log('✅ [RESTORE] تم استعادة النسخة الاحتياطية بنجاح');
        } else {
            const friendly = mapDbErrorMessage(restoreResult.error, {
                fallback: 'تعذر استعادة النسخة الاحتياطية.'
            });
            getDialogUtils().showError(`فشل في استعادة النسخة الاحتياطية: ${friendly}`, 'خطأ في الاستعادة');
        }

    } catch (error) {
        getDialogUtils().close();
        console.error('❌ [RESTORE] خطأ في استعادة النسخة الاحتياطية:', error);
        const friendly = mapDbErrorMessage(error, {
            fallback: 'حدث خطأ أثناء استعادة النسخة الاحتياطية.'
        });
        getDialogUtils().showError(`حدث خطأ أثناء استعادة النسخة الاحتياطية: ${friendly}`, 'خطأ في الاستعادة');
    }
}

  return {
    handleRestoreBackup
  };
}

module.exports = {
  createBackupRestoreRestoreRunnerHandlers
};
