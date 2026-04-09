; تخصيص مثبت تصفية برو - Tasfiya Pro Installer Customization
; © 2025 محمد أمين الكامل - جميع الحقوق محفوظة

; تعيين اللغة العربية
!define MUI_LANGDLL_ALLLANGUAGES
!define TASFIYA_LANG_ARABIC 1025
!define TASFIYA_LANG_ENGLISH 1033

; رسائل مخصصة
LangString welcome ${TASFIYA_LANG_ARABIC} "مرحباً بك في معالج تثبيت تصفية برو"
LangString welcome ${TASFIYA_LANG_ENGLISH} "Welcome to Tasfiya Pro Setup Wizard"

LangString finish ${TASFIYA_LANG_ARABIC} "تم تثبيت تصفية برو بنجاح"
LangString finish ${TASFIYA_LANG_ENGLISH} "Tasfiya Pro has been installed successfully"

; إعدادات إضافية
!define MUI_WELCOMEPAGE_TITLE "تصفية برو - نظام التصفية الاحترافي"
!define MUI_WELCOMEPAGE_TEXT "هذا المعالج سيقوم بتثبيت تصفية برو على جهازك.$\r$\n$\r$\nتصفية برو هو نظام احترافي لإدارة عمليات التصفية والتقارير المالية.$\r$\n$\r$\n🆕 الجديد في الإصدار V4.0.0:$\r$\n• مرشح النطاق الزمني للتصفيات$\r$\n• ملاحظات وتعليقات التصفية$\r$\n• تحسينات نظام الطباعة$\r$\n• دعم كامل للتصفيات المحفوظة$\r$\n$\r$\nالمطور: محمد أمين الكامل$\r$\nالإصدار: V4.0.0 (Production Build)$\r$\n$\r$\nاضغط التالي للمتابعة."

!define MUI_FINISHPAGE_TITLE "اكتمل التثبيت"
!define MUI_FINISHPAGE_TEXT "تم تثبيت تصفية برو بنجاح على جهازك.$\r$\n$\r$\nيمكنك الآن تشغيل التطبيق من سطح المكتب أو قائمة ابدأ.$\r$\n$\r$\nشكراً لاستخدام تصفية برو!"

; تخصيص أيقونات
!ifndef MUI_ICON
  !define MUI_ICON "assets\icon.ico"
!endif

!ifndef MUI_UNICON
  !define MUI_UNICON "assets\icon.ico"
!endif

