// ===================================================
// 🧾 تطبيق: تصفية برو - النسخة النهائية المحدثة
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

/**
 * Electron Builder Configuration - Final Production Build
 * إعدادات بناء Electron - البناء النهائي للإنتاج
 *
 * This configuration creates a complete production-ready build with all fixes
 * هذا التكوين ينشئ بناء كامل جاهز للإنتاج مع جميع الإصلاحات
 */

module.exports = {
  appId: "com.tasfiyapro.reconciliation",
  productName: "تصفية برو - Tasfiya Pro",
  
  directories: {
  output: "dist-final-v4.0.0",
    buildResources: "assets"
  },
  
  // Files to include in the final build
  // الملفات المراد تضمينها في البناء النهائي
  files: [
    "src/**/*",
    "assets/**/*",
    "node_modules/**/*",
    "package.json",
    
    // Exclude ALL test and development files
    // استبعاد جميع ملفات الاختبار والتطوير
    "!src/**/*-test.js",
    "!src/**/*-diagnostic.js", 
    "!src/**/*-verification.js",
    "!src/**/test-*.js",
    "!src/test-functions.js",
    "!src/dialog-test.js",
    "!src/customer-receipts-test.js",
    "!src/suppliers-test.js",
    "!src/new-features-test.js",
    "!src/bug-fixes-test.js",
    "!src/advanced-bug-fixes-test.js",
    "!src/edit-reconciliation-diagnostic.js",
    "!src/direct-edit-test.js",
    "!src/reconciliation-debug-test.js",
    "!src/advanced-print-system-test.js",
    "!src/bank-receipts-fix-test.js",
    "!src/edit-data-loading-diagnostic.js",
    "!src/quick-edit-test.js",
    "!src/final-edit-verification.js",
    "!src/save-and-calculation-test.js",
    "!src/export-print-test.js",
    "!src/pdf-export-test.js",
    "!src/filter-save-button-fix-test.js",
    "!src/performance-pdf-test.js",
    "!src/transfer-operation-test.js",
    
    // Exclude development HTML files
    // استبعاد ملفات HTML الخاصة بالتطوير
    "!test-*.html",
    "!*-test.html",
    "!*-fix.html",
    "!create-icon-for-build.html",
    
    // Exclude documentation and summary files
    // استبعاد ملفات التوثيق والملخصات
    "!*SUMMARY.md",
    "!*DOCUMENTATION.md",
    "!*REPORT.md",
    "!README-*.md",
    
    // Exclude development configuration files
    // استبعاد ملفات تكوين التطوير
    "!.env*",
    "!**/*.log",
    "!**/*.tmp",
    "!**/debug.log",
    "!**/.DS_Store",
    "!**/Thumbs.db",
    
    // Exclude build artifacts from previous builds
    // استبعاد مخرجات البناء من البناءات السابقة
    "!dist/**/*",
    "!dist-*/**/*",
    "!build/**/*"
  ],

  // Extra resources to copy to the app package
  // موارد إضافية لنسخها إلى حزمة التطبيق
  extraResources: [
    {
      from: "assets/",
      to: "assets/",
      filter: [
        "**/*",
        "!create-icon.html",
        "!tasfiya-pro-icon.svg"
      ]
    }
  ],
  
  // Windows specific configuration
  // إعدادات خاصة بنظام Windows
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      },
      {
        target: "portable",
        arch: ["x64"]
      }
    ],
    icon: "./assets/icon.ico",
    requestedExecutionLevel: "asInvoker",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    verifyUpdateCodeSignature: false,
    forceCodeSigning: false,
    legalTrademarks: "تصفية برو © 2025 محمد أمين الكامل",
    signAndEditExecutable: false,
    signExts: null
  },
  
  // NSIS installer configuration
  // إعدادات مثبت NSIS
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "تصفية برو",
    deleteAppDataOnUninstall: false,
    displayLanguageSelector: false,
    language: "1025", // Arabic
    installerIcon: "./assets/icon.ico",
    uninstallerIcon: "./assets/icon.ico",
    installerHeaderIcon: "./assets/icon.ico"
  },

  // Portable configuration
  // إعدادات النسخة المحمولة
  portable: {
    artifactName: "${productName}-${version}-Portable.${ext}",
    requestExecutionLevel: "user"
  },
  
  // Compression settings for optimal size
  // إعدادات الضغط للحجم الأمثل
  compression: "maximum",
  
  // Additional metadata
  // معلومات إضافية
  copyright: "© 2025 محمد أمين الكامل - جميع الحقوق محفوظة",
  
  // Build configuration
  // إعدادات البناء
  buildDependenciesFromSource: false,
  nodeGypRebuild: false,
  npmRebuild: false,
  
  // Publish configuration (disabled for local builds)
  // إعدادات النشر (معطلة للبناء المحلي)
  publish: null,
  
  // File associations
  // ربط الملفات
  fileAssociations: [
    {
      ext: "casher",
      name: "Tasfiya Pro Backup",
      description: "ملف نسخة احتياطية لتصفية برو",
      icon: "./assets/icon.ico"
    }
  ],
  
  // Protocol associations
  // ربط البروتوكولات
  protocols: [
    {
      name: "tasfiya-pro",
      schemes: ["tasfiya"]
    }
  ]
};