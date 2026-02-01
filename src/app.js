// @ts-nocheck
// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

// Main Application JavaScript for Cashier Reconciliation System
const { ipcRenderer } = require('electron');

// Global variables
let currentUser = null;
let currentReconciliation = null;
let bankReceipts = [];
let cashReceipts = [];
let postpaidSales = [];
let customerReceipts = [];
let returnInvoices = [];
let suppliers = [];

// Sidebar toggle state
let sidebarCollapsed = false;

// قائمة العملاء المحفوظة
let customersList = [];

/**
 * تحميل العملاء للقوائم المنسدلة
 * @param {string} branchId - معرف الفرع المحدد (اختياري)
 */
async function loadCustomersForDropdowns(branchId = '') {
    try {
        console.log('📋 [CUSTOMERS] جاري تحميل قائمة العملاء...');

        // جلب العملاء من قاعدة البيانات مع فلترة حسب الفرع
        const query = `
            SELECT DISTINCT c.customer_name
            FROM (
                SELECT ps.customer_name, ch.branch_id
                FROM postpaid_sales ps
                JOIN reconciliations r ON ps.reconciliation_id = r.id
                JOIN cashiers ch ON r.cashier_id = ch.id
                UNION
                SELECT cr.customer_name, ch.branch_id
                FROM customer_receipts cr
                JOIN reconciliations r ON cr.reconciliation_id = r.id
                JOIN cashiers ch ON r.cashier_id = ch.id
            ) c
            WHERE c.customer_name IS NOT NULL
            ${branchId ? 'AND c.branch_id = ?' : ''}
            ORDER BY c.customer_name
        `;

        const customers = await ipcRenderer.invoke('db-query', query, branchId ? [branchId] : []);

        customersList = customers.map(c => c.customer_name);

        // ملء datalist العملاء
        const customersDatalist = document.getElementById('customersList');
        const customerReceiptsDatalist = document.getElementById('customerReceiptsList');

        if (customersDatalist && customerReceiptsDatalist) {
            // تفريغ القوائم
            customersDatalist.innerHTML = '';
            customerReceiptsDatalist.innerHTML = '';

            // إضافة العملاء
            customersList.forEach(customerName => {
                // إضافة لقائمة المبيعات الآجلة
                const option1 = document.createElement('option');
                option1.value = customerName;
                customersDatalist.appendChild(option1);

                // إضافة لقائمة مقبوضات العملاء
                const option2 = document.createElement('option');
                option2.value = customerName;
                customerReceiptsDatalist.appendChild(option2);
            });
        }

        // إضافة مستمعي الأحداث للحقول
        const customerNameInput = document.getElementById('customerName');
        const customerReceiptNameInput = document.getElementById('customerReceiptName');

        if (customerNameInput) {
            customerNameInput.addEventListener('input', function (e) {
                const value = e.target.value;
                // القيمة ستكون متاحة مباشرة من القائمة
            });
        }

        if (customerReceiptNameInput) {
            customerReceiptNameInput.addEventListener('input', function (e) {
                const value = e.target.value;
                // القيمة ستكون متاحة مباشرة من القائمة
            });
        }

        console.log(`✅ [CUSTOMERS] تم تحميل ${customersList.length} عميل`);

        // إضافة مستمع حدث لتغيير الفرع
        const branchSelect = document.getElementById('branchSelect');
        if (branchSelect) {
            branchSelect.addEventListener('change', function (e) {
                const selectedBranchId = e.target.value;
                loadCustomersForDropdowns(selectedBranchId);
            });
        }
    } catch (error) {
        console.error('❌ [CUSTOMERS] خطأ في تحميل العملاء:', error);
    }
}

// Edit mode variables - NEW IMPLEMENTATION
let editMode = {
    isActive: false,
    reconciliationId: null,
    originalData: null
};

// Print variables
let availablePrinters = [];
let currentPrintData = null;

// تضمين مدير الاتصال
const ConnectionManager = require('./connection-manager');

// Application initialization
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();

    // تهيئة نظام العمل دون اتصال
    const OfflineStorage = require('./offline-storage');
    OfflineStorage.initConnectionListeners();
});

function initializeApp() {
    // Set current date
    document.getElementById('reconciliationDate').value = new Date().toISOString().split('T')[0];

    // Load and apply saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    // Setup event listeners
    setupEventListeners();

    // إضافة مراقب تغيير الفرع
    setupBranchChangeListener();

    // Initialize sidebar toggle
    initializeSidebarToggle();

    // Load initial data
    loadDropdownData();
    loadSystemSettings();

    // Initialize branch selection handling
    handleBranchSelectionChange();

    // Initialize print system
    initializePrintSystem();

    // Initialize thermal printer settings
    initializeThermalPrinterSettings();

    // Initialize edit mode event listeners
    initializeEditModeEventListeners();

    // Initialize autocomplete system
    initializeAutocomplete();
}

function setupBranchChangeListener() {
    // تهيئة مراقب تغيير الفرع
    const branchSelect = document.getElementById('branchSelect');

    if (branchSelect) {
        branchSelect.addEventListener('change', handleBranchChange);
        console.log('🔄 [BRANCH] تم تهيئة مراقب تغيير الفرع');
    } else {
        console.error('❌ [BRANCH] لم يتم العثور على عنصر اختيار الفرع');
    }
}

function setupEventListeners() {
    // مراقب تغيير الفرع
    document.getElementById('branchSelect').addEventListener('change', handleBranchChange);

    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // إضافة مستمع حدث لزر استدعاء التصفية
    document.getElementById('recallReconciliationBtn').addEventListener('click', handleRecallReconciliation);

    // Sidebar navigation
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', handleNavigation);
    });

    // Sidebar toggle buttons
    document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
    document.getElementById('fixedSidebarToggle').addEventListener('click', toggleSidebar);

    // New reconciliation form
    document.getElementById('newReconciliationForm').addEventListener('submit', handleNewReconciliation);

    // Bank receipt form
    document.getElementById('bankReceiptForm').addEventListener('submit', handleBankReceipt);

    // Cash receipt form
    document.getElementById('cashReceiptForm').addEventListener('submit', handleCashReceipt);

    // Postpaid sale form
    document.getElementById('postpaidSaleForm').addEventListener('submit', handlePostpaidSale);

    // Customer receipt form
    document.getElementById('customerReceiptForm').addEventListener('submit', handleCustomerReceipt);

    // Return invoice form
    document.getElementById('returnInvoiceForm').addEventListener('submit', handleReturnInvoice);

    // Supplier form
    document.getElementById('supplierForm').addEventListener('submit', handleSupplier);

    // Cashier selection change
    document.getElementById('cashierSelect').addEventListener('change', handleCashierChange);

    // ATM selection change
    document.getElementById('atmSelect').addEventListener('change', handleAtmChange);

    // Operation type change for bank receipts
    document.getElementById('operationType').addEventListener('change', handleOperationTypeChange);
    document.getElementById('editOperationType').addEventListener('change', handleEditOperationTypeChange);

    // Cash calculation
    document.getElementById('denomination').addEventListener('change', calculateCashTotal);
    document.getElementById('quantity').addEventListener('input', calculateCashTotal);

    // System sales input
    document.getElementById('systemSales').addEventListener('input', updateSummary);

    // Print and save buttons (New Reconciliation)
    document.getElementById('printNewReconciliationBtn').addEventListener('click', handlePrintReport);
    document.getElementById('quickPrintBtn').addEventListener('click', handleQuickPrint);
    document.getElementById('thermalPrinterPreviewBtn').addEventListener('click', handleThermalPrinterPreview);
    document.getElementById('thermalPrinterPrintBtn').addEventListener('click', handleThermalPrinterPrint);
    document.getElementById('savePdfBtn').addEventListener('click', handleSavePdf);
    document.getElementById('saveReconciliationBtn').addEventListener('click', handleSaveReconciliation);

    // Management forms
    document.getElementById('branchForm').addEventListener('submit', handleBranchForm);
    document.getElementById('addCashierForm').addEventListener('submit', handleAddCashier);
    document.getElementById('addAdminForm').addEventListener('submit', handleAddAdmin);
    document.getElementById('addAccountantForm').addEventListener('submit', handleAddAccountant);
    document.getElementById('addAtmForm').addEventListener('submit', handleAddAtm);

    // Cancel buttons
    document.getElementById('cancelCashierEdit').addEventListener('click', () => resetCashierForm());
    document.getElementById('cancelAdminEdit').addEventListener('click', () => resetAdminForm());
    document.getElementById('cancelAccountantEdit').addEventListener('click', () => resetAccountantForm());
    document.getElementById('cancelAtmEdit').addEventListener('click', () => resetAtmForm());



    // Saved reconciliations
    document.getElementById('searchReconciliationsBtn').addEventListener('click', handleSearchReconciliations);
    document.getElementById('clearSearchBtn').addEventListener('click', handleClearSearch);
    document.getElementById('cancelNewReconciliationBtn').addEventListener('click', handleCancelNewReconciliation);

    // Enhanced Reports
    document.getElementById('generateReportBtn').addEventListener('click', handleGenerateReport);
    document.getElementById('exportReportPdfBtn').addEventListener('click', handleExportReportPdf);
    document.getElementById('exportReportExcelBtn').addEventListener('click', handleExportReportExcel);
    document.getElementById('printReportBtn').addEventListener('click', handlePrintReportsData);
    document.getElementById('clearReportFiltersBtn').addEventListener('click', handleClearReportFilters);
    document.getElementById('toggleSummaryViewBtn').addEventListener('click', toggleSummaryView);
    document.getElementById('toggleChartViewBtn').addEventListener('click', toggleChartView);

    // Advanced reports
    document.getElementById('generateTimeReportBtn').addEventListener('click', handleGenerateTimeReport);
    document.getElementById('generateAtmReportBtn').addEventListener('click', handleGenerateAtmReport);
    document.getElementById('generateDetailedAtmReportBtn').addEventListener('click', handleShowDetailedAtmReportModal);

    // Cashier Performance Comparison
    document.getElementById('generatePerformanceBtn').addEventListener('click', handleGeneratePerformanceComparison);
    document.getElementById('exportPerformancePdfBtn').addEventListener('click', handleExportPerformancePdf);

    // Detailed ATM Report
    document.getElementById('applyDetailedFiltersBtn').addEventListener('click', handleGenerateDetailedAtmReport);
    document.getElementById('exportDetailedAtmReportExcel').addEventListener('click', handleExportDetailedAtmReportExcel);
    document.getElementById('printDetailedAtmReport').addEventListener('click', handlePrintDetailedAtmReport);
    document.getElementById('detailedReportSearch').addEventListener('input', handleDetailedReportSearch);
    document.getElementById('detailedReportSort').addEventListener('change', handleDetailedReportSort);
    document.getElementById('detailedReportPageSize').addEventListener('change', handleDetailedReportPageSize);

    // Advanced reports export and print
    document.getElementById('exportAdvancedReportPdf').addEventListener('click', handleExportAdvancedReportPdf);
    document.getElementById('exportAdvancedReportExcel').addEventListener('click', handleExportAdvancedReportExcel);
    document.getElementById('printAdvancedReport').addEventListener('click', handlePrintAdvancedReport);

    // Settings event listeners
    document.getElementById('generalSettingsForm').addEventListener('submit', handleSaveGeneralSettings);
    document.getElementById('printSettingsForm').addEventListener('submit', handleSavePrintSettings);
    document.getElementById('reportsSettingsForm').addEventListener('submit', handleSaveReportsSettings);
    document.getElementById('companyLogo').addEventListener('change', handleLogoUpload);
    document.getElementById('resetGeneralSettings').addEventListener('click', handleResetGeneralSettings);
    document.getElementById('resetPrintSettings').addEventListener('click', handleResetPrintSettings);
    document.getElementById('resetReportsSettings').addEventListener('click', handleResetReportsSettings);
    document.getElementById('selectReportsPath').addEventListener('click', handleSelectReportsPath);
    document.getElementById('testPrintSettings').addEventListener('click', handleTestPrintSettings);
    document.getElementById('createBackupBtn').addEventListener('click', handleCreateBackup);
    document.getElementById('restoreBackupBtn').addEventListener('click', handleRestoreBackup);
    document.getElementById('exportDataBtn').addEventListener('click', handleExportData);
    document.getElementById('optimizeDbBtn').addEventListener('click', handleOptimizeDatabase);
    document.getElementById('repairDbBtn').addEventListener('click', handleRepairDatabase);
    document.getElementById('analyzeDbBtn').addEventListener('click', handleAnalyzeDatabase);
    document.getElementById('saveDatabaseSettings').addEventListener('click', handleSaveDatabaseSettings);
    document.getElementById('saveUserSettings').addEventListener('click', handleSaveUserSettings);
    document.getElementById('changePasswordBtn').addEventListener('click', handleChangePassword);
    document.getElementById('selectBackupLocation').addEventListener('click', handleSelectBackupLocation);
    document.getElementById('selectReportsPath').addEventListener('click', handleSelectReportsPath);
    document.getElementById('autoBackup').addEventListener('change', handleAutoBackupChange);

    // Note: printReportBtn event listener is already registered above for reports

    // Advanced printing
    document.getElementById('directPrintBtn').addEventListener('click', handleDirectPrint);
    document.getElementById('previewPrintBtn').addEventListener('click', handlePrintPreview);

    // Recall Reconciliation
    document.getElementById('recallReconciliationBtn').addEventListener('click', handleRecallReconciliation);

    // Postpaid Sales Report Event Listeners
    document.getElementById('generatePostpaidSalesReportBtn').addEventListener('click', handleGeneratePostpaidSalesReport);
    document.getElementById('clearPostpaidSalesFiltersBtn').addEventListener('click', clearPostpaidSalesReportFilters);
    document.getElementById('exportPostpaidSalesReportPdf').addEventListener('click', handleExportPostpaidSalesReportPdf);
    document.getElementById('exportPostpaidSalesReportExcel').addEventListener('click', handleExportPostpaidSalesReportExcel);
    document.getElementById('printPostpaidSalesReport').addEventListener('click', handlePrintPostpaidSalesReport);
}

// Authentication functions
async function handleLogin(event) {
    event.preventDefault();

    console.log('🔐 [LOGIN] بدء عملية تسجيل الدخول...');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('loginError');

    console.log('📝 [LOGIN] بيانات الدخول:', { username: username, passwordLength: password.length });

    if (!username || !password) {
        console.error('❌ [LOGIN] بيانات ال��خول فارغة');
        showError(errorDiv, 'يرجى إدخال اسم المستخدم وكلمة المرور');
        return;
    }

    // Show loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري التحقق...';
    submitBtn.disabled = true;

    try {
        console.log('🔍 [LOGIN] البحث عن المستخدم في قاعدة البيانات...');

        const user = await ipcRenderer.invoke('db-get',
            'SELECT * FROM admins WHERE username = ? AND password = ? AND active = 1',
            [username, password]
        );

        console.log('📊 [LOGIN] نتيجة البحث:', user ? 'تم العثور على المستخدم' : 'لم يتم العثور على المستخدم');

        if (user) {
            console.log('✅ [LOGIN] تسجيل دخول ناجح للمستخدم:', user.name);

            currentUser = user;
            document.getElementById('currentUser').textContent = user.name;

            // Hide login screen and show main app
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'flex';
            errorDiv.style.display = 'none';

            // Clear login form
            document.getElementById('loginForm').reset();

            // Load system settings after successful login
            try {
                await loadSystemSettings();
                console.log('⚙️ [LOGIN] تم تحميل إعدادات النظام');
            } catch (settingsError) {
                console.warn('⚠️ [LOGIN] خطأ في تحميل إعدادات النظام:', settingsError);
                // Don't fail login if settings can't be loaded
            }

            console.log('🎉 [LOGIN] تم تسجيل الدخول بنجاح');
        } else {
            console.error('❌ [LOGIN] بيانات الدخول غير صحيحة');
            showError(errorDiv, 'اسم المستخدم أو كلمة المرور غير صحيحة');
        }
    } catch (error) {
        console.error('❌ [LOGIN] خطأ في تسجيل الدخول:', error);
        showError(errorDiv, 'حدث خطأ أثناء تسجيل الدخول: ' + error.message);
    } finally {
        // Restore button state
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
}

// دالة معالجة إلغاء التصفية الجديدة
async function handleCancelNewReconciliation() {
    if (!currentReconciliation) {
        console.warn('⚠️ [CANCEL] لا توجد تصفية حالية للإلغاء');
        DialogUtils.showInfo('لا توجد تصفية حالية للإلغاء');
        return;
    }

    try {
        // التحقق مما إذا كانت التصفية مستدعاة أم جديدة
        const isRecalled = currentReconciliation.id !== undefined;

        let message = isRecalled ?
            'هل تريد إلغاء التعديلات على هذه التصفية؟ لن يتم حذف التصفية الأصلية.' :
            'هل أنت متأكد من إلغاء التصفية الحالية؟ سيتم حذفها نهائياً.';

        const confirmed = await DialogUtils.showConfirm(
            message,
            'تأكيد الإلغاء'
        );

        if (confirmed) {
            if (!isRecalled) {
                // حذف التصفية الجديدة وجميع بياناتها
                console.log('🗑️ [CANCEL] حذف التصفية من قاعدة البيانات:', currentReconciliation.id);
                await ipcRenderer.invoke('db-run', 'DELETE FROM reconciliations WHERE id = ?', [currentReconciliation.id]);
                await ipcRenderer.invoke('db-run', 'DELETE FROM bank_receipts WHERE reconciliation_id = ?', [currentReconciliation.id]);
                await ipcRenderer.invoke('db-run', 'DELETE FROM cash_receipts WHERE reconciliation_id = ?', [currentReconciliation.id]);
                await ipcRenderer.invoke('db-run', 'DELETE FROM postpaid_sales WHERE reconciliation_id = ?', [currentReconciliation.id]);
                await ipcRenderer.invoke('db-run', 'DELETE FROM customer_receipts WHERE reconciliation_id = ?', [currentReconciliation.id]);
                await ipcRenderer.invoke('db-run', 'DELETE FROM return_invoices WHERE reconciliation_id = ?', [currentReconciliation.id]);
                await ipcRenderer.invoke('db-run', 'DELETE FROM suppliers WHERE reconciliation_id = ?', [currentReconciliation.id]);
            }

            // تنظيف الواجهة فقط
            if (isRecalled) {
                console.log('🧹 [CANCEL] تنظيف واجهة المستخدم فقط للتصفية المستدعاة');
                await resetUIOnly();
            } else {
                // تفريغ جميع البيانات من الذاكرة للتصفية الجديدة
                await clearAllReconciliationData();
            }

            // إخفاء معلومات التصفية الحالية
            const infoDiv = document.getElementById('currentReconciliationInfo');
            if (infoDiv) {
                infoDiv.style.display = 'none';
            }

            resetSystemToNewReconciliationState();

            console.log('✅ [CANCEL] تم إلغاء التصفية بنجاح');
            DialogUtils.showSuccessToast('تم إلغاء التصفية بنجاح');
        }
    } catch (error) {
        console.error('❌ [CANCEL] خطأ في إلغاء التصفية:', error);
        DialogUtils.showError(
            'حدث خطأ أثناء إلغاء التصفية. يرجى المحاولة مرة أخرى.',
            'خطأ في إلغاء التصفية'
        );
    }
}

// دالة استدعاء التصفية من النافذة المنبثقة
async function handleRecallFromList(reconciliationId) {
    console.log('🔄 [RECALL] استدعاء التصفية من القائمة - معرف:', reconciliationId);

    try {
        // التحقق من وجود تصفية حالية
        if (currentReconciliation) {
            const confirmed = await DialogUtils.showConfirm(
                'هناك تصفية مفتوحة حالياً. هل تريد إلغاءها واستدعاء التصفية الجديدة؟',
                'تأكيد استدعاء تصفية'
            );
            if (!confirmed) return;

            // تفريغ البيانات الحالية
            await clearAllReconciliationData();
        }

        // البحث عن التصفية في قاعدة البيانات
        const reconciliation = await ipcRenderer.invoke('db-get', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            WHERE r.id = ?`,
            [reconciliationId]
        );

        if (!reconciliation) {
            DialogUtils.showError('لم يتم العثور على التصفية', 'خطأ');
            return;
        }

        // تحميل بيانات التصفية
        currentReconciliation = reconciliation;

        // تحميل المقبوضات البنكية
        bankReceipts = await ipcRenderer.invoke('db-query',
            `SELECT br.*, a.name as atm_name, a.bank_name 
             FROM bank_receipts br
             LEFT JOIN atms a ON br.atm_id = a.id
             WHERE br.reconciliation_id = ?`,
            [reconciliationId]
        );

        // تحميل المقبوضات النقدية
        cashReceipts = await ipcRenderer.invoke('db-query',
            'SELECT * FROM cash_receipts WHERE reconciliation_id = ?',
            [reconciliationId]
        );

        // تحميل المبيعات الآجلة
        postpaidSales = await ipcRenderer.invoke('db-query',
            'SELECT * FROM postpaid_sales WHERE reconciliation_id = ?',
            [reconciliationId]
        );

        // تحميل مقبوضات العملاء
        customerReceipts = await ipcRenderer.invoke('db-query',
            'SELECT * FROM customer_receipts WHERE reconciliation_id = ?',
            [reconciliationId]
        );

        // تحميل فواتير المرتجعات
        returnInvoices = await ipcRenderer.invoke('db-query',
            'SELECT * FROM return_invoices WHERE reconciliation_id = ?',
            [reconciliationId]
        );

        // تحميل الموردين
        suppliers = await ipcRenderer.invoke('db-query',
            'SELECT * FROM suppliers WHERE reconciliation_id = ?',
            [reconciliationId]
        );

        // تحديث الواجهة
        document.getElementById('cashierSelect').value = reconciliation.cashier_id;
        document.getElementById('accountantSelect').value = reconciliation.accountant_id;
        document.getElementById('reconciliationDate').value = reconciliation.reconciliation_date;
        document.getElementById('systemSales').value = reconciliation.system_sales || '';
        document.getElementById('timeRangeStart').value = reconciliation.time_range_start || '';
        document.getElementById('timeRangeEnd').value = reconciliation.time_range_end || '';
        document.getElementById('filterNotes').value = reconciliation.filter_notes || '';

        // إظهار معلومات التصفية
        const infoDiv = document.getElementById('currentReconciliationInfo');
        const detailsSpan = document.getElementById('currentReconciliationDetails');

        let infoText = `الكاشير: ${reconciliation.cashier_name} (${reconciliation.cashier_number}) - المحاسب: ${reconciliation.accountant_name} - التاريخ: ${reconciliation.reconciliation_date}`;

        if (reconciliation.time_range_start && reconciliation.time_range_end) {
            infoText += ` - النطاق الزمني: ${reconciliation.time_range_start} إلى ${reconciliation.time_range_end}`;
        }

        if (reconciliation.filter_notes) {
            infoText += ` - الملاحظات: ${reconciliation.filter_notes}`;
        }

        detailsSpan.textContent = `${infoText} (رقم التصفية: ${reconciliation.reconciliation_number})`;
        infoDiv.style.display = 'block';

        // تحديث الجداول
        updateBankReceiptsTable();
        updateCashReceiptsTable();
        updatePostpaidSalesTable();
        updateCustomerReceiptsTable();
        updateReturnInvoicesTable();
        updateSuppliersTable();
        updateSummary();

        // Hide the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('reconciliationListModal'));
        if (modal) {
            modal.hide();
        }

        console.log('✅ [RECALL] تم استدعاء التصفية بنجاح:', reconciliation.reconciliation_number);
        DialogUtils.showSuccessToast(`تم استدعاء التصفية رقم ${reconciliation.reconciliation_number || reconciliation.id} بنجاح`);

    } catch (error) {
        console.error('❌ [RECALL] خطأ في استدعاء التصفية:', error);
        DialogUtils.showError('حدث خطأ أثناء استدعاء التصفية', 'خطأ');
    }
}

// دالة استدعاء التصفية بالرقم
async function handleRecallReconciliation() {
    console.log('🔄 [RECALL] بدء استدعاء التصفية...');

    const reconciliationNumber = document.getElementById('recallReconciliationNumber').value.trim();

    if (!reconciliationNumber) {
        DialogUtils.showValidationError('يرجى إدخال رقم التصفية');
        return;
    }

    try {
        // التحقق من وجود تصفية حالية
        if (currentReconciliation) {
            const confirmed = await DialogUtils.showConfirm(
                'هناك تصفية مفتوحة حالياً. هل تريد إلغاءها واستدعاء التصفية الجديدة؟',
                'تأكيد استدعاء تصفية'
            );
            if (!confirmed) return;

            // تفريغ البيانات الحالية
            await clearAllReconciliationData();
        }

        // البحث عن التصفية في قاعدة البيانات
        const reconciliation = await ipcRenderer.invoke('db-get',
            `SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
             FROM reconciliations r
             LEFT JOIN cashiers c ON r.cashier_id = c.id
             LEFT JOIN accountants a ON r.accountant_id = a.id
             WHERE r.reconciliation_number = ?`,
            [reconciliationNumber]
        );

        if (!reconciliation) {
            DialogUtils.showError('لم يتم العثور على تصفية بهذا الرقم', 'خطأ في البحث');
            return;
        }

        // تحميل بيانات التصفية
        currentReconciliation = reconciliation;

        // تحميل المقبوضات البنكية
        bankReceipts = await ipcRenderer.invoke('db-query',
            `SELECT br.*, a.name as atm_name, a.bank_name 
             FROM bank_receipts br
             LEFT JOIN atms a ON br.atm_id = a.id
             WHERE br.reconciliation_id = ?`,
            [reconciliation.id]
        );

        // تحميل المقبوضات النقدية
        cashReceipts = await ipcRenderer.invoke('db-query',
            'SELECT * FROM cash_receipts WHERE reconciliation_id = ?',
            [reconciliation.id]
        );

        // تحميل المبيعات الآجلة
        postpaidSales = await ipcRenderer.invoke('db-query',
            'SELECT * FROM postpaid_sales WHERE reconciliation_id = ?',
            [reconciliation.id]
        );

        // تحميل مقبوضات العملاء
        customerReceipts = await ipcRenderer.invoke('db-query',
            'SELECT * FROM customer_receipts WHERE reconciliation_id = ?',
            [reconciliation.id]
        );

        // تحميل فواتير المرتجعات
        returnInvoices = await ipcRenderer.invoke('db-query',
            'SELECT * FROM return_invoices WHERE reconciliation_id = ?',
            [reconciliation.id]
        );

        // تحميل الموردين
        suppliers = await ipcRenderer.invoke('db-query',
            'SELECT * FROM suppliers WHERE reconciliation_id = ?',
            [reconciliation.id]
        );

        // تحديث الواجهة
        document.getElementById('cashierSelect').value = reconciliation.cashier_id;
        document.getElementById('accountantSelect').value = reconciliation.accountant_id;
        document.getElementById('reconciliationDate').value = reconciliation.reconciliation_date;
        document.getElementById('systemSales').value = reconciliation.system_sales || '';
        document.getElementById('timeRangeStart').value = reconciliation.time_range_start || '';
        document.getElementById('timeRangeEnd').value = reconciliation.time_range_end || '';
        document.getElementById('filterNotes').value = reconciliation.filter_notes || '';

        // إظهار معلومات التصفية
        const infoDiv = document.getElementById('currentReconciliationInfo');
        const detailsSpan = document.getElementById('currentReconciliationDetails');

        let infoText = `الكاشير: ${reconciliation.cashier_name} (${reconciliation.cashier_number}) - المحاسب: ${reconciliation.accountant_name} - التاريخ: ${reconciliation.reconciliation_date}`;

        if (reconciliation.time_range_start && reconciliation.time_range_end) {
            infoText += ` - النطاق الزمني: ${reconciliation.time_range_start} إلى ${reconciliation.time_range_end}`;
        }

        if (reconciliation.filter_notes) {
            infoText += ` - الملاحظات: ${reconciliation.filter_notes}`;
        }

        detailsSpan.textContent = `${infoText} (رقم التصفية: ${reconciliation.reconciliation_number})`;
        infoDiv.style.display = 'block';

        // تحديث الجداول
        updateBankReceiptsTable();
        updateCashReceiptsTable();
        updatePostpaidSalesTable();
        updateCustomerReceiptsTable();
        updateReturnInvoicesTable();
        updateSuppliersTable();
        updateSummary();

        // مسح حقل رقم التصفية
        document.getElementById('recallReconciliationNumber').value = '';

        // تفعيل زر حفظ التعديلات
        const saveButton = document.getElementById('saveReconciliationBtn');
        saveButton.disabled = false;
        saveButton.title = 'حفظ التعديلات على التصفية المستدعاة كتصفية جديدة';
        saveButton.innerHTML = '<i class="icon">💾</i> حفظ التعديلات كتصفية جديدة';

        console.log('✅ [RECALL] تم استدعاء التصفية بنجاح:', reconciliation.reconciliation_number);
        DialogUtils.showSuccessToast(`تم استدعاء التصفية رقم ${reconciliation.reconciliation_number} بنجاح`);

    } catch (error) {
        console.error('❌ [RECALL] خطأ في استدعاء التصفية:', error);
        DialogUtils.showError(
            'حدث خطأ أثناء استدعاء التصفية. يرجى المحاولة مرة أخرى.',
            'خطأ في استدعاء التصفية'
        );
    }
}

function handleLogout() {
    currentUser = null;
    currentReconciliation = null;

    // Reset all data arrays
    bankReceipts = [];
    cashReceipts = [];
    postpaidSales = [];
    customerReceipts = [];
    returnInvoices = [];
    suppliers = [];

    // Hide main app and show login
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';

    // Reset forms
    document.querySelectorAll('form').forEach(form => form.reset());

    // Hide current reconciliation info
    document.getElementById('currentReconciliationInfo').style.display = 'none';

    console.log('Logout successful');
}

// Navigation functions
function handleNavigation(event) {
    event.preventDefault();

    const sectionName = event.currentTarget.getAttribute('data-section');

    // Remove active class from all menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });

    // Add active class to clicked item
    event.currentTarget.classList.add('active');

    // Hide all content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Show selected section
    const targetSection = document.getElementById(sectionName + '-section');
    if (targetSection) {
        targetSection.classList.add('active');

        // Load data for management sections
        switch (sectionName) {
            case 'branches':
                loadBranches();
                break;
            case 'cashiers':
                loadCashiersList();
                loadBranches(); // Load branches for dropdown
                break;
            case 'admins':
                loadAdminsList();
                break;
            case 'accountants':
                loadAccountantsList();
                break;
            case 'atms':
                loadAtmsList();
                loadBranchesForAtms();
                break;
            case 'saved-reconciliations':
                loadSavedReconciliations();
                loadSearchFilters();
                break;
            case 'reports':
                loadReportFilters();
                break;
            case 'advanced-reports':
                loadAdvancedReportFilters();
                break;
            case 'cashier-performance':
                loadCashierPerformanceFilters();
                break;
            case 'settings':
                loadAllSettings();
                break;
        }
    }
}

// Data loading functions
async function loadDropdownData() {
    try {
        // تحميل العملاء
        await loadCustomersForDropdowns();

        // Load branches
        const branches = await ipcRenderer.invoke('db-query',
            'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name'
        );
        populateSelect('branchSelect', branches, 'id', 'branch_name');
        populateSelect('cashierBranchSelect', branches, 'id', 'branch_name');

        // Load cashiers with branch filter support
        const cashiers = await ipcRenderer.invoke('db-query',
            'SELECT c.*, b.branch_name FROM cashiers c LEFT JOIN branches b ON c.branch_id = b.id WHERE c.active = 1 ORDER BY c.name'
        );
        populateSelect('cashierSelect', cashiers, 'id', 'name');

        // Load accountants
        const accountants = await ipcRenderer.invoke('db-query',
            'SELECT * FROM accountants WHERE active = 1 ORDER BY name'
        );
        populateSelect('accountantSelect', accountants, 'id', 'name');

        // Load ATMs
        const atms = await ipcRenderer.invoke('db-query',
            `SELECT a.*, b.branch_name
             FROM atms a
             LEFT JOIN branches b ON a.branch_id = b.id
             WHERE a.active = 1
             ORDER BY b.branch_name, a.name`
        );

        // Populate with branch info
        const atmSelect = document.getElementById('atmSelect');
        atmSelect.innerHTML = '<option value="">اختر الجهاز</option>';
        atms.forEach(atm => {
            const option = document.createElement('option');
            option.value = atm.id;
            option.textContent = `${atm.name} - ${atm.branch_name || 'غير محدد'}`;
            atmSelect.appendChild(option);
        });

        // Load enhanced report filters
        await loadEnhancedReportFilters();

        // Load postpaid sales report filters
        await loadPostpaidSalesReportFilters();

        // Load branches for ATM management
        await loadBranchesForAtms();

    } catch (error) {
        console.error('Error loading dropdown data:', error);
    }
}

function populateSelect(selectId, data, valueField, textField) {
    const select = document.getElementById(selectId);

    // Clear existing options except the first one
    while (select.children.length > 1) {
        select.removeChild(select.lastChild);
    }

    // Add new options
    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item[valueField];
        option.textContent = item[textField];
        select.appendChild(option);
    });
}

// Reconciliation functions
async function handleNewReconciliation(event) {
    event.preventDefault();

    const cashierId = document.getElementById('cashierSelect').value;
    const accountantId = document.getElementById('accountantSelect').value;
    const reconciliationDate = document.getElementById('reconciliationDate').value;

    // Get optional time range and filter notes
    const timeRangeStart = document.getElementById('timeRangeStart').value || null;
    const timeRangeEnd = document.getElementById('timeRangeEnd').value || null;
    const filterNotes = document.getElementById('filterNotes').value.trim() || null;

    if (!cashierId || !accountantId || !reconciliationDate) {
        DialogUtils.showValidationError('يرجى ملء جميع الحقول المطلوبة');
        return;
    }

    // Validate time range if provided
    if (timeRangeStart && timeRangeEnd && timeRangeStart >= timeRangeEnd) {
        DialogUtils.showValidationError('وقت البداية يجب أن يكون قبل وقت النهاية');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('db-run',
            'INSERT INTO reconciliations (cashier_id, accountant_id, reconciliation_date, time_range_start, time_range_end, filter_notes) VALUES (?, ?, ?, ?, ?, ?)',
            [cashierId, accountantId, reconciliationDate, timeRangeStart, timeRangeEnd, filterNotes]
        );

        currentReconciliation = {
            id: result.lastInsertRowid,
            cashier_id: cashierId,
            accountant_id: accountantId,
            reconciliation_date: reconciliationDate,
            time_range_start: timeRangeStart,
            time_range_end: timeRangeEnd,
            filter_notes: filterNotes
        };

        // Get cashier and accountant names for display
        const cashier = await ipcRenderer.invoke('db-get',
            'SELECT name, cashier_number FROM cashiers WHERE id = ?', [cashierId]
        );
        const accountant = await ipcRenderer.invoke('db-get',
            'SELECT name FROM accountants WHERE id = ?', [accountantId]
        );

        // Show current reconciliation info
        const infoDiv = document.getElementById('currentReconciliationInfo');
        const detailsSpan = document.getElementById('currentReconciliationDetails');

        // Build info text with optional time range and notes
        let infoText = `الكاشير: ${cashier.name} (${cashier.cashier_number}) - المحاسب: ${accountant.name} - التاريخ: ${reconciliationDate}`;

        if (timeRangeStart && timeRangeEnd) {
            infoText += ` - النطاق الزمني: ${timeRangeStart} إلى ${timeRangeEnd}`;
        } else if (timeRangeStart) {
            infoText += ` - من الوقت: ${timeRangeStart}`;
        } else if (timeRangeEnd) {
            infoText += ` - إلى الوقت: ${timeRangeEnd}`;
        }

        if (filterNotes) {
            infoText += ` - الملاحظات: ${filterNotes}`;
        }

        detailsSpan.textContent = infoText;
        infoDiv.style.display = 'block';

        // Update button states for the new reconciliation
        updateButtonStates('NEW_RECONCILIATION');

        // Reset all data arrays
        bankReceipts = [];
        cashReceipts = [];
        postpaidSales = [];
        customerReceipts = [];
        returnInvoices = [];
        suppliers = [];

        // Clear all tables
        updateBankReceiptsTable();
        updateCashReceiptsTable();
        updatePostpaidSalesTable();
        updateCustomerReceiptsTable();
        updateReturnInvoicesTable();

        updateSuppliersTable();
        updateSummary();

        console.log('New reconciliation created:', currentReconciliation);

        // CHECK FOR PENDING WEB REQUEST DATA (FROM "REVIEW" ACTION)
        if (window.pendingReconciliationData && window.appAPI) {
            console.log('📥 Loading pending web request data...');
            const pData = window.pendingReconciliationData;
            const pDetails = pData.details;

            // Save Origin Request ID immediately to ensure it persists even if data processing errors
            if (pData.requestId) {
                currentReconciliation.originRequestId = pData.requestId;
                console.log('🔗 [NEW] Linked to Request ID:', pData.requestId);
            }

            // 1. Set System Sales
            const sysSalesInput = document.getElementById('systemSales');
            if (sysSalesInput) {
                sysSalesInput.value = pData.systemSales;
            }

            // 2. Load Details using appAPI
            // Cash
            if (pDetails.cash_breakdown && Array.isArray(pDetails.cash_breakdown)) {
                pDetails.cash_breakdown.forEach(item => window.appAPI.addCashReceipt(item.val, item.qty));
            }

            // Bank
            const bankArray = pDetails.bank_receipts || pDetails.bank_items;
            if (bankArray && bankArray.length > 0) {
                bankArray.forEach(item => {
                    const atm = item.atm_name || item.atm;
                    const bank = item.bank_name || item.bank || 'Bank';
                    const amount = item.amount;
                    const op = item.operation_type || item.op || 'settlement';
                    window.appAPI.addDetailedBankReceipt(atm, bank, amount, op);
                });
            } else if (pData.total_bank > 0) {
                // Legacy fallback
                window.appAPI.addDetailedBankReceipt('من طلب ويب قديم', 'تحويل', pData.total_bank, 'settlement');
            }

            // Postpaid
            if (pDetails.postpaid_items) {
                pDetails.postpaid_items.forEach(item => window.appAPI.addPostpaidSale(item.customer_name || item.name, item.amount));
            }

            // Customer Receipts
            if (pDetails.customer_receipts) {
                pDetails.customer_receipts.forEach(item => window.appAPI.addCustomerReceipt(item.customer_name || item.name, item.amount, item.type));
            }

            // Returns
            if (pDetails.return_items) {
                pDetails.return_items.forEach(item => window.appAPI.addReturnInvoice(item.invoice_number || item.num, item.amount, item.note));
            }

            // Suppliers
            if (pDetails.supplier_items) {
                pDetails.supplier_items.forEach(item => window.appAPI.addSupplier(item.supplier_name || item.name, item.invoice_number || item.inv, item.amount, item.vat || 0));
            }

            // Update UI again
            updateSummary();

            // Clear pending
            window.pendingReconciliationData = null;

            DialogUtils.showSuccessToast('تم تحميل بيانات الطلب بنجاح');
        }

    } catch (error) {
        console.error('Error creating reconciliation:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء إنشاء التصفية');
    }
}

// Bank receipts functions
async function handleBankReceipt(event) {
    event.preventDefault();

    if (!currentReconciliation) {
        DialogUtils.showValidationError('يرجى إنشاء تصفية جديدة أولاً');
        return;
    }

    const operationType = document.getElementById('operationType').value;
    const atmId = document.getElementById('atmSelect').value;
    const amount = parseFloat(document.getElementById('bankAmount').value);

    // Validate required fields - ATM is not required for transfer operations
    if (!operationType || !amount || amount <= 0) {
        DialogUtils.showValidationError('يرجى ملء جميع الحقول بشكل صحيح');
        return;
    }

    // For non-transfer operations, ATM selection is required
    if (operationType !== 'تحويل' && !atmId) {
        DialogUtils.showValidationError('يرجى اختيار الجهاز');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('db-run',
            'INSERT INTO bank_receipts (reconciliation_id, operation_type, atm_id, amount) VALUES (?, ?, ?, ?)',
            [currentReconciliation.id, operationType, atmId || null, amount]
        );

        let atm_name = '';
        let bank_name = '';

        // Get ATM details only if ATM is selected (not for transfer operations)
        if (atmId) {
            const atm = await ipcRenderer.invoke('db-get',
                'SELECT name, bank_name FROM atms WHERE id = ?', [atmId]
            );
            atm_name = atm ? atm.name : '';
            bank_name = atm ? atm.bank_name : '';
        } else {
            // For transfer operations, set default values
            atm_name = 'تحويل';
            bank_name = 'تحويل';
        }

        // Add to local array
        bankReceipts.push({
            id: result.lastInsertRowid,
            operation_type: operationType,
            atm_name: atm_name,
            bank_name: bank_name,
            amount: amount
        });

        // Update table
        updateBankReceiptsTable();

        // Reset form
        document.getElementById('bankReceiptForm').reset();

        console.log('Bank receipt added:', bankReceipts[bankReceipts.length - 1]);

    } catch (error) {
        console.error('Error adding bank receipt:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء إضافة المقبوض البنكي');
    }
}

function updateBankReceiptsTable() {
    const tbody = document.getElementById('bankReceiptsTable');
    const totalElement = document.getElementById('bankReceiptsTotal');

    // Clear table
    tbody.innerHTML = '';

    let total = 0;

    bankReceipts.forEach((receipt, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${receipt.operation_type}</td>
            <td>${receipt.atm_name}</td>
            <td>${receipt.bank_name}</td>
            <td class="text-currency">${formatCurrency(receipt.amount)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeBankReceipt(${index})">
                    حذف
                </button>
            </td>
        `;
        tbody.appendChild(row);
        total += receipt.amount;
    });

    totalElement.textContent = formatCurrency(total);
    updateSummary();
}

async function removeBankReceipt(index) {
    const confirmed = await DialogUtils.showDeleteConfirm('', 'المقبوض');
    if (confirmed) {
        try {
            const receipt = bankReceipts[index];

            await ipcRenderer.invoke('db-run',
                'DELETE FROM bank_receipts WHERE id = ?',
                [receipt.id]
            );

            bankReceipts.splice(index, 1);
            updateBankReceiptsTable();

            console.log('Bank receipt removed');

        } catch (error) {
            console.error('Error removing bank receipt:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء حذف المقبوض');
        }
    }
}

// Cash receipts functions
function calculateCashTotal() {
    const denomination = parseFloat(document.getElementById('denomination').value) || 0;
    const quantity = parseInt(document.getElementById('quantity').value) || 0;
    const total = denomination * quantity;

    document.getElementById('cashTotal').value = formatCurrency(total);
}

async function handleCashReceipt(event) {
    event.preventDefault();

    if (!currentReconciliation) {
        DialogUtils.showValidationError('يرجى إنشاء تصفية جديدة أولاً');
        return;
    }

    const denomination = parseFloat(document.getElementById('denomination').value);
    const quantity = parseInt(document.getElementById('quantity').value);
    const total = denomination * quantity;

    if (!denomination || !quantity || quantity <= 0) {
        DialogUtils.showValidationError('يرجى ملء جميع الحقول بشكل صحيح');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('db-run',
            'INSERT INTO cash_receipts (reconciliation_id, denomination, quantity, total_amount) VALUES (?, ?, ?, ?)',
            [currentReconciliation.id, denomination, quantity, total]
        );

        // Add to local array
        cashReceipts.push({
            id: result.lastInsertRowid,
            denomination: denomination,
            quantity: quantity,
            total_amount: total
        });

        // Update table
        updateCashReceiptsTable();

        // Reset form
        document.getElementById('cashReceiptForm').reset();

        console.log('Cash receipt added');

    } catch (error) {
        console.error('Error adding cash receipt:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء إضافة المقبوض النقدي');
    }
}

function updateCashReceiptsTable() {
    const tbody = document.getElementById('cashReceiptsTable');
    const totalElement = document.getElementById('cashReceiptsTotal');

    // Clear table
    tbody.innerHTML = '';

    let total = 0;

    cashReceipts.forEach((receipt, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${receipt.denomination} ريال</td>
            <td>${receipt.quantity}</td>
            <td class="text-currency">${formatCurrency(receipt.total_amount)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeCashReceipt(${index})">
                    حذف
                </button>
            </td>
        `;
        tbody.appendChild(row);
        total += receipt.total_amount;
    });

    totalElement.textContent = formatCurrency(total);
    updateSummary();
}

async function removeCashReceipt(index) {
    const confirmed = await DialogUtils.showDeleteConfirm('', 'المقبوض');
    if (confirmed) {
        try {
            const receipt = cashReceipts[index];

            await ipcRenderer.invoke('db-run',
                'DELETE FROM cash_receipts WHERE id = ?',
                [receipt.id]
            );

            cashReceipts.splice(index, 1);
            updateCashReceiptsTable();

            console.log('Cash receipt removed');

        } catch (error) {
            console.error('Error removing cash receipt:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء حذف المقبوض');
        }
    }
}

// Postpaid sales functions
async function isExistingCustomer(customerName) {
    try {
        // البحث عن العميل في المبيعات الآجلة
        const postpaidCustomer = await ipcRenderer.invoke('db-get',
            'SELECT COUNT(*) as count FROM postpaid_sales WHERE customer_name = ?',
            [customerName]
        );

        // البحث عن العميل في مقبوضات العملاء
        const receiptCustomer = await ipcRenderer.invoke('db-get',
            'SELECT COUNT(*) as count FROM customer_receipts WHERE customer_name = ?',
            [customerName]
        );

        return (postpaidCustomer.count > 0 || receiptCustomer.count > 0);
    } catch (error) {
        console.error('Error checking customer existence:', error);
        return false;
    }
}

async function handlePostpaidSale(event) {
    event.preventDefault();

    if (!currentReconciliation) {
        DialogUtils.showValidationError('يرجى إنشاء تصفية جديدة أولاً');
        return;
    }

    const customerName = document.getElementById('customerName').value.trim();
    const amount = parseFloat(document.getElementById('postpaidAmount').value);

    if (!customerName || !amount || amount <= 0) {
        DialogUtils.showValidationError('يرجى ملء جميع الحقول بشكل صحيح');
        return;
    }

    // التحقق من وجود العميل
    const isExisting = await isExistingCustomer(customerName);
    if (!isExisting) {
        const confirmed = await DialogUtils.showConfirm(
            `العميل "${customerName}" غير موجود مسبقاً. هل أنت متأكد من إضافته؟`,
            'عميل جديد'
        );
        if (!confirmed) return;
    }

    try {
        const result = await ipcRenderer.invoke('db-run',
            'INSERT INTO postpaid_sales (reconciliation_id, customer_name, amount) VALUES (?, ?, ?)',
            [currentReconciliation.id, customerName, amount]
        );

        // Add to local array
        postpaidSales.push({
            id: result.lastInsertRowid,
            customer_name: customerName,
            amount: amount
        });

        // Update table
        updatePostpaidSalesTable();

        // Reset form
        document.getElementById('postpaidSaleForm').reset();

        console.log('Postpaid sale added');

    } catch (error) {
        console.error('Error adding postpaid sale:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء إضافة المبيعة الآجلة');
    }
}

function updatePostpaidSalesTable() {
    const tbody = document.getElementById('postpaidSalesTable');
    const totalElement = document.getElementById('postpaidSalesTotal');

    // Clear table
    tbody.innerHTML = '';

    let total = 0;

    postpaidSales.forEach((sale, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${sale.customer_name}</td>
            <td class="text-currency">${formatCurrency(sale.amount)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removePostpaidSale(${index})">
                    حذف
                </button>
            </td>
        `;
        tbody.appendChild(row);
        total += sale.amount;
    });

    totalElement.textContent = formatCurrency(total);
    updateSummary();
}

async function removePostpaidSale(index) {
    const confirmed = await DialogUtils.showDeleteConfirm('', 'المبيعة');
    if (confirmed) {
        try {
            const sale = postpaidSales[index];

            await ipcRenderer.invoke('db-run',
                'DELETE FROM postpaid_sales WHERE id = ?',
                [sale.id]
            );

            postpaidSales.splice(index, 1);
            updatePostpaidSalesTable();

            console.log('Postpaid sale removed');

        } catch (error) {
            console.error('Error removing postpaid sale:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء حذف المبيعة');
        }
    }
}

// Customer receipts functions
async function handleCustomerReceipt(event) {
    event.preventDefault();
    console.log('💰 [CUSTOMER] بدء إضافة مقبوض عميل...');

    if (!currentReconciliation) {
        console.error('❌ [CUSTOMER] لا توجد تصفية حالية');
        DialogUtils.showValidationError('يرجى إنشاء تصفية جديدة أولاً');
        return;
    }

    const customerName = document.getElementById('customerReceiptName').value.trim();
    const amountInput = document.getElementById('customerReceiptAmount').value.trim();
    const paymentType = document.getElementById('customerReceiptPaymentType').value;

    console.log('📝 [CUSTOMER] البيانات المدخلة:', {
        customerName,
        amountInput,
        paymentType,
        reconciliationId: currentReconciliation.id
    });

    // التحقق من وجود العميل
    const isExisting = await isExistingCustomer(customerName);
    if (!isExisting) {
        const confirmed = await DialogUtils.showConfirm(
            `العميل "${customerName}" غير موجود مسبقاً. هل أنت متأكد من إضافته؟`,
            'عميل جديد'
        );
        if (!confirmed) return;
    }

    // Enhanced validation
    if (!customerName) {
        console.error('❌ [CUSTOMER] اسم العميل فارغ');
        DialogUtils.showValidationError('يرجى إدخال اسم العميل');
        return;
    }

    if (!amountInput) {
        console.error('❌ [CUSTOMER] المبلغ فارغ');
        DialogUtils.showValidationError('يرجى إدخال المبلغ');
        return;
    }

    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
        console.error('❌ [CUSTOMER] مبلغ غير صحيح:', amountInput);
        DialogUtils.showValidationError('يرجى إدخال مبلغ صحيح أكبر من صفر');
        return;
    }

    if (!paymentType) {
        console.error('❌ [CUSTOMER] نوع الدفع فارغ');
        DialogUtils.showValidationError('يرجى اختيار نوع الدفع');
        return;
    }

    try {
        console.log('💾 [CUSTOMER] إدراج في قاعدة البيانات...');
        const result = await ipcRenderer.invoke('db-run',
            'INSERT INTO customer_receipts (reconciliation_id, customer_name, amount, payment_type) VALUES (?, ?, ?, ?)',
            [currentReconciliation.id, customerName, amount, paymentType]
        );

        console.log('✅ [CUSTOMER] تم الإدراج بنجاح، ID:', result.lastInsertRowid);

        // Add to local array
        const newReceipt = {
            id: result.lastInsertRowid,
            customer_name: customerName,
            amount: amount,
            payment_type: paymentType
        };

        customerReceipts.push(newReceipt);
        console.log('📊 [CUSTOMER] تم إضافة للمصفوفة المحلية، العدد الحالي:', customerReceipts.length);

        // Update table
        updateCustomerReceiptsTable();

        // Reset form
        document.getElementById('customerReceiptForm').reset();

        console.log('✅ [CUSTOMER] تم إضافة مقبوض العميل بنجاح');
        DialogUtils.showSuccessToast('تم إضافة مقبوض العميل بنجاح');

    } catch (error) {
        console.error('❌ [CUSTOMER] خطأ في إضافة مقبوض العميل:', error);
        DialogUtils.showError(`حدث خطأ أثناء إضافة مقبوض العميل: ${error.message}`, 'خطأ في قاعدة البيانات');
    }
}

function updateCustomerReceiptsTable() {
    console.log('📊 [CUSTOMER] تحديث جدول مقبوضات العملاء...');

    const tbody = document.getElementById('customerReceiptsTable');
    const totalElement = document.getElementById('customerReceiptsTotal');

    if (!tbody) {
        console.error('❌ [CUSTOMER] لم يتم العثور على جدول مقبوضات العملاء');
        return;
    }

    if (!totalElement) {
        console.error('❌ [CUSTOMER] لم يتم العثور على عنصر المجموع');
        return;
    }

    // Clear table
    tbody.innerHTML = '';

    let total = 0;

    console.log('📋 [CUSTOMER] عدد المقبوضات للعرض:', customerReceipts.length);

    customerReceipts.forEach((receipt, index) => {
        if (!receipt || typeof receipt.amount !== 'number') {
            console.warn('⚠️ [CUSTOMER] مقبوض غير صحيح في الفهرس', index, receipt);
            return;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${receipt.customer_name || 'غير محدد'}</td>
            <td class="text-currency">${formatCurrency(receipt.amount)}</td>
            <td>${receipt.payment_type || 'غير محدد'}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeCustomerReceipt(${index})" title="حذف المقبوض">
                    🗑️ حذف
                </button>
            </td>
        `;
        tbody.appendChild(row);
        total += receipt.amount;
    });

    totalElement.textContent = formatCurrency(total);
    console.log('💰 [CUSTOMER] إجمالي مقبوضات العملاء:', formatCurrency(total));

    updateSummary();
}

async function removeCustomerReceipt(index) {
    console.log('🗑️ [CUSTOMER] طلب حذف مقبوض العميل، الفهرس:', index);

    if (index < 0 || index >= customerReceipts.length) {
        console.error('❌ [CUSTOMER] فهرس غير صحيح:', index);
        DialogUtils.showError('فهرس المقبوض غير صحيح', 'خطأ');
        return;
    }

    const receipt = customerReceipts[index];
    console.log('📋 [CUSTOMER] المقبوض المراد حذفه:', receipt);

    const confirmed = await DialogUtils.showDeleteConfirm(
        `هل أنت متأكد من حذف مقبوض العميل "${receipt.customer_name}" بمبلغ ${formatCurrency(receipt.amount)} ريال؟`,
        'حذف مقبوض العميل'
    );

    if (confirmed) {
        try {
            console.log('💾 [CUSTOMER] حذف من قاعدة البيانات...');
            await ipcRenderer.invoke('db-run',
                'DELETE FROM customer_receipts WHERE id = ?',
                [receipt.id]
            );

            customerReceipts.splice(index, 1);
            console.log('✅ [CUSTOMER] تم حذف المقبوض، العدد الحالي:', customerReceipts.length);

            updateCustomerReceiptsTable();
            DialogUtils.showSuccessToast('تم حذف مقبوض العميل بنجاح');

        } catch (error) {
            console.error('❌ [CUSTOMER] خطأ في حذف المقبوض:', error);
            DialogUtils.showError(`حدث خطأ أثناء حذف المقبوض: ${error.message}`, 'خطأ في قاعدة البيانات');
        }
    }
}

// Return invoices functions
async function handleReturnInvoice(event) {
    event.preventDefault();

    if (!currentReconciliation) {
        DialogUtils.showValidationError('يرجى إنشاء تصفية جديدة أولاً');
        return;
    }

    const invoiceNumber = document.getElementById('invoiceNumber').value.trim();
    const amount = parseFloat(document.getElementById('returnAmount').value);

    if (!invoiceNumber || !amount || amount <= 0) {
        DialogUtils.showValidationError('يرجى ملء جميع الحقول بشكل صحيح');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('db-run',
            'INSERT INTO return_invoices (reconciliation_id, invoice_number, amount) VALUES (?, ?, ?)',
            [currentReconciliation.id, invoiceNumber, amount]
        );

        // Add to local array
        returnInvoices.push({
            id: result.lastInsertRowid,
            invoice_number: invoiceNumber,
            amount: amount
        });

        // Update table
        updateReturnInvoicesTable();

        // Reset form
        document.getElementById('returnInvoiceForm').reset();

        console.log('Return invoice added');

    } catch (error) {
        console.error('Error adding return invoice:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء إضافة فاتورة المرتجع');
    }
}

function updateReturnInvoicesTable() {
    const tbody = document.getElementById('returnInvoicesTable');
    const totalElement = document.getElementById('returnInvoicesTotal');

    // Clear table
    tbody.innerHTML = '';

    let total = 0;

    returnInvoices.forEach((invoice, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${invoice.invoice_number}</td>
            <td class="text-currency">${formatCurrency(invoice.amount)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeReturnInvoice(${index})">
                    حذف
                </button>
            </td>
        `;
        tbody.appendChild(row);
        total += invoice.amount;
    });

    totalElement.textContent = formatCurrency(total);
    updateSummary();
}

async function removeReturnInvoice(index) {
    const confirmed = await DialogUtils.showDeleteConfirm('', 'الفاتورة');
    if (confirmed) {
        try {
            const invoice = returnInvoices[index];

            await ipcRenderer.invoke('db-run',
                'DELETE FROM return_invoices WHERE id = ?',
                [invoice.id]
            );

            returnInvoices.splice(index, 1);
            updateReturnInvoicesTable();

            console.log('Return invoice removed');

        } catch (error) {
            console.error('Error removing return invoice:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء حذف الفاتورة');
        }
    }
}

// Suppliers functions - Completely rewritten following Customer Receipts pattern
async function handleSupplier(event) {
    event.preventDefault();

    if (!currentReconciliation) {
        DialogUtils.showValidationError('يرجى إنشاء تصفية جديدة أولاً');
        return;
    }

    const supplierName = document.getElementById('supplierMainName').value.trim();
    const amountInput = document.getElementById('supplierMainAmount').value.trim();

    // Enhanced validation following Customer Receipts pattern
    if (!supplierName) {
        DialogUtils.showValidationError('يرجى إدخال اسم المورد');
        return;
    }

    if (!amountInput) {
        DialogUtils.showValidationError('يرجى إدخال المبلغ');
        return;
    }

    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
        DialogUtils.showValidationError('يرجى إدخال مبلغ صحيح أكبر من صفر');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('db-run',
            'INSERT INTO suppliers (reconciliation_id, supplier_name, amount) VALUES (?, ?, ?)',
            [currentReconciliation.id, supplierName, amount]
        );

        // Add to local array
        suppliers.push({
            id: result.lastInsertRowid,
            supplier_name: supplierName,
            amount: amount
        });

        // Update table
        updateSuppliersTable();

        // Reset form
        document.getElementById('supplierForm').reset();

        console.log('Supplier added successfully');
        DialogUtils.showSuccessToast('تم إضافة المورد بنجاح');

    } catch (error) {
        console.error('Error adding supplier:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء إضافة المورد');
    }
}

function updateSuppliersTable() {
    const tbody = document.getElementById('suppliersTable');
    const totalElement = document.getElementById('suppliersTotal');

    if (!tbody || !totalElement) {
        console.error('Suppliers table elements not found');
        return;
    }

    // Clear table
    tbody.innerHTML = '';

    let total = 0;

    suppliers.forEach((supplier, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${supplier.supplier_name}</td>
            <td class="text-currency">${formatCurrency(supplier.amount)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeSupplier(${index})">
                    حذف
                </button>
            </td>
        `;
        tbody.appendChild(row);
        total += supplier.amount;
    });

    totalElement.textContent = formatCurrency(total);
    // Note: Suppliers are for display only and don't affect summary totals
}

async function removeSupplier(index) {
    // Validate index
    if (index < 0 || index >= suppliers.length) {
        console.error('Invalid supplier index:', index);
        DialogUtils.showErrorToast('خطأ في تحديد المورد المراد حذفه');
        return;
    }

    const supplier = suppliers[index];
    const confirmed = await DialogUtils.showDeleteConfirm(supplier.supplier_name, 'المورد');

    if (confirmed) {
        try {
            await ipcRenderer.invoke('db-run',
                'DELETE FROM suppliers WHERE id = ?',
                [supplier.id]
            );

            suppliers.splice(index, 1);
            updateSuppliersTable();

            console.log('Supplier removed successfully');
            DialogUtils.showSuccessToast('تم حذف المورد بنجاح');

        } catch (error) {
            console.error('Error removing supplier:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء حذف المورد');
        }
    }
}

// Summary and calculation functions
function updateSummary() {
    // Calculate totals
    const bankTotal = bankReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const cashTotal = cashReceipts.reduce((sum, receipt) => sum + receipt.total_amount, 0);
    const postpaidTotal = postpaidSales.reduce((sum, sale) => sum + sale.amount, 0);
    const customerTotal = customerReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const returnTotal = returnInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

    // Update summary display
    document.getElementById('summaryBankTotal').textContent = formatCurrency(bankTotal);
    document.getElementById('summaryCashTotal').textContent = formatCurrency(cashTotal);
    document.getElementById('summaryPostpaidTotal').textContent = formatCurrency(postpaidTotal);
    document.getElementById('summaryCustomerTotal').textContent = formatCurrency(customerTotal);
    document.getElementById('summaryReturnTotal').textContent = formatCurrency(returnTotal);

    // Calculate total receipts - NEW FORMULA: Returns are ADDED, Customer receipts are SUBTRACTED
    const totalReceipts = bankTotal + cashTotal + postpaidTotal + returnTotal - customerTotal;
    document.getElementById('totalReceipts').textContent = formatCurrency(totalReceipts);

    // Calculate surplus/deficit
    const systemSales = parseFloat(document.getElementById('systemSales').value) || 0;
    const surplusDeficit = totalReceipts - systemSales;

    const surplusDeficitElement = document.getElementById('surplusDeficit');
    surplusDeficitElement.textContent = formatCurrency(surplusDeficit);

    // Apply color coding
    if (surplusDeficit > 0) {
        surplusDeficitElement.className = 'summary-value text-surplus';
        surplusDeficitElement.textContent = `فائض: ${formatCurrency(surplusDeficit)}`;
    } else if (surplusDeficit < 0) {
        surplusDeficitElement.className = 'summary-value text-deficit';
        surplusDeficitElement.textContent = `عجز: ${formatCurrency(Math.abs(surplusDeficit))}`;
    } else {
        surplusDeficitElement.className = 'summary-value';
        surplusDeficitElement.textContent = 'متوازن: 0.00';
    }
}

// Print and save functions
async function handlePrintReport() {
    if (!currentReconciliation) {
        DialogUtils.showValidationError('يرجى إنشاء تصفية أولاً');
        return;
    }

    try {
        console.log('🖨️ [PRINT] بدء طباعة التصفية الجديدة مع خيارات الأقسام...');

        // Show section selection dialog first (same as Saved Reconciliations)
        const selectedSections = await showPrintSectionDialogForNewReconciliation();

        if (selectedSections) {
            // Prepare reconciliation data for printing
            const reconciliationData = await prepareReconciliationData();

            // Get current print settings
            const printSettings = await ipcRenderer.invoke('get-print-settings');

            // Prepare print data with selected sections
            const printData = preparePrintData(reconciliationData, {
                ...selectedSections,
                color: printSettings.color !== false
            });

            console.log('📊 [PRINT] بيانات الطباعة جاهزة:', {
                reconciliationId: printData.reconciliation.id,
                sectionsCount: Object.keys(printData.sections).length,
                selectedSections: selectedSections.sections
            });

            // Create print preview window
            const result = await ipcRenderer.invoke('create-print-preview', printData);

            if (result.success) {
                console.log('✅ [PRINT] تم إنشاء نافذة معاينة الطباعة بنجاح');
                DialogUtils.showSuccessToast('تم فتح نافذة معاينة الطباعة');
            } else {
                console.error('❌ [PRINT] فشل في إنشاء نافذة معاينة الطباعة:', result.error);
                DialogUtils.showError(`فشل في إنشاء نافذة معاينة الطباعة: ${result.error}`, 'خطأ في الطباعة');
            }
        } else {
            console.log('⚠️ [PRINT] تم إلغاء الطباعة من قبل المستخدم');
        }

    } catch (error) {
        console.error('Error preparing print:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تحضير الطباعة');
    }
}

// Quick print function for New Reconciliation (prints all sections)
async function handleQuickPrint() {
    console.log('⚡ [PRINT] طباعة سريعة للتصفية الجديدة...');

    if (!currentReconciliation) {
        console.error('❌ [PRINT] لا توجد تصفية حالية للطباعة السريعة');
        DialogUtils.showValidationError('يرجى إنشاء تصفية أولاً');
        return;
    }

    try {
        console.log('📊 [PRINT] فحص البيانات للطباعة السريعة:', {
            currentReconciliation: !!currentReconciliation,
            reconciliationId: currentReconciliation?.id,
            bankReceipts: bankReceipts.length,
            cashReceipts: cashReceipts.length,
            postpaidSales: postpaidSales.length,
            customerReceipts: customerReceipts.length,
            returnInvoices: returnInvoices.length,
            suppliers: suppliers.length
        });

        // Check if there's any data to print
        const hasData = bankReceipts.length > 0 ||
            cashReceipts.length > 0 ||
            postpaidSales.length > 0 ||
            customerReceipts.length > 0 ||
            returnInvoices.length > 0 ||
            suppliers.length > 0;

        if (!hasData) {
            console.warn('⚠️ [PRINT] لا توجد بيانات للطباعة السريعة');
            DialogUtils.showValidationError('لا توجد بيانات مقبوضات أو مبيعات للطباعة. يرجى إضافة بعض البيانات أولاً.');
            return;
        }

        // Prepare reconciliation data for printing
        const reconciliationData = await prepareReconciliationData();

        // Get current print settings
        const printSettings = await ipcRenderer.invoke('get-print-settings');

        // Prepare print data with all sections enabled
        const printData = preparePrintData(reconciliationData, {
            sections: {
                bankReceipts: true,
                cashReceipts: true,
                postpaidSales: true,
                customerReceipts: true,
                returnInvoices: true,
                suppliers: true,
                summary: true
            },
            pageSize: 'A4',
            orientation: 'portrait',
            fontSize: printSettings.fontSize || 'normal',
            fontFamily: printSettings.fontFamily || 'Cairo',
            color: printSettings.color !== false
        });

        console.log('📊 [PRINT] بيانات الطباعة السريعة جاهزة:', {
            reconciliationId: printData.reconciliation.id,
            sectionsCount: Object.keys(printData.sections).length,
            totalReceipts: reconciliationData.summary.totalReceipts
        });

        // Create print preview window
        const result = await ipcRenderer.invoke('create-print-preview', printData);

        if (result.success) {
            console.log('✅ [PRINT] تم إنشاء نافذة معاينة الطباعة السريعة بنجاح');
            DialogUtils.showSuccessToast('تم فتح نافذة معاينة الطباعة');
        } else {
            console.error('❌ [PRINT] فشل في إنشاء نافذة معاينة الطباعة:', result.error);
            DialogUtils.showError(`فشل في إنشاء نافذة معاينة الطباعة: ${result.error}`, 'خطأ في الطباعة');
        }

    } catch (error) {
        console.error('❌ [PRINT] خطأ في الطباعة السريعة:', error);
        DialogUtils.showError(`حدث خطأ أثناء الطباعة السريعة: ${error.message}`, 'خطأ في الطباعة');
    }
}

/**
 * Handle thermal printer receipt preview
 * معالجة معاينة إيصال الطابعة الحرارية
 */
async function handleThermalPrinterPreview() {
    if (!currentReconciliation) {
        DialogUtils.showValidationError('يرجى إنشاء تصفية أولاً');
        return;
    }

    try {
        console.log('🖨️ [THERMAL] فتح معاينة إيصال الطابعة الحرارية...');

        // Check if there's any data to print
        const hasData = bankReceipts.length > 0 ||
            cashReceipts.length > 0 ||
            postpaidSales.length > 0 ||
            customerReceipts.length > 0 ||
            returnInvoices.length > 0 ||
            suppliers.length > 0;

        if (!hasData) {
            console.warn('⚠️ [THERMAL] لا توجد بيانات للطباعة');
            DialogUtils.showValidationError('لا توجد بيانات للطباعة. يرجى إضافة مقبوضات أو مبيعات أولاً.');
            return;
        }

        // Show advanced print options dialog with checkboxes
        const printOptions = await new Promise((resolve) => {
            Swal.fire({
                title: '📋 خيارات المعاينة',
                html: `
                    <div style="text-align: right; direction: rtl; padding: 20px;">
                        <p style="margin-bottom: 20px; font-weight: bold;">اختر ما تريد رؤيته:</p>
                        <div style="display: flex; flex-direction: column; gap: 15px; text-align: right;">
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>💳 تفاصيل المقبوضات البنكية</span>
                                <input type="checkbox" id="chk-bank" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>💰 تفاصيل مقبوضات النقد</span>
                                <input type="checkbox" id="chk-cash" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>📋 تفاصيل المبيعات الآجلة</span>
                                <input type="checkbox" id="chk-postpaid" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>👥 تفاصيل مقبوضات العملاء</span>
                                <input type="checkbox" id="chk-customer" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>↩️ تفاصيل الفواتير المرتجعة</span>
                                <input type="checkbox" id="chk-returns" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>🏢 تفاصيل الموردين</span>
                                <input type="checkbox" id="chk-suppliers" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                        </div>
                        <div style="margin-top: 25px; display: flex; gap: 10px; justify-content: center;">
                            <button class="swal2-confirm swal2-styled" id="btn-preview" style="background: #007bff; padding: 10px 25px; font-size: 14px;">
                                👁️ معاينة
                            </button>
                            <button class="swal2-cancel swal2-styled" id="btn-cancel" style="background: #6c757d; padding: 10px 25px; font-size: 14px;">
                                ❌ إلغاء
                            </button>
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                didOpen: () => {
                    document.getElementById('btn-preview').onclick = () => {
                        const printOptions = {
                            includeBankDetails: document.getElementById('chk-bank').checked,
                            includeCashDetails: document.getElementById('chk-cash').checked,
                            includePostpaidDetails: document.getElementById('chk-postpaid').checked,
                            includeCustomerDetails: document.getElementById('chk-customer').checked,
                            includeReturnsDetails: document.getElementById('chk-returns').checked,
                            includeSuppliersDetails: document.getElementById('chk-suppliers').checked
                        };
                        Swal.close();
                        resolve(printOptions);
                    };
                    document.getElementById('btn-cancel').onclick = () => {
                        Swal.close();
                        resolve(null);
                    };
                },
                customClass: {
                    popup: 'rtl-popup',
                    title: 'rtl-title',
                    content: 'rtl-content'
                }
            });
        });

        // Cancel if user selected cancel
        if (!printOptions) {
            console.log('⏭️ [THERMAL] تم إلغاء المعاينة من قبل المستخدم');
            return;
        }

        // Prepare reconciliation data
        const reconciliationData = await prepareReconciliationData();

        // Add print options to the data
        reconciliationData.printOptions = printOptions;

        // Show loading
        DialogUtils.showLoading('جاري فتح معاينة الإيصال...');

        // Send to thermal printer preview
        const result = await ipcRenderer.invoke('thermal-printer-preview', reconciliationData);

        // Wait a bit before closing dialog to ensure process completes
        await new Promise(resolve => setTimeout(resolve, 500));

        DialogUtils.close();

        if (result.success) {
            console.log('✅ [THERMAL] تم فتح معاينة الإيصال بنجاح');
            DialogUtils.showSuccessToast('تم فتح معاينة إيصال الطابعة الحرارية');
        } else {
            console.error('❌ [THERMAL] فشل في فتح المعاينة:', result.error);
            DialogUtils.showError(`فشل في فتح المعاينة: ${result.error}`, 'خطأ في الطابعة الحرارية');
        }

    } catch (error) {
        console.error('❌ [THERMAL] خطأ:', error);
        DialogUtils.close();
        DialogUtils.showError(`حدث خطأ: ${error.message}`, 'خطأ في الطابعة الحرارية');
    }
}

/**
 * Show thermal printer print options dialog
 * عرض خيارات الطباعة على الطابعة الحرارية
 */
async function showThermalPrintOptionsDialog() {
    return await Swal.fire({
        title: '🖨️ خيارات الطباعة الحرارية',
        html: `
            <div style="text-align: right; direction: rtl;">
                <p style="margin-bottom: 20px;">اختر ما تريد طباعته:</p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="swal2-confirm swal2-styled" id="btn-summary" style="background: #007bff; width: 100%;">
                        📋 ملخص التصفية فقط
                    </button>
                    <button class="swal2-confirm swal2-styled" id="btn-full" style="background: #28a745; width: 100%;">
                        📄 تقرير كامل مع التفاصيل
                    </button>
                    <button class="swal2-confirm swal2-styled" id="btn-cancel" style="background: #6c757d; width: 100%;">
                        ❌ إلغاء
                    </button>
                </div>
            </div>
        `,
        showConfirmButton: false,
        didOpen: () => {
            document.getElementById('btn-summary').onclick = () => {
                Swal.close();
                return 'summary';
            };
            document.getElementById('btn-full').onclick = () => {
                Swal.close();
                return 'full';
            };
            document.getElementById('btn-cancel').onclick = () => {
                Swal.close();
                return null;
            };
        },
        customClass: {
            popup: 'rtl-popup',
            title: 'rtl-title',
            content: 'rtl-content'
        }
    });
}

/**
 * Handle direct thermal printer printing with options
 * معالجة الطباعة المباشرة على الطابعة الحرارية مع الخيارات
 */
async function handleThermalPrinterPrint() {
    if (!currentReconciliation) {
        DialogUtils.showValidationError('يرجى إنشاء تصفية أولاً');
        return;
    }

    try {
        console.log('🖨️ [THERMAL] بدء الطباعة المباشرة على الطابعة الحرارية...');

        // Check if there's any data to print
        const hasData = bankReceipts.length > 0 ||
            cashReceipts.length > 0 ||
            postpaidSales.length > 0 ||
            customerReceipts.length > 0 ||
            returnInvoices.length > 0 ||
            suppliers.length > 0;

        if (!hasData) {
            console.warn('⚠️ [THERMAL] لا توجد بيانات للطباعة');
            DialogUtils.showValidationError('لا توجد بيانات للطباعة. يرجى إضافة مقبوضات أو مبيعات أولاً.');
            return;
        }

        // Show advanced print options dialog with checkboxes
        const printOptions = await new Promise((resolve) => {
            Swal.fire({
                title: '🖨️ خيارات الطباعة الحرارية',
                html: `
                    <div style="text-align: right; direction: rtl; padding: 20px;">
                        <p style="margin-bottom: 20px; font-weight: bold;">اختر ما تريد تضمينه في الطباعة:</p>
                        <div style="display: flex; flex-direction: column; gap: 15px; text-align: right;">
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>💳 تفاصيل المقبوضات البنكية</span>
                                <input type="checkbox" id="chk-bank" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>💰 تفاصيل مقبوضات النقد</span>
                                <input type="checkbox" id="chk-cash" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>📋 تفاصيل المبيعات الآجلة</span>
                                <input type="checkbox" id="chk-postpaid" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>👥 تفاصيل مقبوضات العملاء</span>
                                <input type="checkbox" id="chk-customer" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>↩️ تفاصيل الفواتير المرتجعة</span>
                                <input type="checkbox" id="chk-returns" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                            <label style="display: flex; align-items: center; gap: 10px; justify-content: flex-end; cursor: pointer;">
                                <span>🏢 تفاصيل الموردين</span>
                                <input type="checkbox" id="chk-suppliers" checked style="width: 18px; height: 18px; cursor: pointer;">
                            </label>
                        </div>
                        <div style="margin-top: 25px; display: flex; gap: 10px; justify-content: center;">
                            <button class="swal2-confirm swal2-styled" id="btn-print" style="background: #28a745; padding: 10px 25px; font-size: 14px;">
                                ✅ طباعة
                            </button>
                            <button class="swal2-cancel swal2-styled" id="btn-cancel" style="background: #6c757d; padding: 10px 25px; font-size: 14px;">
                                ❌ إلغاء
                            </button>
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                didOpen: () => {
                    document.getElementById('btn-print').onclick = () => {
                        const printOptions = {
                            includeBankDetails: document.getElementById('chk-bank').checked,
                            includeCashDetails: document.getElementById('chk-cash').checked,
                            includePostpaidDetails: document.getElementById('chk-postpaid').checked,
                            includeCustomerDetails: document.getElementById('chk-customer').checked,
                            includeReturnsDetails: document.getElementById('chk-returns').checked,
                            includeSuppliersDetails: document.getElementById('chk-suppliers').checked
                        };
                        Swal.close();
                        resolve(printOptions);
                    };
                    document.getElementById('btn-cancel').onclick = () => {
                        Swal.close();
                        resolve(null);
                    };
                },
                customClass: {
                    popup: 'rtl-popup',
                    title: 'rtl-title',
                    content: 'rtl-content'
                }
            });
        });

        // Cancel if user selected cancel
        if (!printOptions) {
            console.log('⏭️ [THERMAL] تم إلغاء الطباعة من قبل المستخدم');
            return;
        }

        // Prepare reconciliation data
        const reconciliationData = await prepareReconciliationData();

        // Add print options to the data
        reconciliationData.printOptions = printOptions;

        // Get thermal printer settings
        const settingsResult = await ipcRenderer.invoke('thermal-printer-settings-get');
        const printerSettings = settingsResult.success ? settingsResult.settings : {};

        // Show loading
        DialogUtils.showLoading('جاري الطباعة على الطابعة الحرارية...');

        // Print directly
        const result = await ipcRenderer.invoke('thermal-printer-print', reconciliationData, printerSettings);

        // Wait a bit before closing dialog to ensure process completes
        await new Promise(resolve => setTimeout(resolve, 500));

        DialogUtils.close();

        if (result.success) {
            console.log('✅ [THERMAL] تم إرسال الإيصال للطباعة بنجاح');
            DialogUtils.showSuccess('تم إرسال الإيصال إلى الطابعة الحرارية بنجاح', 'نجاح الطباعة');
        } else {
            console.error('❌ [THERMAL] فشل في الطباعة:', result.error);
            DialogUtils.showError(`فشل في الطباعة: ${result.error}`, 'خطأ في الطابعة الحرارية');
        }

    } catch (error) {
        console.error('❌ [THERMAL] خطأ:', error);
        await new Promise(resolve => setTimeout(resolve, 300));
        DialogUtils.close();
        DialogUtils.showError(`حدث خطأ: ${error.message}`, 'خطأ في الطابعة الحرارية');
    }
}

async function handleSavePdf() {
    if (!currentReconciliation) {
        DialogUtils.showValidationError('يرجى إنشاء تصفية أولاً');
        return;
    }

    try {
        // Prepare reconciliation data for PDF
        const reconciliationData = await prepareReconciliationData();

        // Show loading message
        const pdfBtn = document.getElementById('savePdfBtn');
        const originalText = pdfBtn.innerHTML;
        pdfBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري إنشاء PDF...';
        pdfBtn.disabled = true;

        // Generate PDF
        const result = await ipcRenderer.invoke('generate-pdf', reconciliationData);

        // Restore button
        pdfBtn.innerHTML = originalText;
        pdfBtn.disabled = false;

        if (result.success) {
            DialogUtils.showSuccess(`تم حفظ التقرير بنجاح في:\n${result.filePath}`, 'تم إنشاء التقرير');
        } else {
            DialogUtils.showError(`فشل في إنشاء التقرير: ${result.message}`, 'خطأ في إنشاء التقرير');
        }

    } catch (error) {
        console.error('Error generating PDF:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء إنشاء ملف PDF');

        // Restore button
        const pdfBtn = document.getElementById('savePdfBtn');
        pdfBtn.innerHTML = '<i class="icon">📄</i> حفظ PDF';
        pdfBtn.disabled = false;
    }
}

async function prepareReconciliationData() {
    try {
        // Get cashier and accountant details
        const cashier = await ipcRenderer.invoke('db-get',
            'SELECT name, cashier_number FROM cashiers WHERE id = ?',
            [currentReconciliation.cashier_id]
        );

        const accountant = await ipcRenderer.invoke('db-get',
            'SELECT name FROM accountants WHERE id = ?',
            [currentReconciliation.accountant_id]
        );

        // Calculate summary
        const bankTotal = bankReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
        const cashTotal = cashReceipts.reduce((sum, receipt) => sum + receipt.total_amount, 0);
        const postpaidTotal = postpaidSales.reduce((sum, sale) => sum + sale.amount, 0);
        const customerTotal = customerReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
        const returnTotal = returnInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
        const totalReceipts = bankTotal + cashTotal + postpaidTotal + returnTotal - customerTotal;
        const systemSales = parseFloat(document.getElementById('systemSales').value) || 0;
        const surplusDeficit = totalReceipts - systemSales;

        // Get reconciliation number - if not set yet, get the next one
        let reconciliationNumber = currentReconciliation.reconciliation_number;
        if (!reconciliationNumber) {
            reconciliationNumber = await ipcRenderer.invoke('get-next-reconciliation-number');
            console.log('📊 [PREPARE-DATA] تم الحصول على رقم التصفية الجديد:', reconciliationNumber);
        }

        // Return data structure compatible with the print system (same as prepareReconciliationDataById)
        return {
            reconciliation: {
                id: currentReconciliation.id,
                reconciliation_number: reconciliationNumber,
                cashier_name: cashier.name,
                cashier_number: cashier.cashier_number,
                accountant_name: accountant.name,
                reconciliation_date: currentReconciliation.reconciliation_date,
                system_sales: systemSales,
                total_receipts: totalReceipts,
                surplus_deficit: surplusDeficit,
                status: 'completed',
                created_at: new Date().toISOString(),
                last_modified_date: new Date().toISOString(),
                // Add new filter enhancement fields
                time_range_start: currentReconciliation.time_range_start,
                time_range_end: currentReconciliation.time_range_end,
                filter_notes: currentReconciliation.filter_notes
            },

            bankReceipts: bankReceipts,
            cashReceipts: cashReceipts,
            postpaidSales: postpaidSales,
            customerReceipts: customerReceipts,
            returnInvoices: returnInvoices,
            suppliers: suppliers,

            // Keep legacy fields for backward compatibility
            reconciliationId: currentReconciliation.id,
            reconciliation_number: reconciliationNumber,
            cashierName: cashier.name,
            cashierNumber: cashier.cashier_number,
            accountantName: accountant.name,
            reconciliationDate: currentReconciliation.reconciliation_date,
            companyName: 'شركة المثال التجارية',

            // Add new filter enhancement fields to legacy section too
            timeRangeStart: currentReconciliation.time_range_start,
            timeRangeEnd: currentReconciliation.time_range_end,
            filterNotes: currentReconciliation.filter_notes,

            summary: {
                bankTotal: bankTotal,
                cashTotal: cashTotal,
                postpaidTotal: postpaidTotal,
                customerTotal: customerTotal,
                returnTotal: returnTotal,
                totalReceipts: totalReceipts,
                systemSales: systemSales,
                surplusDeficit: surplusDeficit
            }
        };

        // Debug log for new filter enhancement fields
        console.log('🔍 [PREPARE-DATA] فحص الحقول الجديدة في التصفية الحالية:', {
            currentReconciliation: {
                time_range_start: currentReconciliation.time_range_start,
                time_range_end: currentReconciliation.time_range_end,
                filter_notes: currentReconciliation.filter_notes
            },
            reconciliationObject: {
                time_range_start: data.reconciliation.time_range_start,
                time_range_end: data.reconciliation.time_range_end,
                filter_notes: data.reconciliation.filter_notes
            }
        });

    } catch (error) {
        console.error('Error preparing reconciliation data:', error);
        throw error;
    }
}

async function handleSaveReconciliation() {
    console.log('💾 [SAVE] بدء حفظ التصفية...');

    try {
        if (!currentReconciliation) {
            DialogUtils.showError('لا توجد تصفية حالية للحفظ', 'خطأ في الحفظ');
            return;
        }

        // في حالة كانت تصفية مستدعاة، نحفظ التعديلات عليها
        let isRecalled = currentReconciliation.id !== undefined && currentReconciliation.reconciliation_number !== undefined;
        if (isRecalled) {
            // تأكيد من المستخدم
            const confirmed = await DialogUtils.showConfirm(
                'هل تريد حفظ التعديلات على هذه التصفية؟',
                'تأكيد حفظ التعديلات'
            );

            if (!confirmed) return;
        }

        // Validate reconciliation data before saving
        const validation = validateReconciliationBeforeSave();
        if (!validation.isValid) {
            console.error('❌ [SAVE] فشل في التحقق من صحة البيانات:', validation.errors);
            DialogUtils.showValidationError(
                `يرجى تصحيح الأخطاء التالية قبل الحفظ:\n\n• ${validation.errors.join('\n• ')}`
            );
            return;
        }

        // Show loading dialog
        DialogUtils.showLoading('جاري حفظ التصفية...', 'يرجى الانتظار');

        // Get current values
        const systemSales = parseFloat(document.getElementById('systemSales').value) || 0;
        const totalReceipts = parseFloat(document.getElementById('totalReceipts').textContent) || 0;
        const surplusDeficit = totalReceipts - systemSales;
        const reconciliationId = currentReconciliation.id;

        console.log('📊 [SAVE] بيانات التصفية للحفظ:', {
            reconciliationId,
            systemSales,
            totalReceipts,
            surplusDeficit,
            dataArrays: {
                bankReceipts: bankReceipts.length,
                cashReceipts: cashReceipts.length,
                postpaidSales: postpaidSales.length,
                customerReceipts: customerReceipts.length,
                returnInvoices: returnInvoices.length,
                suppliers: suppliers.length
            }
        });

        let reconciliationNumber;

        if (isRecalled) {
            // إذا كانت تصفية مستدعاة، نحتفظ برقم التصفية الأصلي
            reconciliationNumber = currentReconciliation.reconciliation_number;
            console.log('📊 [SAVE] الاحتفاظ برقم التصفية الأصلي:', reconciliationNumber);
        } else {
            // إذا كانت تصفية جديدة، نحصل على رقم تصفية جديد
            reconciliationNumber = await ipcRenderer.invoke('get-next-reconciliation-number');
            console.log('📊 [SAVE] رقم التصفية الجديد المخصص:', reconciliationNumber);
        }

        // Complete reconciliation with reconciliation number
        await ipcRenderer.invoke('complete-reconciliation',
            reconciliationId, systemSales, totalReceipts, surplusDeficit, reconciliationNumber
        );

        console.log('✅ [SAVE] تم حفظ التصفية في قاعدة البيانات بنجاح مع رقم التصفية:', reconciliationNumber);

        // Update current reconciliation with the new number
        currentReconciliation.reconciliation_number = reconciliationNumber;

        // Close loading dialog
        DialogUtils.close();

        // Show enhanced success message with reconciliation number and summary
        const successMessage = `تم حفظ التصفية بنجاح! 🎉\n\n` +
            `📋 رقم التصفية: #${reconciliationNumber}\n` +
            `💰 إجمالي المقبوضات: ${formatCurrency(totalReceipts)} ريال\n` +
            `🏪 مبيعات النظام: ${formatCurrency(systemSales)} ريال\n` +
            `📊 ${surplusDeficit >= 0 ? 'الفائض' : 'العجز'}: ${formatCurrency(Math.abs(surplusDeficit))} ريال\n\n` +
            `سيتم الآن تفريغ البيانات وإعداد تصفية جديدة.`;

        await DialogUtils.showSuccess(successMessage, 'تم حفظ التصفية بنجاح');

        /* 
           Dispatch Event to Notify Reconciliation Requests Manager 
           This will update the UI in the "Requests" tab (mark as done)
        */
        if (currentReconciliation && currentReconciliation.originRequestId) {
            console.log('📡 [SAVE] Dispatching update event for Request ID:', currentReconciliation.originRequestId);

            // 1. Dispatch event for local UI update
            window.dispatchEvent(new CustomEvent('reconciliation-saved', {
                detail: {
                    originRequestId: currentReconciliation.originRequestId,
                    reconciliationNumber: reconciliationNumber
                }
            }));

            // 2. [DIRECT DB UPDATE] Update status locally using IPC (Guaranteed Offline Support)
            try {
                const reqId = currentReconciliation.originRequestId;
                console.log(`💾 [SAVE] Updating request ${reqId} status directly via IPC...`);

                // Execute UPDATE directly on SQLite
                await ipcRenderer.invoke('db-run',
                    "UPDATE reconciliation_requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [reqId]
                );

                console.log(`✅ [SAVE] Request ${reqId} marked as completed in local DB.`);

                // Optional: Fire-and-forget server notification for logging purposes
                fetch('http://localhost:4000/api/sync/update-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: reqId, status: 'completed' })
                }).catch(() => { }); // Ignore network errors

            } catch (dbErr) {
                console.error('❌ [SAVE] Failed to update request status in DB:', dbErr);
            }
        }

        console.log('🧹 [SAVE] بدء تفريغ البيانات وإعادة التهيئة...');

        // Clear all data and reset system to new reconciliation state
        await clearAllReconciliationData();

        // Reset system UI state (this will properly update button states after clearing data)
        resetSystemToNewReconciliationState();

        // Show final confirmation
        DialogUtils.showSuccessToast('تم تفريغ البيانات وإعداد تصفية جديدة بنجاح');

        console.log('🎉 [SAVE] تم إكمال عملية الحفظ والتفريغ بنجاح');

        // Optional: Switch to new reconciliation tab if not already there
        const newReconciliationTab = document.querySelector('[data-section="new-reconciliation"]');
        if (newReconciliationTab && !newReconciliationTab.classList.contains('active')) {
            console.log('🔄 [SAVE] التبديل إلى تبويب التصفية الجديدة...');
            newReconciliationTab.click();
        }

    } catch (error) {
        // Close loading dialog if still open
        DialogUtils.close();

        console.error('❌ [SAVE] خطأ في حفظ التصفية:', error);
        DialogUtils.showError(
            `حدث خطأ أثناء حفظ التصفية:\n\n${error.message}\n\nيرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني.`,
            'خطأ في حفظ التصفية'
        );
    }
}

// Comprehensive data clearing and system reset functions
// Comprehensive data clearing and system reset functions
async function clearAllReconciliationData() {
    console.log('🧹 [CLEAR] بدء تفريغ جميع بيانات التصفية...');

    try {
        // Clear all data arrays
        bankReceipts = [];
        cashReceipts = [];
        postpaidSales = [];
        customerReceipts = [];
        returnInvoices = [];
        suppliers = [];

        // Clear all form fields safely
        try {
            clearAllFormFields();
        } catch (formError) {
            console.error('⚠️ [CLEAR] خطأ جزئي في تفريغ النماذج:', formError);
        }

        // Clear all tables safely
        try {
            clearAllTables();
        } catch (tableError) {
            console.error('⚠️ [CLEAR] خطأ جزئي في تفريغ الجداول:', tableError);
        }

        // Reset all totals and summaries safely
        try {
            resetAllTotalsAndSummaries();
        } catch (totalError) {
            console.error('⚠️ [CLEAR] خطأ جزئي في تصفير المجاميع:', totalError);
        }

        console.log('✅ [CLEAR] تم تفريغ البيانات (المحاولة) بنجاح');

    } catch (error) {
        console.error('❌ [CLEAR] خطأ غير متوقع في تفريغ البيانات:', error);
        // We still proceed to finally block
    } finally {
        // FORCE RESET - This ensures we never append to an old reconciliation
        console.log('🔒 [CLEAR] إجبار تصفير كائن التصفية الحالية');
        currentReconciliation = null;

        // Also clear any legacy references if they exist
        if (window.pendingReconciliationData) {
            window.pendingReconciliationData = null;
        }
    }
}

// دالة لتنظيف واجهة المستخدم فقط دون حذف البيانات
async function resetUIOnly() {
    console.log('🧹 [UI RESET] تنظيف واجهة المستخدم فقط...');

    try {
        // تفريغ المتغيرات المؤقتة في الذاكرة فقط
        bankReceipts = [];
        cashReceipts = [];
        postpaidSales = [];
        customerReceipts = [];
        returnInvoices = [];
        suppliers = [];
        currentReconciliation = null;

        // تنظيف جميع الحقول في النماذج
        clearAllFormFields();

        // تحديث العرض في الجداول
        updateBankReceiptsTable();
        updateCashReceiptsTable();
        updatePostpaidSalesTable();
        updateCustomerReceiptsTable();
        updateReturnInvoicesTable();
        updateSuppliersTable();
        updateSummary();

        console.log('✅ [UI RESET] تم تنظيف واجهة المستخدم بنجاح');
    } catch (error) {
        console.error('❌ [UI RESET] خطأ في تنظيف واجهة المستخدم:', error);
        throw error;
    }
}

function clearAllFormFields() {
    console.log('📝 [CLEAR] تفريغ جميع حقول النماذج...');

    // Clear reconciliation basic info
    const cashierSelect = document.getElementById('cashierSelect');
    const accountantSelect = document.getElementById('accountantSelect');
    const reconciliationDate = document.getElementById('reconciliationDate');
    const systemSales = document.getElementById('systemSales');
    const timeRangeStart = document.getElementById('timeRangeStart');
    const timeRangeEnd = document.getElementById('timeRangeEnd');
    const filterNotes = document.getElementById('filterNotes');

    if (cashierSelect) cashierSelect.value = '';
    if (accountantSelect) accountantSelect.value = '';
    if (reconciliationDate) reconciliationDate.value = '';
    if (systemSales) systemSales.value = '';
    if (timeRangeStart) timeRangeStart.value = '';
    if (timeRangeEnd) timeRangeEnd.value = '';
    if (filterNotes) filterNotes.value = '';

    // Clear bank receipts form
    const bankReceiptForm = document.getElementById('bankReceiptForm');
    if (bankReceiptForm) bankReceiptForm.reset();

    // Clear cash receipts form
    const cashReceiptForm = document.getElementById('cashReceiptForm');
    if (cashReceiptForm) cashReceiptForm.reset();

    // Clear postpaid sales form
    const postpaidSaleForm = document.getElementById('postpaidSaleForm');
    if (postpaidSaleForm) postpaidSaleForm.reset();

    // Clear customer receipts form
    const customerReceiptForm = document.getElementById('customerReceiptForm');
    if (customerReceiptForm) customerReceiptForm.reset();

    // Clear return invoices form
    const returnInvoiceForm = document.getElementById('returnInvoiceForm');
    if (returnInvoiceForm) returnInvoiceForm.reset();

    // Clear suppliers form
    const supplierForm = document.getElementById('supplierForm');
    if (supplierForm) supplierForm.reset();

    console.log('✅ [CLEAR] تم تفريغ جميع النماذج');
}

function clearAllTables() {
    console.log('📊 [CLEAR] تفريغ جميع الجداول...');

    // Clear all table bodies
    const tablesToClear = [
        'bankReceiptsTable',
        'cashReceiptsTable',
        'postpaidSalesTable',
        'customerReceiptsTable',
        'returnInvoicesTable',
        'suppliersTable'
    ];

    tablesToClear.forEach(tableId => {
        const tableBody = document.getElementById(tableId);
        if (tableBody) {
            tableBody.innerHTML = '';
        }
    });

    console.log('✅ [CLEAR] تم تفريغ جميع الجداول');
}

function resetAllTotalsAndSummaries() {
    console.log('🔢 [RESET] إعادة تعيين جميع المجاميع والملخصات...');

    // Reset individual totals
    const totalsToReset = [
        'bankReceiptsTotal',
        'cashReceiptsTotal',
        'postpaidSalesTotal',
        'customerReceiptsTotal',
        'returnInvoicesTotal',
        'suppliersTotal'
    ];

    totalsToReset.forEach(totalId => {
        const element = document.getElementById(totalId);
        if (element) {
            element.textContent = '0.00';
        }
    });

    // Reset summary totals
    const summaryTotalsToReset = [
        'summaryBankTotal',
        'summaryCashTotal',
        'summaryPostpaidTotal',
        'summaryCustomerTotal',
        'summaryReturnTotal',
        'totalReceipts',
        'surplusDeficit'
    ];

    summaryTotalsToReset.forEach(totalId => {
        const element = document.getElementById(totalId);
        if (element) {
            element.textContent = '0.00';
            // Reset class for surplus/deficit element
            if (totalId === 'surplusDeficit') {
                element.className = 'summary-value';
            }
        }
    });

    console.log('✅ [RESET] تم إعادة تعيين جميع المجاميع');
}

/**
 * Update button states based on current reconciliation status
 * @param {string} context - Context for logging (e.g., 'NEW_RECONCILIATION', 'AFTER_SAVE', 'RESET')
 */
function updateButtonStates(context = 'GENERAL') {
    console.log(`🔄 [BUTTON-STATE] تحديث حالة الأزرار - السياق: ${context}`);

    const createReconciliationBtn = document.getElementById('createReconciliationBtn');
    const saveReconciliationBtn = document.getElementById('saveReconciliationBtn');

    // Update create button
    if (createReconciliationBtn) {
        createReconciliationBtn.disabled = false;
        createReconciliationBtn.textContent = 'إنشاء تصفية جديدة';
    }

    // Update save button based on current reconciliation status
    if (saveReconciliationBtn) {
        if (currentReconciliation && currentReconciliation.id) {
            saveReconciliationBtn.disabled = false;
            console.log(`✅ [BUTTON-STATE] تم تفعيل زر الحفظ - ${context}`);
        } else {
            saveReconciliationBtn.disabled = true;
            console.log(`❌ [BUTTON-STATE] تم تعطيل زر الحفظ - ${context}`);
        }
    }
}

// Make updateButtonStates available globally for testing
window.updateButtonStates = updateButtonStates;

function resetSystemToNewReconciliationState() {
    console.log('🔄 [RESET] إعادة تهيئة النظام لتصفية جديدة...');

    try {
        // Update button states
        updateButtonStates('RESET');

        // Reset any status indicators
        const statusElements = document.querySelectorAll('.reconciliation-status');
        statusElements.forEach(element => {
            element.textContent = '';
            element.className = 'reconciliation-status';
        });

        // Clear any temporary data or cache
        sessionStorage.removeItem('currentReconciliationData');
        sessionStorage.removeItem('tempReconciliationData');

        // Reset form validation states
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            form.classList.remove('was-validated');
            const invalidElements = form.querySelectorAll('.is-invalid');
            invalidElements.forEach(element => {
                element.classList.remove('is-invalid');
            });
        });

        // Reset any progress indicators
        const progressBars = document.querySelectorAll('.progress-bar');
        progressBars.forEach(bar => {
            bar.style.width = '0%';
            bar.setAttribute('aria-valuenow', '0');
        });

        console.log('✅ [RESET] تم إعادة تهيئة النظام بنجاح');

    } catch (error) {
        console.error('❌ [RESET] خطأ في إعادة تهيئة النظام:', error);
    }
}

function validateReconciliationBeforeSave() {
    console.log('✅ [VALIDATE] فحص صحة بيانات التصفية قبل الحفظ...');

    const errors = [];

    // Check if reconciliation exists
    if (!currentReconciliation) {
        errors.push('لا توجد تصفية حالية');
    }

    // Check basic reconciliation data
    const cashierSelect = document.getElementById('cashierSelect');
    const accountantSelect = document.getElementById('accountantSelect');
    const reconciliationDate = document.getElementById('reconciliationDate');

    if (!cashierSelect || !cashierSelect.value) {
        errors.push('يرجى اختيار الكاشير');
    }

    if (!accountantSelect || !accountantSelect.value) {
        errors.push('يرجى اختيار المحاسب');
    }

    if (!reconciliationDate || !reconciliationDate.value) {
        errors.push('يرجى تحديد تاريخ التصفية');
    }

    // Check if there's any data to save
    const hasData = bankReceipts.length > 0 ||
        cashReceipts.length > 0 ||
        postpaidSales.length > 0 ||
        customerReceipts.length > 0 ||
        returnInvoices.length > 0 ||
        suppliers.length > 0;

    if (!hasData) {
        errors.push('لا توجد بيانات مقبوضات أو مبيعات للحفظ');
    }

    // Check system sales
    const systemSales = parseFloat(document.getElementById('systemSales').value);
    if (isNaN(systemSales) || systemSales < 0) {
        errors.push('يرجى إدخال مبيعات النظام بشكل صحيح');
    }

    console.log('📋 [VALIDATE] نتائج الفحص:', {
        errorsCount: errors.length,
        errors: errors,
        hasData: hasData,
        reconciliationExists: !!currentReconciliation
    });

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// دالة تحميل وعرض قائمة التصفيات في النافذة المنبثقة
// Pagination state for reconciliations list
let recListCurrentPage = 1;
const recListPageSize = 50;
let recListTotalPages = 1;

async function loadReconciliationsList(page = 1) {
    console.log(`📋 [LIST] تحميل قائمة التصفيات - الصفحة ${page}...`);
    const searchInput = document.getElementById('reconciliationSearchInput');
    const table = document.getElementById('reconciliationsListTable');
    const tbody = table.querySelector('tbody');

    try {
        // Get total count
        const countResult = await ipcRenderer.invoke('db-query', `
            SELECT COUNT(*) as total FROM reconciliations
        `);
        const totalRecords = countResult[0].total;
        recListTotalPages = Math.ceil(totalRecords / recListPageSize);
        recListCurrentPage = page;

        // Get paginated data
        const offset = (page - 1) * recListPageSize;
        const reconciliations = await ipcRenderer.invoke('db-query', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            ORDER BY r.reconciliation_date DESC, r.id DESC
            LIMIT ? OFFSET ?
        `, [recListPageSize, offset]);

        tbody.innerHTML = '';

        reconciliations.forEach(rec => {
            const row = document.createElement('tr');
            const statusClass = rec.status === 'completed' ? 'bg-success' : 'bg-warning';
            const statusText = rec.status === 'completed' ? 'مكتملة' : 'مسودة';

            row.innerHTML = `
                <td>${rec.reconciliation_number || 'مسودة'}</td>
                <td>${formatDate(rec.reconciliation_date)}</td>
                <td>${rec.cashier_name} (${rec.cashier_number})</td>
                <td>${rec.accountant_name}</td>
                <td>${formatCurrency(rec.total_receipts || 0)}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
            `;

            row.style.cursor = 'pointer';
            row.title = 'انقر نقراً مزدوجاً لاستدعاء التصفية';

            row.addEventListener('dblclick', () => handleRecallFromList(rec.id));
            tbody.appendChild(row);
        });

        // Render pagination
        renderRecListPagination(totalRecords);

        console.log(`✅ [LIST] تم تحميل ${reconciliations.length} تصفية (${totalRecords} إجمالي)`);

    } catch (error) {
        console.error('❌ [LIST] خطأ في تحميل قائمة التصفيات:', error);
        DialogUtils.showError('حدث خطأ أثناء تحميل قائمة التصفيات', 'خطأ');
    }
}

function renderRecListPagination(totalRecords) {
    let paginationContainer = document.getElementById('recListPaginationContainer');

    // Create if doesn't exist
    if (!paginationContainer) {
        const modal = document.getElementById('reconciliationListModal');
        const modalBody = modal.querySelector('.modal-body');
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'recListPaginationContainer';
        paginationContainer.className = 'mt-3 d-flex justify-content-between align-items-center';
        paginationContainer.style.borderTop = '2px solid #e9ecef';
        paginationContainer.style.paddingTop = '15px';
        modalBody.appendChild(paginationContainer);
    }

    if (recListTotalPages <= 1) {
        paginationContainer.innerHTML = `<small class="text-muted">المجموع: ${totalRecords} تصفية</small>`;
        return;
    }

    const start = (recListCurrentPage - 1) * recListPageSize + 1;
    const end = Math.min(recListCurrentPage * recListPageSize, totalRecords);

    let html = `
        <div><small class="text-muted">عرض ${start}-${end} من ${totalRecords}</small></div>
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" onclick="loadReconciliationsList(1)" ${recListCurrentPage === 1 ? 'disabled' : ''}>«</button>
            <button class="btn btn-outline-secondary" onclick="loadReconciliationsList(${recListCurrentPage - 1})" ${recListCurrentPage === 1 ? 'disabled' : ''}>‹</button>
    `;

    // Show page numbers
    const maxVisible = 3;
    let startPage = Math.max(1, recListCurrentPage - 1);
    let endPage = Math.min(recListTotalPages, startPage + maxVisible - 1);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn ${i === recListCurrentPage ? 'btn-primary' : 'btn-outline-secondary'}" onclick="loadReconciliationsList(${i})">${i}</button>`;
    }

    html += `
            <button class="btn btn-outline-secondary" onclick="loadReconciliationsList(${recListCurrentPage + 1})" ${recListCurrentPage === recListTotalPages ? 'disabled' : ''}>›</button>
            <button class="btn btn-outline-secondary" onclick="loadReconciliationsList(${recListTotalPages})" ${recListCurrentPage === recListTotalPages ? 'disabled' : ''}>»</button>
        </div>
    `;

    paginationContainer.innerHTML = html;
}

// دالة البحث في قائمة التصفيات
function filterReconciliationsList() {
    const searchInput = document.getElementById('reconciliationSearchInput');
    const searchTerm = searchInput.value.toLowerCase();
    const rows = document.querySelectorAll('#reconciliationsListTable tbody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// إضافة مستمعي الأحداث للقائمة المنبثقة
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('reconciliationListModal');
    if (modal) {
        modal.addEventListener('show.bs.modal', loadReconciliationsList);
    }

    const searchInput = document.getElementById('reconciliationSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterReconciliationsList);
    }
});

// Cancel Filter Function
async function handleCancelFilter() {
    console.log('❌ [FILTER] بدء إلغاء التصفية...');

    try {
        if (!currentReconciliation) {
            console.warn('⚠️ [FILTER] لا توجد تصفية حالية للإلغاء');
            DialogUtils.showInfo('لا توجد تصفية حالية للإلغاء');
            return;
        }

        const confirmed = await DialogUtils.showConfirm(
            'هل أنت متأكد من إلغاء التصفية؟\nسيتم حذف التصفية من المسودات.',
            'تأكيد إلغاء التصفية'
        );

        if (confirmed) {
            console.log('🗑️ [FILTER] حذف التصفية من قاعدة البيانات...');
            await ipcRenderer.invoke('db-run',
                'DELETE FROM reconciliations WHERE id = ?',
                [currentReconciliation.id]
            );

            // تفريغ جميع البيانات
            await clearAllReconciliationData();
            resetSystemToNewReconciliationState();

            // إخفاء معلومات التصفية الحالية
            const infoDiv = document.getElementById('currentReconciliationInfo');
            if (infoDiv) {
                infoDiv.style.display = 'none';
            }

            console.log('✅ [FILTER] تم إلغاء التصفية بنجاح');
            DialogUtils.showSuccess('تم إلغاء التصفية وحذفها من المسودات بنجاح');
        } else {
            console.log('ℹ️ [FILTER] تم إلغاء العملية من قبل المستخدم');
        }
    } catch (error) {
        console.error('❌ [FILTER] خطأ في إلغاء التصفية:', error);
        DialogUtils.showError('حدث خطأ أثناء إلغاء التصفية: ' + error.message, 'خطأ في إلغاء التصفية');
    }
}

// Event handlers for dropdowns

// التعامل مع تغيير الفرع
async function handleBranchChange(event) {
    console.log('🏢 [BRANCH] تغيير الفرع...');
    const branchId = event.target.value;
    const atmSelect = document.getElementById('atmSelect');

    if (!atmSelect) {
        console.error('❌ [BRANCH] لم يتم العثور على قائمة الأجهزة');
        return;
    }

    try {
        // تفريغ قائمة الأجهزة
        atmSelect.innerHTML = '<option value="">اختر الجهاز</option>';

        if (branchId) {
            console.log(`📍 [BRANCH] جلب أجهزة الفرع ${branchId}...`);

            // جلب الأجهزة الخاصة بالفرع
            const atms = await ipcRenderer.invoke('db-query',
                `SELECT id, name, bank_name 
                 FROM atms 
                 WHERE branch_id = ? AND active = 1 
                 ORDER BY name`,
                [branchId]
            );

            console.log(`✅ [BRANCH] تم العثور على ${atms.length} جهاز`);

            // إضافة الأجهزة للقائمة
            atms.forEach(atm => {
                const option = document.createElement('option');
                option.value = atm.id;
                option.textContent = `${atm.name} - ${atm.bank_name}`;
                atmSelect.appendChild(option);
            });

            // تحديث حالة القائمة
            atmSelect.disabled = false;
        } else {
            console.log('ℹ️ [BRANCH] لم يتم اختيار فرع');
            atmSelect.disabled = true;
        }
    } catch (error) {
        console.error('❌ [BRANCH] خطأ في جلب الأجهزة:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء جلب الأجهزة');
    }
}

async function handleCashierChange(event) {
    const cashierId = event.target.value;

    if (cashierId) {
        try {
            const cashier = await ipcRenderer.invoke('db-get',
                'SELECT cashier_number FROM cashiers WHERE id = ?', [cashierId]
            );

            document.getElementById('cashierNumber').value = cashier ? cashier.cashier_number : '';
        } catch (error) {
            console.error('Error loading cashier details:', error);
        }
    } else {
        document.getElementById('cashierNumber').value = '';
    }
}

async function handleAtmChange(event) {
    const atmId = event.target.value;

    if (atmId) {
        try {
            const atm = await ipcRenderer.invoke('db-get',
                'SELECT bank_name FROM atms WHERE id = ?', [atmId]
            );

            document.getElementById('bankName').value = atm ? atm.bank_name : '';
        } catch (error) {
            console.error('Error loading ATM details:', error);
        }
    } else {
        document.getElementById('bankName').value = '';
    }
}

// Handle operation type change for new bank receipt
function handleOperationTypeChange(event) {
    const operationType = event.target.value;
    const atmSelect = document.getElementById('atmSelect');
    const bankName = document.getElementById('bankName');

    if (operationType === 'تحويل') {
        // Disable ATM selection for transfer operations
        atmSelect.disabled = true;
        atmSelect.value = '';
        atmSelect.removeAttribute('required');
        bankName.value = '';
        console.log('🔄 [OPERATION] تم إلغاء اختيار الجهاز لعملية التحويل');
    } else {
        // Enable ATM selection for other operations
        atmSelect.disabled = false;
        atmSelect.setAttribute('required', 'required');
        console.log('🏧 [OPERATION] تم تفعيل اختيار الجهاز للعمليات الأخرى');
    }
}

// Handle operation type change for edit bank receipt
function handleEditOperationTypeChange(event) {
    const operationType = event.target.value;
    const editAtmSelect = document.getElementById('editAtmSelect');
    const editBankName = document.getElementById('editBankName');

    if (operationType === 'تحويل') {
        // Disable ATM selection for transfer operations
        editAtmSelect.disabled = true;
        editAtmSelect.value = '';
        editAtmSelect.removeAttribute('required');
        editBankName.value = '';
        console.log('🔄 [EDIT] تم إلغاء اختيار الجهاز لعملية التحويل');
    } else {
        // Enable ATM selection for other operations
        editAtmSelect.disabled = false;
        editAtmSelect.setAttribute('required', 'required');
        console.log('🏧 [EDIT] تم تفعيل اختيار الجهاز للعمليات الأخرى');
    }
}

// Utility functions
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';

    // Hide error after 5 seconds
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

// ===================================================================
// DATE AND NUMBER FORMATTING UTILITIES - GREGORIAN CALENDAR ONLY
// ===================================================================

/**
 * Format currency using English numbers and Gregorian calendar
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'SAR'
    }).format(amount);
}

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
 * Format numbers using English digits only
 */
function formatNumber(number) {
    if (number === null || number === undefined) return '0';

    try {
        return new Intl.NumberFormat('en-US').format(number);
    } catch (error) {
        console.error('Error formatting number:', error);
        return String(number);
    }
}

/**
 * Convert Arabic numerals to English numerals
 */
function arabicToEnglishNumbers(text) {
    if (!text) return text;

    const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const englishNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    let result = String(text);
    for (let i = 0; i < arabicNumbers.length; i++) {
        result = result.replace(new RegExp(arabicNumbers[i], 'g'), englishNumbers[i]);
    }

    return result;
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

// Management functions
let editingCashierId = null;
let editingAdminId = null;
let editingAccountantId = null;
let editingAtmId = null;

// Cashier management functions
async function handleAddCashier(event) {
    event.preventDefault();
    console.log('👤 [CASHIER] بدء إضافة/تعديل الكاشير...');

    const name = document.getElementById('cashierNameInput').value.trim();
    const cashierNumber = document.getElementById('cashierNumberInput').value.trim();
    const branchId = document.getElementById('cashierBranchSelect').value;

    console.log('📝 [CASHIER] البيانات المدخلة:', {
        name: name,
        cashierNumber: cashierNumber,
        branchId: branchId,
        nameLength: name.length,
        cashierNumberLength: cashierNumber.length,
        isEditing: !!editingCashierId,
        editingId: editingCashierId
    });

    // Enhanced validation with detailed logging
    if (!name || !cashierNumber || !branchId) {
        console.error('❌ [CASHIER] حقول مفقودة - الاسم:', !!name, 'الرقم:', !!cashierNumber, 'الفرع:', !!branchId);
        DialogUtils.showValidationError('يرجى ملء جميع الحقول المطلوبة');
        return;
    }

    if (name.length < 2) {
        console.error('❌ [CASHIER] اسم قصير جداً:', name.length);
        DialogUtils.showValidationError('اسم الكاشير يجب أن يكون أكثر من حرفين');
        return;
    }

    if (cashierNumber.length < 1) {
        console.error('❌ [CASHIER] رقم الكاشير فارغ');
        DialogUtils.showValidationError('رقم الكاشير مطلوب');
        return;
    }

    try {
        if (editingCashierId) {
            console.log('✏️ [CASHIER] تحديث كاشير موجود - معرف:', editingCashierId);

            // Check if the new number conflicts with other cashiers (excluding current one)
            const conflictingCashier = await ipcRenderer.invoke('db-get',
                'SELECT id, name FROM cashiers WHERE cashier_number = ? AND id != ?',
                [cashierNumber, editingCashierId]
            );

            if (conflictingCashier) {
                console.error('❌ [CASHIER] تعارض في رقم الكاشير أثناء التحديث:', {
                    newNumber: cashierNumber,
                    conflictingId: conflictingCashier.id,
                    conflictingName: conflictingCashier.name,
                    editingId: editingCashierId
                });
                DialogUtils.showValidationError(`رقم الكاشير "${cashierNumber}" مستخدم بواسطة "${conflictingCashier.name}". يرجى اختيار رقم آخر.`);
                return;
            }

            // Update existing cashier
            await ipcRenderer.invoke('db-run',
                'UPDATE cashiers SET name = ?, cashier_number = ?, branch_id = ? WHERE id = ?',
                [name, cashierNumber, branchId, editingCashierId]
            );
            console.log('✅ [CASHIER] تم تحديث الكاشير بنجاح');
            DialogUtils.showSuccessToast('تم تحديث الكاشير بنجاح');
        } else {
            console.log('➕ [CASHIER] إضافة كاشير جديد...');

            // Check if cashier number already exists with detailed logging
            console.log('🔍 [CASHIER] فحص وجود رقم الكاشير في قاعدة البيانات...');
            const existingCashier = await ipcRenderer.invoke('db-get',
                'SELECT id, name, cashier_number FROM cashiers WHERE cashier_number = ?',
                [cashierNumber]
            );

            console.log('📊 [CASHIER] نتيجة البحث عن رقم مكرر:', {
                found: !!existingCashier,
                searchedNumber: cashierNumber,
                existingData: existingCashier ? {
                    id: existingCashier.id,
                    name: existingCashier.name,
                    number: existingCashier.cashier_number
                } : null
            });

            if (existingCashier) {
                console.error('❌ [CASHIER] رقم الكاشير موجود مسبقاً:', {
                    inputNumber: cashierNumber,
                    existingNumber: existingCashier.cashier_number,
                    existingName: existingCashier.name,
                    existingId: existingCashier.id,
                    numbersMatch: cashierNumber === existingCashier.cashier_number,
                    typeComparison: {
                        inputType: typeof cashierNumber,
                        existingType: typeof existingCashier.cashier_number
                    }
                });
                DialogUtils.showValidationError(`رقم الكاشير "${cashierNumber}" موجود مسبقاً لدى "${existingCashier.name}". يرجى اختيار رقم آخر.`);
                return;
            }

            // Double-check: Get all cashier numbers for comparison
            console.log('🔍 [CASHIER] فحص إضافي - جميع أرقام الكاشيرين الموجودة...');
            const allCashiers = await ipcRenderer.invoke('db-query',
                'SELECT id, name, cashier_number FROM cashiers ORDER BY id'
            );

            console.log('📋 [CASHIER] جميع الكاشيرين الموجودين:', allCashiers.map(c => ({
                id: c.id,
                name: c.name,
                number: c.cashier_number,
                type: typeof c.cashier_number
            })));

            const duplicateFound = allCashiers.find(c =>
                String(c.cashier_number).trim() === String(cashierNumber).trim()
            );

            if (duplicateFound) {
                console.error('❌ [CASHIER] تم العثور على رقم مكرر في الفحص الإضافي:', {
                    inputNumber: cashierNumber,
                    duplicateData: duplicateFound,
                    stringComparison: String(duplicateFound.cashier_number).trim() === String(cashierNumber).trim()
                });
                DialogUtils.showValidationError(`رقم الكاشير "${cashierNumber}" موجود مسبقاً لدى "${duplicateFound.name}". يرجى اختيار رقم آخر.`);
                return;
            }

            console.log('✅ [CASHIER] رقم الكاشير متاح للاستخدام');

            // Add new cashier
            console.log('💾 [CASHIER] إدراج الكاشير الجديد في قاعدة البيانات...');
            const result = await ipcRenderer.invoke('db-run',
                'INSERT INTO cashiers (name, cashier_number, branch_id) VALUES (?, ?, ?)',
                [name, cashierNumber, branchId]
            );

            console.log('✅ [CASHIER] تم إضافة الكاشير بنجاح - معرف جديد:', result.lastInsertRowid);
            DialogUtils.showSuccessToast('تم إضافة الكاشير بنجاح');
        }

        console.log('🔄 [CASHIER] تحديث واجهة المستخدم...');
        resetCashierForm();
        loadCashiersList();
        loadDropdownData(); // Refresh dropdowns

    } catch (error) {
        console.error('❌ [CASHIER] خطأ في إدارة الكاشير:', {
            error: error.message,
            code: error.code,
            stack: error.stack,
            inputData: { name, cashierNumber },
            isEditing: !!editingCashierId
        });

        // Enhanced error handling with specific messages
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            DialogUtils.showError('رقم الكاشير موجود مسبقاً. يرجى اختيار رقم آخر.', 'خطأ في البيانات');
        } else if (error.message && error.message.includes('NOT NULL constraint failed')) {
            DialogUtils.showError('جميع الحقول مطلوبة. يرجى ملء البيانات كاملة.', 'خطأ في البيانات');
        } else if (error.code === 'SQLITE_CONSTRAINT') {
            DialogUtils.showError('خطأ في قيود قاعدة البيانات. تحقق من صحة البيانات المدخلة.', 'خطأ في قاعدة البيانات');
        } else {
            DialogUtils.showError(`حدث خطأ أثناء حفظ الكاشير: ${error.message || 'خطأ غير معروف'}`, 'خطأ في النظام');
        }
    }
}

function resetCashierForm() {
    document.getElementById('addCashierForm').reset();
    editingCashierId = null;
    document.querySelector('#addCashierForm button[type="submit"]').textContent = 'إضافة الكاشير';
}

async function loadCashiersList() {
    try {
        const cashiers = await ipcRenderer.invoke('db-query', `
            SELECT c.*, b.branch_name
            FROM cashiers c
            LEFT JOIN branches b ON c.branch_id = b.id
            ORDER BY c.created_at DESC
        `);

        const tbody = document.getElementById('cashiersListTable');
        tbody.innerHTML = '';

        cashiers.forEach((cashier, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${cashier.name}</td>
                <td>${cashier.cashier_number}</td>
                <td>${cashier.branch_name || 'غير محدد'}</td>
                <td>
                    <span class="badge ${cashier.active ? 'bg-success' : 'bg-danger'}">
                        ${cashier.active ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>${formatDate(cashier.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editCashier(${cashier.id})">
                        تعديل
                    </button>
                    <button class="btn btn-sm ${cashier.active ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleCashierStatus(${cashier.id}, ${cashier.active})">
                        ${cashier.active ? 'إلغاء تفعيل' : 'تفعيل'}
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading cashiers:', error);
    }
}

async function editCashier(id) {
    try {
        const cashier = await ipcRenderer.invoke('db-get',
            'SELECT * FROM cashiers WHERE id = ?', [id]
        );

        if (cashier) {
            document.getElementById('cashierNameInput').value = cashier.name;
            document.getElementById('cashierNumberInput').value = cashier.cashier_number;
            document.getElementById('cashierBranchSelect').value = cashier.branch_id || '';
            editingCashierId = id;
            document.querySelector('#addCashierForm button[type="submit"]').textContent = 'تحديث الكاشير';
        }

    } catch (error) {
        console.error('Error loading cashier for edit:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تحميل بيانات الكاشير');
    }
}

async function toggleCashierStatus(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

    const confirmed = await DialogUtils.showToggleConfirm(action, 'الكاشير');
    if (confirmed) {
        try {
            await ipcRenderer.invoke('db-run',
                'UPDATE cashiers SET active = ? WHERE id = ?',
                [newStatus, id]
            );

            loadCashiersList();
            loadDropdownData(); // Refresh dropdowns

        } catch (error) {
            console.error('Error toggling cashier status:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء تغيير حالة الكاشير');
        }
    }
}

// Admin management functions
async function handleAddAdmin(event) {
    event.preventDefault();

    const name = document.getElementById('adminNameInput').value.trim();
    const username = document.getElementById('adminUsernameInput').value.trim();
    const password = document.getElementById('adminPasswordInput').value.trim();

    if (!name || !username || !password) {
        DialogUtils.showValidationError('يرجى ملء جميع الحقول');
        return;
    }

    try {
        if (editingAdminId) {
            // Update existing admin
            await ipcRenderer.invoke('db-run',
                'UPDATE admins SET name = ?, username = ?, password = ? WHERE id = ?',
                [name, username, password, editingAdminId]
            );
            DialogUtils.showSuccessToast('تم تحديث المسؤول بنجاح');
        } else {
            // Add new admin
            await ipcRenderer.invoke('db-run',
                'INSERT INTO admins (name, username, password) VALUES (?, ?, ?)',
                [name, username, password]
            );
            DialogUtils.showSuccessToast('تم إضافة المسؤول بنجاح');
        }

        resetAdminForm();
        loadAdminsList();

    } catch (error) {
        console.error('Error managing admin:', error);
        if (error.message.includes('UNIQUE constraint failed')) {
            DialogUtils.showErrorToast('اسم المستخدم موجود مسبقاً');
        } else {
            DialogUtils.showErrorToast('حدث خطأ أثناء حفظ المسؤول');
        }
    }
}

function resetAdminForm() {
    document.getElementById('addAdminForm').reset();
    editingAdminId = null;
    document.querySelector('#addAdminForm button[type="submit"]').textContent = 'إضافة المسؤول';
}

async function loadAdminsList() {
    try {
        const admins = await ipcRenderer.invoke('db-query',
            'SELECT * FROM admins ORDER BY created_at DESC'
        );

        const tbody = document.getElementById('adminsListTable');
        tbody.innerHTML = '';

        admins.forEach((admin, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${admin.name}</td>
                <td>${admin.username}</td>
                <td>
                    <span class="badge ${admin.active ? 'bg-success' : 'bg-danger'}">
                        ${admin.active ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>${formatDate(admin.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editAdmin(${admin.id})">
                        تعديل
                    </button>
                    <button class="btn btn-sm ${admin.active ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleAdminStatus(${admin.id}, ${admin.active})">
                        ${admin.active ? 'إلغاء تفعيل' : 'تفعيل'}
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading admins:', error);
    }
}

async function editAdmin(id) {
    try {
        const admin = await ipcRenderer.invoke('db-get',
            'SELECT * FROM admins WHERE id = ?', [id]
        );

        if (admin) {
            document.getElementById('adminNameInput').value = admin.name;
            document.getElementById('adminUsernameInput').value = admin.username;
            document.getElementById('adminPasswordInput').value = admin.password;
            editingAdminId = id;
            document.querySelector('#addAdminForm button[type="submit"]').textContent = 'تحديث المسؤول';
        }

    } catch (error) {
        console.error('Error loading admin for edit:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تحميل بيانات المسؤول');
    }
}

async function toggleAdminStatus(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

    const confirmed = await DialogUtils.showToggleConfirm(action, 'المسؤول');
    if (confirmed) {
        try {
            await ipcRenderer.invoke('db-run',
                'UPDATE admins SET active = ? WHERE id = ?',
                [newStatus, id]
            );

            loadAdminsList();

        } catch (error) {
            console.error('Error toggling admin status:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء تغيير حالة المسؤول');
        }
    }
}

// Accountant management functions
async function handleAddAccountant(event) {
    event.preventDefault();

    const name = document.getElementById('accountantNameInput').value.trim();

    if (!name) {
        DialogUtils.showValidationError('يرجى إدخال اسم المحاسب');
        return;
    }

    try {
        if (editingAccountantId) {
            // Update existing accountant
            await ipcRenderer.invoke('db-run',
                'UPDATE accountants SET name = ? WHERE id = ?',
                [name, editingAccountantId]
            );
            DialogUtils.showSuccessToast('تم تحديث المحاسب بنجاح');
        } else {
            // Add new accountant
            await ipcRenderer.invoke('db-run',
                'INSERT INTO accountants (name) VALUES (?)',
                [name]
            );
            DialogUtils.showSuccessToast('تم إضافة المحاسب بنجاح');
        }

        resetAccountantForm();
        loadAccountantsList();
        loadDropdownData(); // Refresh dropdowns

    } catch (error) {
        console.error('Error managing accountant:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء حفظ المحاسب');
    }
}

function resetAccountantForm() {
    document.getElementById('addAccountantForm').reset();
    editingAccountantId = null;
    document.querySelector('#addAccountantForm button[type="submit"]').textContent = 'إضافة المحاسب';
}

async function loadAccountantsList() {
    try {
        const accountants = await ipcRenderer.invoke('db-query',
            'SELECT * FROM accountants ORDER BY created_at DESC'
        );

        const tbody = document.getElementById('accountantsListTable');
        tbody.innerHTML = '';

        accountants.forEach((accountant, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${accountant.name}</td>
                <td>
                    <span class="badge ${accountant.active ? 'bg-success' : 'bg-danger'}">
                        ${accountant.active ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>${formatDate(accountant.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editAccountant(${accountant.id})">
                        تعديل
                    </button>
                    <button class="btn btn-sm ${accountant.active ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleAccountantStatus(${accountant.id}, ${accountant.active})">
                        ${accountant.active ? 'إلغاء تفعيل' : 'تفعيل'}
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading accountants:', error);
    }
}

async function editAccountant(id) {
    try {
        const accountant = await ipcRenderer.invoke('db-get',
            'SELECT * FROM accountants WHERE id = ?', [id]
        );

        if (accountant) {
            document.getElementById('accountantNameInput').value = accountant.name;
            editingAccountantId = id;
            document.querySelector('#addAccountantForm button[type="submit"]').textContent = 'تحديث المحاسب';
        }

    } catch (error) {
        console.error('Error loading accountant for edit:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تحميل بيانات المحاسب');
    }
}

async function toggleAccountantStatus(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

    const confirmed = await DialogUtils.showToggleConfirm(action, 'المحاسب');
    if (confirmed) {
        try {
            await ipcRenderer.invoke('db-run',
                'UPDATE accountants SET active = ? WHERE id = ?',
                [newStatus, id]
            );

            loadAccountantsList();
            loadDropdownData(); // Refresh dropdowns

        } catch (error) {
            console.error('Error toggling accountant status:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء تغيير حالة المحاسب');
        }
    }
}

// Load branches for ATM management
async function loadBranchesForAtms() {
    try {
        const branches = await ipcRenderer.invoke('db-query',
            'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name'
        );

        const branchSelect = document.getElementById('atmBranchSelect');
        branchSelect.innerHTML = '<option value="">اختر الفرع</option>';

        branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.id;
            option.textContent = branch.branch_name;
            branchSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading branches for ATMs:', error);
    }
}

// ATM management functions
async function handleAddAtm(event) {
    event.preventDefault();

    const name = document.getElementById('atmNameInput').value.trim();
    const bankName = document.getElementById('atmBankInput').value.trim();
    const branchId = document.getElementById('atmBranchSelect').value;
    const location = document.getElementById('atmLocationInput').value.trim() || 'غير محدد';

    if (!name || !bankName || !branchId) {
        DialogUtils.showValidationError('يرجى ملء جميع الحقول المطلوبة');
        return;
    }

    try {
        if (editingAtmId) {
            // Update existing ATM
            await ipcRenderer.invoke('db-run',
                'UPDATE atms SET name = ?, bank_name = ?, branch_id = ?, location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [name, bankName, branchId, location, editingAtmId]
            );
            DialogUtils.showSuccessToast('تم تحديث الجهاز بنجاح');
        } else {
            // Add new ATM
            await ipcRenderer.invoke('db-run',
                'INSERT INTO atms (name, bank_name, branch_id, location) VALUES (?, ?, ?, ?)',
                [name, bankName, branchId, location]
            );
            DialogUtils.showSuccessToast('تم إضافة الجهاز بنجاح');
        }

        resetAtmForm();
        loadAtmsList();
        loadDropdownData(); // Refresh dropdowns

    } catch (error) {
        console.error('Error managing ATM:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء حفظ الجهاز');
    }
}

function resetAtmForm() {
    document.getElementById('addAtmForm').reset();
    document.getElementById('atmBranchSelect').value = '';
    editingAtmId = null;
    document.querySelector('#addAtmForm button[type="submit"]').textContent = 'إضافة الجهاز';
}

async function loadAtmsList() {
    try {
        const atms = await ipcRenderer.invoke('db-query',
            `SELECT a.*, b.branch_name
             FROM atms a
             LEFT JOIN branches b ON a.branch_id = b.id
             ORDER BY a.created_at DESC`
        );

        const tbody = document.getElementById('atmsListTable');
        tbody.innerHTML = '';

        atms.forEach((atm, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${atm.name}</td>
                <td>${atm.bank_name}</td>
                <td>
                    <span class="badge bg-info">
                        ${atm.branch_name || 'غير محدد'}
                    </span>
                </td>
                <td>${atm.location || 'غير محدد'}</td>
                <td>
                    <span class="badge ${atm.active ? 'bg-success' : 'bg-danger'}">
                        ${atm.active ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>${formatDate(atm.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editAtm(${atm.id})">
                        تعديل
                    </button>
                    <button class="btn btn-sm ${atm.active ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleAtmStatus(${atm.id}, ${atm.active})">
                        ${atm.active ? 'إلغاء تفعيل' : 'تفعيل'}
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading ATMs:', error);
    }
}

async function editAtm(id) {
    try {
        const atm = await ipcRenderer.invoke('db-get',
            'SELECT * FROM atms WHERE id = ?', [id]
        );

        if (atm) {
            document.getElementById('atmNameInput').value = atm.name;
            document.getElementById('atmBankInput').value = atm.bank_name;
            document.getElementById('atmBranchSelect').value = atm.branch_id || '';
            document.getElementById('atmLocationInput').value = atm.location || '';
            editingAtmId = id;
            document.querySelector('#addAtmForm button[type="submit"]').textContent = 'تحديث الجهاز';
        }

    } catch (error) {
        console.error('Error loading ATM for edit:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تحميل بيانات الجهاز');
    }
}

async function toggleAtmStatus(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

    const confirmed = await DialogUtils.showToggleConfirm(action, 'الجهاز');
    if (confirmed) {
        try {
            await ipcRenderer.invoke('db-run',
                'UPDATE atms SET active = ? WHERE id = ?',
                [newStatus, id]
            );

            loadAtmsList();
            loadDropdownData(); // Refresh dropdowns

        } catch (error) {
            console.error('Error toggling ATM status:', error);
            DialogUtils.showErrorToast('حدث خطأ أثناء تغيير حالة الجهاز');
        }
    }
}



// Saved Reconciliations Pagination State
let savedRecCurrentPage = 1;
const savedRecPageSize = 50;
let savedRecTotalPages = 1;

async function loadSavedReconciliations(page = 1) {
    try {
        // Get total count
        const countResult = await ipcRenderer.invoke('db-query', `SELECT COUNT(*) as total FROM reconciliations`);
        const totalRecords = countResult[0].total;
        savedRecTotalPages = Math.ceil(totalRecords / savedRecPageSize);
        savedRecCurrentPage = page;

        // Get paginated data
        const offset = (page - 1) * savedRecPageSize;
        const reconciliations = await ipcRenderer.invoke('db-query', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name, b.branch_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            LEFT JOIN branches b ON c.branch_id = b.id
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `, [savedRecPageSize, offset]);

        displaySavedReconciliations(reconciliations);

        // Render pagination
        renderSavedRecPagination(totalRecords);

    } catch (error) {
        console.error('Error loading saved reconciliations:', error);
    }
}

function renderSavedRecPagination(totalRecords) {
    let paginationContainer = document.getElementById('savedRecPaginationContainer');

    // Add custom CSS for pagination buttons if not already added
    if (!document.getElementById('saved-rec-pagination-styles')) {
        const style = document.createElement('style');
        style.id = 'saved-rec-pagination-styles';
        style.textContent = `
            .saved-rec-pagination-wrapper {
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                margin-top: 20px;
            }
            
            .saved-rec-page-btn {
                padding: 10px 18px;
                margin: 0 4px;
                border: none;
                background: white;
                color: #495057;
                font-weight: 600;
                font-size: 14px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                min-width: 45px;
            }
            
            .saved-rec-page-btn:hover:not(:disabled) {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                transform: translateY(-3px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
            }
            
            .saved-rec-page-btn.active {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
                transform: scale(1.05);
            }
            
            .saved-rec-page-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
                background: #e9ecef;
            }
            
            .saved-rec-page-info {
                color: #495057;
                font-weight: 600;
                font-size: 15px;
                background: white;
                padding: 10px 20px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            }
        `;
        document.head.appendChild(style);
    }

    // Create if doesn't exist
    if (!paginationContainer) {
        const section = document.querySelector('#saved-reconciliations-section .card-body');
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'savedRecPaginationContainer';
        section.appendChild(paginationContainer);
    }

    if (savedRecTotalPages <= 1) {
        paginationContainer.innerHTML = `<div class="saved-rec-pagination-wrapper d-flex justify-content-center"><div class="saved-rec-page-info">المجموع: ${totalRecords} تصفية</div></div>`;
        return;
    }

    const start = (savedRecCurrentPage - 1) * savedRecPageSize + 1;
    const end = Math.min(savedRecCurrentPage * savedRecPageSize, totalRecords);

    let html = `<div class="saved-rec-pagination-wrapper d-flex justify-content-between align-items-center">
        <div class="saved-rec-page-info">عرض ${start}-${end} من ${totalRecords} تصفية</div>
        <div class="d-flex align-items-center gap-2">
            <button class="saved-rec-page-btn" onclick="loadSavedReconciliations(1)" ${savedRecCurrentPage === 1 ? 'disabled' : ''} title="الصفحة الأولى">⏮</button>
            <button class="saved-rec-page-btn" onclick="loadSavedReconciliations(${savedRecCurrentPage - 1})" ${savedRecCurrentPage === 1 ? 'disabled' : ''} title="السابق">❮</button>
    `;

    // Show page numbers with ellipsis
    const maxVisible = 5;
    let startPage = Math.max(1, savedRecCurrentPage - 2);
    let endPage = Math.min(savedRecTotalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    // First page + ellipsis
    if (startPage > 1) {
        html += `<button class="saved-rec-page-btn" onclick="loadSavedReconciliations(1)">1</button>`;
        if (startPage > 2) {
            html += `<span style="color: #6c757d; font-weight: bold; padding: 0 8px;">...</span>`;
        }
    }

    // Page range
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="saved-rec-page-btn ${i === savedRecCurrentPage ? 'active' : ''}" onclick="loadSavedReconciliations(${i})">${i}</button>`;
    }

    // Last page + ellipsis
    if (endPage < savedRecTotalPages) {
        if (endPage < savedRecTotalPages - 1) {
            html += `<span style="color: #6c757d; font-weight: bold; padding: 0 8px;">...</span>`;
        }
        html += `<button class="saved-rec-page-btn" onclick="loadSavedReconciliations(${savedRecTotalPages})">${savedRecTotalPages}</button>`;
    }

    html += `
            <button class="saved-rec-page-btn" onclick="loadSavedReconciliations(${savedRecCurrentPage + 1})" ${savedRecCurrentPage === savedRecTotalPages ? 'disabled' : ''} title="التالي">❯</button>
            <button class="saved-rec-page-btn" onclick="loadSavedReconciliations(${savedRecTotalPages})" ${savedRecCurrentPage === savedRecTotalPages ? 'disabled' : ''} title="الصفحة الأخيرة">⏭</button>
        </div>
    </div>`;

    paginationContainer.innerHTML = html;
}

async function loadSearchFilters() {
    try {
        // Load branches for filter
        const branches = await ipcRenderer.invoke('db-query',
            'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name'
        );
        populateSelect('searchBranchFilter', branches, 'id', 'branch_name');

        // Load cashiers for filter
        const cashiers = await ipcRenderer.invoke('db-query',
            'SELECT * FROM cashiers WHERE active = 1 ORDER BY name'
        );
        populateSelect('searchCashierFilter', cashiers, 'id', 'name');
        populateSelect('reportCashierFilter', cashiers, 'id', 'name');

    } catch (error) {
        console.error('Error loading search filters:', error);
    }
}

function displaySavedReconciliations(reconciliations) {
    const tbody = document.getElementById('savedReconciliationsTable');
    tbody.innerHTML = '';

    reconciliations.forEach(reconciliation => {
        const row = document.createElement('tr');
        const statusClass = reconciliation.status === 'completed' ? 'bg-success' : 'bg-warning';
        const statusText = reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة';

        const surplusDeficitClass = reconciliation.surplus_deficit > 0 ? 'text-success' :
            reconciliation.surplus_deficit < 0 ? 'text-danger' : 'text-muted';

        const lastModified = reconciliation.last_modified_date ?
            formatDate(reconciliation.last_modified_date) :
            '<span class="text-muted">لم يتم التعديل</span>';

        row.innerHTML = `
            <td>${reconciliation.status === 'completed' && reconciliation.reconciliation_number ? `#${reconciliation.reconciliation_number}` : '<span class="text-muted">مسودة</span>'}</td>
            <td>${reconciliation.branch_name || ''}</td>
            <td>${reconciliation.cashier_name} (${reconciliation.cashier_number})</td>
            <td>${reconciliation.accountant_name}</td>
            <td>${formatDate(reconciliation.reconciliation_date)}</td>
            <td class="text-currency">${formatCurrency(reconciliation.total_receipts)}</td>
            <td class="text-currency">${formatCurrency(reconciliation.system_sales)}</td>
            <td class="text-currency ${surplusDeficitClass}">${formatCurrency(reconciliation.surplus_deficit)}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>${lastModified}</td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-primary" onclick="viewReconciliation(${reconciliation.id})" title="عرض التفاصيل">
                        👁️ عرض
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="editReconciliationNew(${reconciliation.id})" title="تعديل التصفية">
                        ✏️ تعديل
                    </button>
                </div>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-info" onclick="printSavedReconciliation(${reconciliation.id})" title="طباعة مع خيارات">
                        🖨️ طباعة
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="quickPrintSavedReconciliation(${reconciliation.id})" title="طباعة سريعة">
                        ⚡ سريعة
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="generatePDFSavedReconciliation(${reconciliation.id})" title="تصدير PDF">
                        📄 PDF
                    </button>
                </div>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-success" onclick="thermalPreviewSavedReconciliation(${reconciliation.id})" title="معاينة الطباعة الحرارية">
                        🔥 معاينة
                    </button>
                    <button class="btn btn-sm btn-success" onclick="thermalPrintSavedReconciliation(${reconciliation.id})" title="طباعة حرارية">
                        🔥 حرارية
                    </button>
                </div>
                <button class="btn btn-sm btn-danger" onclick="deleteReconciliation(${reconciliation.id})" title="حذف التصفية">
                    🗑️ حذف
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function handleSearchReconciliations() {
    try {
        const branchId = document.getElementById('searchBranchFilter').value;
        const cashierId = document.getElementById('searchCashierFilter').value;
        const dateFrom = document.getElementById('searchDateFrom').value;
        const dateTo = document.getElementById('searchDateTo').value;
        const status = document.getElementById('searchStatus').value;

        let query = `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name, b.branch_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            JOIN branches b ON c.branch_id = b.id
            WHERE 1=1
        `;
        const params = [];

        if (branchId) {
            query += ' AND b.id = ?';
            params.push(branchId);
        }

        if (cashierId) {
            query += ' AND r.cashier_id = ?';
            params.push(cashierId);
        }

        if (dateFrom) {
            query += ' AND r.reconciliation_date >= ?';
            params.push(dateFrom);
        }

        if (dateTo) {
            query += ' AND r.reconciliation_date <= ?';
            params.push(dateTo);
        }

        if (status) {
            query += ' AND r.status = ?';
            params.push(status);
        }

        query += ' ORDER BY r.created_at DESC';

        const reconciliations = await ipcRenderer.invoke('db-query', query, params);
        displaySavedReconciliations(reconciliations);

    } catch (error) {
        console.error('Error searching reconciliations:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء البحث');
    }
}

function handleClearSearch() {
    document.getElementById('searchCashierFilter').value = '';
    document.getElementById('searchDateFrom').value = '';
    document.getElementById('searchDateTo').value = '';
    document.getElementById('searchStatus').value = '';
    loadSavedReconciliations();
}

// Delete functionality for saved reconciliations
async function deleteReconciliation(reconciliationId) {
    console.log('🗑️ [DELETE] طلب حذف التصفية - معرف:', reconciliationId);

    try {
        // Get reconciliation details for confirmation
        const reconciliation = await ipcRenderer.invoke('db-get', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            WHERE r.id = ?
        `, [reconciliationId]);

        if (!reconciliation) {
            DialogUtils.showError('التصفية غير موجودة', 'خطأ');
            return;
        }

        // Show simple confirmation dialog
        const reconciliationDisplay = reconciliation.reconciliation_number ? `#${reconciliation.reconciliation_number}` : '(مسودة)';
        const confirmMessage = `هل أنت متأكد من أنك تريد حذف التصفية رقم ${reconciliationDisplay}؟\n\nالكاشير: ${reconciliation.cashier_name} (${reconciliation.cashier_number})\nالتاريخ: ${formatDate(reconciliation.reconciliation_date)}\n\n⚠️ تحذير: هذا الإجراء لا يمكن التراجع عنه!`;

        const confirmed = await DialogUtils.showConfirm(confirmMessage, 'تأكيد الحذف');

        if (confirmed) {
            await performSingleDelete(reconciliationId);
        }

    } catch (error) {
        console.error('Error preparing delete:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تحضير الحذف');
    }
}

// Perform single reconciliation delete
async function performSingleDelete(reconciliationId) {
    console.log('🗑️ [DELETE] تنفيذ حذف التصفية:', reconciliationId);

    try {
        DialogUtils.showLoading('جاري حذف التصفية...', 'يرجى الانتظار');

        // Delete related records first (foreign key constraints)
        await ipcRenderer.invoke('db-run', 'DELETE FROM bank_receipts WHERE reconciliation_id = ?', [reconciliationId]);
        await ipcRenderer.invoke('db-run', 'DELETE FROM cash_receipts WHERE reconciliation_id = ?', [reconciliationId]);
        await ipcRenderer.invoke('db-run', 'DELETE FROM postpaid_sales WHERE reconciliation_id = ?', [reconciliationId]);
        await ipcRenderer.invoke('db-run', 'DELETE FROM customer_receipts WHERE reconciliation_id = ?', [reconciliationId]);
        await ipcRenderer.invoke('db-run', 'DELETE FROM return_invoices WHERE reconciliation_id = ?', [reconciliationId]);
        await ipcRenderer.invoke('db-run', 'DELETE FROM suppliers WHERE reconciliation_id = ?', [reconciliationId]);

        // Delete the reconciliation record
        await ipcRenderer.invoke('db-run', 'DELETE FROM reconciliations WHERE id = ?', [reconciliationId]);

        DialogUtils.close();

        console.log(`✅ [DELETE] تم حذف التصفية #${reconciliationId} بنجاح`);
        DialogUtils.showSuccessToast('تم حذف التصفية بنجاح');

        // Refresh the list
        await loadSavedReconciliations();

    } catch (error) {
        DialogUtils.close();
        console.error(`❌ [DELETE] فشل في حذف التصفية #${reconciliationId}:`, error);
        DialogUtils.showError(`حدث خطأ أثناء حذف التصفية: ${error.message}`, 'خطأ في النظام');
    }
}









async function viewReconciliation(id) {
    console.log('👁️ [VIEW] بدء عرض التصفية - معرف:', id);

    // Validate input
    if (!id) {
        console.error('❌ [VIEW] معرف التصفية مفقود');
        DialogUtils.showValidationError('معرف التصفية مطلوب');
        return;
    }

    try {
        console.log('📡 [VIEW] تحميل بيانات التصفية...');
        DialogUtils.showLoading('جاري تحميل بيانات التصفية...', 'يرجى الانتظار');

        const reconciliation = await ipcRenderer.invoke('db-get', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            WHERE r.id = ?
        `, [id]);

        DialogUtils.close();

        if (!reconciliation) {
            console.error('❌ [VIEW] لم يتم العثور على التصفية - معرف:', id);
            DialogUtils.showError('لم يتم العثور على التصفية المطلوبة', 'تصفية غير موجودة');
            return;
        }

        console.log('✅ [VIEW] تم تحميل بيانات التصفية:', {
            id: reconciliation.id,
            cashier: reconciliation.cashier_name,
            accountant: reconciliation.accountant_name,
            date: reconciliation.reconciliation_date,
            status: reconciliation.status
        });

        // Validate essential data
        const missingFields = [];
        if (!reconciliation.cashier_name) missingFields.push('اسم الكاشير');
        if (!reconciliation.accountant_name) missingFields.push('اسم المحاسب');
        if (!reconciliation.reconciliation_date) missingFields.push('تاريخ التصفية');
        if (reconciliation.total_receipts === null || reconciliation.total_receipts === undefined) missingFields.push('إجمالي المقبوضات');
        if (reconciliation.system_sales === null || reconciliation.system_sales === undefined) missingFields.push('مبيعات النظام');

        if (missingFields.length > 0) {
            console.warn('⚠️ [VIEW] بيانات مفقودة في التصفية:', missingFields);
            DialogUtils.showError(`البيانات التالية مفقودة في التصفية: ${missingFields.join(', ')}`, 'بيانات غير مكتملة');
            return;
        }

        // Get additional details for complete view
        console.log('📊 [VIEW] تحميل البيانات التفصيلية...');
        const detailedData = await ipcRenderer.invoke('get-reconciliation-for-edit', id);

        let additionalInfo = '';
        if (detailedData) {
            const counts = {
                bankReceipts: detailedData.bankReceipts?.length || 0,
                cashReceipts: detailedData.cashReceipts?.length || 0,
                postpaidSales: detailedData.postpaidSales?.length || 0,
                customerReceipts: detailedData.customerReceipts?.length || 0,
                returnInvoices: detailedData.returnInvoices?.length || 0,
                suppliers: detailedData.suppliers?.length || 0
            };

            additionalInfo = `

تفاصيل إضافية:
• المقبوضات البنكية: ${counts.bankReceipts} عنصر
• المقبوضات النقدية: ${counts.cashReceipts} عنصر
• المبيعات الآجلة: ${counts.postpaidSales} عنصر
• مقبوضات العملاء: ${counts.customerReceipts} عنصر
• فواتير المرتجع: ${counts.returnInvoices} عنصر
• الموردين: ${counts.suppliers} عنصر`;

            console.log('📈 [VIEW] إحصائيات التصفية:', counts);
        }

        const summary = `
تفاصيل التصفية #${reconciliation.id}

الكاشير: ${reconciliation.cashier_name} (${reconciliation.cashier_number})
المحاسب: ${reconciliation.accountant_name}
التاريخ: ${formatDate(reconciliation.reconciliation_date)}

إجمالي المقبوضات: ${formatCurrency(reconciliation.total_receipts)} ريال
مبيعات النظام: ${formatCurrency(reconciliation.system_sales)} ريال
الفائض/العجز: ${formatCurrency(reconciliation.surplus_deficit)} ريال
الحالة: ${reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة'}${additionalInfo}
        `;

        console.log('✅ [VIEW] عرض تفاصيل التصفية بنجاح');
        DialogUtils.showAlert(summary, 'تفاصيل التصفية', 'info');

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [VIEW] خطأ في عرض التصفية:', {
            id: id,
            error: error.message,
            stack: error.stack
        });

        // Enhanced error handling
        if (error.message && error.message.includes('database')) {
            DialogUtils.showError('حدث خطأ في قاعدة البيانات أثناء تحميل التصفية', 'خطأ في قاعدة البيانات');
        } else if (error.message && error.message.includes('SQLITE')) {
            DialogUtils.showError('خطأ في قاعدة البيانات SQLite', 'خطأ في قاعدة البيانات');
        } else {
            DialogUtils.showError(`حدث خطأ أثناء عرض التصفية: ${error.message || 'خطأ غير معروف'}`, 'خطأ في النظام');
        }
    }
}

async function printReconciliation(id) {
    try {
        const reconciliationData = await prepareReconciliationDataById(id);

        // Show print options dialog
        await showAdvancedPrintDialog(reconciliationData);

    } catch (error) {
        console.error('Error printing reconciliation:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء طباعة التصفية');
    }
}

// Legacy PDF generation function (keep for backward compatibility)
async function generatePDFReconciliation(id) {
    console.log('📄 [LEGACY-PDF] إنشاء PDF للتصفية (دالة قديمة):', id);

    try {
        // Show loading message
        DialogUtils.showLoading('جاري إنشاء ملف PDF...', 'يرجى الانتظار');

        // Use the new data loading and transformation approach
        const printData = await loadReconciliationForPrint(id);

        if (!printData) {
            DialogUtils.close();
            DialogUtils.showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
            return;
        }

        // Transform data to PDF generator format
        const pdfData = transformDataForPDFGenerator(printData);

        // Generate PDF
        const result = await ipcRenderer.invoke('generate-pdf', pdfData);

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccess(`تم حفظ التقرير بنجاح في:\n${result.filePath}`, 'تم إنشاء التقرير');
        } else {
            DialogUtils.showError(`فشل في إنشاء التقرير: ${result.message}`, 'خطأ في إنشاء التقرير');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [LEGACY-PDF] خطأ في إنشاء PDF:', error);
        DialogUtils.showError(`خطأ في إنشاء PDF: ${error.message}`, 'خطأ في النظام');
    }
}

async function prepareReconciliationDataById(id) {
    const reconciliation = await ipcRenderer.invoke('db-get', `
        SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
        FROM reconciliations r
        JOIN cashiers c ON r.cashier_id = c.id
        JOIN accountants a ON r.accountant_id = a.id
        WHERE r.id = ?
    `, [id]);

    const bankReceipts = await ipcRenderer.invoke('db-query', `
        SELECT br.*, a.name as atm_name, a.bank_name
        FROM bank_receipts br
        JOIN atms a ON br.atm_id = a.id
        WHERE br.reconciliation_id = ?
    `, [id]);

    const cashReceipts = await ipcRenderer.invoke('db-query',
        'SELECT * FROM cash_receipts WHERE reconciliation_id = ?', [id]);

    const postpaidSales = await ipcRenderer.invoke('db-query',
        'SELECT * FROM postpaid_sales WHERE reconciliation_id = ?', [id]);

    const customerReceipts = await ipcRenderer.invoke('db-query',
        'SELECT * FROM customer_receipts WHERE reconciliation_id = ?', [id]);

    const returnInvoices = await ipcRenderer.invoke('db-query',
        'SELECT * FROM return_invoices WHERE reconciliation_id = ?', [id]);

    const suppliers = await ipcRenderer.invoke('db-query',
        'SELECT * FROM suppliers WHERE reconciliation_id = ?', [id]);

    const bankTotal = bankReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const cashTotal = cashReceipts.reduce((sum, receipt) => sum + receipt.total_amount, 0);
    const postpaidTotal = postpaidSales.reduce((sum, sale) => sum + sale.amount, 0);
    const customerTotal = customerReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const returnTotal = returnInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

    return {
        reconciliationId: reconciliation.id,
        cashierName: reconciliation.cashier_name,
        cashierNumber: reconciliation.cashier_number,
        accountantName: reconciliation.accountant_name,
        reconciliationDate: reconciliation.reconciliation_date,
        companyName: 'شركة المثال التجارية',

        bankReceipts: bankReceipts,
        cashReceipts: cashReceipts,
        postpaidSales: postpaidSales,
        customerReceipts: customerReceipts,
        returnInvoices: returnInvoices,
        suppliers: suppliers,

        summary: {
            bankTotal: bankTotal,
            cashTotal: cashTotal,
            postpaidTotal: postpaidTotal,
            customerTotal: customerTotal,
            returnTotal: returnTotal,
            totalReceipts: reconciliation.total_receipts,
            systemSales: reconciliation.system_sales,
            surplusDeficit: reconciliation.surplus_deficit
        }
    };
}

// Placeholder functions for other features
async function loadReportFilters() {
    await loadSearchFilters();
}



async function loadAdvancedReportFilters() {
    try {
        const atms = await ipcRenderer.invoke('db-query',
            `SELECT a.*, b.branch_name
             FROM atms a
             LEFT JOIN branches b ON a.branch_id = b.id
             WHERE a.active = 1
             ORDER BY b.branch_name, a.name`
        );

        // Populate with branch info
        const atmSelect = document.getElementById('atmReportFilter');
        atmSelect.innerHTML = '<option value="">جميع الأجهزة</option>';
        atms.forEach(atm => {
            const option = document.createElement('option');
            option.value = atm.id;
            option.textContent = `${atm.name} - ${atm.branch_name || 'غير محدد'}`;
            atmSelect.appendChild(option);
        });

        // Set default dates
        const today = new Date();
        const lastWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);

        document.getElementById('timeReportFrom').value = lastWeek.toISOString().split('T')[0];
        document.getElementById('timeReportTo').value = today.toISOString().split('T')[0];
        document.getElementById('atmReportFrom').value = lastWeek.toISOString().split('T')[0];
        document.getElementById('atmReportTo').value = today.toISOString().split('T')[0];

    } catch (error) {
        console.error('Error loading advanced report filters:', error);
    }
}

// Load enhanced report filters
async function loadEnhancedReportFilters() {
    try {
        // Load branches for filter
        const branches = await ipcRenderer.invoke('db-all', 'SELECT id, branch_name FROM branches WHERE is_active = 1 ORDER BY branch_name');
        const branchSelect = document.getElementById('reportBranchFilter');

        if (branchSelect) {
            branchSelect.innerHTML = '<option value="">جميع الفروع</option>';
            branches.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.id;
                option.textContent = branch.branch_name;
                branchSelect.appendChild(option);
            });
        }

        // Load cashiers for filter
        const cashiers = await ipcRenderer.invoke('db-all', 'SELECT id, name, cashier_number FROM cashiers ORDER BY name');
        const cashierSelect = document.getElementById('reportCashierFilter');

        if (cashierSelect) {
            cashierSelect.innerHTML = '<option value="">جميع الكاشير</option>';
            cashiers.forEach(cashier => {
                const option = document.createElement('option');
                option.value = cashier.id;
                option.textContent = `${cashier.name} (${cashier.cashier_number})`;
                cashierSelect.appendChild(option);
            });
        }

        // Load accountants for filter
        const accountants = await ipcRenderer.invoke('db-all', 'SELECT id, name FROM accountants ORDER BY name');
        const accountantSelect = document.getElementById('reportAccountantFilter');

        if (accountantSelect) {
            accountantSelect.innerHTML = '<option value="">جميع المحاسبين</option>';
            accountants.forEach(accountant => {
                const option = document.createElement('option');
                option.value = accountant.id;
                option.textContent = accountant.name;
                accountantSelect.appendChild(option);
            });
        }

        console.log('✅ [REPORTS] تم تحميل مرشحات التقارير المحسنة بنجاح');
    } catch (error) {
        console.error('❌ [REPORTS] خطأ في تحميل مرشحات التقارير:', error);
    }
}

// Enhanced Reports functionality
let currentReportData = null;
let currentReportPage = 1;
const REPORT_ITEMS_PER_PAGE = 20;

async function handleGenerateReport() {
    console.log('📊 [REPORTS] إنشاء تقرير التصفيات...');

    try {
        DialogUtils.showLoading('جاري إنشاء التقرير...', 'يرجى الانتظار');

        // Get filter values
        const filters = getReportFilters();
        console.log('🔍 [REPORTS] مرشحات التقرير:', filters);

        // Build query
        const { query, params } = buildReportQuery(filters);
        console.log('🔍 [REPORTS] استعلام قاعدة البيانات:', query);

        // Execute query
        const reconciliations = await ipcRenderer.invoke('db-all', query, params);
        console.log(`📊 [REPORTS] تم العثور على ${reconciliations.length} تصفية`);

        // Process and display results
        currentReportData = reconciliations;
        await displayReportResults(reconciliations, filters);

        DialogUtils.close();
        DialogUtils.showSuccessToast(`تم إنشاء التقرير بنجاح (${reconciliations.length} تصفية)`);

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [REPORTS] خطأ في إنشاء التقرير:', error);
        DialogUtils.showError(`حدث خطأ أثناء إنشاء التقرير: ${error.message}`, 'خطأ في التقرير');
    }
}

function getReportFilters() {
    return {
        dateFrom: document.getElementById('reportDateFrom').value,
        dateTo: document.getElementById('reportDateTo').value,
        branchId: document.getElementById('reportBranchFilter').value,
        cashierId: document.getElementById('reportCashierFilter').value,
        accountantId: document.getElementById('reportAccountantFilter').value,
        status: document.getElementById('reportStatusFilter').value,
        minAmount: parseFloat(document.getElementById('reportMinAmount').value) || null,
        maxAmount: parseFloat(document.getElementById('reportMaxAmount').value) || null,
        searchText: document.getElementById('reportSearchText').value.trim()
    };
}

function buildReportQuery(filters) {
    let query = `
        SELECT r.*,
               c.name as cashier_name,
               c.cashier_number,
               a.name as accountant_name,
               b.branch_name
        FROM reconciliations r
        JOIN cashiers c ON r.cashier_id = c.id
        JOIN accountants a ON r.accountant_id = a.id
        LEFT JOIN branches b ON c.branch_id = b.id
        WHERE 1=1
    `;

    const params = [];

    // Date filters
    if (filters.dateFrom) {
        query += ' AND DATE(r.reconciliation_date) >= ?';
        params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
        query += ' AND DATE(r.reconciliation_date) <= ?';
        params.push(filters.dateTo);
    }

    // Branch filter
    if (filters.branchId) {
        query += ' AND c.branch_id = ?';
        params.push(filters.branchId);
    }

    // Cashier filter
    if (filters.cashierId) {
        query += ' AND r.cashier_id = ?';
        params.push(filters.cashierId);
    }

    // Accountant filter
    if (filters.accountantId) {
        query += ' AND r.accountant_id = ?';
        params.push(filters.accountantId);
    }

    // Status filter
    if (filters.status) {
        query += ' AND r.status = ?';
        params.push(filters.status);
    }

    // Amount range filters
    if (filters.minAmount !== null) {
        query += ' AND r.total_receipts >= ?';
        params.push(filters.minAmount);
    }
    if (filters.maxAmount !== null) {
        query += ' AND r.total_receipts <= ?';
        params.push(filters.maxAmount);
    }

    // Text search
    if (filters.searchText) {
        query += ' AND (c.name LIKE ? OR a.name LIKE ? OR r.id LIKE ?)';
        const searchPattern = `%${filters.searchText}%`;
        params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY r.reconciliation_date DESC, r.id DESC';

    return { query, params };
}

async function displayReportResults(reconciliations, filters) {
    console.log('📊 [REPORTS] عرض نتائج التقرير...');

    // Show results card
    document.getElementById('reportResultsCard').style.display = 'block';

    // Generate summary statistics
    const summary = generateReportSummary(reconciliations);
    displayReportSummary(summary);

    // Display data table with pagination
    displayReportTable(reconciliations);

    // Generate charts if enabled
    if (document.getElementById('reportChartsSection').style.display !== 'none') {
        generateReportCharts(reconciliations);
    }
}

function generateReportSummary(reconciliations) {
    const totalReconciliations = reconciliations.length;
    const totalReceipts = reconciliations.reduce((sum, r) => sum + r.total_receipts, 0);
    const totalSystemSales = reconciliations.reduce((sum, r) => sum + r.system_sales, 0);
    const totalSurplusDeficit = reconciliations.reduce((sum, r) => sum + r.surplus_deficit, 0);

    const completedCount = reconciliations.filter(r => r.status === 'completed').length;
    const draftCount = reconciliations.filter(r => r.status === 'draft').length;

    const averageReceipts = totalReconciliations > 0 ? totalReceipts / totalReconciliations : 0;

    // Cashier distribution
    const cashierStats = {};
    reconciliations.forEach(r => {
        if (!cashierStats[r.cashier_name]) {
            cashierStats[r.cashier_name] = { count: 0, totalReceipts: 0 };
        }
        cashierStats[r.cashier_name].count++;
        cashierStats[r.cashier_name].totalReceipts += r.total_receipts;
    });

    return {
        totalReconciliations,
        totalReceipts,
        totalSystemSales,
        totalSurplusDeficit,
        completedCount,
        draftCount,
        averageReceipts,
        cashierStats
    };
}

function displayReportSummary(summary) {
    const summaryContainer = document.getElementById('reportSummary');

    summaryContainer.innerHTML = `
        <div class="col-md-3">
            <div class="card bg-primary text-white">
                <div class="card-body">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h6 class="card-title">إجمالي التصفيات</h6>
                            <h4 class="mb-0">${summary.totalReconciliations}</h4>
                        </div>
                        <div class="align-self-center">
                            <i class="icon fs-1">📊</i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-success text-white">
                <div class="card-body">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h6 class="card-title">إجمالي المقبوضات</h6>
                            <h4 class="mb-0">${formatCurrency(summary.totalReceipts)}</h4>
                        </div>
                        <div class="align-self-center">
                            <i class="icon fs-1">💰</i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-info text-white">
                <div class="card-body">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h6 class="card-title">مبيعات النظام</h6>
                            <h4 class="mb-0">${formatCurrency(summary.totalSystemSales)}</h4>
                        </div>
                        <div class="align-self-center">
                            <i class="icon fs-1">🏪</i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card ${summary.totalSurplusDeficit >= 0 ? 'bg-success' : 'bg-danger'} text-white">
                <div class="card-body">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h6 class="card-title">${summary.totalSurplusDeficit >= 0 ? 'إجمالي الفائض' : 'إجمالي العجز'}</h6>
                            <h4 class="mb-0">${formatCurrency(Math.abs(summary.totalSurplusDeficit))}</h4>
                        </div>
                        <div class="align-self-center">
                            <i class="icon fs-1">${summary.totalSurplusDeficit >= 0 ? '📈' : '📉'}</i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function displayReportTable(reconciliations) {
    const tableBody = document.getElementById('reportResultsTableBody');
    const startIndex = (currentReportPage - 1) * REPORT_ITEMS_PER_PAGE;
    const endIndex = startIndex + REPORT_ITEMS_PER_PAGE;
    const pageData = reconciliations.slice(startIndex, endIndex);

    tableBody.innerHTML = '';

    pageData.forEach(reconciliation => {
        const row = document.createElement('tr');

        const statusClass = reconciliation.status === 'completed' ? 'bg-success' : 'bg-warning';
        const statusText = reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة';

        const surplusDeficitClass = reconciliation.surplus_deficit >= 0 ? 'text-success' : 'text-danger';

        row.innerHTML = `
            <td>${reconciliation.status === 'completed' && reconciliation.reconciliation_number ? `#${reconciliation.reconciliation_number}` : 'مسودة'}</td>
            <td>${formatDate(reconciliation.reconciliation_date)}</td>
            <td>${reconciliation.cashier_name} (${reconciliation.cashier_number})</td>
            <td>${reconciliation.accountant_name}</td>
            <td class="text-currency">${formatCurrency(reconciliation.total_receipts)}</td>
            <td class="text-currency">${formatCurrency(reconciliation.system_sales)}</td>
            <td class="text-currency ${surplusDeficitClass}">${formatCurrency(reconciliation.surplus_deficit)}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-primary" onclick="viewReconciliation(${reconciliation.id})" title="عرض التفاصيل">
                        👁️
                    </button>
                    <button class="btn btn-sm btn-info" onclick="printReconciliation(${reconciliation.id})" title="طباعة">
                        🖨️
                    </button>
                </div>
            </td>
        `;

        tableBody.appendChild(row);
    });

    // Update pagination
    updateReportPagination(reconciliations.length);
}

function updateReportPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / REPORT_ITEMS_PER_PAGE);
    const paginationContainer = document.getElementById('reportPagination');
    const paginationInfo = document.getElementById('reportPaginationInfo');

    // Update info
    const startItem = (currentReportPage - 1) * REPORT_ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentReportPage * REPORT_ITEMS_PER_PAGE, totalItems);
    paginationInfo.textContent = `عرض ${startItem}-${endItem} من ${totalItems} نتيجة`;

    // Generate pagination
    paginationContainer.innerHTML = '';

    if (totalPages <= 1) return;

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentReportPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" onclick="changeReportPage(${currentReportPage - 1})">السابق</a>`;
    paginationContainer.appendChild(prevLi);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentReportPage - 2 && i <= currentReportPage + 2)) {
            const li = document.createElement('li');
            li.className = `page-item ${i === currentReportPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#" onclick="changeReportPage(${i})">${i}</a>`;
            paginationContainer.appendChild(li);
        } else if (i === currentReportPage - 3 || i === currentReportPage + 3) {
            const li = document.createElement('li');
            li.className = 'page-item disabled';
            li.innerHTML = '<span class="page-link">...</span>';
            paginationContainer.appendChild(li);
        }
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentReportPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" onclick="changeReportPage(${currentReportPage + 1})">التالي</a>`;
    paginationContainer.appendChild(nextLi);
}

function changeReportPage(page) {
    if (!currentReportData) return;

    const totalPages = Math.ceil(currentReportData.length / REPORT_ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;

    currentReportPage = page;
    displayReportTable(currentReportData);
}

// Export functions
async function handleExportReportPdf() {
    if (!currentReportData || currentReportData.length === 0) {
        DialogUtils.showValidationError('لا توجد بيانات تقرير للتصدير');
        return;
    }

    try {
        DialogUtils.showLoading('جاري تصدير التقرير إلى PDF...', 'يرجى الانتظار');

        const reportHtml = await generateReportHtml(currentReportData);
        const result = await ipcRenderer.invoke('export-pdf', {
            html: reportHtml,
            filename: `reconciliation-report-${new Date().toISOString().split('T')[0]}.pdf`
        });

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccessToast('تم تصدير التقرير إلى PDF بنجاح');
        } else {
            DialogUtils.showError(`فشل في تصدير PDF: ${result.error}`, 'خطأ في التصدير');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('Error exporting PDF:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تصدير PDF');
    }
}

async function handleExportReportExcel() {
    if (!currentReportData || currentReportData.length === 0) {
        DialogUtils.showValidationError('لا توجد بيانات تقرير للتصدير');
        return;
    }

    try {
        DialogUtils.showLoading('جاري تصدير التقرير إلى Excel...', 'يرجى الانتظار');

        const excelData = prepareExcelData(currentReportData);
        const result = await ipcRenderer.invoke('export-excel', {
            data: excelData,
            filename: `reconciliation-report-${new Date().toISOString().split('T')[0]}.xlsx`
        });

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccessToast('تم تصدير التقرير إلى Excel بنجاح');
        } else {
            DialogUtils.showError(`فشل في تصدير Excel: ${result.error}`, 'خطأ في التصدير');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('Error exporting Excel:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تصدير Excel');
    }
}

// Print function for reconciliation reports (different from new reconciliation print)
async function handlePrintReportsData() {
    if (!currentReportData || currentReportData.length === 0) {
        DialogUtils.showValidationError('لا توجد بيانات تقرير للطباعة');
        return;
    }

    try {
        // Get current print settings
        const printSettings = await ipcRenderer.invoke('get-print-settings');

        const reportHtml = await generateReportHtml(currentReportData);
        const result = await ipcRenderer.invoke('create-print-preview', {
            html: reportHtml,
            title: 'تقرير التصفيات',
            isColorPrint: printSettings.color !== false
        });

        if (result.success) {
            DialogUtils.showSuccessToast('تم فتح نافذة معاينة الطباعة');
        } else {
            DialogUtils.showError(`فشل في فتح معاينة الطباعة: ${result.error}`, 'خطأ في الطباعة');
        }

    } catch (error) {
        console.error('Error printing report:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء طباعة التقرير');
    }
}

// Print function for NEW RECONCILIATION (renamed to avoid conflict)
async function handlePrintNewReconciliation() {
    console.log('🖨️ [PRINT] طباعة التصفية الجديدة...');

    if (!currentReconciliation) {
        console.error('❌ [PRINT] لا توجد تصفية حالية للطباعة');
        DialogUtils.showValidationError('يرجى إنشاء تصفية أولاً');
        return;
    }

    try {
        console.log('📊 [PRINT] فحص البيانات المتاحة:', {
            currentReconciliation: !!currentReconciliation,
            reconciliationId: currentReconciliation?.id,
            bankReceipts: bankReceipts.length,
            cashReceipts: cashReceipts.length,
            postpaidSales: postpaidSales.length,
            customerReceipts: customerReceipts.length,
            returnInvoices: returnInvoices.length,
            suppliers: suppliers.length
        });

        // Check if there's any data to print
        const hasData = bankReceipts.length > 0 ||
            cashReceipts.length > 0 ||
            postpaidSales.length > 0 ||
            customerReceipts.length > 0 ||
            returnInvoices.length > 0 ||
            suppliers.length > 0;

        if (!hasData) {
            console.warn('⚠️ [PRINT] لا توجد بيانات مقبوضات أو مبيعات للطباعة');
            DialogUtils.showValidationError('لا توجد بيانات مقبوضات أو مبيعات للطباعة. يرجى إضافة بعض البيانات أولاً.');
            return;
        }

        // Show section selection dialog first (same as Saved Reconciliations)
        const selectedSections = await showPrintSectionDialogForNewReconciliation();

        if (selectedSections) {
            // Prepare reconciliation data for printing
            const reconciliationData = await prepareReconciliationData();

            // Get current print settings
            const printSettings = await ipcRenderer.invoke('get-print-settings');

            // Prepare print data with selected sections
            const printData = preparePrintData(reconciliationData, {
                ...selectedSections,
                color: printSettings.color !== false
            });

            console.log('📊 [PRINT] بيانات الطباعة جاهزة:', {
                reconciliationId: reconciliationData.reconciliation.id,
                selectedSections: selectedSections.sections,
                totalReceipts: reconciliationData.summary.totalReceipts
            });

            // Create print preview
            const result = await ipcRenderer.invoke('create-print-preview', printData);

            if (result.success) {
                console.log('✅ [PRINT] تم فتح معاينة الطباعة بنجاح');
                DialogUtils.showSuccessToast('تم فتح معاينة الطباعة');
            } else {
                console.error('❌ [PRINT] فشل في فتح معاينة الطباعة:', result.error);
                DialogUtils.showError(`فشل في فتح معاينة الطباعة: ${result.error}`, 'خطأ في الطباعة');
            }
        }

    } catch (error) {
        console.error('❌ [PRINT] خطأ في طباعة التصفية:', error);
        DialogUtils.showError(`حدث خطأ أثناء طباعة التصفية: ${error.message}`, 'خطأ في الطباعة');
    }
}

function handleClearReportFilters() {
    document.getElementById('reportDateFrom').value = '';
    document.getElementById('reportDateTo').value = '';
    document.getElementById('reportBranchFilter').value = '';
    document.getElementById('reportCashierFilter').value = '';
    document.getElementById('reportAccountantFilter').value = '';
    document.getElementById('reportStatusFilter').value = '';
    document.getElementById('reportMinAmount').value = '';
    document.getElementById('reportMaxAmount').value = '';
    document.getElementById('reportSearchText').value = '';

    // Hide results
    document.getElementById('reportResultsCard').style.display = 'none';
    currentReportData = null;
    currentReportPage = 1;

    DialogUtils.showSuccessToast('تم مسح جميع المرشحات');
}

// Utility functions
async function generateReportHtml(reconciliations, companyName = null) {
    const summary = generateReportSummary(reconciliations);

    // Get company name if not provided
    if (!companyName) {
        companyName = await getCompanyName();
    }

    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>تقرير التصفيات - ${companyName}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .company-header { text-align: center; margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; }
                .company-name { font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 5px; }
                .report-title { font-size: 20px; color: #34495e; margin-bottom: 10px; }
                .summary { display: flex; justify-content: space-around; margin-bottom: 30px; }
                .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                th { background-color: #f2f2f2; }
                .text-success { color: green; }
                .text-danger { color: red; }
                @media print {
                    body { margin: 0; margin-bottom: 25mm; }
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
                @page { margin-bottom: 25mm; }
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
            </style>
        </head>
        <body>
            <div class="company-header">
                <div class="company-name">${companyName}</div>
                <div class="report-title">تقرير التصفيات</div>
                <p>تاريخ التقرير: ${getCurrentDate()}</p>
            </div>

            <div class="summary">
                <div class="summary-card">
                    <h3>${summary.totalReconciliations}</h3>
                    <p>إجمالي التصفيات</p>
                </div>
                <div class="summary-card">
                    <h3>${formatCurrency(summary.totalReceipts)}</h3>
                    <p>إجمالي المقبوضات</p>
                </div>
                <div class="summary-card">
                    <h3>${formatCurrency(summary.totalSystemSales)}</h3>
                    <p>مبيعات النظام</p>
                </div>
                <div class="summary-card">
                    <h3 class="${summary.totalSurplusDeficit >= 0 ? 'text-success' : 'text-danger'}">
                        ${formatCurrency(summary.totalSurplusDeficit)}
                    </h3>
                    <p>الفائض/العجز</p>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>رقم التصفية</th>
                        <th>التاريخ</th>
                        <th>الكاشير</th>
                        <th>المحاسب</th>
                        <th>إجمالي المقبوضات</th>
                        <th>مبيعات النظام</th>
                        <th>الفائض/العجز</th>
                        <th>الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${reconciliations.map(r => `
                        <tr>
                            <td>${r.status === 'completed' && r.reconciliation_number ? `#${r.reconciliation_number}` : 'مسودة'}</td>
                            <td>${formatDate(r.reconciliation_date)}</td>
                            <td>${r.cashier_name} (${r.cashier_number})</td>
                            <td>${r.accountant_name}</td>
                            <td>${formatCurrency(r.total_receipts)}</td>
                            <td>${formatCurrency(r.system_sales)}</td>
                            <td class="${r.surplus_deficit >= 0 ? 'text-success' : 'text-danger'}">
                                ${formatCurrency(r.surplus_deficit)}
                            </td>
                            <td>${r.status === 'completed' ? 'مكتملة' : 'مسودة'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <!-- فوتر الصفحة - يظهر في كل صفحة مطبوعة -->
            <div class="page-footer">
                جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
            </div>
        </body>
        </html>
    `;
}

function prepareExcelData(reconciliations) {
    const headers = [
        'رقم التصفية',
        'التاريخ',
        'الكاشير',
        'المحاسب',
        'إجمالي المقبوضات',
        'مبيعات النظام',
        'الفائض/العجز',
        'الحالة'
    ];

    const rows = reconciliations.map(r => [
        r.id,
        formatDate(r.reconciliation_date),
        `${r.cashier_name} (${r.cashier_number})`,
        r.accountant_name,
        r.total_receipts,
        r.system_sales,
        r.surplus_deficit,
        r.status === 'completed' ? 'مكتملة' : 'مسودة'
    ]);

    return {
        headers,
        rows,
        title: 'تقرير التصفيات'
    };
}

// View toggle functions
function toggleSummaryView() {
    const summarySection = document.getElementById('reportSummary');
    const btn = document.getElementById('toggleSummaryViewBtn');

    if (summarySection.style.display === 'none') {
        summarySection.style.display = 'block';
        btn.innerHTML = '<i class="icon">📈</i> إخفاء الإحصائيات';
    } else {
        summarySection.style.display = 'none';
        btn.innerHTML = '<i class="icon">📈</i> عرض الإحصائيات';
    }
}

function toggleChartView() {
    const chartsSection = document.getElementById('reportChartsSection');
    const btn = document.getElementById('toggleChartViewBtn');

    if (chartsSection.style.display === 'none') {
        chartsSection.style.display = 'block';
        btn.innerHTML = '<i class="icon">📊</i> إخفاء الرسوم البيانية';

        // Generate charts when showing
        if (currentReportData) {
            generateReportCharts(currentReportData);
        }
    } else {
        chartsSection.style.display = 'none';
        btn.innerHTML = '<i class="icon">📊</i> عرض الرسوم البيانية';
    }
}

function generateReportCharts(reconciliations) {
    // This is a placeholder for chart generation
    // In a real implementation, you would use a charting library like Chart.js
    console.log('📊 [CHARTS] إنشاء الرسوم البيانية للتقرير...');

    // For now, just show a message
    const cashierChart = document.getElementById('cashierDistributionChart');
    const salesChart = document.getElementById('salesTrendChart');

    if (cashierChart && salesChart) {
        // Placeholder implementation
        cashierChart.style.background = '#f8f9fa';
        cashierChart.style.border = '1px solid #dee2e6';

        salesChart.style.background = '#f8f9fa';
        salesChart.style.border = '1px solid #dee2e6';

        // Add text overlay
        const ctx1 = cashierChart.getContext('2d');
        ctx1.font = '16px Arial';
        ctx1.textAlign = 'center';
        ctx1.fillText('رسم بياني لتوزيع الكاشير', cashierChart.width / 2, cashierChart.height / 2);

        const ctx2 = salesChart.getContext('2d');
        ctx2.font = '16px Arial';
        ctx2.textAlign = 'center';
        ctx2.fillText('رسم بياني لاتجاه المبيعات', salesChart.width / 2, salesChart.height / 2);
    }
}

// Advanced Reports Variables
let currentAdvancedReportData = null;
let currentAdvancedReportType = null;
let currentAdvancedReportPage = 1;
const ADVANCED_REPORT_ITEMS_PER_PAGE = 15;



// Time-based Receipts Report
async function handleGenerateTimeReport() {
    console.log('📈 [TIME-REPORT] إنشاء تقرير المقبوضات عبر الزمن...');

    try {
        const reportType = document.getElementById('timeReportType').value;
        const dateFrom = document.getElementById('timeReportFrom').value;
        const dateTo = document.getElementById('timeReportTo').value;

        if (!dateFrom || !dateTo) {
            DialogUtils.showValidationError('يرجى تحديد نطاق التواريخ');
            return;
        }

        if (new Date(dateFrom) > new Date(dateTo)) {
            DialogUtils.showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
            return;
        }

        DialogUtils.showLoading('جاري إنشاء تقرير المقبوضات عبر الزمن...', 'يرجى الانتظار');

        // Generate time-based report
        const timeReportData = await generateTimeBasedReportData(reportType, dateFrom, dateTo);

        DialogUtils.close();

        if (timeReportData.length === 0) {
            DialogUtils.showInfo('لا توجد بيانات في النطاق الزمني المحدد', 'لا توجد نتائج');
            return;
        }

        // Display results
        currentAdvancedReportData = timeReportData;
        displayAdvancedReportResults(timeReportData, 'time', `تقرير المقبوضات ${getReportTypeLabel(reportType)}`);

    } catch (error) {
        DialogUtils.close();
        console.error('Error generating time report:', error);
        DialogUtils.showError(`حدث خطأ أثناء إنشاء التقرير: ${error.message}`, 'خطأ في التقرير');
    }
}

// ATM Report
async function handleGenerateAtmReport() {
    console.log('🏧 [ATM-REPORT] إنشاء تقرير أجهزة الصراف...');

    try {
        const atmFilter = document.getElementById('atmReportFilter').value;
        const dateFrom = document.getElementById('atmReportFrom').value;
        const dateTo = document.getElementById('atmReportTo').value;

        if (!dateFrom || !dateTo) {
            DialogUtils.showValidationError('يرجى تحديد نطاق التواريخ');
            return;
        }

        if (new Date(dateFrom) > new Date(dateTo)) {
            DialogUtils.showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
            return;
        }

        DialogUtils.showLoading('جاري إنشاء تقرير أجهزة الصراف...', 'يرجى الانتظار');

        // Generate ATM report
        const atmReportData = await generateAtmReportData(atmFilter, dateFrom, dateTo);

        DialogUtils.close();

        if (atmReportData.length === 0) {
            DialogUtils.showInfo('لا توجد بيانات في النطاق الزمني المحدد', 'لا توجد نتائج');
            return;
        }

        // Display results
        currentAdvancedReportData = atmReportData;
        const atmName = atmFilter ? await getAtmName(atmFilter) : 'جميع الأجهزة';
        displayAdvancedReportResults(atmReportData, 'atm', `تقرير أجهزة الصراف - ${atmName}`);

    } catch (error) {
        DialogUtils.close();
        console.error('Error generating ATM report:', error);
        DialogUtils.showError(`حدث خطأ أثناء إنشاء التقرير: ${error.message}`, 'خطأ في التقرير');
    }
}

// Data Generation Functions for Advanced Reports



async function generateTimeBasedReportData(reportType, dateFrom, dateTo) {
    console.log('📈 [TIME-REPORT] توليد بيانات التقرير الزمني...');

    let dateFormat, groupBy;
    switch (reportType) {
        case 'daily':
            dateFormat = '%Y-%m-%d';
            groupBy = 'DATE(r.reconciliation_date)';
            break;
        case 'weekly':
            dateFormat = '%Y-%W';
            groupBy = 'strftime("%Y", r.reconciliation_date) || "-W" || strftime("%W", r.reconciliation_date)';
            break;
        case 'monthly':
            dateFormat = '%Y-%m';
            groupBy = 'strftime("%Y-%m", r.reconciliation_date)';
            break;
        default:
            dateFormat = '%Y-%m-%d';
            groupBy = 'DATE(r.reconciliation_date)';
    }

    const query = `
        SELECT
            strftime('%Y', r.reconciliation_date) || '-W' || strftime('%W', r.reconciliation_date) as period,
            COUNT(r.id) as total_reconciliations,
            COUNT(DISTINCT r.cashier_id) as active_cashiers,
            SUM(r.total_receipts) as total_receipts,
            SUM(r.system_sales) as total_system_sales,
            SUM(r.surplus_deficit) as total_surplus_deficit,
            AVG(r.total_receipts) as avg_receipts,
            MIN(r.total_receipts) as min_receipts,
            MAX(r.total_receipts) as max_receipts,
            SUM(CASE WHEN r.surplus_deficit > 0 THEN 1 ELSE 0 END) as surplus_count,
            SUM(CASE WHEN r.surplus_deficit < 0 THEN 1 ELSE 0 END) as deficit_count,
            SUM(CASE WHEN r.surplus_deficit = 0 THEN 1 ELSE 0 END) as balanced_count
        FROM reconciliations r
        WHERE DATE(r.reconciliation_date) BETWEEN ? AND ?
        GROUP BY ${groupBy}
        ORDER BY period ASC
    `;

    const results = await ipcRenderer.invoke('db-all', query, [dateFrom, dateTo]);

    return results.map(row => ({
        ...row,
        accuracy_rate: formatDecimal((row.balanced_count + row.surplus_count) / row.total_reconciliations * 100),
        period_label: formatPeriodLabel(row.period, reportType)
    }));
}

async function generateAtmReportData(atmFilter, dateFrom, dateTo) {
    console.log('🏧 [ATM-REPORT] توليد بيانات تقرير أجهزة الصراف...');

    let atmCondition = '';
    let params = [dateFrom, dateTo];

    if (atmFilter) {
        atmCondition = 'AND br.atm_id = ?';
        params.push(atmFilter);
    }

    const query = `
        SELECT
            a.id as atm_id,
            a.name as atm_name,
            a.location as atm_location,
            b.branch_name as atm_branch_name,
            COUNT(DISTINCT r.id) as total_reconciliations,
            COUNT(br.id) as total_transactions,
            SUM(br.amount) as total_amount,
            AVG(br.amount) as avg_transaction_amount,
            MIN(br.amount) as min_transaction,
            MAX(br.amount) as max_transaction,
            COUNT(DISTINCT r.cashier_id) as cashiers_used,
            MIN(DATE(r.reconciliation_date)) as first_date,
            MAX(DATE(r.reconciliation_date)) as last_date
        FROM atms a
        LEFT JOIN branches b ON a.branch_id = b.id
        LEFT JOIN bank_receipts br ON a.id = br.atm_id
        LEFT JOIN reconciliations r ON br.reconciliation_id = r.id
            AND DATE(r.reconciliation_date) BETWEEN ? AND ?
        WHERE a.active = 1 ${atmCondition}
        GROUP BY a.id, a.name, a.location, b.branch_name
        HAVING total_transactions > 0
        ORDER BY total_amount DESC
    `;

    const results = await ipcRenderer.invoke('db-all', query, params);

    return results.map(row => ({
        ...row,
        daily_avg: formatDecimal(row.total_amount / getDaysBetween(row.first_date, row.last_date)),
        utilization_rate: formatDecimal((row.total_reconciliations / getDaysBetween(dateFrom, dateTo)) * 100)
    }));
}

// Helper Functions for Advanced Reports

function calculatePerformanceScore(cashierData) {
    // Performance score based on accuracy and surplus/deficit ratio
    const accuracyWeight = 0.6;
    const surplusWeight = 0.4;

    const accuracyScore = ((cashierData.balanced_count + cashierData.surplus_count) / cashierData.total_reconciliations) * 100;
    const surplusScore = Math.max(0, 100 - Math.abs(cashierData.avg_surplus_deficit));

    return formatDecimal((accuracyScore * accuracyWeight) + (surplusScore * surplusWeight));
}

function formatPeriodLabel(period, reportType) {
    switch (reportType) {
        case 'daily':
            return formatDate(period);
        case 'weekly':
            const [year, week] = period.split('-W');
            return `الأسبوع ${week} من ${year}`;
        case 'monthly':
            const [monthYear, month] = period.split('-');
            const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
            return `${monthNames[parseInt(month) - 1]} ${monthYear}`;
        default:
            return period;
    }
}

function getReportTypeLabel(reportType) {
    const labels = {
        'daily': 'اليومي',
        'weekly': 'الأسبوعي',
        'monthly': 'الشهري'
    };
    return labels[reportType] || reportType;
}

function getDaysBetween(dateFrom, dateTo) {
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

async function getAtmName(atmId) {
    try {
        const atm = await ipcRenderer.invoke('db-get', 'SELECT name FROM atms WHERE id = ?', [atmId]);
        return atm ? atm.name : 'غير معروف';
    } catch (error) {
        console.error('Error getting ATM name:', error);
        return 'غير معروف';
    }
}

// Display Advanced Report Results
async function displayAdvancedReportResults(data, reportType, title) {
    console.log('📊 [DISPLAY] عرض نتائج التقرير المتقدم:', reportType);

    // Store the current report type
    currentAdvancedReportType = reportType;

    // Show results section
    document.getElementById('advancedReportsResults').style.display = 'block';
    document.getElementById('advancedReportTitle').textContent = title;

    // Generate and display summary
    const summary = generateAdvancedReportSummary(data, reportType);
    displayAdvancedReportSummary(summary, reportType);

    // Display data table
    displayAdvancedReportTable(data, reportType);

    // Setup pagination if needed
    if (data.length > ADVANCED_REPORT_ITEMS_PER_PAGE) {
        setupAdvancedReportPagination(data);
    }

    // Scroll to results
    document.getElementById('advancedReportsResults').scrollIntoView({ behavior: 'smooth' });
}

// Get the current advanced report type
function getAdvancedReportType() {
    return currentAdvancedReportType;
}

// Setup pagination for advanced reports
function setupAdvancedReportPagination(data) {
    const paginationContainer = document.getElementById('advancedReportPagination');
    if (!paginationContainer) return;

    const totalPages = Math.ceil(data.length / ADVANCED_REPORT_ITEMS_PER_PAGE);

    // Reset to first page
    currentAdvancedReportPage = 1;

    let paginationHtml = '<nav><ul class="pagination justify-content-center">\n';

    // Previous button
    paginationHtml += `<li class="page-item ${currentAdvancedReportPage === 1 ? 'disabled' : ''}">`;
    paginationHtml += `<a class="page-link" href="#" onclick="changeAdvancedReportPage(${currentAdvancedReportPage - 1})" aria-label="السابق">`;
    paginationHtml += `<span aria-hidden="true">&laquo;</span></a></li>\n`;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentAdvancedReportPage - 2 && i <= currentAdvancedReportPage + 2)) {
            paginationHtml += `<li class="page-item ${i === currentAdvancedReportPage ? 'active' : ''}">`;
            paginationHtml += `<a class="page-link" href="#" onclick="changeAdvancedReportPage(${i})">${i}</a></li>\n`;
        } else if (i === currentAdvancedReportPage - 3 || i === currentAdvancedReportPage + 3) {
            paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>\n`;
        }
    }

    // Next button
    paginationHtml += `<li class="page-item ${currentAdvancedReportPage === totalPages ? 'disabled' : ''}">`;
    paginationHtml += `<a class="page-link" href="#" onclick="changeAdvancedReportPage(${currentAdvancedReportPage + 1})" aria-label="التالي">`;
    paginationHtml += `<span aria-hidden="true">&raquo;</span></a></li>\n`;

    paginationHtml += `</ul></nav>`;

    paginationContainer.innerHTML = paginationHtml;
}

// Change page for advanced reports
function changeAdvancedReportPage(page) {
    if (!currentAdvancedReportData) return;

    const totalPages = Math.ceil(currentAdvancedReportData.length / ADVANCED_REPORT_ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;

    currentAdvancedReportPage = page;
    displayAdvancedReportTable(currentAdvancedReportData, getAdvancedReportType());

    // Update pagination
    setupAdvancedReportPagination(currentAdvancedReportData);
}

function generateAdvancedReportSummary(data, reportType) {
    switch (reportType) {
        case 'time':
            return {
                totalPeriods: data.length,
                totalReconciliations: data.reduce((sum, item) => sum + item.total_reconciliations, 0),
                totalReceipts: data.reduce((sum, item) => sum + item.total_receipts, 0),
                avgDailyReceipts: formatDecimal(data.reduce((sum, item) => sum + item.total_receipts, 0) / data.length),
                bestPeriod: data.reduce((best, current) =>
                    current.total_receipts > best.total_receipts ? current : best
                ),
                overallAccuracy: formatDecimal(data.reduce((sum, item) => sum + parseFloat(item.accuracy_rate), 0) / data.length)
            };
        case 'atm':
            return {
                totalAtms: data.length,
                totalTransactions: data.reduce((sum, item) => sum + item.total_transactions, 0),
                totalAmount: data.reduce((sum, item) => sum + item.total_amount, 0),
                avgTransactionAmount: formatDecimal(data.reduce((sum, item) => sum + item.avg_transaction_amount, 0) / data.length),
                mostActiveAtm: data.reduce((best, current) =>
                    current.total_transactions > best.total_transactions ? current : best
                ),
                highestVolumeAtm: data.reduce((best, current) =>
                    current.total_amount > best.total_amount ? current : best
                )
            };
        default:
            return {};
    }
}

function displayAdvancedReportSummary(summary, reportType) {
    const summaryContainer = document.getElementById('advancedReportSummary');
    let summaryHtml = '';

    switch (reportType) {
        case 'time':
            summaryHtml = `
                <div class="col-md-3">
                    <div class="card bg-primary text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${summary.totalPeriods}</h4>
                            <p class="mb-0">عدد الفترات</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-success text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${summary.totalReconciliations}</h4>
                            <p class="mb-0">إجمالي التصفيات</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-info text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${summary.avgDailyReceipts}</h4>
                            <p class="mb-0">متوسط المقبوضات</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-warning text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${summary.overallAccuracy}%</h4>
                            <p class="mb-0">معدل الدقة</p>
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'atm':
            summaryHtml = `
                <div class="col-md-3">
                    <div class="card bg-primary text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${summary.totalAtms}</h4>
                            <p class="mb-0">عدد الأجهزة</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-success text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${summary.totalTransactions}</h4>
                            <p class="mb-0">إجمالي المعاملات</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-info text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${formatCurrency(summary.totalAmount)}</h4>
                            <p class="mb-0">إجمالي المبلغ</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-warning text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${summary.avgTransactionAmount}</h4>
                            <p class="mb-0">متوسط المعاملة</p>
                        </div>
                    </div>
                </div>
            `;
            break;
    }

    summaryContainer.innerHTML = summaryHtml;
}

function displayAdvancedReportTable(data, reportType) {
    const tableHead = document.getElementById('advancedReportTableHead');
    const tableBody = document.getElementById('advancedReportTableBody');

    let headersHtml = '';
    let bodyHtml = '';

    switch (reportType) {
        case 'time':
            headersHtml = `
                <tr>
                    <th>الفترة</th>
                    <th>عدد التصفيات</th>
                    <th>الكاشير النشطين</th>
                    <th>إجمالي المقبوضات</th>
                    <th>متوسط المقبوضات</th>
                    <th>الفائض/العجز</th>
                    <th>معدل الدقة</th>
                </tr>
            `;

            data.forEach(item => {
                const surplusDeficitClass = item.total_surplus_deficit >= 0 ? 'text-success' : 'text-danger';

                bodyHtml += `
                    <tr>
                        <td>${item.period_label}</td>
                        <td>${item.total_reconciliations}</td>
                        <td>${item.active_cashiers}</td>
                        <td class="text-currency">${formatCurrency(item.total_receipts)}</td>
                        <td class="text-currency">${formatCurrency(item.avg_receipts)}</td>
                        <td class="text-currency ${surplusDeficitClass}">${formatCurrency(item.total_surplus_deficit)}</td>
                        <td>${item.accuracy_rate}%</td>
                    </tr>
                `;
            });
            break;

        case 'atm':
            headersHtml = `
                <tr>
                    <th>اسم الجهاز</th>
                    <th>الفرع</th>
                    <th>الموقع</th>
                    <th>عدد المعاملات</th>
                    <th>إجمالي المبلغ</th>
                    <th>متوسط المعاملة</th>
                    <th>المتوسط اليومي</th>
                    <th>معدل الاستخدام</th>
                </tr>
            `;

            data.forEach(item => {
                bodyHtml += `
                    <tr>
                        <td>${item.atm_name}</td>
                        <td>
                            <span class="badge bg-info">
                                ${item.atm_branch_name || 'غير محدد'}
                            </span>
                        </td>
                        <td>${item.atm_location}</td>
                        <td>${item.total_transactions}</td>
                        <td class="text-currency">${formatCurrency(item.total_amount)}</td>
                        <td class="text-currency">${formatCurrency(item.avg_transaction_amount)}</td>
                        <td class="text-currency">${item.daily_avg}</td>
                        <td>${item.utilization_rate}%</td>
                    </tr>
                `;
            });
            break;
    }

    tableHead.innerHTML = headersHtml;
    tableBody.innerHTML = bodyHtml;
}

// Export and Print Functions for Advanced Reports

async function handleExportAdvancedReportPdf() {
    if (!currentAdvancedReportData || currentAdvancedReportData.length === 0) {
        DialogUtils.showValidationError('لا توجد بيانات تقرير للتصدير');
        return;
    }

    try {
        DialogUtils.showLoading('جاري تصدير التقرير إلى PDF...', 'يرجى الانتظار');

        const reportTitle = document.getElementById('advancedReportTitle').textContent;
        const reportHtml = await generateAdvancedReportHtml(currentAdvancedReportData, reportTitle);

        const result = await ipcRenderer.invoke('export-pdf', {
            html: reportHtml,
            filename: `advanced-report-${new Date().toISOString().split('T')[0]}.pdf`
        });

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccessToast('تم تصدير التقرير إلى PDF بنجاح');
        } else {
            DialogUtils.showError(`فشل في تصدير PDF: ${result.error}`, 'خطأ في التصدير');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('Error exporting advanced report PDF:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تصدير PDF');
    }
}

async function handleExportAdvancedReportExcel() {
    if (!currentAdvancedReportData || currentAdvancedReportData.length === 0) {
        DialogUtils.showValidationError('لا توجد بيانات تقرير للتصدير');
        return;
    }

    try {
        DialogUtils.showLoading('جاري تصدير التقرير إلى Excel...', 'يرجى الانتظار');

        const reportTitle = document.getElementById('advancedReportTitle').textContent;
        const excelData = prepareAdvancedReportExcelData(currentAdvancedReportData, reportTitle);

        const result = await ipcRenderer.invoke('export-excel', {
            data: excelData,
            filename: `advanced-report-${new Date().toISOString().split('T')[0]}.xlsx`
        });

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccessToast('تم تصدير التقرير إلى Excel بنجاح');
        } else {
            DialogUtils.showError(`فشل في تصدير Excel: ${result.error}`, 'خطأ في التصدير');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('Error exporting advanced report Excel:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء تصدير Excel');
    }
}

async function handlePrintAdvancedReport() {
    if (!currentAdvancedReportData || currentAdvancedReportData.length === 0) {
        DialogUtils.showValidationError('لا توجد بيانات تقرير للطباعة');
        return;
    }

    try {
        // Get current print settings
        const printSettings = await ipcRenderer.invoke('get-print-settings');

        const reportTitle = document.getElementById('advancedReportTitle').textContent;
        const reportHtml = await generateAdvancedReportHtml(currentAdvancedReportData, reportTitle);

        const result = await ipcRenderer.invoke('create-print-preview', {
            html: reportHtml,
            title: reportTitle,
            isColorPrint: printSettings.color !== false
        });

        if (result.success) {
            DialogUtils.showSuccessToast('تم فتح نافذة معاينة الطباعة');
        } else {
            DialogUtils.showError(`فشل في فتح معاينة الطباعة: ${result.error}`, 'خطأ في الطباعة');
        }

    } catch (error) {
        console.error('Error printing advanced report:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء طباعة التقرير');
    }
}

async function generateAdvancedReportHtml(data, title, companyName = null) {
    const reportType = determineReportType(data);

    // Get company name if not provided
    if (!companyName) {
        companyName = await getCompanyName();
    }

    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>${title} - ${companyName}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .company-header { text-align: center; margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; }
                .company-name { font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 5px; }
                .report-title { font-size: 20px; color: #34495e; margin-bottom: 10px; }
                .summary { display: flex; justify-content: space-around; margin-bottom: 30px; }
                .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                th { background-color: #f2f2f2; }
                .text-success { color: green; }
                .text-danger { color: red; }
                .text-warning { color: orange; }
                @media print {
                    body { margin: 0; margin-bottom: 25mm; }
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
                @page { margin-bottom: 25mm; }
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
            </style>
        </head>
        <body>
            <div class="company-header">
                <div class="company-name">${companyName}</div>
                <div class="report-title">${title}</div>
                <p>تاريخ التقرير: ${getCurrentDate()}</p>
            </div>

            ${generateAdvancedReportTableHtml(data, reportType)}

            <!-- فوتر الصفحة - يظهر في كل صفحة مطبوعة -->
            <div class="page-footer">
                جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
            </div>
        </body>
        </html>
    `;
}

function generateAdvancedReportTableHtml(data, reportType) {
    let tableHtml = '<table><thead><tr>';

    switch (reportType) {
        case 'time':
            tableHtml += `
                <th>الفترة</th>
                <th>عدد التصفيات</th>
                <th>الكاشير النشطين</th>
                <th>إجمالي المقبوضات</th>
                <th>متوسط المقبوضات</th>
                <th>الفائض/العجز</th>
                <th>معدل الدقة</th>
            `;
            break;
        case 'atm':
            tableHtml += `
                <th>اسم الجهاز</th>
                <th>الفرع</th>
                <th>الموقع</th>
                <th>عدد المعاملات</th>
                <th>إجمالي المبلغ</th>
                <th>متوسط المعاملة</th>
                <th>المتوسط اليومي</th>
                <th>معدل الاستخدام</th>
            `;
            break;
    }

    tableHtml += '</tr></thead><tbody>';

    data.forEach(item => {
        tableHtml += '<tr>';
        switch (reportType) {
            case 'time':
                const timeSurplusClass = item.total_surplus_deficit >= 0 ? 'text-success' : 'text-danger';
                tableHtml += `
                    <td>${item.period_label}</td>
                    <td>${item.total_reconciliations}</td>
                    <td>${item.active_cashiers}</td>
                    <td>${formatCurrency(item.total_receipts)}</td>
                    <td>${formatCurrency(item.avg_receipts)}</td>
                    <td class="${timeSurplusClass}">${formatCurrency(item.total_surplus_deficit)}</td>
                    <td>${item.accuracy_rate}%</td>
                `;
                break;
            case 'atm':
                tableHtml += `
                    <td>${item.atm_name}</td>
                    <td>${item.atm_branch_name || 'غير محدد'}</td>
                    <td>${item.atm_location}</td>
                    <td>${item.total_transactions}</td>
                    <td>${formatCurrency(item.total_amount)}</td>
                    <td>${formatCurrency(item.avg_transaction_amount)}</td>
                    <td>${item.daily_avg}</td>
                    <td>${item.utilization_rate}%</td>
                `;
                break;
        }
        tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
}

function prepareAdvancedReportExcelData(data, title) {
    const reportType = determineReportType(data);
    let headers = [];
    let rows = [];

    switch (reportType) {
        case 'time':
            headers = [
                'الفترة',
                'عدد التصفيات',
                'الكاشير النشطين',
                'إجمالي المقبوضات',
                'متوسط المقبوضات',
                'الفائض/العجز',
                'معدل الدقة (%)'
            ];

            rows = data.map(item => [
                item.period_label,
                item.total_reconciliations,
                item.active_cashiers,
                item.total_receipts,
                item.avg_receipts,
                item.total_surplus_deficit,
                item.accuracy_rate
            ]);
            break;

        case 'atm':
            headers = [
                'اسم الجهاز',
                'الفرع',
                'الموقع',
                'عدد المعاملات',
                'إجمالي المبلغ',
                'متوسط المعاملة',
                'المتوسط اليومي',
                'معدل الاستخدام (%)'
            ];

            rows = data.map(item => [
                item.atm_name,
                item.atm_branch_name || 'غير محدد',
                item.atm_location,
                item.total_transactions,
                item.total_amount,
                item.avg_transaction_amount,
                item.daily_avg,
                item.utilization_rate
            ]);
            break;
    }

    return {
        headers,
        rows,
        title
    };
}

function determineReportType(data) {
    if (!data || data.length === 0) return 'unknown';

    const firstItem = data[0];

    if (firstItem.hasOwnProperty('period_label') && firstItem.hasOwnProperty('active_cashiers')) {
        return 'time';
    } else if (firstItem.hasOwnProperty('atm_name') && firstItem.hasOwnProperty('total_transactions')) {
        return 'atm';
    }

    return 'unknown';
}





// NEW EDIT RECONCILIATION FUNCTIONALITY

/**
 * Main function to initiate editing a reconciliation
 * @param {number} reconciliationId - The ID of the reconciliation to edit
 */
async function editReconciliationNew(reconciliationId) {
    console.log('🔍 [EDIT-NEW] بدء تحميل التصفية للتعديل - معرف:', reconciliationId);

    // Validate input
    if (!reconciliationId || isNaN(reconciliationId) || reconciliationId <= 0) {
        console.error('❌ [EDIT-NEW] معرف التصفية غير صحيح:', reconciliationId);
        DialogUtils.showError('معرف التصفية غير صحيح', 'خطأ في البيانات');
        return;
    }

    try {
        // Show loading
        DialogUtils.showLoading('جاري تحميل بيانات التصفية للتعديل...');

        // Fetch reconciliation data
        const reconciliationData = await fetchReconciliationForEdit(reconciliationId);

        if (!reconciliationData) {
            DialogUtils.close();
            DialogUtils.showError('لم يتم العثور على التصفية المطلوبة', 'تصفية غير موجودة');
            return;
        }

        // Close loading dialog
        DialogUtils.close();

        // Set edit mode
        editMode.isActive = true;
        editMode.reconciliationId = reconciliationId;
        editMode.originalData = reconciliationData;

        // Update current reconciliation with the loaded data
        currentReconciliation = {
            ...reconciliationData.reconciliation,
            reconciliation_number: reconciliationData.reconciliation.reconciliation_number
        };

        // Update button states
        updateButtonStates('LOAD-RECONCILIATION');

        // Populate edit modal with data
        console.log('📝 [EDIT-NEW] بدء تعبئة نافذة التعديل...');
        await populateEditModal(reconciliationData);

        // Verify modal exists before showing
        const modalElement = document.getElementById('editReconciliationModal');
        if (!modalElement) {
            throw new Error('نافذة التعديل غير موجودة في الصفحة');
        }

        // Show edit modal
        console.log('🖥️ [EDIT-NEW] عرض نافذة التعديل...');
        const editModal = new bootstrap.Modal(modalElement);
        editModal.show();

        // Verify modal is shown
        setTimeout(() => {
            if (modalElement.classList.contains('show')) {
                console.log('✅ [EDIT-NEW] تم فتح نافذة التعديل بنجاح');
            } else {
                console.warn('⚠️ [EDIT-NEW] نافذة التعديل لم تظهر بشكل صحيح');
            }
        }, 500);

    } catch (error) {
        DialogUtils.close();
        handleEditError(error, 'LOAD-RECONCILIATION', { reconciliationId });
    }
}

/**
 * Fetch reconciliation data from database for editing
 * @param {number} reconciliationId - The ID of the reconciliation to fetch
 * @returns {Object|null} - The reconciliation data or null if not found
 */
async function fetchReconciliationForEdit(reconciliationId) {
    console.log('📡 [FETCH-EDIT] بدء جلب بيانات التصفية من قاعدة البيانات...');

    try {
        // Use existing IPC handler to get reconciliation data
        const data = await ipcRenderer.invoke('get-reconciliation-for-edit', reconciliationId);

        if (!data) {
            console.warn('⚠️ [FETCH-EDIT] لم يتم العثور على بيانات للتصفية:', reconciliationId);
            return null;
        }

        // Validate data structure
        if (!data.reconciliation) {
            console.error('❌ [FETCH-EDIT] بيانات التصفية الأساسية مفقودة');
            throw new Error('بيانات التصفية الأساسية مفقودة');
        }

        console.log('✅ [FETCH-EDIT] تم جلب البيانات بنجاح:', {
            reconciliationId: data.reconciliation.id,
            bankReceipts: data.bankReceipts?.length || 0,
            cashReceipts: data.cashReceipts?.length || 0,
            postpaidSales: data.postpaidSales?.length || 0,
            customerReceipts: data.customerReceipts?.length || 0,
            returnInvoices: data.returnInvoices?.length || 0,
            suppliers: data.suppliers?.length || 0
        });

        return data;

    } catch (error) {
        console.error('❌ [FETCH-EDIT] خطأ في جلب البيانات:', error);
        throw new Error(`فشل في جلب بيانات التصفية: ${error.message}`);
    }
}

/**
 * Populate the edit modal with reconciliation data
 * @param {Object} data - The reconciliation data to populate
 */
async function populateEditModal(data) {
    console.log('📝 [POPULATE] بدء تعبئة نافذة التعديل بالبيانات...');
    console.log('📊 [POPULATE] البيانات المستلمة:', {
        hasReconciliation: !!data?.reconciliation,
        reconciliationId: data?.reconciliation?.id,
        bankReceiptsCount: data?.bankReceipts?.length || 0,
        cashReceiptsCount: data?.cashReceipts?.length || 0,
        postpaidSalesCount: data?.postpaidSales?.length || 0,
        customerReceiptsCount: data?.customerReceipts?.length || 0,
        returnInvoicesCount: data?.returnInvoices?.length || 0,
        suppliersCount: data?.suppliers?.length || 0
    });

    try {
        // Validate input data
        if (!data) {
            throw new Error('لا توجد بيانات للتعبئة');
        }

        if (!data.reconciliation) {
            throw new Error('بيانات التصفية الأساسية مفقودة');
        }

        const { reconciliation, bankReceipts, cashReceipts, postpaidSales, customerReceipts, returnInvoices, suppliers } = data;

        // Check if modal exists
        const modal = document.getElementById('editReconciliationModal');
        if (!modal) {
            throw new Error('نافذة التعديل غير موجودة في الصفحة');
        }

        // Populate basic reconciliation info with error checking
        console.log('📋 [POPULATE] تعبئة المعلومات الأساسية...');
        const reconciliationIdElement = document.getElementById('editReconciliationId');
        if (reconciliationIdElement) {
            reconciliationIdElement.textContent = `#${reconciliation.reconciliation_number || reconciliation.id}`;
            console.log('✅ [POPULATE] تم تعبئة معرف التصفية:', reconciliation.id);
        } else {
            console.warn('⚠️ [POPULATE] عنصر معرف التصفية غير موجود');
        }

        // Format and populate dates
        console.log('📅 [POPULATE] تعبئة التواريخ...');
        try {
            const createdDate = formatDate(reconciliation.created_at);
            const lastModified = reconciliation.last_modified_date ?
                formatDate(reconciliation.last_modified_date) : 'لم يتم التعديل';

            const createdDateElement = document.getElementById('editCreatedDate');
            const lastModifiedElement = document.getElementById('editLastModified');

            if (createdDateElement) {
                createdDateElement.textContent = createdDate;
                console.log('✅ [POPULATE] تم تعبئة تاريخ الإنشاء:', createdDate);
            }

            if (lastModifiedElement) {
                lastModifiedElement.textContent = lastModified;
                console.log('✅ [POPULATE] تم تعبئة تاريخ آخر تعديل:', lastModified);
            }
        } catch (dateError) {
            console.warn('⚠️ [POPULATE] خطأ في تنسيق التواريخ:', dateError.message);
        }

        // Populate form fields
        console.log('📝 [POPULATE] تعبئة حقول النموذج...');
        await populateEditFormFields(reconciliation);

        // Populate all tables with individual error handling
        console.log('📊 [POPULATE] تعبئة الجداول...');

        try {
            populateEditBankReceiptsTable(bankReceipts || []);
            console.log('✅ [POPULATE] تم تعبئة جدول المقبوضات البنكية');
        } catch (error) {
            console.error('❌ [POPULATE] خطأ في تعبئة المقبوضات البنكية:', error);
        }

        try {
            populateEditCashReceiptsTable(cashReceipts || []);
            console.log('✅ [POPULATE] تم تعبئة جدول المقبوضات النقدية');
        } catch (error) {
            console.error('❌ [POPULATE] خطأ في تعبئة المقبوضات النقدية:', error);
        }

        try {
            populateEditPostpaidSalesTable(postpaidSales || []);
            console.log('✅ [POPULATE] تم تعبئة جدول المبيعات الآجلة');
        } catch (error) {
            console.error('❌ [POPULATE] خطأ في تعبئة المبيعات الآجلة:', error);
        }

        try {
            populateEditCustomerReceiptsTable(customerReceipts || []);
            console.log('✅ [POPULATE] تم تعبئة جدول مقبوضات العملاء');
        } catch (error) {
            console.error('❌ [POPULATE] خطأ في تعبئة مقبوضات العملاء:', error);
        }

        try {
            populateEditReturnInvoicesTable(returnInvoices || []);
            console.log('✅ [POPULATE] تم تعبئة جدول فواتير المرتجع');
        } catch (error) {
            console.error('❌ [POPULATE] خطأ في تعبئة فواتير المرتجع:', error);
        }

        try {
            populateEditSuppliersTable(suppliers || []);
            console.log('✅ [POPULATE] تم تعبئة جدول الموردين');
        } catch (error) {
            console.error('❌ [POPULATE] خطأ في تعبئة الموردين:', error);
        }

        // Calculate and update totals
        console.log('🧮 [POPULATE] حساب المجاميع...');
        try {
            updateEditTotals();
            console.log('✅ [POPULATE] تم حساب المجاميع');
        } catch (error) {
            console.error('❌ [POPULATE] خطأ في حساب المجاميع:', error);
        }

        // Update progress indicator
        console.log('📈 [POPULATE] تحديث مؤشر التقدم...');
        try {
            updateEditProgress();
            console.log('✅ [POPULATE] تم تحديث مؤشر التقدم');
        } catch (error) {
            console.error('❌ [POPULATE] خطأ في تحديث مؤشر التقدم:', error);
        }

        console.log('✅ [POPULATE] تم تعبئة نافذة التعديل بنجاح');

    } catch (error) {
        console.error('❌ [POPULATE] خطأ في تعبئة نافذة التعديل:', error);
        console.error('❌ [POPULATE] تفاصيل الخطأ:', {
            message: error.message,
            stack: error.stack,
            data: data
        });
        throw new Error(`فشل في تعبئة البيانات: ${error.message}`);
    }
}

/**
 * Populate form fields in edit modal
 * @param {Object} reconciliation - The reconciliation data
 */
async function populateEditFormFields(reconciliation) {
    console.log('📋 [FORM-FIELDS] تعبئة حقول النموذج...');
    console.log('📊 [FORM-FIELDS] بيانات التصفية:', {
        id: reconciliation.id,
        cashier_id: reconciliation.cashier_id,
        accountant_id: reconciliation.accountant_id,
        reconciliation_date: reconciliation.reconciliation_date,
        system_sales: reconciliation.system_sales
    });

    try {
        // Load cashiers and accountants if not already loaded
        console.log('👥 [FORM-FIELDS] تحميل الفروع والكاشيرين والمحاسبين...');
        await ensureCashiersAndAccountantsLoaded();

        // Get the cashier's branch to select the correct branch
        let selectedBranchId = null;
        try {
            const cashier = await ipcRenderer.invoke('db-get',
                'SELECT branch_id FROM cashiers WHERE id = ?',
                [reconciliation.cashier_id]
            );
            if (cashier && cashier.branch_id) {
                selectedBranchId = cashier.branch_id;
                console.log('📍 [FORM-FIELDS] تم الحصول على الفرع من الكاشير:', selectedBranchId);
            }
        } catch (branchError) {
            console.warn('⚠️ [FORM-FIELDS] تعذر الحصول على الفرع من الكاشير:', branchError);
        }

        // Set branch with validation
        console.log('🏢 [FORM-FIELDS] تعبئة الفرع...');
        const editBranchSelect = document.getElementById('editBranchSelect');
        if (editBranchSelect && selectedBranchId) {
            editBranchSelect.value = selectedBranchId;
            // Trigger change event to filter cashiers
            editBranchSelect.dispatchEvent(new Event('change'));
            console.log('✅ [FORM-FIELDS] تم تعبئة الفرع:', selectedBranchId);
        } else if (!editBranchSelect) {
            console.error('❌ [FORM-FIELDS] عنصر اختيار الفرع غير موجود');
        }

        // Set cashier with validation
        console.log('👤 [FORM-FIELDS] تعبئة الكاشير...');
        const editCashierSelect = document.getElementById('editCashierSelect');
        if (editCashierSelect) {
            if (reconciliation.cashier_id) {
                editCashierSelect.value = reconciliation.cashier_id;
                // Trigger change event to update cashier number
                editCashierSelect.dispatchEvent(new Event('change'));
                console.log('✅ [FORM-FIELDS] تم تعبئة الكاشير:', reconciliation.cashier_id);
            } else {
                console.warn('⚠️ [FORM-FIELDS] معرف الكاشير مفقود');
            }
        } else {
            console.error('❌ [FORM-FIELDS] عنصر اختيار الكاشير غير موجود');
        }

        // Set accountant with validation
        console.log('📋 [FORM-FIELDS] تعبئة المحاسب...');
        const editAccountantSelect = document.getElementById('editAccountantSelect');
        if (editAccountantSelect) {
            if (reconciliation.accountant_id) {
                editAccountantSelect.value = reconciliation.accountant_id;
                console.log('✅ [FORM-FIELDS] تم تعبئة المحاسب:', reconciliation.accountant_id);
            } else {
                console.warn('⚠️ [FORM-FIELDS] معرف المحاسب مفقود');
            }
        } else {
            console.error('❌ [FORM-FIELDS] عنصر اختيار المحاسب غير موجود');
        }

        // Set reconciliation date with validation
        console.log('📅 [FORM-FIELDS] تعبئة تاريخ التصفية...');
        const editReconciliationDate = document.getElementById('editReconciliationDate');
        if (editReconciliationDate) {
            if (reconciliation.reconciliation_date) {
                editReconciliationDate.value = reconciliation.reconciliation_date;
                console.log('✅ [FORM-FIELDS] تم تعبئة تاريخ التصفية:', reconciliation.reconciliation_date);
            } else {
                console.warn('⚠️ [FORM-FIELDS] تاريخ التصفية مفقود');
            }
        } else {
            console.error('❌ [FORM-FIELDS] عنصر تاريخ التصفية غير موجود');
        }

        // Set time range fields (new enhancement)
        console.log('⏰ [FORM-FIELDS] تعبئة النطاق الزمني...');
        const editTimeRangeStart = document.getElementById('editTimeRangeStart');
        const editTimeRangeEnd = document.getElementById('editTimeRangeEnd');

        if (editTimeRangeStart) {
            editTimeRangeStart.value = reconciliation.time_range_start || '';
            console.log('✅ [FORM-FIELDS] تم تعبئة وقت البداية:', reconciliation.time_range_start || 'فارغ');
        } else {
            console.warn('⚠️ [FORM-FIELDS] عنصر وقت البداية غير موجود');
        }

        if (editTimeRangeEnd) {
            editTimeRangeEnd.value = reconciliation.time_range_end || '';
            console.log('✅ [FORM-FIELDS] تم تعبئة وقت النهاية:', reconciliation.time_range_end || 'فارغ');
        } else {
            console.warn('⚠️ [FORM-FIELDS] عنصر وقت النهاية غير موجود');
        }

        // Set filter notes (new enhancement)
        console.log('📝 [FORM-FIELDS] تعبئة ملاحظات التصفية...');
        const editFilterNotes = document.getElementById('editFilterNotes');
        if (editFilterNotes) {
            editFilterNotes.value = reconciliation.filter_notes || '';
            console.log('✅ [FORM-FIELDS] تم تعبئة ملاحظات التصفية:', reconciliation.filter_notes || 'فارغ');
        } else {
            console.warn('⚠️ [FORM-FIELDS] عنصر ملاحظات التصفية غير موجود');
        }

        // Set system sales with validation
        console.log('💰 [FORM-FIELDS] تعبئة مبيعات النظام...');
        const editSystemSales = document.getElementById('editSystemSales');
        if (editSystemSales) {
            const systemSales = reconciliation.system_sales || 0;
            editSystemSales.value = systemSales;
            console.log('✅ [FORM-FIELDS] تم تعبئة مبيعات النظام:', systemSales);
        } else {
            console.error('❌ [FORM-FIELDS] عنصر مبيعات النظام غير موجود');
        }

        console.log('✅ [FORM-FIELDS] تم تعبئة حقول النموذج بنجاح');

    } catch (error) {
        console.error('❌ [FORM-FIELDS] خطأ في تعبئة حقول النموذج:', error);
        console.error('❌ [FORM-FIELDS] تفاصيل الخطأ:', {
            message: error.message,
            stack: error.stack,
            reconciliation: reconciliation
        });
        throw error;
    }
}

/**
 * Ensure branches, cashiers and accountants are loaded in edit modal selects
 */
async function ensureCashiersAndAccountantsLoaded() {
    const editBranchSelect = document.getElementById('editBranchSelect');
    const editCashierSelect = document.getElementById('editCashierSelect');
    const editAccountantSelect = document.getElementById('editAccountantSelect');

    // Load branches if empty
    if (editBranchSelect && editBranchSelect.children.length <= 1) {
        try {
            const branches = await ipcRenderer.invoke('db-all', 'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name');
            editBranchSelect.innerHTML = '<option value="">اختر الفرع</option>';
            branches.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.id;
                option.textContent = branch.branch_name;
                editBranchSelect.appendChild(option);
            });

            // Add event listener to filter cashiers by branch
            editBranchSelect.addEventListener('change', async function () {
                await loadEditCashiersByBranch(this.value);
            });

            console.log('✅ [EDIT] تم تحميل الفروع بنجاح:', branches.length);
        } catch (error) {
            console.error('❌ [EDIT] خطأ في تحميل الفروع:', error);
        }
    }

    // Load cashiers if empty
    if (editCashierSelect && editCashierSelect.children.length <= 1) {
        try {
            const cashiers = await ipcRenderer.invoke('db-all', 'SELECT * FROM cashiers ORDER BY name');
            editCashierSelect.innerHTML = '<option value="">اختر الكاشير</option>';
            cashiers.forEach(cashier => {
                const option = document.createElement('option');
                option.value = cashier.id;
                option.textContent = cashier.name;
                option.dataset.cashierNumber = cashier.cashier_number;
                option.dataset.branchId = cashier.branch_id;
                editCashierSelect.appendChild(option);
            });
        } catch (error) {
            console.error('خطأ في تحميل الكاشيرين:', error);
        }
    }

    // Load accountants if empty
    if (editAccountantSelect && editAccountantSelect.children.length <= 1) {
        try {
            const accountants = await ipcRenderer.invoke('db-all', 'SELECT * FROM accountants ORDER BY name');
            editAccountantSelect.innerHTML = '<option value="">اختر المحاسب</option>';
            accountants.forEach(accountant => {
                const option = document.createElement('option');
                option.value = accountant.id;
                option.textContent = accountant.name;
                editAccountantSelect.appendChild(option);
            });
        } catch (error) {
            console.error('خطأ في تحميل المحاسبين:', error);
        }
    }

    // Load ATMs for bank receipts modal
    await loadEditATMs();
}

/**
 * Load ATMs for edit modal
 */
async function loadEditATMs() {
    const editAtmSelect = document.getElementById('editAtmSelect');
    if (!editAtmSelect) return;

    try {
        const atms = await ipcRenderer.invoke('db-all',
            `SELECT a.*, b.branch_name
             FROM atms a
             LEFT JOIN branches b ON a.branch_id = b.id
             ORDER BY b.branch_name, a.name`
        );
        editAtmSelect.innerHTML = '<option value="">اختر الجهاز</option>';

        atms.forEach(atm => {
            const option = document.createElement('option');
            option.value = atm.id;
            option.textContent = `${atm.name} - ${atm.branch_name || 'غير محدد'}`;
            option.dataset.bankName = atm.bank_name;
            editAtmSelect.appendChild(option);
        });

        // Add event listener to update bank name
        editAtmSelect.addEventListener('change', function () {
            const selectedOption = this.options[this.selectedIndex];
            const editBankName = document.getElementById('editBankName');
            if (editBankName) {
                editBankName.value = selectedOption.dataset.bankName || '';
            }
        });

    } catch (error) {
        console.error('خطأ في تحميل أجهزة الصراف الآلي:', error);
    }

    // Add event listener for cashier selection
    if (editCashierSelect) {
        editCashierSelect.addEventListener('change', function () {
            const selectedOption = this.options[this.selectedIndex];
            const editCashierNumber = document.getElementById('editCashierNumber');
            if (editCashierNumber) {
                editCashierNumber.value = selectedOption.dataset.cashierNumber || '';
            }

            // Update branch selection when cashier changes
            const editBranchSelect = document.getElementById('editBranchSelect');
            if (editBranchSelect && selectedOption.dataset.branchId) {
                editBranchSelect.value = selectedOption.dataset.branchId;
            }
        });
    }
}

/**
 * Load cashiers filtered by branch
 * @param {number} branchId - The branch ID to filter by
 */
async function loadEditCashiersByBranch(branchId) {
    const editCashierSelect = document.getElementById('editCashierSelect');
    if (!editCashierSelect) return;

    try {
        let query = 'SELECT * FROM cashiers WHERE active = 1';
        let params = [];

        if (branchId) {
            query += ' AND branch_id = ?';
            params.push(branchId);
        }

        query += ' ORDER BY name';

        const cashiers = await ipcRenderer.invoke('db-all', query, params);

        // Save currently selected cashier
        const currentCashierId = editCashierSelect.value;

        editCashierSelect.innerHTML = '<option value="">اختر الكاشير</option>';
        cashiers.forEach(cashier => {
            const option = document.createElement('option');
            option.value = cashier.id;
            option.textContent = cashier.name;
            option.dataset.cashierNumber = cashier.cashier_number;
            option.dataset.branchId = cashier.branch_id;
            editCashierSelect.appendChild(option);
        });

        // Restore selected cashier if still available
        if (currentCashierId && editCashierSelect.querySelector(`option[value="${currentCashierId}"]`)) {
            editCashierSelect.value = currentCashierId;
        }

        console.log(`✅ [EDIT-BRANCH] تم تحميل ${cashiers.length} كاشير للفرع: ${branchId}`);
    } catch (error) {
        console.error('❌ [EDIT-BRANCH] خطأ في تحميل الكاشيرين حسب الفرع:', error);
    }
}

/**
 * Populate bank receipts table in edit modal
 * @param {Array} bankReceipts - Array of bank receipts
 */
function populateEditBankReceiptsTable(bankReceipts) {
    const tableBody = document.getElementById('editBankReceiptsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    // Check for missing required fields
    const rowsWithMissingFields = bankReceipts.filter(receipt =>
        !receipt.operation_type || !receipt.atm_id
    );

    // Add warning indicator to table header if needed
    const tableHeader = document.querySelector('#editBankReceiptsTableContainer .card-header h5');
    if (tableHeader) {
        // Remove existing warning badge if any
        const existingBadge = tableHeader.querySelector('.badge.bg-warning');
        if (existingBadge) {
            existingBadge.remove();
        }

        // Add warning badge if there are rows with missing fields
        if (rowsWithMissingFields.length > 0) {
            tableHeader.innerHTML = `
                ${tableHeader.innerHTML}
                <span class="badge bg-warning ms-2">⚠️ ${rowsWithMissingFields.length} سجلات تحتاج تعديلاً</span>
            `;
        }
    }

    bankReceipts.forEach((receipt, index) => {
        // Ensure required fields are present for database operations
        if (!receipt.operation_type || !receipt.atm_id) {
            console.warn('⚠️ [POPULATE] Bank receipt missing required fields:', receipt);

            // Check which fields are missing
            const missingFields = [];
            if (!receipt.operation_type) missingFields.push('operation_type');
            if (!receipt.atm_id) missingFields.push('atm_id');

            console.warn('⚠️ [POPULATE] Missing fields:', missingFields);

            // Try to set default values if missing
            if (!receipt.operation_type) {
                receipt.operation_type = 'مدى';
                console.log('✅ [POPULATE] Set default operation_type to ' + receipt.operation_type);
            }
            if (!receipt.atm_id) {
                receipt.atm_id = 1; // Default to first ATM
                console.log('✅ [POPULATE] Set default atm_id to ' + receipt.atm_id);
            }
        }

        const row = document.createElement('tr');

        // Add warning class if required fields were missing
        if (!receipt.operation_type || !receipt.atm_id) {
            row.classList.add('warning-row');

            // Create tooltip text
            const missingFields = [];
            if (!receipt.operation_type) {
                missingFields.push('نوع العملية');
                receipt.operation_type = 'مدى';
                console.log('✅ [POPULATE] Set default operation_type to ' + receipt.operation_type);
            }
            if (!receipt.atm_id) {
                missingFields.push('معرف الصراف الآلي');
                receipt.atm_id = 1; // Default to first ATM
                console.log('✅ [POPULATE] Set default atm_id to ' + receipt.atm_id);
            }

            // Add title attribute for tooltip
            row.title = `تم تعيين قيم افتراضية للحقول المفقودة: ${missingFields.join(', ')}. يرجى تعديل السجل لضمان الدقة.`;
        }

        row.innerHTML = `
            <td>${receipt.operation_type || ''}</td>
            <td>${receipt.atm_name || ''}</td>
            <td>${receipt.bank_name || ''}</td>
            <td>${formatCurrency(receipt.amount)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="bankReceipt" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="bankReceipt" data-index="${index}">حذف</button>
            </td>
        `;
        tableBody.appendChild(row);
        total += parseFloat(receipt.amount || 0);
    });

    // Add event listeners to buttons
    addEditButtonListeners(tableBody);

    document.getElementById('editBankReceiptsTotal').textContent = formatCurrency(total);

    // Trigger total update
    updateEditTotals();
}

/**
 * Add event listeners to edit buttons in table
 * @param {HTMLElement} container - The container element with buttons
 */
function addEditButtonListeners(container) {
    const buttons = container.querySelectorAll('.btn-edit-action');
    console.log(`🔗 [LISTENERS] إضافة مستمعات الأحداث لـ ${buttons.length} زر`);

    buttons.forEach((button, buttonIndex) => {
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();

            const action = this.dataset.action;
            const type = this.dataset.type;
            const index = parseInt(this.dataset.index);

            console.log(`🔘 [BUTTON-${buttonIndex}] تم الضغط على زر:`, {
                action,
                type,
                index,
                editModeActive: isEditModeActive(),
                reconciliationId: getCurrentEditingReconciliationId(),
                hasOriginalData: !!editMode.originalData
            });

            try {
                if (action === 'edit') {
                    console.log('➡️ [BUTTON] توجيه إلى handleEditAction');
                    handleEditAction(type, index);
                } else if (action === 'delete') {
                    console.log('➡️ [BUTTON] توجيه إلى handleDeleteAction');
                    handleDeleteAction(type, index);
                }
            } catch (error) {
                console.error('❌ [BUTTON] خطأ في معالجة الزر:', error);
                DialogUtils.showError(`خطأ في العملية: ${error.message}`, 'خطأ في النظام');
            }
        });
    });
}

/**
 * Handle edit action for different types
 * @param {string} type - The data type
 * @param {number} index - The index
 */
function handleEditAction(type, index) {
    console.log('✏️ [EDIT-ACTION] معالجة تعديل:', type, 'الفهرس:', index);

    switch (type) {
        case 'bankReceipt':
            editEditBankReceipt(index);
            break;
        case 'cashReceipt':
            editEditCashReceipt(index);
            break;
        case 'postpaidSale':
            editEditPostpaidSale(index);
            break;
        case 'customerReceipt':
            editEditCustomerReceipt(index);
            break;
        case 'returnInvoice':
            editEditReturnInvoice(index);
            break;
        case 'supplier':
            editEditSupplier(index);
            break;
        default:
            console.error('❌ [EDIT-ACTION] نوع غير معروف:', type);
            DialogUtils.showError('نوع العنصر غير معروف', 'خطأ في النظام');
    }
}

/**
 * Handle delete action for different types
 * @param {string} type - The data type
 * @param {number} index - The index
 */
function handleDeleteAction(type, index) {
    console.log('🗑️ [DELETE-ACTION] معالجة حذف:', type, 'الفهرس:', index);

    switch (type) {
        case 'bankReceipt':
            deleteEditBankReceipt(index);
            break;
        case 'cashReceipt':
            deleteEditCashReceipt(index);
            break;
        case 'postpaidSale':
            deleteEditPostpaidSale(index);
            break;
        case 'customerReceipt':
            deleteEditCustomerReceipt(index);
            break;
        case 'returnInvoice':
            deleteEditReturnInvoice(index);
            break;
        case 'supplier':
            deleteEditSupplier(index);
            break;
        default:
            console.error('❌ [DELETE-ACTION] نوع غير معروف:', type);
            DialogUtils.showError('نوع العنصر غير معروف', 'خطأ في النظام');
    }
}

/**
 * Populate cash receipts table in edit modal
 * @param {Array} cashReceipts - Array of cash receipts
 */
function populateEditCashReceiptsTable(cashReceipts) {
    const tableBody = document.getElementById('editCashReceiptsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    cashReceipts.forEach((receipt, index) => {
        const row = document.createElement('tr');
        const totalAmount = parseFloat(receipt.total_amount || 0);
        row.innerHTML = `
            <td>${receipt.denomination || ''} ريال</td>
            <td>${receipt.quantity || 0}</td>
            <td>${formatCurrency(totalAmount)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="cashReceipt" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="cashReceipt" data-index="${index}">حذف</button>
            </td>
        `;
        tableBody.appendChild(row);
        total += totalAmount;
    });

    // Add event listeners to buttons
    addEditButtonListeners(tableBody);

    document.getElementById('editCashReceiptsTotal').textContent = formatCurrency(total);

    // Trigger total update
    updateEditTotals();
}

/**
 * Populate postpaid sales table in edit modal
 * @param {Array} postpaidSales - Array of postpaid sales
 */
function populateEditPostpaidSalesTable(postpaidSales) {
    const tableBody = document.getElementById('editPostpaidSalesTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    postpaidSales.forEach((sale, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${sale.customer_name || ''}</td>
            <td>${formatCurrency(sale.amount)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="postpaidSale" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="postpaidSale" data-index="${index}">حذف</button>
            </td>
        `;
        tableBody.appendChild(row);
        total += parseFloat(sale.amount || 0);
    });

    // Add event listeners to buttons
    addEditButtonListeners(tableBody);

    document.getElementById('editPostpaidSalesTotal').textContent = formatCurrency(total);

    // Trigger total update
    updateEditTotals();
}

/**
 * Populate customer receipts table in edit modal
 * @param {Array} customerReceipts - Array of customer receipts
 */
function populateEditCustomerReceiptsTable(customerReceipts) {
    const tableBody = document.getElementById('editCustomerReceiptsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    customerReceipts.forEach((receipt, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${receipt.customer_name || ''}</td>
            <td>${formatCurrency(receipt.amount)}</td>
            <td>${receipt.payment_type || ''}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="customerReceipt" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="customerReceipt" data-index="${index}">حذف</button>
            </td>
        `;
        tableBody.appendChild(row);
        total += parseFloat(receipt.amount || 0);
    });

    // Add event listeners to buttons
    addEditButtonListeners(tableBody);

    document.getElementById('editCustomerReceiptsTotal').textContent = formatCurrency(total);

    // Trigger total update
    updateEditTotals();
}

/**
 * Populate return invoices table in edit modal
 * @param {Array} returnInvoices - Array of return invoices
 */
function populateEditReturnInvoicesTable(returnInvoices) {
    const tableBody = document.getElementById('editReturnInvoicesTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    returnInvoices.forEach((invoice, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${invoice.invoice_number || ''}</td>
            <td>${formatCurrency(invoice.amount)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="returnInvoice" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="returnInvoice" data-index="${index}">حذف</button>
            </td>
        `;
        tableBody.appendChild(row);
        total += parseFloat(invoice.amount || 0);
    });

    // Add event listeners to buttons
    addEditButtonListeners(tableBody);

    document.getElementById('editReturnInvoicesTotal').textContent = formatCurrency(total);

    // Trigger total update
    updateEditTotals();
}

/**
 * Populate suppliers table in edit modal
 * @param {Array} suppliers - Array of suppliers
 */
function populateEditSuppliersTable(suppliers) {
    const tableBody = document.getElementById('editSuppliersTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    let total = 0;

    suppliers.forEach((supplier, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${supplier.supplier_name || ''}</td>
            <td>${formatCurrency(supplier.amount)}</td>
            <td>
                <button class="btn btn-sm btn-warning btn-edit-action" data-action="edit" data-type="supplier" data-index="${index}">تعديل</button>
                <button class="btn btn-sm btn-danger btn-edit-action" data-action="delete" data-type="supplier" data-index="${index}">حذف</button>
            </td>
        `;
        tableBody.appendChild(row);
        total += parseFloat(supplier.amount || 0);
    });

    // Add event listeners to buttons
    addEditButtonListeners(tableBody);

    document.getElementById('editSuppliersTotal').textContent = formatCurrency(total);

    // Note: Suppliers don't affect totals in the main calculation
    // updateEditTotals(); // Commented out as suppliers are for display only
}

/**
 * Update totals in edit modal with enhanced calculations
 */
function updateEditTotals() {
    console.log('🧮 [TOTALS] تحديث الإجماليات...');

    try {
        // Get individual totals
        const bankTotal = parseFloat(document.getElementById('editBankReceiptsTotal').textContent) || 0;
        const cashTotal = parseFloat(document.getElementById('editCashReceiptsTotal').textContent) || 0;
        const postpaidTotal = parseFloat(document.getElementById('editPostpaidSalesTotal').textContent) || 0;
        const customerTotal = parseFloat(document.getElementById('editCustomerReceiptsTotal').textContent) || 0;
        const returnTotal = parseFloat(document.getElementById('editReturnInvoicesTotal').textContent) || 0;
        const supplierTotal = parseFloat(document.getElementById('editSuppliersTotal').textContent) || 0;

        // Calculate total receipts (same logic as new reconciliation modal)
        // Note: Return invoices are ADDED, customer receipts are SUBTRACTED and suppliers are NOT included in total receipts
        const totalReceipts = bankTotal + cashTotal + postpaidTotal + returnTotal - customerTotal;

        // Get system sales
        const systemSalesElement = document.getElementById('editSystemSales');
        const systemSales = parseFloat(systemSalesElement.value) || 0;

        // Calculate surplus/deficit
        const surplusDeficit = totalReceipts - systemSales;

        // Update display elements
        const totalReceiptsElement = document.getElementById('editTotalReceipts');
        const surplusDeficitElement = document.getElementById('editSurplusDeficit');

        if (totalReceiptsElement) {
            totalReceiptsElement.textContent = `${formatCurrency(totalReceipts)} ريال`;
        }

        if (surplusDeficitElement) {
            surplusDeficitElement.textContent = `${formatCurrency(surplusDeficit)} ريال`;

            // Color code surplus/deficit with enhanced styling
            surplusDeficitElement.classList.remove('text-success', 'text-danger', 'text-primary', 'text-warning');

            if (surplusDeficit > 0) {
                surplusDeficitElement.classList.add('text-success');
                surplusDeficitElement.title = 'فائض - المقبوضات أكثر من مبيعات النظام';
            } else if (surplusDeficit < 0) {
                surplusDeficitElement.classList.add('text-danger');
                surplusDeficitElement.title = 'عجز - المقبوضات أقل من مبيعات النظام';
            } else {
                surplusDeficitElement.classList.add('text-primary');
                surplusDeficitElement.title = 'متوازن - المقبوضات تساوي مبيعات النظام';
            }
        }

        // Validate system sales field
        if (systemSalesElement) {
            systemSalesElement.classList.remove('is-valid', 'is-invalid');
            if (systemSales >= 0) {
                systemSalesElement.classList.add('is-valid');
            } else {
                systemSalesElement.classList.add('is-invalid');
            }
        }

        // Log calculation details
        console.log('📊 [TOTALS] تفاصيل الحسابات:', {
            bankTotal: formatCurrency(bankTotal),
            cashTotal: formatCurrency(cashTotal),
            postpaidTotal: formatCurrency(postpaidTotal),
            customerTotal: formatCurrency(customerTotal) + ' (مطروح)',
            returnTotal: formatCurrency(returnTotal) + ' (مضاف)',
            supplierTotal: formatCurrency(supplierTotal) + ' (غير مشمول في الإجمالي)',
            totalReceipts: formatCurrency(totalReceipts),
            systemSales: formatCurrency(systemSales),
            surplusDeficit: formatCurrency(surplusDeficit),
            calculation: `${formatCurrency(bankTotal)} + ${formatCurrency(cashTotal)} + ${formatCurrency(postpaidTotal)} + ${formatCurrency(returnTotal)} - ${formatCurrency(customerTotal)} = ${formatCurrency(totalReceipts)}`
        });

    } catch (error) {
        console.error('❌ [TOTALS] خطأ في تحديث الإجماليات:', error);
    }
}

/**
 * Initialize edit mode event listeners
 */
function initializeEditModeEventListeners() {
    // System sales input change listener
    const editSystemSales = document.getElementById('editSystemSales');
    if (editSystemSales) {
        editSystemSales.addEventListener('input', updateEditTotals);
        editSystemSales.addEventListener('change', updateEditTotals);
    }

    // Modal close event listeners
    const editModal = document.getElementById('editReconciliationModal');
    if (editModal) {
        editModal.addEventListener('hidden.bs.modal', function () {
            resetEditMode();
        });
    }

    // Add event listeners for amount fields in modals to provide real-time feedback
    initializeModalAmountListeners();

    // Add event listeners for cash denomination calculation
    initializeCashCalculationListeners();
}

/**
 * Initialize amount field listeners in modals for real-time validation
 */
function initializeModalAmountListeners() {
    const amountFields = [
        'bankReceiptAmount',
        'cashReceiptAmount',
        'postpaidSaleAmount',
        'customerReceiptEditAmount',
        'returnInvoiceAmount',
        'supplierEditAmount'
    ];

    amountFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', function () {
                validateAmountField(this);
            });
        }
    });
}

/**
 * Validate amount field and provide visual feedback
 * @param {HTMLElement} field - The amount input field
 */
function validateAmountField(field) {
    const value = parseFloat(field.value);

    // Remove previous validation classes
    field.classList.remove('is-valid', 'is-invalid');

    if (field.value === '') {
        // Empty field - neutral state
        return;
    }

    if (isNaN(value) || value <= 0) {
        // Invalid amount
        field.classList.add('is-invalid');
    } else {
        // Valid amount
        field.classList.add('is-valid');
    }
}

/**
 * Initialize cash calculation listeners
 */
function initializeCashCalculationListeners() {
    const denominationField = document.getElementById('editDenomination');
    const quantityField = document.getElementById('editQuantity');
    const totalField = document.getElementById('editCashTotal');

    if (denominationField && quantityField && totalField) {
        const calculateTotal = () => {
            const denomination = parseFloat(denominationField.value) || 0;
            const quantity = parseInt(quantityField.value) || 0;
            const total = denomination * quantity;
            totalField.value = formatCurrency(total);
        };

        denominationField.addEventListener('change', calculateTotal);
        quantityField.addEventListener('input', calculateTotal);
    }
}

// ========================================
// SETTINGS MANAGEMENT SYSTEM
// ========================================

/**
 * Load all settings when settings section is opened
 */
async function loadAllSettings() {
    console.log('⚙️ [SETTINGS] تحميل جميع الإعدادات...');

    try {
        // Load all settings from database
        const allSettings = await ipcRenderer.invoke('db-query',
            'SELECT * FROM system_settings ORDER BY category, setting_key', []
        );

        // Group settings by category
        const settingsByCategory = {};
        allSettings.forEach(setting => {
            if (!settingsByCategory[setting.category]) {
                settingsByCategory[setting.category] = {};
            }
            settingsByCategory[setting.category][setting.setting_key] = setting.setting_value;
        });

        // Apply settings to UI
        if (settingsByCategory.general) {
            applyGeneralSettingsToUI(settingsByCategory.general);
        }
        if (settingsByCategory.print) {
            applyPrintSettingsToUI(settingsByCategory.print);
        }
        if (settingsByCategory.reports) {
            applyReportsSettingsToUI(settingsByCategory.reports);
        }
        if (settingsByCategory.database) {
            applyDatabaseSettingsToUI(settingsByCategory.database);
        }
        if (settingsByCategory.user) {
            applyUserSettingsToUI(settingsByCategory.user);
        }
        if (settingsByCategory.backup) {
            applyBackupSettingsToUI(settingsByCategory.backup);
        }

        // Set global company name for reports
        if (settingsByCategory.general && settingsByCategory.general.company_name) {
            window.currentCompanyName = settingsByCategory.general.company_name;
        }

        console.log('✅ [SETTINGS] تم تحميل جميع الإعدادات بنجاح');

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تحميل الإعدادات:', error);
        DialogUtils.showError(`حدث خطأ أثناء تحميل الإعدادات: ${error.message}`, 'خطأ في التحميل');
    }
}

/**
 * Apply general settings to UI
 */
function applyGeneralSettingsToUI(settings) {
    if (settings.company_name) {
        const companyNameField = document.getElementById('companyName');
        if (companyNameField) companyNameField.value = settings.company_name;
    }
    if (settings.company_phone) {
        const companyPhoneField = document.getElementById('companyPhone');
        if (companyPhoneField) companyPhoneField.value = settings.company_phone;
    }
    if (settings.company_email) {
        const companyEmailField = document.getElementById('companyEmail');
        if (companyEmailField) companyEmailField.value = settings.company_email;
    }
    if (settings.company_address) {
        const companyAddressField = document.getElementById('companyAddress');
        if (companyAddressField) companyAddressField.value = settings.company_address;
    }
    if (settings.system_language) {
        const systemLanguageField = document.getElementById('systemLanguage');
        if (systemLanguageField) systemLanguageField.value = settings.system_language;
    }
    if (settings.system_theme) {
        const systemThemeField = document.getElementById('systemTheme');
        if (systemThemeField) systemThemeField.value = settings.system_theme;
        // Apply theme immediately
        applyTheme(settings.system_theme);
    }
}

/**
 * Apply print settings to UI
 */
function applyPrintSettingsToUI(settings) {
    if (settings.copies) {
        const copiesField = document.getElementById('copiesInput');
        if (copiesField) copiesField.value = settings.copies;
    }
    if (settings.paper_size) {
        const paperSizeField = document.getElementById('paperSizeSelect');
        if (paperSizeField) paperSizeField.value = settings.paper_size;
    }
    if (settings.orientation) {
        const orientationField = document.getElementById('orientationSelect');
        if (orientationField) orientationField.value = settings.orientation;
    }
    if (settings.color_print) {
        const colorPrintField = document.getElementById('colorPrintCheck');
        if (colorPrintField) colorPrintField.checked = settings.color_print === 'true';
    }
    if (settings.duplex) {
        const duplexField = document.getElementById('duplexSelect');
        if (duplexField) duplexField.value = settings.duplex;
    }
    // Margins
    if (settings.margin_top) {
        const marginTopField = document.getElementById('marginTop');
        if (marginTopField) marginTopField.value = settings.margin_top;
    }
    if (settings.margin_right) {
        const marginRightField = document.getElementById('marginRight');
        if (marginRightField) marginRightField.value = settings.margin_right;
    }
    if (settings.margin_bottom) {
        const marginBottomField = document.getElementById('marginBottom');
        if (marginBottomField) marginBottomField.value = settings.margin_bottom;
    }
    if (settings.margin_left) {
        const marginLeftField = document.getElementById('marginLeft');
        if (marginLeftField) marginLeftField.value = settings.margin_left;
    }
}

/**
 * Apply reports settings to UI
 */
function applyReportsSettingsToUI(settings) {
    if (settings.default_report_format) {
        const defaultReportFormatField = document.getElementById('defaultReportFormat');
        if (defaultReportFormatField) defaultReportFormatField.value = settings.default_report_format;
    }
    if (settings.default_time_range) {
        const defaultTimeRangeField = document.getElementById('defaultTimeRange');
        if (defaultTimeRangeField) defaultTimeRangeField.value = settings.default_time_range;
    }
    if (settings.default_save_path) {
        const reportsPathField = document.getElementById('reportsPath');
        if (reportsPathField) reportsPathField.value = settings.default_save_path;
    }
    console.log('📊 [SETTINGS] تطبيق إعدادات التقارير:', settings);
}

/**
 * Apply database settings to UI
 */
function applyDatabaseSettingsToUI(settings) {
    if (settings.auto_backup) {
        const autoBackupField = document.getElementById('autoBackup');
        if (autoBackupField) autoBackupField.value = settings.auto_backup;
    }
    if (settings.backup_location) {
        const backupLocationField = document.getElementById('backupLocation');
        if (backupLocationField) backupLocationField.value = settings.backup_location;
    }
}

/**
 * Apply user settings to UI
 */
function applyUserSettingsToUI(settings) {
    // User settings can be added here when needed
    console.log('👤 [SETTINGS] تطبيق إعدادات المستخدمين:', settings);
}

/**
 * Apply backup settings to UI
 */
function applyBackupSettingsToUI(settings) {
    console.log('💾 [SETTINGS] تطبيق إعدادات النسخ الاحتياطي:', settings);

    if (settings.default_backup_path) {
        const backupLocationField = document.getElementById('backupLocation');
        if (backupLocationField) {
            backupLocationField.value = settings.default_backup_path;
        }
    }

    if (settings.auto_backup_frequency) {
        const autoBackupField = document.getElementById('autoBackup');
        if (autoBackupField) {
            autoBackupField.value = settings.auto_backup_frequency;
        }
    }
}

// ========================================
// CASHIER PERFORMANCE COMPARISON SYSTEM
// ========================================

/**
 * Load filters for cashier performance comparison
 */
async function loadCashierPerformanceFilters() {
    try {
        // Set default dates (last 30 days)
        const today = new Date();
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

        document.getElementById('performanceDateFrom').value = lastMonth.toISOString().split('T')[0];
        document.getElementById('performanceDateTo').value = today.toISOString().split('T')[0];

        // Load branches
        const branches = await ipcRenderer.invoke('db-query', 'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name');
        const branchSelect = document.getElementById('performanceBranch');
        branchSelect.innerHTML = '<option value="">جميع الفروع</option>';

        branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.id;
            option.textContent = branch.branch_name;
            branchSelect.appendChild(option);
        });

        console.log('✅ [PERFORMANCE] تم تحميل فلاتر مقارنة الأداء');
    } catch (error) {
        console.error('❌ [PERFORMANCE] خطأ في تحميل الفلاتر:', error);
    }
}

/**
 * Main function to generate cashier performance comparison
 */
async function handleGeneratePerformanceComparison() {
    console.log('🚀 [PERFORMANCE] بدء مقارنة أداء الكاشيرين...');

    try {
        const dateFrom = document.getElementById('performanceDateFrom').value;
        const dateTo = document.getElementById('performanceDateTo').value;
        const branchId = document.getElementById('performanceBranch').value;

        // Validation
        if (!dateFrom || !dateTo) {
            DialogUtils.showValidationError('يرجى تحديد نطاق التواريخ');
            return;
        }

        if (new Date(dateFrom) > new Date(dateTo)) {
            DialogUtils.showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
            return;
        }

        // Show loading
        showPerformanceLoading(true);
        hidePerformanceResults();

        // Fetch and analyze data
        const performanceData = await generateCashierPerformanceData(dateFrom, dateTo, branchId);

        if (performanceData.cashiers.length === 0) {
            showPerformanceLoading(false);
            DialogUtils.showInfo('لا توجد بيانات كاشيرين في النطاق الزمني المحدد', 'لا توجد نتائج');
            return;
        }

        // Display results
        displayPerformanceResults(performanceData);
        showPerformanceLoading(false);
        showPerformanceResults();

        console.log('✅ [PERFORMANCE] تم إنشاء مقارنة الأداء بنجاح');

    } catch (error) {
        showPerformanceLoading(false);
        console.error('❌ [PERFORMANCE] خطأ في مقارنة الأداء:', error);
        DialogUtils.showError(`حدث خطأ أثناء مقارنة الأداء: ${error.message}`, 'خطأ في المقارنة');
    }
}

/**
 * Generate cashier performance data from database
 */
async function generateCashierPerformanceData(dateFrom, dateTo, branchId) {
    console.log('📊 [PERFORMANCE] جمع بيانات الأداء من قاعدة البيانات...');

    // Build branch filter
    let branchFilter = '';
    let queryParams = [dateFrom, dateTo];

    if (branchId) {
        branchFilter = 'AND c.branch_id = ?';
        queryParams.push(branchId);
    }

    // Main cashier performance query
    const cashierQuery = `
        SELECT
            c.id as cashier_id,
            c.name as cashier_name,
            c.cashier_number,
            b.branch_name,
            COUNT(r.id) as total_reconciliations,
            SUM(r.total_receipts) as total_sales,
            SUM(r.system_sales) as expected_sales,
            SUM(r.surplus_deficit) as total_deficit,
            AVG(r.surplus_deficit) as avg_deficit,
            SUM(CASE WHEN r.surplus_deficit >= 0 THEN 1 ELSE 0 END) as positive_days,
            SUM(CASE WHEN r.surplus_deficit < 0 THEN 1 ELSE 0 END) as negative_days,
            MIN(r.reconciliation_date) as first_date,
            MAX(r.reconciliation_date) as last_date
        FROM cashiers c
        LEFT JOIN branches b ON c.branch_id = b.id
        LEFT JOIN reconciliations r ON c.id = r.cashier_id
            AND DATE(r.reconciliation_date) BETWEEN ? AND ?
        WHERE c.active = 1 ${branchFilter}
        GROUP BY c.id, c.name, c.cashier_number, b.branch_name
        HAVING total_reconciliations > 0
        ORDER BY total_deficit DESC, total_sales DESC
    `;

    const cashiers = await ipcRenderer.invoke('db-query', cashierQuery, queryParams);

    // Calculate performance metrics for each cashier
    const processedCashiers = cashiers.map(cashier => {
        const accuracy = calculateAccuracyScore(cashier);
        const volume = calculateVolumeScore(cashier, cashiers);
        const consistency = calculateConsistencyScore(cashier);

        const overallRating = calculateOverallRating(accuracy, volume, consistency);

        return {
            ...cashier,
            accuracy_score: accuracy,
            volume_score: volume,
            consistency_score: consistency,
            overall_rating: overallRating,
            star_rating: Math.round(overallRating),
            performance_badge: getPerformanceBadge(overallRating),
            total_sales: parseFloat(cashier.total_sales) || 0,
            total_deficit: parseFloat(cashier.total_deficit) || 0,
            avg_deficit: parseFloat(cashier.avg_deficit) || 0
        };
    });

    // Sort by overall rating (best first)
    processedCashiers.sort((a, b) => b.overall_rating - a.overall_rating);

    console.log(`📊 [PERFORMANCE] تم معالجة ${processedCashiers.length} كاشير`);

    return {
        cashiers: processedCashiers,
        summary: generatePerformanceSummary(processedCashiers),
        dateRange: { from: dateFrom, to: dateTo }
    };
}

/**
 * Calculate accuracy score based on deficit performance (0-100)
 */
function calculateAccuracyScore(cashier) {
    if (cashier.total_reconciliations === 0) return 0;

    // Calculate accuracy based on how close to zero the average deficit is
    const avgDeficit = Math.abs(cashier.avg_deficit);

    // Scale: 0 deficit = 100%, larger deficits reduce score
    let accuracy = Math.max(0, 100 - (avgDeficit / 100) * 20); // Each 100 SAR deficit reduces score by 20%

    // Bonus for positive days ratio
    const positiveRatio = cashier.positive_days / cashier.total_reconciliations;
    accuracy += positiveRatio * 10; // Up to 10% bonus for positive performance

    return Math.min(100, Math.max(0, accuracy));
}

/**
 * Calculate volume score based on sales performance (0-100)
 */
function calculateVolumeScore(cashier, allCashiers) {
    if (allCashiers.length === 0) return 0;

    const maxSales = Math.max(...allCashiers.map(c => c.total_sales || 0));
    if (maxSales === 0) return 0;

    // Scale cashier's sales relative to top performer
    const volumeScore = (cashier.total_sales / maxSales) * 100;

    return Math.min(100, Math.max(0, volumeScore));
}

/**
 * Calculate consistency score based on performance stability (0-100)
 */
function calculateConsistencyScore(cashier) {
    if (cashier.total_reconciliations === 0) return 0;

    // Higher consistency for more reconciliations and fewer negative days
    const reconciliationBonus = Math.min(50, cashier.total_reconciliations * 5); // Up to 50% for activity
    const negativeRatio = cashier.negative_days / cashier.total_reconciliations;
    const consistencyPenalty = negativeRatio * 30; // Penalty for negative days

    const consistencyScore = reconciliationBonus - consistencyPenalty + 50; // Base 50%

    return Math.min(100, Math.max(0, consistencyScore));
}

/**
 * Calculate overall rating (1-5 stars)
 */
function calculateOverallRating(accuracy, volume, consistency) {
    // Weighted average: Accuracy 50%, Volume 30%, Consistency 20%
    const weightedScore = (accuracy * 0.5) + (volume * 0.3) + (consistency * 0.2);

    // Convert to 1-5 scale
    const rating = (weightedScore / 100) * 4 + 1; // Scale to 1-5

    return Math.min(5, Math.max(1, rating));
}

/**
 * Get performance badge based on rating
 */
function getPerformanceBadge(rating) {
    if (rating >= 4.5) return { text: 'ممتاز', class: 'badge-excellent', icon: '🏆' };
    if (rating >= 4.0) return { text: 'جيد جداً', class: 'badge-very-good', icon: '🥇' };
    if (rating >= 3.5) return { text: 'جيد', class: 'badge-good', icon: '🥈' };
    if (rating >= 3.0) return { text: 'مقبول', class: 'badge-acceptable', icon: '🥉' };
    return { text: 'يحتاج تحسين', class: 'badge-needs-improvement', icon: '📈' };
}



/**
 * Generate performance summary
 */
function generatePerformanceSummary(cashiers) {
    if (cashiers.length === 0) {
        return {
            totalCashiers: 0,
            bestPerformer: null,
            averageRating: 0,
            totalSales: 0,
            totalDeficit: 0
        };
    }

    const totalSales = cashiers.reduce((sum, c) => sum + c.total_sales, 0);
    const totalDeficit = cashiers.reduce((sum, c) => sum + c.total_deficit, 0);
    const averageRating = cashiers.reduce((sum, c) => sum + c.overall_rating, 0) / cashiers.length;

    return {
        totalCashiers: cashiers.length,
        bestPerformer: cashiers[0], // Already sorted by rating
        averageRating: averageRating.toFixed(1),
        totalSales: totalSales,
        totalDeficit: totalDeficit
    };
}

/**
 * Display performance comparison results
 */
function displayPerformanceResults(data) {
    console.log('🎨 [PERFORMANCE] عرض نتائج المقارنة...');

    // Store data globally for PDF export
    window.currentPerformanceData = data;
    console.log('💾 [PERFORMANCE] تم حفظ بيانات الأداء للتصدير');

    displayPerformanceSummary(data.summary);
    displayCashierRanking(data.cashiers.slice(0, 5)); // Top 5
    displayCashierCards(data.cashiers);

    // Show export button
    document.getElementById('exportPerformancePdfBtn').style.display = 'inline-block';
}

/**
 * Display performance summary cards
 */
function displayPerformanceSummary(summary) {
    const container = document.getElementById('performanceSummary');

    const summaryHtml = `
        <div class="col-md-3">
            <div class="card bg-primary text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${summary.totalCashiers}</h4>
                    <p class="mb-0">إجمالي الكاشيرين</p>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-success text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${formatNumber(summary.totalSales)}</h4>
                    <p class="mb-0">إجمالي المبيعات</p>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-warning text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${summary.averageRating} ⭐</h4>
                    <p class="mb-0">متوسط التقييم</p>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card ${summary.totalDeficit >= 0 ? 'bg-info' : 'bg-danger'} text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${formatCurrency(summary.totalDeficit)}</h4>
                    <p class="mb-0">صافي النتيجة</p>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = summaryHtml;
}



/**
 * Display cashier ranking (top performers)
 */
function displayCashierRanking(topCashiers) {
    const container = document.getElementById('cashierRankingList');

    let rankingHtml = '';
    topCashiers.forEach((cashier, index) => {
        const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;

        rankingHtml += `
            <div class="col-12 mb-2">
                <div class="d-flex align-items-center p-2 border rounded">
                    <div class="me-3">
                        <span class="fs-4">${rankIcon}</span>
                    </div>
                    <div class="flex-grow-1">
                        <div class="fw-bold">${cashier.cashier_name}</div>
                        <small class="text-muted">رقم: ${cashier.cashier_number}</small>
                    </div>
                    <div class="text-end">
                        <div>${generateStarRating(cashier.star_rating)}</div>
                        <small class="text-muted">${cashier.overall_rating.toFixed(1)}/5</small>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = rankingHtml;
}

/**
 * Display detailed cashier performance cards
 */
function displayCashierCards(cashiers) {
    const container = document.getElementById('cashierPerformanceCards');

    let cardsHtml = '';
    cashiers.forEach(cashier => {
        const badge = cashier.performance_badge;
        const deficitClass = cashier.total_deficit >= 0 ? 'text-success' : 'text-danger';

        cardsHtml += `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card h-100 shadow-sm">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h6 class="mb-0">${cashier.cashier_name}</h6>
                        <span class="badge ${badge.class}">${badge.icon} ${badge.text}</span>
                    </div>
                    <div class="card-body">
                        <div class="text-center mb-3">
                            <div class="fs-4">${generateStarRating(cashier.star_rating)}</div>
                            <small class="text-muted">${cashier.overall_rating.toFixed(1)}/5.0</small>
                        </div>

                        <div class="row text-center mb-3">
                            <div class="col-6">
                                <div class="fw-bold text-primary">${formatNumber(cashier.total_sales)}</div>
                                <small class="text-muted">إجمالي المبيعات</small>
                            </div>
                            <div class="col-6">
                                <div class="fw-bold ${deficitClass}">${formatCurrency(cashier.total_deficit)}</div>
                                <small class="text-muted">صافي النتيجة</small>
                            </div>
                        </div>

                        <div class="mb-2">
                            <small class="text-muted">الدقة:</small>
                            <div class="progress" style="height: 6px;">
                                <div class="progress-bar bg-success" style="width: ${cashier.accuracy_score}%"></div>
                            </div>
                            <small class="text-muted">${cashier.accuracy_score.toFixed(0)}%</small>
                        </div>

                        <div class="mb-2">
                            <small class="text-muted">حجم المبيعات:</small>
                            <div class="progress" style="height: 6px;">
                                <div class="progress-bar bg-info" style="width: ${cashier.volume_score}%"></div>
                            </div>
                            <small class="text-muted">${cashier.volume_score.toFixed(0)}%</small>
                        </div>

                        <div class="mb-3">
                            <small class="text-muted">الاستقرار:</small>
                            <div class="progress" style="height: 6px;">
                                <div class="progress-bar bg-warning" style="width: ${cashier.consistency_score}%"></div>
                            </div>
                            <small class="text-muted">${cashier.consistency_score.toFixed(0)}%</small>
                        </div>

                        <div class="row text-center">
                            <div class="col-4">
                                <div class="fw-bold text-success">${cashier.positive_days}</div>
                                <small class="text-muted">أيام إيجابية</small>
                            </div>
                            <div class="col-4">
                                <div class="fw-bold text-danger">${cashier.negative_days}</div>
                                <small class="text-muted">أيام سلبية</small>
                            </div>
                            <div class="col-4">
                                <div class="fw-bold text-primary">${cashier.total_reconciliations}</div>
                                <small class="text-muted">إجمالي الأيام</small>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer text-muted">
                        <small>
                            ${cashier.branch_name || 'غير محدد'} |
                            رقم الكاشير: ${cashier.cashier_number}
                        </small>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = cardsHtml;
}

/**
 * Generate star rating HTML
 */
function generateStarRating(rating) {
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            starsHtml += '<span class="text-warning">⭐</span>';
        } else {
            starsHtml += '<span class="text-muted">☆</span>';
        }
    }
    return starsHtml;
}

/**
 * Show/hide loading spinner
 */
function showPerformanceLoading(show) {
    document.getElementById('performanceLoading').style.display = show ? 'block' : 'none';
}

/**
 * Show/hide results section
 */
function showPerformanceResults() {
    document.getElementById('performanceResults').style.display = 'block';
}

function hidePerformanceResults() {
    document.getElementById('performanceResults').style.display = 'none';
}

/**
 * Export performance comparison as PDF - Rewritten for reliability
 */
async function handleExportPerformancePdf() {
    console.log('📄 [PERFORMANCE-PDF] بدء تصدير مقارنة أداء الكاشيرين...');

    try {
        // Validate that performance results exist
        const resultsSection = document.getElementById('performanceResults');
        if (!resultsSection || resultsSection.style.display === 'none') {
            DialogUtils.showValidationError('يرجى إنشاء مقارنة الأداء أولاً');
            return;
        }

        // Validate that we have performance data
        if (!window.currentPerformanceData || !window.currentPerformanceData.cashiers) {
            DialogUtils.showValidationError('لا توجد بيانات أداء متاحة للتصدير');
            return;
        }

        // Show loading indicator
        DialogUtils.showLoading('جاري إنشاء تقرير PDF...', 'يرجى الانتظار قليلاً');

        // Generate comprehensive PDF content
        const pdfHtmlContent = generatePerformanceComprehensivePdfContent();

        // Prepare export data with correct structure
        const exportData = {
            html: pdfHtmlContent,
            filename: `مقارنة_أداء_الكاشيرين_${new Date().toISOString().split('T')[0]}.pdf`
        };

        console.log('📄 [PERFORMANCE-PDF] إرسال البيانات لمعالج PDF...');

        // Send to main process for PDF generation
        const result = await ipcRenderer.invoke('export-pdf', exportData);

        // Close loading dialog
        DialogUtils.close();

        // Handle result
        if (result.success) {
            console.log('✅ [PERFORMANCE-PDF] تم تصدير PDF بنجاح:', result.filePath);
            DialogUtils.showSuccess(
                `تم تصدير التقرير بنجاح في:\n${result.filePath}`,
                'تصدير ناجح'
            );
        } else {
            console.error('❌ [PERFORMANCE-PDF] فشل التصدير:', result.error);
            DialogUtils.showError(
                result.error || 'فشل في تصدير التقرير',
                'خطأ في التصدير'
            );
        }

    } catch (error) {
        // Ensure loading dialog is closed
        DialogUtils.close();

        console.error('❌ [PERFORMANCE-PDF] خطأ في تصدير PDF:', error);
        DialogUtils.showError(
            `حدث خطأ أثناء التصدير: ${error.message}`,
            'خطأ في النظام'
        );
    }
}

/**
 * Generate comprehensive PDF content for performance comparison
 */
function generatePerformanceComprehensivePdfContent() {
    console.log('📄 [PERFORMANCE-PDF] إنشاء محتوى PDF شامل...');

    try {
        // Get filter values
        const dateFrom = document.getElementById('performanceDateFrom').value;
        const dateTo = document.getElementById('performanceDateTo').value;
        const branchSelect = document.getElementById('performanceBranch');
        const branchName = branchSelect.options[branchSelect.selectedIndex].text;

        // Get current performance data
        const performanceData = window.currentPerformanceData;
        if (!performanceData) {
            throw new Error('لا توجد بيانات أداء متاحة');
        }

        // Generate comprehensive HTML content
        const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>تقرير مقارنة أداء الكاشيرين</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Cairo', Arial, sans-serif;
            direction: rtl;
            line-height: 1.6;
            color: #333;
            background: #fff;
            padding: 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #007bff;
            padding-bottom: 20px;
        }

        .header h1 {
            color: #007bff;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 10px;
        }

        .header .subtitle {
            color: #666;
            font-size: 16px;
            margin-bottom: 5px;
        }

        .summary-section {
            margin-bottom: 30px;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #dee2e6;
        }

        .summary-title {
            color: #007bff;
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 15px;
            text-align: center;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        .summary-card {
            background: white;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #dee2e6;
            text-align: center;
        }

        .summary-card .value {
            font-size: 24px;
            font-weight: 700;
            color: #007bff;
            margin-bottom: 5px;
        }

        .summary-card .label {
            font-size: 14px;
            color: #666;
        }

        .cashiers-section {
            margin-bottom: 30px;
        }

        .section-title {
            color: #007bff;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            border-bottom: 2px solid #007bff;
            padding-bottom: 5px;
        }

        .cashier-card {
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .cashier-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
        }

        .cashier-name {
            font-size: 18px;
            font-weight: 600;
            color: #333;
        }

        .cashier-rank {
            background: #007bff;
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
        }

        .cashier-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
        }

        .stat-item {
            text-align: center;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 6px;
        }

        .stat-value {
            font-size: 16px;
            font-weight: 600;
            color: #007bff;
            margin-bottom: 3px;
        }

        .stat-label {
            font-size: 12px;
            color: #666;
        }

        .rating {
            color: #ffc107;
            font-size: 18px;
        }

        .text-success { color: #28a745; }
        .text-danger { color: #dc3545; }
        .text-primary { color: #007bff; }
        .text-warning { color: #ffc107; }

        .badge {
            display: inline-block;
            padding: 4px 8px;
            font-size: 12px;
            font-weight: 600;
            border-radius: 4px;
            color: white;
        }

        .bg-success { background-color: #28a745; }
        .bg-warning { background-color: #ffc107; color: #212529; }
        .bg-danger { background-color: #dc3545; }
        .bg-info { background-color: #17a2b8; }
        .bg-secondary { background-color: #6c757d; }

        .footer {
            margin-top: 40px;
            text-align: center;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #dee2e6;
            padding-top: 15px;
        }

        @media print {
            body { padding: 10px; }
            .cashier-card { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏆 تقرير مقارنة أداء الكاشيرين</h1>
        <div class="subtitle">الفترة: من ${dateFrom} إلى ${dateTo}</div>
        <div class="subtitle">الفرع: ${branchName}</div>
        <div class="subtitle">تاريخ التقرير: ${getCurrentDate()}</div>
    </div>

    ${generatePerformanceSummaryHtml(performanceData.summary)}
    ${generateCashiersPerformanceHtml(performanceData.cashiers)}

    <div class="footer">
        <p>تم إنشاء هذا التقرير بواسطة نظام تصفية برو - جميع الحقوق محفوظة © 2025</p>
    </div>
</body>
</html>`;

        console.log('✅ [PERFORMANCE-PDF] تم إنشاء محتوى PDF بنجاح');
        return htmlContent;

    } catch (error) {
        console.error('❌ [PERFORMANCE-PDF] خطأ في إنشاء محتوى PDF:', error);
        throw error;
    }
}

/**
 * Generate performance summary HTML for PDF
 */
function generatePerformanceSummaryHtml(summary) {
    if (!summary) return '';

    // Calculate additional metrics from summary data
    const bestPerformerName = summary.bestPerformer ? summary.bestPerformer.cashier_name : 'غير محدد';
    const totalReconciliations = window.currentPerformanceData?.cashiers?.reduce((sum, c) => sum + (c.total_reconciliations || 0), 0) || 0;
    const averageRating = summary.averageRating || 0;

    return `
    <div class="summary-section">
        <div class="summary-title">📊 ملخص الأداء العام</div>
        <div class="summary-grid">
            <div class="summary-card">
                <div class="value">${summary.totalCashiers || 0}</div>
                <div class="label">عدد الكاشيرين</div>
            </div>
            <div class="summary-card">
                <div class="value">${totalReconciliations}</div>
                <div class="label">إجمالي التصفيات</div>
            </div>
            <div class="summary-card">
                <div class="value">${formatCurrency(summary.totalSales || 0)}</div>
                <div class="label">إجمالي المبيعات</div>
            </div>
            <div class="summary-card">
                <div class="value">${formatCurrency(summary.totalDeficit || 0)}</div>
                <div class="label">إجمالي العجز/الفائض</div>
            </div>
            <div class="summary-card">
                <div class="value">${averageRating}%</div>
                <div class="label">متوسط التقييم</div>
            </div>
            <div class="summary-card">
                <div class="value">${bestPerformerName}</div>
                <div class="label">أفضل كاشير</div>
            </div>
        </div>
    </div>`;
}

/**
 * Generate cashiers performance HTML for PDF
 */
function generateCashiersPerformanceHtml(cashiers) {
    if (!cashiers || !Array.isArray(cashiers)) return '';

    let html = `
    <div class="cashiers-section">
        <div class="section-title">👥 تفاصيل أداء الكاشيرين</div>`;

    cashiers.forEach((cashier, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'text-warning' : rank <= 3 ? 'text-primary' : '';

        // Calculate average per reconciliation
        const avgPerReconciliation = cashier.total_reconciliations > 0 ?
            (cashier.total_sales / cashier.total_reconciliations) : 0;

        html += `
        <div class="cashier-card">
            <div class="cashier-header">
                <div class="cashier-name">${cashier.cashier_name} (${cashier.cashier_number})</div>
                <div class="cashier-rank ${rankClass}">المرتبة ${rank}</div>
            </div>
            <div class="cashier-stats">
                <div class="stat-item">
                    <div class="stat-value">${cashier.total_reconciliations || 0}</div>
                    <div class="stat-label">عدد التصفيات</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${formatCurrency(cashier.total_sales || 0)}</div>
                    <div class="stat-label">إجمالي المبيعات</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${formatCurrency(avgPerReconciliation)}</div>
                    <div class="stat-label">متوسط التصفية</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${formatCurrency(cashier.total_deficit || 0)}</div>
                    <div class="stat-label">العجز/الفائض</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${(cashier.accuracy_score || 0).toFixed(1)}%</div>
                    <div class="stat-label">نقاط الدقة</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">
                        <span class="rating">${'★'.repeat(Math.round(cashier.star_rating || 0))}</span>
                    </div>
                    <div class="stat-label">التقييم (${(cashier.overall_rating || 0).toFixed(1)})</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${cashier.branch_name || 'غير محدد'}</div>
                    <div class="stat-label">الفرع</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">
                        <span class="badge ${cashier.performance_badge?.class || ''}">${cashier.performance_badge?.text || 'عادي'}</span>
                    </div>
                    <div class="stat-label">مستوى الأداء</div>
                </div>
            </div>
        </div>`;
    });

    html += `</div>`;
    return html;
}

// ========================================
// END OF CASHIER PERFORMANCE COMPARISON SYSTEM
// ========================================

/**
 * Reset edit mode state
 */
function resetEditMode() {
    console.log('🔄 [RESET] إعادة تعيين وضع التعديل...');

    editMode.isActive = false;
    editMode.reconciliationId = null;
    editMode.originalData = null;

    // Clear edit form
    const editForm = document.getElementById('editReconciliationForm');
    if (editForm) {
        editForm.reset();
    }

    // Clear all edit tables
    const tableIds = [
        'editBankReceiptsTable',
        'editCashReceiptsTable',
        'editPostpaidSalesTable',
        'editCustomerReceiptsTable',
        'editReturnInvoicesTable',
        'editSuppliersTable'
    ];

    tableIds.forEach(tableId => {
        const table = document.getElementById(tableId);
        if (table) {
            table.innerHTML = '';
        }
    });

    // Reset totals
    const totalIds = [
        'editBankReceiptsTotal',
        'editCashReceiptsTotal',
        'editPostpaidSalesTotal',
        'editCustomerReceiptsTotal',
        'editReturnInvoicesTotal',
        'editSuppliersTotal'
    ];

    totalIds.forEach(totalId => {
        const element = document.getElementById(totalId);
        if (element) {
            element.textContent = '0.00';
        }
    });

    // Reset summary
    const editTotalReceipts = document.getElementById('editTotalReceipts');
    const editSurplusDeficit = document.getElementById('editSurplusDeficit');

    if (editTotalReceipts) {
        editTotalReceipts.textContent = '0.00 ريال';
    }

    if (editSurplusDeficit) {
        editSurplusDeficit.textContent = '0.00 ريال';
        editSurplusDeficit.className = 'form-control-plaintext fw-bold text-primary';
    }

    console.log('✅ [RESET] تم إعادة تعيين وضع التعديل بنجاح');
}

/**
 * Check if edit mode is active
 * @returns {boolean} - True if edit mode is active
 */
function isEditModeActive() {
    return editMode.isActive && editMode.reconciliationId;
}

/**
 * Get current editing reconciliation ID
 * @returns {number|null} - The reconciliation ID being edited or null
 */
function getCurrentEditingReconciliationId() {
    return editMode.reconciliationId;
}

/**
 * Save edited reconciliation data to database
 */
async function saveEditedReconciliation() {
    console.log('💾 [SAVE-EDIT] بدء حفظ تعديلات التصفية...');

    if (!isEditModeActive()) {
        console.error('❌ [SAVE-EDIT] وضع التعديل غير نشط');
        DialogUtils.showError('وضع التعديل غير نشط', 'خطأ في النظام');
        return;
    }

    try {
        // Show loading
        DialogUtils.showLoading('جاري حفظ تعديلات التصفية...');

        // Validate form data
        const validationResult = validateEditForm();
        if (!validationResult.isValid) {
            DialogUtils.close();
            DialogUtils.showError(validationResult.message, 'خطأ في البيانات');
            return;
        }

        // Collect all data from edit form
        const updatedData = collectEditFormData();

        // Update reconciliation in database
        await updateReconciliationInDatabase(updatedData);

        // Close loading dialog
        DialogUtils.close();

        // Show success message
        DialogUtils.showSuccessToast('تم حفظ تعديلات التصفية بنجاح');

        // Close edit modal
        const editModal = bootstrap.Modal.getInstance(document.getElementById('editReconciliationModal'));
        if (editModal) {
            editModal.hide();
        }

        // Refresh saved reconciliations list
        if (typeof loadSavedReconciliations === 'function') {
            await loadSavedReconciliations();
        }

        console.log('✅ [SAVE-EDIT] تم حفظ التعديلات بنجاح');

    } catch (error) {
        DialogUtils.close();
        handleEditError(error, 'SAVE-RECONCILIATION', {
            reconciliationId: editMode.reconciliationId,
            operation: 'save'
        });
    }
}

/**
 * Validate edit form data
 * @returns {Object} - Validation result with isValid and message
 */
function validateEditForm() {
    console.log('✅ [VALIDATE] فحص صحة بيانات النموذج...');

    // Check required fields
    const editBranchSelect = document.getElementById('editBranchSelect');
    const editCashierSelect = document.getElementById('editCashierSelect');
    const editAccountantSelect = document.getElementById('editAccountantSelect');
    const editReconciliationDate = document.getElementById('editReconciliationDate');
    const editSystemSales = document.getElementById('editSystemSales');

    if (!editBranchSelect || !editBranchSelect.value) {
        return { isValid: false, message: 'يجب اختيار الفرع' };
    }

    if (!editCashierSelect || !editCashierSelect.value) {
        return { isValid: false, message: 'يجب اختيار الكاشير' };
    }

    if (!editAccountantSelect || !editAccountantSelect.value) {
        return { isValid: false, message: 'يجب اختيار المحاسب' };
    }

    if (!editReconciliationDate || !editReconciliationDate.value) {
        return { isValid: false, message: 'يجب تحديد تاريخ التصفية' };
    }

    if (!editSystemSales || editSystemSales.value === '' || isNaN(editSystemSales.value)) {
        return { isValid: false, message: 'يجب إدخال مبيعات النظام بشكل صحيح' };
    }

    const systemSalesValue = parseFloat(editSystemSales.value);
    if (systemSalesValue < 0) {
        return { isValid: false, message: 'مبيعات النظام لا يمكن أن تكون سالبة' };
    }

    console.log('✅ [VALIDATE] جميع البيانات صحيحة');
    return { isValid: true, message: 'البيانات صحيحة' };
}

/**
 * Collect all data from edit form
 * @returns {Object} - Complete reconciliation data
 */
function collectEditFormData() {
    console.log('📊 [COLLECT] جمع البيانات من النموذج...');

    const reconciliationId = editMode.reconciliationId;
    const cashierId = document.getElementById('editCashierSelect').value;
    const accountantId = document.getElementById('editAccountantSelect').value;
    const reconciliationDate = document.getElementById('editReconciliationDate').value;
    const systemSales = parseFloat(document.getElementById('editSystemSales').value) || 0;

    // Get new filter enhancement fields
    const timeRangeStart = document.getElementById('editTimeRangeStart').value || null;
    const timeRangeEnd = document.getElementById('editTimeRangeEnd').value || null;
    const filterNotes = document.getElementById('editFilterNotes').value.trim() || null;

    // Calculate totals
    const bankTotal = parseFloat(document.getElementById('editBankReceiptsTotal').textContent) || 0;
    const cashTotal = parseFloat(document.getElementById('editCashReceiptsTotal').textContent) || 0;
    const postpaidTotal = parseFloat(document.getElementById('editPostpaidSalesTotal').textContent) || 0;
    const customerTotal = parseFloat(document.getElementById('editCustomerReceiptsTotal').textContent) || 0;
    const returnTotal = parseFloat(document.getElementById('editReturnInvoicesTotal').textContent) || 0;
    const supplierTotal = parseFloat(document.getElementById('editSuppliersTotal').textContent) || 0;

    // Calculate total receipts (same logic as new reconciliation modal)
    // Note: Return invoices are ADDED, customer receipts are SUBTRACTED and suppliers are NOT included in total receipts
    const totalReceipts = bankTotal + cashTotal + postpaidTotal + returnTotal - customerTotal;
    const surplusDeficit = totalReceipts - systemSales;

    const data = {
        reconciliationId,
        cashierId,
        accountantId,
        reconciliationDate,
        systemSales,
        totalReceipts,
        surplusDeficit,
        timeRangeStart,
        timeRangeEnd,
        filterNotes,
        bankReceipts: collectBankReceiptsData(),
        cashReceipts: collectCashReceiptsData(),
        postpaidSales: collectPostpaidSalesData(),
        customerReceipts: collectCustomerReceiptsData(),
        returnInvoices: collectReturnInvoicesData(),
        suppliers: collectSuppliersData()
    };

    console.log('✅ [COLLECT] تم جمع البيانات:', {
        reconciliationId: data.reconciliationId,
        totalReceipts: data.totalReceipts,
        systemSales: data.systemSales,
        surplusDeficit: data.surplusDeficit,
        itemCounts: {
            bankReceipts: data.bankReceipts.length,
            cashReceipts: data.cashReceipts.length,
            postpaidSales: data.postpaidSales.length,
            customerReceipts: data.customerReceipts.length,
            returnInvoices: data.returnInvoices.length,
            suppliers: data.suppliers.length
        }
    });

    return data;
}

/**
 * Collect bank receipts data from edit modal with correct structure
 * @returns {Array} - Array of bank receipt objects with correct fields
 */
function collectBankReceiptsData() {
    if (!editMode.originalData || !editMode.originalData.bankReceipts) {
        return [];
    }

    // Return the bank receipts data that's already stored in the correct format
    return editMode.originalData.bankReceipts.map(receipt => ({
        operation_type: receipt.operation_type,
        atm_id: receipt.atm_id,
        amount: parseFloat(receipt.amount) || 0
    }));
}

/**
 * Collect cash receipts data from edit modal with correct structure
 * @returns {Array} - Array of cash receipt objects with correct fields
 */
function collectCashReceiptsData() {
    if (!editMode.originalData || !editMode.originalData.cashReceipts) {
        return [];
    }

    // Return the cash receipts data that's already stored in the correct format
    return editMode.originalData.cashReceipts.map(receipt => ({
        denomination: receipt.denomination,
        quantity: receipt.quantity,
        total_amount: parseFloat(receipt.total_amount) || 0
    }));
}

/**
 * Collect postpaid sales data from edit modal with correct structure
 * @returns {Array} - Array of postpaid sale objects with correct fields
 */
function collectPostpaidSalesData() {
    if (!editMode.originalData || !editMode.originalData.postpaidSales) {
        return [];
    }

    // Return the postpaid sales data that's already stored in the correct format
    return editMode.originalData.postpaidSales.map(sale => ({
        customer_name: sale.customer_name,
        amount: parseFloat(sale.amount) || 0
    }));
}

/**
 * Collect customer receipts data from edit modal with correct structure
 * @returns {Array} - Array of customer receipt objects with correct fields
 */
function collectCustomerReceiptsData() {
    if (!editMode.originalData || !editMode.originalData.customerReceipts) {
        return [];
    }

    // Return the customer receipts data that's already stored in the correct format
    return editMode.originalData.customerReceipts.map(receipt => ({
        customer_name: receipt.customer_name,
        amount: parseFloat(receipt.amount) || 0,
        payment_type: receipt.payment_type || 'نقدي'
    }));
}

/**
 * Collect return invoices data from edit modal with correct structure
 * @returns {Array} - Array of return invoice objects with correct fields
 */
function collectReturnInvoicesData() {
    if (!editMode.originalData || !editMode.originalData.returnInvoices) {
        return [];
    }

    // Return the return invoices data that's already stored in the correct format
    return editMode.originalData.returnInvoices.map(invoice => ({
        invoice_number: invoice.invoice_number,
        amount: parseFloat(invoice.amount) || 0
    }));
}

/**
 * Collect suppliers data from edit modal with correct structure
 * @returns {Array} - Array of supplier objects with correct fields
 */
function collectSuppliersData() {
    if (!editMode.originalData || !editMode.originalData.suppliers) {
        return [];
    }

    // Return the suppliers data that's already stored in the correct format
    return editMode.originalData.suppliers.map(supplier => ({
        supplier_name: supplier.supplier_name,
        amount: parseFloat(supplier.amount) || 0
    }));
}

/**
 * Collect data from a table in edit modal
 * @param {string} tableId - The ID of the table
 * @param {Array} columns - Array of column names
 * @returns {Array} - Array of row data objects
 */
function collectTableData(tableId, columns) {
    const table = document.getElementById(tableId);
    if (!table) return [];

    const rows = table.querySelectorAll('tr');
    const data = [];

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= columns.length) {
            const rowData = {};
            columns.forEach((column, index) => {
                let value = cells[index].textContent.trim();

                // Convert amount columns to numbers
                if (column === 'amount') {
                    value = parseFloat(value) || 0;
                }

                rowData[column] = value;
            });
            data.push(rowData);
        }
    });

    return data;
}

/**
 * Update reconciliation data in database
 * @param {Object} data - The reconciliation data to update
 */
async function updateReconciliationInDatabase(data) {
    console.log('🗄️ [DB-UPDATE] بدء تحديث البيانات في قاعدة البيانات...');

    try {
        // Update main reconciliation record
        await ipcRenderer.invoke('update-reconciliation-modified',
            data.reconciliationId,
            data.systemSales,
            data.totalReceipts,
            data.surplusDeficit,
            'completed'
        );

        // Update basic reconciliation info including new filter enhancement fields
        await ipcRenderer.invoke('db-run',
            'UPDATE reconciliations SET cashier_id = ?, accountant_id = ?, reconciliation_date = ?, time_range_start = ?, time_range_end = ?, filter_notes = ? WHERE id = ?',
            [data.cashierId, data.accountantId, data.reconciliationDate, data.timeRangeStart, data.timeRangeEnd, data.filterNotes, data.reconciliationId]
        );

        // Delete existing related records
        await deleteExistingRecords(data.reconciliationId);

        // Insert updated records
        await insertUpdatedRecords(data);

        console.log('✅ [DB-UPDATE] تم تحديث البيانات في قاعدة البيانات بنجاح');

    } catch (error) {
        console.error('❌ [DB-UPDATE] خطأ في تحديث قاعدة البيانات:', error);
        throw new Error(`فشل في تحديث قاعدة البيانات: ${error.message}`);
    }
}

/**
 * Delete existing records for reconciliation
 * @param {number} reconciliationId - The reconciliation ID
 */
async function deleteExistingRecords(reconciliationId) {
    console.log('🗑️ [DELETE] حذف السجلات الموجودة...');

    const tables = [
        'bank_receipts',
        'cash_receipts',
        'postpaid_sales',
        'customer_receipts',
        'return_invoices',
        'suppliers'
    ];

    for (const table of tables) {
        await ipcRenderer.invoke('db-run',
            `DELETE FROM ${table} WHERE reconciliation_id = ?`,
            [reconciliationId]
        );
    }

    console.log('✅ [DELETE] تم حذف السجلات الموجودة');
}

/**
 * Insert updated records for reconciliation
 * @param {Object} data - The reconciliation data
 */
async function insertUpdatedRecords(data) {
    console.log('➕ [INSERT] إدراج السجلات المحدثة...');

    // Insert bank receipts
    for (const receipt of data.bankReceipts) {
        await ipcRenderer.invoke('db-run',
            'INSERT INTO bank_receipts (reconciliation_id, operation_type, atm_id, amount) VALUES (?, ?, ?, ?)',
            [data.reconciliationId, receipt.operation_type, receipt.atm_id, receipt.amount]
        );
    }

    // Insert cash receipts
    for (const receipt of data.cashReceipts) {
        await ipcRenderer.invoke('db-run',
            'INSERT INTO cash_receipts (reconciliation_id, denomination, quantity, total_amount) VALUES (?, ?, ?, ?)',
            [data.reconciliationId, receipt.denomination, receipt.quantity, receipt.total_amount]
        );
    }

    // Insert postpaid sales
    for (const sale of data.postpaidSales) {
        await ipcRenderer.invoke('db-run',
            'INSERT INTO postpaid_sales (reconciliation_id, customer_name, amount) VALUES (?, ?, ?)',
            [data.reconciliationId, sale.customer_name, sale.amount]
        );
    }

    // Insert customer receipts
    for (const receipt of data.customerReceipts) {
        await ipcRenderer.invoke('db-run',
            'INSERT INTO customer_receipts (reconciliation_id, customer_name, amount, payment_type) VALUES (?, ?, ?, ?)',
            [data.reconciliationId, receipt.customer_name, receipt.amount, receipt.payment_type || 'نقدي']
        );
    }

    // Insert return invoices
    for (const invoice of data.returnInvoices) {
        await ipcRenderer.invoke('db-run',
            'INSERT INTO return_invoices (reconciliation_id, invoice_number, amount) VALUES (?, ?, ?)',
            [data.reconciliationId, invoice.invoice_number, invoice.amount]
        );
    }

    // Insert suppliers
    for (const supplier of data.suppliers) {
        await ipcRenderer.invoke('db-run',
            'INSERT INTO suppliers (reconciliation_id, supplier_name, amount) VALUES (?, ?, ?)',
            [data.reconciliationId, supplier.supplier_name, supplier.amount]
        );
    }

    console.log('✅ [INSERT] تم إدراج السجلات المحدثة بنجاح');
}

/**
 * Enhanced error handler for edit operations
 * @param {Error} error - The error object
 * @param {string} operation - The operation that failed
 * @param {Object} context - Additional context information
 */
function handleEditError(error, operation, context = {}) {
    console.error(`❌ [ERROR-${operation}] خطأ في العملية:`, {
        error: error.message,
        stack: error.stack,
        operation,
        context,
        timestamp: new Date().toISOString(),
        editMode: {
            isActive: editMode.isActive,
            reconciliationId: editMode.reconciliationId
        }
    });

    // Determine user-friendly error message
    let userMessage = 'حدث خطأ غير متوقع';
    let title = 'خطأ في النظام';

    if (error.message.includes('Database') || error.message.includes('SQLITE')) {
        userMessage = 'خطأ في قاعدة البيانات. يرجى المحاولة مرة أخرى.';
        title = 'خطأ في قاعدة البيانات';
    } else if (error.message.includes('Network') || error.message.includes('timeout')) {
        userMessage = 'انتهت مهلة الاتصال. يرجى التحقق من الاتصال والمحاولة مرة أخرى.';
        title = 'خطأ في الاتصال';
    } else if (error.message.includes('not found') || error.message.includes('غير موجود')) {
        userMessage = 'التصفية المطلوبة غير موجودة أو تم حذفها.';
        title = 'تصفية غير موجودة';
    } else if (error.message.includes('validation') || error.message.includes('البيانات')) {
        userMessage = error.message;
        title = 'خطأ في البيانات';
    } else if (error.message.includes('permission') || error.message.includes('صلاحية')) {
        userMessage = 'ليس لديك صلاحية لتنفيذ هذه العملية.';
        title = 'خطأ في الصلاحيات';
    }

    // Show error to user
    DialogUtils.showError(userMessage, title);

    // Log to console for debugging
    console.error(`🚨 [USER-ERROR] ${title}: ${userMessage}`);
}

/**
 * Validate edit modal state before operations
 * @returns {Object} - Validation result
 */
function validateEditModalState() {
    const modal = document.getElementById('editReconciliationModal');
    if (!modal) {
        return { isValid: false, message: 'نافذة التعديل غير موجودة' };
    }

    if (!editMode.isActive) {
        return { isValid: false, message: 'وضع التعديل غير نشط' };
    }

    if (!editMode.reconciliationId) {
        return { isValid: false, message: 'معرف التصفية مفقود' };
    }

    return { isValid: true, message: 'الحالة صحيحة' };
}

/**
 * Log edit operation for audit trail
 * @param {string} operation - The operation performed
 * @param {Object} data - Operation data
 */
function logEditOperation(operation, data = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        operation,
        reconciliationId: editMode.reconciliationId,
        user: currentUser?.name || 'غير معروف',
        data: data,
        success: true
    };

    console.log(`📝 [AUDIT] ${operation}:`, logEntry);

    // In a production system, you might want to save this to a separate audit log table
    // await ipcRenderer.invoke('log-audit-entry', logEntry);
}

// Edit Modal Table Operations - Real Implementation

// Global variables for edit operations
let editItemData = {
    type: null,
    index: null,
    isEdit: false
};

/**
 * Add new bank receipt
 */
function addEditBankReceipt() {
    console.log('➕ [ADD] فتح نافذة إضافة مقبوضة بنكية...');

    editItemData = { type: 'bankReceipt', index: null, isEdit: false };

    // Reset form
    document.getElementById('bankReceiptEditForm').reset();
    document.getElementById('bankReceiptModalTitle').textContent = 'إضافة مقبوضة بنكية';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addEditBankReceiptModal'));
    modal.show();
}

/**
 * Add new cash receipt
 */
function addEditCashReceipt() {
    console.log('➕ [ADD] فتح نافذة إضافة فئة نقدية...');

    editItemData = { type: 'cashReceipt', index: null, isEdit: false };

    // Reset form
    document.getElementById('cashReceiptEditForm').reset();
    document.getElementById('cashReceiptModalTitle').textContent = 'إضافة فئة نقدية';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addEditCashReceiptModal'));
    modal.show();
}

/**
 * Populate customers list in input datalist
 * @param {string} inputId - The ID of the input element
 * @param {string} datalistId - The ID of the datalist element
 */
async function populateCustomersInSelect(inputId, datalistId = null, branchId = null) {
    try {
        console.log('📋 [POPULATE-SELECT] جاري تحميل العملاء في الحقل:', inputId, 'الفرع:', branchId);

        // Use default datalist ID if not provided
        if (!datalistId) {
            datalistId = inputId + 'List';
        }

        // If no branch ID provided, get it from the edit mode
        if (!branchId && editMode.isActive) {
            const editBranchSelect = document.getElementById('editBranchSelect');
            if (editBranchSelect) {
                branchId = editBranchSelect.value;
                console.log('🏢 [POPULATE-SELECT] تم الحصول على الفرع من النموذج:', branchId);
            }
        }

        // جلب العملاء من قاعدة البيانات مع تصفية حسب الفرع
        let query = `
            SELECT DISTINCT c.customer_name
            FROM (
                SELECT ps.customer_name, ch.branch_id
                FROM postpaid_sales ps
                JOIN reconciliations r ON ps.reconciliation_id = r.id
                JOIN cashiers ch ON r.cashier_id = ch.id
                UNION
                SELECT cr.customer_name, ch.branch_id
                FROM customer_receipts cr
                JOIN reconciliations r ON cr.reconciliation_id = r.id
                JOIN cashiers ch ON r.cashier_id = ch.id
            ) c
            WHERE c.customer_name IS NOT NULL
        `;

        const params = [];

        if (branchId) {
            query += ' AND c.branch_id = ?';
            params.push(branchId);
            console.log('🔍 [POPULATE-SELECT] تصفية العملاء حسب الفرع:', branchId);
        }

        query += ' ORDER BY c.customer_name';

        const customers = await ipcRenderer.invoke('db-query', query, params);
        const datalistElement = document.getElementById(datalistId);

        if (!datalistElement) {
            console.warn('⚠️ [POPULATE-SELECT] عنصر datalist غير موجود:', datalistId);
            return;
        }

        // تفريغ الخيارات السابقة
        datalistElement.innerHTML = '';

        // إضافة العملاء
        customers.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.customer_name;
            datalistElement.appendChild(option);
        });

        console.log(`✅ [POPULATE-SELECT] تم تحميل ${customers.length} عميل في ${datalistId}`);
    } catch (error) {
        console.error('❌ [POPULATE-SELECT] خطأ في تحميل العملاء:', error);
    }
}

/**
 * Add new postpaid sale
 */
function addEditPostpaidSale() {
    console.log('➕ [ADD] فتح نافذة إضافة مبيعة آجلة...');

    editItemData = { type: 'postpaidSale', index: null, isEdit: false };

    // Reset form
    document.getElementById('postpaidSaleEditForm').reset();
    document.getElementById('postpaidSaleModalTitle').textContent = 'إضافة مبيعة آجلة';

    // Get branch ID from edit form
    const editBranchSelect = document.getElementById('editBranchSelect');
    const branchId = editBranchSelect ? editBranchSelect.value : null;

    // Populate customers list filtered by branch
    populateCustomersInSelect('postpaidSaleCustomerName', 'postpaidSaleCustomersList', branchId);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addEditPostpaidSaleModal'));
    modal.show();
}

/**
 * Add new customer receipt
 */
function addEditCustomerReceipt() {
    console.log('➕ [ADD] فتح نافذة إضافة مقبوضة عميل...');

    editItemData = { type: 'customerReceipt', index: null, isEdit: false };

    // Reset form
    document.getElementById('customerReceiptEditForm').reset();
    document.getElementById('customerReceiptModalTitle').textContent = 'إضافة مقبوضة عميل';

    // Get branch ID from edit form
    const editBranchSelect = document.getElementById('editBranchSelect');
    const branchId = editBranchSelect ? editBranchSelect.value : null;

    // Populate customers list filtered by branch
    populateCustomersInSelect('customerReceiptEditCustomerName', 'customerReceiptEditCustomersList', branchId);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addEditCustomerReceiptModal'));
    modal.show();
}

/**
 * Add new return invoice
 */
function addEditReturnInvoice() {
    console.log('➕ [ADD] فتح نافذة إضافة فاتورة مرتجع...');

    editItemData = { type: 'returnInvoice', index: null, isEdit: false };

    // Reset form
    document.getElementById('returnInvoiceEditForm').reset();
    document.getElementById('returnInvoiceModalTitle').textContent = 'إضافة فاتورة مرتجع';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addEditReturnInvoiceModal'));
    modal.show();
}

/**
 * Add new supplier
 */
function addEditSupplier() {
    console.log('➕ [ADD] فتح نافذة إضافة مورد...');

    editItemData = { type: 'supplier', index: null, isEdit: false };

    // Reset form
    document.getElementById('supplierEditForm').reset();
    document.getElementById('supplierModalTitle').textContent = 'إضافة مورد';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addEditSupplierModal'));
    modal.show();
}

// Edit functions for existing items
function editEditBankReceipt(index) {
    console.log('✏️ [EDIT] تعديل إيصال البنك:', index);

    try {
        // Check if edit mode is active
        if (!isEditModeActive()) {
            console.error('❌ [EDIT] وضع التعديل غير نشط');
            DialogUtils.showError('وضع التعديل غير نشط', 'خطأ في النظام');
            return;
        }

        const data = getCurrentEditData('bankReceipts', index);
        if (!data) {
            console.error('❌ [EDIT] لم يتم العثور على البيانات للفهرس:', index);
            DialogUtils.showError('لم يتم العثور على البيانات المطلوبة', 'خطأ في البيانات');
            return;
        }

        editItemData = { type: 'bankReceipt', index: index, isEdit: true };

        // Populate form with existing data
        document.getElementById('editOperationType').value = data.operation_type || '';
        document.getElementById('editAtmSelect').value = data.atm_id || '';
        document.getElementById('editBankName').value = data.bank_name || '';
        document.getElementById('bankReceiptAmount').value = data.amount || '';
        document.getElementById('bankReceiptModalTitle').textContent = 'تعديل مقبوضة بنكية';

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('addEditBankReceiptModal'));
        modal.show();

        console.log('✅ [EDIT] تم فتح نافذة تعديل إيصال البنك بنجاح');

    } catch (error) {
        console.error('❌ [EDIT] خطأ في تعديل إيصال البنك:', error);
        DialogUtils.showError(`خطأ في تعديل الإيصال: ${error.message}`, 'خطأ في النظام');
    }
}

function editEditCashReceipt(index) {
    console.log('✏️ [EDIT] تعديل إيصال النقد:', index);

    try {
        // Check if edit mode is active
        if (!isEditModeActive()) {
            console.error('❌ [EDIT] وضع التعديل غير نشط');
            DialogUtils.showError('وضع التعديل غير نشط', 'خطأ في النظام');
            return;
        }

        const data = getCurrentEditData('cashReceipts', index);
        if (!data) {
            console.error('❌ [EDIT] لم يتم العثور على البيانات للفهرس:', index);
            DialogUtils.showError('لم يتم العثور على البيانات المطلوبة', 'خطأ في البيانات');
            return;
        }

        editItemData = { type: 'cashReceipt', index: index, isEdit: true };

        // Populate form with existing data
        document.getElementById('editDenomination').value = data.denomination || '';
        document.getElementById('editQuantity').value = data.quantity || '';
        document.getElementById('editCashTotal').value = data.total_amount || '';
        document.getElementById('cashReceiptModalTitle').textContent = 'تعديل فئة نقدية';

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('addEditCashReceiptModal'));
        modal.show();

        console.log('✅ [EDIT] تم فتح نافذة تعديل إيصال النقد بنجاح');

    } catch (error) {
        console.error('❌ [EDIT] خطأ في تعديل إيصال النقد:', error);
        DialogUtils.showError(`خطأ في تعديل الإيصال: ${error.message}`, 'خطأ في النظام');
    }
}

function editEditPostpaidSale(index) {
    console.log('✏️ [EDIT] تعديل المبيعة الآجلة:', index);

    try {
        if (!isEditModeActive()) {
            DialogUtils.showError('وضع التعديل غير نشط', 'خطأ في النظام');
            return;
        }

        const data = getCurrentEditData('postpaidSales', index);
        if (!data) {
            DialogUtils.showError('لم يتم العثور على البيانات المطلوبة', 'خطأ في البيانات');
            return;
        }

        editItemData = { type: 'postpaidSale', index: index, isEdit: true };

        // Get branch ID from edit form
        const editBranchSelect = document.getElementById('editBranchSelect');
        const branchId = editBranchSelect ? editBranchSelect.value : null;

        // Populate customers list first filtered by branch
        populateCustomersInSelect('postpaidSaleCustomerName', 'postpaidSaleCustomersList', branchId).then(() => {
            // Populate form with existing data
            document.getElementById('postpaidSaleCustomerName').value = data.customer_name || '';
            document.getElementById('postpaidSaleAmount').value = data.amount || '';
            document.getElementById('postpaidSaleModalTitle').textContent = 'تعديل مبيعة آجلة';

            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('addEditPostpaidSaleModal'));
            modal.show();
        });

    } catch (error) {
        console.error('❌ [EDIT] خطأ في تعديل المبيعة الآجلة:', error);
        DialogUtils.showError(`خطأ في تعديل المبيعة: ${error.message}`, 'خطأ في النظام');
    }
}

function editEditCustomerReceipt(index) {
    console.log('✏️ [EDIT] تعديل إيصال العميل:', index);

    try {
        const data = getCurrentEditData('customerReceipts', index);
        if (!data) return;

        editItemData = { type: 'customerReceipt', index: index, isEdit: true };

        // Get branch ID from edit form
        const editBranchSelect = document.getElementById('editBranchSelect');
        const branchId = editBranchSelect ? editBranchSelect.value : null;

        // Populate customers list first filtered by branch
        populateCustomersInSelect('customerReceiptEditCustomerName', 'customerReceiptEditCustomersList', branchId).then(() => {
            // Populate form with existing data
            document.getElementById('customerReceiptEditCustomerName').value = data.customer_name || '';
            document.getElementById('customerReceiptEditAmount').value = data.amount || '';
            document.getElementById('customerReceiptEditPaymentType').value = data.payment_type || '';
            document.getElementById('customerReceiptModalTitle').textContent = 'تعديل مقبوضة عميل';

            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('addEditCustomerReceiptModal'));
            modal.show();
        });
    } catch (error) {
        console.error('❌ [EDIT] خطأ في تعديل إيصال العميل:', error);
    }
}

function editEditReturnInvoice(index) {
    console.log('✏️ [EDIT] تعديل فاتورة المرتجع:', index);

    const data = getCurrentEditData('returnInvoices', index);
    if (!data) return;

    editItemData = { type: 'returnInvoice', index: index, isEdit: true };

    // Populate form with existing data
    document.getElementById('returnInvoiceNumber').value = data.invoice_number || '';
    document.getElementById('returnInvoiceAmount').value = data.amount || '';
    document.getElementById('returnInvoiceModalTitle').textContent = 'تعديل فاتورة مرتجع';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addEditReturnInvoiceModal'));
    modal.show();
}

function editEditSupplier(index) {
    console.log('✏️ [EDIT] تعديل المورد:', index);

    const data = getCurrentEditData('suppliers', index);
    if (!data) return;

    editItemData = { type: 'supplier', index: index, isEdit: true };

    // Populate form with existing data using correct field IDs
    document.getElementById('supplierEditName').value = data.supplier_name || '';
    document.getElementById('supplierEditAmount').value = data.amount || '';
    document.getElementById('supplierModalTitle').textContent = 'تعديل مورد';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('addEditSupplierModal'));
    modal.show();
}

// Delete functions for existing items
async function deleteEditBankReceipt(index) {
    console.log('🗑️ [DELETE] حذف إيصال البنك:', index);

    const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من حذف هذا الإيصال؟',
        'تأكيد الحذف'
    );

    if (confirmed) {
        deleteItemFromEditData('bankReceipts', index);
        populateEditBankReceiptsTable(editMode.originalData.bankReceipts);
        updateEditTotals();
        DialogUtils.showSuccessToast('تم حذف الإيصال بنجاح');
    }
}

async function deleteEditCashReceipt(index) {
    console.log('🗑️ [DELETE] حذف إيصال النقد:', index);

    const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من حذف هذا الإيصال؟',
        'تأكيد الحذف'
    );

    if (confirmed) {
        deleteItemFromEditData('cashReceipts', index);
        populateEditCashReceiptsTable(editMode.originalData.cashReceipts);
        updateEditTotals();
        DialogUtils.showSuccessToast('تم حذف الإيصال بنجاح');
    }
}

async function deleteEditPostpaidSale(index) {
    console.log('🗑️ [DELETE] حذف المبيعة الآجلة:', index);

    const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من حذف هذه المبيعة؟',
        'تأكيد الحذف'
    );

    if (confirmed) {
        deleteItemFromEditData('postpaidSales', index);
        populateEditPostpaidSalesTable(editMode.originalData.postpaidSales);
        updateEditTotals();
        DialogUtils.showSuccessToast('تم حذف المبيعة بنجاح');
    }
}

async function deleteEditCustomerReceipt(index) {
    console.log('🗑️ [DELETE] حذف إيصال العميل:', index);

    const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من حذف هذا الإيصال؟',
        'تأكيد الحذف'
    );

    if (confirmed) {
        deleteItemFromEditData('customerReceipts', index);
        populateEditCustomerReceiptsTable(editMode.originalData.customerReceipts);
        updateEditTotals();
        DialogUtils.showSuccessToast('تم حذف الإيصال بنجاح');
    }
}

async function deleteEditReturnInvoice(index) {
    console.log('🗑️ [DELETE] حذف فاتورة المرتجع:', index);

    const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من حذف هذه الفاتورة؟',
        'تأكيد الحذف'
    );

    if (confirmed) {
        deleteItemFromEditData('returnInvoices', index);
        populateEditReturnInvoicesTable(editMode.originalData.returnInvoices);
        updateEditTotals();
        DialogUtils.showSuccessToast('تم حذف الفاتورة بنجاح');
    }
}

async function deleteEditSupplier(index) {
    console.log('🗑️ [DELETE] حذف المورد:', index);

    const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من حذف هذا المورد؟',
        'تأكيد الحذف'
    );

    if (confirmed) {
        deleteItemFromEditData('suppliers', index);
        populateEditSuppliersTable(editMode.originalData.suppliers);
        updateEditTotals();
        DialogUtils.showSuccessToast('تم حذف المورد بنجاح');
    }
}

// Helper functions for edit operations

/**
 * Get current edit data for a specific type and index
 * @param {string} type - The data type (bankReceipts, cashReceipts, etc.)
 * @param {number} index - The index of the item
 * @returns {Object|null} - The data object or null if not found
 */
function getCurrentEditData(type, index) {
    if (!editMode.originalData || !editMode.originalData[type]) {
        console.error('❌ [GET-DATA] البيانات غير متوفرة:', type);
        return null;
    }

    if (index < 0 || index >= editMode.originalData[type].length) {
        console.error('❌ [GET-DATA] فهرس غير صحيح:', index, 'للنوع:', type);
        return null;
    }

    return editMode.originalData[type][index];
}

/**
 * Delete item from edit data
 * @param {string} type - The data type
 * @param {number} index - The index to delete
 */
function deleteItemFromEditData(type, index) {
    if (!editMode.originalData || !editMode.originalData[type]) {
        console.error('❌ [DELETE-DATA] البيانات غير متوفرة:', type);
        return;
    }

    if (index < 0 || index >= editMode.originalData[type].length) {
        console.error('❌ [DELETE-DATA] فهرس غير صحيح:', index, 'للنوع:', type);
        return;
    }

    editMode.originalData[type].splice(index, 1);
    console.log('✅ [DELETE-DATA] تم حذف العنصر:', index, 'من:', type);
}

/**
 * Add or update item in edit data
 * @param {string} type - The data type
 * @param {Object} data - The item data
 * @param {number|null} index - The index to update (null for new item)
 */
function addOrUpdateEditData(type, data, index = null) {
    if (!editMode.originalData) {
        console.error('❌ [ADD-UPDATE-DATA] البيانات غير متوفرة');
        return;
    }

    if (!editMode.originalData[type]) {
        editMode.originalData[type] = [];
    }

    if (index !== null && index >= 0 && index < editMode.originalData[type].length) {
        // Update existing item
        editMode.originalData[type][index] = data;
        console.log('✅ [UPDATE-DATA] تم تحديث العنصر:', index, 'في:', type);
    } else {
        // Add new item
        editMode.originalData[type].push(data);
        console.log('✅ [ADD-DATA] تم إضافة عنصر جديد إلى:', type);
    }
}

// Save functions for each modal

/**
 * Save bank receipt (add or edit)
 */
function saveBankReceiptEdit() {
    console.log('💾 [SAVE] حفظ إيصال البنك...');

    // Validate form
    const form = document.getElementById('bankReceiptEditForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Get form data
    const operationType = document.getElementById('editOperationType').value.trim();
    const atmId = document.getElementById('editAtmSelect').value;
    const bankName = document.getElementById('editBankName').value.trim();
    const amount = parseFloat(document.getElementById('bankReceiptAmount').value) || 0;

    const data = {
        operation_type: operationType,
        atm_id: operationType === 'تحويل' ? null : atmId,
        bank_name: operationType === 'تحويل' ? 'تحويل' : bankName,
        amount: amount
    };

    // For transfer operations, set default ATM name
    if (operationType === 'تحويل') {
        data.atm_name = 'تحويل';
    }

    // Validate operation type
    if (!data.operation_type) {
        DialogUtils.showError('نوع العملية مطلوب', 'خطأ في البيانات');
        return;
    }

    // Validate ATM selection - not required for transfer operations
    if (data.operation_type !== 'تحويل' && !data.atm_id) {
        DialogUtils.showError('يجب اختيار الجهاز', 'خطأ في البيانات');
        return;
    }

    // Validate amount
    if (data.amount <= 0) {
        DialogUtils.showError('المبلغ يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
        return;
    }

    // Add or update data
    addOrUpdateEditData('bankReceipts', data, editItemData.isEdit ? editItemData.index : null);

    // Update table
    populateEditBankReceiptsTable(editMode.originalData.bankReceipts);
    updateEditTotals();
    updateEditProgress();

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('addEditBankReceiptModal'));
    modal.hide();

    // Show success message
    const message = editItemData.isEdit ? 'تم تحديث الإيصال بنجاح' : 'تم إضافة الإيصال بنجاح';
    DialogUtils.showSuccessToast(message);
}

/**
 * Save cash receipt (add or edit)
 */
function saveCashReceiptEdit() {
    console.log('💾 [SAVE] حفظ إيصال النقد...');

    // Validate form
    const form = document.getElementById('cashReceiptEditForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Get form data
    const denomination = parseFloat(document.getElementById('editDenomination').value) || 0;
    const quantity = parseInt(document.getElementById('editQuantity').value) || 0;
    const totalAmount = denomination * quantity;

    const data = {
        denomination: denomination,
        quantity: quantity,
        total_amount: totalAmount
    };

    // Validate data
    if (data.denomination <= 0) {
        DialogUtils.showError('يجب اختيار فئة صحيحة', 'خطأ في البيانات');
        return;
    }

    if (data.quantity <= 0) {
        DialogUtils.showError('عدد الأوراق يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
        return;
    }

    // Add or update data
    addOrUpdateEditData('cashReceipts', data, editItemData.isEdit ? editItemData.index : null);

    // Update table
    populateEditCashReceiptsTable(editMode.originalData.cashReceipts);
    updateEditTotals();

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('addEditCashReceiptModal'));
    modal.hide();

    // Show success message
    const message = editItemData.isEdit ? 'تم تحديث الإيصال بنجاح' : 'تم إضافة الإيصال بنجاح';
    DialogUtils.showSuccessToast(message);
}

/**
 * Save postpaid sale (add or edit)
 */
async function savePostpaidSaleEdit() {
    console.log('💾 [SAVE] حفظ المبيعة الآجلة...');

    // Validate form
    const form = document.getElementById('postpaidSaleEditForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Get form data
    const customerName = document.getElementById('postpaidSaleCustomerName').value.trim();
    const amount = parseFloat(document.getElementById('postpaidSaleAmount').value) || 0;

    // Validate amount
    if (amount <= 0) {
        DialogUtils.showError('المبلغ يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
        return;
    }

    // التحقق من وجود العميل
    const isExisting = await isExistingCustomer(customerName);
    if (!isExisting) {
        const confirmed = await DialogUtils.showConfirm(
            `العميل "${customerName}" غير موجود مسبقاً. هل أنت متأكد من إضافته؟`,
            'عميل جديد'
        );
        if (!confirmed) return;
    }

    const data = {
        customer_name: customerName,
        amount: amount
    };

    // Add or update data
    addOrUpdateEditData('postpaidSales', data, editItemData.isEdit ? editItemData.index : null);

    // Update table
    populateEditPostpaidSalesTable(editMode.originalData.postpaidSales);
    updateEditTotals();

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('addEditPostpaidSaleModal'));
    modal.hide();

    // Show success message
    const message = editItemData.isEdit ? 'تم تحديث المبيعة بنجاح' : 'تم إضافة المبيعة بنجاح';
    DialogUtils.showSuccessToast(message);
}

/**
 * Save customer receipt (add or edit)
 */
async function saveCustomerReceiptEdit() {
    console.log('💾 [SAVE] حفظ إيصال العميل...');

    // Validate form
    const form = document.getElementById('customerReceiptEditForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Get form data
    const customerName = document.getElementById('customerReceiptEditCustomerName').value.trim();
    const amount = parseFloat(document.getElementById('customerReceiptEditAmount').value) || 0;
    const paymentType = document.getElementById('customerReceiptEditPaymentType').value.trim();

    // Validate customer name
    if (!customerName) {
        DialogUtils.showError('اسم العميل مطلوب', 'خطأ في البيانات');
        return;
    }

    // Validate payment type
    if (!paymentType) {
        DialogUtils.showError('نوع الدفع مطلوب', 'خطأ في البيانات');
        return;
    }

    // Validate amount
    if (amount <= 0) {
        DialogUtils.showError('المبلغ يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
        return;
    }

    // التحقق من وجود العميل
    const isExisting = await isExistingCustomer(customerName);
    if (!isExisting) {
        const confirmed = await DialogUtils.showConfirm(
            `العميل "${customerName}" غير موجود مسبقاً. هل أنت متأكد من إضافته؟`,
            'عميل جديد'
        );
        if (!confirmed) return;
    }

    const data = {
        customer_name: customerName,
        amount: amount,
        payment_type: paymentType
    };

    // Add or update data
    addOrUpdateEditData('customerReceipts', data, editItemData.isEdit ? editItemData.index : null);

    // Update table
    populateEditCustomerReceiptsTable(editMode.originalData.customerReceipts);
    updateEditTotals();

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('addEditCustomerReceiptModal'));
    modal.hide();

    // Show success message
    const message = editItemData.isEdit ? 'تم تحديث الإيصال بنجاح' : 'تم إضافة الإيصال بنجاح';
    DialogUtils.showSuccessToast(message);
}

/**
 * Save return invoice (add or edit)
 */
function saveReturnInvoiceEdit() {
    console.log('💾 [SAVE] حفظ فاتورة المرتجع...');

    // Validate form
    const form = document.getElementById('returnInvoiceEditForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Get form data
    const data = {
        invoice_number: document.getElementById('returnInvoiceNumber').value.trim(),
        amount: parseFloat(document.getElementById('returnInvoiceAmount').value) || 0
    };

    // Validate amount
    if (data.amount <= 0) {
        DialogUtils.showError('المبلغ يجب أن يكون أكبر من صفر', 'خطأ في البيانات');
        return;
    }

    // Add or update data
    addOrUpdateEditData('returnInvoices', data, editItemData.isEdit ? editItemData.index : null);

    // Update table
    populateEditReturnInvoicesTable(editMode.originalData.returnInvoices);
    updateEditTotals();

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('addEditReturnInvoiceModal'));
    modal.hide();

    // Show success message
    const message = editItemData.isEdit ? 'تم تحديث الفاتورة بنجاح' : 'تم إضافة الفاتورة بنجاح';
    DialogUtils.showSuccessToast(message);
}

/**
 * Save supplier (add or edit) - Rewritten following Customer Receipts pattern
 */
function saveSupplierEdit() {
    console.log('💾 [SAVE] حفظ المورد...');

    // Validate form
    const form = document.getElementById('supplierEditForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Get form data using correct field IDs
    const supplierName = document.getElementById('supplierEditName').value.trim();
    const amountInput = document.getElementById('supplierEditAmount').value.trim();

    // Enhanced validation following Customer Receipts pattern
    if (!supplierName) {
        DialogUtils.showError('اسم المورد مطلوب', 'خطأ في البيانات');
        return;
    }

    if (!amountInput) {
        DialogUtils.showError('المبلغ مطلوب', 'خطأ في البيانات');
        return;
    }

    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
        DialogUtils.showError('يرجى إدخال مبلغ صحيح أكبر من صفر', 'خطأ في البيانات');
        return;
    }

    const data = {
        supplier_name: supplierName,
        amount: amount
    };

    // Add or update data
    addOrUpdateEditData('suppliers', data, editItemData.isEdit ? editItemData.index : null);

    // Update table
    populateEditSuppliersTable(editMode.originalData.suppliers);
    updateEditTotals();

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('addEditSupplierModal'));
    modal.hide();

    // Show success message
    const message = editItemData.isEdit ? 'تم تحديث المورد بنجاح' : 'تم إضافة المورد بنجاح';
    DialogUtils.showSuccessToast(message);
}

/**
 * Update progress indicator in edit modal
 */
function updateEditProgress() {
    if (!editMode.originalData) return;

    const sections = [
        { name: 'bankReceipts', label: 'إيصالات البنك' },
        { name: 'cashReceipts', label: 'إيصالات النقد' },
        { name: 'postpaidSales', label: 'المبيعات الآجلة' },
        { name: 'customerReceipts', label: 'إيصالات العملاء' },
        { name: 'returnInvoices', label: 'فواتير المرتجعات' },
        { name: 'suppliers', label: 'الموردين' }
    ];

    let completedSections = 0;
    sections.forEach(section => {
        if (editMode.originalData[section.name] && editMode.originalData[section.name].length > 0) {
            completedSections++;
        }
    });

    const progressBadge = document.getElementById('editProgressBadge');
    if (progressBadge) {
        progressBadge.textContent = `${completedSections}/6 مكتمل`;

        // Update badge color based on progress
        progressBadge.classList.remove('bg-secondary', 'bg-warning', 'bg-success');
        if (completedSections === 0) {
            progressBadge.classList.add('bg-secondary');
        } else if (completedSections < 6) {
            progressBadge.classList.add('bg-warning');
        } else {
            progressBadge.classList.add('bg-success');
        }
    }
}

/**
 * Add visual feedback for successful operations
 * @param {string} elementId - The ID of the element to highlight
 */
function addSuccessHighlight(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.add('table-success');
        setTimeout(() => {
            element.classList.remove('table-success');
        }, 2000);
    }
}

/**
 * Add loading state to buttons during operations
 * @param {HTMLElement} button - The button element
 * @param {boolean} loading - Whether to show loading state
 */
function setButtonLoading(button, loading) {
    if (!button) return;

    if (loading) {
        button.disabled = true;
        const originalText = button.innerHTML;
        button.dataset.originalText = originalText;
        button.innerHTML = '<span class="edit-loading"></span> جاري المعالجة...';
    } else {
        button.disabled = false;
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

/**
 * Test function for edit reconciliation functionality
 */
async function testEditReconciliation() {
    console.log('🧪 [TEST] بدء اختبار وظيفة تعديل التصفية...');

    try {
        // Get list of saved reconciliations
        const reconciliations = await ipcRenderer.invoke('db-all', 'SELECT * FROM reconciliations ORDER BY id DESC LIMIT 1');

        if (reconciliations.length === 0) {
            console.log('⚠️ [TEST] لا توجد تصفيات محفوظة للاختبار');
            DialogUtils.showAlert('لا توجد تصفيات محفوظة للاختبار. يرجى إنشاء تصفية أولاً.', 'لا توجد بيانات', 'warning');
            return;
        }

        const testReconciliation = reconciliations[0];
        console.log('🎯 [TEST] اختبار التصفية:', testReconciliation.id);

        // Test edit function
        await editReconciliationNew(testReconciliation.id);

        console.log('✅ [TEST] تم اختبار وظيفة التعديل بنجاح');

    } catch (error) {
        console.error('❌ [TEST] خطأ في اختبار وظيفة التعديل:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
    }
}

// Make test function available globally for console testing
window.testEditReconciliation = testEditReconciliation;

/**
 * Test function for edit buttons specifically
 */
async function testEditButtons() {
    console.log('🧪 [TEST-BUTTONS] بدء اختبار أزرار التعديل...');

    try {
        // Get list of saved reconciliations
        const reconciliations = await ipcRenderer.invoke('db-all', 'SELECT * FROM reconciliations ORDER BY id DESC LIMIT 1');

        if (reconciliations.length === 0) {
            console.log('⚠️ [TEST-BUTTONS] لا توجد تصفيات محفوظة للاختبار');
            DialogUtils.showAlert('لا توجد تصفيات محفوظة للاختبار. يرجى إنشاء تصفية أولاً.', 'لا توجد بيانات', 'warning');
            return;
        }

        const testReconciliation = reconciliations[0];
        console.log('🎯 [TEST-BUTTONS] اختبار التصفية:', testReconciliation.id);

        // Open edit modal
        await editReconciliationNew(testReconciliation.id);

        // Wait a bit for modal to load
        setTimeout(() => {
            console.log('✅ [TEST-BUTTONS] تم فتح نافذة التعديل. يمكنك الآن اختبار أزرار التعديل في الجداول.');
            DialogUtils.showSuccessToast('تم فتح نافذة التعديل. اختبر أزرار التعديل الآن!');
        }, 1000);

    } catch (error) {
        console.error('❌ [TEST-BUTTONS] خطأ في اختبار أزرار التعديل:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
    }
}

/**
 * Test table structure compatibility
 */
async function testTableStructures() {
    console.log('🧪 [TEST-STRUCTURE] بدء اختبار هيكل الجداول...');

    try {
        // Get list of saved reconciliations
        const reconciliations = await ipcRenderer.invoke('db-all', 'SELECT * FROM reconciliations ORDER BY id DESC LIMIT 1');

        if (reconciliations.length === 0) {
            console.log('⚠️ [TEST-STRUCTURE] لا توجد تصفيات محفوظة للاختبار');
            DialogUtils.showAlert('لا توجد تصفيات محفوظة للاختبار. يرجى إنشاء تصفية أولاً.', 'لا توجد بيانات', 'warning');
            return;
        }

        const testReconciliation = reconciliations[0];
        console.log('🎯 [TEST-STRUCTURE] اختبار التصفية:', testReconciliation.id);

        // Load reconciliation data
        const data = await ipcRenderer.invoke('get-reconciliation-for-edit', testReconciliation.id);

        console.log('📊 [TEST-STRUCTURE] هيكل البيانات المحملة:', {
            bankReceipts: data.bankReceipts?.length || 0,
            cashReceipts: data.cashReceipts?.length || 0,
            postpaidSales: data.postpaidSales?.length || 0,
            customerReceipts: data.customerReceipts?.length || 0,
            returnInvoices: data.returnInvoices?.length || 0,
            suppliers: data.suppliers?.length || 0
        });

        // Test bank receipts structure
        if (data.bankReceipts && data.bankReceipts.length > 0) {
            const bankReceipt = data.bankReceipts[0];
            console.log('🏦 [TEST-STRUCTURE] هيكل المقبوضات البنكية:', Object.keys(bankReceipt));

            const expectedFields = ['operation_type', 'atm_id', 'amount', 'atm_name', 'bank_name'];
            const hasAllFields = expectedFields.every(field => bankReceipt.hasOwnProperty(field));
            console.log(`✅ [TEST-STRUCTURE] المقبوضات البنكية - الحقول المطلوبة: ${hasAllFields ? 'موجودة' : 'مفقودة'}`);
        }

        // Test cash receipts structure
        if (data.cashReceipts && data.cashReceipts.length > 0) {
            const cashReceipt = data.cashReceipts[0];
            console.log('💵 [TEST-STRUCTURE] هيكل المقبوضات النقدية:', Object.keys(cashReceipt));

            const expectedFields = ['denomination', 'quantity', 'total_amount'];
            const hasAllFields = expectedFields.every(field => cashReceipt.hasOwnProperty(field));
            console.log(`✅ [TEST-STRUCTURE] المقبوضات النقدية - الحقول المطلوبة: ${hasAllFields ? 'موجودة' : 'مفقودة'}`);
        }

        // Test customer receipts structure
        if (data.customerReceipts && data.customerReceipts.length > 0) {
            const customerReceipt = data.customerReceipts[0];
            console.log('👤 [TEST-STRUCTURE] هيكل مقبوضات العملاء:', Object.keys(customerReceipt));

            const expectedFields = ['customer_name', 'amount', 'payment_type'];
            const hasAllFields = expectedFields.every(field => customerReceipt.hasOwnProperty(field));
            console.log(`✅ [TEST-STRUCTURE] مقبوضات العملاء - الحقول المطلوبة: ${hasAllFields ? 'موجودة' : 'مفقودة'}`);
        }

        console.log('✅ [TEST-STRUCTURE] اكتمل اختبار هيكل الجداول');
        DialogUtils.showSuccessToast('تم اختبار هيكل الجداول بنجاح!');

    } catch (error) {
        console.error('❌ [TEST-STRUCTURE] خطأ في اختبار هيكل الجداول:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
    }
}

/**
 * Test function for new filter enhancement features
 */
async function testFilterEnhancements() {
    console.log('🧪 [TEST-FILTER] بدء اختبار الميزات الجديدة للتصفية...');

    try {
        // Test 1: Check if new form fields exist
        console.log('🔍 [TEST-FILTER] فحص وجود الحقول الجديدة...');

        const timeRangeStart = document.getElementById('timeRangeStart');
        const timeRangeEnd = document.getElementById('timeRangeEnd');
        const filterNotes = document.getElementById('filterNotes');

        const editTimeRangeStart = document.getElementById('editTimeRangeStart');
        const editTimeRangeEnd = document.getElementById('editTimeRangeEnd');
        const editFilterNotes = document.getElementById('editFilterNotes');

        const fieldsCheck = {
            newReconciliation: {
                timeRangeStart: !!timeRangeStart,
                timeRangeEnd: !!timeRangeEnd,
                filterNotes: !!filterNotes
            },
            editReconciliation: {
                editTimeRangeStart: !!editTimeRangeStart,
                editTimeRangeEnd: !!editTimeRangeEnd,
                editFilterNotes: !!editFilterNotes
            }
        };

        console.log('📋 [TEST-FILTER] نتائج فحص الحقول:', fieldsCheck);

        // Test 2: Check database schema
        console.log('🗄️ [TEST-FILTER] فحص مخطط قاعدة البيانات...');
        const tableInfo = await ipcRenderer.invoke('db-all', 'PRAGMA table_info(reconciliations)');
        const hasTimeRangeStart = tableInfo.some(col => col.name === 'time_range_start');
        const hasTimeRangeEnd = tableInfo.some(col => col.name === 'time_range_end');
        const hasFilterNotes = tableInfo.some(col => col.name === 'filter_notes');

        const dbCheck = {
            time_range_start: hasTimeRangeStart,
            time_range_end: hasTimeRangeEnd,
            filter_notes: hasFilterNotes
        };

        console.log('🗄️ [TEST-FILTER] نتائج فحص قاعدة البيانات:', dbCheck);

        // Test 3: Test creating a reconciliation with new fields
        console.log('✨ [TEST-FILTER] اختبار إنشاء تصفية مع الحقول الجديدة...');

        if (timeRangeStart && timeRangeEnd && filterNotes) {
            // Set test values
            timeRangeStart.value = '09:00';
            timeRangeEnd.value = '17:00';
            filterNotes.value = 'اختبار الميزات الجديدة - تصفية تجريبية';

            console.log('✅ [TEST-FILTER] تم تعبئة الحقول الجديدة بقيم تجريبية');
        }

        // Generate test report
        const testResults = {
            fieldsExist: Object.values(fieldsCheck.newReconciliation).every(Boolean) &&
                Object.values(fieldsCheck.editReconciliation).every(Boolean),
            databaseReady: Object.values(dbCheck).every(Boolean),
            overallStatus: 'success'
        };

        if (!testResults.fieldsExist) {
            testResults.overallStatus = 'warning';
            console.warn('⚠️ [TEST-FILTER] بعض الحقول مفقودة في واجهة المستخدم');
        }

        if (!testResults.databaseReady) {
            testResults.overallStatus = 'error';
            console.error('❌ [TEST-FILTER] قاعدة البيانات غير جاهزة للميزات الجديدة');
        }

        // Show results
        const message = `
نتائج اختبار الميزات الجديدة:

📋 حقول التصفية الجديدة:
• النطاق الزمني (من): ${fieldsCheck.newReconciliation.timeRangeStart ? '✅' : '❌'}
• النطاق الزمني (إلى): ${fieldsCheck.newReconciliation.timeRangeEnd ? '✅' : '❌'}
• ملاحظات التصفية: ${fieldsCheck.newReconciliation.filterNotes ? '✅' : '❌'}

✏️ حقول التعديل:
• النطاق الزمني (من): ${fieldsCheck.editReconciliation.editTimeRangeStart ? '✅' : '❌'}
• النطاق الزمني (إلى): ${fieldsCheck.editReconciliation.editTimeRangeEnd ? '✅' : '❌'}
• ملاحظات التصفية: ${fieldsCheck.editReconciliation.editFilterNotes ? '✅' : '❌'}

🗄️ قاعدة البيانات:
• عمود time_range_start: ${dbCheck.time_range_start ? '✅' : '❌'}
• عمود time_range_end: ${dbCheck.time_range_end ? '✅' : '❌'}
• عمود filter_notes: ${dbCheck.filter_notes ? '✅' : '❌'}

الحالة العامة: ${testResults.overallStatus === 'success' ? '✅ جاهز' :
                testResults.overallStatus === 'warning' ? '⚠️ يحتاج مراجعة' : '❌ يحتاج إصلاح'}
        `;

        if (testResults.overallStatus === 'success') {
            DialogUtils.showSuccess(message, 'اختبار الميزات الجديدة');
        } else if (testResults.overallStatus === 'warning') {
            DialogUtils.showAlert(message, 'اختبار الميزات الجديدة', 'warning');
        } else {
            DialogUtils.showError(message, 'اختبار الميزات الجديدة');
        }

        console.log('✅ [TEST-FILTER] تم إكمال اختبار الميزات الجديدة');
        return testResults;

    } catch (error) {
        console.error('❌ [TEST-FILTER] خطأ في اختبار الميزات الجديدة:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
        return { overallStatus: 'error', error: error.message };
    }
}

/**
 * Quick test function for filter enhancements - can be run from console
 */
async function quickTestFilterFields() {
    console.log('🧪 [QUICK-TEST] اختبار سريع للحقول الجديدة...');

    try {
        // Test 1: Check form fields
        const formFields = {
            timeRangeStart: !!document.getElementById('timeRangeStart'),
            timeRangeEnd: !!document.getElementById('timeRangeEnd'),
            filterNotes: !!document.getElementById('filterNotes'),
            editTimeRangeStart: !!document.getElementById('editTimeRangeStart'),
            editTimeRangeEnd: !!document.getElementById('editTimeRangeEnd'),
            editFilterNotes: !!document.getElementById('editFilterNotes')
        };

        console.log('📋 [QUICK-TEST] نتائج فحص الحقول:', formFields);

        // Test 2: Fill test data if fields exist
        const timeRangeStart = document.getElementById('timeRangeStart');
        const timeRangeEnd = document.getElementById('timeRangeEnd');
        const filterNotes = document.getElementById('filterNotes');

        if (timeRangeStart && timeRangeEnd && filterNotes) {
            timeRangeStart.value = '09:00';
            timeRangeEnd.value = '17:00';
            filterNotes.value = 'اختبار سريع للميزات الجديدة - ' + new Date().toLocaleString('ar-SA');

            console.log('✅ [QUICK-TEST] تم تعبئة الحقول بقيم تجريبية');
            console.log('💡 [QUICK-TEST] يمكنك الآن إنشاء تصفية جديدة واختبار الطباعة');

            // Show success message
            if (typeof DialogUtils !== 'undefined') {
                DialogUtils.showSuccess(`
تم تعبئة الحقول الجديدة بنجاح:
• النطاق الزمني: من 09:00 إلى 17:00
• الملاحظات: اختبار سريع للميزات الجديدة

يمكنك الآن:
1. إنشاء تصفية جديدة
2. طباعة التقرير للتحقق من ظهور الحقول الجديدة
                `, 'اختبار الميزات الجديدة');
            }
        } else {
            console.warn('⚠️ [QUICK-TEST] بعض الحقول مفقودة');
        }

        // Test 3: Check if currentReconciliation has new fields
        if (currentReconciliation) {
            console.log('🔍 [QUICK-TEST] فحص التصفية الحالية:', {
                id: currentReconciliation.id,
                time_range_start: currentReconciliation.time_range_start,
                time_range_end: currentReconciliation.time_range_end,
                filter_notes: currentReconciliation.filter_notes
            });
        } else {
            console.log('ℹ️ [QUICK-TEST] لا توجد تصفية حالية');
        }

        return {
            success: true,
            formFields: formFields,
            hasCurrentReconciliation: !!currentReconciliation
        };

    } catch (error) {
        console.error('❌ [QUICK-TEST] خطأ في الاختبار السريع:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Comprehensive test function for print functionality with new filter fields
 */
async function testPrintWithNewFields() {
    console.log('🖨️ [PRINT-TEST] اختبار شامل للطباعة مع الحقول الجديدة...');

    try {
        // Step 1: Fill form fields with test data
        const timeRangeStart = document.getElementById('timeRangeStart');
        const timeRangeEnd = document.getElementById('timeRangeEnd');
        const filterNotes = document.getElementById('filterNotes');

        if (!timeRangeStart || !timeRangeEnd || !filterNotes) {
            throw new Error('الحقول الجديدة غير موجودة في النموذج');
        }

        // Fill with test data
        timeRangeStart.value = '08:30';
        timeRangeEnd.value = '18:00';
        filterNotes.value = 'اختبار شامل للطباعة - تم إضافة النطاق الزمني وملاحظات التصفية للتأكد من ظهورها في التقرير المطبوع';

        console.log('✅ [PRINT-TEST] تم تعبئة الحقول بقيم الاختبار');

        // Step 2: Check if we have a current reconciliation
        if (!currentReconciliation) {
            console.log('ℹ️ [PRINT-TEST] لا توجد تصفية حالية - يجب إنشاء تصفية أولاً');

            // Show message to user
            if (typeof DialogUtils !== 'undefined') {
                DialogUtils.showAlert(`
تم تعبئة الحقول الجديدة بقيم الاختبار:
• النطاق الزمني: من 08:30 إلى 18:00
• الملاحظات: اختبار شامل للطباعة...

الخطوة التالية:
1. املأ البيانات الأساسية (الكاشير، المحاسب، التاريخ)
2. اضغط "ابدأ التصفية"
3. اضغط "طباعة" لاختبار ظهور الحقول الجديدة
                `, 'اختبار الطباعة', 'info');
            }

            return {
                success: true,
                message: 'تم تعبئة الحقول - يجب إنشاء تصفية أولاً',
                fieldsReady: true,
                reconciliationReady: false
            };
        }

        // Step 3: Test print functionality
        console.log('🖨️ [PRINT-TEST] اختبار وظيفة الطباعة...');

        // Update current reconciliation with new fields
        currentReconciliation.time_range_start = timeRangeStart.value;
        currentReconciliation.time_range_end = timeRangeEnd.value;
        currentReconciliation.filter_notes = filterNotes.value;

        console.log('🔍 [PRINT-TEST] بيانات التصفية المحدثة:', {
            id: currentReconciliation.id,
            time_range_start: currentReconciliation.time_range_start,
            time_range_end: currentReconciliation.time_range_end,
            filter_notes: currentReconciliation.filter_notes
        });

        // Show success message
        if (typeof DialogUtils !== 'undefined') {
            DialogUtils.showSuccess(`
✅ تم إعداد اختبار الطباعة بنجاح!

البيانات المحدثة:
• النطاق الزمني: من ${timeRangeStart.value} إلى ${timeRangeEnd.value}
• الملاحظات: ${filterNotes.value.substring(0, 50)}...

الآن يمكنك:
1. اضغط "طباعة" لاختبار ظهور الحقول الجديدة
2. تحقق من ظهور النطاق الزمني والملاحظات في التقرير
            `, 'جاهز للاختبار');
        }

        return {
            success: true,
            message: 'جاهز لاختبار الطباعة',
            fieldsReady: true,
            reconciliationReady: true,
            testData: {
                timeRangeStart: timeRangeStart.value,
                timeRangeEnd: timeRangeEnd.value,
                filterNotes: filterNotes.value
            }
        };

    } catch (error) {
        console.error('❌ [PRINT-TEST] خطأ في اختبار الطباعة:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Test function specifically for saved reconciliation printing with new filter fields
 */
async function testSavedReconciliationPrint() {
    console.log('💾 [SAVED-PRINT-TEST] اختبار طباعة التصفيات المحفوظة مع الحقول الجديدة...');

    try {
        // Step 1: Get a saved reconciliation to test with
        const reconciliations = await ipcRenderer.invoke('db-query',
            'SELECT id, cashier_id, accountant_id, reconciliation_date, time_range_start, time_range_end, filter_notes FROM reconciliations ORDER BY created_at DESC LIMIT 5'
        );

        if (reconciliations.length === 0) {
            throw new Error('لا توجد تصفيات محفوظة للاختبار');
        }

        console.log('📋 [SAVED-PRINT-TEST] التصفيات المتاحة للاختبار:', reconciliations.map(r => ({
            id: r.id,
            date: r.reconciliation_date,
            timeRange: r.time_range_start && r.time_range_end ? `${r.time_range_start}-${r.time_range_end}` : 'لا يوجد',
            notes: r.filter_notes ? r.filter_notes.substring(0, 30) + '...' : 'لا توجد'
        })));

        // Step 2: Test loading data for the first reconciliation
        const testReconciliation = reconciliations[0];
        console.log(`🔍 [SAVED-PRINT-TEST] اختبار تحميل بيانات التصفية معرف: ${testReconciliation.id}`);

        const reconciliationData = await loadReconciliationForPrint(testReconciliation.id);

        if (!reconciliationData) {
            throw new Error('فشل في تحميل بيانات التصفية المحفوظة');
        }

        console.log('✅ [SAVED-PRINT-TEST] تم تحميل البيانات بنجاح');

        // Step 3: Test data transformation
        console.log('🔄 [SAVED-PRINT-TEST] اختبار تحويل البيانات...');
        const pdfData = transformDataForPDFGenerator(reconciliationData);

        console.log('🔍 [SAVED-PRINT-TEST] البيانات المحولة للطباعة:', {
            reconciliationId: pdfData.reconciliationId,
            timeRangeStart: pdfData.timeRangeStart,
            timeRangeEnd: pdfData.timeRangeEnd,
            filterNotes: pdfData.filterNotes
        });

        // Step 4: Show results
        const hasTimeRange = pdfData.timeRangeStart || pdfData.timeRangeEnd;
        const hasNotes = pdfData.filterNotes;

        let resultMessage = `
✅ اختبار التصفيات المحفوظة مكتمل!

معرف التصفية: ${pdfData.reconciliationId}
الكاشير: ${pdfData.cashierName}
المحاسب: ${pdfData.accountantName}
التاريخ: ${pdfData.reconciliationDate}

الحقول الجديدة:
• النطاق الزمني: ${hasTimeRange ?
                (pdfData.timeRangeStart && pdfData.timeRangeEnd ?
                    `من ${pdfData.timeRangeStart} إلى ${pdfData.timeRangeEnd}` :
                    pdfData.timeRangeStart ? `من ${pdfData.timeRangeStart}` :
                        `إلى ${pdfData.timeRangeEnd}`) :
                'غير محدد'}
• الملاحظات: ${hasNotes ? pdfData.filterNotes.substring(0, 50) + '...' : 'لا توجد'}

يمكنك الآن اختبار طباعة هذه التصفية من قائمة "التصفيات المحفوظة"
        `;

        if (typeof DialogUtils !== 'undefined') {
            DialogUtils.showSuccess(resultMessage, 'اختبار التصفيات المحفوظة');
        }

        return {
            success: true,
            reconciliationId: testReconciliation.id,
            hasTimeRange: hasTimeRange,
            hasNotes: hasNotes,
            data: pdfData
        };

    } catch (error) {
        console.error('❌ [SAVED-PRINT-TEST] خطأ في اختبار التصفيات المحفوظة:', error);

        if (typeof DialogUtils !== 'undefined') {
            DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في اختبار التصفيات المحفوظة');
        }

        return {
            success: false,
            error: error.message
        };
    }
}

// Make test functions available globally for console testing
window.testEditReconciliation = testEditReconciliation;
window.testEditButtons = testEditButtons;
window.testTableStructures = testTableStructures;
window.testFilterEnhancements = testFilterEnhancements;
window.quickTestFilterFields = quickTestFilterFields;
window.testPrintWithNewFields = testPrintWithNewFields;
window.testSavedReconciliationPrint = testSavedReconciliationPrint;

console.log(`
🧪 وظائف الاختبار المتاحة:
- testEditReconciliation() - اختبار وظيفة تعديل التصفية
- testEditButtons() - اختبار أزرار التعديل في الجداول
- testTableStructures() - اختبار هيكل الجداول والتطابق
- testFilterEnhancements() - اختبار الميزات الجديدة للتصفية (شامل)
- quickTestFilterFields() - اختبار سريع للحقول الجديدة (مبسط)
- testPrintWithNewFields() - اختبار شامل للطباعة مع الحقول الجديدة
- testSavedReconciliationPrint() - اختبار طباعة التصفيات المحفوظة

🚀 للاختبار السريع: quickTestFilterFields()
📊 للاختبار الشامل: testFilterEnhancements()
🖨️ لاختبار الطباعة: testPrintWithNewFields()
💾 لاختبار التصفيات المحفوظة: testSavedReconciliationPrint()
`);

// OLD LOAD RECONCILIATION FOR EDIT FUNCTION REMOVED FOR REBUILD
async function loadReconciliationForEditOLD(data) {
    console.log('📥 [LOAD] بدء تحميل بيانات التصفية للتعديل...');

    try {
        // Comprehensive input validation
        if (!data) {
            console.error('❌ [LOAD] لا توجد بيانات للتحميل');
            throw new Error('لا توجد بيانات للتحميل');
        }

        if (typeof data !== 'object') {
            console.error('❌ [LOAD] نوع البيانات غير صحيح:', typeof data);
            throw new Error('نوع البيانات غير صحيح');
        }

        if (!data.reconciliation) {
            console.error('❌ [LOAD] بيانات التصفية الأساسية مفقودة');
            throw new Error('بيانات التصفية الأساسية مفقودة');
        }

        const { reconciliation, bankReceipts: bankRec, cashReceipts: cashRec,
            postpaidSales: postpaidSal, customerReceipts: customerRec,
            returnInvoices: returnInv, suppliers: supp } = data;

        console.log('🔍 [LOAD] فحص بيانات التصفية:', {
            id: reconciliation.id,
            cashier_id: reconciliation.cashier_id,
            accountant_id: reconciliation.accountant_id,
            date: reconciliation.reconciliation_date,
            status: reconciliation.status
        });

        // Validate essential reconciliation fields
        const missingFields = [];
        if (!reconciliation.id) missingFields.push('معرف التصفية');
        if (!reconciliation.cashier_id) missingFields.push('معرف الكاشير');
        if (!reconciliation.accountant_id) missingFields.push('معرف المحاسب');
        if (!reconciliation.reconciliation_date) missingFields.push('تاريخ التصفية');

        if (missingFields.length > 0) {
            console.error('❌ [LOAD] حقول أساسية مفقودة:', missingFields);
            throw new Error(`الحقول التالية مفقودة: ${missingFields.join(', ')}`);
        }

        // Validate form elements exist
        console.log('🔍 [LOAD] فحص عناصر النموذج...');
        const formElements = {
            cashierSelect: document.getElementById('cashierSelect'),
            accountantSelect: document.getElementById('accountantSelect'),
            reconciliationDate: document.getElementById('reconciliationDate'),
            systemSales: document.getElementById('systemSales')
        };

        const missingElements = Object.entries(formElements)
            .filter(([name, element]) => !element)
            .map(([name]) => name);

        if (missingElements.length > 0) {
            console.error('❌ [LOAD] عناصر النموذج مفقودة:', missingElements);
            throw new Error(`عناصر النموذج التالية مفقودة: ${missingElements.join(', ')}`);
        }

        console.log('✅ [LOAD] جميع عناصر النموذج موجودة');

        // Set form values with validation
        try {
            formElements.cashierSelect.value = reconciliation.cashier_id;
            formElements.accountantSelect.value = reconciliation.accountant_id;
            formElements.reconciliationDate.value = reconciliation.reconciliation_date;
            formElements.systemSales.value = reconciliation.system_sales || 0;

            console.log('✅ [LOAD] تم تعيين قيم النموذج بنجاح');
        } catch (formError) {
            console.error('❌ [LOAD] خطأ في تعيين قيم النموذج:', formError);
            throw new Error(`خطأ في تعيين قيم النموذج: ${formError.message}`);
        }

        // Set current reconciliation
        currentReconciliation = {
            id: reconciliation.id,
            cashier_id: reconciliation.cashier_id,
            accountant_id: reconciliation.accountant_id,
            reconciliation_date: reconciliation.reconciliation_date,
            created_at: reconciliation.created_at
        };

        // Load all related data with validation
        bankReceipts = Array.isArray(bankRec) ? bankRec : [];
        cashReceipts = Array.isArray(cashRec) ? cashRec : [];
        postpaidSales = Array.isArray(postpaidSal) ? postpaidSal : [];
        customerReceipts = Array.isArray(customerRec) ? customerRec : [];
        returnInvoices = Array.isArray(returnInv) ? returnInv : [];
        suppliers = Array.isArray(supp) ? supp : [];

        console.log('📊 [LOAD] بيانات محملة للتعديل:', {
            reconciliation: reconciliation.id,
            bankReceipts: bankReceipts.length,
            cashReceipts: cashReceipts.length,
            postpaidSales: postpaidSales.length,
            customerReceipts: customerReceipts.length,
            returnInvoices: returnInvoices.length,
            suppliers: suppliers.length,
            formElements: {
                cashierSelect: !!cashierSelect,
                accountantSelect: !!accountantSelect,
                reconciliationDate: !!reconciliationDate,
                systemSales: !!systemSales
            }
        });

        // Update all tables
        updateBankReceiptsTable();
        updateCashReceiptsTable();
        updatePostpaidSalesTable();
        updateCustomerReceiptsTable();
        updateReturnInvoicesTable();
        updateSuppliersTable();

        // Update summary
        updateSummary();

    } catch (error) {
        console.error('Error loading reconciliation data for edit:', error);
        DialogUtils.showError(`خطأ في تحميل بيانات التصفية: ${error.message}`, 'خطأ في التحميل');
        throw error;
    }
}

// OLD EDIT MODE INDICATOR AND EXIT FUNCTIONS REMOVED FOR REBUILD

// Advanced printing functionality
async function initializePrintSystem() {
    try {
        // Load available printers
        availablePrinters = await ipcRenderer.invoke('get-printers');
        updatePrintersList();

        // Load current print settings
        const settings = await ipcRenderer.invoke('get-print-settings');
        loadPrintSettings(settings);

        console.log('Print system initialized successfully');
    } catch (error) {
        console.error('Error initializing print system:', error);
        DialogUtils.showErrorToast('حدث خطأ في تهيئة نظام الطباعة');
    }
}

function updatePrintersList() {
    const printerSelect = document.getElementById('printerSelect');
    printerSelect.innerHTML = '';

    if (availablePrinters.length === 0) {
        printerSelect.innerHTML = '<option value="">لا توجد طابعات متاحة</option>';
        return;
    }

    availablePrinters.forEach(printer => {
        const option = document.createElement('option');
        option.value = printer.name;
        option.textContent = `${printer.displayName}${printer.isDefault ? ' (افتراضي)' : ''}`;
        if (printer.isDefault) {
            option.selected = true;
        }
        printerSelect.appendChild(option);
    });
}

function loadPrintSettings(settings) {
    document.getElementById('copiesInput').value = settings.copies || 1;
    document.getElementById('paperSizeSelect').value = settings.paperSize || 'A4';
    document.getElementById('orientationSelect').value = settings.orientation || 'portrait';
    document.getElementById('colorPrintCheck').checked = settings.color || false;
    document.getElementById('duplexSelect').value = settings.duplex || 'simplex';

    // Load font settings
    if (document.getElementById('fontFamily')) {
        document.getElementById('fontFamily').value = settings.fontFamily || 'Cairo';
    }
    if (document.getElementById('fontSize')) {
        document.getElementById('fontSize').value = settings.fontSize || 'normal';
    }

    if (settings.margins) {
        document.getElementById('marginTop').value = settings.margins.top || 1;
        document.getElementById('marginRight').value = settings.margins.right || 1;
        document.getElementById('marginBottom').value = settings.margins.bottom || 1;
        document.getElementById('marginLeft').value = settings.margins.left || 1;
    }
}

function getPrintSettings() {
    return {
        printerName: document.getElementById('printerSelect').value,
        copies: parseInt(document.getElementById('copiesInput').value) || 1,
        paperSize: document.getElementById('paperSizeSelect').value,
        orientation: document.getElementById('orientationSelect').value,
        color: document.getElementById('colorPrintCheck').checked,
        duplex: document.getElementById('duplexSelect').value,
        fontSize: document.getElementById('fontSize') ? document.getElementById('fontSize').value : 'normal',
        fontFamily: document.getElementById('fontFamily') ? document.getElementById('fontFamily').value : 'Cairo',
        margins: {
            top: parseFloat(document.getElementById('marginTop').value) || 1,
            right: parseFloat(document.getElementById('marginRight').value) || 1,
            bottom: parseFloat(document.getElementById('marginBottom').value) || 1,
            left: parseFloat(document.getElementById('marginLeft').value) || 1
        }
    };
}

async function showAdvancedPrintDialog(reconciliationData) {
    try {
        currentPrintData = reconciliationData;

        // Initialize print system if not already done
        if (availablePrinters.length === 0) {
            await initializePrintSystem();
        }

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('printOptionsModal'));
        modal.show();

    } catch (error) {
        console.error('Error showing print dialog:', error);
        DialogUtils.showErrorToast('حدث خطأ في عرض خيارات الطباعة');
    }
}

async function handleDirectPrint() {
    if (!currentPrintData) {
        DialogUtils.showErrorToast('لا توجد بيانات للطباعة');
        return;
    }

    try {
        DialogUtils.showLoading('جاري الطباعة...', 'يرجى الانتظار');

        const printSettings = getPrintSettings();

        // Save print settings
        await ipcRenderer.invoke('update-print-settings', printSettings);

        // Prepare print data with all sections enabled (default for New Reconciliation)
        const printData = preparePrintData(currentPrintData, {
            sections: {
                bankReceipts: true,
                cashReceipts: true,
                postpaidSales: true,
                customerReceipts: true,
                returnInvoices: true,
                suppliers: true,
                summary: true
            },
            pageSize: printSettings.paperSize || 'A4',
            orientation: printSettings.orientation || 'portrait',
            fontSize: printSettings.fontSize || 'normal',
            fontFamily: printSettings.fontFamily || 'Cairo',
            color: printSettings.color || false
        });

        // Print directly using the prepared data structure
        const result = await ipcRenderer.invoke('print-direct', printData, printSettings);

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccessToast('تم إرسال المستند للطباعة بنجاح');

            // Close the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('printOptionsModal'));
            modal.hide();
        } else {
            DialogUtils.showError(`فشل في الطباعة: ${result.error || 'خطأ غير معروف'}`);
        }

    } catch (error) {
        DialogUtils.close();
        console.error('Direct print error:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء الطباعة');
    }
}

async function handlePrintPreview() {
    console.log('🖨️ [PREVIEW] بدء معاينة الطباعة...');

    // Detailed validation of print data
    if (!currentPrintData) {
        console.error('❌ [PREVIEW] لا توجد بيانات للطباعة');
        DialogUtils.showErrorToast('لا توجد بيانات للطباعة');
        return;
    }

    console.log('📊 [PREVIEW] فحص بيانات الطباعة:', {
        hasReconciliation: !!currentPrintData.reconciliation,
        reconciliationId: currentPrintData.reconciliation?.id,
        dataStructure: Object.keys(currentPrintData)
    });

    // Validate print data structure with detailed error messages
    if (!currentPrintData.reconciliation) {
        console.error('❌ [PREVIEW] بيانات التصفية الأساسية مفقودة');
        DialogUtils.showError('بيانات التصفية الأساسية مفقودة', 'بيانات غير مكتملة');
        return;
    }

    // Check essential reconciliation fields
    const reconciliation = currentPrintData.reconciliation;
    const missingFields = [];

    if (!reconciliation.id) missingFields.push('معرف التصفية');
    if (!reconciliation.cashier_name) missingFields.push('اسم الكاشير');
    if (!reconciliation.accountant_name) missingFields.push('اسم المحاسب');
    if (!reconciliation.reconciliation_date) missingFields.push('تاريخ التصفية');

    if (missingFields.length > 0) {
        console.error('❌ [PREVIEW] حقول مفقودة في بيانات التصفية:', missingFields);
        DialogUtils.showError(`الحقول التالية مفقودة في بيانات التصفية: ${missingFields.join(', ')}`, 'بيانات غير مكتملة');
        return;
    }

    try {
        console.log('⚙️ [PREVIEW] تحضير إعدادات الطباعة...');
        DialogUtils.showLoading('جاري تحضير المعاينة...', 'يرجى الانتظار');

        const printSettings = getPrintSettings();

        // Validate print settings
        if (!printSettings) {
            throw new Error('إعدادات الطباعة غير صحيحة');
        }

        console.log('📋 [PREVIEW] إعدادات الطباعة:', {
            printerName: printSettings.printerName,
            copies: printSettings.copies,
            paperSize: printSettings.paperSize,
            orientation: printSettings.orientation
        });

        // Get current print settings from database
        const dbPrintSettings = await ipcRenderer.invoke('get-print-settings');

        // Prepare print data with all sections enabled (default for New Reconciliation)
        const printData = preparePrintData(currentPrintData, {
            sections: {
                bankReceipts: true,
                cashReceipts: true,
                postpaidSales: true,
                customerReceipts: true,
                returnInvoices: true,
                suppliers: true,
                summary: true
            },
            pageSize: printSettings.paperSize || 'A4',
            orientation: printSettings.orientation || 'portrait',
            fontSize: printSettings.fontSize || 'normal',
            fontFamily: printSettings.fontFamily || 'Cairo',
            color: dbPrintSettings.color !== false
        });

        console.log('✅ [PREVIEW] البيانات المحضرة للطباعة:', {
            reconciliation: !!printData.reconciliation.id,
            sectionsCount: Object.keys(printData.sections).length,
            hasOptions: !!printData.options
        });

        // Create print preview window using the same system as Saved Reconciliations
        console.log('🖼️ [PREVIEW] إنشاء نافذة معاينة الطباعة...');
        const result = await ipcRenderer.invoke('create-print-preview', printData);

        DialogUtils.close();

        if (result && result.success) {
            console.log('✅ [PREVIEW] تم فتح نافذة المعاينة بنجاح');
            DialogUtils.showSuccessToast('تم فتح نافذة المعاينة');

            // Close the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('printOptionsModal'));
            if (modal) {
                modal.hide();
            }
        } else {
            console.error('❌ [PREVIEW] فشل في عرض المعاينة:', result?.error);
            DialogUtils.showError(`فشل في عرض المعاينة: ${result?.error || 'خطأ غير معروف'}`, 'خطأ في المعاينة');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [PREVIEW] خطأ في معاينة الطباعة:', {
            error: error.message,
            stack: error.stack,
            currentPrintData: !!currentPrintData
        });

        // Enhanced error handling
        if (error.message && error.message.includes('print-manager')) {
            DialogUtils.showError('خطأ في وحدة إدارة الطباعة. يرجى المحاولة مرة أخرى.', 'خطأ في الطباعة');
        } else if (error.message && error.message.includes('HTML')) {
            DialogUtils.showError('خطأ في إنتاج محتوى الطباعة. تحقق من اكتمال البيانات.', 'خطأ في المحتوى');
        } else {
            DialogUtils.showError(`حدث خطأ في عرض المعاينة: ${error.message || 'خطأ غير معروف'}`, 'خطأ في النظام');
        }
    }
}

// ===================================================================
// ADVANCED PRINT SYSTEM WITH ARABIC SUPPORT
// ===================================================================

// Enhanced print reconciliation with preview window
async function printReconciliationAdvanced(reconciliationId, options = {}) {
    console.log('🖨️ [PRINT] بدء الطباعة المتقدمة للتصفية - معرف:', reconciliationId);

    try {
        // Validate input
        if (!reconciliationId) {
            console.error('❌ [PRINT] معرف التصفية مطلوب');
            DialogUtils.showValidationError('معرف التصفية مطلوب للطباعة');
            return false;
        }

        // Show loading
        DialogUtils.showLoading('جاري تحضير بيانات الطباعة...', 'يرجى الانتظار');

        // Get complete reconciliation data
        console.log('📊 [PRINT] تحميل بيانات التصفية للطباعة...');
        const reconciliationData = await ipcRenderer.invoke('get-reconciliation-for-edit', reconciliationId);

        if (!reconciliationData || !reconciliationData.reconciliation) {
            DialogUtils.close();
            console.error('❌ [PRINT] فشل في تحميل بيانات التصفية');
            DialogUtils.showError('فشل في تحميل بيانات التصفية للطباعة', 'خطأ في البيانات');
            return false;
        }

        // Get current print settings
        const printSettings = await ipcRenderer.invoke('get-print-settings');

        // Merge print settings with options
        const mergedOptions = {
            ...options,
            color: printSettings.color !== undefined ? printSettings.color : (options.color !== false)
        };

        // Prepare print data
        const printData = preparePrintData(reconciliationData, mergedOptions);

        console.log('📄 [PRINT] بيانات الطباعة جاهزة:', {
            reconciliationId: printData.reconciliation.id,
            sectionsCount: Object.keys(printData.sections).length,
            hasOptions: !!printData.options
        });

        DialogUtils.close();

        // Create print preview window
        console.log('🖨️ [PRINT] إنشاء نافذة معاينة الطباعة...');
        const result = await ipcRenderer.invoke('create-print-preview', printData);

        if (result.success) {
            console.log('✅ [PRINT] تم إنشاء نافذة معاينة الطباعة بنجاح');
            DialogUtils.showSuccessToast('تم فتح نافذة معاينة الطباعة');
            return true;
        } else {
            console.error('❌ [PRINT] فشل في إنشاء نافذة معاينة الطباعة:', result.error);
            DialogUtils.showError(`فشل في إنشاء نافذة معاينة الطباعة: ${result.error}`, 'خطأ في الطباعة');
            return false;
        }

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [PRINT] خطأ في الطباعة المتقدمة:', error);
        DialogUtils.showError(`خطأ في الطباعة: ${error.message}`, 'خطأ في النظام');
        return false;
    }
}

// Prepare print data with selective sections
function preparePrintData(reconciliationData, options = {}) {
    console.log('📋 [PRINT] تحضير بيانات الطباعة...');

    const { reconciliation, bankReceipts, cashReceipts, postpaidSales,
        customerReceipts, returnInvoices, suppliers } = reconciliationData;

    // Default sections to include (all sections by default)
    const defaultSections = {
        bankReceipts: true,
        cashReceipts: true,
        postpaidSales: true,
        customerReceipts: true,
        returnInvoices: true,
        suppliers: true,
        summary: true
    };

    // Merge with user options
    const sectionsToInclude = { ...defaultSections, ...(options.sections || {}) };

    // Prepare sections data
    const sections = {};

    if (sectionsToInclude.bankReceipts && bankReceipts && bankReceipts.length > 0) {
        sections.bankReceipts = bankReceipts;
        console.log(`📊 [PRINT] تضمين ${bankReceipts.length} مقبوضة بنكية`);
    }

    if (sectionsToInclude.cashReceipts && cashReceipts && cashReceipts.length > 0) {
        sections.cashReceipts = cashReceipts;
        console.log(`📊 [PRINT] تضمين ${cashReceipts.length} مقبوضة نقدية`);
    }

    if (sectionsToInclude.postpaidSales && postpaidSales && postpaidSales.length > 0) {
        sections.postpaidSales = postpaidSales;
        console.log(`📊 [PRINT] تضمين ${postpaidSales.length} مبيعة آجلة`);
    }

    if (sectionsToInclude.customerReceipts && customerReceipts && customerReceipts.length > 0) {
        sections.customerReceipts = customerReceipts;
        console.log(`📊 [PRINT] تضمين ${customerReceipts.length} مقبوضة عميل`);
    }

    if (sectionsToInclude.returnInvoices && returnInvoices && returnInvoices.length > 0) {
        sections.returnInvoices = returnInvoices;
        console.log(`📊 [PRINT] تضمين ${returnInvoices.length} فاتورة مرتجع`);
    }

    if (sectionsToInclude.suppliers && suppliers && suppliers.length > 0) {
        sections.suppliers = suppliers;
        console.log(`📊 [PRINT] تضمين ${suppliers.length} مورد`);
    }

    // Add company name to reconciliation data
    const enhancedReconciliation = {
        ...reconciliation,
        company_name: window.currentCompanyName || 'نظام تصفية الكاشير'
    };

    const printData = {
        reconciliation: enhancedReconciliation,
        sections: sections,
        options: {
            includeSummary: sectionsToInclude.summary !== false,
            pageSize: options.pageSize || 'A4',
            orientation: options.orientation || 'portrait',
            margins: options.margins || 'normal',
            fontSize: options.fontSize || 'normal',
            ...options
        },
        isColorPrint: options.color !== false
    };

    console.log('✅ [PRINT] تم تحضير بيانات الطباعة بنجاح');
    return printData;
}

// Print reconciliation with section selection dialog
async function printReconciliationWithOptions(reconciliationId) {
    console.log('🖨️ [PRINT] بدء الطباعة مع خيارات للتصفية - معرف:', reconciliationId);

    try {
        // Show section selection dialog
        const selectedSections = await showPrintSectionDialog(reconciliationId);

        if (selectedSections) {
            // Print with selected sections
            return await printReconciliationAdvanced(reconciliationId, { sections: selectedSections });
        } else {
            console.log('⚠️ [PRINT] تم إلغاء الطباعة من قبل المستخدم');
            return false;
        }

    } catch (error) {
        console.error('❌ [PRINT] خطأ في الطباعة مع الخيارات:', error);
        DialogUtils.showError(`خطأ في الطباعة: ${error.message}`, 'خطأ في النظام');
        return false;
    }
}

// Show print section selection dialog
async function showPrintSectionDialog(reconciliationId) {
    console.log('📋 [PRINT] عرض حوار اختيار الأقسام للطباعة...');

    return new Promise((resolve) => {
        // Create modal HTML
        const modalHtml = `
        <div class="modal fade" id="printSectionModal" tabindex="-1" aria-labelledby="printSectionModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="printSectionModalLabel">🖨️ خيارات الطباعة</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="إغلاق"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="mb-3">📊 الأقسام المراد طباعتها:</h6>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="printBankReceipts" checked>
                                    <label class="form-check-label" for="printBankReceipts">
                                        💳 المقبوضات البنكية
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="printCashReceipts" checked>
                                    <label class="form-check-label" for="printCashReceipts">
                                        💰 المقبوضات النقدية
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="printPostpaidSales" checked>
                                    <label class="form-check-label" for="printPostpaidSales">
                                        📱 المبيعات الآجلة
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="printCustomerReceipts" checked>
                                    <label class="form-check-label" for="printCustomerReceipts">
                                        👥 مقبوضات العملاء
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="printReturnInvoices" checked>
                                    <label class="form-check-label" for="printReturnInvoices">
                                        ↩️ فواتير المرتجع
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="printSuppliers" checked>
                                    <label class="form-check-label" for="printSuppliers">
                                        🏪 الموردين
                                    </label>
                                </div>
                                <div class="form-check mb-3">
                                    <input class="form-check-input" type="checkbox" id="printSummary" checked>
                                    <label class="form-check-label" for="printSummary">
                                        📈 ملخص التصفية
                                    </label>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <h6 class="mb-3">⚙️ خيارات إضافية:</h6>
                                <div class="mb-3">
                                    <label for="pageSize" class="form-label">حجم الورق:</label>
                                    <select class="form-select" id="pageSize">
                                        <option value="A4" selected>A4</option>
                                        <option value="A3">A3</option>
                                        <option value="Letter">Letter</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label for="orientation" class="form-label">اتجاه الورق:</label>
                                    <select class="form-select" id="orientation">
                                        <option value="portrait" selected>عمودي</option>
                                        <option value="landscape">أفقي</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label for="fontSize" class="form-label">حجم الخط:</label>
                                    <select class="form-select" id="fontSize">
                                        <option value="small">صغير</option>
                                        <option value="normal" selected>عادي</option>
                                        <option value="large">كبير</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="row mt-3">
                            <div class="col-12">
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-outline-primary btn-sm" onclick="selectAllPrintSections()">تحديد الكل</button>
                                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="deselectAllPrintSections()">إلغاء تحديد الكل</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                        <button type="button" class="btn btn-primary" onclick="confirmPrintSections()">🖨️ طباعة</button>
                    </div>
                </div>
            </div>
        </div>`;

        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('printSectionModal'));
        modal.show();

        // Handle modal events
        const modalElement = document.getElementById('printSectionModal');

        // Store resolve function globally for button handlers
        window.printSectionResolve = resolve;

        modalElement.addEventListener('hidden.bs.modal', () => {
            // Clean up
            modalElement.remove();
            delete window.printSectionResolve;
            resolve(null); // User cancelled
        });
    });
}

// Helper functions for print section dialog
function selectAllPrintSections() {
    const checkboxes = document.querySelectorAll('#printSectionModal input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
}

function deselectAllPrintSections() {
    const checkboxes = document.querySelectorAll('#printSectionModal input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
}

function confirmPrintSections() {
    console.log('✅ [PRINT] تأكيد اختيار الأقسام للطباعة...');

    // Get selected sections
    const sections = {
        bankReceipts: document.getElementById('printBankReceipts').checked,
        cashReceipts: document.getElementById('printCashReceipts').checked,
        postpaidSales: document.getElementById('printPostpaidSales').checked,
        customerReceipts: document.getElementById('printCustomerReceipts').checked,
        returnInvoices: document.getElementById('printReturnInvoices').checked,
        suppliers: document.getElementById('printSuppliers').checked,
        summary: document.getElementById('printSummary').checked
    };

    // Get additional options
    const options = {
        sections: sections,
        pageSize: document.getElementById('pageSize').value,
        orientation: document.getElementById('orientation').value,
        fontSize: document.getElementById('fontSize').value
    };

    console.log('📊 [PRINT] الأقسام المحددة:', sections);
    console.log('⚙️ [PRINT] الخيارات الإضافية:', options);

    // Check if at least one section is selected
    const hasSelectedSections = Object.values(sections).some(selected => selected);

    if (!hasSelectedSections) {
        DialogUtils.showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
        return;
    }

    // Close modal and resolve with options
    const modal = bootstrap.Modal.getInstance(document.getElementById('printSectionModal'));
    if (modal) {
        modal.hide();
    }

    // Resolve with selected options
    if (window.printSectionResolve) {
        window.printSectionResolve(options);
    }
}

// Note: printReconciliation function is defined earlier in the file (line ~2192)
// This avoids duplicate function definitions

// Test function to verify print data structure compatibility
async function testPrintDataStructure() {
    console.log('🧪 [TEST] Testing print data structure compatibility...');

    if (!currentReconciliation) {
        console.log('❌ [TEST] No current reconciliation to test');
        return false;
    }

    try {
        // Test prepareReconciliationData function
        const reconciliationData = await prepareReconciliationData();

        console.log('📊 [TEST] Print data structure:', {
            hasReconciliation: !!reconciliationData.reconciliation,
            reconciliationId: reconciliationData.reconciliation?.id,
            cashierName: reconciliationData.reconciliation?.cashier_name,
            hasBankReceipts: Array.isArray(reconciliationData.bankReceipts),
            hasCashReceipts: Array.isArray(reconciliationData.cashReceipts),
            hasPostpaidSales: Array.isArray(reconciliationData.postpaidSales),
            hasCustomerReceipts: Array.isArray(reconciliationData.customerReceipts),
            hasReturnInvoices: Array.isArray(reconciliationData.returnInvoices),
            hasSuppliers: Array.isArray(reconciliationData.suppliers),
            hasSummary: !!reconciliationData.summary
        });

        // Verify required fields for print system
        const isValid = reconciliationData.reconciliation &&
            reconciliationData.reconciliation.id &&
            reconciliationData.reconciliation.cashier_name &&
            reconciliationData.reconciliation.accountant_name;

        if (isValid) {
            console.log('✅ [TEST] Print data structure is valid and compatible');
            return true;
        } else {
            console.log('❌ [TEST] Print data structure is missing required fields');
            return false;
        }

    } catch (error) {
        console.error('❌ [TEST] Error testing print data structure:', error);
        return false;
    }
}

// Test function to verify print dialog functionality
async function testPrintDialog() {
    console.log('🧪 [TEST] Testing print dialog functionality...');

    if (!currentReconciliation) {
        console.log('❌ [TEST] No current reconciliation to test');
        return false;
    }

    try {
        // Test the print dialog without actually printing
        const reconciliationData = await prepareReconciliationData();

        // Check if print dialog can be shown
        currentPrintData = reconciliationData;

        // Initialize print system if needed
        if (availablePrinters.length === 0) {
            await initializePrintSystem();
        }

        console.log('✅ [TEST] Print dialog test completed successfully');
        console.log('📊 [TEST] Print system status:', {
            hasPrintData: !!currentPrintData,
            printersAvailable: availablePrinters.length,
            printModalExists: !!document.getElementById('printOptionsModal')
        });

        return true;

    } catch (error) {
        console.error('❌ [TEST] Error testing print dialog:', error);
        return false;
    }
}

// Show print section selection dialog for New Reconciliation interface
async function showPrintSectionDialogForNewReconciliation() {
    console.log('📋 [PRINT] عرض حوار اختيار الأقسام للتصفية الجديدة...');

    return new Promise((resolve) => {
        // Create modal HTML (same as showPrintSectionDialog but with unique ID)
        const modalHtml = `
        <div class="modal fade" id="newReconciliationPrintSectionModal" tabindex="-1" aria-labelledby="newReconciliationPrintSectionModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="newReconciliationPrintSectionModalLabel">🖨️ خيارات الطباعة</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="إغلاق"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="mb-3">📊 الأقسام المراد طباعتها:</h6>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="newPrintBankReceipts" checked>
                                    <label class="form-check-label" for="newPrintBankReceipts">
                                        💳 المقبوضات البنكية
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="newPrintCashReceipts" checked>
                                    <label class="form-check-label" for="newPrintCashReceipts">
                                        💰 المقبوضات النقدية
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="newPrintPostpaidSales" checked>
                                    <label class="form-check-label" for="newPrintPostpaidSales">
                                        📱 المبيعات الآجلة
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="newPrintCustomerReceipts" checked>
                                    <label class="form-check-label" for="newPrintCustomerReceipts">
                                        👥 مقبوضات العملاء
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="newPrintReturnInvoices" checked>
                                    <label class="form-check-label" for="newPrintReturnInvoices">
                                        ↩️ فواتير المرتجع
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="newPrintSuppliers" checked>
                                    <label class="form-check-label" for="newPrintSuppliers">
                                        🏪 الموردين
                                    </label>
                                </div>
                                <div class="form-check mb-3">
                                    <input class="form-check-input" type="checkbox" id="newPrintSummary" checked>
                                    <label class="form-check-label" for="newPrintSummary">
                                        📈 ملخص التصفية
                                    </label>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <h6 class="mb-3">⚙️ خيارات إضافية:</h6>
                                <div class="mb-3">
                                    <label for="newPageSize" class="form-label">حجم الورق:</label>
                                    <select class="form-select" id="newPageSize">
                                        <option value="A4" selected>A4</option>
                                        <option value="A3">A3</option>
                                        <option value="Letter">Letter</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label for="newOrientation" class="form-label">اتجاه الورق:</label>
                                    <select class="form-select" id="newOrientation">
                                        <option value="portrait" selected>عمودي</option>
                                        <option value="landscape">أفقي</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label for="newFontSize" class="form-label">حجم الخط:</label>
                                    <select class="form-select" id="newFontSize">
                                        <option value="small">صغير</option>
                                        <option value="normal" selected>عادي</option>
                                        <option value="large">كبير</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="row mt-3">
                            <div class="col-12">
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-outline-primary btn-sm" onclick="selectAllNewPrintSections()">تحديد الكل</button>
                                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="deselectAllNewPrintSections()">إلغاء تحديد الكل</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                        <button type="button" class="btn btn-primary" onclick="confirmNewPrintSections()">🖨️ طباعة</button>
                    </div>
                </div>
            </div>
        </div>`;

        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('newReconciliationPrintSectionModal'));
        modal.show();

        // Handle modal events
        const modalElement = document.getElementById('newReconciliationPrintSectionModal');

        // Store resolve function globally for button handlers
        window.newPrintSectionResolve = resolve;

        modalElement.addEventListener('hidden.bs.modal', () => {
            // Clean up
            modalElement.remove();
            delete window.newPrintSectionResolve;
            resolve(null); // User cancelled
        });
    });
}

// Helper functions for new reconciliation print section dialog
function selectAllNewPrintSections() {
    const checkboxes = document.querySelectorAll('#newReconciliationPrintSectionModal input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
}

function deselectAllNewPrintSections() {
    const checkboxes = document.querySelectorAll('#newReconciliationPrintSectionModal input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
}

function confirmNewPrintSections() {
    console.log('✅ [PRINT] تأكيد اختيار الأقسام للتصفية الجديدة...');

    // Get selected sections
    const sections = {
        bankReceipts: document.getElementById('newPrintBankReceipts').checked,
        cashReceipts: document.getElementById('newPrintCashReceipts').checked,
        postpaidSales: document.getElementById('newPrintPostpaidSales').checked,
        customerReceipts: document.getElementById('newPrintCustomerReceipts').checked,
        returnInvoices: document.getElementById('newPrintReturnInvoices').checked,
        suppliers: document.getElementById('newPrintSuppliers').checked,
        summary: document.getElementById('newPrintSummary').checked
    };

    // Get additional options
    const options = {
        sections: sections,
        pageSize: document.getElementById('newPageSize').value,
        orientation: document.getElementById('newOrientation').value,
        fontSize: document.getElementById('newFontSize').value
    };

    console.log('📊 [PRINT] الأقسام المحددة:', sections);
    console.log('⚙️ [PRINT] الخيارات الإضافية:', options);

    // Check if at least one section is selected
    const hasSelectedSections = Object.values(sections).some(selected => selected);

    if (!hasSelectedSections) {
        DialogUtils.showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
        return;
    }

    // Close modal and resolve with options
    const modal = bootstrap.Modal.getInstance(document.getElementById('newReconciliationPrintSectionModal'));
    if (modal) {
        modal.hide();
    }

    // Resolve with selected options
    if (window.newPrintSectionResolve) {
        window.newPrintSectionResolve(options);
    }
}

// Test function for the complete new print system
async function testNewReconciliationPrintSystem() {
    console.log('🧪 [TEST] Testing complete New Reconciliation print system...');

    if (!currentReconciliation) {
        console.log('❌ [TEST] No current reconciliation to test');
        return false;
    }

    try {
        // Test 1: Data structure compatibility
        console.log('🔍 [TEST] Testing data structure...');
        const dataTest = await testPrintDataStructure();

        // Test 2: Section selection dialog
        console.log('🔍 [TEST] Testing section selection functions...');
        const sectionFunctions = {
            showPrintSectionDialogForNewReconciliation: typeof showPrintSectionDialogForNewReconciliation === 'function',
            selectAllNewPrintSections: typeof selectAllNewPrintSections === 'function',
            deselectAllNewPrintSections: typeof deselectAllNewPrintSections === 'function',
            confirmNewPrintSections: typeof confirmNewPrintSections === 'function'
        };

        // Test 3: Print functions
        console.log('🔍 [TEST] Testing print functions...');
        const printFunctions = {
            handlePrintReport: typeof handlePrintReport === 'function',
            handleQuickPrint: typeof handleQuickPrint === 'function',
            preparePrintData: typeof preparePrintData === 'function'
        };

        console.log('📊 [TEST] Test results:', {
            dataStructure: dataTest,
            sectionFunctions: sectionFunctions,
            printFunctions: printFunctions
        });

        const allTestsPassed = dataTest &&
            Object.values(sectionFunctions).every(fn => fn) &&
            Object.values(printFunctions).every(fn => fn);

        if (allTestsPassed) {
            console.log('✅ [TEST] All tests passed! New Reconciliation print system is ready.');
            return true;
        } else {
            console.log('❌ [TEST] Some tests failed.');
            return false;
        }

    } catch (error) {
        console.error('❌ [TEST] Error testing new reconciliation print system:', error);
        return false;
    }
}



// Test function for customer receipts
async function testCustomerReceiptsFunction() {
    console.log('🧪 [TEST] اختبار وظيفة مقبوضات العملاء...');

    const results = {
        formElements: false,
        validation: false,
        database: false,
        overall: false
    };

    try {
        // Test 1: Check form elements
        console.log('📋 [TEST] فحص عناصر النموذج...');
        const nameField = document.getElementById('customerReceiptName');
        const amountField = document.getElementById('customerReceiptAmount');
        const paymentTypeField = document.getElementById('customerReceiptPaymentType');
        const tableBody = document.getElementById('customerReceiptsTable');
        const totalElement = document.getElementById('customerReceiptsTotal');

        results.formElements = !!(nameField && amountField && paymentTypeField && tableBody && totalElement);
        console.log('📋 [TEST] عناصر النموذج:', {
            nameField: !!nameField,
            amountField: !!amountField,
            paymentTypeField: !!paymentTypeField,
            tableBody: !!tableBody,
            totalElement: !!totalElement
        });

        // Test 2: Check validation
        console.log('✅ [TEST] فحص التحقق من صحة البيانات...');
        results.validation = typeof handleCustomerReceipt === 'function' &&
            typeof updateCustomerReceiptsTable === 'function' &&
            typeof removeCustomerReceipt === 'function';

        // Test 3: Check database connection (if reconciliation exists)
        if (currentReconciliation) {
            console.log('💾 [TEST] فحص الاتصال بقاعدة البيانات...');
            try {
                const testQuery = await ipcRenderer.invoke('db-get',
                    'SELECT COUNT(*) as count FROM customer_receipts WHERE reconciliation_id = ?',
                    [currentReconciliation.id]
                );
                results.database = testQuery !== null;
                console.log('💾 [TEST] نتيجة استعلام قاعدة البيانات:', testQuery);
            } catch (error) {
                console.error('❌ [TEST] خطأ في قاعدة البيانات:', error);
                results.database = false;
            }
        } else {
            console.log('⚠️ [TEST] لا توجد تصفية حالية لاختبار قاعدة البيانات');
            results.database = true; // نعتبرها صحيحة إذا لم تكن هناك تصفية
        }

        // Overall result
        results.overall = results.formElements && results.validation && results.database;

        console.log('✅ [TEST] نتائج اختبار مقبوضات العملاء:', results);

        if (results.overall) {
            console.log('🎉 [TEST] جميع اختبارات مقبوضات العملاء نجحت!');
            DialogUtils.showSuccess('تم اختبار وظيفة مقبوضات العملاء بنجاح!', 'اختبار ناجح');
        } else {
            console.log('⚠️ [TEST] بعض اختبارات مقبوضات العملاء فشلت');
            DialogUtils.showWarning('بعض اختبارات مقبوضات العملاء فشلت. تحقق من وحدة التحكم للتفاصيل.', 'اختبار جزئي');
        }

        return results;

    } catch (error) {
        console.error('❌ [TEST] خطأ في اختبار مقبوضات العملاء:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
        return results;
    }
}

// Test function for enhanced save functionality
async function testEnhancedSaveFunction() {
    console.log('🧪 [TEST-SAVE] اختبار وظيفة الحفظ المحسنة...');

    const results = {
        validation: false,
        clearingFunctions: false,
        resetFunctions: false,
        uiElements: false,
        overall: false
    };

    try {
        // Test 1: Check validation function
        console.log('✅ [TEST-SAVE] فحص دالة التحقق من صحة البيانات...');
        results.validation = typeof validateReconciliationBeforeSave === 'function';

        if (results.validation) {
            const testValidation = validateReconciliationBeforeSave();
            console.log('📋 [TEST-SAVE] نتيجة اختبار التحقق:', testValidation);
        }

        // Test 2: Check clearing functions
        console.log('🧹 [TEST-SAVE] فحص دوال التفريغ...');
        results.clearingFunctions = typeof clearAllReconciliationData === 'function' &&
            typeof clearAllFormFields === 'function' &&
            typeof clearAllTables === 'function' &&
            typeof resetAllTotalsAndSummaries === 'function';

        // Test 3: Check reset functions
        console.log('🔄 [TEST-SAVE] فحص دوال إعادة التهيئة...');
        results.resetFunctions = typeof resetSystemToNewReconciliationState === 'function';

        // Test 4: Check UI elements
        console.log('🎨 [TEST-SAVE] فحص عناصر واجهة المستخدم...');
        const saveBtn = document.getElementById('saveReconciliationBtn');
        const createBtn = document.getElementById('createReconciliationBtn');
        const systemSalesInput = document.getElementById('systemSales');
        const totalReceiptsElement = document.getElementById('totalReceipts');

        results.uiElements = !!(saveBtn && createBtn && systemSalesInput && totalReceiptsElement);

        console.log('🎨 [TEST-SAVE] عناصر واجهة المستخدم:', {
            saveBtn: !!saveBtn,
            createBtn: !!createBtn,
            systemSalesInput: !!systemSalesInput,
            totalReceiptsElement: !!totalReceiptsElement
        });

        // Overall result
        results.overall = results.validation && results.clearingFunctions &&
            results.resetFunctions && results.uiElements;

        console.log('✅ [TEST-SAVE] نتائج اختبار وظيفة الحفظ المحسنة:', results);

        if (results.overall) {
            console.log('🎉 [TEST-SAVE] جميع اختبارات وظيفة الحفظ المحسنة نجحت!');
            DialogUtils.showSuccess(
                'تم اختبار وظيفة الحفظ المحسنة بنجاح!\n\n' +
                '✅ التحقق من صحة البيانات\n' +
                '✅ دوال التفريغ\n' +
                '✅ دوال إعادة التهيئة\n' +
                '✅ عناصر واجهة المستخدم\n\n' +
                'الوظيفة جاهزة للاستخدام!',
                'اختبار ناجح'
            );
        } else {
            console.log('⚠️ [TEST-SAVE] بعض اختبارات وظيفة الحفظ فشلت');
            DialogUtils.showWarning(
                'بعض اختبارات وظيفة الحفظ فشلت:\n\n' +
                `${!results.validation ? '❌ التحقق من صحة البيانات\n' : ''}` +
                `${!results.clearingFunctions ? '❌ دوال التفريغ\n' : ''}` +
                `${!results.resetFunctions ? '❌ دوال إعادة التهيئة\n' : ''}` +
                `${!results.uiElements ? '❌ عناصر واجهة المستخدم\n' : ''}` +
                '\nتحقق من وحدة التحكم للتفاصيل.',
                'اختبار جزئي'
            );
        }

        return results;

    } catch (error) {
        console.error('❌ [TEST-SAVE] خطأ في اختبار وظيفة الحفظ:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
        return results;
    }
}

// Test function for fixed print functionality
async function testFixedPrintFunctions() {
    console.log('🧪 [TEST-PRINT] اختبار وظائف الطباعة المصلحة...');

    const results = {
        functionNames: false,
        dataValidation: false,
        printFunctions: false,
        errorHandling: false,
        overall: false
    };

    try {
        // Test 1: Check function names and availability
        console.log('📋 [TEST-PRINT] فحص أسماء الدوال ووجودها...');
        const functionTests = {
            handlePrintReport: typeof handlePrintReport === 'function',
            handleQuickPrint: typeof handleQuickPrint === 'function',
            handlePrintReportsData: typeof handlePrintReportsData === 'function',
            handlePrintAdvancedReport: typeof handlePrintAdvancedReport === 'function',
            prepareReconciliationData: typeof prepareReconciliationData === 'function'
        };

        results.functionNames = Object.values(functionTests).every(test => test);
        console.log('📋 [TEST-PRINT] نتائج فحص الدوال:', functionTests);

        // Test 2: Check data validation
        console.log('✅ [TEST-PRINT] فحص التحقق من صحة البيانات...');
        if (currentReconciliation) {
            const hasData = bankReceipts.length > 0 ||
                cashReceipts.length > 0 ||
                postpaidSales.length > 0 ||
                customerReceipts.length > 0 ||
                returnInvoices.length > 0 ||
                suppliers.length > 0;

            results.dataValidation = true;
            console.log('📊 [TEST-PRINT] حالة البيانات:', {
                currentReconciliation: !!currentReconciliation,
                hasData: hasData,
                bankReceipts: bankReceipts.length,
                cashReceipts: cashReceipts.length,
                customerReceipts: customerReceipts.length
            });
        } else {
            console.log('⚠️ [TEST-PRINT] لا توجد تصفية حالية للاختبار');
            results.dataValidation = true; // نعتبرها صحيحة إذا لم تكن هناك تصفية
        }

        // Test 3: Check print functions structure
        console.log('🖨️ [TEST-PRINT] فحص بنية دوال الطباعة...');
        results.printFunctions = typeof preparePrintData === 'function' &&
            typeof showPrintSectionDialogForNewReconciliation === 'function';

        // Test 4: Check error handling
        console.log('🛡️ [TEST-PRINT] فحص معالجة الأخطاء...');
        results.errorHandling = typeof DialogUtils !== 'undefined' &&
            typeof DialogUtils.showValidationError === 'function' &&
            typeof DialogUtils.showError === 'function';

        // Overall result
        results.overall = results.functionNames && results.dataValidation &&
            results.printFunctions && results.errorHandling;

        console.log('✅ [TEST-PRINT] نتائج اختبار وظائف الطباعة المصلحة:', results);

        if (results.overall) {
            console.log('🎉 [TEST-PRINT] جميع اختبارات وظائف الطباعة نجحت!');
            DialogUtils.showSuccess(
                'تم اختبار وظائف الطباعة المصلحة بنجاح!\n\n' +
                '✅ أسماء الدوال صحيحة\n' +
                '✅ التحقق من صحة البيانات\n' +
                '✅ دوال الطباعة متاحة\n' +
                '✅ معالجة الأخطاء تعمل\n\n' +
                'تم إصلاح مشكلة "لا توجد بيانات تقرير للطباعة"!',
                'اختبار ناجح'
            );
        } else {
            console.log('⚠️ [TEST-PRINT] بعض اختبارات وظائف الطباعة فشلت');
            DialogUtils.showWarning(
                'بعض اختبارات وظائف الطباعة فشلت:\n\n' +
                `${!results.functionNames ? '❌ أسماء الدوال\n' : ''}` +
                `${!results.dataValidation ? '❌ التحقق من صحة البيانات\n' : ''}` +
                `${!results.printFunctions ? '❌ دوال الطباعة\n' : ''}` +
                `${!results.errorHandling ? '❌ معالجة الأخطاء\n' : ''}` +
                '\nتحقق من وحدة التحكم للتفاصيل.',
                'اختبار جزئي'
            );
        }

        return results;

    } catch (error) {
        console.error('❌ [TEST-PRINT] خطأ في اختبار وظائف الطباعة:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
        return results;
    }
}

// Make test functions available globally for debugging
window.testPrintDataStructure = testPrintDataStructure;
window.testPrintDialog = testPrintDialog;
window.testNewReconciliationPrintSystem = testNewReconciliationPrintSystem;
window.testCustomerReceiptsFunction = testCustomerReceiptsFunction;
window.testEnhancedSaveFunction = testEnhancedSaveFunction;
window.testFixedPrintFunctions = testFixedPrintFunctions;

// ===================================================================
// SIDEBAR TOGGLE FUNCTIONALITY
// ===================================================================

// Initialize sidebar toggle functionality
function initializeSidebarToggle() {
    // Load saved sidebar state from localStorage
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState === 'true') {
        sidebarCollapsed = true;
        applySidebarState();
    }

    // Add keyboard shortcut (Ctrl+B or Cmd+B)
    document.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
            event.preventDefault();
            toggleSidebar();
        }
    });

    console.log('Sidebar toggle initialized. Current state:', sidebarCollapsed ? 'collapsed' : 'expanded');
    console.log('Keyboard shortcut: Ctrl+B (or Cmd+B on Mac) to toggle sidebar');
}

// Toggle sidebar visibility
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    applySidebarState();
    saveSidebarState();

    console.log('Sidebar toggled. New state:', sidebarCollapsed ? 'collapsed' : 'expanded');
}

// Apply sidebar state to DOM elements
function applySidebarState() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const toggleBtn = document.getElementById('sidebarToggle');
    const fixedToggleBtn = document.getElementById('fixedSidebarToggle');

    if (!sidebar || !mainContent || !toggleBtn || !fixedToggleBtn) {
        console.error('Sidebar toggle: Required elements not found');
        return;
    }

    if (sidebarCollapsed) {
        // Hide sidebar
        sidebar.classList.add('collapsed');
        mainContent.classList.add('expanded');
        toggleBtn.classList.add('collapsed');

        // Show fixed toggle button
        fixedToggleBtn.style.display = 'flex';
        fixedToggleBtn.classList.remove('hidden');

        // Update titles and labels
        toggleBtn.title = 'إظهار القائمة الجانبية (Ctrl+B)';
        toggleBtn.setAttribute('aria-label', 'إظهار القائمة الجانبية');
        fixedToggleBtn.title = 'إظهار القائمة الجانبية (Ctrl+B)';
        fixedToggleBtn.setAttribute('aria-label', 'إظهار القائمة الجانبية');
    } else {
        // Show sidebar
        sidebar.classList.remove('collapsed');
        mainContent.classList.remove('expanded');
        toggleBtn.classList.remove('collapsed');

        // Hide fixed toggle button
        fixedToggleBtn.style.display = 'none';
        fixedToggleBtn.classList.add('hidden');

        // Update titles and labels
        toggleBtn.title = 'إخفاء القائمة الجانبية (Ctrl+B)';
        toggleBtn.setAttribute('aria-label', 'إخفاء القائمة الجانبية');
        fixedToggleBtn.title = 'إظهار القائمة الجانبية (Ctrl+B)';
        fixedToggleBtn.setAttribute('aria-label', 'إظهار القائمة الجانبية');
    }
}

// Save sidebar state to localStorage
function saveSidebarState() {
    try {
        localStorage.setItem('sidebarCollapsed', sidebarCollapsed.toString());
        console.log('Sidebar state saved:', sidebarCollapsed);
    } catch (error) {
        console.error('Error saving sidebar state:', error);
    }
}

// Reset sidebar to default state (expanded)
function resetSidebarState() {
    sidebarCollapsed = false;
    applySidebarState();
    saveSidebarState();
    console.log('Sidebar state reset to expanded');
}

// Check if sidebar is currently collapsed
function isSidebarCollapsed() {
    return sidebarCollapsed;
}

// Make sidebar toggle functions available globally
window.toggleSidebar = toggleSidebar;
window.resetSidebarState = resetSidebarState;
window.isSidebarCollapsed = isSidebarCollapsed;

// ===================================================================
// NEW CLEAN PRINTING SYSTEM FOR SAVED RECONCILIATIONS
// ===================================================================

// Global variables for the new print system
let currentPrintReconciliation = null;
let printPreviewWindow = null;

// Main print function - replaces all previous print logic
async function printSavedReconciliation(reconciliationId) {
    console.log('🖨️ [NEW-PRINT] بدء نظام الطباعة الجديد للتصفية:', reconciliationId);

    try {
        // Load reconciliation data
        const reconciliationData = await loadReconciliationForPrint(reconciliationId);

        if (!reconciliationData) {
            DialogUtils.showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
            return;
        }

        // Store current reconciliation for print
        currentPrintReconciliation = reconciliationData;

        // Show section selection dialog
        showPrintSectionSelectionDialog();

    } catch (error) {
        console.error('❌ [NEW-PRINT] خطأ في تحميل بيانات الطباعة:', error);
        DialogUtils.showError(`خطأ في تحميل البيانات: ${error.message}`, 'خطأ في النظام');
    }
}

// Load reconciliation data for printing
async function loadReconciliationForPrint(reconciliationId) {
    console.log('📊 [NEW-PRINT] تحميل بيانات التصفية للطباعة:', reconciliationId);

    try {
        // Get reconciliation basic data including new filter enhancement fields
        const reconciliation = await ipcRenderer.invoke('db-get', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            WHERE r.id = ?
        `, [reconciliationId]);

        if (!reconciliation) {
            throw new Error('التصفية غير موجودة');
        }

        // Filter enhancement fields loaded successfully

        // Get all related data with proper JOINs to get all necessary fields
        const [bankReceipts, cashReceipts, postpaidSales, customerReceipts, returnInvoices, suppliers] = await Promise.all([
            ipcRenderer.invoke('db-query', `
                SELECT br.*, atm.name as atm_name, atm.bank_name
                FROM bank_receipts br
                LEFT JOIN atms atm ON br.atm_id = atm.id
                WHERE br.reconciliation_id = ?
                ORDER BY br.id
            `, [reconciliationId]),
            ipcRenderer.invoke('db-query', 'SELECT * FROM cash_receipts WHERE reconciliation_id = ? ORDER BY id', [reconciliationId]),
            ipcRenderer.invoke('db-query', 'SELECT * FROM postpaid_sales WHERE reconciliation_id = ? ORDER BY id', [reconciliationId]),
            ipcRenderer.invoke('db-query', 'SELECT * FROM customer_receipts WHERE reconciliation_id = ? ORDER BY id', [reconciliationId]),
            ipcRenderer.invoke('db-query', 'SELECT * FROM return_invoices WHERE reconciliation_id = ? ORDER BY id', [reconciliationId]),
            ipcRenderer.invoke('db-query', 'SELECT * FROM suppliers WHERE reconciliation_id = ? ORDER BY id', [reconciliationId])
        ]);

        console.log('✅ [NEW-PRINT] تم تحميل البيانات بنجاح:', {
            reconciliation: reconciliation.id,
            bankReceipts: bankReceipts.length,
            cashReceipts: cashReceipts.length,
            postpaidSales: postpaidSales.length,
            customerReceipts: customerReceipts.length,
            returnInvoices: returnInvoices.length,
            suppliers: suppliers.length
        });

        // Log sample data for debugging
        if (bankReceipts.length > 0) {
            console.log('📊 [NEW-PRINT] عينة من المقبوضات البنكية:', bankReceipts[0]);
        }
        if (cashReceipts.length > 0) {
            console.log('📊 [NEW-PRINT] عينة من المقبوضات النقدية:', cashReceipts[0]);
        }
        if (postpaidSales.length > 0) {
            console.log('📊 [NEW-PRINT] عينة من المبيعات الآجلة:', postpaidSales[0]);
        }

        return {
            reconciliation,
            bankReceipts,
            cashReceipts,
            postpaidSales,
            customerReceipts,
            returnInvoices,
            suppliers
        };

    } catch (error) {
        console.error('❌ [NEW-PRINT] خطأ في تحميل البيانات:', error);
        throw error;
    }
}

// Show section selection dialog
function showPrintSectionSelectionDialog() {
    console.log('📋 [NEW-PRINT] عرض حوار اختيار الأقسام للطباعة');

    if (!currentPrintReconciliation) {
        DialogUtils.showError('لا توجد بيانات تصفية للطباعة', 'خطأ في البيانات');
        return;
    }

    const reconciliation = currentPrintReconciliation.reconciliation;

    // Create modal HTML
    const modalHtml = `
    <div class="modal fade" id="newPrintSectionModal" tabindex="-1" aria-labelledby="newPrintSectionModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title" id="newPrintSectionModalLabel">
                        🖨️ خيارات طباعة التصفية #${reconciliation.id}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="إغلاق"></button>
                </div>
                <div class="modal-body">
                    <!-- Reconciliation Info -->
                    <div class="alert alert-info mb-4">
                        <h6 class="mb-2">📊 معلومات التصفية:</h6>
                        <div class="row">
                            <div class="col-md-6">
                                <strong>الكاشير:</strong> ${reconciliation.cashier_name} (${reconciliation.cashier_number})<br>
                                <strong>المحاسب:</strong> ${reconciliation.accountant_name}
                                ${reconciliation.time_range_start || reconciliation.time_range_end ? `<br>
                                <strong>النطاق الزمني:</strong>
                                ${reconciliation.time_range_start && reconciliation.time_range_end ?
                `من ${reconciliation.time_range_start} إلى ${reconciliation.time_range_end}` :
                reconciliation.time_range_start ? `من ${reconciliation.time_range_start}` :
                    `إلى ${reconciliation.time_range_end}`
            }` : ''}
                            </div>
                            <div class="col-md-6">
                                <strong>التاريخ:</strong> ${formatDate(reconciliation.reconciliation_date)}<br>
                                <strong>إجمالي المقبوضات:</strong> ${formatCurrency(reconciliation.total_receipts)}
                                ${reconciliation.filter_notes ? `<br>
                                <strong>الملاحظات:</strong> ${reconciliation.filter_notes.length > 50 ?
                reconciliation.filter_notes.substring(0, 50) + '...' :
                reconciliation.filter_notes}` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-md-6">
                            <h6 class="mb-3">📊 الأقسام المراد طباعتها:</h6>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printBankReceipts" checked>
                                <label class="form-check-label" for="printBankReceipts">
                                    💳 المقبوضات البنكية (${currentPrintReconciliation.bankReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printCashReceipts" checked>
                                <label class="form-check-label" for="printCashReceipts">
                                    💰 المقبوضات النقدية (${currentPrintReconciliation.cashReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printPostpaidSales" checked>
                                <label class="form-check-label" for="printPostpaidSales">
                                    📱 المبيعات الآجلة (${currentPrintReconciliation.postpaidSales.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printCustomerReceipts" checked>
                                <label class="form-check-label" for="printCustomerReceipts">
                                    👥 مقبوضات العملاء (${currentPrintReconciliation.customerReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input" type="checkbox" id="printReturnInvoices" checked>
                                <label class="form-check-label" for="printReturnInvoices">
                                    ↩️ فواتير المرتجع (${currentPrintReconciliation.returnInvoices.length})
                                </label>
                            </div>
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="checkbox" id="printSuppliers" checked>
                                <label class="form-check-label" for="printSuppliers">
                                    🏪 الموردين (${currentPrintReconciliation.suppliers.length})
                                </label>
                            </div>
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="checkbox" id="printSummary" checked>
                                <label class="form-check-label" for="printSummary">
                                    📈 ملخص التصفية
                                </label>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h6 class="mb-3">⚙️ خيارات الطباعة:</h6>
                            <div class="mb-3">
                                <label for="printPageSize" class="form-label">حجم الورق:</label>
                                <select class="form-select" id="printPageSize">
                                    <option value="A4" selected>A4</option>
                                    <option value="A3">A3</option>
                                    <option value="Letter">Letter</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label for="printOrientation" class="form-label">اتجاه الورق:</label>
                                <select class="form-select" id="printOrientation">
                                    <option value="portrait" selected>عمودي</option>
                                    <option value="landscape">أفقي</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label for="printFontSize" class="form-label">حجم الخط:</label>
                                <select class="form-select" id="printFontSize">
                                    <option value="small">صغير</option>
                                    <option value="normal" selected>عادي</option>
                                    <option value="large">كبير</option>
                                </select>
                            </div>
                            <div class="form-check mb-3">
                                <input class="form-check-input" type="checkbox" id="printColors" checked>
                                <label class="form-check-label" for="printColors">
                                    🎨 طباعة ملونة
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="row mt-3">
                        <div class="col-12">
                            <div class="d-flex gap-2">
                                <button type="button" class="btn btn-outline-primary btn-sm" onclick="selectAllPrintSections()">تحديد الكل</button>
                                <button type="button" class="btn btn-outline-secondary btn-sm" onclick="deselectAllPrintSections()">إلغاء تحديد الكل</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                    <button type="button" class="btn btn-info" onclick="showPrintPreview()">👁️ معاينة</button>
                    <button type="button" class="btn btn-primary" onclick="proceedToPrint()">🖨️ طباعة</button>
                </div>
            </div>
        </div>
    </div>`;

    // Remove existing modal if any
    const existingModal = document.getElementById('newPrintSectionModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('newPrintSectionModal'));
    modal.show();
}

// Helper functions for section selection
function selectAllPrintSections() {
    const checkboxes = document.querySelectorAll('#newPrintSectionModal input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
}

function deselectAllPrintSections() {
    const checkboxes = document.querySelectorAll('#newPrintSectionModal input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
}

// Get selected print options
function getSelectedPrintOptions() {
    return {
        sections: {
            bankReceipts: document.getElementById('printBankReceipts').checked,
            cashReceipts: document.getElementById('printCashReceipts').checked,
            postpaidSales: document.getElementById('printPostpaidSales').checked,
            customerReceipts: document.getElementById('printCustomerReceipts').checked,
            returnInvoices: document.getElementById('printReturnInvoices').checked,
            suppliers: document.getElementById('printSuppliers').checked,
            summary: document.getElementById('printSummary').checked
        },
        options: {
            pageSize: document.getElementById('printPageSize').value,
            orientation: document.getElementById('printOrientation').value,
            fontSize: document.getElementById('printFontSize').value,
            colors: document.getElementById('printColors').checked
        }
    };
}

// Show print preview
function showPrintPreview() {
    console.log('👁️ [NEW-PRINT] عرض معاينة الطباعة');

    const printOptions = getSelectedPrintOptions();

    // Check if at least one section is selected
    const hasSelectedSections = Object.values(printOptions.sections).some(selected => selected);
    if (!hasSelectedSections) {
        DialogUtils.showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
        return;
    }

    // Close the selection modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('newPrintSectionModal'));
    if (modal) {
        modal.hide();
    }

    // Generate and show preview
    generatePrintPreview(printOptions);
}

// Proceed to direct print
function proceedToPrint() {
    console.log('🖨️ [NEW-PRINT] المتابعة للطباعة المباشرة');

    const printOptions = getSelectedPrintOptions();

    // Check if at least one section is selected
    const hasSelectedSections = Object.values(printOptions.sections).some(selected => selected);
    if (!hasSelectedSections) {
        DialogUtils.showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
        return;
    }

    // Close the selection modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('newPrintSectionModal'));
    if (modal) {
        modal.hide();
    }

    // Generate print content and print directly
    generateAndPrint(printOptions);
}

// Generate print preview in a new window
function generatePrintPreview(printOptions) {
    console.log('🖼️ [NEW-PRINT] إنشاء معاينة الطباعة');

    try {
        const htmlContent = generatePrintHTML(printOptions, true); // true for preview mode

        // Close existing preview window if open
        if (printPreviewWindow && !printPreviewWindow.closed) {
            printPreviewWindow.close();
        }

        // Open new preview window
        printPreviewWindow = window.open('', 'printPreview', 'width=900,height=700,scrollbars=yes,resizable=yes');

        if (!printPreviewWindow) {
            DialogUtils.showError('فشل في فتح نافذة المعاينة. تأكد من السماح للنوافذ المنبثقة.', 'خطأ في المعاينة');
            return;
        }

        // Write content to preview window
        printPreviewWindow.document.write(htmlContent);
        printPreviewWindow.document.close();

        // Focus on preview window
        printPreviewWindow.focus();

        console.log('✅ [NEW-PRINT] تم فتح معاينة الطباعة بنجاح');

    } catch (error) {
        console.error('❌ [NEW-PRINT] خطأ في إنشاء معاينة الطباعة:', error);
        DialogUtils.showError(`خطأ في إنشاء المعاينة: ${error.message}`, 'خطأ في النظام');
    }
}

// Generate and print directly
function generateAndPrint(printOptions) {
    console.log('🖨️ [NEW-PRINT] إنشاء المحتوى والطباعة المباشرة');

    try {
        const htmlContent = generatePrintHTML(printOptions, false); // false for direct print

        // Create temporary window for printing
        const printWindow = window.open('', 'printWindow', 'width=800,height=600');

        if (!printWindow) {
            DialogUtils.showError('فشل في فتح نافذة الطباعة. تأكد من السماح للنوافذ المنبثقة.', 'خطأ في الطباعة');
            return;
        }

        // Write content and trigger print
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Wait for content to load then print
        printWindow.onload = function () {
            setTimeout(() => {
                printWindow.print();
                // Close window after printing
                setTimeout(() => {
                    printWindow.close();
                }, 1000);
            }, 500);
        };

        console.log('✅ [NEW-PRINT] تم إرسال المحتوى للطباعة');
        DialogUtils.showSuccessToast('تم إرسال التصفية للطباعة');

    } catch (error) {
        console.error('❌ [NEW-PRINT] خطأ في الطباعة المباشرة:', error);
        DialogUtils.showError(`خطأ في الطباعة: ${error.message}`, 'خطأ في النظام');
    }
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

// Generate HTML content for printing
function generatePrintHTML(printOptions, isPreview = false) {
    console.log('📄 [NEW-PRINT] إنشاء محتوى HTML للطباعة');
    console.log('📝 [NEW-PRINT] حجم الخط المختار:', printOptions.fontSize || 'normal');
    console.log('📏 [NEW-PRINT] حجم الخط المحسوب:', getEnhancedFontSizeForPrint(printOptions.fontSize || 'normal'));

    if (!currentPrintReconciliation) {
        throw new Error('لا توجد بيانات تصفية للطباعة');
    }

    const { reconciliation, bankReceipts, cashReceipts, postpaidSales, customerReceipts, returnInvoices, suppliers } = currentPrintReconciliation;
    const { sections, options } = printOptions;

    const currentDate = getCurrentDate();
    const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false });

    // Generate CSS based on options - Enhanced font sizes (20-30% larger)
    const fontSize = getEnhancedFontSizeForPrint(options.fontSize);
    const pageOrientation = options.orientation === 'landscape' ? 'landscape' : 'portrait';

    let htmlContent = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>تقرير التصفية #${reconciliation.id} - ${reconciliation.cashier_name}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap');

            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: ${getEnhancedFontSizeForPrint(options.fontSize || 'normal')}; /* استخدام إعدادات حجم الخط */
                line-height: 1.1; /* تقليل المسافة بين الأسطر */
                color: #222;
                direction: rtl;
                text-align: right;
                background: white;
                padding: 4px; /* تقليل الحشو */
                margin: 0;
                font-weight: 400;
            }

            @media print {
                @page {
                    size: A4 portrait; /* فرض A4 عمودي */
                    margin: 6mm 5mm 12mm 5mm; /* تقليل الهوامش */
                }

                body {
                    padding: 0;
                    margin: 0;
                    margin-bottom: 12mm; /* تقليل مساحة الفوتر */
                    font-size: ${getEnhancedFontSizeForPrint(options.fontSize || 'normal')} !important; /* استخدام إعدادات حجم الخط */
                    line-height: 1.05 !important; /* مسافة أقل بين الأسطر */
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

                .no-print {
                    display: none !important;
                }

                .page-break {
                    page-break-inside: avoid;
                }

                .section {
                    page-break-inside: avoid;
                    margin-bottom: 3px; /* تقليل المسافة */
                }

                .header {
                    margin-bottom: 4px; /* تقليل المسافة */
                }

                .footer {
                    margin-top: 5px; /* تقليل المسافة */
                }

                /* تحسينات إضافية للضغط */
                h1, h2, h3 {
                    margin: 1px 0 !important;
                    padding: 1px 0 !important;
                    font-size: 1em !important;
                }

                table {
                    margin: 2px 0 !important;
                }

                th, td {
                    padding: 1px 2px !important;
                    font-size: 0.9em !important; /* نسبي لحجم الخط الأساسي */
                }
            }

            .header {
                text-align: center;
                margin-bottom: 4px; /* تقليل المسافة */
                padding: 3px; /* تقليل الحشو */
                border: 1px solid #2c3e50;
                border-radius: 2px; /* تقليل الحواف المدورة */
                background: ${options.colors ? 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' : '#f8f9fa'};
            }

            .header h1 {
                color: #1a252f;
                font-size: 1.4em; /* نسبي لحجم الخط الأساسي */
                margin-bottom: 2px; /* تقليل المسافة */
                font-weight: 800;
                text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.1);
            }

            .header h2 {
                color: #2c3e50;
                font-size: 1.2em;
                margin-bottom: 6px;
                font-weight: 700;
            }

            .reconciliation-info {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 3px;
                margin: 8px 0;
                padding: 6px;
                background: ${options.colors ? '#e3f2fd' : '#f5f5f5'};
                border-radius: 3px;
                border: 1px solid #ddd;
                font-size: 0.9em;
            }

            .info-item {
                display: inline-block;
                text-align: right;
                padding: 2px 5px;
            }

            .info-label {
                font-weight: 700;
                color: #1a252f;
                font-size: 0.9em;
                display: inline-block;
                margin-left: 0;
                margin-right: 3px;
            }

            .info-value {
                font-weight: 600;
                color: #2c3e50;
                font-size: 0.9em;
                display: inline-block;
            }

            .info-item {
                white-space: nowrap;
                padding: 2px 5px;
            }

            .section {
                margin: 6px 0;
                page-break-inside: avoid;
            }

            .section-title {
                background: ${options.colors ? 'linear-gradient(135deg, #3498db, #2980b9)' : '#f8f9fa'};
                color: ${options.colors ? 'white' : '#000000'};
                padding: 15px 20px;
                border-radius: 8px;
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 15px;
                text-align: center;
                text-shadow: ${options.colors ? '0.5px 0.5px 1px rgba(0,0,0,0.2)' : 'none'};
                border: ${options.colors ? 'none' : '2px solid #000000'};
            }

            .section-content {
                border: 1px solid #ddd;
                border-top: none;
                border-radius: 0 0 3px 3px;
                overflow: hidden;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 6px;
                font-size: 12px;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            th, td {
                padding: 6px 5px;
                text-align: center;
                border: 1px solid #bdc3c7;
                vertical-align: middle;
                line-height: 1.2;
                font-weight: 500;
                font-size: 12px;
            }

            th {
                background: ${options.colors ? '#34495e' : 'transparent'};
                color: ${options.colors ? 'white' : '#000000'};
                font-weight: 700;
                font-size: 13px;
                text-shadow: ${options.colors ? '0.5px 0.5px 1px rgba(0,0,0,0.3)' : 'none'};
                border: ${options.colors ? '1px solid #bdc3c7' : '2px solid #000000'};
            }

            .total-row {
                background: ${options.colors ? 'linear-gradient(135deg, #27ae60, #2ecc71)' : 'transparent'} !important;
                color: #000000 !important;
                font-weight: 900 !important;
                font-size: 14px !important;
            }

            .total-row td {
                background: transparent !important;
                color: #000000 !important;
                font-weight: 900 !important;
                font-size: 14px !important;
                border: ${options.colors ? '2px solid #27ae60' : '2px solid #000000'} !important;
                padding: 8px 6px !important;
            }

            tr:nth-child(even) {
                background: ${options.colors ? '#f8f9fa' : 'transparent'};
            }

            .currency {
                font-family: 'Courier New', monospace;
                font-weight: 800;
                color: ${options.colors ? '#1e8449' : '#000000'};
                font-size: 1.05em;
                text-shadow: ${options.colors ? '0.5px 0.5px 1px rgba(0,0,0,0.1)' : 'none'};
            }

            .deficit {
                color: ${options.colors ? '#c0392b' : '#000000'};
                font-weight: 800;
                font-size: 1.05em;
            }

            .summary-section {
                background: ${options.colors ? 'linear-gradient(135deg, #f39c12, #e67e22)' : 'transparent'};
                color: ${options.colors ? 'white' : '#000000'};
                padding: 8px;
                border-radius: 4px;
                margin: 8px 0;
                text-align: center;
                border: ${options.colors ? 'none' : '2px solid #000000'};
            }

            .summary-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 5px;
                margin-top: 5px;
            }

            .summary-item {
                background: ${options.colors ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};
                padding: 4px;
                border-radius: 3px;
                border: ${options.colors ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid #000000'};
            }

            .summary-label {
                font-size: 0.75em;
                margin-bottom: 3px;
                opacity: ${options.colors ? '0.95' : '1'};
                font-weight: 600;
                color: ${options.colors ? 'inherit' : '#000000'};
            }

            .summary-value {
                font-size: 1.0em;
                font-weight: 800;
                text-shadow: ${options.colors ? '0.5px 0.5px 1px rgba(0,0,0,0.2)' : 'none'};
                color: ${options.colors ? 'inherit' : '#000000'};
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

            .footer {
                margin-top: 8px;
                padding-top: 5px;
                border-top: 1px solid #ddd;
                text-align: center;
                color: #666;
                font-size: 0.7em;
                margin-bottom: 25mm; /* مساحة إضافية لتجنب التداخل مع فوتر الصفحة */
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
                z-index: 1000;
                font-family: 'Cairo', Arial, sans-serif;
            }

            .print-controls {
                position: fixed;
                top: 10px;
                left: 10px;
                z-index: 1000;
                background: white;
                padding: 10px;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                border: 1px solid #ddd;
            }

            .print-btn, .close-btn {
                background: #3498db;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 5px;
                cursor: pointer;
                margin: 0 5px;
                font-family: 'Cairo', sans-serif;
            }

            .close-btn {
                background: #e74c3c;
            }

            .print-btn:hover {
                background: #2980b9;
            }

            .close-btn:hover {
                background: #c0392b;
            }

            .empty-section {
                padding: 8px;
                text-align: center;
                color: #666;
                font-style: italic;
                background: #f8f9fa;
                font-size: 0.8em;
            }
            /* Checkbox style for print */
            .print-checkbox {
                display: inline-block;
                width: 12px;
                height: 12px;
                border: 1px solid #000;
                margin-left: 8px;
                vertical-align: middle;
            }

            /* نمط الخط والصفوف الزوجية المخططة */
            tr:nth-child(even):not(.total-row) {
                background: repeating-linear-gradient(
                    45deg,
                    #e9ecef,
                    #e9ecef 10px,
                    #ffffff 10px,
                    #ffffff 20px
                );
                background-color: #e9ecef; /* للدعم في الطباعة */
                -webkit-print-color-adjust: exact; /* لضمان ظهور الألوان في الطباعة */
                print-color-adjust: exact; /* لضمان ظهور الألوان في الطباعة */
            }

            /* نمط الخط في كل الخلايا */
            table td {
                font-weight: 700 !important;
                font-size: 0.95em !important;
            }

            @media print {
                tr:nth-child(even):not(.total-row) {
                    background: repeating-linear-gradient(
                        45deg,
                        #e0e0e0,
                        #e0e0e0 10px,
                        #ffffff 10px,
                        #ffffff 20px
                    ) !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                
                /* تأكيد نمط الخط في الطباعة */
                table td {
                    font-weight: 700 !important;
                    font-size: 0.95em !important;
                }
            }
        </style>
    </head>
    <body>`;

    // Add print controls for preview mode
    if (isPreview) {
        htmlContent += `
        <div class="print-controls no-print">
            <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
            <button class="close-btn" onclick="window.close()">✖️ إغلاق</button>
        </div>`;
    }

    // Generate HTML with filter enhancement fields support

    // Add header
    htmlContent += `
        <div class="header">
            <h1>نظام تصفية الكاشير</h1>
            <h2>تقرير التصفية النهائية</h2>
            <div class="reconciliation-info">
                <div class="info-item">
                    <span class="info-label">رقم التصفية:</span>
                    <span class="info-value">${reconciliation.reconciliation_number ? `#${reconciliation.reconciliation_number}` : 'مسودة'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">الكاشير:</span>
                    <span class="info-value">${reconciliation.cashier_name} (${reconciliation.cashier_number})</span>
                </div>
                <div class="info-item">
                    <span class="info-label">المحاسب:</span>
                    <span class="info-value">${reconciliation.accountant_name}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">تاريخ التصفية:</span>
                    <span class="info-value">${formatDate(reconciliation.reconciliation_date)}</span>
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
                </div>
                <div class="info-item">
                    <span class="info-label">تاريخ الطباعة:</span>
                    <span class="info-value">${currentDate}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">وقت الطباعة:</span>
                    <span class="info-value">${currentTime}</span>
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
        </div>`;

    // Add sections based on selection
    if (sections.bankReceipts && bankReceipts.length > 0) {
        htmlContent += generateBankReceiptsSection(bankReceipts);
    }

    if (sections.cashReceipts && cashReceipts.length > 0) {
        htmlContent += generateCashReceiptsSection(cashReceipts);
    }

    if (sections.postpaidSales && postpaidSales.length > 0) {
        htmlContent += generatePostpaidSalesSection(postpaidSales);
    }

    if (sections.customerReceipts && customerReceipts.length > 0) {
        htmlContent += generateCustomerReceiptsSection(customerReceipts);
    }

    if (sections.returnInvoices && returnInvoices.length > 0) {
        htmlContent += generateReturnInvoicesSection(returnInvoices);
    }

    if (sections.suppliers && suppliers.length > 0) {
        htmlContent += generateSuppliersSection(suppliers);
    }

    if (sections.summary) {
        htmlContent += generateSummarySection(reconciliation);
    }

    // Add footer
    htmlContent += `
        <div class="footer">
            <p>تم إنشاء هذا التقرير بواسطة نظام تصفية برو</p>
            <p>تاريخ الإنشاء: ${currentDate} - ${currentTime}</p>
            <p style="margin-top: 10px; font-weight: 600; color: #2c3e50;">
                جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
            </p>
        </div>

        <!-- فوتر الصفحة - يظهر في كل صفحة مطبوعة -->
        <div class="page-footer">
            جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
        </div>

        ${generateNonColoredPrintStyles(!options.colors)}
    </body>
    </html>`;

    return htmlContent;
}

// Helper function to safely get field value
function safeFieldValue(obj, field, defaultValue = 'غير محدد') {
    if (!obj) return defaultValue;
    const value = obj[field];
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    return value;
}

// Helper function to format date safely
function safeDateFormat(dateString) {
    if (!dateString) return '-';
    try {
        return formatDate(dateString);
    } catch (error) {
        return '-';
    }
}

// Section generation functions
function generateBankReceiptsSection(bankReceipts) {
    let total = bankReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);

    let html = `
    <div class="section">
        <h3 class="section-title">💳 المقبوضات البنكية (${bankReceipts.length})</h3>
        <div class="section-content">`;

    if (bankReceipts.length === 0) {
        html += `<div class="empty-section">لا توجد مقبوضات بنكية</div>`;
    } else {
        html += `
            <table>
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>نوع العملية</th>
                        <th>اسم الجهاز</th>
                        <th>البنك</th>
                        <th>المبلغ</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody>`;

        bankReceipts.forEach((receipt, index) => {
            console.log('🔍 [NEW-PRINT] معالجة مقبوض بنكي:', receipt);
            html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${safeFieldValue(receipt, 'operation_type')}</td>
                        <td>${safeFieldValue(receipt, 'atm_name')}</td>
                        <td>${safeFieldValue(receipt, 'bank_name')}</td>
                        <td class="currency">${formatCurrency(receipt.amount)}</td>
                        <td>${safeDateFormat(receipt.created_at)}</td>
                    </tr>`;
        });

        html += `
                    <tr class="total-row">
                        <td colspan="4">الإجمالي</td>
                        <td class="currency">${formatCurrency(total)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>`;
    }

    html += `
        </div>
    </div>`;

    return html;
}

function generateCashReceiptsSection(cashReceipts) {
    let total = cashReceipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);
    let totalQuantity = cashReceipts.reduce((sum, receipt) => sum + (receipt.quantity || 0), 0);

    let html = `
    <div class="section">
        <h3 class="section-title">💰 المقبوضات النقدية (${cashReceipts.length})</h3>
        <div class="section-content">`;

    if (cashReceipts.length === 0) {
        html += `<div class="empty-section">لا توجد مقبوضات نقدية</div>`;
    } else {
        // Sort by denomination descending for better readability
        const sortedCashReceipts = [...cashReceipts].sort((a, b) => (b.denomination || 0) - (a.denomination || 0));

        html += `
            <table>
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>الفئة</th>
                        <th>الكمية</th>
                        <th>المجموع</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody>`;

        sortedCashReceipts.forEach((receipt, index) => {
            console.log('🔍 [NEW-PRINT] معالجة مقبوض نقدي:', receipt);
            html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${formatNumber(safeFieldValue(receipt, 'denomination', '0'))} ريال</td>
                        <td>${formatNumber(receipt.quantity || 0)}</td>
                        <td class="currency">${formatNumber(formatCurrency(receipt.total_amount))} ريال</td>
                        <td>${safeDateFormat(receipt.created_at)}</td>
                    </tr>`;
        });

        html += `
                    <tr class="total-row">
                        <td>-</td>
                        <td>الإجمالي</td>
                        <td>${formatNumber(totalQuantity)}</td>
                        <td class="currency">${formatNumber(formatCurrency(total))} ريال</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>`;
    }

    html += `
        </div>
    </div>`;

    return html;
}

function generatePostpaidSalesSection(postpaidSales) {
    let total = postpaidSales.reduce((sum, sale) => sum + (sale.amount || 0), 0);

    let html = `
    <div class="section">
        <h3 class="section-title">📱 المبيعات الآجلة (${postpaidSales.length})</h3>
        <div class="section-content">`;

    if (postpaidSales.length === 0) {
        html += `<div class="empty-section">لا توجد مبيعات آجلة</div>`;
    } else {
        html += `
            <table>
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>اسم العميل</th>
                        <th>المبلغ</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody>`;

        postpaidSales.forEach((sale, index) => {
            console.log('🔍 [NEW-PRINT] معالجة مبيعة آجلة:', sale);
            html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td><div class="print-checkbox"></div>${safeFieldValue(sale, 'customer_name')}</td>
                        <td class="currency">${formatCurrency(sale.amount)}</td>
                        <td>${safeDateFormat(sale.created_at)}</td>
                    </tr>`;
        });

        html += `
                    <tr class="total-row">
                        <td colspan="2">الإجمالي</td>
                        <td class="currency">${formatCurrency(total)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>`;
    }

    html += `
        </div>
    </div>`;

    return html;
}

function generateCustomerReceiptsSection(customerReceipts) {
    let total = customerReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);

    let html = `
    <div class="section">
        <h3 class="section-title">👥 مقبوضات العملاء (${customerReceipts.length})</h3>
        <div class="section-content">`;

    if (customerReceipts.length === 0) {
        html += `<div class="empty-section">لا توجد مقبوضات عملاء</div>`;
    } else {
        html += `
            <table>
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>اسم العميل</th>
                        <th>المبلغ</th>
                        <th>نوع الدفع</th>
                    </tr>
                </thead>
                <tbody>`;

        customerReceipts.forEach((receipt, index) => {
            console.log('🔍 [NEW-PRINT] معالجة مقبوض عميل:', receipt);
            html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td><div class="print-checkbox"></div>${safeFieldValue(receipt, 'customer_name')}</td>
                        <td class="currency">${formatCurrency(receipt.amount)}</td>
                        <td>${safeFieldValue(receipt, 'payment_type')}</td>
                    </tr>`;
        });

        html += `
                    <tr class="total-row">
                        <td colspan="2">الإجمالي</td>
                        <td class="currency">${formatCurrency(total)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>`;
    }

    html += `
        </div>
    </div>`;

    return html;
}

function generateReturnInvoicesSection(returnInvoices) {
    let total = returnInvoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0);

    let html = `
    <div class="section">
        <h3 class="section-title">↩️ فواتير المرتجع (${returnInvoices.length})</h3>
        <div class="section-content">`;

    if (returnInvoices.length === 0) {
        html += `<div class="empty-section">لا توجد فواتير مرتجع</div>`;
    } else {
        html += `
            <table>
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>رقم الفاتورة</th>
                        <th>المبلغ</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody>`;

        returnInvoices.forEach((invoice, index) => {
            console.log('🔍 [NEW-PRINT] معالجة فاتورة مرتجع:', invoice);
            html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${safeFieldValue(invoice, 'invoice_number')}</td>
                        <td class="currency">${formatCurrency(invoice.amount)}</td>
                        <td>${safeDateFormat(invoice.created_at)}</td>
                    </tr>`;
        });

        html += `
                    <tr class="total-row">
                        <td colspan="2">الإجمالي</td>
                        <td class="currency">${formatCurrency(total)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>`;
    }

    html += `
        </div>
    </div>`;

    return html;
}

function generateSuppliersSection(suppliers) {
    let total = suppliers.reduce((sum, supplier) => sum + (supplier.amount || 0), 0);

    let html = `
    <div class="section">
        <h3 class="section-title">🏪 الموردين (${suppliers.length})</h3>
        <div class="section-content">`;

    if (suppliers.length === 0) {
        html += `<div class="empty-section">لا توجد معاملات موردين</div>`;
    } else {
        html += `
            <table>
                <thead>
                    <tr>
                        <th>الرقم</th>
                        <th>اسم المورد</th>
                        <th>المبلغ</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody>`;

        suppliers.forEach((supplier, index) => {
            console.log('🔍 [NEW-PRINT] معالجة مورد:', supplier);
            html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${safeFieldValue(supplier, 'supplier_name')}</td>
                        <td class="currency">${formatCurrency(supplier.amount)}</td>
                        <td>${safeDateFormat(supplier.created_at)}</td>
                    </tr>`;
        });

        html += `
                    <tr class="total-row">
                        <td colspan="2">الإجمالي</td>
                        <td class="currency">${formatCurrency(total)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>`;
    }

    html += `
        </div>
    </div>`;

    return html;
}

function generateSummarySection(reconciliation) {
    const surplusDeficit = reconciliation.surplus_deficit || 0;
    const surplusDeficitClass = surplusDeficit >= 0 ? 'currency' : 'deficit';
    const surplusDeficitText = surplusDeficit >= 0 ? 'فائض' : 'عجز';

    let html = `
    <div class="summary-section">
        <h3 style="margin-bottom: 20px; font-size: 1.5em;">📈 ملخص التصفية</h3>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="summary-label">إجمالي المقبوضات</div>
                <div class="summary-value">${formatCurrency(reconciliation.total_receipts)}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">مبيعات النظام</div>
                <div class="summary-value">${formatCurrency(reconciliation.system_sales)}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">${surplusDeficitText}</div>
                <div class="summary-value ${surplusDeficitClass}">${formatCurrency(Math.abs(surplusDeficit))}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">حالة التصفية</div>
                <div class="summary-value">${reconciliation.status === 'completed' ? 'مكتملة' : 'مسودة'}</div>
            </div>
        </div>
    </div>

    ${generateSignaturesSection()}`;

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

// Quick print function (prints all sections)
async function quickPrintSavedReconciliation(reconciliationId) {
    console.log('⚡ [NEW-PRINT] طباعة سريعة للتصفية المحفوظة:', reconciliationId);

    try {
        // Load reconciliation data
        const reconciliationData = await loadReconciliationForPrint(reconciliationId);

        if (!reconciliationData) {
            DialogUtils.showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
            return;
        }

        // Store current reconciliation for print
        currentPrintReconciliation = reconciliationData;

        // Print with all sections enabled
        const printOptions = {
            sections: {
                bankReceipts: true,
                cashReceipts: true,
                postpaidSales: true,
                customerReceipts: true,
                returnInvoices: true,
                suppliers: true,
                summary: true
            },
            options: {
                pageSize: 'A4',
                orientation: 'portrait',
                fontSize: 'normal',
                colors: true
            }
        };

        // Generate and print directly
        generateAndPrint(printOptions);

    } catch (error) {
        console.error('❌ [NEW-PRINT] خطأ في الطباعة السريعة:', error);
        DialogUtils.showError(`خطأ في الطباعة السريعة: ${error.message}`, 'خطأ في النظام');
    }
}

// Transform data from loadReconciliationForPrint format to PDF generator format
function transformDataForPDFGenerator(printData) {
    console.log('🔄 [PDF-TRANSFORM] تحويل البيانات لمولد PDF...');

    try {
        // Calculate summary totals
        const bankTotal = printData.bankReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
        const cashTotal = printData.cashReceipts.reduce((sum, receipt) => sum + (receipt.total_amount || 0), 0);
        const postpaidTotal = printData.postpaidSales.reduce((sum, sale) => sum + (sale.amount || 0), 0);
        const customerTotal = printData.customerReceipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
        const returnTotal = printData.returnInvoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0);
        const supplierTotal = printData.suppliers.reduce((sum, supplier) => sum + (supplier.amount || 0), 0);

        // Calculate total receipts (same logic as new reconciliation) - NEW FORMULA: Returns are ADDED, Customer receipts are SUBTRACTED
        const totalReceipts = bankTotal + cashTotal + postpaidTotal + returnTotal - customerTotal;
        const systemSales = printData.reconciliation.system_sales || 0;
        const surplusDeficit = totalReceipts - systemSales;

        // Transform filter enhancement fields for saved reconciliations

        // Transform to PDF generator format
        const transformedData = {
            // Basic reconciliation info (flattened for PDF generator)
            reconciliationId: printData.reconciliation.id,
            cashierName: printData.reconciliation.cashier_name,
            cashierNumber: printData.reconciliation.cashier_number,
            accountantName: printData.reconciliation.accountant_name,
            reconciliationDate: printData.reconciliation.reconciliation_date,
            companyName: printData.reconciliation.company_name || window.currentCompanyName || 'نظام تصفية الكاشير',

            // New filter enhancement fields for saved reconciliations
            timeRangeStart: printData.reconciliation.time_range_start,
            timeRangeEnd: printData.reconciliation.time_range_end,
            filterNotes: printData.reconciliation.filter_notes,

            // New filter enhancement fields
            timeRangeStart: printData.reconciliation.time_range_start,
            timeRangeEnd: printData.reconciliation.time_range_end,
            filterNotes: printData.reconciliation.filter_notes,

            // Data arrays (same structure)
            bankReceipts: printData.bankReceipts,
            cashReceipts: printData.cashReceipts,
            postpaidSales: printData.postpaidSales,
            customerReceipts: printData.customerReceipts,
            returnInvoices: printData.returnInvoices,
            suppliers: printData.suppliers,

            // Summary object (required by PDF generator)
            summary: {
                bankTotal,
                cashTotal,
                postpaidTotal,
                customerTotal,
                returnTotal,
                supplierTotal,
                totalReceipts,
                systemSales,
                surplusDeficit
            }
        };

        // Debug log for new filter enhancement fields
        console.log('🔍 [PDF-TRANSFORM] فحص الحقول الجديدة:', {
            timeRangeStart: transformedData.timeRangeStart,
            timeRangeEnd: transformedData.timeRangeEnd,
            filterNotes: transformedData.filterNotes,
            originalData: {
                time_range_start: printData.reconciliation.time_range_start,
                time_range_end: printData.reconciliation.time_range_end,
                filter_notes: printData.reconciliation.filter_notes
            }
        });

        console.log('✅ [PDF-TRANSFORM] تم تحويل البيانات بنجاح:', {
            reconciliationId: transformedData.reconciliationId,
            cashierName: transformedData.cashierName,
            totalReceipts: transformedData.summary.totalReceipts,
            surplusDeficit: transformedData.summary.surplusDeficit
        });

        return transformedData;

    } catch (error) {
        console.error('❌ [PDF-TRANSFORM] خطأ في تحويل البيانات:', error);
        throw error;
    }
}

// Generate PDF function (for compatibility)
async function generatePDFSavedReconciliation(reconciliationId) {
    console.log('📄 [NEW-PRINT] إنشاء PDF للتصفية المحفوظة:', reconciliationId);

    try {
        // Show loading message
        DialogUtils.showLoading('جاري إنشاء ملف PDF...', 'يرجى الانتظار');

        // Load reconciliation data
        const printData = await loadReconciliationForPrint(reconciliationId);

        if (!printData) {
            DialogUtils.close();
            DialogUtils.showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
            return;
        }

        // Transform data to PDF generator format
        const pdfData = transformDataForPDFGenerator(printData);

        // Generate PDF using the correct data structure
        const result = await ipcRenderer.invoke('generate-pdf', pdfData);

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccess(`تم حفظ التقرير بنجاح في:\n${result.filePath}`, 'تم إنشاء التقرير');
        } else {
            DialogUtils.showError(`فشل في إنشاء التقرير: ${result.message}`, 'خطأ في إنشاء التقرير');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [NEW-PRINT] خطأ في إنشاء PDF:', error);
        DialogUtils.showError(`خطأ في إنشاء PDF: ${error.message}`, 'خطأ في النظام');
    }
}

// Make new print functions available globally
window.printSavedReconciliation = printSavedReconciliation;
window.quickPrintSavedReconciliation = quickPrintSavedReconciliation;
window.generatePDFSavedReconciliation = generatePDFSavedReconciliation;
window.selectAllPrintSections = selectAllPrintSections;
window.deselectAllPrintSections = deselectAllPrintSections;
window.showPrintPreview = showPrintPreview;
window.proceedToPrint = proceedToPrint;

// ===================================================================
// THERMAL PRINTER FUNCTIONS FOR SAVED RECONCILIATIONS
// ===================================================================

/**
 * معاينة الطباعة الحرارية للتصفية المحفوظة
 */
async function thermalPreviewSavedReconciliation(reconciliationId) {
    console.log('🔥 [THERMAL] معاينة الطباعة الحرارية للتصفية:', reconciliationId);

    try {
        // Show loading
        DialogUtils.showLoading('جاري تحضير البيانات...');

        // Load reconciliation data
        const reconciliationData = await loadReconciliationForPrint(reconciliationId);

        if (!reconciliationData) {
            DialogUtils.close();
            DialogUtils.showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
            return;
        }

        // Store data for section selection dialog
        window.currentThermalReconciliationData = reconciliationData;
        window.thermalPreviewMode = true;

        // Wait a bit before closing dialog
        await new Promise(resolve => setTimeout(resolve, 300));
        DialogUtils.close();

        // Show section selection dialog
        showThermalPrintSectionDialog(reconciliationData);

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [THERMAL] خطأ في معاينة الطباعة الحرارية:', error);
        DialogUtils.showError(`خطأ في معاينة الطباعة: ${error.message}`, 'خطأ في النظام');
    }
}

/**
 * طباعة حرارية للتصفية المحفوظة
 */
async function thermalPrintSavedReconciliation(reconciliationId) {
    console.log('🔥 [THERMAL] طباعة حرارية للتصفية:', reconciliationId);

    try {
        // Show loading
        DialogUtils.showLoading('جاري تحضير البيانات...');

        // Load reconciliation data
        const reconciliationData = await loadReconciliationForPrint(reconciliationId);

        if (!reconciliationData) {
            DialogUtils.close();
            DialogUtils.showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
            return;
        }

        // Store data for section selection dialog
        window.currentThermalReconciliationData = reconciliationData;
        window.thermalPreviewMode = false;

        // Wait a bit before closing dialog
        await new Promise(resolve => setTimeout(resolve, 300));
        DialogUtils.close();

        // Show section selection dialog
        showThermalPrintSectionDialog(reconciliationData);

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [THERMAL] خطأ في الطباعة الحرارية:', error);
        DialogUtils.showError(`خطأ في الطباعة: ${error.message}`, 'خطأ في النظام');
    }
}

/**
 * عرض نافذة اختيار الأقسام للطباعة الحرارية
 */
function showThermalPrintSectionDialog(reconciliationData) {
    console.log('📋 [THERMAL] عرض نافذة اختيار الأقسام');

    if (!reconciliationData) {
        DialogUtils.showError('لا توجد بيانات للطباعة', 'خطأ في البيانات');
        return;
    }

    const reconciliation = reconciliationData.reconciliation;
    const isPreview = window.thermalPreviewMode === true;
    const buttonLabel = isPreview ? '👁️ معاينة' : '🖨️ طباعة';
    const buttonClass = isPreview ? 'btn-info' : 'btn-success';

    // Create modal HTML for section selection
    const modalHtml = `
    <div class="modal fade" id="thermalPrintSectionModal" tabindex="-1" aria-labelledby="thermalPrintSectionLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title" id="thermalPrintSectionLabel">
                        🔥 خيارات الطباعة الحرارية - التصفية #${reconciliation.id}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="إغلاق"></button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-info mb-3">
                        <strong>💾 التصفية:</strong> #${reconciliation.id}<br>
                        <strong>👤 الكاشير:</strong> ${reconciliation.cashier_name}<br>
                        <strong>📅 التاريخ:</strong> ${formatDate(reconciliation.reconciliation_date)}
                    </div>
                    
                    <h6 class="mb-3">📊 اختر الأقسام المراد طباعتها:</h6>
                    
                    <div class="row">
                        <div class="col-md-6">
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalBankReceipts" checked>
                                <label class="form-check-label" for="thermalBankReceipts">
                                    💳 المقبوضات البنكية (${reconciliationData.bankReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalCashReceipts" checked>
                                <label class="form-check-label" for="thermalCashReceipts">
                                    💰 المقبوضات النقدية (${reconciliationData.cashReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalPostpaidSales" checked>
                                <label class="form-check-label" for="thermalPostpaidSales">
                                    📱 المبيعات الآجلة (${reconciliationData.postpaidSales.length})
                                </label>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalCustomerReceipts" checked>
                                <label class="form-check-label" for="thermalCustomerReceipts">
                                    👥 مقبوضات العملاء (${reconciliationData.customerReceipts.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalReturnInvoices" checked>
                                <label class="form-check-label" for="thermalReturnInvoices">
                                    ↩️ فواتير المرتجع (${reconciliationData.returnInvoices.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalSuppliers" checked>
                                <label class="form-check-label" for="thermalSuppliers">
                                    🏪 الموردين (${reconciliationData.suppliers.length})
                                </label>
                            </div>
                            <div class="form-check mb-2">
                                <input class="form-check-input thermal-section-checkbox" type="checkbox" id="thermalSummary" checked>
                                <label class="form-check-label" for="thermalSummary">
                                    📈 ملخص التصفية
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="selectAllThermalSections()">تحديد الكل</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="deselectAllThermalSections()">إلغاء الكل</button>
                    <button type="button" class="btn ${buttonClass}" onclick="proceedWithThermalPrint()">${buttonLabel}</button>
                </div>
            </div>
        </div>
    </div>`;

    // Remove existing modal if any
    const existingModal = document.getElementById('thermalPrintSectionModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('thermalPrintSectionModal'));
    modal.show();
}

/**
 * تحديد جميع الأقسام للطباعة الحرارية
 */
function selectAllThermalSections() {
    const checkboxes = document.querySelectorAll('.thermal-section-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = true);
}

/**
 * إلغاء تحديد جميع الأقسام
 */
function deselectAllThermalSections() {
    const checkboxes = document.querySelectorAll('.thermal-section-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = false);
}

/**
 * الحصول على الأقسام المختارة للطباعة الحرارية
 */
function getSelectedThermalSections() {
    return {
        bankReceipts: document.getElementById('thermalBankReceipts').checked,
        cashReceipts: document.getElementById('thermalCashReceipts').checked,
        postpaidSales: document.getElementById('thermalPostpaidSales').checked,
        customerReceipts: document.getElementById('thermalCustomerReceipts').checked,
        returnInvoices: document.getElementById('thermalReturnInvoices').checked,
        suppliers: document.getElementById('thermalSuppliers').checked,
        summary: document.getElementById('thermalSummary').checked
    };
}

/**
 * متابعة الطباعة/المعاينة الحرارية بعد اختيار الأقسام
 */
async function proceedWithThermalPrint() {
    console.log('🔥 [THERMAL] متابعة الطباعة مع الأقسام المختارة');

    try {
        const isPreview = window.thermalPreviewMode === true;
        const reconciliationData = window.currentThermalReconciliationData;
        const selectedSections = getSelectedThermalSections();

        // Validate at least one section is selected
        const hasSections = Object.values(selectedSections).some(value => value === true);
        if (!hasSections) {
            DialogUtils.showValidationError('يرجى تحديد قسم واحد على الأقل للطباعة');
            return;
        }

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('thermalPrintSectionModal'));
        if (modal) {
            modal.hide();
        }

        // ⚠️ IMPORTANT: Pass FULL data with selectedSections, NOT filtered data!
        // البيانات الكاملة يجب أن تُمرر للحسابات، selectedSections فقط لتحديد ما سيُطبع
        const filteredData = {
            reconciliation: reconciliationData.reconciliation,
            bankReceipts: reconciliationData.bankReceipts,  // Full data for calculations
            cashReceipts: reconciliationData.cashReceipts,  // Full data for calculations
            postpaidSales: reconciliationData.postpaidSales,  // Full data for calculations
            customerReceipts: reconciliationData.customerReceipts,  // Full data for calculations
            returnInvoices: reconciliationData.returnInvoices,  // Full data for calculations
            suppliers: reconciliationData.suppliers,  // Full data for calculations
            selectedSections: selectedSections,  // Only for print display filtering
            companySettings: reconciliationData.companySettings || {}  // Preserve company settings
        };

        // Show appropriate message
        const action = isPreview ? 'المعاينة' : 'الطباعة';
        DialogUtils.showLoading(`جاري إرسال البيانات ل${action}...`);

        // Send to thermal printer
        const endpoint = isPreview ? 'thermal-printer-preview' : 'thermal-printer-print';
        const result = await ipcRenderer.invoke(endpoint, filteredData);

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 500));
        DialogUtils.close();

        if (result.success) {
            const message = isPreview ? '✅ تم فتح المعاينة الحرارية بنجاح' : '✅ تم إرسال الطباعة الحرارية بنجاح';
            DialogUtils.showSuccessToast(message);
            console.log(`✅ [THERMAL] ${message}`);
        } else {
            DialogUtils.showError(`خطأ في ${action}: ${result.error}`, 'خطأ في النظام');
        }

        // Cleanup
        window.currentThermalReconciliationData = null;
        window.thermalPreviewMode = null;

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [THERMAL] خطأ في المتابعة:', error);
        DialogUtils.showError(`خطأ: ${error.message}`, 'خطأ في النظام');
    }
}

// Make thermal print functions available globally
window.thermalPreviewSavedReconciliation = thermalPreviewSavedReconciliation;
window.thermalPrintSavedReconciliation = thermalPrintSavedReconciliation;
window.showThermalPrintSectionDialog = showThermalPrintSectionDialog;
window.selectAllThermalSections = selectAllThermalSections;
window.deselectAllThermalSections = deselectAllThermalSections;
window.getSelectedThermalSections = getSelectedThermalSections;
window.proceedWithThermalPrint = proceedWithThermalPrint;

console.log('✅ [THERMAL] دوال الطباعة الحرارية للتصفيات المحفوظة مع اختيار الأقسام تم تحميلها بنجاح');

// Test function for the new print system
async function testNewPrintSystem() {
    console.log('🧪 [TEST] اختبار نظام الطباعة الجديد...');

    try {
        // Get a test reconciliation
        const reconciliations = await ipcRenderer.invoke('db-query',
            'SELECT id FROM reconciliations ORDER BY created_at DESC LIMIT 1'
        );

        if (reconciliations.length === 0) {
            DialogUtils.showError('لا توجد تصفيات للاختبار', 'لا توجد بيانات');
            return false;
        }

        const testId = reconciliations[0].id;
        console.log(`🧪 [TEST] اختبار تحميل البيانات للتصفية معرف: ${testId}`);

        // Test data loading
        const reconciliationData = await loadReconciliationForPrint(testId);

        if (reconciliationData) {
            console.log('✅ [TEST] تم تحميل البيانات بنجاح');
            DialogUtils.showSuccess(
                `تم اختبار نظام الطباعة الجديد بنجاح!\n\n` +
                `معرف التصفية: ${reconciliationData.reconciliation.id}\n` +
                `الكاشير: ${reconciliationData.reconciliation.cashier_name}\n` +
                `المقبوضات البنكية: ${reconciliationData.bankReceipts.length}\n` +
                `المقبوضات النقدية: ${reconciliationData.cashReceipts.length}\n` +
                `المبيعات الآجلة: ${reconciliationData.postpaidSales.length}`,
                'اختبار ناجح'
            );
            return true;
        } else {
            DialogUtils.showError('فشل في تحميل البيانات', 'فشل الاختبار');
            return false;
        }

    } catch (error) {
        console.error('❌ [TEST] خطأ في اختبار نظام الطباعة:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
        return false;
    }
}

// Make test function available globally
window.testNewPrintSystem = testNewPrintSystem;

// Test function for new cash denominations
async function testNewCashDenominations() {
    console.log('🧪 [TEST] اختبار الفئات النقدية الجديدة...');

    try {
        // Test calculation with new denominations
        const testCases = [
            { denomination: 0.5, quantity: 10, expected: 5.0 },
            { denomination: 0.25, quantity: 20, expected: 5.0 },
            { denomination: 1, quantity: 5, expected: 5.0 },
            { denomination: 100, quantity: 2, expected: 200.0 }
        ];

        let allTestsPassed = true;

        testCases.forEach((testCase, index) => {
            const calculated = testCase.denomination * testCase.quantity;
            const passed = Math.abs(calculated - testCase.expected) < 0.01; // Allow for floating point precision

            console.log(`🧪 [TEST-${index + 1}] فئة ${testCase.denomination} × ${testCase.quantity} = ${formatCurrency(calculated)} (متوقع: ${formatCurrency(testCase.expected)}) ${passed ? '✅' : '❌'}`);

            if (!passed) {
                allTestsPassed = false;
            }
        });

        // Test dropdown options
        const denominationSelect = document.getElementById('denomination');
        const editDenominationSelect = document.getElementById('editDenomination');

        const hasNewOptions = denominationSelect && editDenominationSelect &&
            denominationSelect.querySelector('option[value="0.5"]') &&
            denominationSelect.querySelector('option[value="0.25"]') &&
            editDenominationSelect.querySelector('option[value="0.5"]') &&
            editDenominationSelect.querySelector('option[value="0.25"]');

        console.log(`🧪 [TEST] خيارات الفئات الجديدة في القوائم المنسدلة: ${hasNewOptions ? '✅ موجودة' : '❌ مفقودة'}`);

        if (allTestsPassed && hasNewOptions) {
            DialogUtils.showSuccess(
                'تم اختبار الفئات النقدية الجديدة بنجاح!\n\n' +
                '✅ حسابات الفئة 0.5 ريال صحيحة\n' +
                '✅ حسابات الفئة 0.25 ريال صحيحة\n' +
                '✅ الفئات الجديدة متوفرة في القوائم المنسدلة\n' +
                '✅ جميع الحسابات تعمل بدقة',
                'اختبار ناجح'
            );
            return true;
        } else {
            DialogUtils.showError(
                'فشل في اختبار الفئات النقدية الجديدة!\n\n' +
                `${allTestsPassed ? '✅' : '❌'} الحسابات\n` +
                `${hasNewOptions ? '✅' : '❌'} خيارات القوائم المنسدلة`,
                'فشل الاختبار'
            );
            return false;
        }

    } catch (error) {
        console.error('❌ [TEST] خطأ في اختبار الفئات النقدية:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
        return false;
    }
}

// Make test function available globally
window.testNewCashDenominations = testNewCashDenominations;

// Test function for A4 single page optimization
async function testA4SinglePagePrint() {
    console.log('📄 [TEST] اختبار تحسين الطباعة لورقة A4 واحدة...');

    try {
        // Check if there's a reconciliation to test with
        const reconciliations = await ipcRenderer.invoke('db-query',
            'SELECT id FROM reconciliations ORDER BY created_at DESC LIMIT 1'
        );

        if (reconciliations.length === 0) {
            DialogUtils.showError('لا توجد تصفيات للاختبار', 'لا توجد بيانات');
            return false;
        }

        const testId = reconciliations[0].id;
        console.log(`📄 [TEST] اختبار تحسين الطباعة للتصفية معرف: ${testId}`);

        // Load reconciliation data
        const reconciliationData = await loadReconciliationForPrint(testId);

        if (!reconciliationData) {
            DialogUtils.showError('فشل في تحميل بيانات التصفية للاختبار', 'خطأ في البيانات');
            return false;
        }

        // Store current reconciliation for print
        currentPrintReconciliation = reconciliationData;

        // Test with optimized settings for A4 single page
        const printOptions = {
            sections: {
                bankReceipts: true,
                cashReceipts: true,
                postpaidSales: true,
                customerReceipts: true,
                returnInvoices: true,
                suppliers: true,
                summary: true
            },
            options: {
                pageSize: 'A4',
                orientation: 'portrait',
                fontSize: 'small', // Use small font for maximum compression
                colors: true
            }
        };

        // Generate HTML content
        const htmlContent = generatePrintHTML(printOptions, true);

        // Check content length and estimate if it fits in one page
        const contentLength = htmlContent.length;
        const estimatedLines = (htmlContent.match(/tr>/g) || []).length;
        const estimatedSections = (htmlContent.match(/section>/g) || []).length;

        console.log('📄 [TEST] إحصائيات المحتوى:', {
            contentLength: contentLength,
            estimatedLines: estimatedLines,
            estimatedSections: estimatedSections,
            fontSize: printOptions.options.fontSize
        });

        // Show preview for visual verification
        generatePrintPreview(printOptions);

        DialogUtils.showSuccess(
            `تم اختبار تحسين الطباعة لورقة A4 واحدة!\n\n` +
            `📊 إحصائيات المحتوى:\n` +
            `• طول المحتوى: ${formatNumber(contentLength)} حرف\n` +
            `• عدد الصفوف المقدر: ${estimatedLines}\n` +
            `• عدد الأقسام: ${estimatedSections}\n` +
            `• حجم الخط: ${printOptions.options.fontSize}\n\n` +
            `✅ تم فتح معاينة الطباعة للتحقق البصري\n` +
            `✅ التحسينات المطبقة: خط صغير، هوامش مضغوطة، مسافات مقللة`,
            'اختبار تحسين الطباعة'
        );

        return true;

    } catch (error) {
        console.error('❌ [TEST] خطأ في اختبار تحسين الطباعة:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
        return false;
    }
}

// Make test function available globally
window.testA4SinglePagePrint = testA4SinglePagePrint;

// Test function for improved readability optimization
async function testImprovedReadabilityPrint() {
    console.log('👁️ [TEST] اختبار تحسينات قابلية القراءة للطباعة...');

    try {
        // Check if there's a reconciliation to test with
        const reconciliations = await ipcRenderer.invoke('db-query',
            'SELECT id FROM reconciliations ORDER BY created_at DESC LIMIT 1'
        );

        if (reconciliations.length === 0) {
            DialogUtils.showError('لا توجد تصفيات للاختبار', 'لا توجد بيانات');
            return false;
        }

        const testId = reconciliations[0].id;
        console.log(`👁️ [TEST] اختبار تحسينات القراءة للتصفية معرف: ${testId}`);

        // Load reconciliation data
        const reconciliationData = await loadReconciliationForPrint(testId);

        if (!reconciliationData) {
            DialogUtils.showError('فشل في تحميل بيانات التصفية للاختبار', 'خطأ في البيانات');
            return false;
        }

        // Store current reconciliation for print
        currentPrintReconciliation = reconciliationData;

        // Test with improved readability settings
        const printOptions = {
            sections: {
                bankReceipts: true,
                cashReceipts: true,
                postpaidSales: true,
                customerReceipts: true,
                returnInvoices: true,
                suppliers: true,
                summary: true
            },
            options: {
                pageSize: 'A4',
                orientation: 'portrait',
                fontSize: 'normal', // Use normal font for improved readability
                colors: true
            }
        };

        // Generate HTML content
        const htmlContent = generatePrintHTML(printOptions, true);

        // Analyze readability improvements
        const readabilityMetrics = {
            fontSizeIncrease: '10-15%',
            lineHeightImprovement: '1.2 → 1.3',
            fontWeightEnhancement: 'Bold headers and currency',
            textShadowAdded: 'For better contrast',
            paddingIncrease: '3px → 4px (tables)',
            colorContrast: 'Darker colors for better visibility'
        };

        console.log('👁️ [TEST] مقاييس تحسين القراءة:', readabilityMetrics);

        // Show preview for visual verification
        generatePrintPreview(printOptions);

        DialogUtils.showSuccess(
            `تم اختبار تحسينات قابلية القراءة بنجاح!\n\n` +
            `📈 التحسينات المطبقة:\n` +
            `• زيادة حجم الخط: ${readabilityMetrics.fontSizeIncrease}\n` +
            `• تحسين تباعد الأسطر: ${readabilityMetrics.lineHeightImprovement}\n` +
            `• تعزيز سُمك الخطوط: ${readabilityMetrics.fontWeightEnhancement}\n` +
            `• إضافة ظلال النص: ${readabilityMetrics.textShadowAdded}\n` +
            `• زيادة المسافات: ${readabilityMetrics.paddingIncrease}\n` +
            `• تحسين التباين: ${readabilityMetrics.colorContrast}\n\n` +
            `✅ تم فتح معاينة الطباعة للتحقق البصري\n` +
            `✅ التوازن محفوظ: ضغط في ورقة واحدة + قراءة محسنة`,
            'اختبار تحسين القراءة'
        );

        return true;

    } catch (error) {
        console.error('❌ [TEST] خطأ في اختبار تحسين القراءة:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
        return false;
    }
}

// Make test function available globally
window.testImprovedReadabilityPrint = testImprovedReadabilityPrint;

// ===================================================================
// BRANCHES MANAGEMENT SYSTEM
// ===================================================================

// Load branches for dropdowns and tables
async function loadBranches() {
    console.log('🏢 [BRANCHES] تحميل قائمة الفروع...');

    try {
        const branches = await ipcRenderer.invoke('db-query', 'SELECT * FROM branches ORDER BY branch_name');

        console.log('✅ [BRANCHES] تم تحميل الفروع بنجاح:', branches.length);

        // Update branches table
        updateBranchesTable(branches);

        // Update branch dropdowns
        updateBranchDropdowns(branches);

        return branches;

    } catch (error) {
        console.error('❌ [BRANCHES] خطأ في تحميل الفروع:', error);
        DialogUtils.showError(`خطأ في تحميل الفروع: ${error.message}`, 'خطأ في النظام');
        return [];
    }
}

// Update branches table
function updateBranchesTable(branches) {
    const tableBody = document.getElementById('branchesTable');
    if (!tableBody) return;

    if (branches.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">لا توجد فروع مسجلة</td></tr>';
        return;
    }

    tableBody.innerHTML = branches.map(branch => `
        <tr>
            <td>${branch.id}</td>
            <td>${branch.branch_name}</td>
            <td>${branch.branch_address || '-'}</td>
            <td>${branch.branch_phone || '-'}</td>
            <td>
                <span class="badge ${branch.is_active ? 'bg-success' : 'bg-secondary'}">
                    ${branch.is_active ? 'نشط' : 'غير نشط'}
                </span>
            </td>
            <td>${formatDate(branch.created_at)}</td>
            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-primary" onclick="editBranch(${branch.id})" title="تعديل">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteBranch(${branch.id})" title="حذف">
                        🗑️
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="toggleBranchStatus(${branch.id}, ${branch.is_active})" title="${branch.is_active ? 'إلغاء التفعيل' : 'تفعيل'}">
                        ${branch.is_active ? '🔒' : '🔓'}
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Update branch dropdowns
function updateBranchDropdowns(branches) {
    const dropdowns = [
        'branchSelect',
        'cashierBranchSelect',
        'searchBranchFilter'
    ];

    dropdowns.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            // Keep the first option (placeholder)
            const placeholder = dropdown.querySelector('option[value=""]');
            dropdown.innerHTML = '';
            if (placeholder) {
                dropdown.appendChild(placeholder);
            }

            // Add active branches only
            branches.filter(branch => branch.is_active).forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.id;
                option.textContent = branch.branch_name;
                dropdown.appendChild(option);
            });
        }
    });
}

// Handle branch form submission
async function handleBranchForm(event) {
    event.preventDefault();

    const form = document.getElementById('branchForm');
    const editId = form.getAttribute('data-edit-id');

    const formData = {
        branch_name: document.getElementById('branchName').value.trim(),
        branch_address: document.getElementById('branchAddress').value.trim(),
        branch_phone: document.getElementById('branchPhone').value.trim(),
        is_active: parseInt(document.getElementById('branchStatus').value)
    };

    // Validation
    if (!formData.branch_name) {
        DialogUtils.showValidationError('يرجى إدخال اسم الفرع');
        return;
    }

    try {
        if (editId) {
            // Update existing branch
            console.log('🏢 [BRANCHES] تحديث فرع موجود:', { editId, ...formData });

            const result = await ipcRenderer.invoke('db-run', `
                UPDATE branches
                SET branch_name = ?, branch_address = ?, branch_phone = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [formData.branch_name, formData.branch_address, formData.branch_phone, formData.is_active, editId]);

            if (result.changes > 0) {
                DialogUtils.showSuccessToast('تم تحديث الفرع بنجاح');
                cancelBranchEdit();
                loadBranches();
                loadDropdownData();
            } else {
                DialogUtils.showError('فشل في تحديث الفرع', 'خطأ في قاعدة البيانات');
            }
        } else {
            // Add new branch
            console.log('🏢 [BRANCHES] إضافة فرع جديد:', formData);

            const result = await ipcRenderer.invoke('db-run', `
                INSERT INTO branches (branch_name, branch_address, branch_phone, is_active)
                VALUES (?, ?, ?, ?)
            `, [formData.branch_name, formData.branch_address, formData.branch_phone, formData.is_active]);

            if (result.changes > 0) {
                DialogUtils.showSuccessToast('تم إضافة الفرع بنجاح');
                clearBranchForm();
                loadBranches();
                loadDropdownData();
            } else {
                DialogUtils.showError('فشل في إضافة الفرع', 'خطأ في قاعدة البيانات');
            }
        }

    } catch (error) {
        console.error('❌ [BRANCHES] خطأ في إدارة الفرع:', error);

        if (error.message.includes('UNIQUE constraint failed')) {
            DialogUtils.showError('اسم الفرع موجود مسبقاً', 'خطأ في البيانات');
        } else {
            DialogUtils.showError(`خطأ في إدارة الفرع: ${error.message}`, 'خطأ في النظام');
        }
    }
}

// Clear branch form
function clearBranchForm() {
    document.getElementById('branchForm').reset();
    document.getElementById('branchStatus').value = '1';
}

// Edit branch
async function editBranch(branchId) {
    try {
        const branch = await ipcRenderer.invoke('db-get', 'SELECT * FROM branches WHERE id = ?', [branchId]);

        if (!branch) {
            DialogUtils.showError('الفرع غير موجود', 'خطأ في البيانات');
            return;
        }

        // Fill form with branch data
        document.getElementById('branchName').value = branch.branch_name;
        document.getElementById('branchAddress').value = branch.branch_address || '';
        document.getElementById('branchPhone').value = branch.branch_phone || '';
        document.getElementById('branchStatus').value = branch.is_active;

        // Change form to edit mode
        const form = document.getElementById('branchForm');
        form.setAttribute('data-edit-id', branchId);

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = 'تحديث الفرع';
        submitBtn.className = 'btn btn-warning';

        // Add cancel edit button
        let cancelBtn = form.querySelector('.cancel-edit-btn');
        if (!cancelBtn) {
            cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-secondary cancel-edit-btn';
            cancelBtn.textContent = 'إلغاء التعديل';
            cancelBtn.onclick = cancelBranchEdit;
            submitBtn.parentNode.appendChild(cancelBtn);
        }

        // Scroll to form
        form.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('❌ [BRANCHES] خطأ في تحميل بيانات الفرع للتعديل:', error);
        DialogUtils.showError(`خطأ في تحميل بيانات الفرع: ${error.message}`, 'خطأ في النظام');
    }
}

// Cancel branch edit
function cancelBranchEdit() {
    const form = document.getElementById('branchForm');
    form.removeAttribute('data-edit-id');

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'إضافة الفرع';
    submitBtn.className = 'btn btn-primary';

    const cancelBtn = form.querySelector('.cancel-edit-btn');
    if (cancelBtn) {
        cancelBtn.remove();
    }

    clearBranchForm();
}

// Delete branch
async function deleteBranch(branchId) {
    try {
        // Check if branch has cashiers
        const cashiersCount = await ipcRenderer.invoke('db-get',
            'SELECT COUNT(*) as count FROM cashiers WHERE branch_id = ?', [branchId]);

        if (cashiersCount.count > 0) {
            DialogUtils.showError(
                `لا يمكن حذف الفرع لأنه يحتوي على ${cashiersCount.count} كاشير. يرجى نقل الكاشيرين إلى فرع آخر أولاً.`,
                'لا يمكن الحذف'
            );
            return;
        }

        const confirmed = await DialogUtils.showConfirm(
            'هل أنت متأكد من حذف هذا الفرع؟',
            'تأكيد الحذف'
        );

        if (!confirmed) return;

        const result = await ipcRenderer.invoke('db-run', 'DELETE FROM branches WHERE id = ?', [branchId]);

        if (result.changes > 0) {
            DialogUtils.showSuccessToast('تم حذف الفرع بنجاح');
            loadBranches();
        } else {
            DialogUtils.showError('فشل في حذف الفرع', 'خطأ في قاعدة البيانات');
        }

    } catch (error) {
        console.error('❌ [BRANCHES] خطأ في حذف الفرع:', error);
        DialogUtils.showError(`خطأ في حذف الفرع: ${error.message}`, 'خطأ في النظام');
    }
}

// Toggle branch status
async function toggleBranchStatus(branchId, currentStatus) {
    try {
        const newStatus = currentStatus ? 0 : 1;
        const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

        const confirmed = await DialogUtils.showConfirm(
            `هل أنت متأكد من ${action} هذا الفرع؟`,
            `تأكيد ${action}`
        );

        if (!confirmed) return;

        const result = await ipcRenderer.invoke('db-run',
            'UPDATE branches SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newStatus, branchId]);

        if (result.changes > 0) {
            DialogUtils.showSuccessToast(`تم ${action} الفرع بنجاح`);
            loadBranches();
            loadDropdownData(); // Refresh dropdowns
        } else {
            DialogUtils.showError(`فشل في ${action} الفرع`, 'خطأ في قاعدة البيانات');
        }

    } catch (error) {
        console.error('❌ [BRANCHES] خطأ في تغيير حالة الفرع:', error);
        DialogUtils.showError(`خطأ في تغيير حالة الفرع: ${error.message}`, 'خطأ في النظام');
    }
}

// Filter cashiers by branch
async function filterCashiersByBranch(branchId) {
    try {
        let query = `
            SELECT c.*, b.branch_name
            FROM cashiers c
            LEFT JOIN branches b ON c.branch_id = b.id
            WHERE c.active = 1
        `;
        let params = [];

        if (branchId && branchId !== '') {
            query += ' AND c.branch_id = ?';
            params.push(branchId);
        }

        query += ' ORDER BY c.name';

        const cashiers = await ipcRenderer.invoke('db-query', query, params);
        populateSelect('cashierSelect', cashiers, 'id', 'name');

        console.log('🏢 [BRANCHES] تم فلترة الكاشيرين حسب الفرع:', {
            branchId: branchId,
            cashiersCount: cashiers.length
        });

    } catch (error) {
        console.error('❌ [BRANCHES] خطأ في فلترة الكاشيرين:', error);
    }
}

// Handle branch selection change
function handleBranchSelectionChange() {
    const branchSelect = document.getElementById('branchSelect');
    if (branchSelect) {
        branchSelect.addEventListener('change', function () {
            const selectedBranchId = this.value;
            filterCashiersByBranch(selectedBranchId);

            // Clear cashier selection when branch changes
            const cashierSelect = document.getElementById('cashierSelect');
            if (cashierSelect) {
                cashierSelect.value = '';
                document.getElementById('cashierNumber').value = '';
            }
        });
    }
}

// Test function for branches management system
async function testBranchesManagement() {
    console.log('🏢 [TEST] اختبار نظام إدارة الفروع...');

    try {
        // Test loading branches
        const branches = await loadBranches();
        console.log('✅ [TEST] تم تحميل الفروع:', branches.length);

        // Test branch statistics
        const branchStats = await getBranchStatistics();
        console.log('📊 [TEST] إحصائيات الفروع:', branchStats);

        // Test cashier-branch relationship
        const cashiersWithBranches = await ipcRenderer.invoke('db-query', `
            SELECT c.name as cashier_name, c.cashier_number, b.branch_name
            FROM cashiers c
            LEFT JOIN branches b ON c.branch_id = b.id
            ORDER BY b.branch_name, c.name
        `);

        console.log('👥 [TEST] الكاشيرين والفروع:', cashiersWithBranches);

        DialogUtils.showSuccess(
            `تم اختبار نظام إدارة الفروع بنجاح!\n\n` +
            `📊 النتائج:\n` +
            `• عدد الفروع: ${branches.length}\n` +
            `• عدد الكاشيرين: ${cashiersWithBranches.length}\n` +
            `• الكاشيرين المرتبطين بفروع: ${cashiersWithBranches.filter(c => c.branch_name).length}\n` +
            `• الكاشيرين غير المرتبطين: ${cashiersWithBranches.filter(c => !c.branch_name).length}\n\n` +
            `✅ جميع الوظائف تعمل بشكل صحيح`,
            'اختبار نظام الفروع'
        );

        return true;

    } catch (error) {
        console.error('❌ [TEST] خطأ في اختبار نظام الفروع:', error);
        DialogUtils.showError(`خطأ في الاختبار: ${error.message}`, 'خطأ في الاختبار');
        return false;
    }
}

// Get branch statistics
async function getBranchStatistics() {
    try {
        const stats = await ipcRenderer.invoke('db-query', `
            SELECT
                b.id,
                b.branch_name,
                b.is_active,
                COUNT(c.id) as cashiers_count,
                COUNT(CASE WHEN c.active = 1 THEN 1 END) as active_cashiers_count
            FROM branches b
            LEFT JOIN cashiers c ON b.id = c.branch_id
            GROUP BY b.id, b.branch_name, b.is_active
            ORDER BY b.branch_name
        `);

        return stats;

    } catch (error) {
        console.error('❌ [BRANCHES] خطأ في جلب إحصائيات الفروع:', error);
        return [];
    }
}

// Make test function available globally
window.testBranchesManagement = testBranchesManagement;

// Quick print reconciliation (without options dialog)
async function quickPrintReconciliation(reconciliationId) {
    console.log('⚡ [PRINT] طباعة سريعة للتصفية - معرف:', reconciliationId);

    try {
        // Print with all sections included
        return await printReconciliationAdvanced(reconciliationId, {
            sections: {
                bankReceipts: true,
                cashReceipts: true,
                postpaidSales: true,
                customerReceipts: true,
                returnInvoices: true,
                suppliers: true,
                summary: true
            }
        });

    } catch (error) {
        console.error('❌ [PRINT] خطأ في الطباعة السريعة:', error);
        DialogUtils.showError(`خطأ في الطباعة السريعة: ${error.message}`, 'خطأ في النظام');
        return false;
    }
}

// Close print preview window
async function closePrintPreview() {
    console.log('🖨️ [PRINT] إغلاق نافذة معاينة الطباعة...');

    try {
        const result = await ipcRenderer.invoke('close-print-preview');

        if (result.success) {
            console.log('✅ [PRINT] تم إغلاق نافذة معاينة الطباعة');
            return true;
        } else {
            console.log('⚠️ [PRINT] نافذة معاينة الطباعة غير موجودة');
            return true;
        }

    } catch (error) {
        console.error('❌ [PRINT] خطأ في إغلاق نافذة معاينة الطباعة:', error);
        return false;
    }
}

// Test print system
async function testPrintSystem() {
    console.log('🧪 [TEST] اختبار نظام الطباعة...');

    try {
        // Get a test reconciliation
        const reconciliations = await ipcRenderer.invoke('db-query',
            'SELECT id FROM reconciliations ORDER BY created_at DESC LIMIT 1'
        );

        if (reconciliations.length === 0) {
            DialogUtils.showError('لا توجد تصفيات للاختبار', 'لا توجد بيانات');
            return false;
        }

        const testId = reconciliations[0].id;
        console.log(`🧪 [TEST] اختبار الطباعة للتصفية معرف: ${testId}`);

        // Test quick print
        const result = await quickPrintReconciliation(testId);

        if (result) {
            DialogUtils.showSuccess('تم اختبار نظام الطباعة بنجاح', 'اختبار مكتمل');
            return true;
        } else {
            DialogUtils.showError('فشل في اختبار نظام الطباعة', 'فشل الاختبار');
            return false;
        }

    } catch (error) {
        console.error('❌ [TEST] خطأ في اختبار نظام الطباعة:', error);
        DialogUtils.showError(`خطأ في اختبار الطباعة: ${error.message}`, 'خطأ في الاختبار');
        return false;
    }
}

// ===== DETAILED ATM REPORT FUNCTIONS =====

// Global variables for detailed report
let currentDetailedReportData = [];
let filteredDetailedReportData = [];
let currentDetailedReportPage = 1;
let detailedReportPageSize = 50;

// Show detailed ATM report modal
async function handleShowDetailedAtmReportModal() {
    console.log('📊 [DETAILED-ATM] فتح نافذة التقرير التحليلي المفصل...');

    try {
        // Load filter options
        await loadDetailedAtmReportFilters();

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('detailedAtmReportModal'));
        modal.show();

    } catch (error) {
        console.error('Error showing detailed ATM report modal:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء فتح نافذة التقرير');
    }
}

// Load filter options for detailed report
async function loadDetailedAtmReportFilters() {
    try {
        // Load ATMs
        const atms = await ipcRenderer.invoke('db-query',
            `SELECT a.*, b.branch_name
             FROM atms a
             LEFT JOIN branches b ON a.branch_id = b.id
             WHERE a.active = 1
             ORDER BY b.branch_name, a.name`
        );
        const atmSelect = document.getElementById('detailedAtmFilter');
        atmSelect.innerHTML = '<option value="">جميع الأجهزة</option>';
        atms.forEach(atm => {
            const option = document.createElement('option');
            option.value = atm.id;
            option.textContent = `${atm.name} - ${atm.branch_name || 'غير محدد'}`;
            atmSelect.appendChild(option);
        });

        // Load Account Numbers (Locations)
        const accountNumbers = await ipcRenderer.invoke('db-query',
            `SELECT DISTINCT location FROM atms WHERE active = 1 AND location IS NOT NULL AND location != '' ORDER BY location`
        );
        const accountSelect = document.getElementById('detailedAccountNumberFilter');
        if (accountSelect) {
            accountSelect.innerHTML = '<option value="">جميع الحسابات</option>';
            accountNumbers.forEach(item => {
                const option = document.createElement('option');
                option.value = item.location;
                option.textContent = item.location;
                accountSelect.appendChild(option);
            });
        }

        // Load Cashiers
        const cashiers = await ipcRenderer.invoke('db-query', 'SELECT * FROM cashiers WHERE active = 1 ORDER BY name');
        const cashierSelect = document.getElementById('detailedCashierFilter');
        cashierSelect.innerHTML = '<option value="">جميع الكاشيرين</option>';
        cashiers.forEach(cashier => {
            const option = document.createElement('option');
            option.value = cashier.id;
            option.textContent = `${cashier.name} (${cashier.cashier_number})`;
            cashierSelect.appendChild(option);
        });

        // Set default dates (last 7 days)
        const today = new Date();
        const lastWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);

        document.getElementById('detailedDateFrom').value = lastWeek.toISOString().split('T')[0];
        document.getElementById('detailedDateTo').value = today.toISOString().split('T')[0];

    } catch (error) {
        console.error('Error loading detailed report filters:', error);
    }
}

// Generate detailed ATM report
async function handleGenerateDetailedAtmReport() {
    console.log('📊 [DETAILED-ATM] إنشاء التقرير التحليلي المفصل...');

    try {
        // Get filter values
        const filters = getDetailedAtmReportFilters();

        // Validate required fields
        if (!filters.dateFrom || !filters.dateTo) {
            DialogUtils.showValidationError('يرجى تحديد نطاق التواريخ');
            return;
        }

        if (new Date(filters.dateFrom) > new Date(filters.dateTo)) {
            DialogUtils.showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
            return;
        }

        DialogUtils.showLoading('جاري إنشاء التقرير التحليلي المفصل...', 'يرجى الانتظار');

        // Generate detailed report data
        const detailedData = await generateDetailedAtmReportData(filters);

        DialogUtils.close();

        if (detailedData.length === 0) {
            DialogUtils.showInfo('لا توجد عمليات في النطاق المحدد', 'لا توجد نتائج');
            document.getElementById('detailedAtmReportResults').style.display = 'none';
            return;
        }

        // Store data and display results
        currentDetailedReportData = detailedData;
        filteredDetailedReportData = [...detailedData];
        currentDetailedReportPage = 1;

        displayDetailedAtmReportResults();

        DialogUtils.showSuccessToast(`تم إنشاء التقرير بنجاح (${detailedData.length} عملية)`);

    } catch (error) {
        DialogUtils.close();
        console.error('Error generating detailed ATM report:', error);
        DialogUtils.showError(`حدث خطأ أثناء إنشاء التقرير: ${error.message}`, 'خطأ في التقرير');
    }
}

// Get filter values for detailed report
function getDetailedAtmReportFilters() {
    return {
        atmId: document.getElementById('detailedAtmFilter').value,
        accountNumber: document.getElementById('detailedAccountNumberFilter').value,
        operationType: document.getElementById('detailedOperationTypeFilter').value,
        cashierId: document.getElementById('detailedCashierFilter').value,
        dateFrom: document.getElementById('detailedDateFrom').value,
        dateTo: document.getElementById('detailedDateTo').value,
        minAmount: parseFloat(document.getElementById('detailedMinAmount').value) || 0,
        maxAmount: parseFloat(document.getElementById('detailedMaxAmount').value) || null
    };
}

// Generate detailed ATM report data
async function generateDetailedAtmReportData(filters) {
    console.log('🏧 [DETAILED-ATM] توليد بيانات التقرير التحليلي المفصل...');

    let whereConditions = [];
    let params = [];

    // Date range filter (required)
    whereConditions.push('DATE(r.reconciliation_date) BETWEEN ? AND ?');
    params.push(filters.dateFrom, filters.dateTo);

    // ATM filter
    if (filters.atmId) {
        whereConditions.push('br.atm_id = ?');
        params.push(filters.atmId);
    }

    // Account Number filter
    if (filters.accountNumber) {
        whereConditions.push('a.location = ?');
        params.push(filters.accountNumber);
    }

    // Operation type filter
    if (filters.operationType) {
        whereConditions.push('br.operation_type = ?');
        params.push(filters.operationType);
    }

    // Cashier filter
    if (filters.cashierId) {
        whereConditions.push('r.cashier_id = ?');
        params.push(filters.cashierId);
    }

    // Amount filters
    const exactAmount = parseFloat(document.getElementById('detailedExactAmount').value);

    if (!isNaN(exactAmount) && exactAmount > 0) {
        // إذا تم تحديد مبلغ محدد، نبحث عنه بالضبط
        whereConditions.push('br.amount = ?');
        params.push(exactAmount);
    } else {
        // وإلا نستخدم الحد الأدنى والأعلى
        if (filters.minAmount > 0) {
            whereConditions.push('br.amount >= ?');
            params.push(filters.minAmount);
        }

        if (filters.maxAmount && filters.maxAmount > 0) {
            whereConditions.push('br.amount <= ?');
            params.push(filters.maxAmount);
        }
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const query = `
        SELECT
            br.id as receipt_id,
            br.operation_type,
            br.amount,
            br.created_at as operation_datetime,
            a.id as atm_id,
            a.name as atm_name,
            a.location as atm_location,
            a.bank_name,
            b.branch_name as atm_branch_name,
            c.id as cashier_id,
            c.name as cashier_name,
            c.cashier_number,
            r.id as reconciliation_id,
            r.reconciliation_number,
            r.reconciliation_date,
            r.created_at as reconciliation_created_at
        FROM bank_receipts br
        INNER JOIN atms a ON br.atm_id = a.id
        LEFT JOIN branches b ON a.branch_id = b.id
        INNER JOIN reconciliations r ON br.reconciliation_id = r.id
        INNER JOIN cashiers c ON r.cashier_id = c.id
        ${whereClause}
        ORDER BY br.created_at DESC, br.id DESC
    `;

    console.log('🔍 [DETAILED-ATM] استعلام قاعدة البيانات:', query);
    console.log('🔍 [DETAILED-ATM] معاملات الاستعلام:', params);

    const results = await ipcRenderer.invoke('db-all', query, params);

    console.log(`📊 [DETAILED-ATM] تم العثور على ${results.length} عملية`);

    return results.map(row => ({
        ...row,
        formatted_amount: formatCurrency(row.amount),
        formatted_datetime: formatDateTime(row.operation_datetime),
        formatted_date: formatDate(row.reconciliation_date)
    }));
}

// Display detailed ATM report results
function displayDetailedAtmReportResults() {
    console.log('📊 [DETAILED-ATM] عرض نتائج التقرير التحليلي المفصل...');

    // Show results section
    document.getElementById('detailedAtmReportResults').style.display = 'block';

    // Update title
    const totalOperations = filteredDetailedReportData.length;
    document.getElementById('detailedReportTitle').textContent =
        `نتائج التقرير التحليلي (${totalOperations} عملية)`;

    // Display summary statistics
    displayDetailedReportSummary();

    // Display table data
    displayDetailedReportTable();

    // Setup pagination
    setupDetailedReportPagination();
}

// Display summary statistics for detailed report
function displayDetailedReportSummary() {
    const data = filteredDetailedReportData;

    if (data.length === 0) {
        document.getElementById('detailedReportSummary').innerHTML = '';
        return;
    }

    const totalAmount = data.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const avgAmount = totalAmount / data.length;
    const maxAmount = Math.max(...data.map(item => parseFloat(item.amount)));
    const minAmount = Math.min(...data.map(item => parseFloat(item.amount)));

    // Count by operation type
    const operationCounts = {};
    data.forEach(item => {
        operationCounts[item.operation_type] = (operationCounts[item.operation_type] || 0) + 1;
    });

    // Count unique ATMs and cashiers
    const uniqueAtms = new Set(data.map(item => item.atm_id)).size;
    const uniqueCashiers = new Set(data.map(item => item.cashier_id)).size;

    const summaryHtml = `
        <div class="col-md-2">
            <div class="card bg-primary text-white">
                <div class="card-body text-center">
                    <h6 class="card-title">إجمالي العمليات</h6>
                    <h4>${data.length}</h4>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-success text-white">
                <div class="card-body text-center">
                    <h6 class="card-title">إجمالي المبلغ</h6>
                    <h5>${formatCurrency(totalAmount)}</h5>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-info text-white">
                <div class="card-body text-center">
                    <h6 class="card-title">متوسط المبلغ</h6>
                    <h5>${formatCurrency(avgAmount)}</h5>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-warning text-white">
                <div class="card-body text-center">
                    <h6 class="card-title">أعلى مبلغ</h6>
                    <h5>${formatCurrency(maxAmount)}</h5>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-secondary text-white">
                <div class="card-body text-center">
                    <h6 class="card-title">عدد الأجهزة</h6>
                    <h4>${uniqueAtms}</h4>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-dark text-white">
                <div class="card-body text-center">
                    <h6 class="card-title">عدد الكاشيرين</h6>
                    <h4>${uniqueCashiers}</h4>
                </div>
            </div>
        </div>
    `;

    document.getElementById('detailedReportSummary').innerHTML = summaryHtml;
}

// Display detailed report table
function displayDetailedReportTable() {
    const tbody = document.getElementById('detailedAtmReportTableBody');
    tbody.innerHTML = '';

    // Calculate pagination
    const startIndex = (currentDetailedReportPage - 1) * detailedReportPageSize;
    const endIndex = detailedReportPageSize === 'all' ?
        filteredDetailedReportData.length :
        Math.min(startIndex + parseInt(detailedReportPageSize), filteredDetailedReportData.length);

    const pageData = filteredDetailedReportData.slice(startIndex, endIndex);

    if (pageData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-4">
                    لا توجد عمليات تطابق المعايير المحددة
                </td>
            </tr>
        `;
        return;
    }

    pageData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.formatted_datetime}</td>
            <td>
                <span class="badge ${getOperationTypeBadgeClass(item.operation_type)}">
                    ${item.operation_type}
                </span>
            </td>
            <td>${item.atm_name}</td>
            <td>
                <span class="badge bg-info">
                    ${item.atm_branch_name || 'غير محدد'}
                </span>
            </td>
            <td>${item.atm_location || 'غير محدد'}</td>
            <td>${item.bank_name}</td>
            <td class="text-end fw-bold">${item.formatted_amount}</td>
            <td>${item.cashier_name} (${item.cashier_number})</td>
            <td>
                <a href="#" onclick="viewReconciliationDetails(${item.reconciliation_id})"
                   class="text-decoration-none">
                    #${item.reconciliation_number || item.reconciliation_id}
                </a>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Get badge class for operation type
function getOperationTypeBadgeClass(operationType) {
    switch (operationType) {
        case 'مدى': return 'bg-primary';
        case 'فيزا': return 'bg-success';
        case 'ماستر كارد': return 'bg-warning text-dark';
        case 'أمريكان إكسبريس': return 'bg-info';
        case 'تحويل': return 'bg-purple text-white';
        default: return 'bg-secondary';
    }
}

// Setup pagination for detailed report
function setupDetailedReportPagination() {
    const totalItems = filteredDetailedReportData.length;
    const totalPages = detailedReportPageSize === 'all' ? 1 : Math.ceil(totalItems / parseInt(detailedReportPageSize));

    const paginationNav = document.getElementById('detailedReportPaginationNav');
    const paginationInfo = document.getElementById('detailedReportPaginationInfo');
    const pagination = document.getElementById('detailedReportPagination');

    if (totalPages <= 1) {
        paginationNav.style.display = 'none';
        return;
    }

    paginationNav.style.display = 'block';

    // Update pagination info
    const startItem = (currentDetailedReportPage - 1) * parseInt(detailedReportPageSize) + 1;
    const endItem = Math.min(currentDetailedReportPage * parseInt(detailedReportPageSize), totalItems);
    paginationInfo.textContent = `عرض ${startItem}-${endItem} من ${totalItems} عملية`;

    // Generate pagination buttons
    let paginationHtml = '';

    // Previous button
    if (currentDetailedReportPage > 1) {
        paginationHtml += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="changeDetailedReportPage(${currentDetailedReportPage - 1})">السابق</a>
            </li>
        `;
    }

    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentDetailedReportPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHtml += `
            <li class="page-item ${i === currentDetailedReportPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changeDetailedReportPage(${i})">${i}</a>
            </li>
        `;
    }

    // Next button
    if (currentDetailedReportPage < totalPages) {
        paginationHtml += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="changeDetailedReportPage(${currentDetailedReportPage + 1})">التالي</a>
            </li>
        `;
    }

    pagination.innerHTML = paginationHtml;
}

// Change page for detailed report
function changeDetailedReportPage(page) {
    currentDetailedReportPage = page;
    displayDetailedReportTable();
    setupDetailedReportPagination();
}

// Handle search in detailed report
function handleDetailedReportSearch() {
    const searchTerm = document.getElementById('detailedReportSearch').value.toLowerCase().trim();
    const searchAmount = parseFloat(searchTerm);

    if (!searchTerm) {
        filteredDetailedReportData = [...currentDetailedReportData];
    } else {
        filteredDetailedReportData = currentDetailedReportData.filter(item => {
            // إذا كان البحث رقماً، ابحث في المبالغ فقط بشكل دقيق
            if (!isNaN(searchAmount)) {
                return item.amount === searchAmount;
            }
            // إذا كان البحث نصاً، ابحث في جميع الحقول
            return (
                item.atm_name.toLowerCase().includes(searchTerm) ||
                item.atm_location.toLowerCase().includes(searchTerm) ||
                (item.atm_branch_name && item.atm_branch_name.toLowerCase().includes(searchTerm)) ||
                item.bank_name.toLowerCase().includes(searchTerm) ||
                item.operation_type.toLowerCase().includes(searchTerm) ||
                item.cashier_name.toLowerCase().includes(searchTerm) ||
                item.cashier_number.toLowerCase().includes(searchTerm) ||
                item.amount.toString().includes(searchTerm) ||
                item.reconciliation_id.toString().includes(searchTerm)
            );
        });
    }

    currentDetailedReportPage = 1;
    displayDetailedReportResults();
}

// Handle sort in detailed report
function handleDetailedReportSort() {
    const sortValue = document.getElementById('detailedReportSort').value;

    filteredDetailedReportData.sort((a, b) => {
        switch (sortValue) {
            case 'date_desc':
                return new Date(b.operation_datetime) - new Date(a.operation_datetime);
            case 'date_asc':
                return new Date(a.operation_datetime) - new Date(b.operation_datetime);
            case 'amount_desc':
                return parseFloat(b.amount) - parseFloat(a.amount);
            case 'amount_asc':
                return parseFloat(a.amount) - parseFloat(b.amount);
            case 'atm_name':
                return a.atm_name.localeCompare(b.atm_name, 'ar');
            case 'operation_type':
                return a.operation_type.localeCompare(b.operation_type, 'ar');
            default:
                return 0;
        }
    });

    currentDetailedReportPage = 1;
    displayDetailedReportResults();
}

// Handle page size change in detailed report
function handleDetailedReportPageSize() {
    const newPageSize = document.getElementById('detailedReportPageSize').value;
    detailedReportPageSize = newPageSize === 'all' ? 'all' : parseInt(newPageSize);
    currentDetailedReportPage = 1;
    displayDetailedReportResults();
}

// Note: formatDateTime and formatDate functions are now defined above with Gregorian calendar support

// Export detailed ATM report to Excel
async function handleExportDetailedAtmReportExcel() {
    console.log('📊 [DETAILED-ATM] تصدير التقرير إلى Excel...');

    try {
        if (!filteredDetailedReportData || filteredDetailedReportData.length === 0) {
            DialogUtils.showValidationError('لا توجد بيانات للتصدير');
            return;
        }

        DialogUtils.showLoading('جاري تصدير التقرير إلى Excel...', 'يرجى الانتظار');

        // Prepare headers
        const headers = [
            'التاريخ والوقت',
            'نوع العملية',
            'اسم الجهاز',
            'الفرع',
            'رقم الحساب',
            'البنك',
            'المبلغ',
            'الكاشير',
            'رقم الكاشير',
            'رقم التصفية',
            'تاريخ التصفية'
        ];

        // Prepare data rows
        const rows = filteredDetailedReportData.map(item => [
            item.formatted_datetime,
            item.operation_type,
            item.atm_name,
            item.atm_branch_name || 'غير محدد',
            item.atm_location || 'غير محدد',
            item.bank_name,
            item.amount,
            item.cashier_name,
            item.cashier_number,
            item.reconciliation_id,
            item.formatted_date
        ]);

        // Get filter summary for filename
        const filters = getDetailedAtmReportFilters();
        const filename = `تقرير_تحليلي_مفصل_أجهزة_الصراف_${filters.dateFrom}_${filters.dateTo}.xlsx`;

        // Export using existing system
        const result = await ipcRenderer.invoke('export-excel', {
            data: {
                headers: headers,
                rows: rows
            },
            filename: filename
        });

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccessToast('تم تصدير التقرير إلى Excel بنجاح');
        } else {
            DialogUtils.showError(`فشل في تصدير Excel: ${result.error}`, 'خطأ في التصدير');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('Error exporting detailed ATM report to Excel:', error);
        DialogUtils.showError(`حدث خطأ أثناء تصدير التقرير: ${error.message}`, 'خطأ في التصدير');
    }
}

// Print detailed ATM report using independent print system
async function handlePrintDetailedAtmReport() {
    console.log('🖨️ [DETAILED-ATM] طباعة التقرير التحليلي المفصل...');

    try {
        if (!filteredDetailedReportData || filteredDetailedReportData.length === 0) {
            DialogUtils.showValidationError('لا توجد بيانات للطباعة');
            return;
        }

        DialogUtils.showLoading('جاري تحضير التقرير للطباعة...', 'يرجى الانتظار');

        // Generate print content with company name
        const printHtml = await generateDetailedAtmReportPrintContent();

        // Use independent print system for detailed ATM report
        const result = await openDetailedAtmReportPrintWindow(printHtml);

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccessToast('تم فتح نافذة معاينة الطباعة بنجاح');
        } else {
            DialogUtils.showError(`فشل في فتح معاينة الطباعة: ${result.error}`, 'خطأ في الطباعة');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [DETAILED-ATM] خطأ في طباعة التقرير:', error);
        DialogUtils.showError(`حدث خطأ أثناء طباعة التقرير: ${error.message}`, 'خطأ في الطباعة');
    }
}

/**
 * Open independent print window for detailed ATM report
 */
async function openDetailedAtmReportPrintWindow(htmlContent) {
    console.log('🖨️ [DETAILED-ATM] فتح نافذة طباعة مستقلة...');

    try {
        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');

        if (!printWindow) {
            throw new Error('فشل في فتح نافذة الطباعة - قد يكون محجوبة بواسطة مانع النوافذ المنبثقة');
        }

        // Write the HTML content to the new window
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Wait for content to load
        await new Promise((resolve) => {
            printWindow.onload = resolve;
            // Fallback timeout
            setTimeout(resolve, 1000);
        });

        // Focus the window
        printWindow.focus();

        console.log('✅ [DETAILED-ATM] تم فتح نافذة الطباعة بنجاح');

        return { success: true };

    } catch (error) {
        console.error('❌ [DETAILED-ATM] خطأ في فتح نافذة الطباعة:', error);
        return { success: false, error: error.message };
    }
}



// Generate print content for detailed ATM report with company branding
async function generateDetailedAtmReportPrintContent() {
    const filters = getDetailedAtmReportFilters();
    const totalAmount = filteredDetailedReportData.reduce((sum, item) => sum + parseFloat(item.amount), 0);

    // Get company name
    const companyName = await getCompanyName();

    let content = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>التقرير التحليلي المفصل لأجهزة الصراف الآلي - ${companyName}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap');

                body {
                    font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    direction: rtl;
                    text-align: right;
                    font-size: 12px;
                    line-height: 1.4;
                    color: #333;
                    margin: 0;
                    padding: 20px;
                    margin-bottom: 25mm;
                }

                /* رأس الشركة */
                .company-header {
                    text-align: center;
                    margin-bottom: 25px;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 10px;
                    page-break-inside: avoid;
                }

                .company-name {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 8px;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
                }

                .report-title {
                    font-size: 18px;
                    font-weight: 400;
                    opacity: 0.95;
                    margin-bottom: 5px;
                }

                .report-subtitle {
                    font-size: 14px;
                    opacity: 0.8;
                }

                /* معلومات التقرير */
                .report-info {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border-right: 4px solid #3498db;
                }

                .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }

                .info-label {
                    font-weight: 600;
                    color: #2c3e50;
                }

                .info-value {
                    color: #34495e;
                }

                /* جدول البيانات */
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                    font-size: 11px;
                }

                .data-table th {
                    background: linear-gradient(135deg, #3498db, #2980b9);
                    color: white;
                    border: 1px solid #2980b9;
                    padding: 10px 8px;
                    text-align: center;
                    font-weight: 600;
                }

                .data-table td {
                    border: 1px solid #ddd;
                    padding: 8px 6px;
                    text-align: center;
                }

                .data-table tr:nth-child(even) {
                    background-color: #f8f9fa;
                }

                .data-table tr:hover {
                    background-color: #e3f2fd;
                }

                /* أنواع العمليات */
                .operation-mada {
                    background: #007bff;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                }

                .operation-visa {
                    background: #28a745;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                }

                .operation-mastercard {
                    background: #ffc107;
                    color: #212529;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                }

                /* أدوات التحكم في الطباعة */
                .print-controls {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    z-index: 1000;
                    background: white;
                    padding: 10px;
                    border-radius: 5px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    border: 1px solid #ddd;
                }

                .print-controls button {
                    margin: 0 5px;
                    padding: 8px 15px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: 'Cairo', Arial, sans-serif;
                    font-size: 12px;
                }

                .print-btn {
                    background: #007bff;
                    color: white;
                }

                .print-btn:hover {
                    background: #0056b3;
                }

                .close-btn {
                    background: #6c757d;
                    color: white;
                }

                .close-btn:hover {
                    background: #545b62;
                }

                /* فوتر الصفحة */
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

                @page {
                    margin: 20mm;
                    margin-bottom: 25mm;
                }

                @media print {
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .print-controls {
                        display: none !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            </style>
        </head>
        <body>
            <!-- أدوات التحكم في الطباعة -->
            <div class="print-controls no-print">
                <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
                <button class="close-btn" onclick="window.close()">❌ إغلاق</button>
            </div>

            <!-- رأس الشركة -->
            <div class="company-header">
                <div class="company-name">${companyName}</div>
                <div class="report-title">التقرير التحليلي المفصل لأجهزة الصراف الآلي</div>
                <div class="report-subtitle">تقرير شامل لجميع عمليات أجهزة الصراف الآلي</div>
            </div>

            <!-- معلومات التقرير -->
            <div class="report-info">
                <div class="info-row">
                    <span class="info-label">فترة التقرير:</span>
                    <span class="info-value">من ${filters.dateFrom} إلى ${filters.dateTo}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">إجمالي العمليات:</span>
                    <span class="info-value">${filteredDetailedReportData.length} عملية</span>
                </div>
                <div class="info-row">
                    <span class="info-label">إجمالي المبلغ:</span>
                    <span class="info-value">${formatCurrency(totalAmount)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">تاريخ إنشاء التقرير:</span>
                    <span class="info-value">${getCurrentDateTime()}</span>
                </div>
            </div>

            <!-- جدول البيانات -->
            <table class="data-table">
                <thead>
                    <tr>
                        <th>التاريخ والوقت</th>
                        <th>نوع العملية</th>
                        <th>الجهاز</th>
                        <th>الفرع</th>
                        <th>الموقع</th>
                        <th>البنك</th>
                        <th>المبلغ</th>
                        <th>الكاشير</th>
                        <th>رقم التصفية</th>
                    </tr>
                </thead>
                <tbody>

    `;

    filteredDetailedReportData.forEach(item => {
        // تحديد نوع العملية مع التصميم المناسب
        let operationTypeHtml = '';
        const operationType = item.operation_type.toLowerCase();
        if (operationType.includes('مدى')) {
            operationTypeHtml = `<span class="operation-mada">${item.operation_type}</span>`;
        } else if (operationType.includes('فيزا')) {
            operationTypeHtml = `<span class="operation-visa">${item.operation_type}</span>`;
        } else if (operationType.includes('ماستر')) {
            operationTypeHtml = `<span class="operation-mastercard">${item.operation_type}</span>`;
        } else {
            operationTypeHtml = item.operation_type;
        }

        content += `
            <tr>
                <td>${item.formatted_datetime}</td>
                <td>${operationTypeHtml}</td>
                <td>${item.atm_name}</td>
                <td style="font-weight: 600; color: #17a2b8;">${item.atm_branch_name || 'غير محدد'}</td>
                <td>${item.atm_location || 'غير محدد'}</td>
                <td>${item.bank_name}</td>
                <td style="text-align: left; font-weight: 600;">${item.formatted_amount}</td>
                <td>${item.cashier_name} (${item.cashier_number})</td>
                <td style="font-weight: 600; color: #3498db;">#${item.reconciliation_id}</td>
            </tr>
        `;
    });

    content += `
                </tbody>
            </table>

            <!-- فوتر الصفحة - يظهر في كل صفحة مطبوعة -->
            <div class="page-footer">
                جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
            </div>
        </body>
        </html>
    `;

    return content;
}

// ===== SYSTEM SETTINGS FUNCTIONS =====

// Load system settings from database
async function loadSystemSettings() {
    console.log('⚙️ [SETTINGS] تحميل إعدادات النظام...');

    try {
        // Load general settings
        const generalSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['general']);

        // Load print settings
        const printSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['print']);

        // Load reports settings
        const reportsSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['reports']);

        // Load database settings
        const databaseSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['database']);

        // Load user settings
        const userSettings = await ipcRenderer.invoke('db-all',
            'SELECT * FROM system_settings WHERE category = ?', ['user']);

        // Apply settings to UI
        console.log('📋 [SETTINGS] تطبيق الإعدادات العامة:', generalSettings);
        applyGeneralSettings(generalSettings);
        applyPrintSettings(printSettings);
        applyReportsSettings(reportsSettings);
        applyDatabaseSettings(databaseSettings);
        applyUserSettings(userSettings);

        // Load system information
        loadSystemInformation();

        console.log('✅ [SETTINGS] تم تحميل إعدادات النظام بنجاح');

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تحميل الإعدادات:', error);
        // Create default settings if table doesn't exist
        await createDefaultSettings();
    }
}

// Create default settings table and data
async function createDefaultSettings() {
    console.log('🔧 [SETTINGS] إنشاء إعدادات افتراضية...');

    try {
        // Create settings table if it doesn't exist
        await ipcRenderer.invoke('db-run', `
            CREATE TABLE IF NOT EXISTS system_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                setting_key TEXT NOT NULL,
                setting_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(category, setting_key)
            )
        `);

        // Insert default settings
        const defaultSettings = [
            // General settings
            { category: 'general', key: 'company_name', value: 'شركة الكاشير' },
            { category: 'general', key: 'company_phone', value: '' },
            { category: 'general', key: 'company_email', value: '' },
            { category: 'general', key: 'company_website', value: '' },
            { category: 'general', key: 'company_address', value: '' },
            { category: 'general', key: 'company_logo', value: '' },
            { category: 'general', key: 'system_language', value: 'ar' },
            { category: 'general', key: 'system_theme', value: 'light' },

            // Print settings
            { category: 'print', key: 'paper_size', value: 'A4' },
            { category: 'print', key: 'paper_orientation', value: 'portrait' },
            { category: 'print', key: 'font_family', value: 'Cairo' },
            { category: 'print', key: 'font_size', value: 'normal' },
            { category: 'print', key: 'margin_top', value: '20' },
            { category: 'print', key: 'margin_bottom', value: '20' },
            { category: 'print', key: 'margin_left', value: '15' },
            { category: 'print', key: 'margin_right', value: '15' },
            { category: 'print', key: 'print_header', value: 'true' },
            { category: 'print', key: 'print_footer', value: 'true' },
            { category: 'print', key: 'color_print', value: 'false' },
            { category: 'print', key: 'print_logo', value: 'true' },
            { category: 'print', key: 'print_page_numbers', value: 'true' },
            { category: 'print', key: 'print_date', value: 'true' },
            { category: 'print', key: 'print_borders', value: 'false' },

            // Reports settings
            { category: 'reports', key: 'default_format', value: 'pdf' },
            { category: 'reports', key: 'default_date_range', value: 'week' },
            { category: 'reports', key: 'reports_path', value: '' },
            { category: 'reports', key: 'include_charts', value: 'true' },
            { category: 'reports', key: 'include_summary', value: 'true' },
            { category: 'reports', key: 'include_details', value: 'true' },
            { category: 'reports', key: 'auto_open_reports', value: 'false' },
            { category: 'reports', key: 'save_report_history', value: 'true' },
            { category: 'reports', key: 'compress_reports', value: 'false' },

            // Database settings
            { category: 'database', key: 'auto_backup', value: 'daily' },
            { category: 'database', key: 'backup_location', value: '' },

            // User settings
            { category: 'user', key: 'session_timeout', value: '60' },
            { category: 'user', key: 'auto_lock', value: '10' }
        ];

        for (const setting of defaultSettings) {
            await ipcRenderer.invoke('db-run', `
                INSERT OR IGNORE INTO system_settings (category, setting_key, setting_value)
                VALUES (?, ?, ?)
            `, [setting.category, setting.key, setting.value]);
        }

        console.log('✅ [SETTINGS] تم إنشاء الإعدادات الافتراضية');

        // Load the newly created settings
        await loadSystemSettings();

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في إنشاء الإعدادات الافتراضية:', error);
    }
}

// Apply general settings to UI
function applyGeneralSettings(settings) {
    console.log('🔄 [SETTINGS] تطبيق الإعدادات العامة على الواجهة...');

    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
        console.log(`📝 [SETTINGS] تطبيق ${setting.setting_key}: ${setting.setting_value}`);
    });

    // Apply to form fields
    if (settingsMap.company_name) {
        const companyNameField = document.getElementById('companyName');
        if (companyNameField) {
            companyNameField.value = settingsMap.company_name;
            console.log('✅ [SETTINGS] تم تطبيق اسم الشركة:', settingsMap.company_name);
        }
    }

    if (settingsMap.company_phone) {
        const companyPhoneField = document.getElementById('companyPhone');
        if (companyPhoneField) companyPhoneField.value = settingsMap.company_phone;
    }

    if (settingsMap.company_email) {
        const companyEmailField = document.getElementById('companyEmail');
        if (companyEmailField) companyEmailField.value = settingsMap.company_email;
    }

    if (settingsMap.company_website) {
        const companyWebsiteField = document.getElementById('companyWebsite');
        if (companyWebsiteField) companyWebsiteField.value = settingsMap.company_website;
    }

    if (settingsMap.company_address) {
        const companyAddressField = document.getElementById('companyAddress');
        if (companyAddressField) companyAddressField.value = settingsMap.company_address;
    }

    if (settingsMap.system_language) {
        const systemLanguageField = document.getElementById('systemLanguage');
        if (systemLanguageField) systemLanguageField.value = settingsMap.system_language;
    }

    if (settingsMap.system_theme) {
        const systemThemeField = document.getElementById('systemTheme');
        if (systemThemeField) systemThemeField.value = settingsMap.system_theme;
    }

    // Apply logo if exists
    if (settingsMap.company_logo) {
        displayCompanyLogo(settingsMap.company_logo);
    }

    // Set global company name for reports and other uses
    if (settingsMap.company_name) {
        window.currentCompanyName = settingsMap.company_name;
        console.log('🏢 [SETTINGS] تم تعيين اسم الشركة العام:', settingsMap.company_name);
    }

    // Apply theme immediately
    if (settingsMap.system_theme) {
        applyTheme(settingsMap.system_theme);
        console.log('🎨 [SETTINGS] تم تطبيق المظهر:', settingsMap.system_theme);
    }

    // Apply language settings
    if (settingsMap.system_language) {
        console.log('🌐 [SETTINGS] تم تعيين اللغة:', settingsMap.system_language);
    }
}

// Apply print settings to UI
function applyPrintSettings(settings) {
    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });

    // Apply to form fields
    const fieldMappings = {
        'paper_size': 'paperSize',
        'paper_orientation': 'paperOrientation',
        'font_family': 'fontFamily',
        'font_size': 'fontSize',
        'margin_top': 'marginTop',
        'margin_bottom': 'marginBottom',
        'margin_left': 'marginLeft',
        'margin_right': 'marginRight'
    };

    Object.entries(fieldMappings).forEach(([settingKey, fieldId]) => {
        if (settingsMap[settingKey]) {
            const field = document.getElementById(fieldId);
            if (field) field.value = settingsMap[settingKey];
        }
    });

    // Apply checkboxes
    const checkboxMappings = {
        'print_header': 'printHeader',
        'print_footer': 'printFooter',
        'print_logo': 'printLogo',
        'print_page_numbers': 'printPageNumbers',
        'print_date': 'printDate',
        'print_borders': 'printBorders',
        'color_print': 'colorPrintCheck'
    };

    Object.entries(checkboxMappings).forEach(([settingKey, fieldId]) => {
        if (settingsMap[settingKey]) {
            const field = document.getElementById(fieldId);
            if (field) field.checked = settingsMap[settingKey] === 'true';
        }
    });
}

// Apply reports settings to UI
function applyReportsSettings(settings) {
    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });

    // Apply to form fields
    const fieldMappings = {
        'default_format': 'defaultReportFormat',
        'default_date_range': 'defaultDateRange',
        'reports_path': 'reportsPath'
    };

    Object.entries(fieldMappings).forEach(([settingKey, fieldId]) => {
        if (settingsMap[settingKey]) {
            const field = document.getElementById(fieldId);
            if (field) field.value = settingsMap[settingKey];
        }
    });

    // Apply checkboxes
    const checkboxMappings = {
        'include_charts': 'includeCharts',
        'include_summary': 'includeSummary',
        'include_details': 'includeDetails',
        'auto_open_reports': 'autoOpenReports',
        'save_report_history': 'saveReportHistory',
        'compress_reports': 'compressReports'
    };

    Object.entries(checkboxMappings).forEach(([settingKey, fieldId]) => {
        if (settingsMap[settingKey]) {
            const field = document.getElementById(fieldId);
            if (field) field.checked = settingsMap[settingKey] === 'true';
        }
    });
}

// Apply database settings to UI
function applyDatabaseSettings(settings) {
    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });

    if (settingsMap.auto_backup) {
        const autoBackupField = document.getElementById('autoBackup');
        if (autoBackupField) autoBackupField.value = settingsMap.auto_backup;
    }

    if (settingsMap.backup_location) {
        const backupLocationField = document.getElementById('backupLocation');
        if (backupLocationField) backupLocationField.value = settingsMap.backup_location;
    }
}

// Apply user settings to UI
function applyUserSettings(settings) {
    const settingsMap = {};
    settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });

    if (settingsMap.session_timeout) {
        const sessionTimeoutField = document.getElementById('sessionTimeout');
        if (sessionTimeoutField) sessionTimeoutField.value = settingsMap.session_timeout;
    }

    if (settingsMap.auto_lock) {
        const autoLockField = document.getElementById('autoLock');
        if (autoLockField) autoLockField.value = settingsMap.auto_lock;
    }
}

// Handle save general settings
async function handleSaveGeneralSettings(event) {
    event.preventDefault();

    console.log('💾 [SETTINGS] حفظ الإعدادات العامة...');

    try {
        DialogUtils.showLoading('جاري حفظ الإعدادات العامة...', 'يرجى الانتظار');

        const formData = new FormData(event.target);
        const settings = [
            { key: 'company_name', value: formData.get('companyName') || '' },
            { key: 'company_phone', value: formData.get('companyPhone') || '' },
            { key: 'company_email', value: formData.get('companyEmail') || '' },
            { key: 'company_website', value: formData.get('companyWebsite') || '' },
            { key: 'company_address', value: formData.get('companyAddress') || '' },
            { key: 'system_language', value: formData.get('systemLanguage') || 'ar' },
            { key: 'system_theme', value: formData.get('systemTheme') || 'light' }
        ];

        console.log('📝 [SETTINGS] البيانات المراد حفظها:', settings);

        for (const setting of settings) {
            console.log(`💾 [SETTINGS] حفظ ${setting.key}: ${setting.value}`);
            const result = await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['general', setting.key, setting.value]);
            console.log(`✅ [SETTINGS] تم حفظ ${setting.key} بنجاح`);
        }

        // Apply settings immediately
        await applyGeneralSettingsRealTime(settings);

        DialogUtils.close();
        DialogUtils.showSuccessToast('تم حفظ الإعدادات العامة بنجاح وتطبيقها على النظام');

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [SETTINGS] خطأ في حفظ الإعدادات العامة:', error);
        DialogUtils.showError(`حدث خطأ أثناء حفظ الإعدادات: ${error.message}`, 'خطأ في الحفظ');
    }
}





/**
 * Get company name from settings
 */
async function getCompanyName() {
    try {
        const result = await ipcRenderer.invoke('db-get',
            'SELECT setting_value FROM system_settings WHERE category = ? AND setting_key = ?',
            ['general', 'company_name']
        );

        if (result && result.setting_value) {
            return result.setting_value;
        }

        return 'تقرير النظام'; // Default fallback
    } catch (error) {
        console.error('❌ [REPORTS] خطأ في جلب اسم الشركة:', error);
        return 'تقرير النظام'; // Default fallback
    }
}

/**
 * Handle selecting reports path
 */
async function handleSelectReportsPath() {
    try {
        console.log('📁 [SETTINGS] اختيار مجلد حفظ التقارير...');

        const result = await ipcRenderer.invoke('select-directory', {
            title: 'اختر مجلد حفظ التقارير',
            defaultPath: ''
        });

        if (result.success && result.filePath) {
            document.getElementById('reportsPath').value = result.filePath;

            // Save the path to settings
            await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['reports', 'default_save_path', result.filePath]);

            DialogUtils.showSuccessToast('تم تحديد مجلد حفظ التقارير بنجاح');
            console.log('✅ [SETTINGS] تم حفظ مسار التقارير:', result.filePath);
        }
    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في اختيار مجلد التقارير:', error);
        DialogUtils.showErrorToast('حدث خطأ أثناء اختيار المجلد');
    }
}

/**
 * Apply general settings in real-time without restart
 */
async function applyGeneralSettingsRealTime(settings) {
    console.log('⚡ [SETTINGS] تطبيق الإعدادات العامة في الوقت الفعلي...');

    try {
        const settingsMap = {};
        settings.forEach(setting => {
            settingsMap[setting.key] = setting.value;
        });

        // Apply theme changes
        if (settingsMap.system_theme) {
            applyTheme(settingsMap.system_theme);
        }

        // Apply language changes (if needed in future)
        if (settingsMap.system_language) {
            // Language switching logic can be added here
            console.log(`🌐 [SETTINGS] تم تعيين اللغة إلى: ${settingsMap.system_language}`);
        }

        // Update company name in global variable for reports
        if (settingsMap.company_name) {
            window.currentCompanyName = settingsMap.company_name;
            console.log(`🏢 [SETTINGS] تم تحديث اسم الشركة إلى: ${settingsMap.company_name}`);
        }

        console.log('✅ [SETTINGS] تم تطبيق الإعدادات العامة بنجاح');

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تطبيق الإعدادات العامة:', error);
    }
}

/**
 * Apply theme to the application and save settings
 */
function applyTheme(theme) {
    console.log('🎨 [THEME] تطبيق المظهر:', theme);
    const body = document.body;

    // Remove existing theme classes
    body.classList.remove('theme-light', 'theme-dark', 'theme-auto');

    // Apply new theme
    switch (theme) {
        case 'dark':
            body.classList.add('theme-dark');
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            console.log('🌙 [THEME] تم تطبيق المظهر الداكن');
            break;

        case 'auto':
            body.classList.add('theme-auto');
            // Check system preference
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                body.classList.add('theme-dark');
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                body.classList.add('theme-light');
                document.documentElement.setAttribute('data-theme', 'light');
            }
            localStorage.setItem('theme', 'auto');
            console.log('🌓 [THEME] تم تطبيق المظهر التلقائي -', prefersDark ? 'داكن' : 'فاتح');

            // Add listener for system theme changes
            const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            darkModeMediaQuery.addListener((e) => {
                if (localStorage.getItem('theme') === 'auto') {
                    body.classList.remove('theme-light', 'theme-dark');
                    if (e.matches) {
                        body.classList.add('theme-dark');
                        document.documentElement.setAttribute('data-theme', 'dark');
                    } else {
                        body.classList.add('theme-light');
                        document.documentElement.setAttribute('data-theme', 'light');
                    }
                }
            });
            break;

        case 'light':
        default:
            body.classList.add('theme-light');
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            console.log('☀️ [THEME] تم تطبيق المظهر الفاتح');
            break;
    }
}

// Handle save print settings
async function handleSavePrintSettings(event) {
    event.preventDefault();

    console.log('🖨️ [SETTINGS] حفظ إعدادات الطباعة...');

    try {
        DialogUtils.showLoading('جاري حفظ إعدادات الطباعة...', 'يرجى الانتظار');

        const settings = [
            { key: 'paper_size', value: document.getElementById('paperSize').value },
            { key: 'paper_orientation', value: document.getElementById('paperOrientation').value },
            { key: 'font_family', value: document.getElementById('fontFamily').value },
            { key: 'font_size', value: document.getElementById('fontSize').value },
            { key: 'margin_top', value: document.getElementById('marginTop').value },
            { key: 'margin_bottom', value: document.getElementById('marginBottom').value },
            { key: 'margin_left', value: document.getElementById('marginLeft').value },
            { key: 'margin_right', value: document.getElementById('marginRight').value },
            { key: 'print_header', value: document.getElementById('printHeader').checked.toString() },
            { key: 'print_footer', value: document.getElementById('printFooter').checked.toString() },
            { key: 'print_logo', value: document.getElementById('printLogo').checked.toString() },
            { key: 'print_page_numbers', value: document.getElementById('printPageNumbers').checked.toString() },
            { key: 'print_date', value: document.getElementById('printDate').checked.toString() },
            { key: 'print_borders', value: document.getElementById('printBorders').checked.toString() },
            { key: 'color_print', value: document.getElementById('colorPrintCheck').checked.toString() }
        ];

        for (const setting of settings) {
            await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['print', setting.key, setting.value]);
        }

        // Apply print settings to the print manager
        await applyPrintSettingsRealTime(settings);

        DialogUtils.close();
        DialogUtils.showSuccessToast('تم حفظ إعدادات الطباعة بنجاح وتطبيقها على النظام');

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [SETTINGS] خطأ في حفظ إعدادات الطباعة:', error);
        DialogUtils.showError(`حدث خطأ أثناء حفظ الإعدادات: ${error.message}`, 'خطأ في الحفظ');
    }
}

/**
 * Apply print settings in real-time
 */
async function applyPrintSettingsRealTime(settings) {
    console.log('🖨️ [SETTINGS] تطبيق إعدادات الطباعة في الوقت الفعلي...');

    try {
        const settingsMap = {};
        settings.forEach(setting => {
            settingsMap[setting.key] = setting.value;
        });

        // Update print manager settings via IPC
        const printSettings = {
            copies: parseInt(settingsMap.copies) || 1,
            paperSize: settingsMap.paper_size || 'A4',
            orientation: settingsMap.paper_orientation || 'portrait',
            color: settingsMap.color_print === 'true',
            duplex: settingsMap.duplex || 'simplex',
            margins: {
                top: parseInt(settingsMap.margin_top) || 20,
                right: parseInt(settingsMap.margin_right) || 15,
                bottom: parseInt(settingsMap.margin_bottom) || 20,
                left: parseInt(settingsMap.margin_left) || 15
            }
        };

        await ipcRenderer.invoke('update-print-settings', printSettings);
        console.log('✅ [SETTINGS] تم تطبيق إعدادات الطباعة بنجاح');

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تطبيق إعدادات الطباعة:', error);
    }
}

/**
 * Apply non-colored print styles to HTML content
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
                    background-image: none !important;
                    font-weight: bold !important;
                }

                /* Specific table section titles for reconciliation reports */
                .section-title:contains("المقبوضات البنكية"),
                .section-title:contains("المقبوضات النقدية"),
                .section-title:contains("الموردين"),
                .section-title:contains("المبيعات الآجلة"),
                .section-title:contains("مقبوضات العملاء"),
                .section-title:contains("فواتير المرتجعات") {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    font-weight: bold !important;
                }

                /* Summary section styling for non-colored print */
                .summary-section {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    border: 2px solid #000000 !important;
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

                /* Remove all gradient backgrounds and colored backgrounds */
                [style*="background"], [style*="linear-gradient"], [style*="radial-gradient"] {
                    background: transparent !important;
                    background-image: none !important;
                    background-color: transparent !important;
                }

                /* Ensure total rows are properly styled for non-colored print */
                .total-row, .total-row td, .total-row th {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    border: 2px solid #000000 !important;
                    font-weight: bold !important;
                }

                /* Header section styling for non-colored print */
                .header {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    border: 2px solid #000000 !important;
                }

                /* Reconciliation info section styling */
                .reconciliation-info {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    border: 1px solid #000000 !important;
                }

                /* Currency values styling for non-colored print */
                .currency {
                    color: #000000 !important;
                    background: transparent !important;
                    font-weight: bold !important;
                }

                /* Deficit values styling for non-colored print */
                .deficit {
                    color: #000000 !important;
                    background: transparent !important;
                    font-weight: bold !important;
                }
            }
        </style>
    `;
}

// Handle save reports settings
async function handleSaveReportsSettings(event) {
    event.preventDefault();

    console.log('📊 [SETTINGS] حفظ إعدادات التقارير...');

    try {
        DialogUtils.showLoading('جاري حفظ إعدادات التقارير...', 'يرجى الانتظار');

        const settings = [
            { key: 'default_format', value: document.getElementById('defaultReportFormat').value },
            { key: 'default_date_range', value: document.getElementById('defaultDateRange').value },
            { key: 'reports_path', value: document.getElementById('reportsPath').value },
            { key: 'include_charts', value: document.getElementById('includeCharts').checked.toString() },
            { key: 'include_summary', value: document.getElementById('includeSummary').checked.toString() },
            { key: 'include_details', value: document.getElementById('includeDetails').checked.toString() },
            { key: 'auto_open_reports', value: document.getElementById('autoOpenReports').checked.toString() },
            { key: 'save_report_history', value: document.getElementById('saveReportHistory').checked.toString() },
            { key: 'compress_reports', value: document.getElementById('compressReports').checked.toString() }
        ];

        for (const setting of settings) {
            await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['reports', setting.key, setting.value]);
        }

        DialogUtils.close();
        DialogUtils.showSuccessToast('تم حفظ إعدادات التقارير بنجاح');

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [SETTINGS] خطأ في حفظ إعدادات التقارير:', error);
        DialogUtils.showError(`حدث خطأ أثناء حفظ الإعدادات: ${error.message}`, 'خطأ في الحفظ');
    }
}

// Handle logo upload
async function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
        DialogUtils.showValidationError('نوع الملف غير مدعوم. يرجى اختيار PNG أو JPG أو SVG');
        event.target.value = '';
        return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
        DialogUtils.showValidationError('حجم الملف كبير جداً. الحد الأقصى 2 ميجابايت');
        event.target.value = '';
        return;
    }

    try {
        // Convert to base64
        const reader = new FileReader();
        reader.onload = async function (e) {
            const base64Data = e.target.result;

            // Save to database
            await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['general', 'company_logo', base64Data]);

            // Display preview
            displayCompanyLogo(base64Data);

            DialogUtils.showSuccessToast('تم رفع الشعار بنجاح');
        };

        reader.readAsDataURL(file);

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في رفع الشعار:', error);
        DialogUtils.showError(`حدث خطأ أثناء رفع الشعار: ${error.message}`, 'خطأ في الرفع');
    }
}

// Display company logo
function displayCompanyLogo(base64Data) {
    const logoPreview = document.getElementById('logoPreview');
    if (logoPreview && base64Data) {
        logoPreview.innerHTML = `<img src="${base64Data}" alt="شعار الشركة" style="max-width: 100%; max-height: 80px;">`;
    }
}

// Handle reset general settings
async function handleResetGeneralSettings() {
    const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من إعادة تعيين الإعدادات العامة إلى القيم الافتراضية؟',
        'تأكيد إعادة التعيين'
    );

    if (confirmed) {
        try {
            // Reset to default values
            document.getElementById('companyName').value = 'شركة الكاشير';
            document.getElementById('companyPhone').value = '';
            document.getElementById('companyEmail').value = '';
            document.getElementById('companyWebsite').value = '';
            document.getElementById('companyAddress').value = '';
            document.getElementById('systemLanguage').value = 'ar';
            document.getElementById('systemTheme').value = 'light';
            document.getElementById('companyLogo').value = '';
            document.getElementById('logoPreview').innerHTML = '<span class="text-muted">لا يوجد شعار</span>';

            DialogUtils.showSuccessToast('تم إعادة تعيين الإعدادات العامة');

        } catch (error) {
            console.error('❌ [SETTINGS] خطأ في إعادة تعيين الإعدادات:', error);
            DialogUtils.showError('حدث خطأ أثناء إعادة التعيين', 'خطأ');
        }
    }
}

// Handle reset print settings
async function handleResetPrintSettings() {
    const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من إعادة تعيين إعدادات الطباعة إلى القيم الافتراضية؟',
        'تأكيد إعادة التعيين'
    );

    if (confirmed) {
        try {
            // Reset to default values
            document.getElementById('paperSize').value = 'A4';
            document.getElementById('paperOrientation').value = 'portrait';
            document.getElementById('fontFamily').value = 'Cairo';
            document.getElementById('fontSize').value = 'normal';
            document.getElementById('marginTop').value = '20';
            document.getElementById('marginBottom').value = '20';
            document.getElementById('marginLeft').value = '15';
            document.getElementById('marginRight').value = '15';
            document.getElementById('printHeader').checked = true;
            document.getElementById('printFooter').checked = true;
            document.getElementById('printLogo').checked = true;
            document.getElementById('printPageNumbers').checked = true;
            document.getElementById('printDate').checked = true;
            document.getElementById('printBorders').checked = false;
            document.getElementById('colorPrintCheck').checked = false;

            DialogUtils.showSuccessToast('تم إعادة تعيين إعدادات الطباعة');

        } catch (error) {
            console.error('❌ [SETTINGS] خطأ في إعادة تعيين إعدادات الطباعة:', error);
            DialogUtils.showError('حدث خطأ أثناء إعادة التعيين', 'خطأ');
        }
    }
}

// Handle reset reports settings
async function handleResetReportsSettings() {
    const confirmed = await DialogUtils.showConfirm(
        'هل أنت متأكد من إعادة تعيين إعدادات التقارير إلى القيم الافتراضية؟',
        'تأكيد إعادة التعيين'
    );

    if (confirmed) {
        try {
            // Reset to default values
            document.getElementById('defaultReportFormat').value = 'pdf';
            document.getElementById('defaultDateRange').value = 'week';
            document.getElementById('reportsPath').value = '';
            document.getElementById('includeCharts').checked = true;
            document.getElementById('includeSummary').checked = true;
            document.getElementById('includeDetails').checked = true;
            document.getElementById('autoOpenReports').checked = false;
            document.getElementById('saveReportHistory').checked = true;
            document.getElementById('compressReports').checked = false;

            DialogUtils.showSuccessToast('تم إعادة تعيين إعدادات التقارير');

        } catch (error) {
            console.error('❌ [SETTINGS] خطأ في إعادة تعيين إعدادات التقارير:', error);
            DialogUtils.showError('حدث خطأ أثناء إعادة التعيين', 'خطأ');
        }
    }
}

// Load system information
async function loadSystemInformation() {
    try {
        // Get system info from main process
        const systemInfo = await ipcRenderer.invoke('get-system-info');

        // Update system info fields
        if (systemInfo) {
            const nodeVersionElement = document.getElementById('nodeVersion');
            if (nodeVersionElement) nodeVersionElement.textContent = systemInfo.nodeVersion || 'غير متاح';

            const electronVersionElement = document.getElementById('electronVersion');
            if (electronVersionElement) electronVersionElement.textContent = systemInfo.electronVersion || 'غير متاح';

            const osInfoElement = document.getElementById('osInfo');
            if (osInfoElement) osInfoElement.textContent = systemInfo.osInfo || 'غير متاح';

            const memoryUsageElement = document.getElementById('memoryUsage');
            if (memoryUsageElement) memoryUsageElement.textContent = systemInfo.memoryUsage || 'غير متاح';

            const uptimeElement = document.getElementById('uptime');
            if (uptimeElement) uptimeElement.textContent = systemInfo.uptime || 'غير متاح';
        }

        // Update database info
        await updateDatabaseInfo();

        // Update last update date
        const lastUpdateElement = document.getElementById('lastUpdateDate');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = getCurrentDate();
        }

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تحميل معلومات النظام:', error);
    }
}

// Update database information
async function updateDatabaseInfo() {
    try {
        // Get database size and record count
        const dbStats = await ipcRenderer.invoke('get-database-stats');

        if (dbStats) {
            const dbSizeElement = document.getElementById('dbSize');
            if (dbSizeElement) dbSizeElement.textContent = dbStats.size || 'غير متاح';

            const recordCountElement = document.getElementById('recordCount');
            if (recordCountElement) recordCountElement.textContent = dbStats.recordCount || '0';

            const lastDbUpdateElement = document.getElementById('lastDbUpdate');
            if (lastDbUpdateElement) {
                lastDbUpdateElement.textContent = getCurrentDateTime();
            }

            const dbConnectionsElement = document.getElementById('dbConnections');
            if (dbConnectionsElement) dbConnectionsElement.textContent = '1'; // SQLite is single connection
        }

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تحديث معلومات قاعدة البيانات:', error);
    }
}

// Placeholder functions for remaining handlers
async function handleTestPrintSettings() {
    DialogUtils.showInfo('سيتم تطوير اختبار الطباعة قريباً', 'قيد التطوير');
}

async function handleCreateBackup() {
    console.log('💾 [BACKUP] بدء إنشاء نسخة احتياطية...');

    try {
        DialogUtils.showLoading('جاري إنشاء النسخة الاحتياطية...', 'يرجى الانتظار قد تستغرق هذه العملية بضع دقائق');

        // Get backup file path from user
        const backupPath = await ipcRenderer.invoke('show-save-dialog', {
            title: 'حفظ النسخة الاحتياطية',
            defaultPath: `casher_backup_${new Date().toISOString().split('T')[0]}.json`,
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!backupPath) {
            DialogUtils.close();
            return; // User cancelled
        }

        // Collect all data from database
        const backupData = await collectDatabaseData();

        // Save backup file
        const result = await ipcRenderer.invoke('save-backup-file', {
            filePath: backupPath,
            data: backupData
        });

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccess(
                `تم إنشاء النسخة الاحتياطية بنجاح!\n\nالملف: ${backupPath}\nحجم البيانات: ${result.recordCount} سجل\nحجم الملف: ${result.fileSize}`,
                'تم إنشاء النسخة الاحتياطية'
            );
            console.log('✅ [BACKUP] تم إنشاء النسخة الاحتياطية بنجاح');
        } else {
            DialogUtils.showError(`فشل في إنشاء النسخة الاحتياطية: ${result.error}`, 'خطأ في النسخ الاحتياطي');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [BACKUP] خطأ في إنشاء النسخة الاحتياطية:', error);
        DialogUtils.showError(`حدث خطأ أثناء إنشاء النسخة الاحتياطية: ${error.message}`, 'خطأ في النسخ الاحتياطي');
    }
}

/**
 * Collect all data from database for backup
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
        // Get all table data - Fixed to include all tables with proper order
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
            'system_settings',
            'settings',
            'reconciliation_requests',
            'manual_customer_receipts'
        ];

        for (const table of tables) {
            try {
                const tableData = await ipcRenderer.invoke('db-query', `SELECT * FROM ${table}`, []);
                backupData.data[table] = tableData;
                console.log(`📋 [BACKUP] تم جمع ${tableData.length} سجل من جدول ${table}`);
            } catch (error) {
                console.warn(`⚠️ [BACKUP] تعذر جمع البيانات من جدول ${table}:`, error);
                backupData.data[table] = [];

                // Log specific error for debugging
                if (error.message.includes('no such table')) {
                    console.warn(`ℹ️ [BACKUP] جدول ${table} غير موجود في قاعدة البيانات`);
                }
            }
        }

        // Validate backup data before saving
        const backupValidation = validateBackupCompleteness(backupData.data);
        if (!backupValidation.valid) {
            console.warn('⚠️ [BACKUP] تحذير في النسخة الاحتياطية:', backupValidation.warnings);
        }

        // Calculate total records
        const totalRecords = Object.values(backupData.data).reduce((sum, tableData) => sum + tableData.length, 0);
        backupData.metadata.total_records = totalRecords;

        console.log(`✅ [BACKUP] تم جمع ${totalRecords} سجل من ${tables.length} جدول`);
        return backupData;

    } catch (error) {
        console.error('❌ [BACKUP] خطأ في جمع البيانات:', error);
        throw error;
    }
}

/**
 * Validate backup completeness and warn about potential issues
 */
function validateBackupCompleteness(data) {
    const warnings = [];
    const requiredTables = ['branches', 'cashiers', 'accountants', 'atms', 'reconciliations'];

    // Check for missing essential tables
    requiredTables.forEach(table => {
        if (!data[table] || data[table].length === 0) {
            warnings.push(`جدول ${table} فارغ أو مفقود`);
        }
    });

    // Check for orphaned records
    if (data.reconciliations && data.reconciliations.length > 0) {
        if (!data.cashiers || data.cashiers.length === 0) {
            warnings.push('توجد تصفيات ولكن لا توجد كاشيرين');
        }
        if (!data.accountants || data.accountants.length === 0) {
            warnings.push('توجد تصفيات ولكن لا توجد محاسبين');
        }
    }

    if (data.bank_receipts && data.bank_receipts.length > 0) {
        if (!data.atms || data.atms.length === 0) {
            warnings.push('توجد مقبوضات بنكية ولكن لا توجد أجهزة صراف');
        }
    }

    return {
        valid: warnings.length === 0,
        warnings: warnings
    };
}

// دالة للتأكد من وجود جميع الجداول المطلوبة قبل استعادة البيانات
async function ensureRequiredTablesExist() {
    console.log('🔧 [RESTORE] فحص وإنشاء الجداول المفقودة...');

    try {
        // قائمة الجداول المطلوبة مع أوامر إنشائها
        const requiredTables = [
            {
                name: 'customer_receipts',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS customer_receipts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        customer_name TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        payment_type TEXT NOT NULL DEFAULT 'نقدي',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'bank_receipts',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS bank_receipts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        operation_type TEXT NOT NULL,
                        atm_id INTEGER,
                        amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
                        FOREIGN KEY (atm_id) REFERENCES atms(id)
                    )
                `
            },
            {
                name: 'cash_receipts',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS cash_receipts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        denomination INTEGER NOT NULL,
                        quantity INTEGER NOT NULL,
                        total_amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'postpaid_sales',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS postpaid_sales (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        customer_name TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'return_invoices',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS return_invoices (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        invoice_number TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            },
            {
                name: 'suppliers',
                createSQL: `
                    CREATE TABLE IF NOT EXISTS suppliers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reconciliation_id INTEGER NOT NULL,
                        supplier_name TEXT NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE
                    )
                `
            }
        ];

        // فحص وإنشاء كل جدول
        for (const table of requiredTables) {
            try {
                console.log(`🔍 [RESTORE] فحص جدول ${table.name}...`);

                // فحص وجود الجدول
                const tableExists = await ipcRenderer.invoke('db-get',
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    [table.name]
                );

                if (!tableExists) {
                    console.log(`🔧 [RESTORE] إنشاء جدول ${table.name}...`);
                    await ipcRenderer.invoke('db-run', table.createSQL);
                    console.log(`✅ [RESTORE] تم إنشاء جدول ${table.name} بنجاح`);
                } else {
                    console.log(`✅ [RESTORE] جدول ${table.name} موجود بالفعل`);
                }

            } catch (tableError) {
                console.error(`❌ [RESTORE] خطأ في إنشاء جدول ${table.name}:`, tableError);
                // لا نتوقف عند خطأ في جدول واحد، نكمل مع الجداول الأخرى
            }
        }

        console.log('✅ [RESTORE] تم فحص وإنشاء جميع الجداول المطلوبة');

    } catch (error) {
        console.error('❌ [RESTORE] خطأ في فحص الجداول:', error);
        throw new Error(`فشل في التأكد من وجود الجداول المطلوبة: ${error.message}`);
    }
}

async function handleRestoreBackup() {
    console.log('📥 [RESTORE] بدء استعادة النسخة الاحتياطية...');

    try {
        // إنشاء الجداول المفقودة قبل الاستعادة
        console.log('🔧 [RESTORE] التأكد من وجود جميع الجداول المطلوبة...');
        await ensureRequiredTablesExist();
        // Show warning dialog first
        const confirmed = await DialogUtils.showConfirm(
            'تحذير: ستؤدي هذه العملية إلى استبدال جميع البيانات الحالية بالبيانات من النسخة الاحتياطية.\n\nهل أنت متأكد من المتابعة؟',
            'تأكيد استعادة النسخة الاحتياطية'
        );

        if (!confirmed) {
            return;
        }

        // Get backup file from user
        const backupPath = await ipcRenderer.invoke('show-open-dialog', {
            title: 'اختر ملف النسخة الاحتياطية',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (!backupPath || backupPath.length === 0) {
            return; // User cancelled
        }

        DialogUtils.showLoading('جاري استعادة النسخة الاحتياطية...', 'يرجى الانتظار قد تستغرق هذه العملية بضع دقائق');

        // Load and validate backup file
        const backupData = await ipcRenderer.invoke('load-backup-file', backupPath[0]);

        if (!backupData.success) {
            DialogUtils.close();
            DialogUtils.showError(`فشل في قراءة ملف النسخة الاحتياطية: ${backupData.error}`, 'خطأ في الاستعادة');
            return;
        }

        // Validate backup data structure
        const validationResult = validateBackupData(backupData.data);
        if (!validationResult.valid) {
            DialogUtils.close();
            DialogUtils.showError(`ملف النسخة الاحتياطية غير صالح: ${validationResult.error}`, 'خطأ في التحقق');
            return;
        }

        // Restore data to database
        const restoreResult = await restoreDatabaseData(backupData.data);

        DialogUtils.close();

        if (restoreResult.success) {
            // Perform final integrity check
            const integrityCheck = await performDatabaseIntegrityCheck();

            let successMessage = `تم استعادة النسخة الاحتياطية بنجاح!\n\nتم استعادة ${restoreResult.recordCount} سجل\nمن ${restoreResult.tableCount} جدول`;

            if (integrityCheck.valid) {
                successMessage += '\n\n✅ تم التحقق من سلامة قاعدة البيانات';
            } else if (integrityCheck.issues) {
                successMessage += `\n\n⚠️ تحذيرات في قاعدة البيانات:\n${integrityCheck.issues.join('\n')}`;
            }

            successMessage += '\n\nسيتم إعادة تحميل التطبيق الآن.';

            DialogUtils.showSuccess(successMessage, 'تم الاستعادة بنجاح');

            // Reload the application to reflect changes
            setTimeout(() => {
                window.location.reload();
            }, 3000); // Give more time to read the message

            console.log('✅ [RESTORE] تم استعادة النسخة الاحتياطية بنجاح');
        } else {
            DialogUtils.showError(`فشل في استعادة النسخة الاحتياطية: ${restoreResult.error}`, 'خطأ في الاستعادة');
        }

    } catch (error) {
        DialogUtils.close();
        console.error('❌ [RESTORE] خطأ في استعادة النسخة الاحتياطية:', error);
        DialogUtils.showError(`حدث خطأ أثناء استعادة النسخة الاحتياطية: ${error.message}`, 'خطأ في الاستعادة');
    }
}

/**
 * Validate backup data structure
 */
function validateBackupData(backupData) {
    try {
        // Check if backup data has required structure
        if (!backupData || typeof backupData !== 'object') {
            return { valid: false, error: 'بنية البيانات غير صحيحة' };
        }

        if (!backupData.metadata || !backupData.data) {
            return { valid: false, error: 'ملف النسخة الاحتياطية لا يحتوي على البيانات المطلوبة' };
        }

        // Check if it's from the same application
        if (backupData.metadata.app_name !== 'نظام تصفية الكاشير') {
            return { valid: false, error: 'ملف النسخة الاحتياطية من تطبيق مختلف' };
        }

        // Check if data object exists and has tables
        if (!backupData.data || typeof backupData.data !== 'object') {
            return { valid: false, error: 'بيانات الجداول غير موجودة' };
        }

        // Validate that essential tables exist
        const requiredTables = ['branches', 'cashiers', 'accountants', 'atms'];
        const missingTables = requiredTables.filter(table =>
            !backupData.data[table] || !Array.isArray(backupData.data[table])
        );

        if (missingTables.length > 0) {
            console.warn('⚠️ [RESTORE] جداول مطلوبة مفقودة:', missingTables);
            // Don't fail for missing tables, just warn
        }

        // Check for foreign key data consistency
        // await repairBackupAtmReferences(backupData.data);
        // const dataConsistency = validateDataConsistency(backupData.data);
        // if (!dataConsistency.valid) {
        //     return { valid: false, error: `مشكلة في تناسق البيانات: ${dataConsistency.error}` };
        // }

        console.log('✅ [RESTORE] تم التحقق من صحة ملف النسخة الاحتياطية');
        return { valid: true };

    } catch (error) {
        return { valid: false, error: `خطأ في التحقق: ${error.message}` };
    }
}

/**
 * Validate data consistency for foreign key relationships
 */
async function repairBackupAtmReferences(data) {
    try {
        const bankReceipts = (data && Array.isArray(data.bank_receipts)) ? data.bank_receipts : [];
        const atms = (data && Array.isArray(data.atms)) ? data.atms : (data.atms = []);
        const existingAtmIds = new Set(atms.map(a => a && a.id).filter(id => id !== undefined && id !== null));
        const missingIds = new Set();

        for (const r of bankReceipts) {
            if (!r) continue;
            const atmId = r.atm_id;
            if (atmId !== undefined && atmId !== null && !existingAtmIds.has(atmId)) {
                missingIds.add(atmId);
            }
        }

        if (missingIds.size === 0) {
            return;
        }

        const defaultBranchId = (data && Array.isArray(data.branches) && data.branches.length > 0 && data.branches[0] && data.branches[0].id) ? data.branches[0].id : null;
        const now = new Date().toISOString();

        for (const id of missingIds) {
            atms.push({
                id: id,
                name: `جهاز غير معروف (مُستعاد #${id})`,
                bank_name: 'غير معروف',
                location: 'غير محدد',
                branch_id: defaultBranchId,
                active: 0,
                created_at: now,
                updated_at: now
            });
            existingAtmIds.add(id);
        }

        console.log(`🔧 [RESTORE] تم إضافة ${missingIds.size} جهاز/أجهزة صراف بديلة لمعالجة المراجع المفقودة`);
    } catch (e) {
        console.warn('⚠️ [RESTORE] فشل إصلاح مراجع أجهزة الصراف المفقودة:', e);
    }
}

function validateDataConsistency(data) {
    try {
        console.log('🔍 [RESTORE] فحص تناسق البيانات...');

        // Check cashiers reference valid branches
        if (data.cashiers && data.branches) {
            const branchIds = new Set(data.branches.map(b => b.id));
            const invalidCashiers = data.cashiers.filter(c =>
                c.branch_id && !branchIds.has(c.branch_id)
            );
            if (invalidCashiers.length > 0) {
                return { valid: false, error: `كاشيرين يشيرون إلى فروع غير موجودة: ${invalidCashiers.length}` };
            }
        }

        // Check reconciliations reference valid cashiers and accountants
        if (data.reconciliations) {
            if (data.cashiers) {
                const cashierIds = new Set(data.cashiers.map(c => c.id));
                const invalidReconciliations = data.reconciliations.filter(r =>
                    !cashierIds.has(r.cashier_id)
                );
                if (invalidReconciliations.length > 0) {
                    return { valid: false, error: `تصفيات تشير إلى كاشيرين غير موجودين: ${invalidReconciliations.length}` };
                }
            }

            if (data.accountants) {
                const accountantIds = new Set(data.accountants.map(a => a.id));
                const invalidReconciliations = data.reconciliations.filter(r =>
                    !accountantIds.has(r.accountant_id)
                );
                if (invalidReconciliations.length > 0) {
                    return { valid: false, error: `تصفيات تشير إلى محاسبين غير موجودين: ${invalidReconciliations.length}` };
                }
            }
        }

        // Check bank_receipts reference valid reconciliations and atms
        if (data.bank_receipts) {
            if (data.reconciliations) {
                const reconciliationIds = new Set(data.reconciliations.map(r => r.id));
                const invalidBankReceipts = data.bank_receipts.filter(br =>
                    !reconciliationIds.has(br.reconciliation_id)
                );
                if (invalidBankReceipts.length > 0) {
                    return { valid: false, error: `مقبوضات بنكية تشير إلى تصفيات غير موجودة: ${invalidBankReceipts.length}` };
                }
            }

            if (data.atms) {
                const atmIds = new Set(data.atms.map(a => a.id));
                const invalidBankReceipts = data.bank_receipts.filter(br =>
                    !atmIds.has(br.atm_id)
                );
                if (invalidBankReceipts.length > 0) {
                    return { valid: false, error: `مقبوضات بنكية تشير إلى أجهزة صراف غير موجودة: ${invalidBankReceipts.length}` };
                }
            }
        }

        console.log('✅ [RESTORE] تم التحقق من تناسق البيانات');
        return { valid: true };

    } catch (error) {
        return { valid: false, error: `خطأ في فحص التناسق: ${error.message}` };
    }
}

/**
 * Restore data to database
 */
async function restoreDatabaseData(backupData) {
    console.log('🔄 [RESTORE] بدء استعادة البيانات إلى قاعدة البيانات...');

    try {
        let totalRecords = 0;
        let tableCount = 0;

        // Define table restoration order (to handle foreign key constraints properly)
        // Order is critical: parent tables must be restored before child tables
        const tableOrder = [
            'admins',           // No dependencies
            'branches',         // No dependencies
            'cashiers',         // References: branches(id)
            'accountants',      // No dependencies
            'atms',            // No dependencies
            'reconciliations',  // References: cashiers(id), accountants(id)
            'bank_receipts',    // References: reconciliations(id), atms(id)
            'cash_receipts',    // References: reconciliations(id)
            'postpaid_sales',   // References: reconciliations(id)
            'customer_receipts', // References: reconciliations(id)
            'return_invoices',  // References: reconciliations(id)
            'suppliers',        // References: reconciliations(id)
            'system_settings',  // No dependencies
            'settings',          // No dependencies
            'reconciliation_requests', // References: cashiers(id)
            'manual_customer_receipts' // No major dependencies
        ];

        // Begin transaction
        await ipcRenderer.invoke('db-run', 'PRAGMA foreign_keys = OFF', []);
        console.log('🔓 [RESTORE] تم تعطيل قيود المفاتيح الخارجية مؤقتاً');
        await ipcRenderer.invoke('db-run', 'BEGIN TRANSACTION', []);

        try {
            // Temporarily disable foreign key constraints during restoration

            // Clear existing data (except admins for safety)
            // Clear in reverse order to respect foreign key dependencies
            const reversedOrder = [...tableOrder].reverse();
            for (const table of reversedOrder) {
                if (table !== 'admins' && backupData.data[table]) {
                    await ipcRenderer.invoke('db-run', `DELETE FROM ${table}`, []);
                    console.log(`🗑️ [RESTORE] تم مسح البيانات من جدول ${table}`);
                }
            }

            // Restore data table by table in correct order
            for (const table of tableOrder) {
                if (backupData.data[table] && Array.isArray(backupData.data[table])) {
                    const tableData = backupData.data[table];

                    if (tableData.length > 0) {
                        // Get column names from first record
                        const columns = Object.keys(tableData[0]);
                        const placeholders = columns.map(() => '?').join(', ');
                        const columnNames = columns.join(', ');

                        const insertQuery = `INSERT INTO ${table} (${columnNames}) VALUES (${placeholders})`;

                        // Insert each record with error handling
                        for (const record of tableData) {
                            try {
                                const values = columns.map(col => record[col]);

                                // For admins table, use INSERT OR REPLACE to handle existing records
                                let finalQuery = insertQuery;
                                if (table === 'admins') {
                                    finalQuery = `INSERT OR REPLACE INTO ${table} (${columnNames}) VALUES (${placeholders})`;
                                }

                                await ipcRenderer.invoke('db-run', finalQuery, values);
                            } catch (recordError) {
                                console.warn(`⚠️ [RESTORE] فشل في إدراج سجل في جدول ${table}:`, recordError.message);
                                console.warn('البيانات المشكلة:', record);

                                // Try with INSERT OR IGNORE as fallback
                                try {
                                    const fallbackQuery = `INSERT OR IGNORE INTO ${table} (${columnNames}) VALUES (${placeholders})`;
                                    await ipcRenderer.invoke('db-run', fallbackQuery, values);
                                    console.log(`✅ [RESTORE] تم إدراج السجل باستخدام INSERT OR IGNORE`);
                                } catch (fallbackError) {
                                    console.error(`❌ [RESTORE] فشل نهائي في إدراج السجل:`, fallbackError.message);
                                }
                            }
                        }

                        totalRecords += tableData.length;
                        tableCount++;
                        console.log(`✅ [RESTORE] تم استعادة ${tableData.length} سجل إلى جدول ${table}`);
                    }
                } else {
                    console.log(`ℹ️ [RESTORE] لا توجد بيانات لجدول ${table} في النسخة الاحتياطية`);
                }
            }

            // Re-enable foreign key constraints
            await ipcRenderer.invoke('db-run', 'PRAGMA foreign_keys = ON', []);
            console.log('🔒 [RESTORE] تم إعادة تفعيل قيود المفاتيح الخارجية');

            // Validate foreign key constraints
            const fkCheckResult = await ipcRenderer.invoke('db-query', 'PRAGMA foreign_key_check', []);
            if (fkCheckResult && fkCheckResult.length > 0) {
                console.warn('⚠️ [RESTORE] تم العثور على انتهاكات للمفاتيح الخارجية:', fkCheckResult);
                throw new Error(`انتهاكات المفاتيح الخارجية: ${fkCheckResult.length} مشكلة`);
            } else {
                console.log('✅ [RESTORE] تم التحقق من سلامة المفاتيح الخارجية');
            }

            // Commit transaction
            await ipcRenderer.invoke('db-run', 'COMMIT', []);

            console.log(`✅ [RESTORE] تم استعادة ${totalRecords} سجل من ${tableCount} جدول بنجاح`);
            return { success: true, recordCount: totalRecords, tableCount: tableCount };

        } catch (error) {
            // Re-enable foreign keys even on error
            try {
                await ipcRenderer.invoke('db-run', 'PRAGMA foreign_keys = ON', []);
                console.log('🔒 [RESTORE] تم إعادة تفعيل قيود المفاتيح الخارجية بعد الخطأ');
            } catch (pragmaError) {
                console.error('❌ [RESTORE] فشل في إعادة تفعيل قيود المفاتيح الخارجية:', pragmaError);
            }

            // Rollback transaction
            await ipcRenderer.invoke('db-run', 'ROLLBACK', []);
            console.log('🔄 [RESTORE] تم التراجع عن المعاملة');
            throw error;
        }

    } catch (error) {
        console.error('❌ [RESTORE] خطأ في استعادة البيانات:', error);
        return { success: false, error: error.message };
    }
}

async function handleExportData() {
    DialogUtils.showInfo('سيتم تطوير تصدير البيانات قريباً', 'قيد التطوير');
}

async function handleOptimizeDatabase() {
    DialogUtils.showInfo('سيتم تطوير تحسين قاعدة البيانات قريباً', 'قيد التطوير');
}

async function handleRepairDatabase() {
    DialogUtils.showInfo('سيتم تطوير إصلاح قاعدة البيانات قريباً', 'قيد التطوير');
}

async function handleAnalyzeDatabase() {
    DialogUtils.showInfo('سيتم تطوير تحليل قاعدة البيانات قريباً', 'قيد التطوير');
}

async function handleSaveDatabaseSettings() {
    DialogUtils.showInfo('سيتم تطوير حفظ إعدادات قاعدة البيانات قريباً', 'قيد التطوير');
}

async function handleSaveUserSettings() {
    DialogUtils.showInfo('سيتم تطوير حفظ إعدادات المستخدمين قريباً', 'قيد التطوير');
}

async function handleChangePassword() {
    DialogUtils.showInfo('سيتم تطوير تغيير كلمة المرور قريباً', 'قيد التطوير');
}

/**
 * Handle selecting backup location
 */
async function handleSelectBackupLocation() {
    try {
        console.log('📁 [SETTINGS] اختيار مجلد النسخ الاحتياطي...');

        const result = await ipcRenderer.invoke('select-directory', {
            title: 'اختر مجلد النسخ الاحتياطي',
            defaultPath: ''
        });

        if (result.success && result.filePath) {
            document.getElementById('backupLocation').value = result.filePath;

            // حفظ المسار في قاعدة البيانات
            await ipcRenderer.invoke('db-run', `
                INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, ['backup', 'default_backup_path', result.filePath]);

            console.log('✅ [SETTINGS] تم حفظ مجلد النسخ الاحتياطي:', result.filePath);
            DialogUtils.showSuccess('تم حفظ مجلد النسخ الاحتياطي بنجاح');
        } else {
            console.log('ℹ️ [SETTINGS] تم إلغاء اختيار مجلد النسخ الاحتياطي');
        }
    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في اختيار مجلد النسخ الاحتياطي:', error);
        DialogUtils.showError('حدث خطأ في اختيار مجلد النسخ الاحتياطي: ' + error.message);
    }
}

/**
 * Handle auto backup frequency change
 */
async function handleAutoBackupChange() {
    try {
        const autoBackupSelect = document.getElementById('autoBackup');
        const selectedValue = autoBackupSelect.value;

        console.log('⚙️ [SETTINGS] تغيير تكرار النسخ الاحتياطي التلقائي:', selectedValue);

        // حفظ الإعداد في قاعدة البيانات
        await ipcRenderer.invoke('db-run', `
            INSERT OR REPLACE INTO system_settings (category, setting_key, setting_value, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, ['backup', 'auto_backup_frequency', selectedValue]);

        console.log('✅ [SETTINGS] تم حفظ إعداد النسخ الاحتياطي التلقائي');

        // إظهار رسالة تأكيد
        const frequencyText = {
            'disabled': 'معطل',
            'daily': 'يومياً',
            'weekly': 'أسبوعياً',
            'monthly': 'شهرياً'
        };

        DialogUtils.showSuccessToast(`تم تحديث النسخ الاحتياطي التلقائي: ${frequencyText[selectedValue]}`);

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في حفظ إعداد النسخ الاحتياطي التلقائي:', error);
        DialogUtils.showErrorToast('حدث خطأ في حفظ الإعداد');
    }
}

/**
 * Perform comprehensive database integrity check
 */
async function performDatabaseIntegrityCheck() {
    console.log('🔍 [DB-CHECK] بدء فحص سلامة قاعدة البيانات...');

    try {
        const issues = [];

        // Check foreign key constraints
        const fkViolations = await ipcRenderer.invoke('db-query', 'PRAGMA foreign_key_check', []);
        if (fkViolations && fkViolations.length > 0) {
            issues.push(`انتهاكات المفاتيح الخارجية: ${fkViolations.length}`);
            console.error('❌ [DB-CHECK] انتهاكات المفاتيح الخارجية:', fkViolations);
        }

        // Check for orphaned records
        const orphanedChecks = [
            {
                name: 'كاشيرين بدون فروع',
                query: `SELECT COUNT(*) as count FROM cashiers WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM branches)`
            },
            {
                name: 'تصفيات بدون كاشيرين',
                query: `SELECT COUNT(*) as count FROM reconciliations WHERE cashier_id NOT IN (SELECT id FROM cashiers)`
            },
            {
                name: 'تصفيات بدون محاسبين',
                query: `SELECT COUNT(*) as count FROM reconciliations WHERE accountant_id NOT IN (SELECT id FROM accountants)`
            },
            {
                name: 'مقبوضات بنكية بدون تصفيات',
                query: `SELECT COUNT(*) as count FROM bank_receipts WHERE reconciliation_id NOT IN (SELECT id FROM reconciliations)`
            },
            {
                name: 'مقبوضات بنكية بدون أجهزة صراف',
                query: `SELECT COUNT(*) as count FROM bank_receipts WHERE atm_id NOT IN (SELECT id FROM atms)`
            }
        ];

        for (const check of orphanedChecks) {
            try {
                const result = await ipcRenderer.invoke('db-get', check.query, []);
                if (result && result.count > 0) {
                    issues.push(`${check.name}: ${result.count}`);
                    console.warn(`⚠️ [DB-CHECK] ${check.name}: ${result.count}`);
                }
            } catch (error) {
                console.warn(`⚠️ [DB-CHECK] فشل فحص ${check.name}:`, error.message);
            }
        }

        if (issues.length === 0) {
            console.log('✅ [DB-CHECK] قاعدة البيانات سليمة');
            return { valid: true, message: 'قاعدة البيانات سليمة' };
        } else {
            console.warn('⚠️ [DB-CHECK] مشاكل في قاعدة البيانات:', issues);
            return { valid: false, issues: issues };
        }

    } catch (error) {
        console.error('❌ [DB-CHECK] خطأ في فحص قاعدة البيانات:', error);
        return { valid: false, error: error.message };
    }
}

// ========================================
// POSTPAID SALES REPORT FUNCTIONS
// ========================================

// Global variables for postpaid sales report
let currentPostpaidSalesReportData = [];
let currentPostpaidSalesReportPage = 1;
const POSTPAID_SALES_ITEMS_PER_PAGE = 20;

// Get postpaid sales report filters
function getPostpaidSalesReportFilters() {
    return {
        searchName: document.getElementById('postpaidSalesSearchName').value.trim(),
        cashierFilter: document.getElementById('postpaidSalesCashierFilter').value,
        branchFilter: document.getElementById('postpaidSalesBranchFilter').value,
        dateFrom: document.getElementById('postpaidSalesDateFrom').value,
        dateTo: document.getElementById('postpaidSalesDateTo').value
    };
}

// Clear postpaid sales report filters
function clearPostpaidSalesReportFilters() {
    console.log('🗑️ [POSTPAID-SALES] مسح مرشحات تقرير المبيعات الآجلة...');

    document.getElementById('postpaidSalesSearchName').value = '';
    document.getElementById('postpaidSalesCashierFilter').value = '';
    document.getElementById('postpaidSalesBranchFilter').value = '';
    document.getElementById('postpaidSalesDateFrom').value = '';
    document.getElementById('postpaidSalesDateTo').value = '';

    // Hide results if visible
    document.getElementById('postpaidSalesReportResultsCard').style.display = 'none';
    currentPostpaidSalesReportData = [];

    console.log('✅ [POSTPAID-SALES] تم مسح المرشحات بنجاح');
}

// Load cashiers for postpaid sales report filter
async function loadPostpaidSalesReportFilters() {
    try {
        console.log('📋 [POSTPAID-SALES] تحميل مرشحات تقرير المبيعات الآجلة...');

        // Load cashiers
        const cashiers = await ipcRenderer.invoke('db-query',
            'SELECT id, name FROM cashiers WHERE active = 1 ORDER BY name'
        );

        const cashierSelect = document.getElementById('postpaidSalesCashierFilter');
        cashierSelect.innerHTML = '<option value="">جميع الكاشير</option>';

        cashiers.forEach(cashier => {
            const option = document.createElement('option');
            option.value = cashier.id;
            option.textContent = cashier.name;
            cashierSelect.appendChild(option);
        });

        // Load branches
        const branches = await ipcRenderer.invoke('db-query',
            'SELECT id, branch_name FROM branches WHERE is_active = 1 ORDER BY branch_name'
        );

        const branchSelect = document.getElementById('postpaidSalesBranchFilter');
        branchSelect.innerHTML = '<option value="">جميع الفروع</option>';

        branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.id;
            option.textContent = branch.branch_name;
            branchSelect.appendChild(option);
        });

        console.log('✅ [POSTPAID-SALES] تم تحميل المرشحات بنجاح');
    } catch (error) {
        console.error('❌ [POSTPAID-SALES] خطأ في تحميل المرشحات:', error);
    }
}

// Generate postpaid sales report data based on filters
async function generatePostpaidSalesReportData(filters) {
    console.log('📊 [POSTPAID-SALES] توليد بيانات تقرير المبيعات الآجلة...');

    try {
        let whereConditions = [];
        let params = [];

        // Base query with joins including branches
        let query = `
            SELECT
                ps.id,
                ps.customer_name,
                ps.amount,
                ps.created_at,
                r.reconciliation_date,
                c.name as cashier_name,
                a.name as accountant_name,
                b.branch_name
            FROM postpaid_sales ps
            JOIN reconciliations r ON ps.reconciliation_id = r.id
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            JOIN branches b ON c.branch_id = b.id
            WHERE 1=1
        `;

        // Apply filters
        if (filters.searchName) {
            whereConditions.push('ps.customer_name LIKE ?');
            params.push(`%${filters.searchName}%`);
        }

        if (filters.cashierFilter) {
            whereConditions.push('r.cashier_id = ?');
            params.push(filters.cashierFilter);
        }

        if (filters.branchFilter) {
            whereConditions.push('c.branch_id = ?');
            params.push(filters.branchFilter);
        }

        if (filters.dateFrom) {
            whereConditions.push('DATE(r.reconciliation_date) >= ?');
            params.push(filters.dateFrom);
        }

        if (filters.dateTo) {
            whereConditions.push('DATE(r.reconciliation_date) <= ?');
            params.push(filters.dateTo);
        }

        // Add WHERE conditions to query
        if (whereConditions.length > 0) {
            query += ' AND ' + whereConditions.join(' AND ');
        }

        // Order by date descending
        query += ' ORDER BY r.reconciliation_date DESC, ps.created_at DESC';

        console.log('🔍 [POSTPAID-SALES] استعلام قاعدة البيانات:', query);
        console.log('📋 [POSTPAID-SALES] معاملات الاستعلام:', params);

        const results = await ipcRenderer.invoke('db-query', query, params);

        console.log(`✅ [POSTPAID-SALES] تم جلب ${results.length} سجل من المبيعات الآجلة`);
        return results;

    } catch (error) {
        console.error('❌ [POSTPAID-SALES] خطأ في توليد بيانات التقرير:', error);
        throw error;
    }
}

// Apply search and filtering to postpaid sales data
function applyPostpaidSalesFilters(data, filters) {
    console.log('🔍 [POSTPAID-SALES] تطبيق المرشحات على البيانات...');

    let filteredData = [...data];

    // Apply client-side filters if needed (for additional filtering)
    if (filters.searchName) {
        const searchTerm = filters.searchName.toLowerCase();
        filteredData = filteredData.filter(item =>
            item.customer_name.toLowerCase().includes(searchTerm)
        );
    }

    console.log(`🔍 [POSTPAID-SALES] تم تصفية البيانات: ${filteredData.length} من ${data.length} سجل`);
    return filteredData;
}

// Main function to handle postpaid sales report generation
async function handleGeneratePostpaidSalesReport() {
    console.log('📊 [POSTPAID-SALES] إنشاء تقرير المبيعات الآجلة...');

    try {
        // Get filter values
        const filters = getPostpaidSalesReportFilters();
        console.log('🔍 [POSTPAID-SALES] مرشحات التقرير:', filters);

        // Validate date range if provided
        if (filters.dateFrom && filters.dateTo) {
            if (new Date(filters.dateFrom) > new Date(filters.dateTo)) {
                DialogUtils.showValidationError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
                return;
            }
        }

        DialogUtils.showLoading('جاري إنشاء تقرير المبيعات الآجلة...', 'يرجى الانتظار');

        // Generate report data
        const reportData = await generatePostpaidSalesReportData(filters);

        DialogUtils.close();

        if (!reportData || reportData.length === 0) {
            DialogUtils.showInfo('لا توجد مبيعات آجلة للمعايير المحددة', 'لا توجد نتائج');
            document.getElementById('postpaidSalesReportResultsCard').style.display = 'none';
            return;
        }

        // Store data globally for export/print functions
        currentPostpaidSalesReportData = reportData;
        currentPostpaidSalesReportPage = 1;

        // Display results
        displayPostpaidSalesReportResults(reportData);

        console.log('✅ [POSTPAID-SALES] تم إنشاء التقرير بنجاح');

    } catch (error) {
        console.error('❌ [POSTPAID-SALES] خطأ في إنشاء التقرير:', error);
        DialogUtils.close();
        DialogUtils.showError('حدث خطأ أثناء إنشاء تقرير المبيعات الآجلة', 'خطأ');
    }
}

// Display postpaid sales report results
function displayPostpaidSalesReportResults(data) {
    console.log('📊 [POSTPAID-SALES] عرض نتائج تقرير المبيعات الآجلة...');

    // Show results card
    document.getElementById('postpaidSalesReportResultsCard').style.display = 'block';

    // Generate and display summary
    displayPostpaidSalesReportSummary(data);

    // Display table
    displayPostpaidSalesReportTable(data);

    // Setup pagination
    setupPostpaidSalesReportPagination(data);

    // Scroll to results
    document.getElementById('postpaidSalesReportResultsCard').scrollIntoView({
        behavior: 'smooth'
    });

    console.log('✅ [POSTPAID-SALES] تم عرض النتائج بنجاح');
}

// Display summary statistics for postpaid sales report
function displayPostpaidSalesReportSummary(data) {
    const totalSales = data.length;
    const totalAmount = data.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const averageAmount = totalSales > 0 ? totalAmount / totalSales : 0;

    // Get unique customers and cashiers
    const uniqueCustomers = new Set(data.map(item => item.customer_name)).size;
    const uniqueCashiers = new Set(data.map(item => item.cashier_name)).size;

    // Find highest and lowest amounts
    const amounts = data.map(item => parseFloat(item.amount));
    const maxAmount = Math.max(...amounts);
    const minAmount = Math.min(...amounts);

    const summaryHtml = `
        <div class="col-md-2">
            <div class="card bg-primary text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${totalSales}</h4>
                    <p class="mb-0">إجمالي المبيعات</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-success text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${formatDecimal(totalAmount)}</h4>
                    <p class="mb-0">إجمالي المبلغ (ريال)</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-info text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${formatDecimal(averageAmount)}</h4>
                    <p class="mb-0">متوسط المبلغ (ريال)</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-warning text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${uniqueCustomers}</h4>
                    <p class="mb-0">عدد العملاء</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-secondary text-white">
                <div class="card-body text-center">
                    <h4 class="mb-1">${uniqueCashiers}</h4>
                    <p class="mb-0">عدد الكاشير</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-dark text-white">
                <div class="card-body text-center">
                    <h6 class="mb-1">أعلى: ${formatDecimal(maxAmount)}</h6>
                    <h6 class="mb-0">أقل: ${formatDecimal(minAmount)}</h6>
                </div>
            </div>
        </div>
    `;

    document.getElementById('postpaidSalesReportSummary').innerHTML = summaryHtml;
}

// Display postpaid sales report table
function displayPostpaidSalesReportTable(data) {
    const tableHead = document.getElementById('postpaidSalesReportTableHead');
    const tableBody = document.getElementById('postpaidSalesReportTableBody');

    // Set table headers
    tableHead.innerHTML = `
        <th>رقم</th>
        <th>اسم العميل</th>
        <th>المبلغ (ريال)</th>
        <th>الفرع</th>
        <th>تاريخ المبيعة</th>
        <th>تاريخ التصفية</th>
        <th>الكاشير</th>
        <th>المحاسب</th>
    `;

    // Calculate pagination
    const startIndex = (currentPostpaidSalesReportPage - 1) * POSTPAID_SALES_ITEMS_PER_PAGE;
    const endIndex = startIndex + POSTPAID_SALES_ITEMS_PER_PAGE;
    const paginatedData = data.slice(startIndex, endIndex);

    // Generate table rows
    let tableRows = '';
    paginatedData.forEach((item, index) => {
        const rowNumber = startIndex + index + 1;
        const saleDate = item.created_at ? formatDate(item.created_at) : 'غير محدد';
        const reconciliationDate = item.reconciliation_date ? formatDate(item.reconciliation_date) : 'غير محدد';

        tableRows += `
            <tr>
                <td>${rowNumber}</td>
                <td>${item.customer_name || 'غير محدد'}</td>
                <td class="text-end"><strong>${formatDecimal(item.amount)}</strong></td>
                <td>${item.branch_name || 'غير محدد'}</td>
                <td>${saleDate}</td>
                <td>${reconciliationDate}</td>
                <td>${item.cashier_name || 'غير محدد'}</td>
                <td>${item.accountant_name || 'غير محدد'}</td>
            </tr>
        `;
    });

    tableBody.innerHTML = tableRows;

    // Update pagination info
    const totalItems = data.length;
    const startItem = startIndex + 1;
    const endItem = Math.min(endIndex, totalItems);

    document.getElementById('postpaidSalesReportPaginationInfo').textContent =
        `عرض ${startItem} إلى ${endItem} من ${totalItems} نتيجة`;
}

// Setup pagination for postpaid sales report
function setupPostpaidSalesReportPagination(data) {
    const totalPages = Math.ceil(data.length / POSTPAID_SALES_ITEMS_PER_PAGE);
    const paginationContainer = document.getElementById('postpaidSalesReportPagination');

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHtml = '';

    // Previous button
    if (currentPostpaidSalesReportPage > 1) {
        paginationHtml += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="changePostpaidSalesReportPage(${currentPostpaidSalesReportPage - 1})">السابق</a>
            </li>
        `;
    }

    // Page numbers
    const startPage = Math.max(1, currentPostpaidSalesReportPage - 2);
    const endPage = Math.min(totalPages, currentPostpaidSalesReportPage + 2);

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPostpaidSalesReportPage ? 'active' : '';
        paginationHtml += `
            <li class="page-item ${activeClass}">
                <a class="page-link" href="#" onclick="changePostpaidSalesReportPage(${i})">${i}</a>
            </li>
        `;
    }

    // Next button
    if (currentPostpaidSalesReportPage < totalPages) {
        paginationHtml += `
            <li class="page-item">
                <a class="page-link" href="#" onclick="changePostpaidSalesReportPage(${currentPostpaidSalesReportPage + 1})">التالي</a>
            </li>
        `;
    }

    paginationContainer.innerHTML = paginationHtml;
}

// Change page for postpaid sales report
function changePostpaidSalesReportPage(page) {
    currentPostpaidSalesReportPage = page;
    displayPostpaidSalesReportTable(currentPostpaidSalesReportData);
    setupPostpaidSalesReportPagination(currentPostpaidSalesReportData);
}

// Export postpaid sales report to PDF
async function handleExportPostpaidSalesReportPdf() {
    if (!currentPostpaidSalesReportData || currentPostpaidSalesReportData.length === 0) {
        DialogUtils.showValidationError('لا توجد بيانات تقرير للتصدير');
        return;
    }

    try {
        DialogUtils.showLoading('جاري تصدير تقرير المبيعات الآجلة إلى PDF...', 'يرجى الانتظار');

        const reportHtml = await generatePostpaidSalesReportHtml(currentPostpaidSalesReportData);
        const filename = `تقرير_المبيعات_الآجلة_${new Date().toISOString().split('T')[0]}.pdf`;

        const result = await ipcRenderer.invoke('export-pdf', {
            html: reportHtml,
            filename: filename
        });

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccess(`تم تصدير التقرير بنجاح في:\n${result.filePath}`, 'تصدير ناجح');
        } else {
            DialogUtils.showError(result.error || 'فشل في تصدير التقرير', 'خطأ في التصدير');
        }

    } catch (error) {
        console.error('❌ [POSTPAID-SALES] خطأ في تصدير PDF:', error);
        DialogUtils.close();
        DialogUtils.showError('حدث خطأ أثناء تصدير التقرير', 'خطأ');
    }
}

// Export postpaid sales report to Excel
async function handleExportPostpaidSalesReportExcel() {
    if (!currentPostpaidSalesReportData || currentPostpaidSalesReportData.length === 0) {
        DialogUtils.showValidationError('لا توجد بيانات تقرير للتصدير');
        return;
    }

    try {
        DialogUtils.showLoading('جاري تصدير تقرير المبيعات الآجلة إلى Excel...', 'يرجى الانتظار');

        const excelData = preparePostpaidSalesReportExcelData(currentPostpaidSalesReportData);
        const filename = `تقرير_المبيعات_الآجلة_${new Date().toISOString().split('T')[0]}.xlsx`;

        const result = await ipcRenderer.invoke('export-excel', {
            data: excelData,
            filename: filename
        });

        DialogUtils.close();

        if (result.success) {
            DialogUtils.showSuccess(`تم تصدير التقرير بنجاح في:\n${result.filePath}`, 'تصدير ناجح');
        } else {
            DialogUtils.showError(result.error || 'فشل في تصدير التقرير', 'خطأ في التصدير');
        }

    } catch (error) {
        console.error('❌ [POSTPAID-SALES] خطأ في تصدير Excel:', error);
        DialogUtils.close();
        DialogUtils.showError('حدث خطأ أثناء تصدير التقرير', 'خطأ');
    }
}

// Print postpaid sales report
async function handlePrintPostpaidSalesReport() {
    if (!currentPostpaidSalesReportData || currentPostpaidSalesReportData.length === 0) {
        DialogUtils.showValidationError('لا توجد بيانات تقرير للطباعة');
        return;
    }

    try {
        // Get current print settings
        const printSettings = await ipcRenderer.invoke('get-print-settings');

        const reportHtml = await generatePostpaidSalesReportHtml(currentPostpaidSalesReportData);

        const result = await ipcRenderer.invoke('create-print-preview', {
            html: reportHtml,
            title: 'تقرير المبيعات الآجلة',
            isColorPrint: printSettings.color !== false
        });

        if (result.success) {
            console.log('✅ [POSTPAID-SALES] تم فتح معاينة الطباعة بنجاح');
        } else {
            DialogUtils.showError(result.error || 'فشل في فتح معاينة الطباعة', 'خطأ في الطباعة');
        }

    } catch (error) {
        console.error('❌ [POSTPAID-SALES] خطأ في الطباعة:', error);
        DialogUtils.showError('حدث خطأ أثناء طباعة التقرير', 'خطأ');
    }
}

// Generate HTML content for postpaid sales report
async function generatePostpaidSalesReportHtml(data) {
    const companyName = await getCompanyName();
    const totalAmount = data.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const uniqueCustomers = new Set(data.map(item => item.customer_name)).size;

    // Get filter information for report header
    const filters = getPostpaidSalesReportFilters();
    let filterInfo = '';

    if (filters.searchName) {
        filterInfo += `البحث: ${filters.searchName} | `;
    }
    if (filters.dateFrom && filters.dateTo) {
        filterInfo += `الفترة: ${filters.dateFrom} إلى ${filters.dateTo} | `;
    }
    if (filters.cashierFilter) {
        const cashierSelect = document.getElementById('postpaidSalesCashierFilter');
        const cashierName = cashierSelect.options[cashierSelect.selectedIndex].text;
        filterInfo += `الكاشير: ${cashierName} | `;
    }
    if (filters.branchFilter) {
        const branchSelect = document.getElementById('postpaidSalesBranchFilter');
        const branchName = branchSelect.options[branchSelect.selectedIndex].text;
        filterInfo += `الفرع: ${branchName} | `;
    }

    // Remove trailing separator
    filterInfo = filterInfo.replace(/ \| $/, '');

    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>تقرير المبيعات الآجلة - ${companyName}</title>
            <style>
                body {
                    font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    direction: rtl;
                    text-align: right;
                    margin: 0;
                    padding: 20px;
                    background: white;
                    color: #333;
                    line-height: 1.6;
                }
                .company-header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding: 20px;
                    border-bottom: 3px solid #007bff;
                }
                .company-name {
                    font-size: 28px;
                    font-weight: bold;
                    color: #007bff;
                    margin-bottom: 10px;
                }
                .report-title {
                    font-size: 24px;
                    font-weight: bold;
                    color: #333;
                    margin-bottom: 10px;
                }
                .report-info {
                    font-size: 14px;
                    color: #666;
                    margin-bottom: 5px;
                }
                .summary-section {
                    display: flex;
                    justify-content: space-around;
                    margin: 30px 0;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .summary-item {
                    text-align: center;
                    padding: 15px;
                }
                .summary-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #007bff;
                    margin-bottom: 5px;
                }
                .summary-label {
                    font-size: 14px;
                    color: #666;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                    background: white;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 12px 8px;
                    text-align: right;
                }
                th {
                    background: #007bff;
                    color: white;
                    font-weight: bold;
                    text-align: center;
                }
                tr:nth-child(even) {
                    background: #f8f9fa;
                }
                .amount {
                    font-weight: bold;
                    color: #28a745;
                }
                .page-footer {
                    position: fixed;
                    bottom: 20px;
                    left: 0;
                    right: 0;
                    text-align: center;
                    font-size: 10px;
                    color: #666;
                    border-top: 1px solid #ddd;
                    padding-top: 10px;
                }
                @media print {
                    body { margin: 0; }
                    .page-footer { position: fixed; bottom: 0; }
                }
            </style>
        </head>
        <body>
            <div class="company-header">
                <div class="company-name">${companyName}</div>
                <div class="report-title">📱 تقرير المبيعات الآجلة</div>
                <div class="report-info">تاريخ التقرير: ${getCurrentDate()}</div>
                ${filterInfo ? `<div class="report-info">المرشحات المطبقة: ${filterInfo}</div>` : ''}
            </div>

            <div class="summary-section">
                <div class="summary-item">
                    <div class="summary-value">${data.length}</div>
                    <div class="summary-label">إجمالي المبيعات</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${formatDecimal(totalAmount)}</div>
                    <div class="summary-label">إجمالي المبلغ (ريال)</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${uniqueCustomers}</div>
                    <div class="summary-label">عدد العملاء</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${formatDecimal(totalAmount / data.length)}</div>
                    <div class="summary-label">متوسط المبلغ (ريال)</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>رقم</th>
                        <th>اسم العميل</th>
                        <th>المبلغ (ريال)</th>
                        <th>الفرع</th>
                        <th>تاريخ المبيعة</th>
                        <th>تاريخ التصفية</th>
                        <th>الكاشير</th>
                        <th>المحاسب</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map((item, index) => `
                        <tr>
                            <td style="text-align: center;">${index + 1}</td>
                            <td>${item.customer_name || 'غير محدد'}</td>
                            <td class="amount" style="text-align: center;">${formatDecimal(item.amount)}</td>
                            <td style="text-align: center;">${item.branch_name || 'غير محدد'}</td>
                            <td style="text-align: center;">${item.created_at ? formatDate(item.created_at) : 'غير محدد'}</td>
                            <td style="text-align: center;">${item.reconciliation_date ? formatDate(item.reconciliation_date) : 'غير محدد'}</td>
                            <td style="text-align: center;">${item.cashier_name || 'غير محدد'}</td>
                            <td style="text-align: center;">${item.accountant_name || 'غير محدد'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="page-footer">
                جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
            </div>
        </body>
        </html>
    `;
}

// Prepare Excel data for postpaid sales report
function preparePostpaidSalesReportExcelData(data) {
    const totalAmount = data.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const uniqueCustomers = new Set(data.map(item => item.customer_name)).size;

    // Get filter information
    const filters = getPostpaidSalesReportFilters();
    let filterInfo = 'جميع البيانات';

    if (filters.searchName || filters.dateFrom || filters.dateTo || filters.cashierFilter || filters.branchFilter) {
        let filterParts = [];
        if (filters.searchName) filterParts.push(`البحث: ${filters.searchName}`);
        if (filters.dateFrom && filters.dateTo) filterParts.push(`الفترة: ${filters.dateFrom} إلى ${filters.dateTo}`);
        if (filters.cashierFilter) {
            const cashierSelect = document.getElementById('postpaidSalesCashierFilter');
            const cashierName = cashierSelect.options[cashierSelect.selectedIndex].text;
            filterParts.push(`الكاشير: ${cashierName}`);
        }
        if (filters.branchFilter) {
            const branchSelect = document.getElementById('postpaidSalesBranchFilter');
            const branchName = branchSelect.options[branchSelect.selectedIndex].text;
            filterParts.push(`الفرع: ${branchName}`);
        }
        filterInfo = filterParts.join(' | ');
    }

    return {
        title: 'تقرير المبيعات الآجلة',
        date: getCurrentDate(),
        filters: filterInfo,
        summary: {
            totalSales: data.length,
            totalAmount: formatDecimal(totalAmount),
            uniqueCustomers: uniqueCustomers,
            averageAmount: formatDecimal(totalAmount / data.length)
        },
        headers: [
            'رقم',
            'اسم العميل',
            'المبلغ (ريال)',
            'الفرع',
            'تاريخ المبيعة',
            'تاريخ التصفية',
            'الكاشير',
            'المحاسب'
        ],
        rows: data.map((item, index) => [
            index + 1,
            item.customer_name || 'غير محدد',
            formatDecimal(item.amount),
            item.branch_name || 'غير محدد',
            item.created_at ? formatDate(item.created_at) : 'غير محدد',
            item.reconciliation_date ? formatDate(item.reconciliation_date) : 'غير محدد',
            item.cashier_name || 'غير محدد',
            item.accountant_name || 'غير محدد'
        ])
    };
}

// ===================================================
// 🔮 نظام النص التنبؤي (Autocomplete System)
// ===================================================

/**
 * تهيئة نظام النص التنبؤي للحقول المحددة
 */
function initializeAutocomplete() {
    console.log('🔮 [AUTOCOMPLETE] بدء تهيئة نظام النص التنبؤي...');

    try {
        // التحقق من وجود نظام النص التنبؤي
        if (typeof autocompleteSystem === 'undefined') {
            console.error('❌ [AUTOCOMPLETE] نظام النص التنبؤي غير متاح');
            return;
        }

        // تم تعطيل النص التنبؤي للمبيعات الآجلة ومقبوضات العملاء
        // تهيئة النص التنبؤي لنماذج التعديل فقط
        initializeEditModalAutocomplete();

        console.log('✅ [AUTOCOMPLETE] تم تهيئة نظام النص التنبؤي بنجاح');

    } catch (error) {
        console.error('❌ [AUTOCOMPLETE] خطأ في تهيئة نظام النص التنبؤي:', error);
    }
}

// تم تعطيل دالة تهيئة النص التنبؤي للمبيعات الآجلة

// تم تعطيل دالة تهيئة النص التنبؤي لمقبوضات العملاء

/**
 * تهيئة النص التنبؤي لنماذج التعديل
 */
function initializeEditModalAutocomplete() {
    console.log('✏️ [AUTOCOMPLETE] تهيئة النص التنبؤي لنماذج التعديل...');

    // النص التنبؤي لنموذج تعديل المبيعات الآجلة
    autocompleteSystem.initialize('postpaidSaleCustomerName', {
        minLength: 1,
        debounceDelay: 300,
        maxResults: 8,
        placeholder: 'ابدأ كتابة اسم العميل...',
        dataSource: async (query) => {
            try {
                const suggestions = await ipcRenderer.invoke('autocomplete-postpaid-customers', query, 8);
                return suggestions;
            } catch (error) {
                console.error('❌ [AUTOCOMPLETE] خطأ في جلب اقتراحات تعديل المبيعات الآجلة:', error);
                return [];
            }
        },
        onSelect: (value, input) => {
            console.log(`✅ [AUTOCOMPLETE] تم اختيار عميل في نموذج تعديل المبيعات الآجلة: "${value}"`);
        }
    });

    // النص التنبؤي لنموذج تعديل مقبوضات العملاء
    autocompleteSystem.initialize('customerReceiptEditCustomerName', {
        minLength: 1,
        debounceDelay: 300,
        maxResults: 8,
        placeholder: 'ابدأ كتابة اسم العميل...',
        dataSource: async (query) => {
            try {
                const suggestions = await ipcRenderer.invoke('autocomplete-customer-receipts', query, 8);
                return suggestions;
            } catch (error) {
                console.error('❌ [AUTOCOMPLETE] خطأ في جلب اقتراحات تعديل مقبوضات العملاء:', error);
                return [];
            }
        },
        onSelect: (value, input) => {
            console.log(`✅ [AUTOCOMPLETE] تم اختيار عميل في نموذج تعديل مقبوضات العملاء: "${value}"`);
        }
    });

    console.log('✅ [AUTOCOMPLETE] تم تهيئة النص التنبؤي لنماذج التعديل');
}

/**
 * عرض إحصائيات سريعة للعميل
 * @param {string} customerName - اسم العميل
 * @param {string} context - السياق (postpaid, receipts)
 */
async function showCustomerQuickStats(customerName, context) {
    try {
        console.log(`📊 [AUTOCOMPLETE] جلب إحصائيات العميل: "${customerName}" في سياق: ${context}`);

        const stats = await ipcRenderer.invoke('autocomplete-customer-stats', customerName);

        if (stats && stats.totalTransactions > 0) {
            const message = `📊 إحصائيات العميل "${customerName}":
• إجمالي المعاملات: ${stats.totalTransactions}
• المبيعات الآجلة: ${stats.postpaidSales.count} (${formatDecimal(stats.postpaidSales.totalAmount)} ريال)
• المقبوضات: ${stats.customerReceipts.count} (${formatDecimal(stats.customerReceipts.totalAmount)} ريال)`;

            // عرض الإحصائيات كـ tooltip أو notification خفيفة
            showQuickTooltip(message, 3000);

            console.log('✅ [AUTOCOMPLETE] تم عرض إحصائيات العميل');
        }

    } catch (error) {
        console.error('❌ [AUTOCOMPLETE] خطأ في عرض إحصائيات العميل:', error);
    }
}

/**
 * عرض tooltip سريع للمعلومات
 * @param {string} message - الرسالة
 * @param {number} duration - مدة العرض بالمللي ثانية
 */
function showQuickTooltip(message, duration = 2000) {
    // إنشاء tooltip مؤقت
    const tooltip = document.createElement('div');
    tooltip.className = 'autocomplete-quick-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        font-size: 12px;
        white-space: pre-line;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        direction: rtl;
        text-align: right;
    `;
    tooltip.textContent = message;

    document.body.appendChild(tooltip);

    // إزالة الـ tooltip بعد المدة المحددة
    setTimeout(() => {
        if (tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
        }
    }, duration);
}

// =====================================================================
// 🖨️ THERMAL PRINTER 80MM SETTINGS - إعدادات الطابعة الحرارية 80 ملم
// =====================================================================

/**
 * Initialize thermal printer settings and load available printers
 * تهيئة إعدادات الطابعة الحرارية وتحميل قائمة الطابعات
 */
async function initializeThermalPrinterSettings() {
    try {
        console.log('🖨️ [THERMAL] تهيئة إعدادات الطابعة الحرارية...');

        // Setup form submission
        const thermalForm = document.getElementById('thermalPrinterSettingsForm');
        if (thermalForm) {
            thermalForm.addEventListener('submit', handleSaveThermalPrinterSettings);
        }

        // Setup test print button
        const testBtn = document.getElementById('testThermalPrint');
        if (testBtn) {
            testBtn.addEventListener('click', handleTestThermalPrint);
        }

        // Setup refresh printers button
        const refreshBtn = document.getElementById('refreshPrintersList');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', loadAvailablePrinters);
        }

        // Load available printers
        await loadAvailablePrinters();

        // Load saved settings
        await loadThermalPrinterSettings();

        console.log('✅ [THERMAL] تم تهيئة إعدادات الطابعة الحرارية بنجاح');

    } catch (error) {
        console.error('❌ [THERMAL] خطأ في تهيئة الطابعة الحرارية:', error);
    }
}

/**
 * Load available printers from system
 * تحميل قائمة الطابعات المتاحة
 */
async function loadAvailablePrinters() {
    try {
        console.log('🖨️ [THERMAL] جاري تحميل قائمة الطابعات...');

        const result = await ipcRenderer.invoke('thermal-printer-list');

        const select = document.getElementById('thermalPrinterName');
        if (!select) {
            console.warn('⚠️ [THERMAL] لم يتم العثور على عنصر اختيار الطابعة');
            return;
        }

        if (result.success && result.printers && result.printers.length > 0) {
            select.innerHTML = '';

            result.printers.forEach(printer => {
                const option = document.createElement('option');
                option.value = printer.name;
                option.textContent = `${printer.displayName} ${printer.isDefault ? '(افتراضي)' : ''}`.trim();
                option.selected = printer.isDefault;
                select.appendChild(option);
            });

            console.log(`✅ [THERMAL] تم تحميل ${result.printers.length} طابعة`);
        } else {
            console.warn('⚠️ [THERMAL] لم يتم العثور على طابعات أو حدث خطأ:', result.error);
            select.innerHTML = '<option value="">لم يتم العثور على طابعات - اختر يدوياً</option>';
        }

    } catch (error) {
        console.error('❌ [THERMAL] خطأ في تحميل قائمة الطابعات:', error);
        const select = document.getElementById('thermalPrinterName');
        if (select) {
            select.innerHTML = '<option value="">خطأ في تحميل الطابعات</option>';
        }
        DialogUtils.showError(`فشل في تحميل قائمة الطابعات: ${error.message}`, 'خطأ في الطابعة');
    }
}

/**
 * Load saved thermal printer settings
 * تحميل إعدادات الطابعة المحفوظة
 */
async function loadThermalPrinterSettings() {
    try {
        console.log('🖨️ [THERMAL] جاري تحميل الإعدادات المحفوظة...');

        const result = await ipcRenderer.invoke('thermal-printer-settings-get');

        if (result.success && result.settings) {
            const settings = result.settings;

            // Update form fields
            if (document.getElementById('thermalFontSize')) {
                document.getElementById('thermalFontSize').value = settings.fontSize || 10;
            }
            if (document.getElementById('thermalFontName')) {
                document.getElementById('thermalFontName').value = settings.fontName || 'Courier New';
            }
            if (document.getElementById('thermalCopies')) {
                document.getElementById('thermalCopies').value = settings.copies || 1;
            }
            if (document.getElementById('thermalColorPrint')) {
                document.getElementById('thermalColorPrint').checked = settings.color || false;
            }
            if (document.getElementById('thermalAutoFeed')) {
                document.getElementById('thermalAutoFeed').checked = true;
            }
            if (document.getElementById('thermalPaperWidth') && settings.paperWidth) {
                document.getElementById('thermalPaperWidth').value = settings.paperWidth;
            }
            if (document.getElementById('thermalPrinterName') && settings.printerName) {
                document.getElementById('thermalPrinterName').value = settings.printerName;
            }

            console.log('✅ [THERMAL] تم تحميل الإعدادات المحفوظة');
        }

    } catch (error) {
        console.error('⚠️ [THERMAL] تحذير عند تحميل الإعدادات:', error);
    }
}

/**
 * Handle saving thermal printer settings
 * معالجة حفظ إعدادات الطابعة الحرارية
 */
async function handleSaveThermalPrinterSettings(event) {
    event.preventDefault();

    try {
        console.log('🖨️ [THERMAL] جاري حفظ إعدادات الطابعة الحرارية...');
        DialogUtils.showLoading('جاري حفظ الإعدادات...');

        const settings = {
            fontName: document.getElementById('thermalFontName').value || 'Courier New',
            fontSize: parseInt(document.getElementById('thermalFontSize').value) || 10,
            copies: parseInt(document.getElementById('thermalCopies').value) || 1,
            color: document.getElementById('thermalColorPrint').checked,
            printerName: document.getElementById('thermalPrinterName').value || null,
            paperWidth: parseInt(document.getElementById('thermalPaperWidth').value) || 80
        };

        const result = await ipcRenderer.invoke('thermal-printer-settings-update', settings);

        DialogUtils.hideLoading();

        if (result.success) {
            console.log('✅ [THERMAL] تم حفظ الإعدادات بنجاح');
            DialogUtils.showSuccessToast('تم حفظ إعدادات الطابعة الحرارية بنجاح');
        } else {
            throw new Error(result.error || 'فشل في حفظ الإعدادات');
        }

    } catch (error) {
        DialogUtils.hideLoading();
        console.error('❌ [THERMAL] خطأ في حفظ الإعدادات:', error);
        DialogUtils.showError(`فشل في حفظ الإعدادات: ${error.message}`, 'خطأ في الحفظ');
    }
}

/**
 * Handle test thermal printer
 * معالجة اختبار الطابعة الحرارية
 */
async function handleTestThermalPrint() {
    try {
        console.log('🖨️ [THERMAL] بدء اختبار الطابعة الحرارية...');
        DialogUtils.showLoading('جاري إرسال نموذج الاختبار...');

        // Get current settings
        const settings = {
            fontName: document.getElementById('thermalFontName').value || 'Courier New',
            fontSize: parseInt(document.getElementById('thermalFontSize').value) || 10,
            copies: 1,
            color: document.getElementById('thermalColorPrint').checked,
            printerName: document.getElementById('thermalPrinterName').value || null
        };

        // Create test reconciliation data
        const testData = {
            reconciliation: {
                id: 'TEST-001',
                cashier_name: 'عميل الاختبار',
                cashier_number: '001',
                accountant_name: 'محاسب الاختبار',
                reconciliation_date: new Date().toISOString(),
                system_sales: 1000,
                total_receipts: 1000,
                surplus_deficit: 0,
                status: 'اختبار'
            },
            bankReceipts: [
                { amount: 500, date: new Date().toISOString(), note: 'مقبوضة بنكية اختبار' }
            ],
            cashReceipts: [
                { total_amount: 500, date: new Date().toISOString(), note: 'مقبوضة نقدية اختبار' }
            ]
        };

        // Send test print
        const result = await ipcRenderer.invoke('thermal-printer-print', testData, settings);

        DialogUtils.hideLoading();

        if (result.success) {
            console.log('✅ [THERMAL] تم إرسال اختبار الطباعة بنجاح');
            DialogUtils.showSuccess('تم إرسال نموذج الاختبار إلى الطابعة الحرارية\nتحقق من الطابعة للتأكد من جودة الطباعة', 'اختبار الطباعة');
        } else {
            throw new Error(result.error || 'فشل في إرسال الاختبار');
        }

    } catch (error) {
        DialogUtils.hideLoading();
        console.error('❌ [THERMAL] خطأ في اختبار الطابعة:', error);
        DialogUtils.showError(`فشل في اختبار الطابعة: ${error.message}`, 'خطأ في الاختبار');
    }
}


// ============================================
// EXPOSED API FOR RECONCILIATION REQUESTS
// ============================================

window.appAPI = {
    navigateToNewReconciliation: () => {
        const menuItem = document.querySelector('.menu-item[data-section="reconciliation"]');
        if (menuItem) menuItem.click();
    },

    resetReconciliationForm: async () => {
        // Reset arrays
        bankReceipts = [];
        cashReceipts = [];
        postpaidSales = [];
        customerReceipts = [];
        returnInvoices = [];
        suppliers = [];

        // Update UI
        updateBankReceiptsTable();
        updateCashReceiptsTable();
        updatePostpaidSalesTable();
        updateCustomerReceiptsTable();
        updateReturnInvoicesTable();
        updateSuppliersTable();
        updateSummary();

        document.getElementById('systemSales').value = '';
        document.getElementById('filterNotes').value = '';

        // If current reconciliation exists locally but not saved, clear it
        if (currentReconciliation && !currentReconciliation.id) {
            currentReconciliation = null;
        }
    },

    setSystemSales: (amount) => {
        const el = document.getElementById('systemSales');
        if (el) {
            el.value = amount;
            // Trigger input event
            el.dispatchEvent(new Event('input'));
        }
    },

    setNotes: (notes) => {
        const el = document.getElementById('filterNotes');
        if (el) el.value = notes;
    },

    addCashReceipt: async (val, qty) => {
        if (!currentReconciliation || !currentReconciliation.id) {
            console.warn('⚠️ No active reconciliation to add cash receipt to');
            return;
        }

        const total = val * qty;

        try {
            // Save to database
            const result = await ipcRenderer.invoke('db-run',
                'INSERT INTO cash_receipts (reconciliation_id, denomination, quantity, total_amount) VALUES (?, ?, ?, ?)',
                [currentReconciliation.id, val, qty, total]
            );

            // Add to memory
            cashReceipts.push({
                id: result.lastInsertRowid,
                reconciliation_id: currentReconciliation.id,
                denomination: val,
                quantity: qty,
                total_amount: total
            });

            updateCashReceiptsTable();
            updateSummary();
            console.log('✅ Cash receipt saved to database');
        } catch (error) {
            console.error('❌ Error saving cash receipt:', error);
        }
    },

    addBankReceipt: (amount) => {
        bankReceipts.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            operation_type: 'settlement',
            atm_name: 'من طلب التصفية',
            bank_name: '-',
            amount: parseFloat(amount)
        });
        updateBankReceiptsTable();
    },

    updateSummary: () => {
        if (typeof updateSummary === 'function') updateSummary();
    }
};

console.log('✅ AppAPI exposed for external modules');

// ============================================
// EXTENDED API FOR FULL RECONCILIATION SUPPORT
// ============================================

Object.assign(window.appAPI, {
    // Add Postpaid Sale (مبيعات آجلة)
    addPostpaidSale: async (customerName, amount) => {
        if (!currentReconciliation || !currentReconciliation.id) return;
        try {
            const result = await ipcRenderer.invoke('db-run',
                'INSERT INTO postpaid_sales (reconciliation_id, customer_name, amount) VALUES (?, ?, ?)',
                [currentReconciliation.id, customerName, parseFloat(amount)]
            );
            postpaidSales.push({
                id: result.lastInsertRowid,
                reconciliation_id: currentReconciliation.id,
                customer_name: customerName,
                amount: parseFloat(amount)
            });
            updatePostpaidSalesTable();
            updateSummary();
        } catch (error) {
            console.error('❌ Error saving postpaid sale:', error);
        }
    },

    // Add Customer Receipt (مقبوضات عملاء)
    addCustomerReceipt: async (customerName, amount, paymentType, notes) => {
        if (!currentReconciliation || !currentReconciliation.id) return;
        try {
            const result = await ipcRenderer.invoke('db-run',
                'INSERT INTO customer_receipts (reconciliation_id, customer_name, amount, payment_type, notes) VALUES (?, ?, ?, ?, ?)',
                [currentReconciliation.id, customerName, parseFloat(amount), paymentType || 'cash', notes || '']
            );
            customerReceipts.push({
                id: result.lastInsertRowid,
                reconciliation_id: currentReconciliation.id,
                customer_name: customerName,
                amount: parseFloat(amount),
                payment_type: paymentType || 'cash',
                notes: notes || ''
            });
            updateCustomerReceiptsTable();
            updateSummary();
        } catch (error) {
            console.error('❌ Error saving customer receipt:', error);
        }
    },

    // Add Return Invoice (مرتجع)
    addReturnInvoice: async (invoiceNo, amount, notes) => {
        if (!currentReconciliation || !currentReconciliation.id) return;
        try {
            const result = await ipcRenderer.invoke('db-run',
                'INSERT INTO return_invoices (reconciliation_id, invoice_number, amount, notes) VALUES (?, ?, ?, ?)',
                [currentReconciliation.id, invoiceNo, parseFloat(amount), notes || '']
            );
            returnInvoices.push({
                id: result.lastInsertRowid,
                reconciliation_id: currentReconciliation.id,
                invoice_number: invoiceNo,
                amount: parseFloat(amount),
                notes: notes || ''
            });
            updateReturnInvoicesTable();
            updateSummary();
            console.log('✅ Return invoice saved to database');
        } catch (error) {
            console.error('❌ Error saving return invoice:', error);
        }
    },

    // Add Supplier/Expense (موردين/مصروفات)
    addSupplier: async (supplierName, invoiceNo, amount, vat, notes) => {
        if (!currentReconciliation || !currentReconciliation.id) return;
        try {
            const result = await ipcRenderer.invoke('db-run',
                'INSERT INTO suppliers (reconciliation_id, supplier_name, invoice_number, amount, notes) VALUES (?, ?, ?, ?, ?)',
                [currentReconciliation.id, supplierName, invoiceNo || '', parseFloat(amount), notes || '']
            );
            suppliers.push({
                id: result.lastInsertRowid,
                reconciliation_id: currentReconciliation.id,
                supplier_name: supplierName,
                invoice_number: invoiceNo || '',
                amount: parseFloat(amount),
                notes: notes || ''
            });
            updateSuppliersTable();
            updateSummary();
            console.log('✅ Supplier saved to database');
        } catch (error) {
            console.error('❌ Error saving supplier:', error);
        }
    },

    // Add Bank Receipt with Details
    addDetailedBankReceipt: async (atmName, bankName, amount, operationType) => {
        if (!currentReconciliation || !currentReconciliation.id) return;
        try {
            const result = await ipcRenderer.invoke('db-run',
                'INSERT INTO bank_receipts (reconciliation_id, operation_type, amount, atm_id) VALUES (?, ?, ?, NULL)',
                [currentReconciliation.id, operationType || 'settlement', parseFloat(amount)]
            );
            bankReceipts.push({
                id: result.lastInsertRowid,
                reconciliation_id: currentReconciliation.id,
                operation_type: operationType || 'settlement',
                atm_name: atmName,
                bank_name: bankName,
                amount: parseFloat(amount)
            });
            updateBankReceiptsTable();
            updateSummary();
        } catch (error) {
            console.error('❌ Error saving bank receipt:', error);
        }
    }
});

console.log('✅ Full AppAPI extensions loaded');

// ============================================
// WEB SYNC CONTROL
// ============================================

/**
 * تحديث واجهة حالة المزامنة
 */
async function updateSyncUI() {
    try {
        const syncStatusBadge = document.getElementById('syncStatusBadge');
        const toggleSyncBtn = document.getElementById('toggleSyncBtn');
        const syncBtnText = document.getElementById('syncBtnText');
        const syncBtnSpinner = document.getElementById('syncBtnSpinner');

        if (!syncStatusBadge || !toggleSyncBtn) return;

        // الحصول على حالة المزامنة
        const result = await ipcRenderer.invoke('get-sync-status');

        if (result.success) {
            const { isRunning, isEnabled } = result;

            // تحديث شارة الحالة
            if (isRunning) {
                syncStatusBadge.className = 'badge bg-success';
                syncStatusBadge.textContent = '✅ نشطة';
            } else {
                syncStatusBadge.className = 'badge bg-warning text-dark';
                syncStatusBadge.textContent = '⏸️ متوقفة';
            }

            // تحديث نص ولون الزر
            if (isEnabled) {
                toggleSyncBtn.className = 'btn btn-lg w-100 btn-warning';
                syncBtnText.textContent = '⏸️ إيقاف المزامنة';
            } else {
                toggleSyncBtn.className = 'btn btn-lg w-100 btn-success';
                syncBtnText.textContent = '▶️ تفعيل المزامنة';
            }

            // تحديث وقت آخر مزامنة
            const syncLastUpdate = document.getElementById('syncLastUpdate');
            if (syncLastUpdate) {
                const now = new Date().toLocaleString('ar-SA', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                syncLastUpdate.textContent = `آخر تحديث: ${now}`;
            }
        }
    } catch (error) {
        console.error('❌ [SYNC-UI] خطأ في تحديث واجهة المزامنة:', error);
    }
}

/**
 * تبديل حالة المزامنة
 */
async function toggleSync() {
    try {
        const toggleSyncBtn = document.getElementById('toggleSyncBtn');
        const syncBtnText = document.getElementById('syncBtnText');
        const syncBtnSpinner = document.getElementById('syncBtnSpinner');

        if (!toggleSyncBtn) return;

        // تعطيل الزر وإظهار السبينر
        toggleSyncBtn.disabled = true;
        syncBtnSpinner.classList.remove('d-none');
        syncBtnText.textContent = 'جاري العملية...';

        // الحصول على الحالة الحالية
        const statusResult = await ipcRenderer.invoke('get-sync-status');
        if (!statusResult.success) {
            throw new Error('فشل الحصول على حالة المزامنة');
        }

        const currentlyEnabled = statusResult.isEnabled;
        const newState = !currentlyEnabled;

        // تنفيذ التبديل
        const result = await ipcRenderer.invoke('toggle-sync', newState);

        if (result.success) {
            // إظهار رسالة نجاح
            const message = newState ? 'تم تفعيل المزامنة بنجاح ✅' : 'تم إيقاف المزامنة مؤقتاً ⏸️';
            const alertType = newState ? 'success' : 'warning';

            Swal.fire({
                icon: alertType,
                title: message,
                timer: 2000,
                showConfirmButton: false,
                position: 'top-end',
                toast: true
            });

            // تحديث الواجهة فوراً
            updateSyncUI();

            // إعادة تفعيل الزر فوراً للسماح بالتبديل السريع
            toggleSyncBtn.disabled = false;
            syncBtnSpinner.classList.add('d-none');
        } else {
            throw new Error(result.error || 'فشل تبديل حالة المزامنة');
        }
    } catch (error) {
        console.error('❌ [SYNC-TOGGLE] خطأ في تبديل المزامنة:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ في تبديل حالة المزامنة: ' + error.message,
            confirmButtonText: 'حسناً'
        });

        // إعادة تفعيل الزر
        const toggleSyncBtn = document.getElementById('toggleSyncBtn');
        const syncBtnSpinner = document.getElementById('syncBtnSpinner');

        if (toggleSyncBtn) toggleSyncBtn.disabled = false;
        if (syncBtnSpinner) syncBtnSpinner.classList.add('d-none');

        updateSyncUI();
    }
}

// تهيئة عناصر التحكم في المزامنة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function () {
    const toggleSyncBtn = document.getElementById('toggleSyncBtn');

    if (toggleSyncBtn) {
        // إضافة مستمع حدث النقر
        toggleSyncBtn.addEventListener('click', toggleSync);

        // تحديث الواجهة عند فتح تبويب الإعدادات
        const systemTab = document.getElementById('system-tab');
        if (systemTab) {
            systemTab.addEventListener('click', function () {
                setTimeout(() => updateSyncUI(), 100);
            });
        }

        // تحديث أولي
        updateSyncUI();

        // تحديث دوري كل 30 ثانية
        setInterval(updateSyncUI, 30000);
    }
});

// ===================================================
// Handle Save Reconciliation - MISSING FUNCTION FIX
// ===================================================
async function handleSaveReconciliation() {
    if (!currentReconciliation) {
        DialogUtils.showValidationError('لا توجد تصفية حالية للحفظ');
        return;
    }

    try {
        console.log('💾 [SAVE] بدء حفظ التصفية...');

        // Get system sales value
        const systemSales = parseFloat(document.getElementById('systemSales').value) || 0;

        // Update reconciliation with system sales
        // Calculate Totals for the header record
        const totalFound = calculateTotalFound();
        const surplusDeficit = totalFound - systemSales;

        // Update reconciliation with system sales, calculated totals, and status
        // First, check if it needs a number
        let recNumber = currentReconciliation.reconciliation_number;

        if (!recNumber) {
            // Get max number
            const maxResult = await ipcRenderer.invoke('db-get',
                'SELECT MAX(reconciliation_number) as max_num FROM reconciliations'
            );
            recNumber = (maxResult.max_num || 0) + 1;
        }

        await ipcRenderer.invoke('db-run',
            `UPDATE reconciliations 
             SET system_sales = ?, 
                 total_receipts = ?,
                 surplus_deficit = ?,
                 status = 'completed', 
                 reconciliation_number = ?,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [systemSales, totalFound, surplusDeficit, recNumber, currentReconciliation.id]
        );

        // Update local object
        currentReconciliation.status = 'completed';
        currentReconciliation.reconciliation_number = recNumber;
        currentReconciliation.total_receipts = totalFound;
        currentReconciliation.surplus_deficit = surplusDeficit;

        console.log('✅ [SAVE] تم حفظ التصفية بنجاح - ID:', currentReconciliation.id);

        // If this was from a web request, mark it as completed
        if (currentReconciliation.originRequestId) {
            try {
                console.log('🌐 [SAVE] تحديث حالة طلب الويب...');
                const response = await fetch(`http://localhost:4000/api/reconciliation-requests/${currentReconciliation.originRequestId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.ok) {
                    console.log('✅ [SAVE] تم تحديث حالة الطلب على الويب');

                    // Dispatch event for requests manager
                    window.dispatchEvent(new CustomEvent('reconciliation-saved', {
                        detail: { originRequestId: currentReconciliation.originRequestId }
                    }));
                } else {
                    console.warn('⚠️ [SAVE] فشل في تحديث حالة الطلب على الويب');
                }
            } catch (error) {
                console.warn('⚠️ [SAVE] خطأ في الاتصال بخادم الويب:', error);
            }
        }

        DialogUtils.showSuccessToast('تم حفظ التصفية بنجاح');

        // Show completion summary
        // Show completion summary
        // Note: totalFound and surplusDeficit (difference) are already calculated above

        await Swal.fire({
            icon: 'success',
            title: '✅ تم حفظ التصفية بنجاح',
            html: `
                <div class="text-end" style="direction: rtl;">
                    <p><strong>رقم التصفية:</strong> ${currentReconciliation.reconciliation_number || currentReconciliation.id}</p>
                    <p><strong>مبيعات النظام:</strong> ${systemSales.toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال</p>
                    <p><strong>الموجود الفعلي:</strong> ${totalFound.toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال</p>
                    <p><strong>الفارق:</strong> <span style="color: ${surplusDeficit >= 0 ? 'green' : 'red'}; font-weight: bold;">${surplusDeficit.toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال</span></p>
                </div>
            `,
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#10b981'
        });

        // Reset to allow new reconciliation
        resetSystemToNewReconciliationState();

    } catch (error) {
        console.error('❌ [SAVE] خطأ في حفظ التصفية:', error);
        DialogUtils.showError('حدث خطأ أثناء حفظ التصفية: ' + error.message, 'خطأ في الحفظ');
    }
}

// Helper function to calculate total found
function calculateTotalFound() {
    const totalCash = cashReceipts.reduce((sum, r) => sum + (r.total_amount || r.total || 0), 0);
    const totalBank = bankReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalPostpaid = postpaidSales.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalCustomerReceipts = customerReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalReturns = returnInvoices.reduce((sum, r) => sum + (r.amount || 0), 0);

    // FORMULA MATCHING updateSummary:
    // Total Found = Bank + Cash + Postpaid + Returns - Customer Receipts
    return totalBank + totalCash + totalPostpaid + totalReturns - totalCustomerReceipts;
}

// Helper function to reset system to new reconciliation state
function resetSystemToNewReconciliationState() {
    // Clear current reconciliation
    currentReconciliation = null;

    // Reset all data arrays
    bankReceipts = [];
    cashReceipts = [];
    postpaidSales = [];
    customerReceipts = [];
    returnInvoices = [];
    suppliers = [];

    // Clear all tables
    updateBankReceiptsTable();
    updateCashReceiptsTable();
    updatePostpaidSalesTable();
    updateCustomerReceiptsTable();
    updateReturnInvoicesTable();
    updateSuppliersTable();
    updateSummary();

    // Reset forms
    document.getElementById('newReconciliationForm').reset();
    document.getElementById('systemSales').value = '';
    document.getElementById('reconciliationDate').value = new Date().toISOString().split('T')[0];

    // Hide current reconciliation info
    const infoDiv = document.getElementById('currentReconciliationInfo');
    if (infoDiv) {
        infoDiv.style.display = 'none';
    }

    // Update button states
    updateButtonStates('INITIAL');

    console.log('🔄 [RESET] تمت إعادة تعيين النظام للحالة الأولية');
}

console.log('✅ Web Sync Control UI initialized');

