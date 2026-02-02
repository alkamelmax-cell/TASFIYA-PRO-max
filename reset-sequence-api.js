// سكريبت بسيط لإعادة ضبط تسلسل طلبات التصفية عبر API
const http = require('http');

console.log('🔄 [RESET] بدء إعادة ضبط تسلسل طلبات التصفية...');
console.log('📡 [API] الاتصال بالسيرفر المحلي...');

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/reconciliation-requests/reset-sequence',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const result = JSON.parse(data);
            if (result.success) {
                console.log('✅ [SUCCESS]', result.message);
                console.log('');
                console.log('🎉 [DONE] تمت العملية بنجاح!');
                console.log('💡 [NOTE] الطلب التالي سيبدأ من #1');
            } else {
                console.error('❌ [ERROR]', result.error);
            }
        } catch (error) {
            console.error('❌ [ERROR] فشل في قراءة النتيجة:', error.message);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ [ERROR] فشل الاتصال بالسيرفر:', error.message);
    console.log('');
    console.log('💡 [TIP] تأكد من تشغيل التطبيق أولاً باستخدام: npm run dev');
});

req.end();
