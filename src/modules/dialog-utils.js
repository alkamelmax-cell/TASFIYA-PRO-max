/**
 * @file dialog-utils.js
 * @description وحدة معالجة النوافذ المنبثقة - تحتوي على الدوال المسؤولة عن عرض مربعات الحوار والرسائل
 */

class DialogUtils {
    /**
     * عرض مربع حوار تحميل
     * @param {string} message - الرسالة الرئيسية
     * @param {string} [title='يرجى الانتظار...'] - العنوان
     */
    static showLoading(message, title = 'يرجى الانتظار...') {
        // إغلاق أي مربع حوار سابق
        this.close();

        // إنشاء مربع الحوار
        const dialog = document.createElement('div');
        dialog.className = 'modal fade show';
        dialog.id = 'loadingDialog';
        dialog.style.display = 'block';
        dialog.style.backgroundColor = 'rgba(0,0,0,0.5)';

        dialog.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${title}</h5>
                    </div>
                    <div class="modal-body text-center">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="visually-hidden">جاري التحميل...</span>
                        </div>
                        <p class="mb-0">${message}</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
    }

    /**
     * إغلاق مربع الحوار النشط
     */
    static close() {
        const dialog = document.getElementById('loadingDialog');
        if (dialog) {
            dialog.remove();
        }
    }

    /**
     * عرض رسالة نجاح
     * @param {string} message - الرسالة
     * @param {string} [title='نجاح'] - العنوان
     */
    static async showSuccess(message, title = 'نجاح') {
        return new Promise(resolve => {
            const dialog = document.createElement('div');
            dialog.className = 'modal fade show';
            dialog.style.display = 'block';
            dialog.style.backgroundColor = 'rgba(0,0,0,0.5)';

            dialog.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-success text-white">
                            <h5 class="modal-title">${title}</h5>
                        </div>
                        <div class="modal-body">
                            <p class="mb-0">${message}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-success" id="successOkBtn">موافق</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            const okBtn = document.getElementById('successOkBtn');
            okBtn.focus();

            const closeDialog = () => {
                dialog.remove();
                resolve(true);
            };

            okBtn.onclick = closeDialog;

            // إغلاق عند الضغط على Escape
            dialog.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    closeDialog();
                }
            });
        });
    }

    /**
     * عرض رسالة خطأ
     * @param {string} message - الرسالة
     * @param {string} [title='خطأ'] - العنوان
     */
    static async showError(message, title = 'خطأ') {
        return new Promise(resolve => {
            const dialog = document.createElement('div');
            dialog.className = 'modal fade show';
            dialog.style.display = 'block';
            dialog.style.backgroundColor = 'rgba(0,0,0,0.5)';

            dialog.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title">${title}</h5>
                        </div>
                        <div class="modal-body">
                            <p class="mb-0">${message}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-danger" id="errorOkBtn">موافق</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            const okBtn = document.getElementById('errorOkBtn');
            okBtn.focus();

            const closeDialog = () => {
                dialog.remove();
                resolve(true);
            };

            okBtn.onclick = closeDialog;

            // إغلاق عند الضغط على Escape
            dialog.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    closeDialog();
                }
            });
        });
    }

    /**
     * عرض رسالة تأكيد
     * @param {string} message - الرسالة
     * @param {string} [title='تأكيد'] - العنوان
     * @returns {Promise<boolean>} إذا تم التأكيد أو الإلغاء
     */
    static showConfirm(message, title = 'تأكيد') {
        return new Promise(resolve => {
            const dialog = document.createElement('div');
            dialog.className = 'modal fade show';
            dialog.style.display = 'block';
            dialog.style.backgroundColor = 'rgba(0,0,0,0.5)';

            dialog.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-warning">
                            <h5 class="modal-title">${title}</h5>
                        </div>
                        <div class="modal-body">
                            <p class="mb-0">${message}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="confirmCancelBtn">إلغاء</button>
                            <button type="button" class="btn btn-warning" id="confirmOkBtn">موافق</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            const okBtn = document.getElementById('confirmOkBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');
            cancelBtn.focus();

            okBtn.onclick = () => {
                dialog.remove();
                resolve(true);
            };

            cancelBtn.onclick = () => {
                dialog.remove();
                resolve(false);
            };

            // إغلاق عند الضغط على Escape
            dialog.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    dialog.remove();
                    resolve(false);
                }
            });
        });
    }

    /**
     * عرض رسالة تأكيد تفعيل/إلغاء تفعيل
     * @param {string} action - نوع الإجراء (تفعيل أو إلغاء تفعيل)
     * @param {string} itemType - نوع العنصر
     * @returns {Promise<boolean>} إذا تم التأكيد أو الإلغاء
     */
    static showToggleConfirm(action, itemType) {
        const title = `تأكيد ${action}`;
        const message = `هل أنت متأكد من ${action} ${itemType}؟`;
        return this.showConfirm(message, title);
    }

    /**
     * عرض رسالة معلومات
     * @param {string} message - الرسالة
     * @param {string} [title='معلومات'] - العنوان
     */
    static showInfo(message, title = 'معلومات') {
        return new Promise(resolve => {
            const dialog = document.createElement('div');
            dialog.className = 'modal fade show';
            dialog.style.display = 'block';
            dialog.style.backgroundColor = 'rgba(0,0,0,0.5)';

            dialog.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title">${title}</h5>
                        </div>
                        <div class="modal-body">
                            <p class="mb-0">${message}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-info" id="infoOkBtn">موافق</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            const okBtn = document.getElementById('infoOkBtn');
            okBtn.focus();

            const closeDialog = () => {
                dialog.remove();
                resolve(true);
            };

            okBtn.onclick = closeDialog;

            // إغلاق عند الضغط على Escape
            dialog.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    closeDialog();
                }
            });
        });
    }

    /**
     * عرض رسالة إعلام سريعة
     * @param {string} message - الرسالة
     * @param {'success'|'error'|'warning'|'info'} [type='info'] - نوع الرسالة
     */
    static showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast show';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');

        let bgClass = '';
        let icon = '';
        switch (type) {
            case 'success':
                bgClass = 'bg-success text-white';
                icon = '✅';
                break;
            case 'error':
                bgClass = 'bg-danger text-white';
                icon = '❌';
                break;
            case 'warning':
                bgClass = 'bg-warning';
                icon = '⚠️';
                break;
            case 'info':
                bgClass = 'bg-info text-white';
                icon = 'ℹ️';
                break;
        }

        toast.innerHTML = `
            <div class="toast-body ${bgClass}">
                ${icon} ${message}
            </div>
        `;

        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '20px';
        toast.style.minWidth = '200px';
        toast.style.zIndex = '9999';

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    /**
     * عرض إشعار نجاح سريع
     * @param {string} message - الرسالة
     */
    static showSuccessToast(message) {
        this.showToast(message, 'success');
    }

    /**
     * عرض إشعار خطأ سريع
     * @param {string} message - الرسالة
     */
    static showErrorToast(message) {
        this.showToast(message, 'error');
    }

    /**
     * عرض إشعار تحذير سريع
     * @param {string} message - الرسالة
     */
    static showWarningToast(message) {
        this.showToast(message, 'warning');
    }

    /**
     * عرض إشعار معلومات سريع
     * @param {string} message - الرسالة
     */
    static showInfoToast(message) {
        this.showToast(message, 'info');
    }

    /**
     * عرض رسالة خطأ في التحقق
     * @param {string} message - رسالة الخطأ
     */
    static showValidationError(message) {
        this.showErrorToast(message);
    }

    /**
     * عرض رسالة تنبيه
     * @param {string} message - الرسالة
     * @param {string} title - العنوان
     * @param {'info'|'warning'|'error'|'success'} [type='info'] - نوع التنبيه
     */
    static showAlert(message, title, type = 'info') {
        let headerClass = '';
        switch (type) {
            case 'info':
                headerClass = 'bg-info text-white';
                break;
            case 'warning':
                headerClass = 'bg-warning';
                break;
            case 'error':
                headerClass = 'bg-danger text-white';
                break;
            case 'success':
                headerClass = 'bg-success text-white';
                break;
        }

        return new Promise(resolve => {
            const dialog = document.createElement('div');
            dialog.className = 'modal fade show';
            dialog.style.display = 'block';
            dialog.style.backgroundColor = 'rgba(0,0,0,0.5)';

            dialog.innerHTML = `
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content">
                        <div class="modal-header ${headerClass}">
                            <h5 class="modal-title">${title}</h5>
                        </div>
                        <div class="modal-body">
                            <pre style="white-space: pre-wrap; font-family: inherit;">${message}</pre>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="alertOkBtn">إغلاق</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            const okBtn = document.getElementById('alertOkBtn');
            okBtn.focus();

            const closeDialog = () => {
                dialog.remove();
                resolve(true);
            };

            okBtn.onclick = closeDialog;

            // إغلاق عند الضغط على Escape
            dialog.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    closeDialog();
                }
            });
        });
    }
}

module.exports = DialogUtils;