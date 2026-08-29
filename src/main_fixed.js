// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const DatabaseManager = require('./database');
const PDFGenerator = require('./pdf-generator');
const PrintManager = require('./print-manager');

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
  const isDev = process.argv.includes('--dev') || !app.isPackaged;
  process.env.NODE_ENV = isDev ? 'development' : 'production';
}

console.log(`🚀 Application starting in ${process.env.NODE_ENV} mode`);
console.log(`📦 App is packaged: ${app.isPackaged}`);
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

function createWindow() {
  // Create the browser window with Arabic RTL support
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../assets/icon.ico'),
    title: 'تصفية برو - Tasfiya Pro',
    show: true
  });

  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    title: 'معاينة الطباعة - Print Preview',
    icon: path.join(__dirname, '../assets/icon.png'),
    parent: mainWindow,
    modal: false,
    show: false,
    autoHideMenuBar: true,
    webSecurity: false
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
    const lastRecQuery = 'SELECT MAX(reconciliation_number) as max_num FROM reconciliations WHERE status = "completed"';
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
      await dbManager.run(recInsertQuery, recParams);

      // Get the last inserted ID
      const recId = await dbManager.getInsertId();

      // Add the transaction based on type
      if (type === 'receipt') {
        // Customer receipt
        const recInsertQuery = `
          INSERT INTO customer_receipts (
            reconciliation_id,
            customer_name,
            amount,
            payment_type,
            notes,
            created_at
          ) VALUES (?, ?, ?, 'manual', ?, ?)
        `;

        await dbManager.run(recInsertQuery, [
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
      return { success: false, error: error.message };
    }
  } catch (error) {
    console.error('Error in add-statement-transaction handler:', error);
    return { success: false, error: error.message };
  }
});

// Initialize the application
function initializeApp() {
  console.log('🚀 Initializing application...');

  // Initialize database
  dbManager = new DatabaseManager();
  if (!dbManager.initialize()) {
    console.error('❌ Failed to initialize database');
    return false;
  }

  // Initialize PDF generator
  pdfGenerator = new PDFGenerator();

  // Initialize print manager
  printManager = new PrintManager();

  // Create main window
  createWindow();

  return true;
}

// Start the application
if (initializeApp()) {
  console.log('✅ Application initialized successfully');
} else {
  console.error('❌ Failed to initialize application');
  app.exit(1);
}

// Handle app events
app.on('ready', () => {
  console.log('🚀 App is ready');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
