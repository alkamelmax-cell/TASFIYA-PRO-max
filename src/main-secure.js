const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const DatabaseManager = require('./database');
const PDFGenerator = require('./pdf-generator');
const PrintManager = require('./print-manager');

// Content Security Policy
const CSP = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'"],
    'object-src': ["'none'"]
};

// Keep a global reference of the window object
let mainWindow;
let printPreviewWindow;
let dbManager;
let pdfGenerator;
let printManager;

function createWindow() {
    // Create the browser window with enhanced security settings
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: true,
            webSecurity: true
        },
        icon: path.join(__dirname, '../assets/icon.ico'),
        title: 'تصفية برو - Tasfiya Pro',
        show: false
    });

    // Set up CSP headers
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [Object.entries(CSP)
                    .map(([key, values]) => `${key} ${values.join(' ')}`)
                    .join('; ')]
            }
        });
    });

    // Load the index.html file
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open DevTools in development only
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // Clean up on window close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Initialize database with error handling
async function initializeDatabase() {
    try {
        console.log('🔄 [INIT] تهيئة قاعدة البيانات...');
        dbManager = new DatabaseManager();
        
        const success = await dbManager.initialize();
        if (!success) {
            throw new Error('فشل في تهيئة قاعدة البيانات');
        }

        console.log('✅ [INIT] تم تهيئة قاعدة البيانات بنجاح');
        return true;
    } catch (error) {
        console.error('❌ [INIT] خطأ في تهيئة قاعدة البيانات:', error);
        return false;
    }
}

// Secure IPC communication handlers
ipcMain.handle('db-query', async (event, { sql, params = [] }) => {
    try {
        if (!dbManager?.db) throw new Error('Database not initialized');
        
        // Validate SQL query (basic sanitization)
        if (!sql.trim() || typeof sql !== 'string') {
            throw new Error('Invalid SQL query');
        }
        
        // Execute query with parameters
        return await dbManager.query(sql, params);
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
});

// App lifecycle management
app.whenReady().then(async () => {
    // Register secure custom protocol
    protocol.registerFileProtocol('app', (request, callback) => {
        const url = request.url.substr(6);
        callback(decodeURI(path.normalize(`${__dirname}/${url}`)));
    });

    // Initialize database
    const dbInitialized = await initializeDatabase();
    if (!dbInitialized) {
        console.error('Failed to initialize database, exiting...');
        app.quit();
        return;
    }

    // Initialize services
    try {
        pdfGenerator = new PDFGenerator(dbManager);
        printManager = new PrintManager();
        await printManager.initialize();
        
        createWindow();
    } catch (error) {
        console.error('Failed to initialize services:', error);
        app.quit();
    }
});

// Clean up resources on quit
app.on('window-all-closed', async () => {
    try {
        if (dbManager) {
            await dbManager.close();
            dbManager = null;
        }
        if (pdfGenerator) {
            pdfGenerator.close();
            pdfGenerator = null;
        }
        if (printManager) {
            printManager = null;
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Export cleanup function for graceful shutdown
exports.cleanup = async () => {
    try {
        if (dbManager) {
            await dbManager.close();
        }
        if (pdfGenerator) {
            pdfGenerator.close();
        }
        app.quit();
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
};

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    exports.cleanup().catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});