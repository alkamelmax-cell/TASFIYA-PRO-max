#!/usr/bin/env node

/**
 * Thermal Printer 80mm - Quick Verification Script
 * تصفية برو - سكريبت التحقق السريع من الطابعة الحرارية
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║   🧾 تحقق من نظام الطباعة الحرارية 80 ملم                  ║');
console.log('║   Thermal Printer 80mm Verification Script                  ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const checks = [
    {
        name: '✓ ملف الطابعة الحرارية',
        file: 'src/thermal-printer-80mm.js',
        required: true
    },
    {
        name: '✓ ملف main.js (محدث)',
        file: 'src/main.js',
        required: true,
        contains: 'thermalPrinter'
    },
    {
        name: '✓ ملف app.js (محدث)',
        file: 'src/app.js',
        required: true,
        contains: 'handleThermalPrinter'
    },
    {
        name: '✓ ملف index.html (محدث)',
        file: 'src/index.html',
        required: true,
        contains: 'thermalPrinterPreviewBtn'
    },
    {
        name: '✓ دليل الطابعة الحرارية',
        file: 'THERMAL_PRINTER_80MM_GUIDE.md',
        required: false
    },
    {
        name: '✓ ملخص التطوير',
        file: 'THERMAL_PRINTER_80MM_SUMMARY.txt',
        required: false
    }
];

let passedChecks = 0;
let failedChecks = 0;

console.log('الفحوصات المتقدمة:');
console.log('─'.repeat(60));

checks.forEach((check, index) => {
    const filePath = path.join(__dirname, check.file);
    
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            
            if (check.contains) {
                if (content.includes(check.contains)) {
                    console.log(`${check.name}`);
                    console.log(`  ✅ موجود وصحيح (${(content.length / 1024).toFixed(2)} KB)`);
                    passedChecks++;
                } else {
                    console.log(`${check.name}`);
                    console.log(`  ⚠️  موجود لكن قد يكون ناقص: ${check.contains}`);
                    if (check.required) failedChecks++;
                }
            } else {
                console.log(`${check.name}`);
                console.log(`  ✅ موجود (${(content.length / 1024).toFixed(2)} KB)`);
                passedChecks++;
            }
        } else {
            console.log(`${check.name}`);
            if (check.required) {
                console.log(`  ❌ غير موجود (مطلوب)`);
                failedChecks++;
            } else {
                console.log(`  ⚠️  غير موجود (اختياري)`);
            }
        }
    } catch (error) {
        console.log(`${check.name}`);
        console.log(`  ❌ خطأ: ${error.message}`);
        failedChecks++;
    }
    
    if (index < checks.length - 1) {
        console.log('');
    }
});

console.log('\n' + '─'.repeat(60));
console.log('\nملخص الفحص:');
console.log(`  ✅ النجاح: ${passedChecks} فحوصات`);
console.log(`  ❌ الفشل: ${failedChecks} فحوصات`);

if (failedChecks === 0) {
    console.log('\n✨ جميع الفحوصات نجحت! النظام جاهز للاستخدام.\n');
    console.log('الخطوات التالية:');
    console.log('  1. قم بتشغيل التطبيق: npm start');
    console.log('  2. اتصل بطابعة حرارية 80 ملم');
    console.log('  3. اذهب إلى الإعدادات → الطابعة الحرارية');
    console.log('  4. اختر الطابعة وحفظ الإعدادات');
    console.log('  5. اختبر الطابعة باستخدام "اختبار الطباعة الحرارية"');
    console.log('');
    process.exit(0);
} else {
    console.log('\n⚠️  يوجد بعض المشاكل التي تحتاج للتصحيح.\n');
    process.exit(1);
}
