// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

// Advanced Print Manager for Tasfiya Pro
// Provides advanced printing capabilities with printer selection and customization

const path = require('path');
const { BrowserWindow, webContents } = require('electron');
const { createSecureWebPreferences } = require('./window-security');

// ===================================================================
// DATE FORMATTING UTILITIES - GREGORIAN CALENDAR ONLY
// ===================================================================

/**
 * Format date using Gregorian calendar only (DD/MM/YYYY format)
 */
function formatDate(dateString) {
    if (!dateString) return 'غير محدد';

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'غير محدد';

        // Format as DD/MM/YYYY using English numbers
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'غير محدد';
    }
}

/**
 * Format date and time using Gregorian calendar only
 */
function formatDateTime(dateTimeString) {
    if (!dateTimeString) return 'غير محدد';

    try {
        const date = new Date(dateTimeString);
        if (isNaN(date.getTime())) return 'غير محدد';

        // Format as DD/MM/YYYY HH:MM using English numbers
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (error) {
        console.error('Error formatting datetime:', error);
        return 'غير محدد';
    }
}

class PrintManager {
    // تحويل عنوان الجدول إلى نص آمن للاستخدام في معرفات CSS و JavaScript
    sanitizeTitle(title) {
        return title
            .replace(/[\u0621-\u064A]/g, '') // إزالة الحروف العربية
            .replace(/\s+/g, '-')            // استبدال المسافات بشرطة
            .replace(/[^a-zA-Z0-9-]/g, '')   // إزالة أي حروف غير آمنة
            .toLowerCase();
    }

    constructor() {
        this.printers = [];
        this.defaultPrinter = null;
        this.printSettings = {
            paperSize: 'A4',
            orientation: 'portrait',
            margins: {
                top: 0.5,    /* تقليل الهوامش لاستغلال المساحة */
                bottom: 0.5, /* تقليل الهوامش لاستغلال المساحة */
                left: 0.5,   /* تقليل الهوامش لاستغلال المساحة */
                right: 0.5   /* تقليل الهوامش لاستغلال المساحة */
            },
            copies: 1,
            color: false,
            duplex: 'simplex',
            fontSize: 'normal', /* استخدام خط عادي افتراضياً */
            fontFamily: 'Cairo'
        };
    }

    // Initialize print manager and get available printers
    async initialize() {
        try {
            await this.refreshPrinters();
            console.log('Print manager initialized successfully');
            return true;
        } catch (error) {
            console.error('Print manager initialization error:', error);
            return false;
        }
    }

    // Get list of available printers
    async refreshPrinters() {
        try {
            // Use the main window to get printers
            const { webContents } = require('electron');
            const allWebContents = webContents.getAllWebContents();

            if (allWebContents.length > 0) {
                this.printers = await allWebContents[0].getPrinters();
                this.defaultPrinter = this.printers.find(printer => printer.isDefault) || this.printers[0];

                console.log(`Found ${this.printers.length} printers`);
                return this.printers;
            } else {
                // Fallback: create mock printer data
                this.printers = [
                    {
                        name: 'default',
                        displayName: 'الطابعة الافتراضية',
                        description: 'طابعة النظام الافتراضية',
                        status: 'available',
                        isDefault: true
                    }
                ];
                this.defaultPrinter = this.printers[0];
                console.log('Using fallback printer data');
                return this.printers;
            }
        } catch (error) {
            console.error('Error getting printers:', error);
            // Fallback: create mock printer data
            this.printers = [
                {
                    name: 'default',
                    displayName: 'الطابعة الافتراضية',
                    description: 'طابعة النظام الافتراضية',
                    status: 'available',
                    isDefault: true
                }
            ];
            this.defaultPrinter = this.printers[0];
            console.log('Using fallback printer data due to error');
            return this.printers;
        }
    }

    // Get available printers list
    getPrinters() {
        return this.printers.map(printer => ({
            name: printer.name,
            displayName: printer.displayName || printer.name,
            description: printer.description || '',
            status: printer.status || 'unknown',
            isDefault: printer.isDefault || false
        }));
    }

    // Get default printer
    getDefaultPrinter() {
        return this.defaultPrinter;
    }

    // Set print settings
    updatePrintSettings(settings) {
        this.printSettings = { ...this.printSettings, ...settings };
    }

    // Get current print settings
    getPrintSettings() {
        return { ...this.printSettings };
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
            'small': '12px',    /* صغير - محسن للقراءة الواضحة */
            'normal': '14px',   /* عادي - محسن للقراءة الواضحة */
            'large': '16px',    /* كبير - محسن للقراءة الواضحة */
            'extra-large': '18px' /* كبير جداً - محسن للقراءة الواضحة */
        };
        return optimizedFontSizes[fontSize] || optimizedFontSizes['normal'];
    }

    getSafeTimeoutMs(value, fallbackMs) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
    }

    isPseudoDefaultPrinterName(printerName) {
        const normalized = String(printerName || '').trim().toLowerCase();
        return (
            normalized === 'default'
            || normalized === 'system default'
            || normalized === 'default printer'
            || normalized === 'الطابعة الافتراضية'
        );
    }

    async getAvailablePrintersForPrint(targetWebContents) {
        if (targetWebContents) {
            try {
                if (typeof targetWebContents.getPrintersAsync === 'function') {
                    const printers = await targetWebContents.getPrintersAsync();
                    if (Array.isArray(printers) && printers.length > 0) {
                        return printers;
                    }
                }
            } catch (error) {
                console.warn('Could not get printers with getPrintersAsync:', error.message);
            }

            try {
                if (typeof targetWebContents.getPrinters === 'function') {
                    const printers = targetWebContents.getPrinters();
                    if (Array.isArray(printers) && printers.length > 0) {
                        return printers;
                    }
                }
            } catch (error) {
                console.warn('Could not get printers with getPrinters:', error.message);
            }
        }

        if (Array.isArray(this.printers) && this.printers.length > 0) {
            return this.printers;
        }

        try {
            const refreshed = await this.refreshPrinters();
            if (Array.isArray(refreshed) && refreshed.length > 0) {
                return refreshed;
            }
        } catch (error) {
            console.warn('Could not refresh printers before direct print:', error.message);
        }

        return [];
    }

    async resolveValidDeviceName(targetWebContents, requestedDeviceName) {
        const requested = String(requestedDeviceName || '').trim();
        if (!requested || this.isPseudoDefaultPrinterName(requested)) {
            return '';
        }

        const availablePrinters = await this.getAvailablePrintersForPrint(targetWebContents);
        if (!Array.isArray(availablePrinters) || availablePrinters.length === 0) {
            return '';
        }

        const exactName = availablePrinters.find((printer) => String(printer.name || '').trim() === requested);
        if (exactName && !this.isPseudoDefaultPrinterName(exactName.name)) {
            return String(exactName.name || '').trim();
        }

        const exactDisplay = availablePrinters.find((printer) => String(printer.displayName || '').trim() === requested);
        if (exactDisplay && exactDisplay.name) {
            return String(exactDisplay.name || '').trim();
        }

        const normalizedRequested = requested.toLowerCase();
        const caseInsensitiveName = availablePrinters.find((printer) => (
            String(printer.name || '').trim().toLowerCase() === normalizedRequested
        ));
        if (caseInsensitiveName && !this.isPseudoDefaultPrinterName(caseInsensitiveName.name)) {
            return String(caseInsensitiveName.name || '').trim();
        }

        const caseInsensitiveDisplay = availablePrinters.find((printer) => (
            String(printer.displayName || '').trim().toLowerCase() === normalizedRequested
        ));
        if (caseInsensitiveDisplay && caseInsensitiveDisplay.name) {
            return String(caseInsensitiveDisplay.name || '').trim();
        }

        return '';
    }

    async loadHtmlIntoPrintWindow(printWindow, htmlContent, timeoutMs = 15000) {
        let timeoutId = null;
        const loadUrlPromise = printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

        try {
            return await Promise.race([
                loadUrlPromise,
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error('انتهت مهلة تحميل محتوى الطباعة'));
                    }, timeoutMs);
                })
            ]);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    async printWebContentsWithTimeout(targetWebContents, printOptions, timeoutMs = 30000) {
        return await new Promise((resolve, reject) => {
            let settled = false;

            const finish = (value, isError = false) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeoutId);
                if (isError) {
                    reject(value);
                    return;
                }
                resolve(value);
            };

            const timeoutId = setTimeout(() => {
                finish(new Error('انتهت مهلة تنفيذ أمر الطباعة'), true);
            }, timeoutMs);

            try {
                targetWebContents.print(printOptions, (success, failureReason) => {
                    if (success) {
                        finish({ success: true });
                        return;
                    }

                    finish(new Error(failureReason || 'فشل أمر الطباعة بدون سبب واضح'), true);
                });
            } catch (error) {
                finish(error, true);
            }
        });
    }

    // Print HTML content directly
    async printHTML(htmlContent, options = {}) {
        let printWindow = null;

        try {
            // Ensure proper deep merge of print settings
            const settings = {
                ...this.printSettings,
                ...options,
                margins: { ...this.printSettings.margins, ...(options.margins || {}) },
                color: options.color !== undefined ? options.color : this.printSettings.color
            };

            // Create print window
            printWindow = new BrowserWindow({
                show: false,
                webPreferences: createSecureWebPreferences(__dirname)
            });

            const loadTimeoutMs = this.getSafeTimeoutMs(settings.loadTimeoutMs, 15000);
            await this.loadHtmlIntoPrintWindow(printWindow, htmlContent, loadTimeoutMs);

            // Print options
            const printOptions = {
                silent: settings.silent !== undefined ? Boolean(settings.silent) : true,
                printBackground: true,
                color: settings.color || false,
                margin: {
                    marginType: 'custom',
                    top: settings.margins.top || 1,
                    bottom: settings.margins.bottom || 1,
                    left: settings.margins.left || 1,
                    right: settings.margins.right || 1
                },
                landscape: settings.orientation === 'landscape',
                scaleFactor: settings.scaleFactor || 100,
                pagesPerSheet: 1,
                collate: true,
                copies: settings.copies || 1,
                pageRanges: settings.pageRanges || '',
                duplexMode: settings.duplex || 'simplex',
                dpi: settings.dpi || { horizontal: 300, vertical: 300 }
            };

            // Attach printer only when it exists in current OS printers list.
            const resolvedDeviceName = await this.resolveValidDeviceName(printWindow.webContents, settings.printerName);
            if (resolvedDeviceName) {
                printOptions.deviceName = resolvedDeviceName;
            } else if (settings.printerName) {
                console.warn(`Requested printer "${settings.printerName}" is not available. Falling back to system default printer.`);
            }

            // Print the content
            const printTimeoutMs = this.getSafeTimeoutMs(settings.printTimeoutMs, 30000);
            await this.printWebContentsWithTimeout(printWindow.webContents, printOptions, printTimeoutMs);
            return { success: true, printed: true };

        } catch (error) {
            console.error('Print error:', error);
            return { success: false, error: error.message };
        } finally {
            if (printWindow && !printWindow.isDestroyed()) {
                printWindow.close();
            }
        }
    }

    // Print with preview
    async printWithPreview(htmlContent, options = {}) {
        try {
            const settings = { ...this.printSettings, ...options };
            
            // Create preview window
            const previewWindow = new BrowserWindow({
                width: 1000,
                height: 800,
                show: true,
                title: 'معاينة الطباعة - تصفية برو - Tasfiya Pro',
                webPreferences: createSecureWebPreferences(__dirname)
            });

            // Create preview HTML with print controls
            const previewHTML = this.createPreviewHTML(htmlContent, settings);
            
            // Load preview content
            await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewHTML)}`);

            return { success: true, window: previewWindow };

        } catch (error) {
            console.error('Preview error:', error);
            return { success: false, error: error.message };
        }
    }

    // Create preview HTML with controls
    createPreviewHTML(content, settings) {
        return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>معاينة الطباعة</title>
            <style>
                body {
                    font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 0;
                    background: #f5f5f5;
                }
                .preview-header {
                    background: #fff;
                    padding: 15px;
                    border-bottom: 1px solid #ddd;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .preview-controls {
                    display: flex;
                    gap: 10px;
                }
                .btn {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: inherit;
                }
                .btn-primary {
                    background: #0d6efd;
                    color: white;
                }
                .btn-secondary {
                    background: #6c757d;
                    color: white;
                }
                .preview-content {
                    max-width: 210mm;
                    margin: 20px auto;
                    background: white;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    min-height: 297mm;
                    padding: ${settings.margins.top}cm ${settings.margins.right}cm ${settings.margins.bottom}cm ${settings.margins.left}cm;
                    box-sizing: border-box;
                }
                @media print {
                    .preview-header { display: none; }
                    .preview-content {
                        box-shadow: none;
                        margin: 0;
                        max-width: none;
                    }
                    body { background: white; }
                }
            </style>
        </head>
        <body>
            <div class="preview-header">
                <h3>معاينة الطباعة</h3>
                <div class="preview-controls">
                    <button class="btn btn-primary" onclick="window.print()">طباعة</button>
                    <button class="btn btn-secondary" onclick="window.close()">إغلاق</button>
                </div>
            </div>
            <div class="preview-content">
                ${content}
            </div>
        </body>
        </html>
        `;
    }

    // Generate print-ready HTML for reconciliation report
    generateReconciliationPrintHTML(reconciliationData, options = {}) {
        console.log('📄 [PRINT-MANAGER] إنشاء محتوى HTML للطباعة');
        console.log('📝 [PRINT-MANAGER] حجم الخط المختار:', options.fontSize || this.printSettings.fontSize);
        console.log('📏 [PRINT-MANAGER] حجم الخط المحسوب:', this.getEnhancedFontSize(options.fontSize || this.printSettings.fontSize));

        // Validate input data
        if (!reconciliationData) {
            throw new Error('بيانات التصفية مفقودة');
        }

        const {
            reconciliation,
            bankReceipts = [],
            cashReceipts = [],
            postpaidSales = [],
            customerReceipts = [],
            returnInvoices = [],
            suppliers = []
        } = reconciliationData;

        // Validate reconciliation data
        if (!reconciliation) {
            throw new Error('بيانات التصفية الأساسية مفقودة');
        }

        // Print manager with filter enhancement fields support

        // Ensure required fields exist with defaults including new filter enhancement fields
        const safeReconciliation = {
            id: reconciliation.id || 'غير محدد',
            cashier_name: reconciliation.cashier_name || 'غير محدد',
            cashier_number: reconciliation.cashier_number || 'غير محدد',
            accountant_name: reconciliation.accountant_name || 'غير محدد',
            reconciliation_date: reconciliation.reconciliation_date || new Date().toISOString().split('T')[0],
            system_sales: reconciliation.system_sales || 0,
            total_receipts: reconciliation.total_receipts || 0,
            surplus_deficit: reconciliation.surplus_deficit || 0,
            status: reconciliation.status || 'مسودة',
            created_at: reconciliation.created_at || new Date().toISOString(),
            last_modified_date: reconciliation.last_modified_date || null,
            // Add new filter enhancement fields
            time_range_start: reconciliation.time_range_start || null,
            time_range_end: reconciliation.time_range_end || null,
            filter_notes: reconciliation.filter_notes || null
        };

        return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>تقرير التصفية #${safeReconciliation.id}</title>
            <script>
                function toggleAll(checkbox, section) {
                    const checkboxes = document.querySelectorAll('input[type="checkbox"][id^="' + section + '"]');
                    checkboxes.forEach(cb => cb.checked = checkbox.checked);
                }
            </script>
            <style>
                @media screen {
                    /* إظهار مربعات الاختيار في وضع المعاينة فقط */
                    .print-checkbox {
                        width: 30px;
                        text-align: center;
                        padding: 5px !important;
                    }
                    .print-checkbox input[type="checkbox"] {
                        width: 16px;
                        height: 16px;
                        cursor: pointer;
                    }
                }
                @media print {
                    /* إخفاء مربعات الاختيار عند الطباعة */
                    .print-checkbox {
                        display: none !important;
                    }
                }
                body {
                    font-family: '${options.fontFamily || this.printSettings.fontFamily || 'Cairo'}', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    font-size: ${this.getEnhancedFontSize(options.fontSize || this.printSettings.fontSize)}; /* استخدام إعدادات حجم الخط */
                    line-height: 1.1; /* تقليل المسافة بين الأسطر */
                    color: #333;
                    margin-bottom: 15mm; /* تقليل مساحة الفوتر */
                    font-weight: bold;
                    padding: 3mm; /* إضافة حشو صغير */
                }

                /* فوتر الصفحة - محسن للضغط في صفحة واحدة */
                @page {
                    size: A4 portrait;
                    margin: 8mm 6mm 12mm 6mm; /* تقليل الهوامش */
                    @bottom-center {
                        content: "تم تطوير هذا النظام بواسطة محمد أمين - جميع الحقوق محفوظة © Tasfiya Pro";
                        font-size: 7px; /* تقليل حجم خط الفوتر */
                        color: #666;
                        font-family: 'Cairo', Arial, sans-serif;
                    }
                }

                /* قسم التوقيعات - محسن للضغط */
                .signatures-section {
                    margin-top: 10px; /* تقليل المسافة */
                    margin-bottom: 8mm; /* تقليل المسافة */
                    padding: 5px; /* تقليل الحشو */
                    page-break-inside: avoid;
                }

                .signatures-title {
                    font-size: 10px; /* تقليل حجم الخط */
                    font-weight: 700;
                    color: #2c3e50;
                    text-align: center;
                    margin-bottom: 8px; /* تقليل المسافة */
                    border-bottom: 1px solid #3498db; /* تقليل سمك الحد */
                    padding-bottom: 3px; /* تقليل الحشو */
                }

                .signature-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                    align-items: center;
                }

                .signature-item {
                    flex: 1;
                    margin: 0 10px;
                }

                .signature-label {
                    font-size: 14px;
                    font-weight: 600;
                    color: #34495e;
                    margin-bottom: 6px;
                }

                .signature-line {
                    border-bottom: 2px solid #34495e;
                    height: 35px;
                    position: relative;
                }

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
                    z-index: 1000;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #333;
                    padding-bottom: 15px;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                    color: #2c3e50;
                }
                .header h2 {
                    margin: 5px 0;
                    font-size: 18px;
                    color: #34495e;
                }
                .header h3 {
                    margin: 5px 0 0 0;
                    font-size: 16px;
                    color: #7f8c8d;
                }
                .info-section {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 5px;
                }
                .info-group h4 {
                    margin: 0 0 10px 0;
                    color: #495057;
                    border-bottom: 1px solid #dee2e6;
                    padding-bottom: 5px;
                }
                .info-group p {
                    margin: 5px 0;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 8px; /* تقليل المسافة */
                    font-size: 8px; /* تقليل حجم الخط */
                    border-radius: 3px; /* تقليل الحواف المدورة */
                    overflow: hidden;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1); /* تقليل الظل */
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 3px; /* تقليل الحشو */
                    text-align: right;
                    font-size: 0.9em; /* نسبي لحجم الخط الأساسي */
                }
                th {
                    background: #34495e;
                    color: white;
                    font-weight: 700;
                    font-size: 0.9em; /* نسبي لحجم الخط الأساسي */
                }
                .total-row {
                    background: linear-gradient(135deg, #27ae60, #2ecc71) !important;
                    color: #000000 !important;
                    font-weight: 900 !important;
                    font-size: 1em !important; /* نسبي لحجم الخط الأساسي */
                }
                .total-row td {
                    background: transparent !important;
                    color: #000000 !important;
                    font-weight: 900 !important;
                    font-size: 1em !important; /* نسبي لحجم الخط الأساسي */
                    border: 2px solid #000000 !important; /* جعل الحدود سوداء وأكثر سمكًا */
                }
                th {
                    background-color: #f8f9fa;
                    font-weight: bold;
                }
                .section-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: #2c3e50;
                    margin-bottom: 15px;
                    background: linear-gradient(135deg, #3498db, #2980b9);
                    color: white;
                    padding: 15px 20px;
                    border-radius: 8px;
                    text-align: center;
                }
                .summary {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 5px;
                    margin-top: 20px;
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 5px 0;
                    padding: 5px 0;
                    border-bottom: 1px dotted #ccc;
                }
                .summary-row:last-child {
                    border-bottom: 2px solid #333;
                    font-weight: bold;
                    font-size: 14px;
                }
                .text-success { color: #28a745; }
                .text-danger { color: #dc3545; }
                .text-muted { color: #6c757d; }
                @media print {
                    body { font-size: 10px; }
                    .info-section { flex-direction: column; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>تصفية برو - Tasfiya Pro</h1>
                <h2>${safeReconciliation.company_name || 'شركة المثال التجارية'}</h2>
                <h3>تقرير التصفية رقم #${safeReconciliation.id}</h3>
            </div>

            <div class="info-section">
                <div class="info-group">
                    <h4>معلومات التصفية</h4>
                    <p><strong>الفرع:</strong> ${safeReconciliation.branch_name || 'الفرع الرئيسي'}</p>
                    <p><strong>الكاشير:</strong> ${safeReconciliation.cashier_name} (${safeReconciliation.cashier_number})</p>
                    <p><strong>المحاسب:</strong> ${safeReconciliation.accountant_name}</p>
                    <p><strong>تاريخ التصفية:</strong> ${formatDate(safeReconciliation.reconciliation_date)}</p>
                    ${safeReconciliation.time_range_start || safeReconciliation.time_range_end ? `
                    <p><strong>النطاق الزمني:</strong>
                        ${safeReconciliation.time_range_start && safeReconciliation.time_range_end ?
                            `من ${safeReconciliation.time_range_start} إلى ${safeReconciliation.time_range_end}` :
                            safeReconciliation.time_range_start ? `من ${safeReconciliation.time_range_start}` :
                            `إلى ${safeReconciliation.time_range_end}`
                        }
                    </p>
                    ` : ''}
                    ${safeReconciliation.filter_notes ? `
                    <div style="margin-top: 10px; padding: 8px; background: #f8f9fa; border-left: 3px solid #3498db; border-radius: 4px;">
                        <p><strong>ملاحظات التصفية:</strong></p>
                        <p style="font-style: italic; color: #2c3e50; margin: 5px 0 0 0;">${safeReconciliation.filter_notes}</p>
                    </div>
                    ` : ''}
                </div>
                <div class="info-group">
                    <h4>تواريخ مهمة</h4>
                    <p><strong>تاريخ الإنشاء:</strong> ${formatDate(safeReconciliation.created_at)}</p>
                    ${safeReconciliation.last_modified_date ?
                        `<p><strong>آخر تعديل:</strong> ${formatDate(safeReconciliation.last_modified_date)}</p>` :
                        '<p><strong>آخر تعديل:</strong> لم يتم التعديل</p>'
                    }
                    <p><strong>الحالة:</strong> ${safeReconciliation.status === 'completed' ? 'مكتملة' : 'مسودة'}</p>
                </div>
            </div>

            ${this.generateTableSection('المقبوضات البنكية', bankReceipts, [
                { key: 'serial', title: 'الرقم', serial: true },
                { key: 'operation_type', title: 'نوع العملية' },
                { key: 'atm_name', title: 'اسم الجهاز' },
                { key: 'bank_name', title: 'البنك' },
                { key: 'amount', title: 'المبلغ', currency: true }
            ])}

            ${this.generateCashReceiptsSection(cashReceipts)}

            ${this.generateTableSection('المبيعات الآجلة', postpaidSales, [
                { key: 'serial', title: 'الرقم', serial: true },
                { key: 'customer_name', title: 'اسم العميل' },
                { key: 'amount', title: 'المبلغ', currency: true }
            ])}

            ${this.generateTableSection('مقبوضات العملاء', customerReceipts, [
                { key: 'serial', title: 'الرقم', serial: true },
                { key: 'customer_name', title: 'اسم العميل' },
                { key: 'payment_type', title: 'نوع الدفع' },
                { key: 'amount', title: 'المبلغ', currency: true }
            ])}

            ${this.generateTableSection('فواتير المرتجع', returnInvoices, [
                { key: 'serial', title: 'الرقم', serial: true },
                { key: 'invoice_number', title: 'رقم الفاتورة' },
                { key: 'amount', title: 'المبلغ', currency: true }
            ])}

            ${this.generateTableSection('الموردين', suppliers, [
                { key: 'serial', title: 'الرقم', serial: true },
                { key: 'supplier_name', title: 'اسم المورد' },
                { key: 'amount', title: 'المبلغ', currency: true }
            ])}

            <div class="summary">
                <h3 style="margin-top: 0;">ملخص التصفية</h3>
                <div class="summary-row">
                    <span>إجمالي المقبوضات:</span>
                    <span>${safeReconciliation.total_receipts.toFixed(2)} ريال</span>
                </div>
                <div class="summary-row">
                    <span>مبيعات النظام:</span>
                    <span>${safeReconciliation.system_sales.toFixed(2)} ريال</span>
                </div>
                <div class="summary-row ${safeReconciliation.surplus_deficit >= 0 ? 'text-success' : 'text-danger'}">
                    <span>${safeReconciliation.surplus_deficit >= 0 ? 'الفائض:' : 'العجز:'}</span>
                    <span>${Math.abs(safeReconciliation.surplus_deficit).toFixed(2)} ريال</span>
                </div>
            </div>

            ${this.generateSignaturesSection()}

            <!-- فوتر الصفحة - يظهر في كل صفحة مطبوعة -->
            <div class="page-footer">
                تم تطوير هذا النظام بواسطة محمد أمين الكامل - جميع الحقوق محفوظة © Tasfiya Pro
            </div>

            ${this.generateNonColoredPrintStyles(options.color !== false)}
        </body>
        </html>
        `;
    }

    /**
     * Generate non-colored print styles for black and white printing
     * @param {boolean} isColorPrint - Whether colored printing is enabled
     * @returns {string} CSS styles for non-colored printing
     */
    generateNonColoredPrintStyles(isColorPrint) {
        if (isColorPrint) {
            return ''; // Return empty string if colored printing is enabled
        }

        return `
            <style id="non-colored-print-styles">
                /* Non-colored print styles - Apply black color to all elements */
                @media print {
                    * {
                        color: #000000 !important;
                        background-color: transparent !important;
                        background-image: none !important;
                        border-color: #000000 !important;
                        text-shadow: none !important;
                        box-shadow: none !important;
                    }

                    /* Headers and titles */
                    h1, h2, h3, h4, h5, h6,
                    .header, .title, .company-name, .report-title,
                    .section-title, .table-header, .info-group h4 {
                        color: #000000 !important;
                        background: transparent !important;
                    }

                    /* Table elements */
                    table, th, td, tr, thead, tbody, tfoot {
                        color: #000000 !important;
                        background: transparent !important;
                        border-color: #000000 !important;
                    }

                    /* Status indicators and badges */
                    .badge, .status-balanced, .status-surplus, .status-deficit,
                    .badge-excellent, .badge-very-good, .badge-good,
                    .badge-acceptable, .badge-needs-improvement,
                    .bg-success, .bg-warning, .bg-danger, .bg-info, .bg-primary,
                    .text-success, .text-warning, .text-danger, .text-info, .text-primary {
                        color: #000000 !important;
                        background: transparent !important;
                        border: 1px solid #000000 !important;
                    }

                    /* Currency and monetary values */
                    .currency, .money, .amount, .price, .value, .cost,
                    .text-currency, .summary-value, .total-amount, .balance-amount,
                    .info-value, .financial-value, .monetary-display {
                        color: #000000 !important;
                        background: transparent !important;
                        font-weight: bold !important;
                    }

                    /* Summary and totals */
                    .summary-item, .total-amount, .balance-info,
                    .reconciliation-summary, .section-summary, .summary,
                    .summary-row, .total-display, .balance-display {
                        color: #000000 !important;
                        background: transparent !important;
                    }

                    /* Dates and references */
                    .date, .datetime, .timestamp, .reference, .reference-number,
                    .id, .number, .code, .serial, .transaction-id {
                        color: #000000 !important;
                        background: transparent !important;
                    }

                    /* Status and balance indicators */
                    .balance, .deficit, .surplus, .status, .state,
                    .positive, .negative, .neutral, .balanced,
                    .text-deficit, .text-surplus {
                        color: #000000 !important;
                        background: transparent !important;
                        border: 1px solid #000000 !important;
                    }

                    /* Special elements */
                    .star-rating, .rating-stars, .performance-badge {
                        color: #000000 !important;
                        text-shadow: none !important;
                        background: transparent !important;
                    }

                    /* Footer and page info */
                    .footer, .page-footer, .print-date, .page-number,
                    .copyright, .watermark {
                        color: #000000 !important;
                        background: transparent !important;
                    }

                    /* Borders and lines */
                    hr, .divider, .separator, .line {
                        border-color: #000000 !important;
                        background-color: #000000 !important;
                    }

                    /* Form elements in print */
                    input, select, textarea, .form-control, .form-select {
                        color: #000000 !important;
                        background: transparent !important;
                        border-color: #000000 !important;
                    }

                    /* Ensure all text is black */
                    p, span, div, label, strong, em, i, b, small, code,
                    .text, .content, .description, .note, .comment {
                        color: #000000 !important;
                    }

                    /* Override any gradient backgrounds */
                    .gradient, .bg-gradient, [style*="gradient"] {
                        background: transparent !important;
                        background-image: none !important;
                    }

                    /* SPECIFIC SELECTORS FOR IDENTIFIED PROBLEMATIC ELEMENTS */

                    /* Section headers and titles - المبيعات الآجلة، الموردين، عناوين الجداول */
                    .section-title, .report-section-title, .table-section-title,
                    .section h3, .section h4, .section h5,
                    .info-group h4, .summary h3, .section-header {
                        color: #000000 !important;
                        background: transparent !important;
                        font-weight: bold !important;
                    }

                    /* Total amounts and financial summaries - إجمالي المقبوضات، إجمالي المبيعات */
                    .summary-row, .summary-row span, .summary-label,
                    .total-label, .grand-total, .summary-value,
                    .info-value, .financial-summary, .amount-summary,
                    .total-receipts, .system-sales, .surplus-deficit {
                        color: #000000 !important;
                        background: transparent !important;
                        font-weight: bold !important;
                    }

                    /* Status indicators and reconciliation status - حالة التصفية، مؤشرات الحالة */
                    .status-text, .reconciliation-status, .status-indicator,
                    .text-success, .text-danger, .text-warning, .text-info,
                    .text-muted, .status-badge, .completion-status,
                    .reconciliation-state, .process-status {
                        color: #000000 !important;
                        background: transparent !important;
                        border: 1px solid #000000 !important;
                    }

                    /* Table headers and column headers - رؤوس الأعمدة */
                    th, thead th, .table-header, .column-header,
                    table thead tr th, .data-table th, .report-table th {
                        color: #000000 !important;
                        background: transparent !important;
                        font-weight: bold !important;
                        border: 1px solid #000000 !important;
                    }

                    /* Info labels and values */
                    .info-label, .info-item span, .label-text,
                    .field-label, .data-label, .report-label {
                        color: #000000 !important;
                        background: transparent !important;
                    }

                    /* Override any colored text classes */
                    [class*="text-"], [class*="bg-"], [style*="color"] {
                        color: #000000 !important;
                        background: transparent !important;
                    }
                }
            </style>
        `;
    }

    // Helper method to generate table sections with checkboxes for specific tables
    generateTableSection(title, data, columns) {
        if (!data || data.length === 0) {
            return `
                <div class="section-title">${title}</div>
                <p class="text-muted">لا توجد بيانات</p>
            `;
        }

        // تحديد ما إذا كان يجب إضافة مربعات اختيار لهذا الجدول
        const needsCheckbox = title === 'المبيعات الآجلة' || title === 'مقبوضات العملاء' || title === 'الموردين';

        // بناء عنصر style خاص بمربعات الاختيار لهذا الجدول
        const checkboxStyles = needsCheckbox ? `
            <style>
                .checkbox-${this.sanitizeTitle(title)} {
                    width: 20px;
                    height: 20px;
                    margin: 0;
                    cursor: pointer;
                }
                .checkbox-column-${this.sanitizeTitle(title)} {
                    width: 30px;
                    text-align: center;
                    padding: 5px !important;
                }
                @media print {
                    .checkbox-column-${this.sanitizeTitle(title)} {
                        display: table-cell !important;
                    }
                }
            </style>
        ` : '';

        const tableRows = data.map((item, index) => {
            let checkboxCell = '';
            if (needsCheckbox) {
                checkboxCell = `<td class="checkbox-column-${this.sanitizeTitle(title)}">
                    <input type="checkbox" class="checkbox-${this.sanitizeTitle(title)}"
                           id="${this.sanitizeTitle(title)}-${index}" 
                           name="${this.sanitizeTitle(title)}-${index}">
                </td>`;
            }

            const cells = columns.map(col => {
                let value;
                if (col.serial) {
                    value = index + 1;
                } else {
                    value = item[col.key];
                    if (col.currency && typeof value === 'number') {
                        value = value.toFixed(2) + ' ريال';
                    }
                }
                return `<td>${value || '-'}</td>`;
            }).join('');

            return `<tr>${checkboxCell}${cells}</tr>`;
        }).join('');

        // Calculate total for currency columns
        const currencyColumn = columns.find(col => col.currency);
        let totalRow = '';
        if (currencyColumn) {
            const total = data.reduce((sum, item) => sum + (item[currencyColumn.key] || 0), 0);
            const totalCells = columns.map(col => {
                if (col.currency) {
                    return `<td>${total.toFixed(2)} ريال</td>`;
                } else if (col.serial) {
                    return `<td>-</td>`;
                } else {
                    return `<td>المجموع</td>`;
                }
            }).join('');
            totalRow = `<tr class="total-row">${totalCells}</tr>`;
        }

        // إضافة عمود مربع الاختيار والأعمدة الأخرى
        let headers = needsCheckbox ? 
            `<th class="checkbox-column-${this.sanitizeTitle(title)}">
                <input type="checkbox" class="checkbox-${this.sanitizeTitle(title)}"
                       onclick="toggleAll('${this.sanitizeTitle(title)}')">
            </th>` : '';
        headers += columns.map(col => `<th>${col.title}</th>`).join('');
        
        // إضافة JavaScript لتحديد/إلغاء تحديد كل المربعات
        const toggleScript = needsCheckbox ? `
            <script>
                function toggleAll(section) {
                    const mainCheckbox = document.querySelector('.checkbox-' + section + '[onclick]');
                    const checkboxes = document.querySelectorAll('.checkbox-' + section + ':not([onclick])');
                    checkboxes.forEach(cb => cb.checked = mainCheckbox.checked);
                }
            </script>
        ` : '';

        return `
            <div class="section-title">${title}</div>
            <table>
                <thead>
                    <tr>${headers}</tr>
                </thead>
                <tbody>
                    ${tableRows}
                    ${totalRow}
                </tbody>
            </table>
        `;
    }

    // Generate table section
    generateTableSection(title, data, columns) {
        if (!data || data.length === 0) {
            return `
                <div class="section-title">${title}</div>
                <p class="text-muted">لا توجد بيانات</p>
            `;
        }

        // بناء صفوف الجدول
        const rows = data.map((row, index) => {
            const cells = columns.map(col => {
                let value;
                if (col.serial) {
                    value = index + 1;
                } else {
                    value = row[col.key];
                    if (col.currency && typeof value === 'number') {
                        value = value.toFixed(2) + ' ريال';
                    }
                }
                return `<td>${value || '-'}</td>`;
            }).join('');

            return `<tr>${cells}</tr>`;
        }).join('');

        // Calculate total for currency columns
        const currencyColumn = columns.find(col => col.currency);
        let totalRow = '';
        if (currencyColumn) {
            const total = data.reduce((sum, item) => sum + (item[currencyColumn.key] || 0), 0);
            const totalCells = columns.map(col => {
                if (col.currency) {
                    return `<td>${total.toFixed(2)} ريال</td>`;
                } else if (col.serial) {
                    return `<td>-</td>`;
                } else {
                    return `<td>المجموع</td>`;
                }
            }).join('');
            totalRow = `<tr class="total-row">${totalCells}</tr>`;
        }

        // بناء رؤوس الأعمدة
        const headers = columns.map(col => `<th>${col.title}</th>`).join('');

        return `
            <div class="section-title">${title}</div>
            <table class="table table-bordered">
                <thead>
                    <tr>${headers}</tr>
                </thead>
                <tbody>
                    ${rows}
                    ${totalRow}
                </tbody>
            </table>
        `;
    }

    // Generate signatures section
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

    // Generate cash receipts section with proper denomination display
    generateCashReceiptsSection(cashReceipts) {
        if (!cashReceipts || cashReceipts.length === 0) {
            return `
                <div class="section-title">💰 المقبوضات النقدية</div>
                <p class="text-muted">لا توجد مقبوضات نقدية</p>
            `;
        }

        // Sort by denomination descending for better readability
        const sortedCashReceipts = [...cashReceipts].sort((a, b) => (b.denomination || 0) - (a.denomination || 0));

        const tableRows = sortedCashReceipts.map((receipt, index) => {
            const denomination = this.formatNumber(receipt.denomination || 0);
            const quantity = this.formatNumber(receipt.quantity || 0);
            const totalAmount = this.formatNumber((receipt.total_amount || 0).toFixed(2));

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${denomination} ريال</td>
                    <td>${quantity}</td>
                    <td class="currency">${totalAmount} ريال</td>
                </tr>`;
        }).join('');

        const totalCashReceipts = cashReceipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);
        const totalQuantity = cashReceipts.reduce((sum, receipt) => sum + (receipt.quantity || 0), 0);

        const totalRow = `
            <tr class="total-row">
                <td>-</td>
                <td>الإجمالي</td>
                <td>${this.formatNumber(totalQuantity)}</td>
                <td class="currency">${this.formatNumber(totalCashReceipts.toFixed(2))} ريال</td>
            </tr>`;

        return `
            <div class="section-title">💰 المقبوضات النقدية (${cashReceipts.length})</div>
            <table>
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>الفئة</th>
                        <th>العدد</th>
                        <th>المبلغ الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                    ${totalRow}
                </tbody>
            </table>
        `;
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
}

module.exports = PrintManager;
