/**
 * @file receipts.js
 * @description وحدة المقبوضات - تحتوي على عمليات إضافة وتحرير وحذف المقبوضات المختلفة
 */

const DialogUtils = require('./dialog-utils');
const reconciliationCore = require('./reconciliation-core');
const { formatCurrency } = require('./utils');

class ReceiptsManager {
    constructor() {
        this.editingReceipt = null;
        this.bindGlobalHandlers();
    }

    /**
     * ربط دوال الإجراءات العامة لتجنب أخطاء onclick غير المعرفة
     */
    bindGlobalHandlers() {
        if (typeof window === 'undefined') {
            return;
        }

        if (typeof window.editBankReceipt !== 'function') {
            window.editBankReceipt = (index) => this.runSafely(() => this.editBankReceipt(index));
        }
        if (typeof window.deleteBankReceipt !== 'function') {
            window.deleteBankReceipt = (index) => this.runSafely(() => this.deleteBankReceipt(index));
        }
        if (typeof window.editCashReceipt !== 'function') {
            window.editCashReceipt = (index) => this.runSafely(() => this.editCashReceipt(index));
        }
        if (typeof window.deleteCashReceipt !== 'function') {
            window.deleteCashReceipt = (index) => this.runSafely(() => this.deleteCashReceipt(index));
        }
        if (typeof window.editPostpaidSale !== 'function') {
            window.editPostpaidSale = (index) => this.runSafely(() => this.editPostpaidSale(index));
        }
        if (typeof window.deletePostpaidSale !== 'function') {
            window.deletePostpaidSale = (index) => this.runSafely(() => this.deletePostpaidSale(index));
        }
        if (typeof window.editCustomerReceipt !== 'function') {
            window.editCustomerReceipt = (index) => this.runSafely(() => this.editCustomerReceipt(index));
        }
        if (typeof window.deleteCustomerReceipt !== 'function') {
            window.deleteCustomerReceipt = (index) => this.runSafely(() => this.deleteCustomerReceipt(index));
        }
        if (typeof window.editReturnInvoice !== 'function') {
            window.editReturnInvoice = (index) => this.runSafely(() => this.editReturnInvoice(index));
        }
        if (typeof window.deleteReturnInvoice !== 'function') {
            window.deleteReturnInvoice = (index) => this.runSafely(() => this.deleteReturnInvoice(index));
        }
        if (typeof window.editSupplier !== 'function') {
            window.editSupplier = (index) => this.runSafely(() => this.editSupplier(index));
        }
        if (typeof window.deleteSupplier !== 'function') {
            window.deleteSupplier = (index) => this.runSafely(() => this.deleteSupplier(index));
        }
    }

    runSafely(action) {
        Promise.resolve(action()).catch((error) => {
            this.handleActionError(error);
        });
    }

    handleActionError(error) {
        const message = error?.message || 'حدث خطأ غير متوقع';
        console.error('❌ [RECEIPTS] إجراء فشل:', error);
        if (typeof DialogUtils.showErrorToast === 'function') {
            DialogUtils.showErrorToast(message);
        }
    }

    getItemByIndex(items, index, itemLabel) {
        const safeIndex = parseInt(index, 10);
        if (isNaN(safeIndex) || safeIndex < 0 || safeIndex >= items.length) {
            throw new Error(`تعذر العثور على ${itemLabel}`);
        }
        return { item: items[safeIndex], safeIndex };
    }

    async editCollectionItem(items, index, itemLabel, fields, refreshFn) {
        const { item, safeIndex } = this.getItemByIndex(items, index, itemLabel);

        if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
            throw new Error('ميزة التعديل غير متاحة في هذا السياق');
        }

        const updatedItem = { ...item };

        for (const field of fields) {
            const currentValue = updatedItem[field.key] ?? '';
            const raw = window.prompt(`تعديل ${field.label}:`, String(currentValue));

            if (raw === null) {
                return false;
            }

            const value = field.transform ? field.transform(raw) : raw;
            if (field.validate && !field.validate(value)) {
                throw new Error(field.errorMessage || `قيمة ${field.label} غير صحيحة`);
            }

            updatedItem[field.key] = value;
        }

        items[safeIndex] = updatedItem;
        await refreshFn();
        this.updateSummary();

        if (typeof DialogUtils.showSuccessToast === 'function') {
            DialogUtils.showSuccessToast(`تم تعديل ${itemLabel} بنجاح`);
        }

        return true;
    }

    async deleteCollectionItem(items, index, itemLabel, refreshFn) {
        const { safeIndex } = this.getItemByIndex(items, index, itemLabel);

        let confirmed = true;
        if (typeof DialogUtils.showConfirm === 'function') {
            confirmed = await DialogUtils.showConfirm(`هل تريد حذف ${itemLabel}؟`, 'تأكيد الحذف');
        }

        if (!confirmed) {
            return false;
        }

        items.splice(safeIndex, 1);
        await refreshFn();
        this.updateSummary();

        if (typeof DialogUtils.showSuccessToast === 'function') {
            DialogUtils.showSuccessToast(`تم حذف ${itemLabel} بنجاح`);
        }

        return true;
    }

    parseAmount(value) {
        const amount = parseFloat(value);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
        }
        return amount;
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

    async editBankReceipt(index) {
        return this.editCollectionItem(
            reconciliationCore.bankReceipts,
            index,
            'المقبوضة البنكية',
            [
                { key: 'operationType', label: 'نوع العملية', validate: (value) => String(value).trim().length > 0 },
                { key: 'bankName', label: 'اسم البنك' },
                {
                    key: 'amount',
                    label: 'المبلغ',
                    transform: (value) => this.parseAmount(value),
                    validate: (value) => !isNaN(parseFloat(value))
                },
                { key: 'notes', label: 'ملاحظات' }
            ],
            () => this.updateBankReceiptsDisplay()
        );
    }

    async deleteBankReceipt(index) {
        return this.deleteCollectionItem(
            reconciliationCore.bankReceipts,
            index,
            'المقبوضة البنكية',
            () => this.updateBankReceiptsDisplay()
        );
    }

    async editCashReceipt(index) {
        return this.editCollectionItem(
            reconciliationCore.cashReceipts,
            index,
            'المقبوضة النقدية',
            [
                {
                    key: 'total_amount',
                    label: 'المبلغ',
                    transform: (value) => this.parseAmount(value),
                    validate: (value) => !isNaN(parseFloat(value))
                },
                { key: 'notes', label: 'ملاحظات' }
            ],
            () => this.updateCashReceiptsDisplay()
        );
    }

    async deleteCashReceipt(index) {
        return this.deleteCollectionItem(
            reconciliationCore.cashReceipts,
            index,
            'المقبوضة النقدية',
            () => this.updateCashReceiptsDisplay()
        );
    }

    async editPostpaidSale(index) {
        return this.editCollectionItem(
            reconciliationCore.postpaidSales,
            index,
            'المبيعة الآجلة',
            [
                { key: 'customerName', label: 'اسم العميل', validate: (value) => String(value).trim().length > 0 },
                {
                    key: 'amount',
                    label: 'المبلغ',
                    transform: (value) => this.parseAmount(value),
                    validate: (value) => !isNaN(parseFloat(value))
                },
                { key: 'notes', label: 'ملاحظات' }
            ],
            () => this.updatePostpaidSalesDisplay()
        );
    }

    async deletePostpaidSale(index) {
        return this.deleteCollectionItem(
            reconciliationCore.postpaidSales,
            index,
            'المبيعة الآجلة',
            () => this.updatePostpaidSalesDisplay()
        );
    }

    async editCustomerReceipt(index) {
        return this.editCollectionItem(
            reconciliationCore.customerReceipts,
            index,
            'مقبوض العميل',
            [
                { key: 'customerName', label: 'اسم العميل', validate: (value) => String(value).trim().length > 0 },
                {
                    key: 'amount',
                    label: 'المبلغ',
                    transform: (value) => this.parseAmount(value),
                    validate: (value) => !isNaN(parseFloat(value))
                },
                { key: 'paymentType', label: 'نوع الدفع' },
                { key: 'notes', label: 'ملاحظات' }
            ],
            () => this.updateCustomerReceiptsDisplay()
        );
    }

    async deleteCustomerReceipt(index) {
        return this.deleteCollectionItem(
            reconciliationCore.customerReceipts,
            index,
            'مقبوض العميل',
            () => this.updateCustomerReceiptsDisplay()
        );
    }

    async editReturnInvoice(index) {
        return this.editCollectionItem(
            reconciliationCore.returnInvoices,
            index,
            'فاتورة المرتجع',
            [
                { key: 'invoiceNumber', label: 'رقم الفاتورة', validate: (value) => String(value).trim().length > 0 },
                {
                    key: 'amount',
                    label: 'المبلغ',
                    transform: (value) => this.parseAmount(value),
                    validate: (value) => !isNaN(parseFloat(value))
                },
                { key: 'notes', label: 'ملاحظات' }
            ],
            () => this.updateReturnInvoicesDisplay()
        );
    }

    async deleteReturnInvoice(index) {
        return this.deleteCollectionItem(
            reconciliationCore.returnInvoices,
            index,
            'فاتورة المرتجع',
            () => this.updateReturnInvoicesDisplay()
        );
    }

    async editSupplier(index) {
        return this.editCollectionItem(
            reconciliationCore.suppliers,
            index,
            'المورد',
            [
                { key: 'supplierName', label: 'اسم المورد', validate: (value) => String(value).trim().length > 0 },
                {
                    key: 'amount',
                    label: 'المبلغ',
                    transform: (value) => this.parseAmount(value),
                    validate: (value) => !isNaN(parseFloat(value))
                },
                { key: 'notes', label: 'ملاحظات' }
            ],
            () => this.updateSuppliersDisplay()
        );
    }

    async deleteSupplier(index) {
        return this.deleteCollectionItem(
            reconciliationCore.suppliers,
            index,
            'المورد',
            () => this.updateSuppliersDisplay()
        );
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
