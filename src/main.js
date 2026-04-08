// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const DatabaseManager = require('./database');
const PDFGenerator = require('./pdf-generator');
const PrintManager = require('./print-manager');
const ThermalPrinter80mm = require('./thermal-printer-80mm');
const LocalWebServer = require('./local-server');
const { createSecureWebPreferences } = require('./window-security');
const { hashSecret, verifySecret } = require('./security/auth-service');
const { startBackgroundSync, stopBackgroundSync, getSyncStatus, setSyncEnabled, getSyncEnabled } = require('./background-sync');

/**
 * Safe console logging that won't crash on EPIPE errors
 */
function safeLog(message) {
    try {
        console.log(message);
    } catch (error) {
        // Ignore EPIPE and other console errors
        if (error.code !== 'EPIPE' && error.syscall !== 'write') {
            // Only log if it's not a known console error
        }
    }
}

function safeWarn(message) {
    try {
        console.warn(message);
    } catch (error) {
        // Ignore EPIPE and other console errors
    }
}

function safeError(message) {
    try {
        console.error(message);
    } catch (error) {
        // Ignore EPIPE and other console errors
    }
}

function sanitizeFileName(name) {
    if (!name || typeof name !== 'string') {
        return 'report';
    }

    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'report';
}

async function getReportsDefaultSavePath() {
    try {
        const savedPath = await dbManager.get(
            `SELECT setting_value
             FROM system_settings
             WHERE category = ? AND setting_key IN ('reports_path', 'default_save_path')
             ORDER BY CASE WHEN setting_key = 'reports_path' THEN 0 ELSE 1 END
             LIMIT 1`,
            ['reports']
        );

        if (savedPath && savedPath.setting_value) {
            return savedPath.setting_value;
        }
    } catch (error) {
        console.log('ℹ️ [IPC] لم يتم العثور على مسار افتراضي محفوظ للتقارير');
    }

    return null;
}

async function getReportsBehaviorSettings() {
    const defaults = {
        autoOpen: false,
        saveHistory: true,
        compress: false
    };

    try {
        const rows = await dbManager.query(
            `SELECT setting_key, setting_value
             FROM system_settings
             WHERE category = 'reports'
               AND setting_key IN ('auto_open_reports', 'save_report_history', 'compress_reports')`
        );

        if (!rows || rows.length === 0) {
            return defaults;
        }

        const settingsMap = {};
        rows.forEach((row) => {
            settingsMap[row.setting_key] = row.setting_value;
        });

        return {
            autoOpen: settingsMap.auto_open_reports === 'true',
            saveHistory: settingsMap.save_report_history !== 'false',
            compress: settingsMap.compress_reports === 'true'
        };
    } catch (error) {
        console.warn('⚠️ [IPC] تعذر تحميل سلوك إعدادات التقارير:', error.message);
        return defaults;
    }
}

async function appendReportExportHistory(filePath, exportData = {}) {
    try {
        await dbManager.run(`
            CREATE TABLE IF NOT EXISTS report_export_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_type TEXT,
                report_title TEXT,
                file_path TEXT NOT NULL,
                file_format TEXT,
                exported_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const extension = path.extname(filePath || '').replace('.', '').toLowerCase() || null;
        await dbManager.run(
            `INSERT INTO report_export_history (report_type, report_title, file_path, file_format)
             VALUES (?, ?, ?, ?)`,
            [
                exportData.reportType || 'general',
                exportData.reportTitle || 'تقرير',
                filePath,
                extension
            ]
        );
    } catch (error) {
        console.warn('⚠️ [IPC] تعذر حفظ سجل التقارير:', error.message);
    }
}

async function runPostExportActions(filePath, exportData = {}) {
    const reportBehavior = await getReportsBehaviorSettings();
    const saveHistoryEnabled = exportData.saveHistory === undefined
        ? reportBehavior.saveHistory
        : exportData.saveHistory !== false;

    if (saveHistoryEnabled) {
        await appendReportExportHistory(filePath, exportData);
    }

    const autoOpenEnabled = exportData.autoOpen === undefined
        ? reportBehavior.autoOpen
        : exportData.autoOpen === true;

    if (autoOpenEnabled) {
        try {
            await shell.openPath(filePath);
        } catch (error) {
            console.warn('⚠️ [IPC] تعذر فتح الملف تلقائياً:', error.message);
        }
    }
}

/**
 * Get system printers using Windows WMIC or PowerShell
 * الحصول على الطابعات من نظام Windows باستخدام WMIC أو PowerShell
 */
function getSystemPrinters() {
    try {
        let printers = [];

        // Try Method 1: WMIC (Windows Management Instrumentation Command-line)
        try {
            const wmicCommand = `wmic printerjob list brief`;
            const output = execSync(wmicCommand, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 });

            if (output && output.includes('Name')) {
                // WMIC returned something, parse it
                const lines = output.split('\n').slice(1); // Skip header
                printers = lines
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .map(name => ({
                        name: name,
                        displayName: name,
                        description: 'طابعة النظام',
                        status: 'ready',
                        isDefault: false
                    }));

                if (printers.length > 0) {
                    safeLog(`✅ [PRINTERS] تم الحصول على ${printers.length} طابعة من WMIC`);
                    return printers;
                }
            }
        } catch (wmicError) {
            // WMIC failed, try PowerShell
        }

        // Try Method 2: PowerShell - Get-Printer
        try {
            const psCommand = `powershell -NoProfile -Command "Get-Printer -ErrorAction SilentlyContinue | Select-Object Name | ForEach-Object { if ($_.Name) { $_.Name } }"`;
            const output = execSync(psCommand, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 });

            if (output) {
                printers = output.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && line !== '' && line !== 'Name' && !line.includes('-'))
                    .map(name => ({
                        name: name,
                        displayName: name,
                        description: 'طابعة النظام',
                        status: 'ready',
                        isDefault: false
                    }));

                if (printers.length > 0) {
                    safeLog(`✅ [PRINTERS] تم الحصول على ${printers.length} طابعة من PowerShell`);
                    return printers;
                }
            }
        } catch (psError) {
            // PowerShell failed
        }

        safeWarn('⚠️ [PRINTERS] لم يتم العثور على طابعات من النظام');
        return [];
    } catch (error) {
        safeWarn('⚠️ [PRINTERS] فشل الحصول على الطابعات: ' + error.message);
        return [];
    }
}

/**
 * Safe console logging that won't crash on EPIPE errors
 */

// ===================================================================
// DATE AND NUMBER FORMATTING UTILITIES - GREGORIAN CALENDAR ONLY
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

/**
 * Format numbers using English numerals
 */
function formatNumber(number) {
    if (number === null || number === undefined) return '0';

    try {
        // Use English locale for number formatting
        return new Intl.NumberFormat('en-US').format(number);
    } catch (error) {
        console.error('Error formatting number:', error);
        return String(number);
    }
}

/**
 * Get current date in DD/MM/YYYY format using Gregorian calendar
 */
function getCurrentDate() {
    return formatDate(new Date());
}

/**
 * Get current date and time in DD/MM/YYYY HH:MM format using Gregorian calendar
 */
function getCurrentDateTime() {
    return formatDateTime(new Date());
}

/**
 * Format currency amounts using English numerals
 */
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '0.00';

    try {
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount)) return '0.00';

        // Format with 2 decimal places using English numbers
        return numericAmount.toFixed(2);
    } catch (error) {
        console.error('Error formatting currency:', error);
        return '0.00';
    }
}

/**
 * Format decimal numbers (percentages, averages, etc.) using English numerals
 */
function formatDecimal(value, decimalPlaces = 2) {
    if (value === null || value === undefined) return '0.00';

    try {
        const numericValue = parseFloat(value);
        if (isNaN(numericValue)) return '0.00';

        // Format with specified decimal places using English numbers
        return numericValue.toFixed(decimalPlaces);
    } catch (error) {
        console.error('Error formatting decimal:', error);
        return '0.00';
    }
}

// Set environment variables for proper development/production detection
if (!process.env.NODE_ENV) {
    // Check if running in development mode
    const isDev = process.argv.includes('--dev');
    process.env.NODE_ENV = isDev ? 'development' : 'production';
}

const IS_DEV_MODE = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const IS_CLIENT_BUILD = app.isPackaged && !IS_DEV_MODE;

// Handle EPIPE errors globally to prevent crashes
process.stdout.on('error', (err) => {
    // In packaged GUI apps, stdout/stderr handles may be unavailable.
    // Never crash the app because console streams are not writable.
    void err;
});

process.stderr.on('error', (err) => {
    // In packaged GUI apps, stdout/stderr handles may be unavailable.
    // Never crash the app because console streams are not writable.
    void err;
});

console.log(`🚀 Application starting in ${process.env.NODE_ENV} mode`);
console.log(`🔧 Command line args: ${process.argv.join(' ')}`);

// Ensure test scripts are not loaded in production
if (process.env.NODE_ENV === 'production') {
    console.log('🔒 Production mode: Test scripts will be disabled for optimal performance');
}

// Keep a global reference of the window object
let mainWindow;
let printPreviewWindow;
let dbManager;
let pdfGenerator;
let printManager;
let thermalPrinter;
let webServer;
let runAutoBackupCheckNow = null;

function isAllowedInternalNavigationUrl(url = '') {
    const normalized = String(url || '').trim().toLowerCase();
    return (
        normalized.startsWith('file://')
        || normalized.startsWith('data:text/html')
        || normalized === 'about:blank'
        || normalized.startsWith('devtools://')
    );
}

function isDevToolsShortcut(input = {}) {
    const key = String(input.key || '').toLowerCase();
    const hasControl = Boolean(input.control) || Boolean(input.meta);

    return (
        key === 'f12'
        || (hasControl && Boolean(input.shift) && key === 'i')
        || (hasControl && key === 'u')
    );
}

function hardenWebContentsForClient(contents) {
    if (!contents || IS_DEV_MODE) {
        return;
    }

    contents.on('before-input-event', (event, input) => {
        if (isDevToolsShortcut(input)) {
            event.preventDefault();
        }
    });

    contents.on('context-menu', (event, params) => {
        const isEditable = Boolean(params && params.isEditable);
        if (isEditable) {
            return;
        }
        event.preventDefault();
    });

    if (typeof contents.setWindowOpenHandler === 'function') {
        contents.setWindowOpenHandler(({ url }) => {
            if (isAllowedInternalNavigationUrl(url)) {
                return { action: 'allow' };
            }

            shell.openExternal(url).catch((error) => {
                safeWarn(`⚠️ [SECURITY] تعذر فتح الرابط الخارجي: ${error && error.message ? error.message : error}`);
            });
            return { action: 'deny' };
        });
    }

    contents.on('will-navigate', (event, url) => {
        if (isAllowedInternalNavigationUrl(url)) {
            return;
        }
        event.preventDefault();
    });
}

app.on('web-contents-created', (_event, contents) => {
    hardenWebContentsForClient(contents);
});

function createWindow() {
    // Create the browser window with Arabic RTL support
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: createSecureWebPreferences(__dirname, {
            devTools: IS_DEV_MODE
        }),
        icon: path.join(__dirname, '../assets/icon.ico'),
        title: 'تصفية برو - Tasfiya Pro',
        show: true,
        autoHideMenuBar: IS_CLIENT_BUILD
    });

    if (IS_CLIENT_BUILD) {
        mainWindow.setMenuBarVisibility(false);
        mainWindow.removeMenu();
    }

    // Load the index.html of the app
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open DevTools in development
    if (IS_DEV_MODE) {
        mainWindow.webContents.openDevTools();
    }

    // Emitted when the window is closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Create print preview window
function createPrintPreviewWindow(printData) {
    console.log('🖨️ [PRINT] إنشاء نافذة معاينة الطباعة...');

    // Close existing print preview window if open
    if (printPreviewWindow && !printPreviewWindow.isDestroyed()) {
        console.log('🖨️ [PRINT] إغلاق نافذة المعاينة السابقة...');
        printPreviewWindow.close();
        printPreviewWindow = null;
    }

    // Create new print preview window
    printPreviewWindow = new BrowserWindow({
        width: 900,
        height: 1200,
        minWidth: 800,
        minHeight: 1000,
        webPreferences: createSecureWebPreferences(__dirname, {
            devTools: IS_DEV_MODE,
            webSecurity: !IS_DEV_MODE
        }),
        title: 'معاينة الطباعة - Print Preview',
        icon: path.join(__dirname, '../assets/icon.png'),
        parent: mainWindow,
        modal: false,
        show: false,
        autoHideMenuBar: true
    });

    // Get current print settings and merge with print data options
    const printSettings = printManager ? printManager.getPrintSettings() : {};
    const mergedOptions = { ...printSettings, ...(printData.options || {}) };
    const printDataWithSettings = { ...printData, options: mergedOptions };

    // Generate print HTML content
    const printHtml = generatePrintHtml(printDataWithSettings);

    // Load the print content
    printPreviewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printHtml)}`);

    // Show window when ready
    printPreviewWindow.once('ready-to-show', () => {
        console.log('✅ [PRINT] نافذة معاينة الطباعة جاهزة');
        printPreviewWindow.show();
        printPreviewWindow.focus();
    });

    // Handle window closed
    printPreviewWindow.on('closed', () => {
        console.log('🖨️ [PRINT] تم إغلاق نافذة معاينة الطباعة');
        printPreviewWindow = null;
    });

    // Handle any errors
    printPreviewWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('❌ [PRINT] خطأ في تحميل نافذة المعاينة:', errorCode, errorDescription);
    });

    return printPreviewWindow;
}

// Handle adding new transaction to customer statement
ipcMain.handle('add-statement-transaction', async (event, data) => {
    try {
        const { customerName, type, amount, reason } = data;

        if (!customerName || !type || amount <= 0) {
            return { success: false, error: 'بيانات غير كاملة' };
        }

        // Get current date
        const currentDate = new Date().toISOString().split('T')[0];
        const currentDateTime = new Date().toISOString();

        // Get the last reconciliation number
        const lastRecQuery = 'SELECT MAX(reconciliation_number) as max_num FROM reconciliations WHERE status = \'completed\'';
        const lastRecResult = await dbManager.query(lastRecQuery);
        const lastRecNum = lastRecResult[0]?.max_num || 0;
        const newRecNum = parseInt(lastRecNum) + 1;

        // Create a new reconciliation record
        const recInsertQuery = `
      INSERT INTO reconciliations (
        reconciliation_number, 
        cashier_id, 
        accountant_id, 
        reconciliation_date, 
        system_sales, 
        total_receipts, 
        surplus_deficit, 
        status, 
        created_at
      ) VALUES (?, 1, 1, ?, 0, 0, 0, 'completed', ?)
    `;

        const recParams = [newRecNum, currentDate, currentDateTime];

        // Start a transaction to ensure both inserts succeed or fail together
        await dbManager.run("BEGIN TRANSACTION");

        try {
            const recResult = await dbManager.run(recInsertQuery, recParams);

            // Get the last inserted ID
            const recId = recResult.lastInsertRowid;
            if (!recId) {
                throw new Error('فشل في إنشاء تصفية جديدة');
            }

            // Add the transaction based on type
            if (type === 'receipt') {
                // Customer receipt
                const receiptInsertQuery = `
          INSERT INTO customer_receipts (
            reconciliation_id, 
            customer_name, 
            amount, 
            payment_type,
            notes,
            created_at
          ) VALUES (?, ?, ?, 'manual', ?, ?)
        `;

                await dbManager.run(receiptInsertQuery, [
                    recId,
                    customerName,
                    amount,
                    reason || '',
                    currentDateTime
                ]);
            } else if (type === 'postpaid') {
                // Postpaid sale
                const postInsertQuery = `
          INSERT INTO postpaid_sales (
            reconciliation_id, 
            customer_name, 
            amount, 
            notes,
            created_at
          ) VALUES (?, ?, ?, ?, ?)
        `;

                await dbManager.run(postInsertQuery, [
                    recId,
                    customerName,
                    amount,
                    reason || '',
                    currentDateTime
                ]);
            }

            // Commit the transaction if all inserts succeeded
            await dbManager.run("COMMIT");
            return { success: true, id: recId };
        } catch (error) {
            // Rollback the transaction if any insert failed
            await dbManager.run("ROLLBACK");
            console.error('Error adding statement transaction:', error);
            return { success: false, error: `فشل في إضافة الحركة: ${error.message}` };
        }
    } catch (error) {
        console.error('Error in add-statement-transaction:', error);
        return { success: false, error: error.message };
    }
});

// Helper function to get font size for print
function getFontSizeForPrint(fontSize) {
    const fontSizes = {
        'small': '12px',
        'normal': '14px',
        'large': '16px',
        'extra-large': '18px'
    };
    return fontSizes[fontSize] || fontSizes['normal'];
}

// Helper function to get optimized font size for A4 single page print
function getEnhancedFontSizeForPrint(fontSize) {
    const optimizedFontSizes = {
        'small': '12px',    /* صغير - محسن للقراءة الواضحة */
        'normal': '14px',   /* عادي - محسن للقراءة الواضحة */
        'large': '16px',    /* كبير - محسن للقراءة الواضحة */
        'extra-large': '18px' /* كبير جداً - محسن للقراءة الواضحة */
    };
    return optimizedFontSizes[fontSize] || optimizedFontSizes['normal'];
}

// Generate print HTML with Arabic RTL support and A4 formatting
function generatePrintHtml(printData) {
    console.log('📄 [PRINT] إنشاء محتوى HTML للطباعة...');

    const { reconciliation, sections, options } = printData;

    // Print HTML generation with filter enhancement fields support

    // Validate required data
    if (!reconciliation) {
        throw new Error('بيانات التصفية مطلوبة للطباعة');
    }

    const currentDate = getCurrentDate();
    const currentTime = getCurrentDateTime();

    // Get print settings to determine if colored printing is enabled
    const isColorPrint = options && options.color !== undefined ? options.color : false;
    const fontSize = options && options.fontSize ? options.fontSize : 'normal';
    console.log('🎨 [PRINT] إعداد الطباعة الملونة:', isColorPrint);
    console.log('📝 [PRINT] حجم الخط المختار:', fontSize);
    console.log('📏 [PRINT] حجم الخط المحسوب:', getEnhancedFontSizeForPrint(fontSize));

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تصفية برو - ${reconciliation.cashier_name}</title>
    <style>
        /* Print-optimized CSS with Arabic support */
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html {
            background: #eef2f5;
        }

        body {
            font-family: '${options.fontFamily || 'Noto Sans Arabic'}', 'Arial', sans-serif;
            font-size: ${getEnhancedFontSizeForPrint(options.fontSize || 'normal')}; /* استخدام إعدادات حجم الخط */
            line-height: 1.05; /* تقليل المسافة بين الأسطر */
            color: #222;
            direction: rtl;
            text-align: right;
            background: white;
            padding: 95px 10px 14px;
            margin: 12px auto 18px;
            width: calc(100% - 24px);
            max-width: 194mm; /* A4 printable width with page margins (8mm each side) */
            font-weight: bold;
            border: 1px solid #d8dee4;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
        }

        /* Page setup for A4 printing - محسن لصفحة واحدة */
        @page {
            size: A4 portrait;
            margin: 10mm 8mm 15mm 8mm; /* هوامش محسنة للطباعة */
        }

        /* Print-specific styles - محسن للضغط في صفحة واحدة */
        @media print {
            body {
                width: auto !important;
                max-width: none !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                font-size: ${getEnhancedFontSizeForPrint(options.fontSize || 'normal')} !important; /* استخدام إعدادات حجم الخط */
                line-height: 1.05 !important; /* مسافة أقل بين الأسطر */
            }

            .no-print {
                display: none !important;
            }

            .page-break {
                page-break-before: always;
            }

            /* تحسينات إضافية للضغط - تتناسب مع حجم الخط المختار */
            h1, h2, h3 {
                margin: 2px 0 !important;
                padding: 1px 0 !important;
                font-size: 1.2em !important; /* نسبي لحجم الخط الأساسي */
            }

            table {
                margin: 3px 0 !important;
            }

            th, td {
                font-size: 0.9em !important; /* نسبي لحجم الخط الأساسي */
            }

            .section {
                margin: 4px 0 !important;
                padding: 2px 0 !important;
            }

            .avoid-break {
                page-break-inside: avoid;
            }
        }

        .header {
            text-align: center;
            margin-bottom: 4px; /* تقليل المسافة */
            border-bottom: 1px solid #2c3e50;
            padding-bottom: 3px; /* تقليل الحشو */
        }

        .header h1 {
            font-size: 1.4em; /* نسبي لحجم الخط الأساسي */
            font-weight: 800;
            color: #1a252f;
            margin-bottom: 2px; /* تقليل المسافة */
            text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.1);
        }

        .header h2 {
            font-size: 1.2em; /* نسبي لحجم الخط الأساسي */
            font-weight: 700;
            color: #2c3e50;
            margin-bottom: 2px; /* تقليل المسافة */
        }

        .header h3 {
            font-size: 1.1em; /* نسبي لحجم الخط الأساسي */
            font-weight: 600;
            color: #34495e;
            margin-bottom: 3px; /* تقليل المسافة */
        }

        .header-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: #7f8c8d;
        }

        .reconciliation-info {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 3px;
            padding: 3px; /* تقليل الحشو */
            margin-bottom: 4px; /* تقليل المسافة */
        }

        .reconciliation-info h3 {
            font-size: 14px; /* تحسين حجم الخط للوضوح */
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 2px; /* تقليل المسافة */
            border-bottom: 1px solid #dee2e6;
            padding-bottom: 1px; /* تقليل الحشو */
        }

        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 0px;
        }

        .info-item {
            display: flex;
            justify-content: flex-start;
            padding: 1px 0;
            border-bottom: 1px dotted #bdc3c7;
            font-size: 12px;
            margin-left: 10px;
        }

        .info-label {
            font-weight: 700;
            color: #1a252f;
            min-width: 85px;
            text-align: right;
            position: relative;
        }

        .info-label::after {
            content: " : ";
            margin-left: 3px;
        }

        .info-value {
            font-weight: 700;
            color: #2c3e50;
            margin-right: 3px;
        }

        .info-label {
            font-weight: 700;
            color: #1a252f;
        }

        .info-value {
            font-weight: 700;
            color: #2c3e50;
        }

        .section {
            margin-bottom: 3px; /* تقليل المسافة */
            break-inside: avoid;
        }

        .section-title {
            font-size: 14px; /* تحسين حجم الخط للوضوح */
            font-weight: 700;
            color: #1a252f;
            background: #ecf0f1;
            padding: 4px 6px;
            border-radius: 2px;
            margin-bottom: 3px;
            border-right: 2px solid #3498db;
            text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.1);
        }

        .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 2px; /* تقليل المسافة */
            font-size: 11px; /* تحسين حجم الخط للوضوح */
            border-radius: 0px;
            overflow: hidden;
            box-shadow: none;
        }

        .table th {
            background: #34495e;
            color: white;
            padding: 2px 1px; /* تقليل الحشو */
            text-align: center;
            font-weight: 700;
            border: 1px solid #2c3e50;
            text-shadow: none;
            font-size: 0.85em; /* نسبي لحجم الخط الأساسي */
            line-height: 1;
        }

        .table td {
            padding: 1px 0.5px; /* تقليل الحشو */
            text-align: center;
            border: 1px solid #bdc3c7;
            vertical-align: middle;
            line-height: 1; /* تقليل المسافة بين الأسطر */
            font-weight: 500;
            font-size: 0.85em; /* نسبي لحجم الخط الأساسي */
        }

        .total-row {
            background: transparent !important;
            color: #000000 !important;
            font-weight: 900 !important;
            font-size: 1em !important; /* نسبي لحجم الخط الأساسي */
        }

        .total-row td {
            background: transparent !important;
            color: #000000 !important;
            font-weight: 900 !important;
            font-size: 1em !important; /* نسبي لحجم الخط الأساسي */
            border: 2px solid #000000 !important;
            padding: 8px 6px !important;
        }

        .table tbody tr:nth-child(even) {
            background-image: repeating-linear-gradient(45deg, #00000015 0px, #00000015 1px, transparent 1px, transparent 8px);
            background-size: 10px 10px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        @media print {
            .table tbody tr:nth-child(even) {
                background-image: repeating-linear-gradient(45deg, #00000025 0px, #00000025 1px, transparent 1px, transparent 8px) !important;
                background-size: 10px 10px !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }

        .table tbody tr:hover {
            background: #e3f2fd;
        }
        
        .customer-name {
            font-weight: 700;
            font-family: 'Noto Sans Arabic', Arial, sans-serif;
        }

        .currency {
            font-weight: 800;
            color: #1e8449;
            text-align: left;
            direction: ltr;
            font-size: 1.05em;
            text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.1);
        }

        .summary {
            background: #e8f5e8;
            border: 1px solid #27ae60;
            border-radius: 3px;
            padding: 6px;
            margin-top: 8px;
        }

        .summary h3 {
            font-size: 11px;
            font-weight: 800;
            color: #1e8449;
            text-align: center;
            margin-bottom: 4px;
            text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.1);
        }

        .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1fr;
            gap: 3px;
        }

        .summary-item {
            text-align: center;
            padding: 3px;
            background: white;
            border-radius: 2px;
            border: 1px solid #27ae60;
        }

        .summary-label {
            font-size: 12px;
            color: #1a252f;
            margin-bottom: 2px;
            font-weight: 600;
        }

        .summary-value {
            font-size: 14px;
            font-weight: 800;
            color: #1e8449;
            text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.1);
        }

        /* قسم التوقيعات */
        .signatures-section {
            margin-top: 20px;
            margin-bottom: 15mm;
            padding: 10px;
            page-break-inside: avoid;
        }

        .signatures-title {
            font-size: 14px;
            font-weight: 700;
            color: #2c3e50;
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 2px solid #3498db;
            padding-bottom: 5px;
        }

        .signature-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            align-items: center;
        }

        .signature-item {
            flex: 1;
            margin: 0 8px;
        }

        .signature-label {
            font-size: 11px;
            font-weight: 600;
            color: #34495e;
            margin-bottom: 4px;
        }

        .signature-line {
            border-bottom: 2px solid #34495e;
            height: 25px;
            position: relative;
        }

        .print-controls {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 1000;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border: 1px solid #dee2e6;
        }

        .print-btn {
            background: #3498db;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin-left: 10px;
            font-family: 'Noto Sans Arabic', Arial, sans-serif;
            transition: background 0.3s ease;
        }

        .print-btn:hover {
            background: #2980b9;
        }

        .close-btn {
            background: #95a5a6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            font-family: 'Noto Sans Arabic', Arial, sans-serif;
            transition: background 0.3s ease;
        }

        .close-btn:hover {
            background: #7f8c8d;
        }

        .empty-section {
            text-align: center;
            color: #7f8c8d;
            font-style: italic;
            padding: 8px; /* تقليل الحشو */
            background: #f8f9fa;
            border-radius: 3px; /* تقليل الحواف المدورة */
            border: 1px dashed #bdc3c7;
            font-size: 12px; /* تحسين حجم الخط للوضوح */
        }

        .footer {
            margin-top: 15px; /* تقليل المسافة */
            padding-top: 8px; /* تقليل الحشو */
            border-top: 1px solid #bdc3c7;
            text-align: center;
            color: #7f8c8d;
            font-size: 10px; /* تحسين حجم الخط للفوتر */
        }
    </style>
</head>
<body>
    <!-- Print Controls -->
    <div class="print-controls no-print">
        <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
        <button class="close-btn" onclick="window.close()">✖️ إغلاق</button>
    </div>

    <!-- Header -->
    <div class="header">
        <h1>تصفية برو - Tasfiya Pro</h1>
        <h2>${reconciliation.company_name || 'شركة المثال التجارية'}</h2>
        <h3>تقرير التصفية النهائية</h3>
        <div class="header-info">
            <span>تاريخ الطباعة: ${currentDate}</span>
            <span>وقت الطباعة: ${currentTime}</span>
        </div>
    </div>

    <!-- Reconciliation Information -->
    <div class="reconciliation-info">
        <h3>معلومات التصفية</h3>
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">رقم التصفية</div>
                <div class="info-value">${reconciliation.reconciliation_number || reconciliation.id}</div>
            </div>
            <div class="info-item">
                <div class="info-label">الفرع</div>
                <div class="info-value">${reconciliation.branch_name || 'الفرع الرئيسي'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">اسم الكاشير</div>
                <div class="info-value">${reconciliation.cashier_name || 'غير محدد'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">رقم الكاشير</div>
                <div class="info-value">${reconciliation.cashier_number || 'غير محدد'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">اسم المحاسب</div>
                <div class="info-value">${reconciliation.accountant_name || 'غير محدد'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">تاريخ التصفية</div>
                <div class="info-value">${formatDate(reconciliation.reconciliation_date)}</div>
            </div>
            ${reconciliation.time_range_start || reconciliation.time_range_end ? `
            <div class="info-item">
                <span class="info-label">النطاق الزمني:</span>
                <span class="info-value">
                    ${reconciliation.time_range_start && reconciliation.time_range_end ?
                `من ${reconciliation.time_range_start} إلى ${reconciliation.time_range_end}` :
                reconciliation.time_range_start ? `من ${reconciliation.time_range_start}` :
                    `إلى ${reconciliation.time_range_end}`
            }
                </span>
            </div>
            ` : ''}
            <div class="info-item">
                <span class="info-label">حالة التصفية:</span>
                <span class="info-value">${reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة'}</span>
            </div>
        </div>
        ${reconciliation.filter_notes ? `
        <div style="margin-top: 8px; padding: 6px; background: #f8f9fa; border-left: 3px solid #3498db; border-radius: 4px;">
            <div class="info-item" style="margin-bottom: 3px;">
                <span class="info-label" style="font-weight: 600; color: #2c3e50;">ملاحظات التصفية:</span>
            </div>
            <div style="font-style: italic; color: #2c3e50; font-size: 13px; line-height: 1.3; word-wrap: break-word;">
                ${reconciliation.filter_notes}
            </div>
        </div>
        ` : ''}
    </div>
    ${generateSectionsHtml(sections)}
    ${generateSummaryHtml(reconciliation)}
    ${generateSignaturesSection()}

    <!-- Footer -->
    <div class="footer">
        <p>تم إنشاء هذا التقرير بواسطة تصفية برو - Tasfiya Pro</p>
        <p>Tasfiya Pro - Generated on ${currentDate} at ${currentTime}</p>
        <p>تم تطوير هذا النظام بواسطة محمد أمين الكامل - جميع الحقوق محفوظة © Tasfiya Pro</p>
    </div>

    <script>
        // Print functionality
        function printDocument() {
            window.print();
        }

        // Close window functionality
        function closeWindow() {
            window.close();
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                printDocument();
            }
            if (e.key === 'Escape') {
                closeWindow();
            }
        });

        console.log('🖨️ نافذة معاينة الطباعة جاهزة');
    </script>

    ${generateNonColoredPrintStyles(isColorPrint)}
</body>
</html>`;
}

/**
 * Generate non-colored print styles for black and white printing
 * @param {boolean} isColorPrint - Whether colored printing is enabled
 * @returns {string} CSS styles for non-colored printing
 */
function generateNonColoredPrintStyles(isColorPrint) {
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

// Generate sections HTML based on selected sections
function generateSectionsHtml(sections) {
    let html = '';

    if (!sections || typeof sections !== 'object') {
        return html;
    }

    // Bank Receipts Section
    if (sections.bankReceipts && sections.bankReceipts.length > 0) {
        html += `
    <div class="section">
        <div class="section-title">💳 المقبوضات البنكية</div>
        <table class="table">
            <thead>
                <tr>
                    <th>الرقم</th>
                    <th>اسم الآلة</th>
                    <th>البنك</th>
                    <th>نوع العملية</th>
                    <th>المبلغ</th>
                </tr>
            </thead>
            <tbody>`;

        sections.bankReceipts.forEach((receipt, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${receipt.atm_name || 'غير محدد'}</td>
                    <td>${receipt.bank_name || 'غير محدد'}</td>
                    <td>${receipt.operation_type || 'غير محدد'}</td>
                    <td class="currency">${formatCurrency(receipt.amount)} ريال</td>
                </tr>`;
        });

        const totalBankReceipts = sections.bankReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
        html += `
                <tr class="total-row">
                    <td colspan="4">الإجمالي</td>
                    <td class="currency">${formatCurrency(totalBankReceipts)} ريال</td>
                </tr>
            </tbody>
        </table>
    </div>`;
    }

    // Cash Receipts Section - Fixed to show all denominations properly
    if (sections.cashReceipts && sections.cashReceipts.length > 0) {
        html += `
    <div class="section">
        <div class="section-title">💰 المقبوضات النقدية</div>
        <table class="table">
            <thead>
                <tr>
                    <th>الرقم</th>
                    <th>الفئة</th>
                    <th>العدد</th>
                    <th>المبلغ الإجمالي</th>
                </tr>
            </thead>
            <tbody>`;

        // Sort by denomination descending for better readability
        const sortedCashReceipts = [...sections.cashReceipts].sort((a, b) => (b.denomination || 0) - (a.denomination || 0));

        sortedCashReceipts.forEach((receipt, index) => {
            const denomination = formatNumber(receipt.denomination || 0);
            const quantity = formatNumber(receipt.quantity || 0);
            const totalAmount = formatNumber(formatCurrency(receipt.total_amount));

            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${denomination} ريال</td>
                    <td>${quantity}</td>
                    <td class="currency">${totalAmount} ريال</td>
                </tr>`;
        });

        const totalCashReceipts = sections.cashReceipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);
        const totalQuantity = sections.cashReceipts.reduce((sum, receipt) => sum + (receipt.quantity || 0), 0);

        html += `
                <tr class="total-row">
                    <td>-</td>
                    <td>الإجمالي</td>
                    <td>${formatNumber(totalQuantity)}</td>
                    <td class="currency">${formatNumber(formatCurrency(totalCashReceipts))} ريال</td>
                </tr>
            </tbody>
        </table>
    </div>`;
    }

    // Postpaid Sales Section
    if (sections.postpaidSales && sections.postpaidSales.length > 0) {
        html += `
    <div class="section">
        <div class="section-title">📱 المبيعات الآجلة</div>
        <table class="table">
            <thead>
                <tr>
                    <th>الرقم</th>
                    <th>اسم العميل</th>
                    <th>المبلغ</th>
                </tr>
            </thead>
            <tbody>`;

        sections.postpaidSales.forEach((sale, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <div style="min-width: 12px; min-height: 12px; border: 1px solid #000;"></div>
                            <span class="customer-name">${sale.customer_name || 'غير محدد'}</span>
                        </div>
                    </td>
                    <td class="currency">${formatCurrency(sale.amount)} ريال</td>
                </tr>`;
        });

        const totalPostpaidSales = sections.postpaidSales.reduce((sum, sale) => sum + (sale.amount || 0), 0);
        html += `
                <tr class="total-row">
                    <td colspan="2">الإجمالي</td>
                    <td class="currency">${formatCurrency(totalPostpaidSales)} ريال</td>
                </tr>
            </tbody>
        </table>
    </div>`;
    }

    // Customer Receipts Section
    if (sections.customerReceipts && sections.customerReceipts.length > 0) {
        html += `
    <div class="section">
        <div class="section-title">👥 مقبوضات العملاء</div>
        <table class="table">
            <thead>
                <tr>
                    <th>الرقم</th>
                    <th>اسم العميل</th>
                    <th>نوع الدفع</th>
                    <th>المبلغ</th>
                </tr>
            </thead>
            <tbody>`;

        sections.customerReceipts.forEach((receipt, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <div style="min-width: 12px; min-height: 12px; border: 1px solid #000;"></div>
                            <span class="customer-name">${receipt.customer_name || 'غير محدد'}</span>
                        </div>
                    </td>
                    <td>${receipt.payment_type || 'نقدي'}</td>
                    <td class="currency">${formatCurrency(receipt.amount)} ريال</td>
                </tr>`;
        });

        const totalCustomerReceipts = sections.customerReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
        html += `
                <tr class="total-row">
                    <td colspan="3">الإجمالي</td>
                    <td class="currency">${formatCurrency(totalCustomerReceipts)} ريال</td>
                </tr>
            </tbody>
        </table>
    </div>`;
    }

    // Return Invoices Section
    if (sections.returnInvoices && sections.returnInvoices.length > 0) {
        html += `
    <div class="section">
        <div class="section-title">↩️ فواتير المرتجع</div>
        <table class="table">
            <thead>
                <tr>
                    <th>الرقم</th>
                    <th>رقم الفاتورة</th>
                    <th>المبلغ</th>
                </tr>
            </thead>
            <tbody>`;

        sections.returnInvoices.forEach((invoice, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${invoice.invoice_number || 'غير محدد'}</td>
                    <td class="currency">${formatCurrency(invoice.amount)} ريال</td>
                </tr>`;
        });

        const totalReturnInvoices = sections.returnInvoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0);
        html += `
                <tr class="total-row">
                    <td colspan="2">الإجمالي</td>
                    <td class="currency">${formatCurrency(totalReturnInvoices)} ريال</td>
                </tr>
            </tbody>
        </table>
    </div>`;
    }

    // Suppliers Section
    if (sections.suppliers && sections.suppliers.length > 0) {
        html += `
    <div class="section">
        <div class="section-title">🏪 الموردين</div>
        <table class="table">
            <thead>
                <tr>
                    <th>الرقم</th>
                    <th>اسم المورد</th>
                    <th>المبلغ</th>
                </tr>
            </thead>
            <tbody>`;

        sections.suppliers.forEach((supplier, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${supplier.supplier_name || 'غير محدد'}</td>
                    <td class="currency">${formatCurrency(supplier.amount)} ريال</td>
                </tr>`;
        });

        const totalSuppliers = sections.suppliers.reduce((sum, supplier) => sum + (supplier.amount || 0), 0);
        html += `
                <tr class="total-row">
                    <td colspan="2">الإجمالي</td>
                    <td class="currency">${formatCurrency(totalSuppliers)} ريال</td>
                </tr>
            </tbody>
        </table>
    </div>`;
    }

    return html;
}

// Generate signatures section
function generateSignaturesSection() {
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

// Generate summary HTML
function generateSummaryHtml(reconciliation) {
    const systemSales = reconciliation.system_sales || 0;
    const totalReceipts = reconciliation.total_receipts || 0;
    const surplusDeficit = reconciliation.surplus_deficit || 0;

    const surplusDeficitClass = surplusDeficit > 0 ? 'color: #27ae60' : surplusDeficit < 0 ? 'color: #e74c3c' : 'color: #7f8c8d';
    const surplusDeficitText = surplusDeficit > 0 ? 'فائض' : surplusDeficit < 0 ? 'عجز' : 'متوازن';

    return `
    <div class="summary">
        <h3>ملخص التصفية النهائية</h3>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="summary-label">مبيعات النظام</div>
                <div class="summary-value">${formatCurrency(systemSales)} ريال</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">إجمالي المقبوضات</div>
                <div class="summary-value">${formatCurrency(totalReceipts)} ريال</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">${surplusDeficitText}</div>
                <div class="summary-value" style="${surplusDeficitClass}">${formatCurrency(Math.abs(surplusDeficit))} ريال</div>
            </div>
        </div>
    </div>`;
}

function initializeDatabase() {
    try {
        console.log('🔄 [INIT] تهيئة قاعدة البيانات...');
        dbManager = new DatabaseManager();
        const success = dbManager.initialize();

        if (!success) {
            console.error('❌ [INIT] فشل في تهيئة قاعدة البيانات');
            return false;
        }

        console.log('✅ [INIT] تم تهيئة قاعدة البيانات بنجاح');

        // Fix reconciliation numbering
        try {
            console.log('🔄 [INIT] بدء إصلاح ترقيم التصفيات...');
            dbManager.fixAllReconciliationNumbers();
            console.log('✅ [INIT] تم إصلاح ترقيم التصفيات بنجاح');
        } catch (fixError) {
            console.error('⚠️ [INIT] حدث خطأ أثناء إصلاح ترقيم التصفيات:', fixError);
            // Don't fail initialization, but log the error
        }

        return true;

    } catch (error) {
        console.error('❌ [INIT] خطأ في تهيئة قاعدة البيانات:', error);
        return false;
    }
}



// App event handlers
app.whenReady().then(() => {
    if (IS_CLIENT_BUILD) {
        Menu.setApplicationMenu(null);
    }

    const dbInitialized = initializeDatabase();
    if (dbInitialized) {
        // Initialize PDF generator
        pdfGenerator = new PDFGenerator(dbManager);

        // Initialize Print manager
        printManager = new PrintManager();
        printManager.initialize();

        // Make print manager available to renderer process
        ipcMain.handle('get-print-manager', () => printManager);

        // Initialize thermal printer for 80mm receipts
        thermalPrinter = new ThermalPrinter80mm();

        // Load saved thermal printer settings from database after a short delay
        setTimeout(() => {
            if (dbManager) {
                try {
                    const query = `SELECT setting_key, setting_value FROM system_settings WHERE category = 'thermal_printer'`;
                    const results = dbManager.db.prepare(query).all();

                    if (results && results.length > 0) {
                        const settings = {};
                        for (const row of results) {
                            const key = row.setting_key;
                            const value = row.setting_value;

                            // Convert string values back to proper types
                            if (value === 'true') {
                                settings[key] = true;
                            } else if (value === 'false') {
                                settings[key] = false;
                            } else if (!isNaN(value) && value !== '') {
                                settings[key] = parseInt(value);
                            } else {
                                settings[key] = value;
                            }
                        }

                        if (Object.keys(settings).length > 0) {
                            thermalPrinter.updateSettings(settings);
                            safeLog('✅ [THERMAL-PRINTER] تم تحميل الإعدادات المحفوظة من قاعدة البيانات');
                        }
                    }
                } catch (loadError) {
                    safeWarn('⚠️ [THERMAL-PRINTER] فشل تحميل الإعدادات المحفوظة: ' + loadError.message);
                }
            }
        }, 500);

        createWindow();

        // Initialize automatic backup
        initializeAutoBackup();

        // Start Background Sync to Cloud (only if enabled)
        // Check if sync is enabled in settings (Default: true)
        const syncSetting = dbManager.db.prepare("SELECT setting_value FROM system_settings WHERE category = 'general' AND setting_key = 'sync_enabled'").get();
        const isSyncEnabled = !syncSetting || syncSetting.setting_value === 'true';

        if (isSyncEnabled) {
            startBackgroundSync(dbManager);
            console.log('✅ [APP] Background Sync Service Started (Auto)');
        } else {
            console.log('⏸️ [APP] Background Sync is disabled in settings, not starting');
            // Ensure the enabled flag is set to false in the sync instance
            setSyncEnabled(false);
        }

        // Start Local Web Server
        try {
            console.log('🌐 Starting Local Web Server...');
            webServer = new LocalWebServer(dbManager);
            webServer.start();
        } catch (error) {
            console.error('❌ Failed to start Web Server:', error);
        }
    } else {
        console.error('Failed to initialize database, exiting...');
        app.quit();
    }

    /**
     * Initialize automatic backup system
     */
    function initializeAutoBackup() {
        console.log('🔄 [AUTO-BACKUP] تهيئة نظام النسخ الاحتياطي التلقائي...');

        const CHECK_INTERVAL_MS = 60 * 60 * 1000; // every hour
        let autoBackupIntervalId = null;
        let autoBackupInProgress = false;

        function normalizeAutoBackupFrequency(rawValue) {
            const value = String(rawValue || '').trim().toLowerCase();
            if (value === 'daily' || value === 'weekly' || value === 'monthly') {
                return value;
            }
            return 'disabled';
        }

        function readSystemSettingValue(category, key) {
            const row = dbManager.db.prepare(
                `SELECT id, setting_value
                 FROM system_settings
                 WHERE category = ? AND setting_key = ?
                 ORDER BY id DESC
                 LIMIT 1`
            ).get(category, key);
            if (!row || row.setting_value == null) {
                return '';
            }
            return String(row.setting_value).trim();
        }

        function readSettingWithFallback(primaryCategory, primaryKey, fallbackCategory, fallbackKey) {
            const primaryValue = readSystemSettingValue(primaryCategory, primaryKey);
            if (primaryValue) {
                return primaryValue;
            }
            if (!fallbackCategory || !fallbackKey) {
                return '';
            }
            return readSystemSettingValue(fallbackCategory, fallbackKey);
        }

        function upsertSystemSettingWithLegacySafety(category, settingKey, settingValue) {
            const normalizedValue = settingValue == null ? '' : String(settingValue);
            const latestRow = dbManager.db.prepare(
                `SELECT id
                 FROM system_settings
                 WHERE category = ? AND setting_key = ?
                 ORDER BY id DESC
                 LIMIT 1`
            ).get(category, settingKey);

            if (!latestRow || !latestRow.id) {
                dbManager.db.prepare(
                    `INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
                ).run(category, settingKey, normalizedValue);
            } else {
                dbManager.db.prepare(
                    `UPDATE system_settings
                     SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`
                ).run(normalizedValue, latestRow.id);

                dbManager.db.prepare(
                    `DELETE FROM system_settings
                     WHERE category = ?
                       AND setting_key = ?
                       AND id <> ?`
                ).run(category, settingKey, latestRow.id);
            }
        }

        function upsertBackupRuntimeSetting(settingKey, settingValue) {
            upsertSystemSettingWithLegacySafety('backup', settingKey, settingValue);
        }

        function getDefaultAutoBackupPath() {
            try {
                const basePath = app.getPath('documents') || app.getPath('home');
                return path.join(basePath, 'Tasfiya Pro', 'backup');
            } catch (error) {
                void error;
                return path.join(process.cwd(), 'backup');
            }
        }

        function bootstrapAutoBackupDefaults() {
            const rawFrequencyPrimary = readSystemSettingValue('backup', 'auto_backup_frequency');
            const rawFrequencyLegacy = readSystemSettingValue('database', 'auto_backup');
            const normalizedFrequency = normalizeAutoBackupFrequency(rawFrequencyPrimary || rawFrequencyLegacy);

            if (!rawFrequencyPrimary && !rawFrequencyLegacy) {
                upsertSystemSettingWithLegacySafety('backup', 'auto_backup_frequency', 'daily');
                upsertSystemSettingWithLegacySafety('database', 'auto_backup', 'daily');
            } else if (!rawFrequencyPrimary && normalizedFrequency !== 'disabled') {
                upsertSystemSettingWithLegacySafety('backup', 'auto_backup_frequency', normalizedFrequency);
            } else if (!rawFrequencyLegacy && normalizedFrequency !== 'disabled') {
                upsertSystemSettingWithLegacySafety('database', 'auto_backup', normalizedFrequency);
            }

            const configuredPath = readSettingWithFallback(
                'backup',
                'default_backup_path',
                'database',
                'backup_location'
            );

            if (!configuredPath) {
                const defaultPath = getDefaultAutoBackupPath();
                upsertSystemSettingWithLegacySafety('backup', 'default_backup_path', defaultPath);
                upsertSystemSettingWithLegacySafety('database', 'backup_location', defaultPath);
                console.log(`📁 [AUTO-BACKUP] تم تعيين مسار افتراضي للنسخ الاحتياطي: ${defaultPath}`);
            } else {
                const backupPathPrimary = readSystemSettingValue('backup', 'default_backup_path');
                const backupPathLegacy = readSystemSettingValue('database', 'backup_location');

                if (!backupPathPrimary) {
                    upsertSystemSettingWithLegacySafety('backup', 'default_backup_path', configuredPath);
                }
                if (!backupPathLegacy) {
                    upsertSystemSettingWithLegacySafety('database', 'backup_location', configuredPath);
                }
            }
        }

        function notifyAutoBackupStatus(level, message, details = {}) {
            if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents) {
                return;
            }
            mainWindow.webContents.send('auto-backup-status', {
                level: String(level || 'info'),
                message: String(message || ''),
                timestamp: new Date().toISOString(),
                ...details
            });
        }

        function shouldRunAutoBackup(frequency, lastBackupAt, now) {
            if (!lastBackupAt) {
                return true;
            }

            const lastBackupDate = new Date(lastBackupAt);
            if (Number.isNaN(lastBackupDate.getTime())) {
                return true;
            }

            const hoursSinceLastBackup = (now.getTime() - lastBackupDate.getTime()) / (1000 * 60 * 60);
            switch (frequency) {
                case 'daily':
                    return hoursSinceLastBackup >= 24;
                case 'weekly':
                    return hoursSinceLastBackup >= (24 * 7);
                case 'monthly':
                    return hoursSinceLastBackup >= (24 * 30);
                default:
                    return false;
            }
        }

        async function runAutoBackupCycle(trigger = 'interval') {
            if (autoBackupInProgress) {
                return { success: true, skipped: true, reason: 'in-progress' };
            }

            autoBackupInProgress = true;
            try {
                const frequency = normalizeAutoBackupFrequency(
                    readSettingWithFallback('backup', 'auto_backup_frequency', 'database', 'auto_backup')
                );
                if (frequency === 'disabled') {
                    console.log('⏸️ [AUTO-BACKUP] النسخ الاحتياطي التلقائي معطل');
                    return { success: true, skipped: true, reason: 'disabled' };
                }

                const backupPath = readSettingWithFallback(
                    'backup',
                    'default_backup_path',
                    'database',
                    'backup_location'
                );
                if (!backupPath) {
                    const message = 'لم يتم تعيين مجلد النسخ الاحتياطي';
                    console.warn(`⚠️ [AUTO-BACKUP] ${message}`);
                    upsertBackupRuntimeSetting('last_auto_backup_status', 'failed');
                    upsertBackupRuntimeSetting('last_auto_backup_error', message);
                    notifyAutoBackupStatus('error', message, { trigger, frequency });
                    return { success: false, skipped: true, reason: 'path-missing', error: message };
                }

                const backupPathReady = await verifyBackupDirectory(backupPath);
                if (!backupPathReady) {
                    const message = 'مجلد النسخ الاحتياطي غير قابل للكتابة';
                    upsertBackupRuntimeSetting('last_auto_backup_status', 'failed');
                    upsertBackupRuntimeSetting('last_auto_backup_error', message);
                    notifyAutoBackupStatus('error', message, { trigger, frequency, backupPath });
                    return { success: false, skipped: true, reason: 'path-not-writable', error: message };
                }

                let lastSuccessfulBackupAt = readSystemSettingValue('backup', 'last_auto_backup_at');
                if (!lastSuccessfulBackupAt) {
                    // Legacy fallback: older versions recorded success under backup_% keys.
                    const legacyLastBackup = dbManager.db.prepare(
                        `SELECT MAX(updated_at) AS last_backup
                         FROM system_settings
                         WHERE category = 'backup'
                           AND setting_key LIKE 'backup_%'
                           AND setting_value = 'success'`
                    ).get();
                    lastSuccessfulBackupAt = legacyLastBackup && legacyLastBackup.last_backup
                        ? String(legacyLastBackup.last_backup)
                        : '';
                }

                const now = new Date();
                const backupDue = shouldRunAutoBackup(frequency, lastSuccessfulBackupAt, now);
                if (!backupDue) {
                    console.log(`⏭️ [AUTO-BACKUP] لا حاجة لنسخ احتياطي ${frequency}`);
                    return { success: true, skipped: true, reason: 'not-due' };
                }

                console.log(`🔄 [AUTO-BACKUP] تنفيذ نسخة احتياطية ${frequency}...`);
                const timestamp = now.toISOString().replace(/\..+$/, '').replace(/:/g, '-').replace('T', '_');
                const backupFileName = `casher_auto_backup_${frequency}_${timestamp}.json`;
                const backupFilePath = path.join(backupPath, backupFileName);

                const backupData = await collectDatabaseData();
                const result = await saveBackupFile(backupFilePath, backupData);

                if (!result.success) {
                    const failMessage = result.error || 'خطأ غير معروف';
                    console.error(`❌ [AUTO-BACKUP] فشل في إنشاء النسخة الاحتياطية: ${failMessage}`);
                    upsertBackupRuntimeSetting('last_auto_backup_status', 'failed');
                    upsertBackupRuntimeSetting('last_auto_backup_error', failMessage);
                    upsertBackupRuntimeSetting(`backup_${frequency}`, 'failed');
                    notifyAutoBackupStatus('error', `فشل إنشاء النسخة الاحتياطية التلقائية: ${failMessage}`, {
                        trigger,
                        frequency,
                        backupPath
                    });
                    return { success: false, created: false, error: failMessage };
                }

                console.log(`✅ [AUTO-BACKUP] تم إنشاء النسخة الاحتياطية بنجاح: ${backupFileName}`);
                upsertBackupRuntimeSetting('last_auto_backup_at', now.toISOString());
                upsertBackupRuntimeSetting('last_auto_backup_file', backupFilePath);
                upsertBackupRuntimeSetting('last_auto_backup_status', 'success');
                upsertBackupRuntimeSetting('last_auto_backup_error', '');
                upsertBackupRuntimeSetting(`backup_${frequency}`, 'success');
                notifyAutoBackupStatus('success', 'تم إنشاء نسخة احتياطية تلقائية بنجاح', {
                    trigger,
                    frequency,
                    backupFilePath
                });

                return { success: true, created: true, backupFilePath, frequency };
            } catch (error) {
                const failMessage = error && error.message ? error.message : 'خطأ غير معروف';
                console.error('❌ [AUTO-BACKUP] خطأ في النسخ الاحتياطي التلقائي:', error);
                upsertBackupRuntimeSetting('last_auto_backup_status', 'failed');
                upsertBackupRuntimeSetting('last_auto_backup_error', failMessage);
                notifyAutoBackupStatus('error', `حدث خطأ أثناء النسخ الاحتياطي التلقائي: ${failMessage}`, {
                    trigger
                });
                return { success: false, created: false, error: failMessage };
            } finally {
                autoBackupInProgress = false;
            }
        }

        bootstrapAutoBackupDefaults();
        runAutoBackupCheckNow = runAutoBackupCycle;

        // Immediate check on startup (do not wait one hour).
        void runAutoBackupCycle('startup');

        if (autoBackupIntervalId) {
            clearInterval(autoBackupIntervalId);
        }
        autoBackupIntervalId = setInterval(() => {
            void runAutoBackupCycle('interval');
        }, CHECK_INTERVAL_MS);

        console.log('✅ [AUTO-BACKUP] تم تفعيل الفحص التلقائي كل ساعة مع فحص فوري عند التشغيل');
    }

    /**
     * Save backup file to disk
     * @param {string} filePath - Path to save the backup file
     * @param {object} data - Backup data to save
     * @returns {Promise<{success: boolean, error?: string}>} - Result of the operation
     */
    async function saveBackupFile(filePath, data) {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Write backup file
            await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));

            return { success: true };
        } catch (error) {
            console.error('❌ [AUTO-BACKUP] خطأ في حفظ الملف:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify backup directory exists and is writable
     * @param {string} backupPath - Path to backup directory
     * @returns {Promise<boolean>} - Whether directory is ready
     */
    async function verifyBackupDirectory(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                fs.mkdirSync(backupPath, { recursive: true });
                console.log(`📁 [AUTO-BACKUP] تم إنشاء مجلد النسخ الاحتياطي: ${backupPath}`);
            }

            // Test if directory is writable
            const testFile = path.join(backupPath, 'test_write.tmp');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log(`✅ [AUTO-BACKUP] مجلد النسخ الاحتياطي جاهز للكتابة: ${backupPath}`);
            return true;
        } catch (error) {
            console.error(`❌ [AUTO-BACKUP] مجلد النسخ الاحتياطي غير قابل للكتابة: ${error.message}`);
            return false;
        }
    }

    /**
     * Collect all data from database for backup
     * @returns {Promise<object>} - Backup data
     */
    async function collectDatabaseData() {
        console.log('📊 [BACKUP] جمع البيانات من قاعدة البيانات...');

        const backupData = {
            metadata: {
                version: '1.0',
                created_at: new Date().toISOString(),
                app_name: 'نظام تصفية الكاشير',
                description: 'نسخة احتياطية كاملة من قاعدة البيانات'
            },
            data: {}
        };

        try {
            // Get all table data
            const tables = [
                'admins',
                'branches',
                'cashiers',
                'accountants',
                'atms',
                'reconciliations',
                'bank_receipts',
                'cash_receipts',
                'postpaid_sales',
                'customer_receipts',
                'return_invoices',
                'suppliers',
                'manual_postpaid_sales',
                'manual_customer_receipts',
                'manual_supplier_transactions',
                'branch_cashboxes',
                'cashbox_vouchers',
                'cashbox_voucher_audit_log',
                'system_settings'
            ];

            // Get data for each table
            for (const table of tables) {
                try {
                    const stmt = dbManager.db.prepare(`SELECT * FROM ${table}`);
                    const data = stmt.all();
                    backupData.data[table] = data;
                    console.log(`✅ [BACKUP] تم جلب ${data.length} سجل من جدول ${table}`);
                } catch (error) {
                    console.error(`❌ [BACKUP] خطأ في جلب بيانات جدول ${table}:`, error);
                    backupData.data[table] = [];
                }
            }

            return backupData;
        } catch (error) {
            console.error('❌ [BACKUP] خطأ في جمع البيانات:', error);
            throw error;
        }
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Clean up resources properly
        try {
            if (webServer) {
                console.log('🔄 Stopping local web server...');
                webServer.stop();
                webServer = null;
            }

            if (dbManager) {
                console.log('🔄 Closing database connection...');
                dbManager.close();
                dbManager = null;
            }
            if (pdfGenerator) {
                console.log('🔄 Closing PDF generator...');
                pdfGenerator.close();
                pdfGenerator = null;
            }
            if (printManager) {
                console.log('🔄 Cleaning up print manager...');
                printManager = null;
            }
            if (printPreviewWindow && !printPreviewWindow.isDestroyed()) {
                printPreviewWindow.close();
                printPreviewWindow = null;
            }
            console.log('✅ All resources cleaned up successfully');
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
        app.quit();
    }
});

// Manual transaction handlers
ipcMain.handle('add-manual-transaction', async (event, data) => {
    const { customerName, type, amount, reason, date } = data;

    try {
        if (type === 'receipt') {
            await dbManager.run(
                'INSERT INTO manual_customer_receipts (customer_name, amount, reason, created_at) VALUES (?, ?, ?, ?)',
                [customerName, amount, reason, date]
            );
        } else if (type === 'postpaid') {
            await dbManager.run(
                'INSERT INTO manual_postpaid_sales (customer_name, amount, reason, created_at) VALUES (?, ?, ?, ?)',
                [customerName, amount, reason, date]
            );
        }

        return { success: true };
    } catch (error) {
        console.error('Error adding manual transaction:', error);
        return { success: false, error: error.message };
    }
});

// IPC handlers for database operations
ipcMain.handle('db-query', async (event, sql, params = []) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.query(sql, params);
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
});

ipcMain.handle('db-run', async (event, sql, params = []) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.run(sql, params);
    } catch (error) {
        console.error('Database run error:', error);
        throw error;
    }
});

ipcMain.handle('db-get', async (event, sql, params = []) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.get(sql, params);
    } catch (error) {
        console.error('Database get error:', error);
        throw error;
    }
});

ipcMain.handle('db-all', async (event, sql, params = []) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.query(sql, params);
    } catch (error) {
        console.error('Database all error:', error);
        throw error;
    }
});

ipcMain.handle('auth-hash-secret', async (event, secret) => {
    try {
        return hashSecret(secret);
    } catch (error) {
        console.error('Auth hash error:', error);
        throw error;
    }
});

ipcMain.handle('auth-verify-secret', async (event, storedSecret, providedSecret) => {
    try {
        return verifySecret(storedSecret, providedSecret);
    } catch (error) {
        console.error('Auth verify error:', error);
        throw error;
    }
});

ipcMain.handle('run-auto-backup-check', async (event, trigger = 'manual') => {
    try {
        if (typeof runAutoBackupCheckNow !== 'function') {
            return { success: false, error: 'Auto backup system is not initialized yet' };
        }

        return await runAutoBackupCheckNow(String(trigger || 'manual'));
    } catch (error) {
        console.error('❌ [AUTO-BACKUP] خطأ في تشغيل الفحص الفوري:', error);
        return {
            success: false,
            error: error && error.message ? error.message : 'خطأ غير معروف'
        };
    }
});

// Autocomplete IPC handlers
ipcMain.handle('autocomplete-postpaid-customers', async (event, query, limit = 10) => {
    try {
        console.log(`🔍 [IPC] طلب اقتراحات عملاء المبيعات الآجلة: "${query}"`);
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.getPostpaidCustomerSuggestions(query, limit);
    } catch (error) {
        console.error('❌ [IPC] خطأ في جلب اقتراحات عملاء المبيعات الآجلة:', error);
        return [];
    }
});

ipcMain.handle('autocomplete-customer-receipts', async (event, query, limit = 10) => {
    try {
        console.log(`🔍 [IPC] طلب اقتراحات عملاء المقبوضات: "${query}"`);
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.getCustomerReceiptSuggestions(query, limit);
    } catch (error) {
        console.error('❌ [IPC] خطأ في جلب اقتراحات عملاء المقبوضات:', error);
        return [];
    }
});

ipcMain.handle('autocomplete-all-customers', async (event, query, limit = 10) => {
    try {
        console.log(`🔍 [IPC] طلب اقتراحات جميع العملاء: "${query}"`);
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.getAllCustomerSuggestions(query, limit);
    } catch (error) {
        console.error('❌ [IPC] خطأ في جلب اقتراحات جميع العملاء:', error);
        return [];
    }
});

ipcMain.handle('autocomplete-customer-stats', async (event, customerName) => {
    try {
        console.log(`📊 [IPC] طلب إحصائيات العميل: "${customerName}"`);
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.getCustomerUsageStats(customerName);
    } catch (error) {
        console.error('❌ [IPC] خطأ في جلب إحصائيات العميل:', error);
        return null;
    }
});

// Get reconciliation for editing
ipcMain.handle('get-reconciliation-for-edit', async (event, reconciliationId) => {
    console.log('🔍 [IPC] طلب تحميل التصفية للتعديل - معرف:', reconciliationId, 'نوع:', typeof reconciliationId);

    try {
        // Validate input
        if (reconciliationId === null || reconciliationId === undefined) {
            console.error('❌ [IPC] معرف التصفية مفقود');
            throw new Error('معرف التصفية مطلوب');
        }

        // Check database manager
        if (!dbManager) {
            console.error('❌ [IPC] مدير قاعدة البيانات غير مهيأ');
            throw new Error('مدير قاعدة البيانات غير مهيأ');
        }

        if (!dbManager.db) {
            console.error('❌ [IPC] قاعدة البيانات غير متصلة');
            throw new Error('قاعدة البيانات غير متصلة');
        }

        console.log('✅ [IPC] قاعدة البيانات متاحة، بدء التحميل...');

        const startTime = Date.now();
        const result = dbManager.getReconciliationForEdit(reconciliationId);
        const loadTime = Date.now() - startTime;

        console.log(`⏱️ [IPC] وقت تحميل البيانات: ${loadTime}ms`);

        if (!result) {
            console.error('❌ [IPC] لم يتم إرجاع بيانات من قاعدة البيانات');
            throw new Error(`لم يتم العثور على التصفية رقم ${reconciliationId}`);
        }

        console.log('✅ [IPC] تم تحميل البيانات بنجاح');
        return result;

    } catch (error) {
        console.error('❌ [IPC] خطأ في تحميل التصفية للتعديل:', {
            reconciliationId: reconciliationId,
            error: error.message,
            stack: error.stack
        });

        // Re-throw with more context
        const enhancedError = new Error(`فشل في تحميل التصفية: ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.reconciliationId = reconciliationId;
        throw enhancedError;
    }
});

// Update reconciliation with modification date
ipcMain.handle('update-reconciliation-modified', async (
    event,
    reconciliationId,
    systemSales,
    totalReceipts,
    surplusDeficit,
    status,
    formulaSettingsJson = null,
    formulaProfileId = null
) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.updateReconciliationModified(
            reconciliationId,
            systemSales,
            totalReceipts,
            surplusDeficit,
            status,
            formulaSettingsJson,
            formulaProfileId
        );
    } catch (error) {
        console.error('Error updating reconciliation:', error);
        throw error;
    }
});

// Get next reconciliation number
ipcMain.handle('get-next-reconciliation-number', async (event) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.getNextReconciliationNumber();
    } catch (error) {
        console.error('Error getting next reconciliation number:', error);
        throw error;
    }
});

// Complete reconciliation with reconciliation number
ipcMain.handle('complete-reconciliation', async (
    event,
    reconciliationId,
    systemSales,
    totalReceipts,
    surplusDeficit,
    reconciliationNumber,
    formulaSettingsJson = null,
    formulaProfileId = null,
    cashboxPostingEnabled = null
) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        const result = dbManager.completeReconciliation(
            reconciliationId,
            systemSales,
            totalReceipts,
            surplusDeficit,
            reconciliationNumber,
            formulaSettingsJson,
            formulaProfileId,
            cashboxPostingEnabled
        );

        try {
            const cashboxSyncResult = dbManager.syncCashboxVouchersFromReconciliation(reconciliationId);
            console.log('🧾 [MAIN] Auto cashbox sync completed after reconciliation:', cashboxSyncResult);
        } catch (cashboxSyncError) {
            console.warn('⚠️ [MAIN] Auto cashbox sync failed after reconciliation completion:', cashboxSyncError.message);
        }

        // Trigger instant sync after completion
        try {
            const { triggerInstantSync } = require('./background-sync');
            triggerInstantSync();
            console.log('⚡ [MAIN] Instant sync triggered after reconciliation completion');
        } catch (syncErr) {
            console.warn('⚠️ [MAIN] Failed to trigger instant sync:', syncErr);
        }

        return result;
    } catch (error) {
        console.error('Error completing reconciliation:', error);
        throw error;
    }
});

ipcMain.handle('sync-reconciliation-cashbox-vouchers', async (event, reconciliationId) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.syncCashboxVouchersFromReconciliation(reconciliationId);
    } catch (error) {
        console.error('Error syncing reconciliation cashbox vouchers:', error);
        throw error;
    }
});

// Fix existing completed reconciliations numbering
ipcMain.handle('fix-existing-reconciliations', async (event) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }
        return dbManager.fixExistingCompletedReconciliations();
    } catch (error) {
        console.error('Error fixing existing reconciliations:', error);
        throw error;
    }
});

// PDF generation handler
ipcMain.handle('generate-pdf', async (event, reconciliationData) => {
    try {
        if (!pdfGenerator) {
            pdfGenerator = new PDFGenerator(dbManager);
        }

        const pdfBuffer = await pdfGenerator.generateReconciliationReport(reconciliationData);

        // Get default save path from settings
        const safeCashierName = sanitizeFileName(reconciliationData?.cashierName || 'cashier');
        const safeDate = sanitizeFileName(reconciliationData?.reconciliationDate || new Date().toISOString().split('T')[0]);
        let defaultPath = `تقرير_تصفية_${safeCashierName}_${safeDate}.pdf`;
        try {
            const savedPath = await getReportsDefaultSavePath();
            if (savedPath) {
                defaultPath = path.join(savedPath, defaultPath);
            }
        } catch (error) {
            console.log('ℹ️ [IPC] لم يتم العثور على مسار افتراضي محفوظ');
        }

        // Show save dialog
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'حفظ تقرير التصفية',
            defaultPath: defaultPath,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
            ]
        });

        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, pdfBuffer);
            return { success: true, filePath: result.filePath };
        } else {
            return { success: false, message: 'تم إلغاء العملية' };
        }

    } catch (error) {
        console.error('PDF generation error:', error);
        return { success: false, message: error.message };
    }
});

// Advanced printing handlers
ipcMain.handle('get-printers', async () => {
    try {
        if (!printManager) {
            throw new Error('Print manager not initialized');
        }

        // Use main window to get printers
        if (mainWindow && mainWindow.webContents) {
            try {
                const printers = await mainWindow.webContents.getPrinters();
                return printers.map(printer => ({
                    name: printer.name,
                    displayName: printer.displayName || printer.name,
                    description: printer.description || '',
                    status: printer.status || 'unknown',
                    isDefault: printer.isDefault || false
                }));
            } catch (printerError) {
                console.warn('Could not get system printers, using fallback');
                return [{
                    name: 'default',
                    displayName: 'الطابعة الافتراضية',
                    description: 'طابعة النظام الافتراضية',
                    status: 'available',
                    isDefault: true
                }];
            }
        } else {
            return [{
                name: 'default',
                displayName: 'الطابعة الافتراضية',
                description: 'طابعة النظام الافتراضية',
                status: 'available',
                isDefault: true
            }];
        }
    } catch (error) {
        console.error('Error getting printers:', error);
        return [{
            name: 'default',
            displayName: 'الطابعة الافتراضية',
            description: 'طابعة النظام الافتراضية',
            status: 'available',
            isDefault: true
        }];
    }
});

function parsePrintBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parsePrintNumber(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLegacyMargins(rawMargins) {
    if (!rawMargins) {
        return {};
    }
    if (typeof rawMargins === 'object' && rawMargins !== null) {
        return rawMargins;
    }
    try {
        const parsed = JSON.parse(rawMargins);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        void error;
        return {};
    }
}

function normalizePrintSettingsForRuntime(inputSettings = {}, baseSettings = {}) {
    const source = (inputSettings && typeof inputSettings === 'object') ? inputSettings : {};
    const base = (baseSettings && typeof baseSettings === 'object') ? baseSettings : {};
    const baseMargins = (base.margins && typeof base.margins === 'object') ? base.margins : {};
    const legacyMargins = parseLegacyMargins(source.margins);

    return {
        paperSize: source.paper_size || source.paperSize || base.paperSize || 'A4',
        orientation: source.paper_orientation || source.orientation || base.orientation || 'portrait',
        margins: {
            top: parsePrintNumber(source.margin_top ?? source.marginTop ?? legacyMargins.top, parsePrintNumber(baseMargins.top, 1)),
            right: parsePrintNumber(source.margin_right ?? source.marginRight ?? legacyMargins.right, parsePrintNumber(baseMargins.right, 1)),
            bottom: parsePrintNumber(source.margin_bottom ?? source.marginBottom ?? legacyMargins.bottom, parsePrintNumber(baseMargins.bottom, 1)),
            left: parsePrintNumber(source.margin_left ?? source.marginLeft ?? legacyMargins.left, parsePrintNumber(baseMargins.left, 1))
        },
        copies: Math.max(1, Number.parseInt(source.copies ?? base.copies ?? 1, 10) || 1),
        color: parsePrintBoolean(source.color_print ?? source.color, parsePrintBoolean(base.color, false)),
        duplex: source.duplex || base.duplex || 'simplex',
        fontSize: source.font_size || source.fontSize || base.fontSize || 'normal',
        fontFamily: source.font_family || source.fontFamily || base.fontFamily || 'Cairo',
        printerName: source.printer_name || source.printerName || base.printerName || ''
    };
}

async function loadPrintSettingsFromSystemSettings() {
    if (!dbManager) {
        return null;
    }

    await dbManager.run(
        `DELETE FROM system_settings
         WHERE category = 'print'
           AND id NOT IN (
             SELECT MAX(id)
             FROM system_settings
             WHERE category = 'print'
             GROUP BY setting_key
           )`
    );

    const rows = await dbManager.query(
        `SELECT s.setting_key, s.setting_value
         FROM system_settings s
         INNER JOIN (
           SELECT setting_key, MAX(id) AS latest_id
           FROM system_settings
           WHERE category = 'print'
           GROUP BY setting_key
         ) latest
           ON latest.latest_id = s.id
         WHERE s.category = 'print'`
    );

    if (!Array.isArray(rows) || rows.length === 0) {
        return null;
    }

    const settingsMap = {};
    rows.forEach((row) => {
        settingsMap[row.setting_key] = row.setting_value;
    });

    const fallbackSettings = printManager ? printManager.getPrintSettings() : {};
    return normalizePrintSettingsForRuntime(settingsMap, fallbackSettings);
}

async function persistPrintSettingsToDatabase(runtimeSettings = {}) {
    if (!dbManager) {
        return;
    }

    const normalized = normalizePrintSettingsForRuntime(runtimeSettings, {});
    const settingsToSave = [
        ['paper_size', normalized.paperSize || 'A4'],
        ['paper_orientation', normalized.orientation || 'portrait'],
        ['font_family', normalized.fontFamily || 'Cairo'],
        ['font_size', normalized.fontSize || 'normal'],
        ['margin_top', String(normalized.margins.top)],
        ['margin_right', String(normalized.margins.right)],
        ['margin_bottom', String(normalized.margins.bottom)],
        ['margin_left', String(normalized.margins.left)],
        ['copies', String(normalized.copies)],
        ['color_print', String(Boolean(normalized.color))],
        ['duplex', normalized.duplex || 'simplex'],
        ['printer_name', normalized.printerName || '']
    ];

    async function upsertSettingWithLegacyFallback(category, settingKey, settingValue) {
        const normalizedValue = settingValue == null ? '' : String(settingValue);

        try {
            await dbManager.run(
                `INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(category, setting_key) DO UPDATE SET
                   setting_value = excluded.setting_value,
                   updated_at = CURRENT_TIMESTAMP`,
                [category, settingKey, normalizedValue]
            );
            return;
        } catch (error) {
            const message = String(error && error.message ? error.message : '');
            const hasLegacySchema = message.includes('ON CONFLICT clause does not match');
            if (!hasLegacySchema) {
                throw error;
            }
        }

        // Legacy schema fallback (without UNIQUE constraint on category+setting_key).
        await dbManager.run(
            `INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [category, settingKey, normalizedValue]
        );
    }

    for (const [settingKey, settingValue] of settingsToSave) {
        await upsertSettingWithLegacyFallback('print', settingKey, settingValue);

        // Keep only the latest value for this key in case of legacy duplicate rows.
        await dbManager.run(
            `DELETE FROM system_settings
             WHERE category = ?
               AND setting_key = ?
               AND id NOT IN (
                 SELECT id
                 FROM system_settings
                 WHERE category = ?
                   AND setting_key = ?
                 ORDER BY id DESC
                 LIMIT 1
               )`,
            ['print', settingKey, 'print', settingKey]
        );
    }

    await dbManager.run(
        `DELETE FROM system_settings
         WHERE category = 'print'
           AND setting_key IN (
             'paperSize',
             'paperOrientation',
             'orientation',
             'fontFamily',
             'fontSize',
             'color',
             'margins',
             'marginTop',
             'marginRight',
             'marginBottom',
             'marginLeft',
             'printerName'
           )`
    );
}

ipcMain.handle('get-print-settings', async () => {
    try {
        if (!printManager) {
            throw new Error('Print manager not initialized');
        }

        const persistedSettings = await loadPrintSettingsFromSystemSettings();
        if (persistedSettings) {
            printManager.updatePrintSettings(persistedSettings);
        }

        return printManager.getPrintSettings();
    } catch (error) {
        console.error('Error getting print settings:', error);
        throw error;
    }
});

ipcMain.handle('update-print-settings', async (event, settings) => {
    try {
        if (!printManager) {
            throw new Error('Print manager not initialized');
        }
        const currentSettings = printManager.getPrintSettings();
        const normalizedSettings = normalizePrintSettingsForRuntime(settings, currentSettings);
        printManager.updatePrintSettings(normalizedSettings);
        await persistPrintSettingsToDatabase(printManager.getPrintSettings());

        return { success: true };
    } catch (error) {
        console.error('Error updating print settings:', error);
        throw error;
    }
});

ipcMain.handle('print-direct', async (event, reconciliationData, printOptions = {}) => {
    try {
        if (!printManager) {
            throw new Error('Print manager not initialized');
        }

        const htmlContent = printManager.generateReconciliationPrintHTML(reconciliationData, printOptions);
        return await printManager.printHTML(htmlContent, printOptions);
    } catch (error) {
        console.error('Direct print error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('print-preview', async (event, reconciliationData, printOptions = {}) => {
    try {
        if (!printManager) {
            throw new Error('Print manager not initialized');
        }

        const htmlContent = printManager.generateReconciliationPrintHTML(reconciliationData, printOptions);
        return await printManager.printWithPreview(htmlContent, printOptions);
    } catch (error) {
        console.error('Print preview error:', error);
        return { success: false, error: error.message };
    }
});

// Export PDF handler for reports
ipcMain.handle('export-pdf', async (event, exportData) => {
    console.log('📄 [IPC] طلب تصدير PDF...');

    try {
        if (!exportData) {
            throw new Error('بيانات التصدير مطلوبة');
        }

        if (!exportData.html) {
            throw new Error('محتوى HTML مطلوب للتصدير');
        }

        if (!pdfGenerator) {
            pdfGenerator = new PDFGenerator(dbManager);
        }

        // Generate PDF from HTML
        const pdfBuffer = await pdfGenerator.generateFromHTML(exportData.html);

        // Get default save path from settings
        let defaultPath = exportData.filename || `report-${new Date().toISOString().split('T')[0]}.pdf`;
        try {
            const savedPath = await getReportsDefaultSavePath();
            if (savedPath) {
                defaultPath = path.join(savedPath, defaultPath);
            }
        } catch (error) {
            console.log('ℹ️ [IPC] لم يتم العثور على مسار افتراضي محفوظ');
        }

        // Show save dialog
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'حفظ تقرير PDF',
            defaultPath: defaultPath,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
            ]
        });

        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, pdfBuffer);
            await runPostExportActions(result.filePath, exportData);
            console.log('✅ [IPC] تم تصدير PDF بنجاح:', result.filePath);
            return { success: true, filePath: result.filePath };
        } else {
            return { success: false, error: 'تم إلغاء العملية' };
        }

    } catch (error) {
        console.error('❌ [IPC] خطأ في تصدير PDF:', error);
        return { success: false, error: error.message };
    }
});

// Export Excel handler for reports
ipcMain.handle('export-excel', async (event, exportData) => {
    console.log('📊 [IPC] طلب تصدير Excel...');

    try {
        if (!exportData) {
            throw new Error('بيانات التصدير مطلوبة');
        }

        if (!exportData.data) {
            throw new Error('بيانات Excel مطلوبة للتصدير');
        }

        // Create Excel workbook
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('تقرير التصفيات');

        // Add headers
        if (exportData.data.headers) {
            worksheet.addRow(exportData.data.headers);

            // Style headers
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
        }

        // Add data rows
        if (exportData.data.rows) {
            exportData.data.rows.forEach(row => {
                worksheet.addRow(row);
            });
        }

        // Auto-fit columns
        worksheet.columns.forEach(column => {
            column.width = 15;
        });

        // Get default save path from settings
        let defaultPath = exportData.filename || `report-${new Date().toISOString().split('T')[0]}.xlsx`;
        try {
            const savedPath = await getReportsDefaultSavePath();
            if (savedPath) {
                defaultPath = path.join(savedPath, defaultPath);
            }
        } catch (error) {
            console.log('ℹ️ [IPC] لم يتم العثور على مسار افتراضي محفوظ');
        }

        // Show save dialog
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'حفظ تقرير Excel',
            defaultPath: defaultPath,
            filters: [
                { name: 'Excel Files', extensions: ['xlsx'] }
            ]
        });

        if (!result.canceled && result.filePath) {
            const reportBehavior = await getReportsBehaviorSettings();
            const shouldCompress = exportData.compress === undefined
                ? reportBehavior.compress
                : exportData.compress === true;

            if (shouldCompress) {
                try {
                    await workbook.xlsx.writeFile(result.filePath, {
                        zip: { compression: 'DEFLATE', compressionOptions: { level: 9 } }
                    });
                } catch (compressionError) {
                    console.warn('⚠️ [IPC] خيار ضغط Excel غير مدعوم، سيتم الحفظ بدون ضغط:', compressionError.message);
                    await workbook.xlsx.writeFile(result.filePath);
                }
            } else {
                await workbook.xlsx.writeFile(result.filePath);
            }
            await runPostExportActions(result.filePath, exportData);
            console.log('✅ [IPC] تم تصدير Excel بنجاح:', result.filePath);
            return { success: true, filePath: result.filePath };
        } else {
            return { success: false, error: 'تم إلغاء العملية' };
        }

    } catch (error) {
        console.error('❌ [IPC] خطأ في تصدير Excel:', error);
        return { success: false, error: error.message };
    }
});

// Create print preview window with Arabic support
ipcMain.handle('create-print-preview', async (event, printData) => {
    console.log('🖨️ [IPC] طلب إنشاء نافذة معاينة الطباعة...');

    try {
        // Validate print data
        if (!printData) {
            throw new Error('بيانات الطباعة مطلوبة');
        }

        // Handle different data formats
        if (printData.html && printData.title) {
            // Report HTML format
            console.log('📄 [IPC] معاينة طباعة تقرير HTML');
            const previewWindow = createReportPrintPreviewWindow(printData);

            if (previewWindow) {
                console.log('✅ [IPC] تم إنشاء نافذة معاينة طباعة التقرير بنجاح');
                return { success: true, windowId: previewWindow.id };
            } else {
                throw new Error('فشل في إنشاء نافذة معاينة طباعة التقرير');
            }
        } else if (printData.reconciliation) {
            // Reconciliation format
            console.log('📊 [IPC] معاينة طباعة التصفية');
            console.log('📊 [IPC] بيانات الطباعة:', {
                reconciliationId: printData.reconciliation.id,
                sectionsCount: Object.keys(printData.sections || {}).length,
                hasOptions: !!printData.options
            });

            // Create print preview window
            const previewWindow = createPrintPreviewWindow(printData);

            if (previewWindow) {
                console.log('✅ [IPC] تم إنشاء نافذة معاينة الطباعة بنجاح');
                return { success: true, windowId: previewWindow.id };
            } else {
                throw new Error('فشل في إنشاء نافذة معاينة الطباعة');
            }
        } else {
            throw new Error('تنسيق بيانات الطباعة غير مدعوم');
        }

    } catch (error) {
        console.error('❌ [IPC] خطأ في إنشاء نافذة معاينة الطباعة:', error);
        return { success: false, error: error.message };
    }
});

// Helper function to create report print preview window
function createReportPrintPreviewWindow(printData) {
    try {
        console.log('🖨️ [HELPER] إنشاء نافذة معاينة طباعة التقرير...');

        // Create print preview window
        printPreviewWindow = new BrowserWindow({
            width: 900,
            height: 1200,
            minWidth: 800,
            minHeight: 1000,
            webPreferences: createSecureWebPreferences(__dirname, {
                devTools: IS_DEV_MODE,
                webSecurity: !IS_DEV_MODE
            }),
            title: printData.title || 'معاينة الطباعة',
            icon: path.join(__dirname, '../assets/icon.png'),
            parent: mainWindow,
            modal: false,
            show: false,
            autoHideMenuBar: true
        });

        // Create HTML content with print styles
        const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${printData.title || 'معاينة الطباعة'}</title>
        <style>
          @media print {
            body { margin: 0; margin-bottom: 25mm; }
            .no-print { display: none !important; }
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
          }
          @page {
            margin-bottom: 25mm;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            direction: rtl;
            text-align: right;
            margin: 20px;
            background: white;
            margin-bottom: 25mm;
          }
          .print-controls {
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 1000;
            background: white;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          }
          .print-controls button {
            margin: 0 5px;
            padding: 8px 15px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
          }
          .print-btn { background: #007bff; color: white; }
          .close-btn { background: #6c757d; color: white; }
        </style>
      </head>
      <body>
        <div class="print-controls no-print">
          <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
          <button class="close-btn" onclick="window.close()">❌ إغلاق</button>
        </div>
        ${printData.html}

        <!-- فوتر الصفحة - يظهر في كل صفحة مطبوعة -->
        <div class="page-footer">
          تم تطوير هذا النظام بواسطة محمد أمين - جميع الحقوق محفوظة © Tasfiya Pro
        </div>

        ${generateNonColoredPrintStyles(printData.isColorPrint !== false)}
      </body>
      </html>
    `;

        // Load HTML content
        printPreviewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

        // Show window when ready
        printPreviewWindow.once('ready-to-show', () => {
            printPreviewWindow.show();
            console.log('✅ [HELPER] تم عرض نافذة معاينة طباعة التقرير');
        });

        // Handle window closed
        printPreviewWindow.on('closed', () => {
            printPreviewWindow = null;
            console.log('🖨️ [HELPER] تم إغلاق نافذة معاينة طباعة التقرير');
        });

        return printPreviewWindow;

    } catch (error) {
        console.error('❌ [HELPER] خطأ في إنشاء نافذة معاينة طباعة التقرير:', error);
        return null;
    }
}


// --- SYNC CONTROL IPC Handlers ---

ipcMain.handle('get-sync-status', async () => {
    try {
        const isRunning = getSyncStatus();
        const isSyncGloballyEnabled = getSyncEnabled();

        // Also check persisted setting
        let isEnabled = true;
        if (dbManager) {
            const row = dbManager.db.prepare("SELECT setting_value FROM system_settings WHERE category = 'general' AND setting_key = 'sync_enabled'").get();
            if (row && row.setting_value === 'false') isEnabled = false;
        }

        // Combine both checks
        const finalEnabled = isEnabled && isSyncGloballyEnabled;

        return { success: true, isRunning, isEnabled: finalEnabled };
    } catch (e) {
        console.error('Error checking sync status:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('toggle-sync', async (event, enable) => {
    try {
        console.log(`🔄 [APP] Toggling sync to: ${enable}`);
        if (!dbManager) throw new Error('Database not initialized');

        // 1. Save setting to database
        const stmt = dbManager.db.prepare(`
            INSERT INTO system_settings (category, setting_key, setting_value, updated_at)
            VALUES ('general', 'sync_enabled', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(category, setting_key) DO UPDATE SET
            setting_value = excluded.setting_value,
            updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(enable ? 'true' : 'false');

        // 2. Set global sync enabled flag
        setSyncEnabled(enable);

        // 3. Start or stop background sync interval
        if (enable) {
            const { startBackgroundSync } = require('./background-sync');
            startBackgroundSync(dbManager);
        } else {
            const { stopBackgroundSync } = require('./background-sync');
            stopBackgroundSync();
        }

        return { success: true, isEnabled: enable };
    } catch (e) {
        console.error('Error toggling sync:', e);
        return { success: false, error: e.message };
    }
});

// Close print preview window
ipcMain.handle('close-print-preview', async (event) => {
    console.log('🖨️ [IPC] طلب إغلاق نافذة معاينة الطباعة...');

    try {
        if (printPreviewWindow && !printPreviewWindow.isDestroyed()) {
            printPreviewWindow.close();
            printPreviewWindow = null;
            console.log('✅ [IPC] تم إغلاق نافذة معاينة الطباعة');
            return { success: true };
        } else {
            console.log('⚠️ [IPC] نافذة معاينة الطباعة غير موجودة');
            return { success: true, message: 'نافذة معاينة الطباعة غير موجودة' };
        }
    } catch (error) {
        console.error('❌ [IPC] خطأ في إغلاق نافذة معاينة الطباعة:', error);
        return { success: false, error: error.message };
    }
});

// Get system information
ipcMain.handle('get-system-info', async (event) => {
    try {
        const os = require('os');
        const process = require('process');

        const systemInfo = {
            nodeVersion: process.version,
            electronVersion: process.versions.electron,
            osInfo: `${os.type()} ${os.release()} ${os.arch()}`,
            memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
            uptime: formatUptime(process.uptime())
        };

        return systemInfo;
    } catch (error) {
        console.error('❌ [IPC] خطأ في الحصول على معلومات النظام:', error);
        return null;
    }
});

// Get database statistics
ipcMain.handle('get-database-stats', async (event) => {
    try {
        if (!dbManager || !dbManager.db) {
            throw new Error('Database not initialized');
        }

        // Get database file size
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(app.getPath('userData'), 'casher.db');

        let size = 'غير متاح';
        let recordCount = 0;

        try {
            const stats = fs.statSync(dbPath);
            size = `${formatCurrency(stats.size / 1024 / 1024)} MB`;
        } catch (error) {
            console.error('خطأ في قراءة حجم قاعدة البيانات:', error);
        }

        // Get total record count
        try {
            const tables = [
                'reconciliations',
                'bank_receipts',
                'cash_receipts',
                'customer_receipts',
                'postpaid_sales',
                'return_invoices',
                'suppliers',
                'manual_postpaid_sales',
                'manual_customer_receipts',
                'manual_supplier_transactions',
                'branch_cashboxes',
                'cashbox_vouchers',
                'cashbox_voucher_audit_log'
            ];
            for (const table of tables) {
                try {
                    // Check if table exists before querying
                    const tableExists = dbManager.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
                    if (tableExists) {
                        const result = dbManager.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                        recordCount += result.count;
                    } else {
                        console.warn(`⚠️ [DB-STATS] الجدول ${table} غير موجود، تم تخطيه`);
                    }
                } catch (tableError) {
                    console.error(`❌ [DB-STATS] خطأ في فحص الجدول ${table}:`, tableError.message);
                }
            }
        } catch (error) {
            console.error('خطأ في حساب عدد السجلات:', error);
        }

        return {
            size: size,
            recordCount: formatNumber(recordCount)
        };

    } catch (error) {
        console.error('❌ [IPC] خطأ في الحصول على إحصائيات قاعدة البيانات:', error);
        return null;
    }
});

// Helper function to format uptime
function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours} ساعة ${minutes} دقيقة`;
    } else if (minutes > 0) {
        return `${minutes} دقيقة ${secs} ثانية`;
    } else {
        return `${secs} ثانية`;
    }
}

// ========================================
// BACKUP AND RESTORE IPC HANDLERS
// ========================================

// Show save dialog for backup
ipcMain.handle('show-save-dialog', async (event, options) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, options);
        return result.canceled ? null : result.filePath;
    } catch (error) {
        console.error('❌ [IPC] خطأ في عرض حوار الحفظ:', error);
        throw error;
    }
});

// Show open dialog for restore
ipcMain.handle('show-open-dialog', async (event, options) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, options);
        return result.canceled ? [] : result.filePaths;
    } catch (error) {
        console.error('❌ [IPC] خطأ في عرض حوار الفتح:', error);
        throw error;
    }
});

// Save backup file
ipcMain.handle('save-backup-file', async (event, { filePath, data }) => {
    try {
        console.log('💾 [IPC] حفظ ملف النسخة الاحتياطية:', filePath);

        const jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonData, 'utf8');

        const stats = fs.statSync(filePath);
        const fileSize = `${formatCurrency(stats.size / 1024 / 1024)} MB`;
        const recordCount = data.metadata.total_records || 0;

        console.log('✅ [IPC] تم حفظ النسخة الاحتياطية بنجاح');
        return {
            success: true,
            fileSize: fileSize,
            recordCount: recordCount
        };

    } catch (error) {
        console.error('❌ [IPC] خطأ في حفظ النسخة الاحتياطية:', error);
        return { success: false, error: error.message };
    }
});

// Select directory dialog
ipcMain.handle('select-directory', async (event, options = {}) => {
    try {
        console.log('📁 [IPC] فتح حوار اختيار المجلد...');

        const result = await dialog.showOpenDialog(mainWindow, {
            title: options.title || 'اختر مجلد',
            defaultPath: options.defaultPath || '',
            properties: ['openDirectory', 'createDirectory']
        });

        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
            console.log('✅ [IPC] تم اختيار المجلد:', result.filePaths[0]);
            return { success: true, filePath: result.filePaths[0] };
        } else {
            return { success: false, message: 'تم إلغاء العملية' };
        }

    } catch (error) {
        console.error('❌ [IPC] خطأ في اختيار المجلد:', error);
        return { success: false, error: error.message };
    }
});

// Load backup file
ipcMain.handle('load-backup-file', async (event, filePath) => {
    try {
        console.log('📥 [IPC] تحميل ملف النسخة الاحتياطية:', filePath);

        if (!fs.existsSync(filePath)) {
            throw new Error('ملف النسخة الاحتياطية غير موجود');
        }

        const jsonData = fs.readFileSync(filePath, 'utf8');
        const backupData = JSON.parse(jsonData);

        console.log('✅ [IPC] تم تحميل النسخة الاحتياطية بنجاح');
        return { success: true, data: backupData };

    } catch (error) {
        console.error('❌ [IPC] خطأ في تحميل النسخة الاحتياطية:', error);
        return { success: false, error: error.message };
    }
});

// Helper function to format numbers using English digits
function formatNumber(number) {
    if (number === null || number === undefined) return '0';

    try {
        return new Intl.NumberFormat('en-US').format(number);
    } catch (error) {
        console.error('Error formatting number:', error);
        return String(number);
    }
}

// تحديث بيانات العميل
ipcMain.handle('update-customer-data', async (event, data) => {
    try {
        console.log('🔄 [IPC] طلب تحديث بيانات العميل:', data);

        if (!dbManager || !dbManager.db) {
            throw new Error('قاعدة البيانات غير متاحة');
        }

        const { oldCustomerName, newName } = data;

        if (oldCustomerName !== newName) {
            // تحديث اسم العميل في جميع الجداول
            await dbManager.run('BEGIN TRANSACTION');

            try {
                await dbManager.run(
                    `UPDATE customer_receipts 
           SET customer_name = ?
           WHERE customer_name = ?`,
                    [newName, oldCustomerName]
                );

                await dbManager.run(
                    `UPDATE postpaid_sales 
           SET customer_name = ?
           WHERE customer_name = ?`,
                    [newName, oldCustomerName]
                );

                await dbManager.run('COMMIT');
                console.log('✅ [IPC] تم تحديث بيانات العميل بنجاح');
                return { success: true };
            } catch (error) {
                await dbManager.run('ROLLBACK');
                console.error('❌ [IPC] خطأ في تحديث بيانات العميل:', error);
                return { success: false, error: error.message };
            }
        } else {
            return { success: true };
        }
    } catch (error) {
        console.error('❌ [IPC] خطأ في تحديث بيانات العميل:', error);
        return { success: false, error: error.message };
    }
});

// =====================================================================
// 🖨️ THERMAL PRINTER 80MM HANDLERS - معالجات الطابعة الحرارية 80 ملم
// =====================================================================

/**
 * Preview thermal receipt
 * معاينة إيصال الطابعة الحرارية
 */
ipcMain.handle('thermal-printer-preview', async (event, reconciliationData) => {
    try {
        console.log('🖨️ [THERMAL-PRINTER] طلب معاينة إيصال الطابعة الحرارية...');

        if (!thermalPrinter) {
            throw new Error('طابعة حرارية غير معاهة للتهيئة');
        }

        if (!reconciliationData || !reconciliationData.reconciliation) {
            throw new Error('بيانات التصفية مطلوبة');
        }

        // Enforce summary hiding for detailed ATM thermal reports.
        const isDetailedAtmReport =
            reconciliationData?.isDetailedAtmReport === true ||
            String(reconciliationData?.reconciliation?.reconciliation_number || '').startsWith('ATM-RPT-');
        if (isDetailedAtmReport) {
            reconciliationData.printOptions = {
                ...(reconciliationData.printOptions || {}),
                includeSummary: false
            };
            reconciliationData.selectedSections = {
                ...(reconciliationData.selectedSections || {}),
                summary: false
            };
        }

        // Get company settings from database
        try {
            const companySettings = {};
            const companyName = await dbManager.db.prepare(
                'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ?'
            ).get('general', 'company_name');

            const companyLogo = await dbManager.db.prepare(
                'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ?'
            ).get('general', 'company_logo');

            if (companyName) {
                companySettings.company_name = companyName.setting_value;
            }
            if (companyLogo) {
                companySettings.company_logo = companyLogo.setting_value;
            }

            if (Object.keys(companySettings).length > 0) {
                reconciliationData.companySettings = companySettings;
            }
        } catch (settingsError) {
            console.warn('⚠️ [THERMAL-PRINTER] تعذر تحميل إعدادات الشركة:', settingsError);
        }

        // Don't await - let preview open in background
        thermalPrinter.previewReceipt(reconciliationData).then(result => {
            if (result.success) {
                console.log('✅ [THERMAL-PRINTER] تم فتح معاينة الإيصال بنجاح');
            } else {
                console.error('❌ [THERMAL-PRINTER] فشلت المعاينة:', result.error);
            }
        }).catch(error => {
            console.error('❌ [THERMAL-PRINTER] خطأ غير متوقع في المعاينة:', error);
        });

        // Return immediately to close the loading dialog
        return {
            success: true,
            message: 'تم فتح معاينة الإيصال'
        };

    } catch (error) {
        console.error('❌ [THERMAL-PRINTER] خطأ في معاينة الإيصال:', error);
        return {
            success: false,
            error: error.message,
            message: 'فشل في فتح معاينة الإيصال'
        };
    }
});

/**
 * Print directly to thermal printer
 * طباعة مباشرة على طابعة حرارية
 */
ipcMain.handle('thermal-printer-print', async (event, reconciliationData, options = {}) => {
    try {
        console.log('🖨️ [THERMAL-PRINTER] طلب طباعة مباشرة على الطابعة الحرارية...');

        if (!thermalPrinter) {
            throw new Error('طابعة حرارية غير معاهة للتهيئة');
        }

        if (!reconciliationData || !reconciliationData.reconciliation) {
            throw new Error('بيانات التصفية مطلوبة');
        }

        // Enforce summary hiding for detailed ATM thermal reports.
        const isDetailedAtmReport =
            reconciliationData?.isDetailedAtmReport === true ||
            String(reconciliationData?.reconciliation?.reconciliation_number || '').startsWith('ATM-RPT-');
        if (isDetailedAtmReport) {
            reconciliationData.printOptions = {
                ...(reconciliationData.printOptions || {}),
                includeSummary: false
            };
            reconciliationData.selectedSections = {
                ...(reconciliationData.selectedSections || {}),
                summary: false
            };
        }

        // Get company settings from database
        try {
            const companySettings = {};
            const companyName = await dbManager.db.prepare(
                'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ?'
            ).get('general', 'company_name');

            const companyLogo = await dbManager.db.prepare(
                'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ?'
            ).get('general', 'company_logo');

            if (companyName) {
                companySettings.company_name = companyName.setting_value;
            }
            if (companyLogo) {
                companySettings.company_logo = companyLogo.setting_value;
            }

            if (Object.keys(companySettings).length > 0) {
                reconciliationData.companySettings = companySettings;
            }
        } catch (settingsError) {
            console.warn('⚠️ [THERMAL-PRINTER] تعذر تحميل إعدادات الشركة:', settingsError);
        }

        // Update printer settings if provided
        if (options && Object.keys(options).length > 0) {
            thermalPrinter.updateSettings(options);
        }

        // Don't await the full process - return immediately and let printing happen in background
        thermalPrinter.printReceipt(
            reconciliationData,
            options.printerName
        ).then(result => {
            if (result.success) {
                console.log('✅ [THERMAL-PRINTER] اكتملت الطباعة بنجاح');
            } else {
                console.error('❌ [THERMAL-PRINTER] فشلت الطباعة:', result.error);
            }
        }).catch(error => {
            console.error('❌ [THERMAL-PRINTER] خطأ غير متوقع في الطباعة:', error);
        });

        // Return immediately to close the loading dialog
        return {
            success: true,
            message: 'تم إرسال الإيصال للطابعة'
        };

    } catch (error) {
        console.error('❌ [THERMAL-PRINTER] خطأ في الطباعة الحرارية:', error);
        return {
            success: false,
            error: error.message,
            message: 'فشل في طباعة الإيصال'
        };
    }
});

/**
 * Get thermal printer settings
 * الحصول على إعدادات الطابعة الحرارية
 */
ipcMain.handle('thermal-printer-settings-get', async (event) => {
    try {
        if (!thermalPrinter) {
            throw new Error('طابعة حرارية غير معاهة للتهيئة');
        }

        // First try to get from database
        if (dbManager) {
            try {
                const query = `SELECT setting_key, setting_value FROM system_settings WHERE category = 'thermal_printer'`;
                const results = dbManager.db.prepare(query).all();

                if (results && results.length > 0) {
                    const settings = {};
                    for (const row of results) {
                        const key = row.setting_key;
                        const value = row.setting_value;

                        // Convert string values back to proper types
                        if (value === 'true') {
                            settings[key] = true;
                        } else if (value === 'false') {
                            settings[key] = false;
                        } else if (!isNaN(value) && value !== '') {
                            settings[key] = parseInt(value);
                        } else {
                            settings[key] = value;
                        }
                    }

                    if (Object.keys(settings).length > 0) {
                        return {
                            success: true,
                            settings: settings
                        };
                    }
                }
            } catch (dbError) {
                safeWarn('⚠️ [THERMAL-PRINTER] خطأ في جلب الإعدادات من قاعدة البيانات: ' + dbError.message);
            }
        }

        // Fallback to in-memory settings
        return {
            success: true,
            settings: thermalPrinter.getSettings()
        };

    } catch (error) {
        safeError('❌ [THERMAL-PRINTER] خطأ في الحصول على الإعدادات: ' + error.message);
        return {
            success: false,
            error: error.message
        };
    }
});

/**
 * Update thermal printer settings
 * تحديث إعدادات الطابعة الحرارية
 */
ipcMain.handle('thermal-printer-settings-update', async (event, settings) => {
    try {
        if (!thermalPrinter) {
            throw new Error('طابعة حرارية غير معاهة للتهيئة');
        }

        if (!settings || typeof settings !== 'object') {
            throw new Error('إعدادات غير صحيحة');
        }

        thermalPrinter.updateSettings(settings);

        // Save settings to database
        if (dbManager) {
            try {
                await dbManager.run('DELETE FROM system_settings WHERE category = ?', ['thermal_printer']);

                for (const [key, value] of Object.entries(settings)) {
                    await dbManager.run(
                        'INSERT INTO system_settings (category, setting_key, setting_value) VALUES (?, ?, ?)',
                        ['thermal_printer', key, String(value)]
                    );
                }

                safeLog('✅ [THERMAL-PRINTER] تم حفظ الإعدادات بنجاح');
            } catch (dbError) {
                safeWarn('⚠️ [THERMAL-PRINTER] تحذير عند حفظ الإعدادات في قاعدة البيانات: ' + dbError.message);
            }
        }

        return {
            success: true,
            message: 'تم تحديث إعدادات الطابعة الحرارية'
        };

    } catch (error) {
        safeError('❌ [THERMAL-PRINTER] خطأ في تحديث الإعدادات: ' + error.message);
        return {
            success: false,
            error: error.message
        };
    }
});

/**
 * Get available printers for thermal printing
 * الحصول على قائمة الطابعات المتاحة
 */
ipcMain.handle('thermal-printer-list', async (event) => {
    try {
        let printers = [];

        // Method 1: Try getting system printers using PowerShell
        try {
            printers = getSystemPrinters();
            if (printers && printers.length > 0) {
                safeLog(`✅ [THERMAL] تم الحصول على ${printers.length} طابعة من النظام`);
                return {
                    success: true,
                    printers: printers
                };
            }
        } catch (sysError) {
            safeWarn('⚠️ [THERMAL] فشل الحصول على الطابعات من النظام: ' + sysError.message);
        }

        // Method 2: Try using webContents.getPrinters()
        if (mainWindow && mainWindow.webContents && typeof mainWindow.webContents.getPrinters === 'function') {
            try {
                printers = await mainWindow.webContents.getPrinters();
                if (printers && printers.length > 0) {
                    safeLog(`✅ [THERMAL] تم الحصول على ${printers.length} طابعة من webContents`);
                    return {
                        success: true,
                        printers: printers.map(printer => ({
                            name: printer.name || 'Unknown',
                            displayName: printer.displayName || printer.name || 'Unknown',
                            description: printer.description || '',
                            status: printer.status || 'unknown',
                            isDefault: printer.isDefault || false
                        }))
                    };
                }
            } catch (webError) {
                safeWarn('⚠️ [THERMAL] فشل الحصول على الطابعات من webContents: ' + webError.message);
            }
        }

        // Method 3: If no printers found, return fallback options
        safeLog('⚠️ [THERMAL] لم يتم العثور على طابعات محددة، سيتم استخدام الخيارات الافتراضية');

        printers = [
            {
                name: 'Default Printer',
                displayName: 'الطابعة الافتراضية',
                description: 'طابعة النظام الافتراضية',
                status: 'unknown',
                isDefault: true
            },
            {
                name: 'Microsoft Print to PDF',
                displayName: 'طباعة إلى PDF',
                description: 'طباعة إلى ملف PDF',
                status: 'unknown',
                isDefault: false
            }
        ];

        return {
            success: true,
            printers: printers
        };

    } catch (error) {
        safeError('❌ [THERMAL-PRINTER] خطأ في الحصول على قائمة الطابعات: ' + error.message);

        // Return fallback printers even on error
        return {
            success: true,
            printers: [
                {
                    name: 'Default Printer',
                    displayName: 'الطابعة الافتراضية',
                    description: 'طابعة النظام الافتراضية',
                    status: 'unknown',
                    isDefault: true
                }
            ]
        };
    }
});

/**
 * Get supported paper sizes
 * الحصول على أحجام الورق المدعومة
 */
ipcMain.handle('thermal-printer-paper-sizes', async (event) => {
    try {
        if (!thermalPrinter) {
            throw new Error('طابعة حرارية غير معاهة للتهيئة');
        }

        return {
            success: true,
            paperSizes: thermalPrinter.getSupportedPaperSizes()
        };

    } catch (error) {
        console.error('❌ [THERMAL-PRINTER] خطأ في الحصول على أحجام الورق:', error);
        return {
            success: false,
            error: error.message,
            paperSizes: []
        };
    }
});

/**
 * Print Customer Statement on Thermal Printer
 * طباعة كشف حساب العميل على الطابعة الحرارية
 */
ipcMain.handle('print-thermal-statement', async (event, statementData) => {
    try {
        console.log('🖨️ [THERMAL-PRINTER] طلب طباعة كشف حساب على الطابعة الحرارية...');

        if (!thermalPrinter) {
            throw new Error('طابعة حرارية غير معاهة للتهيئة');
        }

        if (!statementData || !statementData.customerName) {
            throw new Error('بيانات كشف الحساب غير كاملة');
        }

        // إنشاء بيانات متوافقة مع ThermalPrinter80mm
        const reconciliationData = {
            reconciliation: {
                id: null,
                cashier_id: null,
                accountant_id: null,
                reconciliation_number: null,
                reconciliation_date: new Date().toISOString().split('T')[0],
                status: 'completed'
            },
            cashier: {
                cashier_name: 'كشف حساب عميل',
                branch_id: null
            },
            branch: statementData.branch ? {
                branch_name: statementData.branch.branch_name || 'فرع',
                address: statementData.branch.branch_address || '',
                phone: statementData.branch.branch_phone || ''
            } : {
                branch_name: 'فرع',
                address: '',
                phone: ''
            },
            // النص المخصص لكشف الحساب
            customText: statementData.textReceipt,
            isCustomerStatement: true,
            customerName: statementData.customerName,
            totalPostpaid: statementData.totalPost || 0,
            totalReceipts: statementData.totalRec || 0,
            balance: statementData.balance || 0
        };

        // طباعة الإيصال
        const result = await thermalPrinter.printReceipt(reconciliationData);

        if (result && result.success) {
            console.log('✅ [THERMAL-PRINTER] تمت طباعة كشف الحساب بنجاح');
            return {
                success: true,
                message: 'تمت طباعة كشف الحساب بنجاح'
            };
        } else {
            throw new Error(result?.error || 'فشلت عملية الطباعة');
        }

    } catch (error) {
        console.error('❌ [THERMAL-PRINTER] خطأ في طباعة كشف الحساب:', error);
        return {
            success: false,
            error: error.message,
            message: 'فشل في طباعة كشف الحساب'
        };
    }
});
