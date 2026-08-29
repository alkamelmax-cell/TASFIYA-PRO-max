/**
 * @file printing.js
 * @description وحدة الطباعة - تحتوي على عمليات الطباعة وتوليد المستندات
 */

const { ipcRenderer } = require('electron');
const path = require('path');
const DialogUtils = require('./dialog-utils');
const ConfigManager = require('./config');
const { formatDate, formatCurrency } = require('./utils');

class PrintManager {
    constructor() {
        this.printers = [];
        this.defaultPrinter = null;
        this.templates = new Map();
        this.initialized = false;
    }

    /**
     * تهيئة مدير الطباعة
     */
    async initialize() {
        console.log('🖨️ [PRINT] تهيئة مدير الطباعة...');

        try {
            // تحميل الطابعات
            await this.loadPrinters();

            // تحميل القوالب
            await this.loadTemplates();

            this.initialized = true;
            console.log('✅ [PRINT] تم تهيئة مدير الطباعة بنجاح');

        } catch (error) {
            console.error('❌ [PRINT] خطأ في تهيئة مدير الطباعة:', error);
            throw error;
        }
    }

    /**
     * تحميل الطابعات
     * @private
     */
    async loadPrinters() {
        try {
            // جلب قائمة الطابعات
            this.printers = await ipcRenderer.invoke('get-printers');

            // تعيين الطابعة الافتراضية
            this.defaultPrinter = ConfigManager.get('printing.defaultPrinter') ||
                                this.printers.find(p => p.isDefault)?.name;

            console.log('📝 [PRINT] تم تحميل الطابعات:', this.printers.length);

        } catch (error) {
            console.error('❌ [PRINT] خطأ في تحميل الطابعات:', error);
            throw error;
        }
    }

    /**
     * تحميل قوالب الطباعة
     * @private
     */
    async loadTemplates() {
        try {
            const templatesDir = path.join(process.env.APPDATA, 'تصفية برو', 'templates');
            const templates = await ipcRenderer.invoke('read-directory', templatesDir);

            this.templates.clear();
            for (const file of templates) {
                if (file.endsWith('.html')) {
                    const name = path.basename(file, '.html');
                    const content = await ipcRenderer.invoke('read-file', path.join(templatesDir, file));
                    this.templates.set(name, content);
                }
            }

            console.log('📝 [PRINT] تم تحميل القوالب:', this.templates.size);

        } catch (error) {
            console.error('❌ [PRINT] خطأ في تحميل القوالب:', error);
            throw error;
        }
    }

    /**
     * طباعة تصفية
     * @param {Object} reconciliation - بيانات التصفية
     */
    async printReconciliation(reconciliation) {
        console.log('🖨️ [PRINT] طباعة تصفية:', reconciliation.id);

        try {
            // التحقق من حالة التصفية
            if (reconciliation.status !== 'completed') {
                throw new Error('لا يمكن طباعة تصفية غير مكتملة');
            }

            // التأكيد قبل الطباعة
            if (ConfigManager.get('ui.confirmBeforePrint')) {
                const confirmed = await DialogUtils.showConfirm(
                    'طباعة التصفية',
                    'هل تريد طباعة التصفية؟'
                );

                if (!confirmed) {
                    console.log('ℹ️ [PRINT] تم إلغاء الطباعة');
                    return;
                }
            }

            DialogUtils.showLoading('جاري تحضير الطباعة...', 'يرجى الانتظار');

            // جلب بيانات التصفية الكاملة
            const data = await this.getReconciliationData(reconciliation.id);

            // تجهيز بيانات القالب
            const templateData = this.prepareReconciliationTemplate(data);

            // توليد HTML
            const html = await this.generateReconciliationHtml(templateData);

            // طباعة المستند
            await this.printHtml(html, {
                title: `تصفية رقم ${reconciliation.id}`,
                printer: this.defaultPrinter,
                copies: 1
            });

            console.log('✅ [PRINT] تم طباعة التصفية بنجاح');
            DialogUtils.showSuccessToast('تم طباعة التصفية بنجاح');

        } catch (error) {
            console.error('❌ [PRINT] خطأ في طباعة التصفية:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * طباعة كشف حساب
     * @param {Object} statement - بيانات الكشف
     */
    async printStatement(statement) {
        console.log('🖨️ [PRINT] طباعة كشف حساب:', statement.id);

        try {
            // التأكيد قبل الطباعة
            if (ConfigManager.get('ui.confirmBeforePrint')) {
                const confirmed = await DialogUtils.showConfirm(
                    'طباعة كشف الحساب',
                    'هل تريد طباعة كشف الحساب؟'
                );

                if (!confirmed) {
                    console.log('ℹ️ [PRINT] تم إلغاء الطباعة');
                    return;
                }
            }

            DialogUtils.showLoading('جاري تحضير الطباعة...', 'يرجى الانتظار');

            // جلب بيانات الكشف الكاملة
            const data = await this.getStatementData(statement.id);

            // تجهيز بيانات القالب
            const templateData = this.prepareStatementTemplate(data);

            // توليد HTML
            const html = await this.generateStatementHtml(templateData);

            // طباعة المستند
            await this.printHtml(html, {
                title: `كشف حساب ${data.customerName}`,
                printer: this.defaultPrinter,
                copies: 1
            });

            console.log('✅ [PRINT] تم طباعة الكشف بنجاح');
            DialogUtils.showSuccessToast('تم طباعة الكشف بنجاح');

        } catch (error) {
            console.error('❌ [PRINT] خطأ في طباعة الكشف:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * طباعة تقرير
     * @param {string} reportType - نوع التقرير
     * @param {Object} data - بيانات التقرير
     * @param {Object} options - خيارات الطباعة
     */
    async printReport(reportType, data, options = {}) {
        console.log('🖨️ [PRINT] طباعة تقرير:', reportType);

        try {
            // التأكيد قبل الطباعة
            if (ConfigManager.get('ui.confirmBeforePrint')) {
                const confirmed = await DialogUtils.showConfirm(
                    'طباعة التقرير',
                    'هل تريد طباعة التقرير؟'
                );

                if (!confirmed) {
                    console.log('ℹ️ [PRINT] تم إلغاء الطباعة');
                    return;
                }
            }

            DialogUtils.showLoading('جاري تحضير الطباعة...', 'يرجى الانتظار');

            // التحقق من وجود القالب
            if (!this.templates.has(reportType)) {
                throw new Error('قالب التقرير غير موجود');
            }

            // تجهيز بيانات القالب
            const templateData = this.prepareReportTemplate(reportType, data, options);

            // توليد HTML
            const html = await this.generateReportHtml(templateData);

            // طباعة المستند
            await this.printHtml(html, {
                title: templateData.title,
                printer: options.printer || this.defaultPrinter,
                copies: options.copies || 1,
                paperSize: options.paperSize || ConfigManager.get('printing.paperSize'),
                orientation: options.orientation || ConfigManager.get('printing.orientation')
            });

            console.log('✅ [PRINT] تم طباعة التقرير بنجاح');
            DialogUtils.showSuccessToast('تم طباعة التقرير بنجاح');

        } catch (error) {
            console.error('❌ [PRINT] خطأ في طباعة التقرير:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * طباعة HTML
     * @private
     * @param {string} html - محتوى HTML
     * @param {Object} options - خيارات الطباعة
     */
    async printHtml(html, options = {}) {
        try {
            // إضافة CSS الطباعة
            const printCss = await this.getPrintCss();
            const printHtml = this.injectPrintCss(html, printCss);

            // تجهيز خيارات الطباعة
            const printOptions = {
                silent: true,
                printBackground: true,
                deviceName: options.printer || this.defaultPrinter,
                pageSize: options.paperSize || ConfigManager.get('printing.paperSize'),
                landscape: options.orientation === 'landscape',
                margins: ConfigManager.get('printing.margins'),
                copies: options.copies || 1,
                header: options.header !== false && ConfigManager.get('printing.header'),
                footer: options.footer !== false && ConfigManager.get('printing.footer'),
                ...options
            };

            // طباعة المستند
            await ipcRenderer.invoke('print-html', {
                html: printHtml,
                options: printOptions
            });

        } catch (error) {
            console.error('❌ [PRINT] خطأ في طباعة HTML:', error);
            throw error;
        }
    }

    /**
     * جلب CSS الطباعة
     * @private
     */
    async getPrintCss() {
        try {
            const cssPath = path.join(process.env.APPDATA, 'تصفية برو', 'templates', 'print.css');
            return await ipcRenderer.invoke('read-file', cssPath);
        } catch (error) {
            console.error('❌ [PRINT] خطأ في قراءة CSS الطباعة:', error);
            return '';
        }
    }

    /**
     * حقن CSS الطباعة
     * @private
     * @param {string} html - محتوى HTML
     * @param {string} css - محتوى CSS
     */
    injectPrintCss(html, css) {
        return html.replace('</head>', `<style>${css}</style></head>`);
    }

    /**
     * جلب بيانات التصفية
     * @private
     * @param {number} reconciliationId - معرف التصفية
     */
    async getReconciliationData(reconciliationId) {
        try {
            return await ipcRenderer.invoke('db-get', `
                SELECT r.*, c.name as cashier_name, c.cashier_number,
                       a.name as accountant_name, b.branch_name,
                       GROUP_CONCAT(rc.amount || ',' || rc.receipt_type || ',' ||
                                  COALESCE(rc.card_number, '') || ',' ||
                                  COALESCE(rc.cheque_number, '') || ',' ||
                                  COALESCE(rc.bank_name, '') || ',' ||
                                  COALESCE(rc.reference_number, '')
                                  , '|') as receipts
                FROM reconciliations r
                JOIN cashiers c ON r.cashier_id = c.id
                JOIN accountants a ON r.accountant_id = a.id
                LEFT JOIN branches b ON c.branch_id = b.id
                LEFT JOIN receipts rc ON r.id = rc.reconciliation_id
                WHERE r.id = ?
                GROUP BY r.id
            `, [reconciliationId]);
        } catch (error) {
            console.error('❌ [PRINT] خطأ في جلب بيانات التصفية:', error);
            throw error;
        }
    }

    /**
     * تجهيز بيانات قالب التصفية
     * @private
     * @param {Object} data - بيانات التصفية
     */
    prepareReconciliationTemplate(data) {
        // تحليل الإيصالات
        const receipts = data.receipts ? data.receipts.split('|').map(r => {
            const [amount, type, cardNumber, chequeNumber, bankName, referenceNumber] = r.split(',');
            return {
                amount: parseFloat(amount),
                type,
                cardNumber,
                chequeNumber,
                bankName,
                referenceNumber
            };
        }) : [];

        // تجميع الإيصالات حسب النوع
        const receiptsByType = receipts.reduce((acc, r) => {
            if (!acc[r.type]) {
                acc[r.type] = { count: 0, total: 0, items: [] };
            }
            acc[r.type].count++;
            acc[r.type].total += r.amount;
            acc[r.type].items.push(r);
            return acc;
        }, {});

        return {
            title: `تصفية رقم ${data.id}`,
            date: formatDate(data.reconciliation_date),
            reconciliationNumber: data.reconciliation_number,
            cashier: {
                name: data.cashier_name,
                number: data.cashier_number
            },
            accountant: {
                name: data.accountant_name
            },
            branch: {
                name: data.branch_name
            },
            totals: {
                receipts: formatCurrency(data.total_receipts),
                system: formatCurrency(data.system_sales),
                surplus: data.surplus_deficit >= 0 ? formatCurrency(data.surplus_deficit) : null,
                deficit: data.surplus_deficit < 0 ? formatCurrency(-data.surplus_deficit) : null
            },
            receipts: receiptsByType,
            notes: data.notes,
            status: data.status === 'completed' ? 'مكتملة' : 'مسودة',
            timestamp: new Date().toISOString(),
            settings: {
                logo: ConfigManager.get('printing.logo'),
                header: ConfigManager.get('printing.header'),
                footer: ConfigManager.get('printing.footer')
            }
        };
    }

    /**
     * توليد HTML للتصفية
     * @private
     * @param {Object} templateData - بيانات القالب
     */
    async generateReconciliationHtml(templateData) {
        try {
            // قراءة قالب التصفية
            let template = this.templates.get('reconciliation');
            if (!template) {
                throw new Error('قالب التصفية غير موجود');
            }

            // تحويل الأرقام إلى العربية
            const arabicNumbers = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
            const toArabicNumbers = (str) => str.toString().replace(/[0-9]/g, d => arabicNumbers[d]);

            // استبدال المتغيرات في القالب
            template = template
                // معلومات الرأس
                .replace('{{title}}', templateData.title)
                .replace('{{date}}', toArabicNumbers(templateData.date))
                .replace('{{reconciliationNumber}}', toArabicNumbers(templateData.reconciliationNumber))
                .replace('{{branchName}}', templateData.branch.name)

                // معلومات الكاشير والمحاسب
                .replace('{{cashierName}}', templateData.cashier.name)
                .replace('{{cashierNumber}}', toArabicNumbers(templateData.cashier.number))
                .replace('{{accountantName}}', templateData.accountant.name)

                // المجاميع
                .replace('{{totalReceipts}}', toArabicNumbers(templateData.totals.receipts))
                .replace('{{systemSales}}', toArabicNumbers(templateData.totals.system))
                .replace('{{surplus}}', templateData.totals.surplus ? toArabicNumbers(templateData.totals.surplus) : '-')
                .replace('{{deficit}}', templateData.totals.deficit ? toArabicNumbers(templateData.totals.deficit) : '-')

                // الملاحظات والحالة
                .replace('{{notes}}', templateData.notes || '')
                .replace('{{status}}', templateData.status)
                .replace('{{timestamp}}', toArabicNumbers(formatDate(templateData.timestamp)));

            // توليد جداول الإيصالات
            let receiptsHtml = '';
            for (const [type, data] of Object.entries(templateData.receipts)) {
                receiptsHtml += this.generateReceiptsTableHtml(type, data);
            }
            template = template.replace('{{receiptsTable}}', receiptsHtml);

            // إضافة الشعار إذا كان مفعلاً
            if (templateData.settings.logo) {
                const logoPath = path.join(process.env.APPDATA, 'تصفية برو', 'assets', 'logo.png');
                template = template.replace('{{logo}}', `<img src="${logoPath}" class="logo" />`);
            } else {
                template = template.replace('{{logo}}', '');
            }

            return template;

        } catch (error) {
            console.error('❌ [PRINT] خطأ في توليد HTML التصفية:', error);
            throw error;
        }
    }

    /**
     * توليد HTML لجدول الإيصالات
     * @private
     * @param {string} type - نوع الإيصال
     * @param {Object} data - بيانات الإيصالات
     */
    generateReceiptsTableHtml(type, data) {
        const typeNames = {
            cash: 'نقدي',
            card: 'بطاقة',
            cheque: 'شيك',
            transfer: 'حوالة'
        };

        let html = `
            <div class="receipt-section">
                <h3>${typeNames[type]} (${data.count})</h3>
                <table class="receipts-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>المبلغ</th>
        `;

        // إضافة الأعمدة حسب النوع
        switch (type) {
            case 'card':
                html += '<th>رقم البطاقة</th>';
                break;
            case 'cheque':
                html += '<th>رقم الشيك</th><th>البنك</th>';
                break;
            case 'transfer':
                html += '<th>رقم المرجع</th><th>البنك</th>';
                break;
        }

        html += '</tr></thead><tbody>';

        // إضافة الصفوف
        data.items.forEach((receipt, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td class="amount">${formatCurrency(receipt.amount)}</td>
            `;

            switch (type) {
                case 'card':
                    html += `<td>${receipt.cardNumber}</td>`;
                    break;
                case 'cheque':
                    html += `<td>${receipt.chequeNumber}</td><td>${receipt.bankName}</td>`;
                    break;
                case 'transfer':
                    html += `<td>${receipt.referenceNumber}</td><td>${receipt.bankName}</td>`;
                    break;
            }

            html += '</tr>';
        });

        html += `
                </tbody>
                <tfoot>
                    <tr>
                        <td>المجموع</td>
                        <td colspan="3" class="amount">${formatCurrency(data.total)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>`;

        return html;
    }
}

module.exports = new PrintManager();