/**
 * @file form-navigation.js
 * @description نظام التنقل بين حقول الإدخال باستخدام مفتاح Enter
 * @copyright © 2025 محمد أمين الكامل - جميع الحقوق محفوظة
 */

/**
 * فئة إدارة التنقل في النماذج
 */
class FormNavigation {
    constructor() {
        /** @type {string} - selectors للنماذج التي نريد إدارتها */
        this.formSelectors = [
            '#bankReceiptForm',
            '#cashReceiptForm',
            '#postpaidSaleForm',
            '#customerReceiptForm',
            '#returnInvoiceForm',
            '#supplierForm',
            '#newReconciliationForm',
            '#editReconciliationForm'
        ];

        this.init();
    }

    /**
     * تهيئة نظام التنقل
     */
    init() {
        this.setupEnterKeyNavigation();
        console.log('🧭 [FORM-NAV] تم تفعيل نظام التنقل بين الحقول');
    }

    /**
     * إعداد التنقل بمفتاح Enter
     */
    setupEnterKeyNavigation() {
        document.addEventListener('keydown', (e) => {
            // التحقق من أن المفتاح هو Enter
            if (e.key !== 'Enter') return;

            // تجاهل إذا كان المستخدم يضغط على Ctrl أو Alt أو Shift
            if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;

            const activeElement = document.activeElement;
            if (!activeElement) return;

            // التحقق إذا كان العنصر في نموذج مدار
            const form = this.findManagedForm(activeElement);
            if (!form) return;

            // التحقق إذا كان الزر النشط هو زر "إضافة"
            if (this.isAddButton(activeElement)) {
                // السماح للزر بتنفيذ عمله الطبيعي
                return;
            }

            // منع السلوك الافتراضي (إرسال النموذج)
            e.preventDefault();

            // الانتقال للحقل التالي
            this.moveToNextField(form, activeElement);
        });
    }

    /**
     * البحث عن النموذج المدار
     * @param {HTMLElement} element - العنصر الحالي
     * @returns {HTMLElement|null} - النموذج أو null
     */
    findManagedForm(element) {
        let current = element;
        while (current && current !== document.body) {
            const selector = this.formSelectors.find(sel =>
                current.matches && current.matches(sel)
            );
            if (selector) return current;
            current = current.parentElement;
        }
        return null;
    }

    /**
     * التحقق إذا كان العنصر زر إضافة
     * @param {HTMLElement} element - العنصر المراد فحصه
     * @returns {boolean} - صحيح إذا كان زر إضافة
     */
    isAddButton(element) {
        if (element.tagName !== 'BUTTON') return false;

        const addKeywords = ['إضافة', 'add', 'حفظ', 'save', '+', 'أضف'];
        const buttonText = (element.textContent || element.innerText || '').toLowerCase();

        return addKeywords.some(keyword =>
            buttonText.includes(keyword.toLowerCase())
        );
    }

    /**
     * الانتقال للحقل التالي
     * @param {HTMLElement} form - النموذج الحالي
     * @param {HTMLElement} currentField - الحقل الحالي
     */
    moveToNextField(form, currentField) {
        // جمع جميع حقول الإدخال القابلة للتركيز
        const focusableElements = this.getFocusableElements(form);

        if (focusableElements.length === 0) return;

        // إيجاد index الحقل الحالي
        const currentIndex = focusableElements.indexOf(currentField);

        if (currentIndex === -1) return;

        // إيجاد الحقل التالي
        let nextIndex = currentIndex + 1;

        // إذا كان الحقل الحالي هو قبل الأخير (زر الإضافة)، نعود للأول
        if (nextIndex >= focusableElements.length) {
            nextIndex = 0;
        }

        // الانتقال للحقل التالي
        const nextField = focusableElements[nextIndex];
        if (nextField) {
            nextField.focus();

            // تحديد النص إذا كان input نصي
            if (nextField.tagName === 'INPUT' &&
                ['text', 'number', 'email'].includes(nextField.type)) {
                nextField.select();
            }

            console.log('🧭 [FORM-NAV] انتقال للحقل:', nextField.id || nextField.name);
        }
    }

    /**
     * جمع العناصر القابلة للتركيز في النموذج
     * @param {HTMLElement} form - النموذج
     * @returns {Array<HTMLElement>} - قائمة العناصر
     */
    getFocusableElements(form) {
        const selectors = [
            'input:not([type="hidden"]):not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            'button:not([disabled])'
        ];

        const elements = Array.from(form.querySelectorAll(selectors.join(',')));

        // تصفية العناصر المرئية فقط
        return elements.filter(el => {
            const style = window.getComputedStyle(el);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
            const isTabEnabled = !el.hasAttribute('tabindex') || el.getAttribute('tabindex') !== '-1';
            return isVisible && isTabEnabled;
        });
    }

    /**
     * إعادة تعيين التركيز للحقل الأول في النموذج
     * @param {HTMLElement|string} form - النموذج أو selector
     */
    focusFirstField(form) {
        if (typeof form === 'string') {
            form = document.querySelector(form);
        }

        if (!form) {
            console.warn('🧭 [FORM-NAV] النموذج غير موجود');
            return;
        }

        const focusableElements = this.getFocusableElements(form);

        if (focusableElements.length > 0) {
            const firstField = focusableElements[0];

            // تأخير بسيط للتأكد من اكتمال أي تحديثات DOM
            setTimeout(() => {
                firstField.focus();

                // تحديد النص إذا كان input
                if (firstField.tagName === 'INPUT') {
                    firstField.select();
                }

                console.log('🧭 [FORM-NAV] التركيز على الحقل الأول:', firstField.id || firstField.name);
            }, 50);
        }
    }

    /**
     * إعادة تعيين النموذج وإرجاع التركيز للحقل الأول
     * @param {HTMLElement|string} form - النموذج أو selector
     */
    resetFormAndFocusFirst(form) {
        if (typeof form === 'string') {
            form = document.querySelector(form);
        }

        if (!form) return;

        // إعادة تعيين النموذج
        form.reset();

        // إرجاع التركيز للحقل الأول
        this.focusFirstField(form);

        console.log('🧭 [FORM-NAV] إعادة تعيين النموذج ونقل التركيز للحقل الأول');
    }

    /**
     * التسجيل اليدوي لنموذج
     * @param {string} selector - selector للنموذج
     */
    registerForm(selector) {
        if (!this.formSelectors.includes(selector)) {
            this.formSelectors.push(selector);
        }
    }
}

// إنشاء نسخة عامة
const formNavigation = new FormNavigation();

// تصدير للاستخدام
if (typeof module !== 'undefined' && module.exports) {
    module.exports = formNavigation;
}

if (typeof window !== 'undefined') {
    window.formNavigation = formNavigation;
}
