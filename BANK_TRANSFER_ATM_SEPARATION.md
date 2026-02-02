# تحديث: فصل التحويلات البنكية عن أجهزة الصراف + جعل حقل اسم البنك للقراءة فقط

## التاريخ: 2026-02-02

## الهدف من التحديث
1. عدم ربط التحويلات البنكية بأي جهاز من أجهزة الصراف الآلي (ATM)
2. جعل حقل "اسم البنك" للقراءة فقط ويظهر تلقائياً من بيانات الماكينة
3. إخفاء حقلي "الصراف" و"اسم البنك" عند اختيار "تحويل بنكي"

## التعديلات التي تمت

### 1. ملف: `src/web-dashboard/request-reconciliation.html`

#### التعديل الأول: إضافة ID لحاوية حقل الصراف
```html
<div class="col-md-6" id="atmFieldContainer">
```
- إضافة معرّف للعنصر للتحكم في إخفائه/إظهاره

#### التعديل الثاني: جعل حقل اسم البنك للقراءة فقط
```html
<div class="col-md-5" id="bankNameFieldContainer">
    <label class="text-secondary small mb-1">اسم البنك</label>
    <input type="text" id="input_bank_name_v2" class="form-control custom-input"
        placeholder="اسم البنك" readonly style="background-color: #2d3748; cursor: not-allowed;">
</div>
```
**الغرض:**
- جعل الحقل للقراءة فقط (readonly)
- إضافة ID للحاوية للتحكم في الإخفاء/الإظهار
- تغيير تنسيق الحقل ليظهر أنه غير قابل للتعديل

#### التعديل الثالث: منطق إخفاء/إظهار الحقول
```javascript
// Handle ATM field visibility based on payment type
const bankOpTypeSelect = document.getElementById('bankOpType');
const atmFieldContainer = document.getElementById('atmFieldContainer');
const bankNameFieldContainer = document.getElementById('bankNameFieldContainer');
const atmSelect = document.getElementById('bankAtmName');
const bankNameInput = document.getElementById('input_bank_name_v2');

if (bankOpTypeSelect && atmFieldContainer && bankNameFieldContainer) {
    bankOpTypeSelect.addEventListener('change', function () {
        const selectedType = this.value;
        if (selectedType === 'transfer') {
            // Hide ATM and Bank Name fields for bank transfers
            atmFieldContainer.style.display = 'none';
            bankNameFieldContainer.style.display = 'none';
            atmSelect.value = ''; // Clear selection
            bankNameInput.value = ''; // Clear bank name
        } else {
            // Show ATM and Bank Name fields for card payments
            atmFieldContainer.style.display = 'block';
            bankNameFieldContainer.style.display = 'block';
        }
    });
    
    // Initialize visibility on page load
    if (bankOpTypeSelect.value === 'transfer') {
        atmFieldContainer.style.display = 'none';
        bankNameFieldContainer.style.display = 'none';
    }
}
```
**الغرض:**
- إخفاء حقلي "الصراف" و"اسم البنك" معاً عند اختيار "تحويل بنكي"
- إظهارهما معاً عند اختيار طرق الدفع الأخرى
- مسح القيم عند الإخفاء

#### ملاحظة: التعبئة التلقائية لاسم البنك
الكود الموجود يقوم تلقائياً بتعبئة حقل "اسم البنك" عند اختيار ماكينة:
```javascript
select.addEventListener('change', function () {
    const selectedName = this.value;
    const atm = atmsData.find(a => a.name === selectedName);
    if (atm && atm.bank_name) {
        const input = document.getElementById('input_bank_name_v2');
        if (input) input.value = atm.bank_name;
    }
});
```

### 2. ملف: `src/app.js`

#### تحديث دالة addDetailedBankReceipt
```javascript
addDetailedBankReceipt: async (atmName, bankName, amount, operationType) => {
    if (!currentReconciliation || !currentReconciliation.id) return;
    try {
        // SKIP ATM lookup if this is a bank transfer
        let atmId = null;
        const isTransfer = atmName === 'تحويل بنكي' || operationType === 'تحويل بنكي (Bank Transfer)';
        
        if (atmName && !isTransfer) {
            // البحث عن ATM فقط للعمليات غير التحويلات البنكية
            try {
                const atm = await ipcRenderer.invoke('db-get',
                    'SELECT id FROM atms WHERE name LIKE ? OR name LIKE ?',
                    [atmName, `%${atmName}%`]
                );
                if (atm) atmId = atm.id;
            } catch (e) {
                console.warn('⚠️ Could not resolve ATM ID for name:', atmName);
            }
        } else if (isTransfer) {
            console.log('📝 [BANK] تحويل بنكي - لا يتطلب ربط بجهاز ATM');
        }

        // حفظ في قاعدة البيانات (atmId سيكون NULL للتحويلات)
        const result = await ipcRenderer.invoke('db-run',
            'INSERT INTO bank_receipts (reconciliation_id, operation_type, amount, atm_id) VALUES (?, ?, ?, ?)',
            [currentReconciliation.id, operationType || 'settlement', parseFloat(amount), atmId]
        );

        bankReceipts.push({
            id: result.lastInsertRowid,
            reconciliation_id: currentReconciliation.id,
            operation_type: operationType || 'settlement',
            atm_name: atmName || (atmId ? 'جهاز مسجل' : 'غير محدد'),
            bank_name: bankName,
            amount: parseFloat(amount),
            atm_id: atmId // NULL for transfers
        });
        updateBankReceiptsTable();
        updateSummary();
    } catch (error) {
        console.error('❌ Error saving bank receipt:', error);
    }
}
```
**الغرض:**
- تخطي البحث عن ATM للتحويلات البنكية
- حفظ `atm_id = NULL` للتحويلات البنكية
- البحث عن ATM والربط به للعمليات الأخرى

## النتيجة النهائية

### 📱 عند اختيار "تحويل بنكي":
- ✅ يختفي حقل "جهاز الصراف / الماكينة"
- ✅ يختفي حقل "اسم البنك"
- ✅ لا يتم ربط التحويل بأي جهاز
- ✅ يحفظ في قاعدة البيانات مع `atm_id = NULL`

### 💳 عند اختيار طرق الدفع الأخرى (مدى، فيزا، ماستركارد، أمريكان إكسبريس):
- ✅ يظهر حقل "جهاز الصراف / الماكينة"
- ✅ يظهر حقل "اسم البنك" (للقراءة فقط)
- ✅ يتم تعبئة "اسم البنك" تلقائياً عند اختيار الماكينة
- ✅ يتم ربط العملية بالجهاز المحدد
- ✅ يحفظ في قاعدة البيانات مع `atm_id` الخاص بالجهاز

## ✨ المميزات
- حقل "اسم البنك" للقراءة فقط ويتعبأ تلقائياً من بيانات الماكينة
- التحويلات البنكية مستقلة تماماً عن إدارة أجهزة الصراف
- واجهة مستخدم نظيفة تخفي الحقول غير الضرورية
- يمكن تتبع التحويلات البنكية منفصلة عن عمليات البطاقات في التقارير

## 📝 ملاحظات
- جميع التعديلات متوافقة مع الكود الحالي
- لا تؤثر على الوظائف الأخرى
- تحسين تجربة المستخدم بإخفاء الحقول غير الضرورية
