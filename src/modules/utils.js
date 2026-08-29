/**
 * @file utils.js
 * @description وحدة المساعدة - تحتوي على الدوال المساعدة المشتركة بين جميع الوحدات
 */

const { ipcRenderer } = require('electron');

// ===================================================================
// العمليات على التواريخ والأرقام - التقويم الميلادي فقط
// ===================================================================

/**
 * تنسيق العملة باستخدام الأرقام الإنجليزية
 * @param {number} amount - المبلغ المراد تنسيقه
 * @returns {string} المبلغ منسقاً
 */
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '0.00';

    try {
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount)) return '0.00';

        // تنسيق مع خانتين عشريتين باستخدام الأرقام الإنجليزية
        return numericAmount.toFixed(2);
    } catch (error) {
        console.error('خطأ في تنسيق العملة:', error);
        return '0.00';
    }
}

/**
 * تنسيق التاريخ باستخدام التقويم الميلادي فقط (DD/MM/YYYY)
 * @param {string} dateString - التاريخ المراد تنسيقه
 * @returns {string} التاريخ منسقاً
 */
function formatDate(dateString) {
    if (!dateString) return 'غير محدد';

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'غير محدد';

        // تنسيق كـ DD/MM/YYYY باستخدام الأرقام الإنجليزية
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    } catch (error) {
        console.error('خطأ في تنسيق التاريخ:', error);
        return 'غير محدد';
    }
}

/**
 * تنسيق التاريخ والوقت باستخدام التقويم الميلادي فقط
 * @param {string} dateTimeString - التاريخ والوقت المراد تنسيقه
 * @returns {string} التاريخ والوقت منسقاً
 */
function formatDateTime(dateTimeString) {
    if (!dateTimeString) return 'غير محدد';

    try {
        const date = new Date(dateTimeString);
        if (isNaN(date.getTime())) return 'غير محدد';

        // تنسيق كـ DD/MM/YYYY HH:MM باستخدام الأرقام الإنجليزية
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (error) {
        console.error('خطأ في تنسيق التاريخ والوقت:', error);
        return 'غير محدد';
    }
}

/**
 * تنسيق الأرقام باستخدام الأرقام الإنجليزية فقط
 * @param {number} number - الرقم المراد تنسيقه
 * @returns {string} الرقم منسقاً
 */
function formatNumber(number) {
    if (number === null || number === undefined) return '0';

    try {
        return new Intl.NumberFormat('en-US').format(number);
    } catch (error) {
        console.error('خطأ في تنسيق الرقم:', error);
        return String(number);
    }
}

/**
 * تحويل الأرقام العربية إلى أرقام إنجليزية
 * @param {string} text - النص الذي يحتوي على أرقام عربية
 * @returns {string} النص بعد تحويل الأرقام إلى إنجليزية
 */
function arabicToEnglishNumbers(text) {
    if (!text) return text;

    const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const englishNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    let result = String(text);
    for (let i = 0; i < arabicNumbers.length; i++) {
        result = result.replace(new RegExp(arabicNumbers[i], 'g'), englishNumbers[i]);
    }

    return result;
}

/**
 * الحصول على التاريخ الحالي بتنسيق DD/MM/YYYY باستخدام التقويم الميلادي
 * @returns {string} التاريخ الحالي منسقاً
 */
function getCurrentDate() {
    return formatDate(new Date());
}

/**
 * الحصول على التاريخ والوقت الحالي بتنسيق DD/MM/YYYY HH:MM باستخدام التقويم الميلادي
 * @returns {string} التاريخ والوقت الحالي منسقاً
 */
function getCurrentDateTime() {
    return formatDateTime(new Date());
}

/**
 * تنسيق الأرقام العشرية (النسب المئوية، المتوسطات، إلخ) باستخدام الأرقام الإنجليزية
 * @param {number} value - القيمة المراد تنسيقها
 * @param {number} decimalPlaces - عدد الخانات العشرية
 * @returns {string} القيمة منسقة
 */
function formatDecimal(value, decimalPlaces = 2) {
    if (value === null || value === undefined) return '0.00';

    try {
        const numericValue = parseFloat(value);
        if (isNaN(numericValue)) return '0.00';

        // تنسيق مع العدد المحدد من الخانات العشرية باستخدام الأرقام الإنجليزية
        return numericValue.toFixed(decimalPlaces);
    } catch (error) {
        console.error('خطأ في تنسيق الرقم العشري:', error);
        return '0.00';
    }
}

/**
 * عرض رسالة خطأ في عنصر معين
 * @param {HTMLElement} element - العنصر الذي سيعرض فيه الخطأ
 * @param {string} message - رسالة الخطأ
 */
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
    
    // إخفاء الخطأ بعد 5 ثواني
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

// تصدير جميع الدوال
module.exports = {
    formatCurrency,
    formatDate,
    formatDateTime,
    formatNumber,
    arabicToEnglishNumbers,
    getCurrentDate,
    getCurrentDateTime,
    formatDecimal,
    showError
};