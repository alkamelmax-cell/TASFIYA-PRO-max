// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

// Dialog Utilities Module for Tasfiya Pro
// Provides non-blocking, async-friendly dialog functions using SweetAlert2

// Import SweetAlert2 (will be loaded via script tag in HTML)
// const Swal = window.Swal; // This will be available globally

/**
 * Dialog utility class providing modern, non-blocking dialog alternatives
 * Replaces all blocking alert(), confirm(), and prompt() calls
 */
class DialogUtils {
    
    /**
     * Show a simple alert message (non-blocking)
     * @param {string} message - The message to display
     * @param {string} title - Optional title (default: 'تنبيه')
     * @param {string} icon - Icon type: 'info', 'warning', 'error', 'success'
     */
    static async showAlert(message, title = 'تنبيه', icon = 'info') {
        return await Swal.fire({
            title: title,
            text: message,
            icon: icon,
            confirmButtonText: 'موافق',
            confirmButtonColor: '#0d6efd',
            customClass: {
                popup: 'rtl-popup',
                title: 'rtl-title',
                content: 'rtl-content'
            }
        });
    }

    /**
     * Show a success message
     * @param {string} message - The success message
     * @param {string} title - Optional title (default: 'نجح')
     */
    static async showSuccess(message, title = 'نجح') {
        return await Swal.fire({
            title: title,
            text: message,
            icon: 'success',
            confirmButtonText: 'موافق',
            confirmButtonColor: '#198754',
            timer: 3000,
            timerProgressBar: true,
            customClass: {
                popup: 'rtl-popup',
                title: 'rtl-title',
                content: 'rtl-content'
            }
        });
    }

    /**
     * Show an error message
     * @param {string} message - The error message
     * @param {string} title - Optional title (default: 'خطأ')
     */
    static async showError(message, title = 'خطأ') {
        return await Swal.fire({
            title: title,
            text: message,
            icon: 'error',
            confirmButtonText: 'موافق',
            confirmButtonColor: '#dc3545',
            customClass: {
                popup: 'rtl-popup',
                title: 'rtl-title',
                content: 'rtl-content'
            }
        });
    }

    /**
     * Show a warning message
     * @param {string} message - The warning message
     * @param {string} title - Optional title (default: 'تحذير')
     */
    static async showWarning(message, title = 'تحذير') {
        return await Swal.fire({
            title: title,
            text: message,
            icon: 'warning',
            confirmButtonText: 'موافق',
            confirmButtonColor: '#ffc107',
            customClass: {
                popup: 'rtl-popup',
                title: 'rtl-title',
                content: 'rtl-content'
            }
        });
    }

    /**
     * Show a confirmation dialog (non-blocking)
     * @param {string} message - The confirmation message
     * @param {string} title - Optional title (default: 'تأكيد')
     * @param {string} confirmText - Text for confirm button (default: 'نعم')
     * @param {string} cancelText - Text for cancel button (default: 'لا')
     * @returns {Promise<boolean>} - true if confirmed, false if cancelled
     */
    static async showConfirm(message, title = 'تأكيد', confirmText = 'نعم', cancelText = 'لا') {
        const result = await Swal.fire({
            title: title,
            text: message,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: cancelText,
            confirmButtonColor: '#0d6efd',
            cancelButtonColor: '#6c757d',
            reverseButtons: true, // Put cancel on the right for Arabic UI
            customClass: {
                popup: 'rtl-popup',
                title: 'rtl-title',
                content: 'rtl-content'
            }
        });
        
        return result.isConfirmed;
    }

    /**
     * Show a deletion confirmation dialog
     * @param {string} itemName - Name of the item being deleted
     * @param {string} itemType - Type of item (e.g., 'المقبوض', 'الكاشير', etc.)
     * @returns {Promise<boolean>} - true if confirmed, false if cancelled
     */
    static async showDeleteConfirm(itemName = '', itemType = 'العنصر') {
        const message = itemName ? 
            `هل أنت متأكد من حذف ${itemType}: ${itemName}؟` : 
            `هل أنت متأكد من حذف هذا ${itemType}؟`;
            
        const result = await Swal.fire({
            title: 'تأكيد الحذف',
            text: message,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'حذف',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            reverseButtons: true,
            customClass: {
                popup: 'rtl-popup',
                title: 'rtl-title',
                content: 'rtl-content'
            }
        });
        
        return result.isConfirmed;
    }

    /**
     * Show a status toggle confirmation dialog
     * @param {string} action - The action being performed ('تفعيل' or 'إلغاء تفعيل')
     * @param {string} itemType - Type of item being toggled
     * @param {string} itemName - Optional name of the item
     * @returns {Promise<boolean>} - true if confirmed, false if cancelled
     */
    static async showToggleConfirm(action, itemType, itemName = '') {
        const message = itemName ? 
            `هل أنت متأكد من ${action} ${itemType}: ${itemName}؟` : 
            `هل أنت متأكد من ${action} هذا ${itemType}؟`;
            
        const result = await Swal.fire({
            title: `تأكيد ${action}`,
            text: message,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: action,
            cancelButtonText: 'إلغاء',
            confirmButtonColor: action === 'تفعيل' ? '#198754' : '#ffc107',
            cancelButtonColor: '#6c757d',
            reverseButtons: true,
            customClass: {
                popup: 'rtl-popup',
                title: 'rtl-title',
                content: 'rtl-content'
            }
        });
        
        return result.isConfirmed;
    }

    /**
     * Show a loading dialog
     * @param {string} message - Loading message
     * @param {string} title - Optional title (default: 'جاري التحميل...')
     */
    static showLoading(message = 'يرجى الانتظار...', title = 'جاري التحميل...') {
        Swal.fire({
            title: title,
            text: message,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            },
            customClass: {
                popup: 'rtl-popup',
                title: 'rtl-title',
                content: 'rtl-content'
            }
        });
    }

    /**
     * Close any open dialog
     */
    static close() {
        Swal.close();
    }

    /**
     * Hide loading dialog (alias for close)
     */
    static hideLoading() {
        Swal.close();
    }

    /**
     * Show a toast notification (small, non-intrusive)
     * @param {string} message - The message to display
     * @param {string} icon - Icon type: 'success', 'error', 'warning', 'info'
     * @param {number} timer - Auto-close timer in milliseconds (default: 3000)
     */
    static showToast(message, icon = 'info', timer = 3000) {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: timer,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            },
            customClass: {
                popup: 'rtl-toast'
            }
        });

        Toast.fire({
            icon: icon,
            title: message
        });
    }

    /**
     * Show a form validation error as a toast
     * @param {string} message - The validation error message
     */
    static showValidationError(message) {
        this.showToast(message, 'error', 4000);
    }

    /**
     * Show a success operation as a toast
     * @param {string} message - The success message
     */
    static showSuccessToast(message) {
        this.showToast(message, 'success', 3000);
    }

    /**
     * Show an error operation as a toast
     * @param {string} message - The error message
     */
    static showErrorToast(message) {
        this.showToast(message, 'error', 4000);
    }

    /**
     * Show an info dialog
     * @param {string} message - The info message
     * @param {string} title - Optional title (default: 'معلومات')
     */
    static async showInfo(message, title = 'معلومات') {
        return await Swal.fire({
            title: title,
            text: message,
            icon: 'info',
            confirmButtonText: 'موافق',
            confirmButtonColor: '#0d6efd',
            customClass: {
                popup: 'rtl-popup',
                title: 'rtl-title',
                content: 'rtl-content'
            }
        });
    }
}

// Make DialogUtils available globally
window.DialogUtils = DialogUtils;
