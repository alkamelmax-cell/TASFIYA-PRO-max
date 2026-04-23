# 📝 سجل التغييرات - Changelog
# تصفية برو - Tasfiya Pro

جميع التغييرات المهمة في هذا المشروع سيتم توثيقها في هذا الملف.

---

## [5.0.1] - 2026-04-01

### 🔧 Changed
- رفع رقم إصدار التطبيق إلى **5.0.1** بعد إصلاحات الاستقرار والتنقل وطلبات التصفية.
- جعل سكريبت البناء يقرأ رقم الإصدار مباشرةً من `package.json` لتقليل الأخطاء اليدوية مستقبلًا.

---

## [5.0.0] - 2026-02-26

### 🔧 Changed
- ترقية رقم إصدار التطبيق إلى **5.0.0** (تطبيق سطح المكتب + التوثيق وخطط البناء).

---

## [4.0.1] - 2026-02-02

### ✨ إضافات (Added)

#### 🏦 فصل التحويلات البنكية عن أجهزة ATM
- حقل "اسم البنك" أصبح للقراءة فقط (readonly)
- التعبئة التلقائية لاسم البنك من بيانات الماكينة المختارة
- إخفاء ديناميكي لحقول "الصراف" و"اسم البنك" عند اختيار "تحويل بنكي"
- حفظ التحويلات البنكية مع `atm_id = NULL` في قاعدة البيانات

#### 🔄 أداة إعادة ضبط تسلسل طلبات التصفية
- سكريبت `reset-sequence-api.js` لإعادة ضبط الترقيم
- API endpoint جديد: `POST /api/reconciliation-requests/reset-sequence`
- دعم SQLite و PostgreSQL
- ملف توثيقي شامل: `RESET_SEQUENCE_README.md`

### 🐛 إصلاحات (Fixed)
- إصلاح استعلام `prepareReconciliationDataById` لاستخدام `LEFT JOIN` بدلاً من `JOIN`
- حل مشكلة عدم ظهور التحويلات البنكية في التقارير المطبوعة
- منع ربط التحويلات البنكية بأجهزة ATM في الطباعة

### 📚 توثيق (Documentation)
- إضافة `BANK_TRANSFER_ATM_SEPARATION.md` - توثيق شامل لميزة فصل التحويلات
- إضافة `RESET_SEQUENCE_README.md` - دليل استخدام أداة إعادة الضبط
- إضافة `BUILD_PLAN.md` - خطة بناء احترافية
- تحديث `README.md` للإصدار 4.0.1
- توضيح أن بيانات الدخول الافتراضية (`admin/admin123`) مخصصة للتطوير فقط
- توثيق آلية تهيئة مدير النظام في الإنتاج عبر متغيرات البيئة (`INITIAL_ADMIN_*`)

### 🧪 جودة الكود (Quality)
- تفكيك جزء من `src/app.js` إلى وحدات:
  - `src/app/formatting.js`
  - `src/app/customer-dropdowns.js`
  - `src/app/reconciliation-handlers.js`
  - `src/app/edit-form-helpers.js`
  - `src/app/report-metrics.js`
  - `src/app/report-export-utils.js`
  - `src/app/report-html-builders.js`
  - `src/app/performance-pdf-builders.js`
  - `src/app/print-section-builders.js`
  - `src/app/print-html-generator.js`
  - `src/app/print-styles.js`
  - `src/app/print-window.js`
  - `src/app/print-selection-modal.js`
  - `src/app/event-listeners.js`
  - `src/app/pdf-data-transformer.js`
  - `src/app/thermal-print-sections.js`
  - `src/app/thermal-printer-settings.js`
  - `src/app/autocomplete-helpers.js`
  - `src/app/sync-control.js`
  - `src/app/postpaid-sales-report.js`
  - `src/app/advanced-reports.js`
  - `src/app/app-api.js`
  - `src/app/reconciliation-operations.js`
  - `src/app/reports-management.js`
  - `src/app/reconciliation-save-reset.js`
  - `src/app/reconciliation-state-controls.js`
  - `src/app/reconciliation-list.js`
  - `src/app/saved-reconciliations.js`
  - `src/app/saved-reconciliation-print.js`
  - `src/app/cashier-management.js`
  - `src/app/admin-management.js`
  - `src/app/accountant-management.js`
  - `src/app/atm-management.js`
  - `src/app/branch-management.js`
  - `src/app/detailed-atm-report-management.js`
  - `src/app/system-settings.js`
  - `src/app/backup-restore-management.js`
  - `src/app/edit-modal-population.js`
  - `src/app/detailed-atm-report-print.js`
  - `src/app/new-reconciliation.js`
  - `src/app/saved-print-tools.js`
  - `src/app/sidebar-toggle.js`
  - `src/app/reconciliation-recall.js`
  - `src/app/legacy-debug-tools.js`
  - `src/app/thermal-direct-print.js`
  - `src/app/advanced-print-workflow.js`
  - `src/app/advanced-print-settings.js`
  - `src/app/cashier-performance-comparison.js`
  - `src/app/edit-session-handlers.js`
  - `src/app/settings-ui-loader.js`
  - `src/app/edit-table-handlers.js`
  - `src/app/edit-reconciliation-loader.js`
  - `src/app/reconciliation-data-entry.js`
  - `src/app/app-shell-handlers.js`
  - `src/app/app-runtime.js`
  - `src/app/app-shell-runtime-bootstrap.js`
  - `src/app/app-state.js`
  - `src/app/app-ui-runtime-bootstrap.js`
  - `src/app/app-ui-bootstrap.js`
  - `src/app/app-reconciliation-ui-bootstrap.js`
  - `src/app/app-finalization.js`
  - `src/app/app-print-report-bootstrap.js`
  - `src/app/app-pre-ui-bootstrap.js`
  - `src/app/app-pre-ui-runtime-bootstrap.js`
  - `src/app/app-edit-runtime-bootstrap.js`
  - `src/app/app-print-runtime-bootstrap.js`
  - `src/app/app-reconciliation-runtime-bootstrap.js`
  - `src/app/app-composition.js`
  - `src/app/debug-validation-tools.js`
  - `src/app/advanced-print-dialogs.js`
  - `src/security/admin-seed-policy.js`
- إضافة إعداد ESLint أساسي (`.eslintrc.cjs`) وسكربت `npm run lint`
- إضافة اختبارات smoke عبر Node Test Runner وسكربت `npm test`
  - `test/formatting.test.js`
  - `test/reconciliation-handlers.test.js`
  - `test/edit-form-helpers.test.js`
  - `test/admin-seed-policy.test.js`
  - `test/report-metrics.test.js`
  - `test/report-export-utils.test.js`
  - `test/report-html-builders.test.js`
  - `test/performance-pdf-builders.test.js`
  - `test/print-section-builders.test.js`
  - `test/print-html-generator.test.js`
  - `test/print-styles.test.js`
  - `test/print-window.test.js`
  - `test/print-selection-modal.test.js`
  - `test/event-listeners.test.js`
  - `test/pdf-data-transformer.test.js`
  - `test/thermal-print-sections.test.js`
  - `test/thermal-printer-settings.test.js`
  - `test/autocomplete-helpers.test.js`
  - `test/sync-control.test.js`
  - `test/postpaid-sales-report.test.js`
  - `test/advanced-reports.test.js`
  - `test/app-api.test.js`
  - `test/reconciliation-operations.test.js`
  - `test/reports-management.test.js`
  - `test/reconciliation-save-reset.test.js`
  - `test/reconciliation-state-controls.test.js`
  - `test/reconciliation-list.test.js`
  - `test/saved-reconciliations.test.js`
  - `test/saved-reconciliation-print.test.js`
  - `test/cashier-management.test.js`
  - `test/admin-management.test.js`
  - `test/accountant-management.test.js`
  - `test/atm-management.test.js`
  - `test/branch-management.test.js`
  - `test/detailed-atm-report-management.test.js`
  - `test/system-settings.test.js`
  - `test/backup-restore-management.test.js`
  - `test/detailed-atm-report-print.test.js`
  - `test/new-reconciliation.test.js`
  - `test/saved-print-tools.test.js`
  - `test/sidebar-toggle.test.js`
  - `test/legacy-debug-tools.test.js`
  - `test/reconciliation-recall.test.js`
  - `test/thermal-direct-print.test.js`
  - `test/advanced-print-workflow.test.js`
  - `test/advanced-print-settings.test.js`
  - `test/cashier-performance-comparison.test.js`
  - `test/edit-session-handlers.test.js`
  - `test/settings-ui-loader.test.js`
  - `test/edit-table-handlers.test.js`
  - `test/edit-reconciliation-loader.test.js`
  - `test/reconciliation-data-entry.test.js`
  - `test/app-shell-handlers.test.js`
  - `test/app-runtime.test.js`
  - `test/app-shell-runtime-bootstrap.test.js`
  - `test/app-composition.test.js`
  - `test/app-state.test.js`
  - `test/app-ui-runtime-bootstrap.test.js`
  - `test/app-ui-bootstrap.test.js`
  - `test/app-reconciliation-ui-bootstrap.test.js`
  - `test/app-finalization.test.js`
  - `test/app-print-report-bootstrap.test.js`
  - `test/app-pre-ui-bootstrap.test.js`
  - `test/app-edit-runtime-bootstrap.test.js`
  - `test/debug-validation-tools.test.js`
  - `test/advanced-print-dialogs.test.js`
  - `test/edit-modal-population.test.js`
- إزالة التعريفات المكررة في `src/app.js` لدوال:
  - `handleSaveReconciliation`
  - `resetSystemToNewReconciliationState`
- مواصلة تفكيك `src/app.js` وتحسين wiring:
  - تقليل الملف إلى 83 سطر
  - تحويل الاعتماد إلى كائنات handlers مباشرة بدل destructuring ضخم
  - تحسين `src/app/app-shell-runtime-bootstrap.js` للتعامل الآمن مع handlers الاختيارية
  - إضافة اختبار تغطية للحالة الاختيارية: `test/app-shell-runtime-bootstrap.test.js`
  - إضافة orchestrator مركزي للتجميع: `src/app/app-composition.js`
  - إضافة اختبار smoke للتجميع الكامل: `test/app-composition.test.js`
  - تفكيك `src/app/app-composition.js` إلى طبقة بناء اعتمادات:
    - `src/app/app-composition.js` (انخفض إلى 109 أسطر)
    - `src/app/app-composition-deps.js`
  - إضافة اختبار للوحدة الجديدة:
    - `test/app-composition-deps.test.js`
  - تفكيك إضافي لوحدة التعديل:
    - `src/app/edit-session-handlers.js` (انخفض إلى 1198 سطر)
    - `src/app/edit-session-persistence.js`
    - `src/app/edit-session-data-helpers.js`
  - إضافة اختبارات للوحدات الجديدة:
    - `test/edit-session-persistence.test.js`
    - `test/edit-session-data-helpers.test.js`
  - إضافة وحدات تفكيك إضافية:
    - `src/app/app-feature-deps.js`
    - `src/app/app-state-deps.js`
    - `src/app/app-handler-bootstrap.js`
  - إضافة اختبارات أساسية للوحدات الجديدة:
    - `test/app-feature-deps.test.js`
    - `test/app-state-deps.test.js`
    - `test/app-handler-bootstrap.test.js`
  - تحسين استقرار الاختبارات بتشغيل `npm test` بتوازي ملفي = 1

### 🗑️ حذف (Removed)
- إزالة `reset-requests-sequence.js` (كان لا يعمل بسبب better-sqlite3)

### 🔧 تحسينات تقنية (Technical)
- تحديث دالة `addDetailedBankReceipt` في `src/app.js`
- إضافة دالة `handleResetRequestsSequence` في `src/local-server.js`
- تحسين استعلامات قاعدة البيانات للتحويلات البنكية

---

## [4.0.0] - 2026-01-XX

### ✨ إضافات (Added)
- نظام طلبات التصفية من الويب
- مدير طلبات التصفية
- تحسينات في واجهة الويب
- دعم الفروع المتعددة

### 🐛 إصلاحات (Fixed)
- إصلاح مشكلة اختيار الفرع
- إصلاح مشكلة الاعتماد التلقائي للطلبات
- تحسينات في المزامنة

---

## [3.x.x] - 2025-XX-XX

### الإصدارات السابقة
- النظام الأساسي للتصفية
- إدارة الكاشير والمحاسب
- التقارير والطباعة
- قاعدة البيانات المحلية

---

## 🔖 دليل التنسيق

### أنواع التغييرات:
- **✨ Added** - ميزات جديدة
- **🔧 Changed** - تغييرات في الميزات الموجودة
- **⚠️ Deprecated** - ميزات ستُحذف قريباً  
- **🗑️ Removed** - ميزات تم حذفها
- **🐛 Fixed** - إصلاح مشاكل
- **🔒 Security** - إصلاحات أمنية
- **📚 Documentation** - تحديثات التوثيق
- **🎨 UI/UX** - تحسينات الواجهة

### تنسيق الإصدارات:
الإصدارات تتبع [Semantic Versioning](https://semver.org/):
- **MAJOR.MINOR.PATCH** (مثال: 5.0.0)
  - **MAJOR**: تغييرات كبيرة غير متوافقة
  - **MINOR**: ميزات جديدة متوافقة مع السابق
  - **PATCH**: إصلاحات وتحسينات صغيرة

---

**آخر تحديث**: 2026-02-25  
**المطور**: محمد أمين الكامل  
**المشروع**: تصفية برو - Tasfiya Pro
