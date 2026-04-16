/**
 * @file keyboard-shortcuts.js
 * @description نظام اختصارات لوحة المفاتيح - Keyboard Shortcuts System
 * @copyright © 2025 محمد أمين الكامل - جميع الحقوق محفوظة
 */

/**
 * فئة إدارة اختصارات لوحة المفاتيح
 * تدعم اختصارات متعددة المفاتيح مع تجاهل الإدخال في حقول النصوص
 */
class KeyboardShortcuts {
    constructor() {
        /** @type {Map<string, Object>} - خريطة الاختصارات المسجلة */
        this.shortcuts = new Map();

        /** @type {boolean} - حالة تفعيل الاختصارات */
        this.isEnabled = true;

        /** @type {boolean} - وضع التصحيح */
        this.debugMode = false;

        this.init();
    }

    /**
     * تهيئة نظام الاختصارات
     */
    init() {
        document.addEventListener('keydown', (e) => {
            if (!this.isEnabled) return;
            this.handleKeyDown(e);
        });

        console.log('⌨️ [KEYBOARD] تم تفعيل نظام الاختصارات');
    }

    /**
     * التحقق إذا كان العنصر حقل إدخال نصي
     * @param {HTMLElement} element - العنصر المراد فحصه
     * @returns {boolean} - صحيح إذا كان حقل إدخال
     */
    isInputElement(element, eventKey = '') {
        if (!element) {
            return false;
        }

        const inputTypes = ['INPUT', 'TEXTAREA', 'SELECT'];
        const isInput = inputTypes.includes((element.tagName || '').toUpperCase()) ||
            element.isContentEditable;

        // السماح بـ Escape دائماً حتى في حقول الإدخال
        if (isInput && eventKey === 'Escape') {
            return false;
        }

        return isInput;
    }

    /**
     * تسجيل اختصار جديد
     * @param {string} keyCombo - تركيبة المفاتيح (مثال: "ctrl+s")
     * @param {Function} callback - الدالة المطلوب تنفيذها
     * @param {string} description - وصف الاختصار
     * @param {Object} options - خيارات إضافية
     */
    register(keyCombo, callback, description = '', options = {}) {
        if (typeof keyCombo !== 'string' || !keyCombo.trim()) {
            return;
        }

        const normalizedCombo = keyCombo.toLowerCase().replace(/\s/g, '');

        this.shortcuts.set(normalizedCombo, {
            callback,
            description,
            allowInInputs: options.allowInInputs || false,
            priority: options.priority || 0
        });

        if (this.debugMode) {
            console.log(`⌨️ [KEYBOARD] تسجيل اختصار: ${normalizedCombo} - ${description}`);
        }
    }

    /**
     * إلغاء تسجيل اختصار
     * @param {string} keyCombo - تركيبة المفاتيح
     */
    unregister(keyCombo) {
        if (typeof keyCombo !== 'string' || !keyCombo.trim()) {
            return;
        }

        const normalizedCombo = keyCombo.toLowerCase().replace(/\s/g, '');
        this.shortcuts.delete(normalizedCombo);

        if (this.debugMode) {
            console.log(`⌨️ [KEYBOARD] إلغاء تسجيل: ${normalizedCombo}`);
        }
    }

    /**
     * معالجة حدث ضغطة المفتاح
     * @param {KeyboardEvent} e - حدث لوحة المفاتيح
     */
    handleKeyDown(e) {
        const keyCombo = this.buildKeyCombo(e);
        if (!keyCombo) return;

        const shortcut = this.shortcuts.get(keyCombo);

        if (!shortcut) return;

        // التحقق من السماح في حقول الإدخال
        if (!shortcut.allowInInputs && this.isInputElement(e?.target, e?.key || '')) {
            return;
        }

        // منع السلوك الافتراضي
        e.preventDefault();

        if (this.debugMode) {
            console.log(`⌨️ [KEYBOARD] تنفيذ: ${keyCombo}`);
        }

        try {
            shortcut.callback(e);
        } catch (error) {
            console.error(`❌ [KEYBOARD] خطأ في تنفيذ الاختصار ${keyCombo}:`, error);
        }
    }

    /**
     * بناء تركيبة المفاتيح من حدث لوحة المفاتيح
     * @param {KeyboardEvent} e - حدث لوحة المفاتيح
     * @returns {string} - تركيبة المفاتيح
     */
    buildKeyCombo(e) {
        if (!e || typeof e !== 'object') {
            return '';
        }

        const parts = [];

        if (e.ctrlKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        if (e.metaKey) parts.push('meta');

        // معالجة المفاتيح الخاصة
        const keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            ' ': 'space',
            'Enter': 'enter',
            'Escape': 'escape',
            'Tab': 'tab',
            'Backspace': 'backspace',
            'Delete': 'delete',
            'Home': 'home',
            'End': 'end',
            'PageUp': 'pageup',
            'PageDown': 'pagedown',
            'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4',
            'F5': 'f5', 'F6': 'f6', 'F7': 'f7', 'F8': 'f8',
            'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12'
        };

        const rawKey = typeof e.key === 'string' ? e.key : '';
        if (rawKey) {
            const key = keyMap[rawKey] || String(rawKey).toLowerCase();
            parts.push(key);
        }

        return parts.join('+');
    }

    /**
     * تفعيل/تعطيل جميع الاختصارات
     * @param {boolean} enabled - حالة التفعيل
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`⌨️ [KEYBOARD] النظام ${enabled ? 'مفعل' : 'معطل'}`);
    }

    /**
     * تفعيل/تعطيل وضع التصحيح
     * @param {boolean} enabled - حالة التفعيل
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    /**
     * عرض نافذة مساعدة الاختصارات
     */
    showHelp() {
        const shortcutsList = Array.from(this.shortcuts.entries())
            .sort((a, b) => (b[1].priority || 0) - (a[1].priority || 0))
            .map(([key, data]) => {
                const displayKey = this.formatKeyForDisplay(key);
                return `<div class="shortcut-item">
                    <kbd class="shortcut-key">${displayKey}</kbd>
                    <span class="shortcut-desc">${data.description}</span>
                </div>`;
            })
            .join('');

        const html = `
            <div class="keyboard-help" style="
                text-align: right;
                direction: rtl;
                max-height: 400px;
                overflow-y: auto;
                padding: 10px;
            ">
                <style>
                    .keyboard-help .shortcut-item {
                        display: flex;
                        align-items: center;
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(128, 128, 128, 0.3);
                    }
                    .keyboard-help .shortcut-item:last-child {
                        border-bottom: none;
                    }
                    .keyboard-help .shortcut-key {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        border-radius: 6px;
                        padding: 6px 12px;
                        font-family: 'Courier New', monospace;
                        font-size: 0.95em;
                        font-weight: bold;
                        margin-left: 15px;
                        min-width: 100px;
                        text-align: center;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    }
                    .keyboard-help .shortcut-desc {
                        flex: 1;
                        color: inherit;
                        font-size: 1em;
                        font-weight: 500;
                    }
                </style>
                ${shortcutsList}
            </div>
        `;

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: '⌨️ اختصارات لوحة المفاتيح',
                html: html,
                icon: 'info',
                confirmButtonText: 'حسناً',
                confirmButtonColor: '#0d6efd',
                width: '500px'
            });
        } else {
            alert('اختصارات لوحة المفاتيح:\n\n' +
                Array.from(this.shortcuts.entries())
                    .map(([key, data]) => `${key}: ${data.description}`)
                    .join('\n')
            );
        }
    }

    /**
     * تنسيق مفتاح للعرض
     * @param {string} keyCombo - تركيبة المفاتيح
     * @returns {string} - النص المنسق
     */
    formatKeyForDisplay(keyCombo) {
        const keyMap = {
            'ctrl': 'Ctrl',
            'alt': 'Alt',
            'shift': 'Shift',
            'meta': '⌘',
            'escape': 'Esc',
            'enter': '↵',
            'backspace': '⌫',
            'delete': 'Del',
            'space': 'Space',
            'up': '↑',
            'down': '↓',
            'left': '←',
            'right': '→'
        };

        return keyCombo
            .split('+')
            .map(key => keyMap[key] || key.toUpperCase())
            .join(' + ');
    }

    /**
     * الحصول على قائمة جميع الاختصارات
     * @returns {Array} - قائمة الاختصارات
     */
    getAllShortcuts() {
        return Array.from(this.shortcuts.entries()).map(([key, data]) => ({
            key,
            description: data.description,
            allowInInputs: data.allowInInputs
        }));
    }

    /**
     * تصدير الاختصارات كـ JSON
     * @returns {string} - JSON string
     */
    exportShortcuts() {
        return JSON.stringify(this.getAllShortcuts(), null, 2);
    }
}

// إنشاء نسخة عامة
const keyboardShortcuts = new KeyboardShortcuts();

// تصدير للاستخدام في الوحدات الأخرى
if (typeof module !== 'undefined' && module.exports) {
    module.exports = keyboardShortcuts;
}

// تصدير للمتصفح
if (typeof window !== 'undefined') {
    window.keyboardShortcuts = keyboardShortcuts;
}
