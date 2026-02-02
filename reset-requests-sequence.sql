-- إعادة ضبط تسلسل طلبات التصفية
-- هذا السكريبت سيعيد الترقيم ليبدأ من 1

-- 1. حذف جميع طلبات التصفية الموجودة (اختياري - إذا كنت تريد حذفها)
-- DELETE FROM reconciliation_requests;

-- 2. إعادة تعيين التسلسل التلقائي
DELETE FROM sqlite_sequence WHERE name = 'reconciliation_requests';

-- 3. إذا كنت تريد الاحتفاظ بالطلبات الموجودة، استخدم هذا بدلاً من ذلك:
-- UPDATE sqlite_sequence SET seq = 0 WHERE name = 'reconciliation_requests';

-- ملاحظة: هذا سيجعل الطلب التالي يأخذ الرقم 1
