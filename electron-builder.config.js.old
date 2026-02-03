/**
 * ============================================================
 * تصفية برو - Tasfiya Pro
 * Electron Builder Configuration - نظيف وبسيط
 * ============================================================
 * إصدار: 4.0.0 - بناء موثوق بدون مشاكل
 * التاريخ: 2025-11-14
 * ============================================================
 */

module.exports = {
  // معلومات التطبيق الأساسية
  appId: 'com.tasfiyapro.reconciliation',
  productName: 'تصفية برو - Tasfiya Pro',
  copyright: '© 2025 محمد أمين الكامل - جميع الحقوق محفوظة',
  
  // المسارات والموارد
  directories: {
    output: 'dist',
    buildResources: 'assets'
  },

  // الملفات المراد تضمينها في البناء
  files: [
    'src/**/*',
    'node_modules/**/*',
    'package.json'
  ],

  // الموارد الإضافية
  extraResources: [
    {
      from: 'assets',
      to: 'assets',
      filter: ['!*.html', '!*.svg']
    }
  ],

  // إعدادات Windows
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ],
    icon: 'assets/icon.ico',
    artifactName: '${productName}-${version}.${ext}'
  },

  // إعدادات NSIS (المثبت)
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'تصفية برو',
    deleteAppDataOnUninstall: false,
    displayLanguageSelector: false,
    language: 1025
  },

  // إعدادات المحمول (Portable)
  portable: {
    artifactName: '${productName}-${version}-portable.${ext}'
  },

  // إعدادات الضغط
  compression: 'maximum',
  asar: true,

  // إعدادات البناء الأخرى
  npmRebuild: false,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  publish: null
};