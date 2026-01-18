/**
 * نظام النص التنبؤي (Autocomplete) للتطبيق
 * يوفر اقتراحات ذكية بناءً على البيانات المدخلة مسبقاً
 * 
 * @author محمد أمين الكامل
 * @version 1.0.0
 */

class AutocompleteSystem {
    constructor() {
        this.instances = new Map(); // تخزين instances للحقول المختلفة
        this.cache = new Map(); // تخزين مؤقت للاقتراحات
        this.debounceTimers = new Map(); // مؤقتات للتأخير
        this.activeDropdown = null; // القائمة المنسدلة النشطة حالياً
        
        console.log('🔮 [AUTOCOMPLETE] تم تهيئة نظام النص التنبؤي');
        
        // إضافة CSS للنظام
        this.injectCSS();
        
        // إضافة event listeners عامة
        this.setupGlobalListeners();
    }
    
    /**
     * إضافة CSS للنص التنبؤي
     */
    injectCSS() {
        const cssId = 'autocomplete-styles';
        if (document.getElementById(cssId)) return; // تجنب الإضافة المكررة
        
        const css = `
            .autocomplete-container {
                position: relative;
                display: inline-block;
                width: 100%;
            }
            
            .autocomplete-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: white;
                border: 1px solid #ddd;
                border-top: none;
                border-radius: 0 0 4px 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                max-height: 200px;
                overflow-y: auto;
                z-index: 1000;
                display: none;
            }
            
            .autocomplete-dropdown.show {
                display: block;
            }
            
            .autocomplete-item {
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #f0f0f0;
                transition: background-color 0.2s;
                font-size: 14px;
                color: #333;
            }
            
            .autocomplete-item:last-child {
                border-bottom: none;
            }
            
            .autocomplete-item:hover,
            .autocomplete-item.highlighted {
                background-color: #f8f9fa;
                color: #007bff;
            }
            
            .autocomplete-item.selected {
                background-color: #007bff;
                color: white;
            }
            
            .autocomplete-no-results {
                padding: 8px 12px;
                color: #666;
                font-style: italic;
                text-align: center;
            }
            
            .autocomplete-loading {
                padding: 8px 12px;
                color: #666;
                text-align: center;
            }
            
            .autocomplete-loading::after {
                content: "...";
                animation: dots 1.5s steps(4, end) infinite;
            }
            
            @keyframes dots {
                0%, 20% { content: "."; }
                40% { content: ".."; }
                60% { content: "..."; }
                80%, 100% { content: ""; }
            }
            
            /* تحسينات للغة العربية */
            .autocomplete-dropdown {
                direction: rtl;
                text-align: right;
            }
            
            .autocomplete-item {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
        `;
        
        const style = document.createElement('style');
        style.id = cssId;
        style.textContent = css;
        document.head.appendChild(style);
        
        console.log('🎨 [AUTOCOMPLETE] تم إضافة CSS للنص التنبؤي');
    }
    
    /**
     * إعداد event listeners عامة
     */
    setupGlobalListeners() {
        // إغلاق القوائم المنسدلة عند النقر خارجها
        document.addEventListener('click', (event) => {
            if (this.activeDropdown && !this.activeDropdown.contains(event.target)) {
                this.hideDropdown();
            }
        });
        
        // إغلاق القوائم عند الضغط على Escape
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.activeDropdown) {
                this.hideDropdown();
            }
        });
    }
    
    /**
     * تهيئة النص التنبؤي لحقل معين
     * @param {string} inputId - معرف حقل الإدخال
     * @param {Object} options - خيارات التكوين
     */
    initialize(inputId, options = {}) {
        const input = document.getElementById(inputId);
        if (!input) {
            console.error(`❌ [AUTOCOMPLETE] لم يتم العثور على الحقل: ${inputId}`);
            return;
        }
        
        const config = {
            minLength: 1, // الحد الأدنى لعدد الأحرف
            debounceDelay: 300, // تأخير البحث (مللي ثانية)
            maxResults: 10, // الحد الأقصى للنتائج
            dataSource: null, // مصدر البيانات (دالة)
            onSelect: null, // دالة عند الاختيار
            placeholder: 'ابدأ الكتابة للحصول على اقتراحات...', // نص توضيحي
            ...options
        };
        
        // إنشاء container للنص التنبؤي
        this.createContainer(input, config);
        
        // حفظ الإعدادات
        this.instances.set(inputId, {
            input,
            config,
            dropdown: null,
            selectedIndex: -1
        });
        
        // إضافة event listeners للحقل
        this.setupInputListeners(inputId);
        
        console.log(`✅ [AUTOCOMPLETE] تم تهيئة النص التنبؤي للحقل: ${inputId}`);
    }
    
    /**
     * إنشاء container للنص التنبؤي
     */
    createContainer(input, config) {
        // التحقق من وجود container مسبقاً
        if (input.parentElement.classList.contains('autocomplete-container')) {
            return;
        }
        
        // إنشاء wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'autocomplete-container';
        
        // نقل الحقل داخل الـ wrapper
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        
        // إنشاء القائمة المنسدلة
        const dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        wrapper.appendChild(dropdown);
        
        // تحديث placeholder
        if (config.placeholder && !input.placeholder) {
            input.placeholder = config.placeholder;
        }
    }
    
    /**
     * إعداد event listeners للحقل
     */
    setupInputListeners(inputId) {
        const instance = this.instances.get(inputId);
        if (!instance) return;
        
        const { input } = instance;
        
        // البحث عند الكتابة
        input.addEventListener('input', (event) => {
            this.handleInput(inputId, event.target.value);
        });
        
        // التنقل بالكيبورد
        input.addEventListener('keydown', (event) => {
            this.handleKeydown(inputId, event);
        });
        
        // إظهار القائمة عند التركيز
        input.addEventListener('focus', () => {
            if (input.value.length >= instance.config.minLength) {
                this.handleInput(inputId, input.value);
            }
        });
    }
    
    /**
     * معالجة إدخال النص
     */
    handleInput(inputId, value) {
        const instance = this.instances.get(inputId);
        if (!instance) return;
        
        const { config } = instance;
        
        // إلغاء المؤقت السابق
        if (this.debounceTimers.has(inputId)) {
            clearTimeout(this.debounceTimers.get(inputId));
        }
        
        // إخفاء القائمة إذا كان النص قصيراً
        if (value.length < config.minLength) {
            this.hideDropdown();
            return;
        }
        
        // تأخير البحث
        const timer = setTimeout(() => {
            this.search(inputId, value);
        }, config.debounceDelay);
        
        this.debounceTimers.set(inputId, timer);
    }
    
    /**
     * البحث عن الاقتراحات
     */
    async search(inputId, query) {
        const instance = this.instances.get(inputId);
        if (!instance) return;
        
        const { config } = instance;
        
        try {
            // إظهار مؤشر التحميل
            this.showLoading(inputId);
            
            // البحث في الكاش أولاً
            const cacheKey = `${inputId}:${query.toLowerCase()}`;
            if (this.cache.has(cacheKey)) {
                const cachedResults = this.cache.get(cacheKey);
                this.showResults(inputId, cachedResults, query);
                return;
            }
            
            // جلب البيانات من المصدر
            if (config.dataSource && typeof config.dataSource === 'function') {
                const results = await config.dataSource(query);
                
                // حفظ في الكاش
                this.cache.set(cacheKey, results);
                
                // عرض النتائج
                this.showResults(inputId, results, query);
            }
            
        } catch (error) {
            console.error(`❌ [AUTOCOMPLETE] خطأ في البحث للحقل ${inputId}:`, error);
            this.showError(inputId, 'حدث خطأ أثناء البحث');
        }
    }
    
    /**
     * عرض مؤشر التحميل
     */
    showLoading(inputId) {
        const dropdown = this.getDropdown(inputId);
        if (!dropdown) return;
        
        dropdown.innerHTML = '<div class="autocomplete-loading">جاري البحث</div>';
        dropdown.classList.add('show');
        this.activeDropdown = dropdown;
    }
    
    /**
     * عرض النتائج
     */
    showResults(inputId, results, query) {
        const dropdown = this.getDropdown(inputId);
        const instance = this.instances.get(inputId);
        if (!dropdown || !instance) return;
        
        // إعادة تعيين الفهرس المحدد
        instance.selectedIndex = -1;
        
        if (!results || results.length === 0) {
            dropdown.innerHTML = '<div class="autocomplete-no-results">لا توجد نتائج</div>';
        } else {
            // تحديد عدد النتائج
            const maxResults = instance.config.maxResults;
            const limitedResults = results.slice(0, maxResults);
            
            // إنشاء عناصر النتائج
            dropdown.innerHTML = limitedResults.map((result, index) => {
                const highlightedText = this.highlightMatch(result, query);
                return `<div class="autocomplete-item" data-index="${index}" data-value="${result}">${highlightedText}</div>`;
            }).join('');
            
            // إضافة event listeners للعناصر
            dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.selectItem(inputId, item.dataset.value);
                });
            });
        }
        
        dropdown.classList.add('show');
        this.activeDropdown = dropdown;
    }
    
    /**
     * تمييز النص المطابق
     */
    highlightMatch(text, query) {
        if (!query) return text;
        
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }
    
    /**
     * عرض رسالة خطأ
     */
    showError(inputId, message) {
        const dropdown = this.getDropdown(inputId);
        if (!dropdown) return;
        
        dropdown.innerHTML = `<div class="autocomplete-no-results">${message}</div>`;
        dropdown.classList.add('show');
        this.activeDropdown = dropdown;
    }
    
    /**
     * الحصول على القائمة المنسدلة
     */
    getDropdown(inputId) {
        const instance = this.instances.get(inputId);
        if (!instance) return null;
        
        return instance.input.parentElement.querySelector('.autocomplete-dropdown');
    }
    
    /**
     * إخفاء القائمة المنسدلة
     */
    hideDropdown() {
        if (this.activeDropdown) {
            this.activeDropdown.classList.remove('show');
            this.activeDropdown = null;
        }
    }
    
    /**
     * معالجة ضغطات الكيبورد
     */
    handleKeydown(inputId, event) {
        const instance = this.instances.get(inputId);
        const dropdown = this.getDropdown(inputId);
        
        if (!instance || !dropdown || !dropdown.classList.contains('show')) {
            return;
        }
        
        const items = dropdown.querySelectorAll('.autocomplete-item');
        if (items.length === 0) return;
        
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                instance.selectedIndex = Math.min(instance.selectedIndex + 1, items.length - 1);
                this.updateSelection(inputId);
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                instance.selectedIndex = Math.max(instance.selectedIndex - 1, -1);
                this.updateSelection(inputId);
                break;
                
            case 'Enter':
                event.preventDefault();
                if (instance.selectedIndex >= 0) {
                    const selectedItem = items[instance.selectedIndex];
                    this.selectItem(inputId, selectedItem.dataset.value);
                }
                break;
                
            case 'Tab':
                this.hideDropdown();
                break;
        }
    }
    
    /**
     * تحديث التحديد المرئي
     */
    updateSelection(inputId) {
        const instance = this.instances.get(inputId);
        const dropdown = this.getDropdown(inputId);
        
        if (!instance || !dropdown) return;
        
        const items = dropdown.querySelectorAll('.autocomplete-item');
        
        // إزالة التحديد السابق
        items.forEach(item => item.classList.remove('selected'));
        
        // إضافة التحديد الجديد
        if (instance.selectedIndex >= 0 && instance.selectedIndex < items.length) {
            items[instance.selectedIndex].classList.add('selected');
        }
    }
    
    /**
     * اختيار عنصر
     */
    selectItem(inputId, value) {
        const instance = this.instances.get(inputId);
        if (!instance) return;
        
        // تعيين القيمة
        instance.input.value = value;
        
        // إخفاء القائمة
        this.hideDropdown();
        
        // استدعاء دالة الاختيار إن وجدت
        if (instance.config.onSelect) {
            instance.config.onSelect(value, instance.input);
        }
        
        // إطلاق حدث التغيير
        instance.input.dispatchEvent(new Event('change', { bubbles: true }));
        
        console.log(`✅ [AUTOCOMPLETE] تم اختيار: ${value} للحقل: ${inputId}`);
    }
    
    /**
     * تنظيف الكاش
     */
    clearCache() {
        this.cache.clear();
        console.log('🧹 [AUTOCOMPLETE] تم تنظيف الكاش');
    }
    
    /**
     * إزالة النص التنبؤي من حقل
     */
    destroy(inputId) {
        if (this.instances.has(inputId)) {
            this.instances.delete(inputId);
            this.cache.forEach((value, key) => {
                if (key.startsWith(`${inputId}:`)) {
                    this.cache.delete(key);
                }
            });
            console.log(`🗑️ [AUTOCOMPLETE] تم إزالة النص التنبؤي من الحقل: ${inputId}`);
        }
    }
}

// إنشاء instance عام للنظام
const autocompleteSystem = new AutocompleteSystem();

// تصدير للاستخدام العام
if (typeof window !== 'undefined') {
    window.AutocompleteSystem = AutocompleteSystem;
    window.autocompleteSystem = autocompleteSystem;
}
