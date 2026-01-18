// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

/**
 * Thermal Printer Handler for 80mm Receipt Printers
 * Tasfiya Pro - Professional Cashier Reconciliation System
 * 
 * This module provides functionality for printing reconciliation
 * receipts using standard 80mm thermal printers
 */

const { BrowserWindow } = require('electron');

class ThermalPrinter80mm {
    constructor() {
        this.paperWidth = 80; // mm
        this.charWidth = 32;  // Characters per line for 80mm paper (adaptive baseline)
        this.settings = {
            fontName: 'Courier New',
            fontSize: 9,
            copies: 1,
            printerName: null,
            color: false
        };
    }

    /**
     * Update printer settings
     */
    updateSettings(settings) {
        this.settings = { ...this.settings, ...settings };
    }

    /**
     * Get printer settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Format text for center alignment (adaptive width)
     */
    centerText(text, width = this.charWidth) {
        if (!text) return '';
        // Use adaptive width - no forced padding
        const textLength = text.length;
        const adaptiveWidth = Math.max(width, textLength);
        const padding = Math.max(0, Math.floor((adaptiveWidth - textLength) / 2));
        return ' '.repeat(padding) + text;
    }

    /**
     * Format text for right alignment (adaptive width)
     */
    rightText(text, width = this.charWidth) {
        if (!text) return '';
        // Use adaptive width - no forced padding
        const textLength = text.length;
        const adaptiveWidth = Math.max(width, textLength);
        const padding = Math.max(0, adaptiveWidth - textLength);
        return ' '.repeat(padding) + text;
    }

    /**
     * Truncate text to fit paper width (adaptive)
     */
    truncateText(text, width = this.charWidth) {
        if (!text) return '';
        // Allow text to expand if it fits the content
        return text;
    }

    /**
     * Format separator line (adaptive)
     */
    getSeparatorLine(char = '-') {
        // Return adaptive separator - will be used as needed
        return char.repeat(Math.max(this.charWidth, 20));
    }

    /**
     * Format number to right-aligned amount
     */
    formatAmount(amount, width = 12) {
        const formatted = Number(amount).toFixed(2);
        return this.rightText(formatted, width);
    }

    /**
     * Generate receipt HTML for thermal printer
     */
    generateReceiptHTML(reconciliationData) {
        const {
            reconciliation,
            bankReceipts = [],
            cashReceipts = [],
            postpaidSales = [],
            customerReceipts = [],
            returnInvoices = [],
            suppliers = [],
            companySettings = {},
            customText = null,
            isCustomerStatement = false,
            printOptions = {
                includeBankDetails: true,
                includeCashDetails: true,
                includePostpaidDetails: true,
                includeCustomerDetails: true,
                includeReturnsDetails: true,
                includeSuppliersDetails: true
            },
            selectedSections = null  // اختيارات الطباعة من واجهة التصفيات المحفوظة - لا تؤثر على الحسابات!
        } = reconciliationData;

        // معالجة النصوص المخصصة (مثل كشوف الحسابات)
        if (isCustomerStatement && customText) {
            console.log('📄 [THERMAL-PRINTER] معالجة كشف حساب عميل مخصص...');
            return this.generateCustomStatementHTML(customText, reconciliationData);
        }

        // Get current settings to apply to HTML
        const fontName = this.settings.fontName || 'Courier New';
        const fontSize = this.settings.fontSize || 9;
        const textColor = this.settings.color ? '#000' : '#000';
        
        console.log('📄 [THERMAL-PRINTER] توليد HTML الإيصال...');
        console.log('📋 خيارات الطباعة:', printOptions);
        console.log('⚙️ [THERMAL-PRINTER] الإعدادات المطبقة:');
        console.log('   - نوع الخط:', fontName);
        console.log('   - حجم الخط:', fontSize, 'pt');
        console.log('   - اللون:', this.settings.color ? 'ملون' : 'أبيض وأسود');
        console.log('   - عدد النسخ:', this.settings.copies || 1);
        console.log('📊 البيانات المستقبلة:', {
            hasReconciliation: !!reconciliation,
            bankCount: bankReceipts.length,
            cashCount: cashReceipts.length,
            postpaidCount: postpaidSales.length,
            customerCount: customerReceipts.length,
            returnCount: returnInvoices.length,
            suppliersCount: suppliers.length
        });

        // Log selected sections for printing (display info only - does NOT affect calculations)
        if (selectedSections) {
            console.log('🔍 [THERMAL-PRINTER] ملاحظة: الأقسام المختارة للطباعة فقط (لا تؤثر على الحسابات):');
            console.log('   - المقبوضات البنكية:', selectedSections.bankReceipts ? '✅ سيتم طباعتها' : '❌ لن تُطبع');
            console.log('   - المقبوضات النقدية:', selectedSections.cashReceipts ? '✅ سيتم طباعتها' : '❌ لن تُطبع');
            console.log('   - المبيعات الآجلة:', selectedSections.postpaidSales ? '✅ سيتم طباعتها' : '❌ لن تُطبع');
            console.log('   - مقبوضات العملاء:', selectedSections.customerReceipts ? '✅ سيتم طباعتها' : '❌ لن تُطبع');
            console.log('   - فواتير المرتجع:', selectedSections.returnInvoices ? '✅ سيتم طباعتها' : '❌ لن تُطبع');
        }

        // Validate data
        if (!reconciliation) {
            throw new Error('بيانات التصفية مطلوبة');
        }

        // Format date
        const formatDate = (dateString) => {
            if (!dateString) return 'غير محدد';
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        };

        // Format time
        const formatTime = (dateString) => {
            if (!dateString) return 'غير محدد';
            const date = new Date(dateString);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        };

        // ⚠️ الحسابات تُجرى على البيانات الكاملة ALWAYS، بغض النظر عما يختاره المستخدم للطباعة
        // Calculations are performed on COMPLETE data, regardless of print selections
        const bankTotal = bankReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
        const cashTotal = cashReceipts.reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0);
        const postpaidTotal = postpaidSales.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
        const customerTotal = customerReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
        const returnTotal = returnInvoices.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
        const totalReceipts = bankTotal + cashTotal + postpaidTotal + returnTotal - customerTotal;
        const systemSales = parseFloat(reconciliation.system_sales || 0);
        const surplusDeficit = totalReceipts - systemSales;

        console.log('💰 [THERMAL-PRINTER] الإجماليات (من البيانات الكاملة - لم تتأثر بخيارات الطباعة):');
        console.log(`   - إجمالي البنكية: ${bankTotal.toFixed(2)}`);
        console.log(`   - إجمالي النقدية: ${cashTotal.toFixed(2)}`);
        console.log(`   - إجمالي الآجل: ${postpaidTotal.toFixed(2)}`);
        console.log(`   - إجمالي مقبوضات العملاء: ${customerTotal.toFixed(2)}`);
        console.log(`   - إجمالي المرتجع: ${returnTotal.toFixed(2)}`);
        console.log(`   - إجمالي المقبوضات: ${totalReceipts.toFixed(2)}`);
        console.log(`   - الفرق: ${surplusDeficit.toFixed(2)}`);

        // Generate receipt lines as text - optimized for 80mm paper
        let receipt = '';
        
        // Header - Use company name from settings or reconciliation data
        const companyName = companySettings.company_name || reconciliation.company_name || 'تصفية برو';
        const companyLogo = companySettings.company_logo || '';
        
        // Create header HTML with logo and company name
        let headerHTML = `
            <div style="text-align: center; margin-bottom: 0px; page-break-inside: avoid;">`;
        
        // Add logo if exists
        if (companyLogo) {
            headerHTML += `<div style="margin-bottom: 8px;"><img src="${companyLogo}" style="max-width: 100%; max-height: 120px; margin: 0 auto; display: block;"></div>`;
        }
        
        // Add company name
        headerHTML += `<h2 style="font-size: 16px; font-weight: bold; margin: 5px 0; text-align: center; border-bottom: 2px solid #333; padding-bottom: 5px;">${companyName}</h2>`;
        
        // Add receipt info inside header in table format (متقابلة)
        const currentDate = new Date();
        const printDate = formatDate(currentDate);
        const printTime = formatTime(currentDate);
        
        headerHTML += `
        <table style="width: 100%; border-collapse: collapse; margin-top: 0px; margin-bottom: 2px; font-size: 11px;">
            <tbody>
                <tr>
                    <td style="text-align: right; padding: 2px 5px; font-weight: bold; width: 50%;">رقم:</td>
                    <td style="text-align: left; padding: 2px 5px; width: 50%;">#${reconciliation.reconciliation_number || reconciliation.id || 'N/A'}</td>
                    <td style="text-align: right; padding: 2px 5px; font-weight: bold; width: 50%;">الكاشير:</td>
                    <td style="text-align: left; padding: 2px 5px; width: 50%;">${reconciliation.cashier_name || 'غير محدد'}</td>
                </tr>
                <tr>
                    <td style="text-align: right; padding: 2px 5px; font-weight: bold; width: 50%;">التاريخ:</td>
                    <td style="text-align: left; padding: 2px 5px; width: 50%;">${formatDate(reconciliation.reconciliation_date)}</td>
                    <td style="text-align: right; padding: 2px 5px; font-weight: bold; width: 50%;">الوقت:</td>
                    <td style="text-align: left; padding: 2px 5px; width: 50%;">${printTime}</td>
                </tr>
            </tbody>
        </table>`;
        headerHTML += `</div></div>`;

        const status = surplusDeficit > 0 ? '✅ فائض' : surplusDeficit < 0 ? '❌ عجز' : '✔️ متطابق';
        const statusDescription = surplusDeficit > 0 ? 'أموال إضافية' : surplusDeficit < 0 ? 'نقص في الأموال' : 'التصفية متوازنة';

        // Create professional summary HTML table
        // ⚠️ Summary shows totals from COMPLETE data, not filtered by print selections
        const summaryHTML = `
            <div style="margin: 0px 0; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
                <h3 style="font-size: 16px; font-weight: bold; margin: 0px 0 2px 0; text-align: right; border-bottom: 2px solid #333;">📊 ملخص التصفية</h3>
                <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 10px;">
                    <tbody>
                        <tr style="background: #f5f5f5;">
                            <td style="border: 1px solid #999; padding: 5px; text-align: right; width: 50%; font-weight: bold; font-size: 13px;">مبيعات النظام:</td>
                            <td style="border: 1px solid #999; padding: 5px; text-align: left; width: 50%; font-size: 13px;">${systemSales.toFixed(2)}</td>
                        </tr>
                        <tr style="background: #f9f9f9;">
                            <td style="border: 1px solid #999; padding: 5px; text-align: right; width: 50%; font-weight: bold; font-size: 13px;">إجمالي المقبوضات:</td>
                            <td style="border: 1px solid #999; padding: 5px; text-align: left; width: 50%; font-size: 13px;">${totalReceipts.toFixed(2)}</td>
                        </tr>
                        <tr style="background: #f5f5f5;">
                            <td style="border: 1px solid #999; padding: 5px; text-align: right; width: 50%; font-weight: bold; font-size: 13px;">الفرق:</td>
                            <td style="border: 1px solid #999; padding: 5px; text-align: left; width: 50%; font-size: 13px; font-weight: bold;">${surplusDeficit.toFixed(2)}</td>
                        </tr>
                        <tr style="background: #f9f9f9;">
                            <td style="border: 1px solid #999; padding: 5px; text-align: right; width: 50%; font-weight: bold; font-size: 13px;">الحالة:</td>
                            <td style="border: 1px solid #999; padding: 5px; text-align: left; width: 50%; font-size: 13px; font-weight: bold;">${status}</td>
                        </tr>
                    </tbody>
                </table>
                <p style="font-size: 10px; color: #666; text-align: right; margin: 5px 0 0 0;">
                    ℹ️ الإجماليات أعلاه تعكس البيانات الكاملة وليست مؤثرة بخيارات الطباعة
                </p>
            </div>
        `;

        // Detailed sections based on user selection - Using HTML for table format
        const detailedHTML = [];
        
        // Add header with logo if exists
        if (headerHTML) {
            detailedHTML.push(headerHTML);
        }

        // Bank details (if selected) - Use selectedSections only for print display, not for calculations
        if ((selectedSections ? selectedSections.bankReceipts : printOptions.includeBankDetails) && bankReceipts && bankReceipts.length > 0) {
            detailedHTML.push(this.generateBankReceiptsHTML(bankReceipts, bankTotal));
        }

        // Cash details (if selected) - Use selectedSections only for print display, not for calculations
        if ((selectedSections ? selectedSections.cashReceipts : printOptions.includeCashDetails) && cashReceipts && cashReceipts.length > 0) {
            detailedHTML.push(this.generateCashReceiptsHTML(cashReceipts, cashTotal));
        }

        // Postpaid details (if selected) - Use selectedSections only for print display, not for calculations
        if ((selectedSections ? selectedSections.postpaidSales : printOptions.includePostpaidDetails) && postpaidSales && postpaidSales.length > 0) {
            detailedHTML.push(this.generatePostpaidSalesHTML(postpaidSales, postpaidTotal));
        }

        // Customer details (if selected) - Use selectedSections only for print display, not for calculations
        if ((selectedSections ? selectedSections.customerReceipts : printOptions.includeCustomerDetails) && customerReceipts && customerReceipts.length > 0) {
            detailedHTML.push(this.generateCustomerReceiptsHTML(customerReceipts, customerTotal));
        }

        // Returns details (if selected) - Use selectedSections only for print display, not for calculations
        if ((selectedSections ? selectedSections.returnInvoices : printOptions.includeReturnsDetails) && returnInvoices && returnInvoices.length > 0) {
            detailedHTML.push(this.generateReturnInvoicesHTML(returnInvoices, returnTotal));
        }

        // Suppliers details (if selected)
        if (printOptions.includeSuppliersDetails && suppliers && suppliers.length > 0) {
            detailedHTML.push(this.generateSuppliersHTML(suppliers));
        }

        // Add summary HTML at the end (after all details)
        detailedHTML.push(summaryHTML);

        // Add signature lines at the end
        const signatureHTML = `
            <div style="margin-top: 10px; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
                <div style="text-align: center; font-size: 12px;">
                    <p style="margin: 2px 0 5.67px 0; font-weight: bold;">التواقيع</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 0px;">
                        <tbody>
                            <tr style="height: auto;">
                                <td style="border: none; padding: 2px 10px; text-align: center; width: 33.33%;">
                                    <p style="margin: 0px; font-size: 11px;">توقيع الكاشير</p>
                                </td>
                                <td style="border: none; padding: 2px 10px; text-align: center; width: 33.33%;">
                                    <p style="margin: 0px; font-size: 11px;">توقيع المحاسب</p>
                                </td>
                                <td style="border: none; padding: 2px 10px; text-align: center; width: 33.33%;">
                                    <p style="margin: 0px; font-size: 11px;">توقيع المدير</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        detailedHTML.push(signatureHTML);
        
        // Add footer with application name and rights
        const footerHTML = `
            <div style="margin-top: 20px; page-break-inside: avoid; width: 100%; box-sizing: border-box; text-align: center; border-top: 1px solid #333; padding-top: 10px;">
                <p style="margin: 3px 0; font-size: 12px; font-weight: bold;">تصفية برو - Tasfiya Pro</p>
                <p style="margin: 3px 0; font-size: 10px; color: #000;">المطور: محمد أمين الكامل</p>
                <p style="margin: 8px 0; font-size: 9px; color: #000;">© 2025 جميع الحقوق محفوظة</p>
            </div>
        `;
        
        detailedHTML.push(footerHTML);

        // Store HTML content for later use
        this.detailedHTML = detailedHTML.join('');

        console.log('📝 [THERMAL-PRINTER] محتوى الإيصال المولّد:');
        console.log('═'.repeat(50));
        console.log(receipt);
        console.log('═'.repeat(50));

        return this.convertToHTML(receipt);
    }

    /**
     * Truncate text for display
     */
    truncateText(text, maxLength) {
        if (!text) return '---';
        return text.length > maxLength ? text.substring(0, maxLength - 2) + '..' : text;
    }

    /**
     * Generate Bank Receipts HTML Table
     */
    generateBankReceiptsHTML(bankReceipts, total) {
        const rows = bankReceipts.map((item, index) => `
            <tr>
                <td style="font-size: 13px;">${index + 1}</td>
                <td style="font-size: 13px;">${item.atm_name || 'بدون جهاز'}</td>
                <td style="font-size: 13px;">${item.bank_name || 'بدون بنك'}</td>
                <td style="font-size: 13px;">${(item.amount || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        return `
            <div style="margin: 5px 0; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
                <h3 style="font-size: 16px; font-weight: bold; margin: 3px 0; border-bottom: 1px solid #333; padding-bottom: 2px; text-align: right;">💳 المقبوضات البنكية (${bankReceipts.length})</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="border: 1px solid #666; padding: 3px; text-align: center; width: 12%;">الرقم</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 26%;">الجهاز</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 36%;">البنك</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 26%;">المبلغ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        <tr style="background: #e8f5e9; font-weight: bold;">
                            <td colspan="3" style="border: 1px solid #666; padding: 3px; text-align: right;">الإجمالي:</td>
                            <td style="border: 1px solid #666; padding: 3px; text-align: right;">${total.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Generate Cash Receipts HTML Table
     */
    generateCashReceiptsHTML(cashReceipts, total) {
        const rows = cashReceipts.map((item, index) => `
            <tr>
                <td style="font-size: 13px;">${index + 1}</td>
                <td style="font-size: 13px;">${item.denomination || 0}</td>
                <td style="font-size: 13px;">${item.quantity || 0}</td>
                <td style="font-size: 13px;">${(item.total_amount || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        return `
            <div style="margin: 5px 0; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
                <h3 style="font-size: 16px; font-weight: bold; margin: 3px 0; border-bottom: 1px solid #333; padding-bottom: 2px; text-align: right;">💰 المقبوضات النقدية (${cashReceipts.length})</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="border: 1px solid #666; padding: 3px; text-align: center; width: 12%;">الرقم</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 20%;">الفئة</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: center; width: 12%;">العدد</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 56%;">المبلغ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        <tr style="background: #e8f5e9; font-weight: bold;">
                            <td colspan="3" style="border: 1px solid #666; padding: 3px; text-align: right; font-size: 15px;">الإجمالي:</td>
                            <td style="border: 1px solid #666; padding: 3px; text-align: right; font-size: 15px;">${total.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Generate Postpaid Sales HTML Table
     */
    generatePostpaidSalesHTML(postpaidSales, total) {
        const rows = postpaidSales.map((item, index) => `
            <tr>
                <td style="font-size: 13px;">${index + 1}</td>
                <td style="font-size: 13px;">${item.customer_name || 'بدون اسم'}</td>
                <td style="font-size: 13px;">${(item.amount || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        return `
            <div style="margin: 5px 0; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
                <h3 style="font-size: 16px; font-weight: bold; margin: 3px 0; border-bottom: 1px solid #333; padding-bottom: 2px; text-align: right;">📋 المبيعات الآجلة (${postpaidSales.length})</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="border: 1px solid #666; padding: 3px; text-align: center; width: 12%;">الرقم</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 60%;">اسم العميل</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 28%;">المبلغ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        <tr style="background: #e8f5e9; font-weight: bold;">
                            <td colspan="2" style="border: 1px solid #666; padding: 3px; text-align: right; font-size: 15px;">الإجمالي:</td>
                            <td style="border: 1px solid #666; padding: 3px; text-align: right; font-size: 15px;">${total.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Generate Customer Receipts HTML Table
     */
    generateCustomerReceiptsHTML(customerReceipts, total) {
        const rows = customerReceipts.map((item, index) => `
            <tr>
                <td style="font-size: 13px;">${index + 1}</td>
                <td style="font-size: 13px;">${item.customer_name || 'بدون اسم'}</td>
                <td style="font-size: 13px;">${(item.amount || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        return `
            <div style="margin: 5px 0; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
                <h3 style="font-size: 16px; font-weight: bold; margin: 3px 0; border-bottom: 1px solid #333; padding-bottom: 2px; text-align: right;">👥 مقبوضات العملاء (${customerReceipts.length})</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="border: 1px solid #666; padding: 3px; text-align: center; width: 12%;">الرقم</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 60%;">اسم العميل</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 28%;">المبلغ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        <tr style="background: #e8f5e9; font-weight: bold;">
                            <td colspan="2" style="border: 1px solid #666; padding: 3px; text-align: right; font-size: 15px;">الإجمالي:</td>
                            <td style="border: 1px solid #666; padding: 3px; text-align: right; font-size: 15px;">${total.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Generate Return Invoices HTML Table
     */
    generateReturnInvoicesHTML(returnInvoices, total) {
        const rows = returnInvoices.map((item, index) => `
            <tr>
                <td style="font-size: 13px;">${index + 1}</td>
                <td style="font-size: 13px;">${item.invoice_number || 'بدون رقم'}</td>
                <td style="font-size: 13px;">${(item.amount || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        return `
            <div style="margin: 5px 0; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
                <h3 style="font-size: 16px; font-weight: bold; margin: 3px 0; border-bottom: 1px solid #333; padding-bottom: 2px; text-align: right;">↩️ فواتير المرتجع (${returnInvoices.length})</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="border: 1px solid #666; padding: 3px; text-align: center; width: 12%;">الرقم</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 60%;">رقم الفاتورة</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 28%;">المبلغ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        <tr style="background: #e8f5e9; font-weight: bold;">
                            <td colspan="2" style="border: 1px solid #666; padding: 2px; text-align: right;">الإجمالي:</td>
                            <td style="border: 1px solid #666; padding: 2px; text-align: right;">${total.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Generate Suppliers HTML Table
     */
    generateSuppliersHTML(suppliers) {
        const rows = suppliers.map((item, index) => `
            <tr>
                <td style="font-size: 13px;">${index + 1}</td>
                <td style="font-size: 13px;">${item.supplier_name || 'بدون اسم'}</td>
                <td style="font-size: 13px;">${(item.amount || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        return `
            <div style="margin: 5px 0; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
                <h3 style="font-size: 16px; font-weight: bold; margin: 3px 0; border-bottom: 1px solid #333; padding-bottom: 2px; text-align: right;">🏢 الموردين (${suppliers.length})</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="border: 1px solid #666; padding: 3px; text-align: center; width: 12%;">الرقم</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 50%;">اسم المورد</th>
                            <th style="border: 1px solid #666; padding: 3px; text-align: right; width: 38%;">المبلغ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Generate HTML for custom statements (like customer ledgers)
     * توليد HTML لكشوف الحسابات المخصصة
     */
    generateCustomStatementHTML(textContent, reconciliationData) {
        console.log('🖨️ [THERMAL-PRINTER] توليد HTML كشف حساب احترافي...');
        
        const fontName = this.settings.fontName || 'Arial';
        const fontSize = this.settings.fontSize || 10;
        const customerName = reconciliationData.customerName || 'عميل';
        
        // محاولة تحليل البيانات المنظمة
        let stmtData = null;
        try {
            stmtData = JSON.parse(textContent);
            if (!stmtData.isStructuredStatement) {
                throw new Error('Not structured');
            }
        } catch (e) {
            // إذا فشل التحليل، استخدم النص العادي
            console.log('⚠️ [THERMAL-PRINTER] تم استخدام النص العادي');
            const lines = textContent.split('\n').map(line => 
                `<div>${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
            ).join('');
            
            return `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>كشف حساب - ${customerName}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: '${fontName}', 'Courier', monospace;
                        font-size: ${fontSize}pt;
                        padding: 5mm;
                        width: 80mm;
                        direction: rtl;
                        background: white;
                        color: #000;
                    }
                    div { white-space: pre-wrap; word-wrap: break-word; line-height: 1.3; margin: 1px 0; }
                    @page { size: 72mm auto; margin: 2mm; }
                    @media print { body { margin: 0; padding: 3mm; } }
                </style>
            </head>
            <body>${lines}</body>
            </html>
            `;
        }

        // إنشاء HTML احترافي من البيانات المنظمة
        const { tableData = [], summary = {}, printDate } = stmtData;
        const fmt = (val) => {
            const num = parseFloat(val);
            if (isNaN(num)) return '0.00';
            return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        };

        // بناء جدول المعاملات (بدون عمود الرصيد)
        let tableRows = '';
        tableData.forEach((row, idx) => {
            const isPostpaid = row.type.includes('مبيعات');
            const typeSymbol = isPostpaid ? '◆' : '◇';
            const amountDisplay = fmt(row.amount);
            const cashier = row.cashier || 'يدوي';
            
            tableRows += `
            <tr>
                <td style="padding: 3px 1px; text-align: center; font-size: 9pt; font-weight: bold; border-bottom: 1px solid #000; border-right: 1px solid #999;">${idx + 1}</td>
                <td style="padding: 3px 1px; text-align: center; font-size: 9pt; font-weight: 600; border-bottom: 1px solid #000; border-right: 1px solid #999;">${row.date}</td>
                <td style="padding: 3px 1px; text-align: right; font-size: 8pt; font-weight: 600; border-bottom: 1px solid #000; border-right: 1px solid #999;">${cashier}</td>
                <td style="padding: 3px 1px; text-align: right; font-size: 9pt; font-weight: bold; border-bottom: 1px solid #000; border-right: 1px solid #999;">${typeSymbol} ${row.type}</td>
                <td style="padding: 3px 1px; text-align: right; font-size: 9pt; font-weight: bold; border-bottom: 1px solid #000; border-right: 1px solid #999;">${amountDisplay}</td>
            </tr>`;
        });

        // بناء الملخص النهائي
        const totalPostStr = fmt(summary.totalPostpaid || 0);
        const totalRecStr = fmt(summary.totalReceipts || 0);
        const balanceStr = fmt(summary.balance || 0);
        const balanceIndicator = summary.balance >= 0 ? '▶' : '◀';

        const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>كشف حساب - ${customerName}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                
                body {
                    font-family: 'Courier New', monospace;
                    font-size: ${fontSize}pt;
                    width: 72mm;
                    padding: 0.5mm;
                    background: white;
                    color: #000;
                    direction: rtl;
                }
                
                .header {
                    text-align: center;
                    border: 2px solid #000;
                    border-bottom: 3px solid #000;
                    padding: 5px 2px;
                    margin-bottom: 4px;
                }
                
                .header-title {
                    font-size: ${fontSize + 2}pt;
                    font-weight: 900;
                    color: #000;
                    margin-bottom: 2px;
                    letter-spacing: 1px;
                }
                
                .header-customer {
                    font-size: ${fontSize}pt;
                    color: #000;
                    margin: 1px 0;
                    font-weight: 900;
                }
                
                .header-branch {
                    font-size: ${fontSize - 0.5}pt;
                    color: #000;
                    margin: 1px 0;
                    font-weight: 700;
                }
                
                .header-date {
                    font-size: ${fontSize - 0.5}pt;
                    color: #000;
                    margin: 1px 0;
                    font-weight: 700;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 4px 0;
                    border: 1px solid #000;
                }
                
                th {
                    background: white;
                    color: #000;
                    padding: 2px 1px;
                    text-align: right;
                    font-size: ${fontSize - 0.5}pt;
                    font-weight: 900;
                    border-bottom: 1px solid #000;
                    border-right: none;
                }
                
                th:first-child {
                    border-left: none;
                }
                
                td {
                    border-right: none;
                    color: #000;
                    border-bottom: 1px dotted #999;
                    padding: 2px 1px;
                }
                
                td:first-child {
                    border-left: none;
                }
                
                .summary-section {
                    margin-top: 4px;
                    border: 1px solid #000;
                    padding: 3px;
                    background: white;
                }
                
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 2px 0;
                    border-bottom: 1px dotted #999;
                    font-size: ${fontSize}pt;
                    font-weight: 700;
                }
                
                .summary-row:last-child {
                    border-bottom: none;
                }
                
                .summary-label {
                    text-align: right;
                    flex: 1;
                    padding-right: 2px;
                    font-weight: 900;
                }
                
                .summary-value {
                    padding-left: 5px;
                    text-align: left;
                    min-width: 20mm;
                    font-weight: 700;
                    border-left: 1px solid #000;
                }
                
                .postpaid-row {
                    border-left: 2px solid #000;
                }
                
                .receipt-row {
                    border-left: 2px solid #000;
                }
                
                .balance-row {
                    border: 1px solid #000;
                    padding: 3px;
                    font-size: ${fontSize}pt;
                }
                
                .footer {
                    text-align: center;
                    margin-top: 3px;
                    padding-top: 2px;
                    border-top: 1px solid #000;
                    font-size: ${fontSize - 1}pt;
                    color: #000;
                    font-weight: 600;
                }
                
                .footer div {
                    margin: 1px 0;
                }
                
                @page { size: 72mm auto; margin: 0; }
                @media print {
                    body { margin: 0; padding: 1mm; }
                    table { page-break-inside: avoid; }
                    .summary-section { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-title">📊 كشف حساب عميل</div>
                <div class="header-customer"><strong>العميل:</strong> ${customerName}</div>
                ${reconciliationData.branch && reconciliationData.branch.branch_name ? `<div class="header-branch"><strong>الفرع:</strong> ${reconciliationData.branch.branch_name}</div>` : ''}
                <div class="header-date"><strong>التاريخ:</strong> ${printDate}</div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th style="width: 8%">#</th>
                        <th style="width: 18%">التاريخ</th>
                        <th style="width: 18%">الكاشير</th>
                        <th style="width: 28%">النوع</th>
                        <th style="width: 28%">المبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            
            <div class="summary-section">
                <div class="summary-row postpaid-row">
                    <span class="summary-label">آجل ◆:</span>
                    <span class="summary-value">${totalPostStr}</span>
                </div>
                <div class="summary-row receipt-row">
                    <span class="summary-label">مقبوض ◇:</span>
                    <span class="summary-value">${totalRecStr}</span>
                </div>
                <div class="summary-row balance-row">
                    <span class="summary-label">الرصيد ${balanceIndicator}:</span>
                    <span class="summary-value">${balanceStr}</span>
                </div>
            </div>
            
            <div class="footer">
                <div>━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
                <div><strong>تصفية برو</strong> | النسخة 4.0</div>
                <div>جميع الحقوق محفوظة © 2025</div>
                <div style="margin-top: 2px; font-size: ${fontSize - 1}pt; font-weight: 600;">المطور: محمد أمين الكامل</div>
            </div>
        </body>
        </html>
        `;
        
        console.log('✅ [THERMAL-PRINTER] تم إنشاء HTML كشف الحساب الاحترافي بنجاح');
        return html;
    }

    /**
     * Convert plain text receipt to HTML
     */
    convertToHTML(textReceipt) {
        if (!textReceipt || textReceipt.trim().length === 0) {
            console.warn('⚠️ [THERMAL-PRINTER] تحذير: المحتوى النصي فارغ!');
            textReceipt = '';
        }

        // Extract settings for use in template literals
        const fontName = this.settings.fontName || 'Courier New';
        const fontSize = this.settings.fontSize || 9;

        // Get detailed HTML tables if available
        const detailedTables = this.detailedHTML || '';

        const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>إيصال التصفية - تصفية برو</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                html, body {
                    width: 100%;
                    margin: 0;
                    padding: 0;
                }
                
                body {
                    font-family: '${fontName}', 'Courier', monospace;
                    font-size: ${fontSize}pt;
                    font-weight: 600;
                    line-height: 1;
                    width: 100%;
                    margin: 0 auto;
                    padding: 0;
                    background: white;
                    color: #000;
                }
                
                .receipt-form {
                    width: 72mm;
                    font-family: '${fontName}', monospace;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    font-size: ${fontSize}pt;
                    font-weight: 600;
                    line-height: 1.2;
                    padding: 0mm 0mm;
                    margin: 0 auto;
                    background: white;
                    overflow-x: hidden;
                    box-sizing: border-box;
                    letter-spacing: 0;
                    word-spacing: 0;
                    min-width: fit-content;
                }
                
                .receipt-tables {
                    width: 100%;
                    padding: 0mm;
                    margin: 0;
                    background: white;
                    box-sizing: border-box;
                    overflow-x: hidden;
                }
                
                .preview-controls {
                    display: none;
                }
                
                h3 {
                    text-align: right;
                    margin: 15px 0 10px 0;
                }
                
                table {
                    width: 100%;
                    margin: 10px 0;
                    border-collapse: collapse;
                    table-layout: fixed;
                }
                
                th, td {
                    border: 1px solid #666;
                    padding: 3px;
                    text-align: right;
                    font-family: '${fontName}', sans-serif;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                }
                
                th {
                    background: #f0f0f0;
                    font-weight: bold;
                }
                
                @media screen {
                    body {
                        width: auto;
                        padding: 10px;
                    }
                    
                    .receipt-form {
                        width: auto;
                        display: inline-block;
                        min-width: fit-content;
                        max-width: 100%;
                        overflow-x: auto;
                        white-space: pre;
                        word-wrap: normal;
                        font-size: ${fontSize * 1.5}px;
                    }
                    
                    .preview-controls {
                        display: flex;
                        justify-content: space-between;
                        padding: 10px;
                        background: #f0f0f0;
                        border-bottom: 1px solid #ddd;
                        gap: 10px;
                        margin-bottom: 10px;
                    }
                    
                    .preview-controls button {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                    }
                    
                    .btn-print {
                        background: #007bff;
                        color: white;
                    }
                    
                    .btn-print:hover {
                        background: #0056b3;
                    }
                    
                    .btn-close {
                        background: #6c757d;
                        color: white;
                    }
                    
                    .btn-close:hover {
                        background: #545b62;
                    }
                    
                    .preview-container {
                        display: flex;
                        justify-content: center;
                        padding: 20px;
                        background: #e9ecef;
                        min-height: calc(100vh - 80px);
                        overflow-x: auto;
                    }
                    
                    .receipt-preview {
                        background: white;
                        width: auto;
                        max-width: 900px;
                        padding: 20px;
                        box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
                        border: 1px solid #ddd;
                        overflow-x: auto;
                    }
                }
                
                @media print {
                    body {
                        width: 100%;
                        margin: 0;
                        padding: 0;
                    }
                    
                    .preview-controls {
                        display: none !important;
                    }
                    
                    .preview-container {
                        display: block !important;
                        padding: 0 !important;
                        background: white !important;
                        min-height: auto !important;
                    }
                    
                    .receipt-preview {
                        box-shadow: none !important;
                        border: none !important;
                        width: 100% !important;
                        padding: 0 !important;
                        max-width: none !important;
                    }
                    
                    .receipt-form {
                        width: 72mm;
                        padding: 0mm 0mm;
                        font-size: ${fontSize - 1}pt;
                        overflow: hidden;
                        white-space: pre;
                        word-wrap: normal;
                        line-height: 1;
                        letter-spacing: -0.5px;
                    }
                    
                    .receipt-tables {
                        width: 72mm;
                        padding: 0mm 0mm;
                        font-size: ${fontSize - 2}pt;
                        overflow: hidden;
                    }
                    
                    table {
                        font-size: ${fontSize - 2}pt;
                        width: 100%;
                    }
                    
                    th, td {
                        padding: 2px;
                        font-size: ${fontSize - 2}pt;
                    }
                    
                    @page {
                        size: 72mm auto;
                        margin: 0;
                        padding: 0;
                    }
                }
            </style>
        </head>
        <body>
            <div class="preview-controls">
                <button class="btn-print" onclick="window.print(); return false;">🖨️ طباعة</button>
                <button class="btn-close" onclick="window.close(); return false;">❌ إغلاق</button>
            </div>
            
            <div class="preview-container">
                <div class="receipt-preview">
                    <div class="receipt-form">
                        <pre>${textReceipt}</pre>
                    </div>
                    
                    ${detailedTables ? `
                    <div class="receipt-tables">
                        ${detailedTables}
                    </div>
                    ` : ''}
                </div>
            </div>
        </body>
        </html>
        `;
        
        return html;
    }

    /**
     * Print receipt directly to thermal printer
     */
    async printReceipt(reconciliationData, printerName = null) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        try {
            console.log('🖨️ [THERMAL-PRINTER] بدء عملية الطباعة...');
            
            // Generate receipt HTML
            const htmlContent = this.generateReceiptHTML(reconciliationData);
            
            if (!htmlContent || htmlContent.trim().length === 0) {
                throw new Error('فشل في إنشاء محتوى الإيصال');
            }
            
            console.log('📝 [THERMAL-PRINTER] تم إنشاء محتوى HTML بنجاح، الحجم:', htmlContent.length, 'بايت');

            // Create a temporary file instead of data URL
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, `receipt_${Date.now()}.html`);
            
            // Write HTML to temp file
            fs.writeFileSync(tempFile, htmlContent, 'utf-8');
            
            // Verify file was written
            const fileStats = fs.statSync(tempFile);
            console.log('💾 [THERMAL-PRINTER] تم كتابة الملف المؤقت:', tempFile, 'الحجم:', fileStats.size, 'بايت');
            
            if (fileStats.size === 0) {
                throw new Error('الملف المؤقت فارغ - فشل في كتابة المحتوى');
            }

            // Create print window
            const printWindow = new BrowserWindow({
                show: false,
                width: 400,
                height: 600,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            console.log('🪟 [THERMAL-PRINTER] تم إنشاء نافذة الطباعة');

            // Load from file with timeout and retry logic
            let loadSuccess = false;
            try {
                const loadPromise = printWindow.loadFile(tempFile);
                await Promise.race([
                    loadPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading file')), 5000))
                ]);
                loadSuccess = true;
                console.log('✓ [THERMAL-PRINTER] تم تحميل الملف بنجاح');
            } catch (loadError) {
                console.warn('⚠️ [THERMAL-PRINTER] تحذير في تحميل الملف:', loadError.message);
                // Continue anyway - the file might still load
            }

            // Wait for content to load with a fixed timeout instead of waiting for event
            console.log('⏳ [THERMAL-PRINTER] في انتظار تحميل المحتوى...');
            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log('🎨 [THERMAL-PRINTER] في انتظار عرض المحتوى...');
            // Add a small delay to ensure rendering
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Print options optimized for 80mm thermal printer
            // Electron uses microns: 1mm = 1000 microns
            const printOptions = {
                silent: true,
                printBackground: true,
                color: this.settings.color || false,
                margin: {
                    marginType: 'custom',
                    top: 0,
                    bottom: 0,
                    left: 0,      // هامش أيسر = 0
                    right: 0      // هامش أيمن = 0
                },
                landscape: false,
                scaleFactor: 100,
                pageSize: {
                    width: 72000,   // 72mm في الميكرونات
                    height: 297000  // ارتفاع A4 في الميكرونات
                },
                copies: this.settings.copies || 1,
                duplexMode: 'simplex',
                headerFooter: false
            };

            // Add printer name if specified
            if (printerName || this.settings.printerName) {
                printOptions.deviceName = printerName || this.settings.printerName;
                console.log('🖥️ [THERMAL-PRINTER] طابعة محددة:', printOptions.deviceName);
            }

            // Print the content
            console.log('🖨️ [THERMAL-PRINTER] بدء الطباعة...');
            
            // Try both callback and promise-based print
            let printSuccess = false;
            await new Promise((resolve, reject) => {
                try {
                    const printResult = printWindow.webContents.print(printOptions, (success) => {
                        printSuccess = success;
                        console.log('✓ [THERMAL-PRINTER] نتيجة الطباعة:', success ? 'نجاح' : 'فشل');
                        resolve(success);
                    });
                    
                    // Set a timeout in case callback is not called
                    const timeout = setTimeout(() => {
                        console.log('⏰ [THERMAL-PRINTER] انقضت مهلة الطباعة - سيتم المتابعة');
                        resolve(true);
                    }, 3000);
                    
                } catch (error) {
                    console.error('❌ [THERMAL-PRINTER] خطأ في استدعاء الطباعة:', error);
                    reject(error);
                }
            });

            // Wait for print job to complete
            console.log('⏳ [THERMAL-PRINTER] في انتظار اكتمال مهمة الطباعة...');
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Close print window
            console.log('🔌 [THERMAL-PRINTER] إغلاق نافذة الطباعة...');
            try {
                printWindow.close();
            } catch (e) {
                console.warn('⚠️ [THERMAL-PRINTER] لم تتمكن من إغلاق النافذة بشكل صحيح:', e.message);
            }

            // Clean up temp file
            console.log('🧹 [THERMAL-PRINTER] في انتظار حذف الملف المؤقت...');
            setTimeout(() => {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                        console.log('✓ [THERMAL-PRINTER] تم حذف الملف المؤقت');
                    }
                } catch (e) {
                    console.error('❌ [THERMAL-PRINTER] خطأ في حذف الملف المؤقت:', e);
                }
            }, 2000);

            console.log('✅ [THERMAL-PRINTER] اكتملت عملية الطباعة بنجاح');
            return { success: true, message: 'تم إرسال الإيصال للطباعة' };

        } catch (error) {
            console.error('❌ [THERMAL-PRINTER] خطأ في الطباعة الحرارية:', error);
            return { 
                success: false, 
                error: error.message,
                message: 'فشل في طباعة الإيصال'
            };
        }
    }

    /**
     * Open thermal printer preview in a window
     */
    async previewReceipt(reconciliationData) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        try {
            // Generate receipt HTML
            const htmlContent = this.generateReceiptHTML(reconciliationData);

            // Create a temporary file
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, `preview_${Date.now()}.html`);
            
            // Write HTML to temp file
            fs.writeFileSync(tempFile, htmlContent);
            console.log('📄 [THERMAL-PRINTER] تم كتابة ملف المعاينة:', tempFile);

            // Create preview window
            const previewWindow = new BrowserWindow({
                width: 400,
                height: 600,
                show: true,
                title: 'معاينة الإيصال الحراري - تصفية برو',
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            // Load from file with timeout
            try {
                await Promise.race([
                    previewWindow.loadFile(tempFile),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading file')), 5000))
                ]);
            } catch (loadError) {
                console.warn('⚠️ [THERMAL-PRINTER] تحذير في تحميل ملف المعاينة:', loadError.message);
            }
            
            console.log('✓ [THERMAL-PRINTER] تم فتح معاينة الإيصال');

            // Clean up temp file when window closes
            previewWindow.on('closed', () => {
                setTimeout(() => {
                    try {
                        if (fs.existsSync(tempFile)) {
                            fs.unlinkSync(tempFile);
                            console.log('✓ [THERMAL-PRINTER] تم حذف ملف المعاينة');
                        }
                    } catch (e) {
                        console.error('خطأ في حذف ملف المعاينة:', e);
                    }
                }, 1000);
            });

            return { success: true, windowId: previewWindow.id };

        } catch (error) {
            console.error('❌ [THERMAL-PRINTER] خطأ في معاينة الإيصال:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get supported paper sizes for thermal printers
     */
    getSupportedPaperSizes() {
        return [
            { width: 58, label: '58mm' },
            { width: 80, label: '80mm (قياسي)' },
            { width: 100, label: '100mm' }
        ];
    }

    /**
     * Set paper width and adjust character width accordingly
     */
    setPaperWidth(width) {
        this.paperWidth = width;
        // Approximate characters per line: (width - padding) / char_width_in_mm
        // For monospace font, roughly 8-10 characters per mm at 10pt
        this.charWidth = Math.floor((width - 4) / 2); // Conservative estimate
    }
}

module.exports = ThermalPrinter80mm;
