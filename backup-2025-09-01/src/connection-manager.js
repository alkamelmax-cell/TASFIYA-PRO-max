// ===================================================
// إعداد الاتصال بالإنترنت
// ===================================================

document.addEventListener('DOMContentLoaded', () => {
    // تهيئة نظام التخزين المحلي
    const OfflineStorage = require('./offline-storage');
    
    // تهيئة مؤشر حالة الاتصال
    const ConnectionStatus = require('./connection-status');
    new ConnectionStatus();

    // تهيئة مراقبي حالة الاتصال
    OfflineStorage.initConnectionListeners();
    
    // التحقق من حالة الاتصال الأولية
    updateConnectionStatus(navigator.onLine);
});

// تحديث حالة الاتصال عند تغيرها
window.addEventListener('online', () => updateConnectionStatus(true));
window.addEventListener('offline', () => updateConnectionStatus(false));

// دالة تحديث حالة الاتصال
function updateConnectionStatus(isOnline) {
    const OfflineStorage = require('./offline-storage');
    
    if (isOnline) {
        // إذا كان هناك اتصال، قم بمزامنة البيانات المخزنة محلياً
        console.log('🌐 متصل بالإنترنت - بدء المزامنة...');
        OfflineStorage.syncWithServer()
            .then(() => {
                console.log('✅ تمت المزامنة بنجاح');
            })
            .catch(error => {
                console.error('❌ خطأ في المزامنة:', error);
            });
    } else {
        console.log('📴 غير متصل - تفعيل وضع العمل المحلي');
    }
}

// تعديل الدوال الحالية لدعم العمل دون اتصال
const originalHandleSaveReconciliation = window.handleSaveReconciliation;
window.handleSaveReconciliation = async function() {
    const OfflineStorage = require('./offline-storage');
    
    if (!OfflineStorage.isOnline()) {
        console.log('📱 حفظ التصفية محلياً...');
        try {
            // حفظ البيانات في التخزين المحلي
            await OfflineStorage.saveData('reconciliations', {
                ...currentReconciliation,
                bankReceipts,
                cashReceipts,
                postpaidSales,
                customerReceipts,
                returnInvoices,
                suppliers,
                systemSales: parseFloat(document.getElementById('systemSales').value) || 0
            });
            
            DialogUtils.showSuccessToast('تم حفظ التصفية محلياً. ستتم المزامنة عند عودة الاتصال.');
            
        } catch (error) {
            console.error('❌ خطأ في الحفظ المحلي:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء الحفظ المحلي');
        }
    } else {
        // استخدام الدالة الأصلية إذا كان هناك اتصال
        return originalHandleSaveReconciliation.call(this);
    }
};
