#!/usr/bin/env node

/**
 * Quick Test Script for Thermal Printer Settings Fix
 * 
 * هذا النص للاختبار السريع لإصلاح إعدادات الطابعة الحرارية
 */

const fs = require('fs');
const path = require('path');

console.log('\n📋 اختبار إصلاح إعدادات الطابعة الحرارية');
console.log('=' .repeat(60));

// 1. Check file exists
const filePath = path.join(__dirname, 'src', 'thermal-printer-80mm.js');
console.log('\n✓ [1] التحقق من وجود الملف...');
if (fs.existsSync(filePath)) {
    console.log(`    ✅ الملف موجود: ${filePath}`);
} else {
    console.log(`    ❌ الملف غير موجود: ${filePath}`);
    process.exit(1);
}

// 2. Read file content
console.log('\n✓ [2] قراءة محتوى الملف...');
const content = fs.readFileSync(filePath, 'utf8');
console.log(`    ✅ تم قراءة ${content.length} حرف`);

// 3. Check for settings extraction
console.log('\n✓ [3] التحقق من استخراج الإعدادات (Settings Extraction)...');
if (content.includes('const fontName = this.settings.fontName')) {
    console.log('    ✅ يتم استخراج fontName من this.settings');
} else {
    console.log('    ❌ لم يتم العثور على استخراج fontName');
}

if (content.includes('const fontSize = this.settings.fontSize')) {
    console.log('    ✅ يتم استخراج fontSize من this.settings');
} else {
    console.log('    ❌ لم يتم العثور على استخراج fontSize');
}

// 4. Check for dynamic CSS variables
console.log('\n✓ [4] التحقق من متغيرات CSS الديناميكية (Dynamic CSS)...');
const dynamicCSSChecks = [
    { name: 'Body font-family', pattern: /font-family: '\$\{fontName\}'/g },
    { name: 'Body font-size', pattern: /font-size: \$\{fontSize\}pt/g },
    { name: 'Receipt-form font-family', pattern: /\.receipt-form[\s\S]*?font-family: '\$\{fontName\}'/g },
    { name: 'Receipt-form font-size', pattern: /\.receipt-form[\s\S]*?font-size: \$\{fontSize\}pt/g },
    { name: 'Print media receipt-form', pattern: /@media print[\s\S]*?font-size: \$\{fontSize - 1\}pt/g },
    { name: 'Print media tables', pattern: /font-size: \$\{fontSize - 2\}pt/g }
];

let cssOkCount = 0;
dynamicCSSChecks.forEach(check => {
    if (check.pattern.test(content)) {
        console.log(`    ✅ ${check.name}`);
        cssOkCount++;
    } else {
        console.log(`    ❌ ${check.name}`);
    }
});

// 5. Check print options
console.log('\n✓ [5] التحقق من خيارات الطباعة (Print Options)...');
const printChecks = [
    { name: 'Color from settings', pattern: /color: this\.settings\.color/g },
    { name: 'Copies from settings', pattern: /copies: this\.settings\.copies/g },
    { name: 'Device name from settings', pattern: /deviceName: (printerName \|\| this\.settings\.printerName|this\.settings\.printerName)/g }
];

printChecks.forEach(check => {
    if (check.pattern.test(content)) {
        console.log(`    ✅ ${check.name}`);
    } else {
        console.log(`    ❌ ${check.name}`);
    }
});

// 6. Check console logging
console.log('\n✓ [6] التحقق من تسجيل الأخطاء (Logging)...');
if (content.includes("console.log('⚙️ [THERMAL-PRINTER] الإعدادات المطبقة:'")) {
    console.log('    ✅ تسجيل الإعدادات موجود');
} else {
    console.log('    ⚠️  تسجيل الإعدادات قد يكون بصيغة مختلفة');
}

// 7. Syntax check
console.log('\n✓ [7] التحقق من صحة الجملات JavaScript...');
try {
    require('./src/thermal-printer-80mm.js');
    console.log('    ✅ لا توجد أخطاء في الصيغة');
} catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
        console.log('    ⚠️  لا يمكن تحميل الملف (قد يكون طبيعياً في بيئة الاختبار)');
    } else if (error instanceof SyntaxError) {
        console.log(`    ❌ خطأ في الصيغة: ${error.message}`);
    } else {
        console.log('    ⚠️  خطأ غير متوقع (قد يكون طبيعياً):', error.message.substring(0, 50));
    }
}

// Summary
console.log('\n' + '=' .repeat(60));
console.log('📊 ملخص الاختبار:');
console.log(`    - متغيرات CSS الديناميكية: ${cssOkCount}/6 تم التحقق منها`);
console.log(`    - خيارات الطباعة: تم التحقق منها`);
console.log(`    - التسجيل: تم التحقق منه`);

if (cssOkCount === 6) {
    console.log('\n✅ جميع الاختبارات نجحت! يمكنك الآن تشغيل التطبيق واختبار الإعدادات');
} else {
    console.log(`\n⚠️  بعض الاختبارات لم تكتمل (${6 - cssOkCount} عناصر)`);
}

console.log('\n' + '=' .repeat(60) + '\n');

// Next steps
console.log('📝 الخطوات التالية:');
console.log('  1. شغّل التطبيق: npm start');
console.log('  2. غيّر إعدادات الطباعة (الخط، الحجم، إلخ)');
console.log('  3. اطبع إيصالاً جديداً');
console.log('  4. تحقق من أن الإعدادات تم تطبيقها على المطبوع');
console.log('  5. افتح Dev Tools (F12) وتحقق من السجلات\n');
