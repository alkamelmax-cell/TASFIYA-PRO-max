/**
 * @file print-export.js
 * @description وحدة الطباعة والتصدير - تحتوي على عمليات طباعة وتصدير التصفيات
 */

const { ipcRenderer } = require('electron');
const DialogUtils = require('./dialog-utils');
const reconciliationCore = require('./reconciliation-core');
const { formatDate, formatCurrency } = require('./utils');

class PrintExportManager {
    /**
     * طباعة التصفية الحالية
     * @param {Object} options - خيارات الطباعة
     */
    async printCurrentReconciliation(options = {}) {
        console.log('🖨️ [PRINT] طباعة التصفية الحالية...');

        try {
            // التحقق من وجود تصفية حالية
            if (!reconciliationCore.currentReconciliation) {
                throw new Error('لا توجد تصفية حالية للطباعة');
            }

            // التحقق من وجود بيانات للطباعة
            const hasData = reconciliationCore.bankReceipts.length > 0 ||
                          reconciliationCore.cashReceipts.length > 0 ||
                          reconciliationCore.postpaidSales.length > 0 ||
                          reconciliationCore.customerReceipts.length > 0 ||
                          reconciliationCore.returnInvoices.length > 0 ||
                          reconciliationCore.suppliers.length > 0;

            if (!hasData) {
                throw new Error('لا توجد بيانات مقبوضات أو مبيعات للطباعة');
            }

            // تحضير بيانات الطباعة
            const printData = await this.preparePrintData(options);

            // إنشاء معاينة الطباعة
            const result = await ipcRenderer.invoke('create-print-preview', printData);

            if (result.success) {
                DialogUtils.showSuccessToast('تم فتح معاينة الطباعة');
            } else {
                throw new Error(`فشل في فتح معاينة الطباعة: ${result.error}`);
            }

        } catch (error) {
            console.error('❌ [PRINT] خطأ في طباعة التصفية:', error);
            throw error;
        }
    }

    /**
     * تصدير التصفية الحالية إلى PDF
     * @param {Object} options - خيارات التصدير
     */
    async exportCurrentToPdf(options = {}) {
        console.log('📄 [PDF] تصدير التصفية الحالية إلى PDF...');

        try {
            // التحقق من وجود تصفية حالية
            if (!reconciliationCore.currentReconciliation) {
                throw new Error('لا توجد تصفية حالية للتصدير');
            }

            // تحضير بيانات الطباعة
            const printData = await this.preparePrintData(options);

            // تصدير إلى PDF
            const result = await ipcRenderer.invoke('export-pdf', {
                ...printData,
                filename: `reconciliation-${reconciliationCore.currentReconciliation.id}-${new Date().toISOString().split('T')[0]}.pdf`
            });

            if (result.success) {
                DialogUtils.showSuccessToast('تم تصدير PDF بنجاح');
            } else {
                throw new Error(`فشل في تصدير PDF: ${result.error}`);
            }

        } catch (error) {
            console.error('❌ [PDF] خطأ في تصدير PDF:', error);
            throw error;
        }
    }

    /**
     * تصدير التصفية الحالية إلى Excel
     * @param {Object} options - خيارات التصدير
     */
    async exportCurrentToExcel(options = {}) {
        console.log('📊 [EXCEL] تصدير التصفية الحالية إلى Excel...');

        try {
            // التحقق من وجود تصفية حالية
            if (!reconciliationCore.currentReconciliation) {
                throw new Error('لا توجد تصفية حالية للتصدير');
            }

            // تحضير بيانات Excel
            const excelData = this.prepareExcelData(options);

            // تصدير إلى Excel
            const result = await ipcRenderer.invoke('export-excel', {
                ...excelData,
                filename: `reconciliation-${reconciliationCore.currentReconciliation.id}-${new Date().toISOString().split('T')[0]}.xlsx`
            });

            if (result.success) {
                DialogUtils.showSuccessToast('تم تصدير Excel بنجاح');
            } else {
                throw new Error(`فشل في تصدير Excel: ${result.error}`);
            }

        } catch (error) {
            console.error('❌ [EXCEL] خطأ في تصدير Excel:', error);
            throw error;
        }
    }

    /**
     * تحضير بيانات الطباعة
     * @private
     * @param {Object} options - خيارات الطباعة
     */
    async preparePrintData(options = {}) {
        console.log('📋 [PREPARE] تحضير بيانات الطباعة...');

        try {
            const reconciliation = reconciliationCore.currentReconciliation;
            const totals = reconciliationCore.calculateTotals();

            // الحصول على اسم الشركة
            const companyName = await this.getCompanyName();

            // تحضير القالب
            const template = `
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="UTF-8">
                    <title>تصفية رقم ${reconciliation.id}</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            margin: 20px;
                            direction: rtl;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 30px;
                        }
                        .company-name {
                            font-size: 24px;
                            font-weight: bold;
                            margin-bottom: 5px;
                        }
                        .reconciliation-info {
                            margin-bottom: 20px;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 20px;
                        }
                        th, td {
                            border: 1px solid #ddd;
                            padding: 8px;
                            text-align: right;
                        }
                        th {
                            background-color: #f2f2f2;
                        }
                        .section-title {
                            margin-top: 20px;
                            margin-bottom: 10px;
                            font-weight: bold;
                        }
                        .summary {
                            margin-top: 30px;
                            padding: 15px;
                            background-color: #f8f9fa;
                            border-radius: 5px;
                        }
                        .text-success { color: green; }
                        .text-danger { color: red; }
                        @media print {
                            body { margin: 0; margin-bottom: 25mm; }
                            .page-break { page-break-before: always; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-name">${companyName}</div>
                        <h2>تصفية رقم ${reconciliation.id}</h2>
                        <p>تاريخ التصفية: ${formatDate(reconciliation.reconciliationDate)}</p>
                    </div>

                    <div class="reconciliation-info">
                        <p><strong>الكاشير:</strong> ${reconciliation.cashierName}</p>
                        <p><strong>المحاسب:</strong> ${reconciliation.accountantName}</p>
                        <p><strong>التاريخ والوقت:</strong> ${formatDate(reconciliation.reconciliationDate)}</p>
                        ${reconciliation.timeRangeStart ? `<p><strong>نطاق الوقت:</strong> ${reconciliation.timeRangeStart} - ${reconciliation.timeRangeEnd}</p>` : ''}
                        ${reconciliation.filterNotes ? `<p><strong>ملاحظات:</strong> ${reconciliation.filterNotes}</p>` : ''}
                    </div>

                    ${options.showBankReceipts && reconciliationCore.bankReceipts.length > 0 ? `
                        <div class="section-title">المقبوضات البنكية</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>نوع العملية</th>
                                    <th>البنك</th>
                                    <th>المبلغ</th>
                                    <th>ملاحظات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${reconciliationCore.bankReceipts.map((receipt, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td>${receipt.operationType}</td>
                                        <td>${receipt.bankName || ''}</td>
                                        <td>${formatCurrency(receipt.amount)}</td>
                                        <td>${receipt.notes || ''}</td>
                                    </tr>
                                `).join('')}
                                <tr>
                                    <td colspan="3">الإجمالي</td>
                                    <td colspan="2">${formatCurrency(totals.bankTotal)}</td>
                                </tr>
                            </tbody>
                        </table>
                    ` : ''}

                    ${/* صناعة جداول مشابهة لباقي الأنواع */ ''}

                    <div class="summary">
                        <h3>الملخص</h3>
                        <p><strong>مبيعات النظام:</strong> ${formatCurrency(reconciliation.systemSales)}</p>
                        <p><strong>إجمالي المقبوضات:</strong> ${formatCurrency(totals.totalReceipts)}</p>
                        <p><strong>الفائض/العجز:</strong> <span class="${totals.surplusDeficit >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(totals.surplusDeficit)}</span></p>
                    </div>
                </body>
                </html>
            `;

            return {
                html: template,
                title: `تصفية رقم ${reconciliation.id}`,
                isColorPrint: options.color !== false
            };

        } catch (error) {
            console.error('❌ [PREPARE] خطأ في تحضير بيانات الطباعة:', error);
            throw error;
        }
    }

    /**
     * تحضير بيانات Excel
     * @private
     * @param {Object} options - خيارات التصدير
     */
    prepareExcelData(options = {}) {
        console.log('📊 [EXCEL] تحضير بيانات Excel...');

        try {
            const reconciliation = reconciliationCore.currentReconciliation;
            const sheets = [];

            // إضافة صفحة المقبوضات البنكية
            if (options.showBankReceipts && reconciliationCore.bankReceipts.length > 0) {
                sheets.push({
                    name: 'المقبوضات البنكية',
                    headers: ['#', 'نوع العملية', 'البنك', 'المبلغ', 'ملاحظات'],
                    rows: reconciliationCore.bankReceipts.map((receipt, index) => [
                        index + 1,
                        receipt.operationType,
                        receipt.bankName || '',
                        receipt.amount,
                        receipt.notes || ''
                    ])
                });
            }

            // إضافة صفحات مشابهة لباقي الأنواع

            // إضافة صفحة الملخص
            const totals = reconciliationCore.calculateTotals();
            sheets.push({
                name: 'الملخص',
                headers: ['البند', 'القيمة'],
                rows: [
                    ['مبيعات النظام', reconciliation.systemSales],
                    ['إجمالي المقبوضات البنكية', totals.bankTotal],
                    ['إجمالي المقبوضات النقدية', totals.cashTotal],
                    ['إجمالي المبيعات الآجلة', totals.postpaidTotal],
                    ['إجمالي مقبوضات العملاء', totals.customerTotal],
                    ['إجمالي فواتير المرتجع', totals.returnTotal],
                    ['إجمالي المقبوضات', totals.totalReceipts],
                    ['الفائض/العجز', totals.surplusDeficit]
                ]
            });

            return {
                sheets,
                title: `تصفية رقم ${reconciliation.id}`
            };

        } catch (error) {
            console.error('❌ [EXCEL] خطأ في تحضير بيانات Excel:', error);
            throw error;
        }
    }

    /**
     * الحصول على اسم الشركة
     * @private
     */
    async getCompanyName() {
        try {
            const settings = await ipcRenderer.invoke('get-settings');
            return settings.companyName || 'شركة المثال التجارية';
        } catch (error) {
            console.warn('⚠️ [COMPANY] تعذر جلب اسم الشركة:', error);
            return 'شركة المثال التجارية';
        }
    }
}

module.exports = new PrintExportManager();