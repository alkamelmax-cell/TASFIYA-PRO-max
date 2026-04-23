# 🏗️ خطة البناء الشاملة - تصفية برو
## Professional Build Plan - Tasfiya Pro v5.0.0

**التاريخ**: 2026-02-02  
**الإصدار**: 5.0.0  
**المطور**: محمد أمين الكامل

---

## 📋 المحتويات

1. [التحضيرات](#التحضيرات)
2. [بناء التطبيق المكتبي](#بناء-التطبيق-المكتبي)
3. [تحسين تطبيق الويب](#تحسين-تطبيق-الويب)
4. [النشر على السحابة](#النشر-على-السحابة)
5. [إنشاء Release](#إنشاء-release)
6. [التوثيق](#التوثيق)

---

## 🎯 التحضيرات

### 1. التحقق من البيئة
```bash
# التحقق من Node.js
node --version

# التحقق من npm
npm --version

# التحقق من Git
git --version
```

### 2. تنظيف المشروع
```bash
# حذف مجلدات البناء القديمة
rm -rf dist/
rm -rf build/
rm -rf .cache/

# تنظيف node_modules (اختياري)
# rm -rf node_modules/
# npm install
```

### 3. تحديث الإصدار
- [x] تحديث `package.json` version
- [x] تحديث ملفات التوثيق
- [x] تحديث CHANGELOG

---

## 🖥️ بناء التطبيق المكتبي

### المرحلة 1: البناء المحلي

#### Windows (النظام الحالي)
```bash
# بناء نسخة NSIS (Installer)
npm run build-clean

# أو استخدام electron-builder مباشرة
npx electron-builder --win --x64
```

**الناتج المتوقع**:
- `dist/تصفية برو - Tasfiya Pro-5.0.0-x64.exe` (Installer)
- `dist/تصفية برو - Tasfiya Pro-5.0.0-portable.exe` (Portable)

#### الحجم المتوقع
- Installer: ~150-200 MB
- Portable: ~180-220 MB

### المرحلة 2: الاختبار

**اختبارات إلزامية**:
- [ ] تثبيت النسخة Installer
- [ ] تشغيل النسخة Portable
- [ ] اختبار جميع الميزات الأساسية
- [ ] اختبار الطباعة
- [ ] اختبار قاعدة البيانات
- [ ] اختبار المزامنة

---

## 🌐 تحسين تطبيق الويب

### 1. تحسين الملفات
```bash
# تصغير JavaScript
# استخدام terser أو uglify-js

# تصغير CSS
# استخدام cssnano

# ضغط الصور
# استخدام imagemin
```

### 2. تحسين الأداء
- [ ] Lazy loading للصور
- [ ] Code splitting
- [ ] Caching strategies
- [ ] Gzip compression

### 3. تدقيق الأمان
```bash
# فحص الثغرات
npm audit

# إصلاح الثغرات
npm audit fix
```

---

## ☁️ النشر على السحابة

### 1. Render (Backend)

**الخطوات**:
1. تحديث المستودع على GitHub
2. Render سيكتشف التحديثات تلقائياً
3. إعادة النشر التلقائي

**التحقق**:
- [ ] السيرفر يعمل
- [ ] قاعدة البيانات متصلة
- [ ] API endpoints تعمل
- [ ] المزامنة تعمل

### 2. متغيرات البيئة

**Render Environment Variables**:
```env
NODE_ENV=production
DATABASE_URL=<PostgreSQL URL>
PORT=10000
```

---

## 📦 إنشاء Release على GitHub

### الخطوات:

1. **إنشاء Tag**
```bash
git tag -a v5.0.0 -m "v5.0.0 - Bank Transfer ATM Separation + Reset Sequence Feature"
git push origin v5.0.0
```

2. **إنشاء Release على GitHub**
   - الذهاب إلى: https://github.com/alkamelmax-cell/TASFIYA-PRO-max/releases
   - النقر على "Draft a new release"
   - اختيار Tag: `v5.0.0`
   - كتابة Release Notes

3. **رفع الملفات**
   - `dist/تصفية برو - Tasfiya Pro-5.0.0-x64.exe`
   - `dist/تصفية برو - Tasfiya Pro-5.0.0-portable.exe`

### Release Notes Template:

```markdown
# 🎉 تصفية برو v5.0.0

## ✨ الميزات الجديدة

### 🏦 فصل التحويلات البنكية عن أجهزة ATM
- حقل "اسم البنك" أصبح للقراءة فقط ويتعبأ تلقائياً
- إخفاء حقول ATM عند اختيار "تحويل بنكي"
- إصلاح الطباعة للتحويلات البنكية

### 🔄 إعادة ضبط تسلسل طلبات التصفية
- أداة جديدة لإعادة ضبط الترقيم
- سكريبت سهل الاستخدام
- API endpoint جديد

## 🐛 إصلاحات
- إصلاح مشكلة ربط التحويلات البنكية بأجهزة ATM
- تحسين استعلامات قاعدة البيانات

## 📥 التحميل
- **Windows Installer**: تصفية برو - Tasfiya Pro-5.0.0-x64.exe
- **Windows Portable**: تصفية برو - Tasfiya Pro-5.0.0-portable.exe

## 📚 التوثيق
- [BANK_TRANSFER_ATM_SEPARATION.md](./BANK_TRANSFER_ATM_SEPARATION.md)
- [RESET_SEQUENCE_README.md](./RESET_SEQUENCE_README.md)

---
**التاريخ**: 2026-02-02  
**المطور**: محمد أمين الكامل
```

---

## 📚 التوثيق

### ملفات التوثيق المطلوبة:

- [x] `README.md` - دليل المستخدم الرئيسي
- [x] `BANK_TRANSFER_ATM_SEPARATION.md` - توثيق الميزة
- [x] `RESET_SEQUENCE_README.md` - توثيق الأداة
- [ ] `CHANGELOG.md` - سجل التغييرات
- [ ] `API_DOCUMENTATION.md` - توثيق API

---

## ✅ قائمة التحقق النهائية

### قبل البناء
- [ ] تحديث رقم الإصدار
- [ ] اختبار جميع الميزات محلياً
- [ ] commit جميع التعديلات
- [ ] push إلى GitHub

### أثناء البناء
- [ ] بناء نسخة Windows
- [ ] اختبار النسخة المبنية
- [ ] التحقق من الحجم والأداء

### بعد البناء
- [ ] إنشاء Release على GitHub
- [ ] رفع الملفات التنفيذية
- [ ] تحديث التوثيق
- [ ] الإعلان عن الإصدار الجديد

---

## 🚀 الأوامر السريعة

```bash
# 1. البناء
npm run build-clean

# 2. الاختبار
# شغل الملف من dist/

# 3. Git
git add .
git commit -m "chore: prepare v4.0.1 release"
git push

# 4. Tag
git tag -a v4.0.1 -m "v4.0.1 release"
git push origin v4.0.1
```

---

**ملاحظة**: هذه خطة شاملة. يمكن تنفيذها على مراحل حسب الحاجة.

---

© 2025 محمد أمين الكامل - جميع الحقوق محفوظة
