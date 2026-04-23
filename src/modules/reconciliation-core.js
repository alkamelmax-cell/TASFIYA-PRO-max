/**
 * @file reconciliation-core.js
 * @description وحدة التصفيات الأساسية - تحتوي على العمليات الأساسية للتصفيات
 */

const { ipcRenderer } = require('electron');
const DialogUtils = require('./dialog-utils');
const { formatDate, formatCurrency } = require('./utils');

class ReconciliationCore {
    constructor() {
        // البيانات الحالية للتصفية
        this.currentReconciliation = null;
        this.bankReceipts = [];
        this.cashReceipts = [];
        this.postpaidSales = [];
        this.customerReceipts = [];
        this.returnInvoices = [];
        this.suppliers = [];

        // حالة التعديل
        this.editMode = {
            isActive: false,
            reconciliationId: null,
            originalData: null
        };
    }

    /**
     * إنشاء تصفية جديدة
     * @param {Object} data - بيانات التصفية
     * @returns {Promise<Object>} التصفية المنشأة
     */
    async createNewReconciliation(data) {
        console.log('🆕 [CREATE] بدء إنشاء تصفية جديدة...');

        try {
            // التحقق من البيانات المطلوبة
            if (!data.cashierId || !data.accountantId || !data.reconciliationDate) {
                throw new Error('جميع الحقول المطلوبة لم يتم تعبئتها');
            }

            const reconciliation = await ipcRenderer.invoke('create-reconciliation', {
                cashierId: data.cashierId,
                accountantId: data.accountantId,
                reconciliationDate: data.reconciliationDate,
                timeRangeStart: data.timeRangeStart || null,
                timeRangeEnd: data.timeRangeEnd || null,
                filterNotes: data.filterNotes || null,
                systemSales: data.systemSales || 0
            });

            this.currentReconciliation = reconciliation;

            console.log('✅ [CREATE] تم إنشاء التصفية بنجاح:', reconciliation);
            return reconciliation;

        } catch (error) {
            console.error('❌ [CREATE] خطأ في إنشاء التصفية:', error);
            throw error;
        }
    }

    /**
     * تحميل بيانات تصفية
     * @param {number} reconciliationId - معرف التصفية
     * @returns {Promise<Object>} بيانات التصفية
     */
    async loadReconciliation(reconciliationId) {
        console.log('📂 [LOAD] تحميل بيانات التصفية:', reconciliationId);

        try {
            const data = await ipcRenderer.invoke('get-reconciliation-for-edit', reconciliationId);
            
            if (!data || !data.reconciliation) {
                throw new Error('لم يتم العثور على التصفية المطلوبة');
            }

            this.currentReconciliation = data.reconciliation;
            this.bankReceipts = data.bankReceipts || [];
            this.cashReceipts = data.cashReceipts || [];
            this.postpaidSales = data.postpaidSales || [];
            this.customerReceipts = data.customerReceipts || [];
            this.returnInvoices = data.returnInvoices || [];
            this.suppliers = data.suppliers || [];

            console.log('✅ [LOAD] تم تحميل بيانات التصفية بنجاح');
            return data;

        } catch (error) {
            console.error('❌ [LOAD] خطأ في تحميل التصفية:', error);
            throw error;
        }
    }

    /**
     * حفظ التصفية
     * @param {boolean} isComplete - هل التصفية مكتملة؟
     * @returns {Promise<Object>} نتيجة الحفظ
     */
    async saveReconciliation(isComplete = false) {
        console.log('💾 [SAVE] بدء حفظ التصفية...');

        try {
            if (!this.currentReconciliation) {
                throw new Error('لا توجد تصفية حالية للحفظ');
            }

            // التحقق من صحة البيانات
            const validation = this.validateReconciliationBeforeSave();
            if (!validation.isValid) {
                throw new Error('خطأ في التحقق من البيانات:\n' + validation.errors.join('\n'));
            }

            // حساب المجاميع
            const totals = this.calculateTotals();

            // تحضير البيانات للحفظ
            const saveData = {
                reconciliation: {
                    ...this.currentReconciliation,
                    status: isComplete ? 'completed' : 'draft',
                    total_receipts: totals.totalReceipts,
                    surplus_deficit: totals.surplusDeficit
                },
                bankReceipts: this.bankReceipts,
                cashReceipts: this.cashReceipts,
                postpaidSales: this.postpaidSales,
                customerReceipts: this.customerReceipts,
                returnInvoices: this.returnInvoices,
                suppliers: this.suppliers
            };

            // حفظ البيانات
            const result = await ipcRenderer.invoke('save-reconciliation', saveData);

            console.log('✅ [SAVE] تم حفظ التصفية بنجاح:', result);
            return result;

        } catch (error) {
            console.error('❌ [SAVE] خطأ في حفظ التصفية:', error);
            throw error;
        }
    }

    /**
     * حذف تصفية
     * @param {number} reconciliationId - معرف التصفية المراد حذفها
     * @returns {Promise<boolean>} نجاح العملية
     */
    async deleteReconciliation(reconciliationId) {
        console.log('🗑️ [DELETE] بدء حذف التصفية:', reconciliationId);

        try {
            // التأكد من وجود التصفية
            const reconciliation = await ipcRenderer.invoke('db-get', `
                SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
                FROM reconciliations r
                JOIN cashiers c ON r.cashier_id = c.id
                JOIN accountants a ON r.accountant_id = a.id
                WHERE r.id = ?
            `, [reconciliationId]);

            if (!reconciliation) {
                throw new Error('التصفية غير موجودة');
            }

            // طلب تأكيد الحذف
            const reconciliationDisplay = reconciliation.reconciliation_number ? 
                `#${reconciliation.reconciliation_number}` : '(مسودة)';
            const confirmMessage = `هل أنت متأكد من أنك تريد حذف التصفية رقم ${reconciliationDisplay}؟\n\n` +
                `الكاشير: ${reconciliation.cashier_name} (${reconciliation.cashier_number})\n` +
                `التاريخ: ${formatDate(reconciliation.reconciliation_date)}\n\n` +
                `⚠️ تحذير: هذا الإجراء لا يمكن التراجع عنه!`;

            const confirmed = await DialogUtils.showConfirm(confirmMessage, 'تأكيد الحذف');

            if (!confirmed) {
                console.log('ℹ️ [DELETE] تم إلغاء عملية الحذف من قبل المستخدم');
                return false;
            }

            // حذف جميع السجلات المرتبطة
            await ipcRenderer.invoke('db-run', 'DELETE FROM bank_receipts WHERE reconciliation_id = ?', [reconciliationId]);
            await ipcRenderer.invoke('db-run', 'DELETE FROM cash_receipts WHERE reconciliation_id = ?', [reconciliationId]);
            await ipcRenderer.invoke('db-run', 'DELETE FROM postpaid_sales WHERE reconciliation_id = ?', [reconciliationId]);
            await ipcRenderer.invoke('db-run', 'DELETE FROM customer_receipts WHERE reconciliation_id = ?', [reconciliationId]);
            await ipcRenderer.invoke('db-run', 'DELETE FROM return_invoices WHERE reconciliation_id = ?', [reconciliationId]);
            await ipcRenderer.invoke('db-run', 'DELETE FROM suppliers WHERE reconciliation_id = ?', [reconciliationId]);
            await ipcRenderer.invoke(
                'db-run',
                'DELETE FROM cashbox_vouchers WHERE source_reconciliation_id = ? AND COALESCE(is_auto_generated, 0) = 1',
                [reconciliationId]
            );
            await ipcRenderer.invoke('db-run', 'DELETE FROM reconciliations WHERE id = ?', [reconciliationId]);

            console.log('✅ [DELETE] تم حذف التصفية بنجاح');
            return true;

        } catch (error) {
            console.error('❌ [DELETE] خطأ في حذف التصفية:', error);
            throw error;
        }
    }

    /**
     * التحقق من صحة بيانات التصفية قبل الحفظ
     * @returns {Object} نتيجة التحقق
     */
    validateReconciliationBeforeSave() {
        console.log('✅ [VALIDATE] فحص صحة بيانات التصفية قبل الحفظ...');

        const errors = [];

        // التحقق من وجود تصفية
        if (!this.currentReconciliation) {
            errors.push('لا توجد تصفية حالية');
        }

        // التحقق من البيانات الأساسية
        if (!this.currentReconciliation?.cashierId) {
            errors.push('يرجى اختيار الكاشير');
        }

        if (!this.currentReconciliation?.accountantId) {
            errors.push('يرجى اختيار المحاسب');
        }

        if (!this.currentReconciliation?.reconciliationDate) {
            errors.push('يرجى تحديد تاريخ التصفية');
        }

        // التحقق من وجود بيانات للحفظ
        const hasData = this.bankReceipts.length > 0 ||
                       this.cashReceipts.length > 0 ||
                       this.postpaidSales.length > 0 ||
                       this.customerReceipts.length > 0 ||
                       this.returnInvoices.length > 0 ||
                       this.suppliers.length > 0;

        if (!hasData) {
            errors.push('لا توجد بيانات مقبوضات أو مبيعات للحفظ');
        }

        // التحقق من مبيعات النظام
        const systemSales = parseFloat(this.currentReconciliation?.systemSales || 0);
        if (isNaN(systemSales) || systemSales < 0) {
            errors.push('يرجى إدخال مبيعات النظام بشكل صحيح');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * حساب المجاميع
     * @returns {Object} المجاميع المحسوبة
     */
    calculateTotals() {
        const bankTotal = this.bankReceipts.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
        const cashTotal = this.cashReceipts.reduce((sum, item) => sum + parseFloat(item.total_amount || 0), 0);
        const postpaidTotal = this.postpaidSales.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
        const customerTotal = this.customerReceipts.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
        const returnTotal = this.returnInvoices.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
        const suppliersTotal = this.suppliers.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);

        const totalReceipts = bankTotal + cashTotal + postpaidTotal + customerTotal + returnTotal + suppliersTotal;
        const systemSales = parseFloat(this.currentReconciliation?.systemSales || 0);
        const surplusDeficit = totalReceipts - systemSales;

        return {
            bankTotal,
            cashTotal,
            postpaidTotal,
            customerTotal,
            returnTotal,
            suppliersTotal,
            totalReceipts,
            systemSales,
            surplusDeficit
        };
    }

    /**
     * مسح بيانات التصفية الحالية
     */
    clearCurrentReconciliation() {
        this.currentReconciliation = null;
        this.bankReceipts = [];
        this.cashReceipts = [];
        this.postpaidSales = [];
        this.customerReceipts = [];
        this.returnInvoices = [];
        this.suppliers = [];
    }
}

module.exports = new ReconciliationCore();
