/**
 * @file receipts.js
 * @description وحدة المقبوضات - تحتوي على عمليات إضافة وتحرير وحذف المقبوضات المختلفة
 */

const { ipcRenderer } = require('electron');
const DialogUtils = require('./dialog-utils');
const reconciliationCore = require('./reconciliation-core');
const { formatCurrency } = require('./utils');

class ReceiptsManager {
    constructor() {
        this.editingReceipt = null;
    }

    /**
     * إضافة مقبوضات بنكية
     * @param {Object} data - بيانات المقبوضات البنكية
     */
    async addBankReceipt(data) {
        console.log('💳 [BANK] بدء إضافة مقبوضات بنكية...');

        try {
            // التحقق من وجود تصفية حالية
            if (!reconciliationCore.currentReconciliation) {
                throw new Error('يرجى إنشاء تصفية أولاً');
            }

            // التحقق من البيانات المطلوبة
            if (!data.atmId && data.operationType !== 'تحويل') {
                throw new Error('يرجى اختيار الجهاز');
            }

            if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
                throw new Error('يرجى إدخال المبلغ بشكل صحيح');
            }

            // إضافة المقبوضات للمصفوفة
            const newReceipt = {
                ...data,
                reconciliation_id: reconciliationCore.currentReconciliation.id
            };

            reconciliationCore.bankReceipts.push(newReceipt);

            // تحديث العرض
            await this.updateBankReceiptsDisplay();

            console.log('✅ [BANK] تمت إضافة المقبوضات البنكية بنجاح');
            return true;

        } catch (error) {
            console.error('❌ [BANK] خطأ في إضافة المقبوضات البنكية:', error);
            throw error;
        }
    }

    /**
     * إضافة مقبوضات نقدية
     * @param {Object} data - بيانات المقبوضات النقدية
     */
    async addCashReceipt(data) {
        console.log('💵 [CASH] بدء إضافة مقبوضات نقدية...');

        try {
            // التحقق من وجود تصفية حالية
            if (!reconciliationCore.currentReconciliation) {
                throw new Error('يرجى إنشاء تصفية أولاً');
            }

            // التحقق من البيانات المطلوبة
            if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
                throw new Error('يرجى إدخال المبلغ بشكل صحيح');
            }

            // إضافة المقبوضات للمصفوفة
            const newReceipt = {
                ...data,
                total_amount: data.amount,
                reconciliation_id: reconciliationCore.currentReconciliation.id
            };

            reconciliationCore.cashReceipts.push(newReceipt);

            // تحديث العرض
            await this.updateCashReceiptsDisplay();

            console.log('✅ [CASH] تمت إضافة المقبوضات النقدية بنجاح');
            return true;

        } catch (error) {
            console.error('❌ [CASH] خطأ في إضافة المقبوضات النقدية:', error);
            throw error;
        }
    }

    /**
     * إضافة مبيعات آجلة
     * @param {Object} data - بيانات المبيعات الآجلة
     */
    async addPostpaidSale(data) {
        console.log('🏷️ [POSTPAID] بدء إضافة مبيعات آجلة...');

        try {
            // التحقق من وجود تصفية حالية
            if (!reconciliationCore.currentReconciliation) {
                throw new Error('يرجى إنشاء تصفية أولاً');
            }

            // التحقق من البيانات المطلوبة
            if (!data.customerName) {
                throw new Error('يرجى إدخال اسم العميل');
            }

            if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
                throw new Error('يرجى إدخال المبلغ بشكل صحيح');
            }

            // إضافة المبيعات للمصفوفة
            const newSale = {
                ...data,
                reconciliation_id: reconciliationCore.currentReconciliation.id
            };

            reconciliationCore.postpaidSales.push(newSale);

            // تحديث العرض
            await this.updatePostpaidSalesDisplay();

            console.log('✅ [POSTPAID] تمت إضافة المبيعات الآجلة بنجاح');
            return true;

        } catch (error) {
            console.error('❌ [POSTPAID] خطأ في إضافة المبيعات الآجلة:', error);
            throw error;
        }
    }

    /**
     * إضافة مقبوضات عملاء
     * @param {Object} data - بيانات مقبوضات العملاء
     */
    async addCustomerReceipt(data) {
        console.log('👥 [CUSTOMER] بدء إضافة مقبوضات عملاء...');

        try {
            // التحقق من وجود تصفية حالية
            if (!reconciliationCore.currentReconciliation) {
                throw new Error('يرجى إنشاء تصفية أولاً');
            }

            // التحقق من البيانات المطلوبة
            if (!data.customerName) {
                throw new Error('يرجى إدخال اسم العميل');
            }

            if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
                throw new Error('يرجى إدخال المبلغ بشكل صحيح');
            }

            // إضافة المقبوضات للمصفوفة
            const newReceipt = {
                ...data,
                reconciliation_id: reconciliationCore.currentReconciliation.id
            };

            reconciliationCore.customerReceipts.push(newReceipt);

            // تحديث العرض
            await this.updateCustomerReceiptsDisplay();

            console.log('✅ [CUSTOMER] تمت إضافة مقبوضات العملاء بنجاح');
            return true;

        } catch (error) {
            console.error('❌ [CUSTOMER] خطأ في إضافة مقبوضات العملاء:', error);
            throw error;
        }
    }

    /**
     * إضافة فاتورة مرتجع
     * @param {Object} data - بيانات فاتورة المرتجع
     */
    async addReturnInvoice(data) {
        console.log('🔄 [RETURN] بدء إضافة فاتورة مرتجع...');

        try {
            // التحقق من وجود تصفية حالية
            if (!reconciliationCore.currentReconciliation) {
                throw new Error('يرجى إنشاء تصفية أولاً');
            }

            // التحقق من البيانات المطلوبة
            if (!data.invoiceNumber) {
                throw new Error('يرجى إدخال رقم الفاتورة');
            }

            if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
                throw new Error('يرجى إدخال المبلغ بشكل صحيح');
            }

            // إضافة الفاتورة للمصفوفة
            const newInvoice = {
                ...data,
                reconciliation_id: reconciliationCore.currentReconciliation.id
            };

            reconciliationCore.returnInvoices.push(newInvoice);

            // تحديث العرض
            await this.updateReturnInvoicesDisplay();

            console.log('✅ [RETURN] تمت إضافة فاتورة المرتجع بنجاح');
            return true;

        } catch (error) {
            console.error('❌ [RETURN] خطأ في إضافة فاتورة المرتجع:', error);
            throw error;
        }
    }

    /**
     * إضافة بيانات مورد
     * @param {Object} data - بيانات المورد
     */
    async addSupplier(data) {
        console.log('🏭 [SUPPLIER] بدء إضافة بيانات مورد...');

        try {
            // التحقق من وجود تصفية حالية
            if (!reconciliationCore.currentReconciliation) {
                throw new Error('يرجى إنشاء تصفية أولاً');
            }

            // التحقق من البيانات المطلوبة
            if (!data.supplierName) {
                throw new Error('يرجى إدخال اسم المورد');
            }

            if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
                throw new Error('يرجى إدخال المبلغ بشكل صحيح');
            }

            // إضافة المورد للمصفوفة
            const newSupplier = {
                ...data,
                reconciliation_id: reconciliationCore.currentReconciliation.id
            };

            reconciliationCore.suppliers.push(newSupplier);

            // تحديث العرض
            await this.updateSuppliersDisplay();

            console.log('✅ [SUPPLIER] تمت إضافة بيانات المورد بنجاح');
            return true;

        } catch (error) {
            console.error('❌ [SUPPLIER] خطأ في إضافة بيانات المورد:', error);
            throw error;
        }
    }

    /**
     * تحديث عرض المقبوضات البنكية
     */
    async updateBankReceiptsDisplay() {
        const tableBody = document.getElementById('bankReceiptsTable');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        let total = 0;

        reconciliationCore.bankReceipts.forEach((receipt, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${receipt.operationType}</td>
                <td>${receipt.bankName || ''}</td>
                <td>${receipt.amount}</td>
                <td>${receipt.notes || ''}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editBankReceipt(${index})">
                        تعديل
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBankReceipt(${index})">
                        حذف
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
            total += parseFloat(receipt.amount || 0);
        });

        // تحديث الإجمالي
        const totalElement = document.getElementById('bankReceiptsTotal');
        if (totalElement) {
            totalElement.textContent = formatCurrency(total);
        }
    }

    /**
     * تحديث عرض المقبوضات النقدية
     */
    async updateCashReceiptsDisplay() {
        const tableBody = document.getElementById('cashReceiptsTable');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        let total = 0;

        reconciliationCore.cashReceipts.forEach((receipt, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${receipt.total_amount}</td>
                <td>${receipt.notes || ''}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editCashReceipt(${index})">
                        تعديل
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCashReceipt(${index})">
                        حذف
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
            total += parseFloat(receipt.total_amount || 0);
        });

        // تحديث الإجمالي
        const totalElement = document.getElementById('cashReceiptsTotal');
        if (totalElement) {
            totalElement.textContent = formatCurrency(total);
        }
    }

    /**
     * تحديث عرض المبيعات الآجلة
     */
    async updatePostpaidSalesDisplay() {
        const tableBody = document.getElementById('postpaidSalesTable');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        let total = 0;

        reconciliationCore.postpaidSales.forEach((sale, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${sale.customerName}</td>
                <td>${sale.amount}</td>
                <td>${sale.notes || ''}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editPostpaidSale(${index})">
                        تعديل
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deletePostpaidSale(${index})">
                        حذف
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
            total += parseFloat(sale.amount || 0);
        });

        // تحديث الإجمالي
        const totalElement = document.getElementById('postpaidSalesTotal');
        if (totalElement) {
            totalElement.textContent = formatCurrency(total);
        }
    }

    /**
     * تحديث عرض مقبوضات العملاء
     */
    async updateCustomerReceiptsDisplay() {
        const tableBody = document.getElementById('customerReceiptsTable');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        let total = 0;

        reconciliationCore.customerReceipts.forEach((receipt, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${receipt.customerName}</td>
                <td>${receipt.amount}</td>
                <td>${receipt.notes || ''}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editCustomerReceipt(${index})">
                        تعديل
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCustomerReceipt(${index})">
                        حذف
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
            total += parseFloat(receipt.amount || 0);
        });

        // تحديث الإجمالي
        const totalElement = document.getElementById('customerReceiptsTotal');
        if (totalElement) {
            totalElement.textContent = formatCurrency(total);
        }
    }

    /**
     * تحديث عرض فواتير المرتجع
     */
    async updateReturnInvoicesDisplay() {
        const tableBody = document.getElementById('returnInvoicesTable');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        let total = 0;

        reconciliationCore.returnInvoices.forEach((invoice, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${invoice.invoiceNumber}</td>
                <td>${invoice.amount}</td>
                <td>${invoice.notes || ''}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editReturnInvoice(${index})">
                        تعديل
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteReturnInvoice(${index})">
                        حذف
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
            total += parseFloat(invoice.amount || 0);
        });

        // تحديث الإجمالي
        const totalElement = document.getElementById('returnInvoicesTotal');
        if (totalElement) {
            totalElement.textContent = formatCurrency(total);
        }
    }

    /**
     * تحديث عرض الموردين
     */
    async updateSuppliersDisplay() {
        const tableBody = document.getElementById('suppliersTable');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        let total = 0;

        reconciliationCore.suppliers.forEach((supplier, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${supplier.supplierName}</td>
                <td>${supplier.amount}</td>
                <td>${supplier.notes || ''}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editSupplier(${index})">
                        تعديل
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSupplier(${index})">
                        حذف
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
            total += parseFloat(supplier.amount || 0);
        });

        // تحديث الإجمالي
        const totalElement = document.getElementById('suppliersTotal');
        if (totalElement) {
            totalElement.textContent = formatCurrency(total);
        }
    }

    /**
     * تحديث الملخص والمجاميع العامة
     */
    updateSummary() {
        const totals = reconciliationCore.calculateTotals();

        // تحديث المجاميع
        document.getElementById('summaryBankTotal').textContent = formatCurrency(totals.bankTotal);
        document.getElementById('summaryCashTotal').textContent = formatCurrency(totals.cashTotal);
        document.getElementById('summaryPostpaidTotal').textContent = formatCurrency(totals.postpaidTotal);
        document.getElementById('summaryCustomerTotal').textContent = formatCurrency(totals.customerTotal);
        document.getElementById('summaryReturnTotal').textContent = formatCurrency(totals.returnTotal);
        document.getElementById('summarySupplierTotal').textContent = formatCurrency(totals.suppliersTotal);
        document.getElementById('totalReceipts').textContent = formatCurrency(totals.totalReceipts);

        // تحديث الفائض/العجز
        const surplusDeficitElement = document.getElementById('surplusDeficit');
        if (surplusDeficitElement) {
            surplusDeficitElement.textContent = formatCurrency(totals.surplusDeficit);
            surplusDeficitElement.className = totals.surplusDeficit >= 0 ? 'text-success' : 'text-danger';
        }
    }
}

module.exports = new ReceiptsManager();