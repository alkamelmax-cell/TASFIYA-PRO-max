/**
 * ============================================================
 * تصفية برو - Tasfiya Pro
 * Build Script - سكريبت بناء نظيف وبسيط
 * ============================================================
 * إصدار: يتم سحبه من package.json
 * التاريخ: 2026-02-02
 * ============================================================
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { version: APP_VERSION } = require('./package.json');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function resolveBin(bin) {
  return bin;
}

function runCommand(command, args, description) {
  try {
    log(`\n▶️  ${description}...`, 'cyan');
    const result = spawnSync(command, args, {
      stdio: 'inherit',
      // On Windows, use shell execution so npm/npx and other command aliases
      // are resolved reliably without triggering "open with app" behavior.
      shell: process.platform === 'win32',
      windowsHide: true
    });

    if (result.error) {
      throw result.error;
    }

    if (typeof result.status === 'number' && result.status !== 0) {
      throw new Error(`Command exited with code ${result.status}`);
    }

    log(`✅ ${description} - نجح`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${description} - فشل`, 'red');
    return false;
  }
}

// ============================================================
// الخطوة 1: فحص الملفات المطلوبة
// ============================================================
function checkRequiredFiles() {
  log('\n🔍 فحص الملفات المطلوبة...', 'blue');

  const requiredFiles = [
    'src/main.js',
    'src/index.html',
    'src/app.js',
    'src/styles.css',
    'src/database.js',
    'package.json'
  ];

  const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

  if (missingFiles.length > 0) {
    log('❌ الملفات التالية مفقودة:', 'red');
    missingFiles.forEach(file => log(`   - ${file}`, 'red'));
    process.exit(1);
  }

  log('✅ جميع الملفات المطلوبة موجودة', 'green');
}

// ============================================================
// الخطوة 2: تنظيف المجلدات القديمة
// ============================================================
function cleanOldBuilds() {
  log('\n🗑️  تنظيف البنايات القديمة...', 'blue');

  const dirsToClean = ['dist', 'dist-final-v4.0.0', 'dist-v4.0.0', 'out'];

  dirsToClean.forEach(dir => {
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        log(`   ✓ تم حذف ${dir}`, 'cyan');
      } catch (error) {
        log(`   ⚠️  لم يتم حذف ${dir}`, 'yellow');
      }
    }
  });

  log('✅ تم تنظيف البنايات القديمة', 'green');
}

// ============================================================
// الخطوة 3: تثبيت المتطلبات
// ============================================================
function installDependencies() {
  return runCommand(resolveBin('npm'), ['install'], 'تثبيت المتطلبات (npm install)');
}

// ============================================================
// الخطوة 4: إعادة بناء الوحدات الأصلية (Native Modules)
// ============================================================
function rebuildNativeModules() {
  return runCommand(
    resolveBin('npm'),
    ['run', 'rebuild'],
    'إعادة بناء الوحدات الأصلية (Electron)'
  );
}

// ============================================================
// الخطوة 5: بناء التطبيق
// ============================================================
function buildApplication() {
  // استخدام الإعدادات من package.json مباشرة
  return runCommand(
    resolveBin('npx'),
    ['electron-builder', '--win', '--x64'],
    'بناء التطبيق (Electron Builder)'
  );
}

// ============================================================
// الخطوة 5: التحقق من النتائج
// ============================================================
function verifyBuild() {
  log('\n🔍 التحقق من نتائج البناء...', 'blue');

  if (!fs.existsSync('dist')) {
    log('❌ فشل البناء: مجلد dist غير موجود', 'red');
    process.exit(1);
  }

  const distFiles = fs.readdirSync('dist').filter(f =>
    f.endsWith('.exe') || f.endsWith('.nsis')
  );

  if (distFiles.length === 0) {
    log('⚠️  تحذير: لم يتم العثور على ملفات .exe في المجلد dist', 'yellow');
  } else {
    log('✅ تم إنشاء ملفات البناء:', 'green');
    distFiles.forEach(file => log(`   - ${file}`, 'cyan'));
  }
}

// ============================================================
// الدالة الرئيسية
// ============================================================
async function main() {
  try {
    log('\n╔════════════════════════════════════════════════════════╗', 'blue');
    log('║     تصفية برو - Tasfiya Pro - عملية البناء            ║', 'blue');
    log(`║          Clean Build Script v${APP_VERSION.padEnd(23, ' ')}║`, 'blue');
    log('╚════════════════════════════════════════════════════════╝\n', 'blue');

    // الخطوة 1: فحص الملفات
    checkRequiredFiles();

    // الخطوة 2: تنظيف البنايات القديمة
    cleanOldBuilds();

    // الخطوة 3: تثبيت المتطلبات
    if (!installDependencies()) {
      throw new Error('فشل تثبيت المتطلبات');
    }

    // الخطوة 4: إعادة بناء الوحدات
    if (!rebuildNativeModules()) {
      throw new Error('فشل إعادة بناء الوحدات الأصلية');
    }

    // الخطوة 5: بناء التطبيق
    if (!buildApplication()) {
      throw new Error('فشل بناء التطبيق');
    }

    // الخطوة 6: التحقق من النتائج
    verifyBuild();

    // النتيجة النهائية
    log('\n╔════════════════════════════════════════════════════════╗', 'green');
    log('║          🎉 تمت عملية البناء بنجاح! 🎉              ║', 'green');
    log('╚════════════════════════════════════════════════════════╝', 'green');
    log('\n📁 ستجد ملفات البناء في: dist/', 'cyan');
    log('💻 التطبيق متوافق مع Windows 10/11', 'cyan');
    log('📦 التطبيق مستقل وجاهز للاستخدام\n', 'cyan');

  } catch (error) {
    log('\n❌ فشلت عملية البناء', 'red');
    log(`   ${error.message}\n`, 'red');
    process.exit(1);
  }
}

// تشغيل البرنامج الرئيسي
if (require.main === module) {
  main().catch(error => {
    log(`\n❌ خطأ غير متوقع: ${error.message}\n`, 'red');
    process.exit(1);
  });
}

module.exports = {
  checkRequiredFiles,
  cleanOldBuilds,
  installDependencies,
  buildApplication,
  verifyBuild
};
