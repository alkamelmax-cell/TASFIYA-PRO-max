// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

class PDFGenerator {
    constructor(dbManager = null) {
        this.browser = null;
        this.dbManager = dbManager;
    }

    async initialize() {
        try {
            // محاولة العثور على متصفح مثبت
            const executablePath = this.findChromiumExecutable();

            const launchOptions = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security'
                ]
            };

            // إضافة مسار المتصفح إذا تم العثور عليه
            if (executablePath) {
                launchOptions.executablePath = executablePath;
                console.log('✅ [PDF] استخدام متصفح مخصص:', executablePath);
            }

            this.browser = await puppeteer.launch(launchOptions);
            console.log('✅ [PDF] تم تهيئة مولد PDF بنجاح');
            return true;
        } catch (error) {
            console.error('❌ [PDF] خطأ في تهيئة مولد PDF:', error);

            // محاولة إصلاح تلقائي
            const fixed = await this.attemptAutoFix();
            if (fixed) {
                return await this.initialize(); // إعادة المحاولة
            }

            return false;
        }
    }

    /**
     * البحث عن متصفح قابل للتنفيذ
     */
    findChromiumExecutable() {
        const fs = require('fs');
        const possiblePaths = [
            // Chrome paths
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',

            // Chromium paths
            'C:\\Program Files\\Chromium\\Application\\chromium.exe',
            'C:\\Program Files (x86)\\Chromium\\Application\\chromium.exe',

            // Edge paths
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',

            // Brave paths
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ];

        for (const browserPath of possiblePaths) {
            if (fs.existsSync(browserPath)) {
                console.log(`✅ [PDF] تم العثور على متصفح: ${browserPath}`);
                return browserPath;
            }
        }

        console.log('⚠️ [PDF] لم يتم العثور على متصفح مثبت، سيتم استخدام Chromium المدمج');
        return null;
    }

    /**
     * محاولة إصلاح تلقائي
     */
    async attemptAutoFix() {
        console.log('🔧 [PDF] محاولة إصلاح تلقائي...');

        try {
            // محاولة تحميل Chromium
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            console.log('📥 [PDF] تحميل Chromium...');
            await execAsync('npx puppeteer browsers install chrome');
            console.log('✅ [PDF] تم تحميل Chromium بنجاح');

            return true;
        } catch (error) {
            console.error('❌ [PDF] فشل الإصلاح التلقائي:', error.message);
            return false;
        }
    }

    async generateReconciliationReport(reconciliationData) {
        if (!this.browser) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize PDF generator');
            }
        }

        try {
            const page = await this.browser.newPage();

            // Set page to A4 size
            await page.setViewport({ width: 794, height: 1123 });

            // Generate HTML content with options
            const htmlContent = await this.generateReportHTML(reconciliationData, {});

            // Set content with unlimited timeout and less strict wait condition for large data
            await page.setContent(htmlContent, {
                waitUntil: ['load', 'domcontentloaded'],
                timeout: 0
            });

            // Generate PDF with footer on every page
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                timeout: 0, // Unlimited timeout for PDF generation
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '25mm', // زيادة الهامش السفلي لاستيعاب الفوتر
                    left: '15mm'
                },
                displayHeaderFooter: true,
                footerTemplate: `
                    <div style="font-size: 10px; color: #666; text-align: center; width: 100%; padding: 5px 0; font-family: 'Cairo', Arial, sans-serif;">
                        © 2025 محمد أمين الكامل - جميع الحقوق محفوظة - تصفية برو - Tasfiya Pro
                    </div>
                `,
                headerTemplate: '<div></div>' // فوتر فارغ
            });

            await page.close();

            return pdfBuffer;

        } catch (error) {
            console.error('Error generating PDF:', error);
            throw error;
        }
    }

    async generateFromHTML(htmlContent) {
        if (!this.browser) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize PDF generator');
            }
        }

        try {
            const page = await this.browser.newPage();

            // Set page to A4 size
            await page.setViewport({ width: 794, height: 1123 });

            // Set content with unlimited timeout
            await page.setContent(htmlContent, {
                waitUntil: ['load', 'domcontentloaded'],
                timeout: 0
            });

            // Generate PDF with footer on every page
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                timeout: 0,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '25mm', // زيادة الهامش السفلي لاستيعاب الفوتر
                    left: '15mm'
                },
                displayHeaderFooter: true,
                footerTemplate: `
                    <div style="font-size: 10px; color: #666; text-align: center; width: 100%; padding: 5px 0; font-family: 'Cairo', Arial, sans-serif;">
                        © 2025 محمد أمين الكامل - جميع الحقوق محفوظة - تصفية برو - Tasfiya Pro
                    </div>
                `,
                headerTemplate: '<div></div>' // هيدر فارغ
            });

            await page.close();

            return pdfBuffer;

        } catch (error) {
            console.error('PDF generation from HTML error:', error);
            throw error;
        }
    }

    async generateReportHTML(data, options = {}) {
        console.log('📄 [PDF] بدء إنشاء تقرير PDF...');

        // Debug log for new filter enhancement fields
        console.log('🔍 [PDF] فحص الحقول الجديدة الواردة:', {
            timeRangeStart: data.timeRangeStart,
            timeRangeEnd: data.timeRangeEnd,
            filterNotes: data.filterNotes
        });

        const currentDate = new Date().toLocaleDateString('ar-SA');
        const currentTime = new Date().toLocaleTimeString('ar-SA');

        // Get company name from database
        let companyName = 'شركة المثال التجارية';
        try {
            const result = await this.dbManager.get(
                'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ?',
                ['general', 'company_name']
            );
            if (result && result.setting_value) {
                companyName = result.setting_value;
            }
        } catch (error) {
            console.log('ℹ️ [PDF] استخدام اسم افتراضي للشركة');
        }

        // Get branch name from data if available
        let branchName = 'الفرع الرئيسي';
        if (data && data.reconciliation && data.reconciliation.branch_name) {
            branchName = data.reconciliation.branch_name;
        } else if (data && data.branchName) {
            branchName = data.branchName;
        } else if (data && data.branch_name) {
            branchName = data.branch_name;
        } else {
            // Try to get branch name from database
            try {
                const branchResult = await this.dbManager.get(
                    'SELECT branch_name FROM branches WHERE is_active = 1 ORDER BY id LIMIT 1'
                );
                if (branchResult && branchResult.branch_name) {
                    branchName = branchResult.branch_name;
                }
            } catch (error) {
                console.log('ℹ️ [PDF] استخدام اسم افتراضي للفرع');
            }
        }

        return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>تقرير تصفية الكاشير - ${companyName}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap');

                * {
                    font-family: 'Cairo', 'Arial', sans-serif;
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    direction: rtl;
                    text-align: right;
                    font-size: ${this.getEnhancedFontSize(options.fontSize)};
                    font-family: '${options.fontFamily || 'Cairo'}', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background: white;
                    font-weight: bold;
                }

                .company-header {
                    text-align: center;
                    margin-bottom: 20px;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 10px;
                }

                .program-name {
                    font-size: 16px;
                    font-weight: 700;
                    margin-bottom: 5px;
                    color: #f8f9fa;
                }

                .branch-info {
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 10px;
                    color: #e9ecef;
                }

                .company-name {
                    font-size: 28px;
                    font-weight: 700;
                    margin-bottom: 8px;
                }

                .report-title {
                    font-size: 20px;
                    font-weight: 400;
                    opacity: 0.9;
                }

                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 3px solid #3498db;
                    padding-bottom: 20px;
                }
                
                .header h1 {
                    font-size: 24px;
                    font-weight: 700;
                    color: #2c3e50;
                    margin-bottom: 10px;
                }
                
                .header .company-info {
                    font-size: 16px;
                    color: #7f8c8d;
                    margin-bottom: 15px;
                }
                
                .report-info {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                }
                
                .info-section {
                    flex: 1;
                }
                
                .info-section h3 {
                    font-size: 16px;
                    font-weight: 600;
                    color: #2c3e50;
                    margin-bottom: 10px;
                    border-bottom: 2px solid #3498db;
                    padding-bottom: 5px;
                }
                
                .info-item {
                    margin-bottom: 8px;
                    display: flex;
                    justify-content: space-between;
                }
                
                .info-label {
                    font-weight: 600;
                    color: #34495e;
                }

                .info-value {
                    color: #2c3e50;
                }

                .filter-notes {
                    font-style: italic;
                    background: #f8f9fa;
                    padding: 5px 8px;
                    border-radius: 4px;
                    border-left: 3px solid #3498db;
                    margin-top: 5px;
                    display: block;
                    max-width: 100%;
                    word-wrap: break-word;
                }
                
                .section {
                    margin-bottom: 25px;
                }
                
                .section-title {
                    font-size: 22px;
                    font-weight: 700;
                    color: #2c3e50;
                    margin-bottom: 15px;
                    background: linear-gradient(135deg, #3498db, #2980b9);
                    color: white;
                    padding: 15px 20px;
                    border-radius: 8px;
                    text-align: center;
                }
                
                .table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 15px;
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    font-size: 16px;
                }

                .table th {
                    background: #34495e;
                    color: white;
                    padding: 15px;
                    text-align: center;
                    font-weight: 700;
                    font-size: 17px;
                }

                .table td {
                    padding: 12px 15px;
                    border-bottom: 1px solid #ecf0f1;
                    text-align: center;
                    font-size: 16px;
                }

                .total-row {
                    background: linear-gradient(135deg, #27ae60, #2ecc71) !important;
                    color: #000000 !important;
                    font-weight: 900 !important;
                    font-size: 18px !important;
                }

                .total-row td {
                    background: transparent !important;
                    color: #000000 !important;
                    font-weight: 900 !important;
                    font-size: 18px !important;
                    padding: 15px !important;
                    border: 2px solid #27ae60 !important;
                }
                
                .table tbody tr:nth-child(even) {
                    background: #f8f9fa;
                }
                
                .table tfoot td {
                    background: #3498db;
                    color: white;
                    font-weight: 600;
                    font-size: 16px;
                }
                
                .summary-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                
                .summary-box {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    border-right: 4px solid #3498db;
                }
                
                .summary-item {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                    padding: 8px 0;
                    border-bottom: 1px solid #ecf0f1;
                }
                
                .summary-label {
                    font-weight: 600;
                    color: #2c3e50;
                }
                
                .summary-value {
                    font-weight: 700;
                    color: #27ae60;
                    font-family: 'Courier New', monospace;
                }
                
                .final-result {
                    background: linear-gradient(135deg, #2c3e50, #34495e);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                    margin-top: 20px;
                }
                
                .final-result h2 {
                    font-size: 20px;
                    margin-bottom: 10px;
                }
                
                .final-amount {
                    font-size: 24px;
                    font-weight: 700;
                    font-family: 'Courier New', monospace;
                }
                
                .surplus {
                    color: #2ecc71;
                }
                
                .deficit {
                    color: #e74c3c;
                }
                
                .balanced {
                    color: #3498db;
                }
                
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    font-size: 12px;
                    color: #7f8c8d;
                    border-top: 1px solid #ecf0f1;
                    padding-top: 15px;
                    margin-bottom: 20px; /* مساحة إضافية لتجنب التداخل مع فوتر الصفحة */
                }

                /* تأكد من أن المحتوى لا يتداخل مع فوتر الصفحة */
                @page {
                    margin-bottom: 25mm;
                }

                /* قسم التوقيعات */
                .signatures-section {
                    margin-top: 40px;
                    margin-bottom: 30px;
                    padding: 20px;
                }

                .signatures-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: #2c3e50;
                    text-align: center;
                    margin-bottom: 25px;
                    border-bottom: 2px solid #3498db;
                    padding-bottom: 10px;
                }

                .signature-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 25px;
                    align-items: center;
                }

                .signature-item {
                    flex: 1;
                    margin: 0 15px;
                }

                .signature-label {
                    font-size: 16px;
                    font-weight: 600;
                    color: #34495e;
                    margin-bottom: 8px;
                }

                .signature-line {
                    border-bottom: 2px solid #34495e;
                    height: 40px;
                    position: relative;
                }

                /* فوتر الصفحة - يظهر في كل صفحة */
                .page-footer {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 20mm;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    color: #666;
                    border-top: 1px solid #ddd;
                }
                
                @media print {
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            </style>
        </head>
        <body>
            <div class="company-header">
                <div class="program-name">تصفية برو - Tasfiya Pro</div>
                <div class="company-name">${companyName}</div>
                <div class="branch-info">الفرع: ${branchName}</div>
                <div class="report-title">تقرير تصفية الكاشير</div>
            </div>

            <div class="header">
                <h1>تفاصيل التصفية</h1>
            </div>
            
            <div class="report-info">
                <div class="info-section">
                    <h3>معلومات التصفية</h3>
                    <div class="info-item">
                        <span class="info-label">الكاشير:</span>
                        <span class="info-value">${data.cashierName} (${data.cashierNumber})</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">المحاسب:</span>
                        <span class="info-value">${data.accountantName}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">تاريخ التصفية:</span>
                        <span class="info-value">${data.reconciliationDate}</span>
                    </div>
                    ${data.timeRangeStart || data.timeRangeEnd ? `
                    <div class="info-item">
                        <span class="info-label">النطاق الزمني:</span>
                        <span class="info-value">
                            ${data.timeRangeStart && data.timeRangeEnd ?
                    `من ${data.timeRangeStart} إلى ${data.timeRangeEnd}` :
                    data.timeRangeStart ? `من ${data.timeRangeStart}` :
                        `إلى ${data.timeRangeEnd}`
                }
                        </span>
                    </div>
                    ` : ''}
                    ${data.filterNotes ? `
                    <div class="info-item">
                        <span class="info-label">ملاحظات التصفية:</span>
                        <span class="info-value filter-notes">${data.filterNotes}</span>
                    </div>
                    ` : ''}
                </div>
                <div class="info-section">
                    <h3>معلومات التقرير</h3>
                    <div class="info-item">
                        <span class="info-label">تاريخ الطباعة:</span>
                        <span class="info-value">${currentDate}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">وقت الطباعة:</span>
                        <span class="info-value">${currentTime}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">رقم التصفية:</span>
                        <span class="info-value">#${data.reconciliationId}</span>
                    </div>
                </div>
            </div>
            
            ${this.generateBankReceiptsSection(data.bankReceipts)}
            ${this.generateCashReceiptsSection(data.cashReceipts)}
            ${this.generatePostpaidSalesSection(data.postpaidSales)}
            ${this.generateCustomerReceiptsSection(data.customerReceipts)}
            ${this.generateReturnInvoicesSection(data.returnInvoices)}
            ${this.generateSuppliersSection(data.suppliers)}
            ${this.generateSummarySection(data.summary)}

            <div class="footer">
                <p>تم إنشاء هذا التقرير بواسطة تصفية برو - Tasfiya Pro</p>
                <p>Tasfiya Pro - Generated on ${currentDate} at ${currentTime}</p>
                <p>تم تطوير هذا النظام بواسطة محمد أمين الكامل - جميع الحقوق محفوظة © Tasfiya Pro</p>
            </div>
        </body>
        </html>
        `;
    }

    generateBankReceiptsSection(bankReceipts) {
        if (!bankReceipts || bankReceipts.length === 0) {
            return '<div class="section"><div class="section-title">المقبوضات البنكية</div><p>لا توجد مقبوضات بنكية</p></div>';
        }

        const total = bankReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

        return `
        <div class="section">
            <div class="section-title">المقبوضات البنكية</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>نوع العملية</th>
                        <th>الجهاز</th>
                        <th>البنك</th>
                        <th>المبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    ${bankReceipts.map((receipt, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${receipt.operation_type}</td>
                            <td>${receipt.atm_name}</td>
                            <td>${receipt.bank_name}</td>
                            <td>${receipt.amount.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="4">المجموع</td>
                        <td>${total.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        `;
    }

    generateCashReceiptsSection(cashReceipts) {
        if (!cashReceipts || cashReceipts.length === 0) {
            return '<div class="section"><div class="section-title">💰 المقبوضات النقدية</div><p>لا توجد مقبوضات نقدية</p></div>';
        }

        // Sort by denomination descending for better readability
        const sortedCashReceipts = [...cashReceipts].sort((a, b) => (b.denomination || 0) - (a.denomination || 0));

        const total = cashReceipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);
        const totalQuantity = cashReceipts.reduce((sum, receipt) => sum + (receipt.quantity || 0), 0);

        return `
        <div class="section">
            <div class="section-title">💰 المقبوضات النقدية (${cashReceipts.length})</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>الفئة</th>
                        <th>العدد</th>
                        <th>المجموع</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedCashReceipts.map(receipt => `
                        <tr>
                            <td>${this.formatNumber(receipt.denomination || 0)} ريال</td>
                            <td>${this.formatNumber(receipt.quantity || 0)}</td>
                            <td>${this.formatNumber((receipt.total_amount || 0).toFixed(2))} ريال</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr style="background: #e8f5e8; font-weight: bold;">
                        <td>الإجمالي</td>
                        <td>${this.formatNumber(totalQuantity)}</td>
                        <td>${this.formatNumber(total.toFixed(2))} ريال</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        `;
    }

    generatePostpaidSalesSection(postpaidSales) {
        if (!postpaidSales || postpaidSales.length === 0) {
            return '<div class="section"><div class="section-title">المبيعات الآجلة</div><p>لا توجد مبيعات آجلة</p></div>';
        }

        const total = postpaidSales.reduce((sum, sale) => sum + sale.amount, 0);

        return `
        <div class="section">
            <div class="section-title">المبيعات الآجلة</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>اسم العميل</th>
                        <th>المبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    ${postpaidSales.map((sale, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${sale.customer_name}</td>
                            <td>${sale.amount.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="2">المجموع</td>
                        <td>${total.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        `;
    }

    generateCustomerReceiptsSection(customerReceipts) {
        if (!customerReceipts || customerReceipts.length === 0) {
            return '<div class="section"><div class="section-title">مقبوضات العملاء</div><p>لا توجد مقبوضات عملاء</p></div>';
        }

        const total = customerReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

        return `
        <div class="section">
            <div class="section-title">مقبوضات العملاء</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>اسم العميل</th>
                        <th>نوع الدفع</th>
                        <th>المبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    ${customerReceipts.map((receipt, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${receipt.customer_name}</td>
                            <td>${receipt.payment_type}</td>
                            <td>${receipt.amount.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="3">المجموع</td>
                        <td>${total.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        `;
    }

    generateReturnInvoicesSection(returnInvoices) {
        if (!returnInvoices || returnInvoices.length === 0) {
            return '<div class="section"><div class="section-title">فواتير المرتجعات</div><p>لا توجد فواتير مرتجعات</p></div>';
        }

        const total = returnInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

        return `
        <div class="section">
            <div class="section-title">فواتير المرتجعات</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>رقم الفاتورة</th>
                        <th>المبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    ${returnInvoices.map((invoice, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${invoice.invoice_number}</td>
                            <td>${invoice.amount.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="2">المجموع</td>
                        <td>${total.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        `;
    }

    generateSuppliersSection(suppliers) {
        if (!suppliers || suppliers.length === 0) {
            return '<div class="section"><div class="section-title">الموردين (للعرض فقط)</div><p>لا توجد معاملات موردين</p></div>';
        }

        const total = suppliers.reduce((sum, supplier) => sum + supplier.amount, 0);

        return `
        <div class="section">
            <div class="section-title">الموردين (للعرض فقط - لا يؤثر على المجاميع)</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>اسم المورد</th>
                        <th>المبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    ${suppliers.map((supplier, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${supplier.supplier_name}</td>
                            <td>${supplier.amount.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="2">المجموع (للعرض فقط)</td>
                        <td>${total.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        `;
    }

    generateSummarySection(summary) {
        const surplusDeficitClass = summary.surplusDeficit > 0 ? 'surplus' :
            summary.surplusDeficit < 0 ? 'deficit' : 'balanced';

        const surplusDeficitText = summary.surplusDeficit > 0 ? `فائض: ${summary.surplusDeficit.toFixed(2)}` :
            summary.surplusDeficit < 0 ? `عجز: ${Math.abs(summary.surplusDeficit).toFixed(2)}` :
                'متوازن: 0.00';

        return `
        <div class="section">
            <div class="section-title">ملخص التصفية</div>
            <div class="summary-grid">
                <div class="summary-box">
                    <div class="summary-item">
                        <span class="summary-label">إجمالي المقبوضات البنكية:</span>
                        <span class="summary-value">${summary.bankTotal.toFixed(2)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">إجمالي المقبوضات النقدية:</span>
                        <span class="summary-value">${summary.cashTotal.toFixed(2)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">إجمالي المبيعات الآجلة:</span>
                        <span class="summary-value">${summary.postpaidTotal.toFixed(2)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">إجمالي مقبوضات العملاء:</span>
                        <span class="summary-value">${summary.customerTotal.toFixed(2)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">إجمالي المرتجعات:</span>
                        <span class="summary-value">${summary.returnTotal.toFixed(2)}</span>
                    </div>
                </div>
                <div class="summary-box">
                    <div class="summary-item">
                        <span class="summary-label">مبيعات النظام:</span>
                        <span class="summary-value">${summary.systemSales.toFixed(2)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">إجمالي المقبوضات:</span>
                        <span class="summary-value">${summary.totalReceipts.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div class="final-result">
                <h2>النتيجة النهائية</h2>
                <div class="final-amount ${surplusDeficitClass}">
                    ${surplusDeficitText}
                </div>
            </div>
        </div>

        ${this.generateSignaturesSection()}
        `;
    }

    generateSignaturesSection() {
        return `
        <div class="signatures-section">
            <div class="signatures-title">التوقيعات</div>
            <div class="signature-row">
                <div class="signature-item">
                    <div class="signature-label">توقيع المحاسب:</div>
                    <div class="signature-line"></div>
                </div>
                <div class="signature-item">
                    <div class="signature-label">توقيع المدير:</div>
                    <div class="signature-line"></div>
                </div>
                <div class="signature-item">
                    <div class="signature-label">توقيع الكاشير:</div>
                    <div class="signature-line"></div>
                </div>
            </div>
        </div>
        `;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    // Helper method to format numbers using English digits
    formatNumber(number) {
        if (number === null || number === undefined) return '0';

        try {
            return new Intl.NumberFormat('en-US').format(number);
        } catch (error) {
            console.error('Error formatting number:', error);
            return String(number);
        }
    }

    // Helper method to get font size based on setting
    getFontSize(fontSize) {
        const fontSizes = {
            'small': '12px',
            'normal': '14px',
            'large': '16px',
            'extra-large': '18px'
        };
        return fontSizes[fontSize] || fontSizes['normal'];
    }

    // Helper method to get optimized font size for A4 single page
    getEnhancedFontSize(fontSize) {
        const optimizedFontSizes = {
            'small': '12px',   /* صغير - محسن للقراءة الواضحة */
            'normal': '14px',  /* عادي - محسن للقراءة الواضحة */
            'large': '16px',   /* كبير - محسن للقراءة الواضحة */
            'extra-large': '18px' /* كبير جداً - محسن للقراءة الواضحة */
        };
        return optimizedFontSizes[fontSize] || optimizedFontSizes['normal'];
    }
}

module.exports = PDFGenerator;
