# تصفية برو — Android APK

هذا المجلد يبني تطبيق Android حقيقي من تطبيق الويب باستخدام **Trusted Web Activity**. أي أنه يفتح نفس تطبيق تصفية برو بملء الشاشة من Chrome، بدلاً من WebView ضعيف لا يدعم ميزات PWA بصورة موثوقة.

## البناء عبر GitHub

بعد رفع هذا التغيير إلى `main`، افتح في GitHub:

`Actions` ← `Build Android APK` ← `Run workflow`

بعد انتهاء العملية، حمّل الملف من قسم **Artifacts**. بدون مفاتيح توقيع سيُنتج `Tasfiya-Pro-debug.apk` للتجربة.

## الإصدار الاحترافي الموقّع

لإنتاج APK ثابت للتوزيع والتحديثات، أنشئ مفتاحاً واحداً فقط واحتفظ به في مكان آمن. لا تنشئ مفتاحاً جديداً لكل تحديث.

```powershell
keytool -genkeypair -v -keystore tasfiya-pro-release.jks -alias tasfiya-pro -keyalg RSA -keysize 4096 -validity 10000
```

أضف القيم التالية في GitHub: `Settings` ← `Secrets and variables` ← `Actions` ← `New repository secret`:

- `ANDROID_KEYSTORE_BASE64`: ناتج ` [Convert]::ToBase64String([IO.File]::ReadAllBytes('tasfiya-pro-release.jks')) `
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` (مثال: `tasfiya-pro`)
- `ANDROID_KEY_PASSWORD`

بعدها سيبني GitHub ملف `Tasfiya-Pro-release.apk` موقّعاً.

## التحقق الكامل وبدون شريط متصفح

حتى يعمل التطبيق كـ TWA كامل الشاشة، يجب أن يقدم الخادم الملف `/.well-known/assetlinks.json` وبداخله بصمة شهادة التوقيع SHA-256. الخادم مهيأ ليقرأها من متغير البيئة التالي:

`ANDROID_TWA_SHA256_CERT_FINGERPRINT`

استخراج البصمة:

```powershell
keytool -list -v -keystore tasfiya-pro-release.jks -alias tasfiya-pro
```

انسخ قيمة `SHA256` كاملة (بما فيها النقطتان) إلى متغير البيئة على كمبيوتر الخادم ثم أعد تشغيل خدمة الخادم. قبل ذلك يبقى التطبيق آمناً وقابلاً للتثبيت، لكن قد يفتحه Chrome كشريط متصفح بدلاً من الوضع الكامل.

## تغيير رابط الخادم

الرابط الحالي في `app/src/main/res/values/strings.xml`. إذا تغيّر نطاق Tailscale Funnel، غيّر `launch_url` و`asset_statements` إلى النطاق الجديد، ثم أنشئ APK جديداً.
