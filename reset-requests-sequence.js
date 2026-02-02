const Database = require('better-sqlite3');
const path = require('path');

// مسار قاعدة البيانات
const dbPath = path.join(__dirname, 'tasfiya.db');

console.log('🔄 [RESET] بدء إعادة ضبط تسلسل طلبات التصفية...');
console.log('📁 [DB] مسار قاعدة البيانات:', dbPath);

try {
    // فتح قاعدة البيانات
    const db = new Database(dbPath);

    // التحقق من عدد الطلبات الموجودة
    const countResult = db.prepare('SELECT COUNT(*) as count FROM reconciliation_requests').get();
    console.log(`📊 [INFO] عدد الطلبات الموجودة حالياً: ${countResult.count}`);

    // إعادة ضبط التسلسل
    db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'reconciliation_requests'`).run();
    console.log('✅ [SUCCESS] تم إعادة ضبط التسلسل بنجاح!');

    // التحقق من التسلسل الجديد
    const seqResult = db.prepare(`SELECT seq FROM sqlite_sequence WHERE name = 'reconciliation_requests'`).get();
    if (seqResult) {
        console.log(`📈 [INFO] التسلسل الحالي: ${seqResult.seq}`);
    } else {
        console.log(`📈 [INFO] التسلسل تم إعادة ضبطه. الطلب التالي سيكون رقم #1`);
    }

    // إغلاق قاعدة البيانات
    db.close();

    console.log('');
    console.log('🎉 [DONE] تمت العملية بنجاح!');
    console.log('💡 [NOTE] الطلب التالي سيبدأ من #1');

} catch (error) {
    console.error('❌ [ERROR] حدث خطأ:', error.message);
    process.exit(1);
}
