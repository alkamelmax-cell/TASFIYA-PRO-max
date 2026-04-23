const {
  clearActiveFormulaSettingsInDocument,
  parseStoredFormulaSettings
} = require('./reconciliation-formula');
const { mapDbErrorMessage } = require('./db-error-messages');
const {
  normalizeFiscalYear,
  setSelectedFiscalYear,
  updateFiscalYearDisplay,
  applyFiscalYearToAllDateFilters,
  syncFiscalYearSelectValue
} = require('./fiscal-year');

function createAppShellAuthHandlers(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const windowObj = context.windowObj || globalThis;
  const setTimeoutFn = context.setTimeoutFn || setTimeout;
  const clearTimeoutFn = context.clearTimeoutFn || clearTimeout;
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const logger = context.logger || console;
  const getCurrentUser = context.getCurrentUser;
  const getCurrentReconciliation = context.getCurrentReconciliation;
  const setCurrentReconciliation = context.setCurrentReconciliation;
  const setCurrentUser = context.setCurrentUser;
  const setBankReceipts = context.setBankReceipts;
  const setCashReceipts = context.setCashReceipts;
  const setPostpaidSales = context.setPostpaidSales;
  const setCustomerReceipts = context.setCustomerReceipts;
  const setReturnInvoices = context.setReturnInvoices;
  const setSuppliers = context.setSuppliers;
  const loadSystemSettings = context.loadSystemSettings;
  const normalizeUser = context.normalizeUser || ((user) => user);
  const applyPermissionsToDocument = context.applyPermissionsToDocument || (() => {});
  const getDefaultSectionForUser = context.getDefaultSectionForUser || (() => 'reconciliation');
  const showSection = context.showSection;
  const highlightMenuItem = context.highlightMenuItem;
  const resetUIOnly = context.resetUIOnly;
  const clearAllReconciliationData = context.clearAllReconciliationData;
  const resetSystemToNewReconciliationState = context.resetSystemToNewReconciliationState;
  const showError = context.showError;
  const securityActivityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  const resumeStorageKey = 'pendingReconciliationResume';
  const resumeTtlMs = 24 * 60 * 60 * 1000;
  let sessionTimeoutTimer = null;
  let autoLockTimer = null;
  let activityHandler = null;
  let lastActivityResetAt = 0;
  let securityConfig = {
    sessionTimeoutMinutes: 60,
    autoLockMinutes: 10
  };

  function parsePositiveMinutes(value, options = {}) {
    const allowZero = options.allowZero !== false;
    const raw = String(value == null ? '' : value).trim().toLowerCase();
    if (!raw || raw === 'disabled') return 0;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    if (parsed < 0) return 0;
    if (!allowZero && parsed === 0) return 0;
    return parsed;
  }

  function clearSecurityTimers() {
    if (sessionTimeoutTimer) {
      clearTimeoutFn(sessionTimeoutTimer);
      sessionTimeoutTimer = null;
    }

    if (autoLockTimer) {
      clearTimeoutFn(autoLockTimer);
      autoLockTimer = null;
    }
  }

  function detachActivityListeners() {
    if (!activityHandler) return;

    securityActivityEvents.forEach((eventName) => {
      document.removeEventListener(eventName, activityHandler, true);
    });
    activityHandler = null;
  }

  function stopSecurityGuards() {
    clearSecurityTimers();
    detachActivityListeners();
    lastActivityResetAt = 0;
  }

  function getActiveUser() {
    if (typeof getCurrentUser === 'function') {
      return getCurrentUser();
    }
    return null;
  }

  function showSecurityWarning(message, title) {
    const dialog = getDialogUtils();
    if (!dialog) return;

    if (typeof dialog.showWarning === 'function') {
      dialog.showWarning(message, title || 'تنبيه أمني');
      return;
    }
    if (typeof dialog.showInfo === 'function') {
      dialog.showInfo(message, title || 'تنبيه أمني');
      return;
    }
    if (typeof dialog.showErrorToast === 'function') {
      dialog.showErrorToast(message);
    }
  }

  function getResumeStorage() {
    if (!windowObj) return null;
    return windowObj.localStorage || null;
  }

  function storePendingReconciliation(reason) {
    const storage = getResumeStorage();
    const currentReconciliation = getCurrentReconciliation ? getCurrentReconciliation() : null;
    if (!storage || !currentReconciliation || !currentReconciliation.id) {
      return;
    }

    const payload = {
      id: currentReconciliation.id,
      reason: reason || 'security',
      timestamp: Date.now()
    };

    try {
      storage.setItem(resumeStorageKey, JSON.stringify(payload));
    } catch (error) {
      logger.warn('⚠️ [SECURITY] Failed to store pending reconciliation:', error);
    }
  }

  function clearPendingReconciliation() {
    const storage = getResumeStorage();
    if (!storage) return;
    try {
      storage.removeItem(resumeStorageKey);
    } catch (error) {
      logger.warn('⚠️ [SECURITY] Failed to clear pending reconciliation:', error);
    }
  }

  async function maybeRestorePendingReconciliation() {
    const storage = getResumeStorage();
    if (!storage) return;

    let payload = null;
    try {
      payload = JSON.parse(storage.getItem(resumeStorageKey) || 'null');
    } catch (_error) {
      payload = null;
    }

    if (!payload || !payload.id) {
      return;
    }

    const isExpired = payload.timestamp && (Date.now() - payload.timestamp > resumeTtlMs);
    if (isExpired) {
      clearPendingReconciliation();
      return;
    }

    try {
      const reconciliation = await ipcRenderer.invoke(
        'db-get',
        'SELECT id, reconciliation_number, status FROM reconciliations WHERE id = ? LIMIT 1',
        [payload.id]
      );

      if (!reconciliation || reconciliation.status === 'completed') {
        clearPendingReconciliation();
        return;
      }

      const dialog = getDialogUtils();
      if (!dialog || typeof dialog.showConfirm !== 'function') {
        logger.warn('⚠️ [SECURITY] Dialog utils unavailable; skip pending reconciliation prompt.');
        return;
      }

      const confirmed = await dialog.showConfirm(
        'تم العثور على تصفية غير مكتملة بسبب إغلاق الجلسة. هل تريد استعادتها؟',
        'استعادة تصفية سابقة',
        'استعادة',
        'تجاهل'
      );

      if (!confirmed) {
        clearPendingReconciliation();
        return;
      }

      if (windowObj && typeof windowObj.recallReconciliationFromId === 'function') {
        await windowObj.recallReconciliationFromId(reconciliation.id);
      } else {
        dialog.showError('تعذر استعادة التصفية تلقائياً. يمكنك استدعاؤها من قائمة التصفيات.', 'استعادة غير متاحة');
      }
    } catch (error) {
      logger.error('❌ [SECURITY] Failed to restore pending reconciliation:', error);
    } finally {
      clearPendingReconciliation();
    }
  }

  function logoutBySecurityPolicy(reasonMessage, reasonTitle) {
    if (!getActiveUser()) return;
    storePendingReconciliation('security');
    handleLogout();
    showSecurityWarning(reasonMessage, reasonTitle);
  }

  function resetAutoLockTimer() {
    if (autoLockTimer) {
      clearTimeoutFn(autoLockTimer);
      autoLockTimer = null;
    }

    if (securityConfig.autoLockMinutes <= 0 || !getActiveUser()) {
      return;
    }

    autoLockTimer = setTimeoutFn(() => {
      if (!getActiveUser()) return;
      logger.warn('🔐 [SECURITY] Auto lock timeout reached, forcing logout');
      logoutBySecurityPolicy('تم قفل الجلسة بسبب عدم النشاط. يرجى تسجيل الدخول مرة أخرى.', 'قفل تلقائي للجلسة');
    }, securityConfig.autoLockMinutes * 60 * 1000);
  }

  function attachActivityListeners() {
    if (activityHandler) return;

    activityHandler = () => {
      if (!getActiveUser()) return;
      const now = Date.now();
      if (now - lastActivityResetAt < 1000) return;
      lastActivityResetAt = now;
      resetAutoLockTimer();
    };

    securityActivityEvents.forEach((eventName) => {
      document.addEventListener(eventName, activityHandler, true);
    });
  }

  function startSecurityGuards() {
    stopSecurityGuards();
    if (!getActiveUser()) return;

    if (securityConfig.sessionTimeoutMinutes > 0) {
      sessionTimeoutTimer = setTimeoutFn(() => {
        if (!getActiveUser()) return;
        logger.warn('🔐 [SECURITY] Session timeout reached, forcing logout');
        logoutBySecurityPolicy('انتهت صلاحية الجلسة حسب إعدادات الأمان. يرجى تسجيل الدخول مجددًا.', 'انتهاء الجلسة');
      }, securityConfig.sessionTimeoutMinutes * 60 * 1000);
    }

    if (securityConfig.autoLockMinutes > 0) {
      attachActivityListeners();
      resetAutoLockTimer();
    }
  }

  function normalizeSecurityConfig(rawSettings) {
    const sessionTimeoutMinutes = parsePositiveMinutes(rawSettings?.sessionTimeout, { allowZero: true });
    const autoLockMinutes = parsePositiveMinutes(rawSettings?.autoLock, { allowZero: true });

    return {
      sessionTimeoutMinutes,
      autoLockMinutes
    };
  }

  function readStoredSecurityValue(map, key, fallbackValue) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) {
      return fallbackValue;
    }

    const normalized = String(map[key] == null ? '' : map[key]).trim();
    return normalized === '' ? fallbackValue : normalized;
  }

  async function readSecuritySettingsFromDatabase() {
    try {
      const rows = await ipcRenderer.invoke(
        'db-query',
        `SELECT s.setting_key, s.setting_value
         FROM system_settings s
         INNER JOIN (
           SELECT setting_key, MAX(id) AS latest_id
           FROM system_settings
           WHERE category = ?
           GROUP BY setting_key
         ) latest
           ON latest.latest_id = s.id
         WHERE s.category = ?`,
        ['user', 'user']
      );

      const map = {};
      (rows || []).forEach((row) => {
        if (!row || !row.setting_key) return;
        map[row.setting_key] = row.setting_value;
      });

      return {
        sessionTimeout: readStoredSecurityValue(map, 'session_timeout', '60'),
        autoLock: readStoredSecurityValue(map, 'auto_lock', '10')
      };
    } catch (error) {
      logger.warn('⚠️ [SECURITY] Failed to read user security settings from DB:', error);
      return {
        sessionTimeout: '60',
        autoLock: '10'
      };
    }
  }

  async function applyRuntimeSecuritySettings(settings = null) {
    const source = settings || await readSecuritySettingsFromDatabase();
    securityConfig = normalizeSecurityConfig(source);

    logger.log('🔐 [SECURITY] Applied runtime security settings:', securityConfig);
    startSecurityGuards();
  }

  function isRecalledReconciliation(reconciliation) {
    return !!(reconciliation && (reconciliation.__mode === 'recalled' || reconciliation.is_recalled === true));
  }

  function resetSaveButtonToDefaultMode() {
    const saveButton = document.getElementById('saveReconciliationBtn');
    if (!saveButton) {
      return;
    }

    saveButton.disabled = false;
    saveButton.title = 'حفظ التصفية الحالية';
    saveButton.innerHTML = '<i class="icon">💾</i> حفظ التصفية';
  }

  async function restoreRecalledSnapshot(snapshot, reconciliationId) {
    if (!snapshot || !snapshot.reconciliation || !snapshot.sections || !reconciliationId) {
      return false;
    }

    const reconciliation = snapshot.reconciliation;
    const sections = snapshot.sections;

    const timestampOf = (row) => (row && row.created_at ? row.created_at : new Date().toISOString());

    const parsedFormulaSettings = parseStoredFormulaSettings(reconciliation.formula_settings);
    const parsedFormulaProfileId = Number.parseInt(reconciliation.formula_profile_id, 10);
    const formulaProfileId = Number.isFinite(parsedFormulaProfileId) && parsedFormulaProfileId > 0
      ? parsedFormulaProfileId
      : null;
    const formulaSettingsJson = parsedFormulaSettings
      ? JSON.stringify(parsedFormulaSettings)
      : null;

    await ipcRenderer.invoke(
      'db-run',
      `UPDATE reconciliations
       SET cashier_id = ?,
           accountant_id = ?,
           reconciliation_date = ?,
           time_range_start = ?,
           time_range_end = ?,
           filter_notes = ?,
           system_sales = ?,
           total_receipts = ?,
           surplus_deficit = ?,
           formula_profile_id = COALESCE(?, formula_profile_id),
           formula_settings = COALESCE(?, formula_settings),
           cashbox_posting_enabled = COALESCE(?, cashbox_posting_enabled),
           status = ?,
           reconciliation_number = ?,
           updated_at = CURRENT_TIMESTAMP,
           last_modified_date = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        reconciliation.cashier_id,
        reconciliation.accountant_id,
        reconciliation.reconciliation_date,
        reconciliation.time_range_start || null,
        reconciliation.time_range_end || null,
        reconciliation.filter_notes || null,
        reconciliation.system_sales || 0,
        reconciliation.total_receipts || 0,
        reconciliation.surplus_deficit || 0,
        formulaProfileId,
        formulaSettingsJson,
        reconciliation.cashbox_posting_enabled == null ? null : (Number(reconciliation.cashbox_posting_enabled) > 0 ? 1 : 0),
        reconciliation.status || 'completed',
        reconciliation.reconciliation_number || null,
        reconciliationId
      ]
    );

    await ipcRenderer.invoke('db-run', 'DELETE FROM bank_receipts WHERE reconciliation_id = ?', [reconciliationId]);
    await ipcRenderer.invoke('db-run', 'DELETE FROM cash_receipts WHERE reconciliation_id = ?', [reconciliationId]);
    await ipcRenderer.invoke('db-run', 'DELETE FROM postpaid_sales WHERE reconciliation_id = ?', [reconciliationId]);
    await ipcRenderer.invoke('db-run', 'DELETE FROM customer_receipts WHERE reconciliation_id = ?', [reconciliationId]);
    await ipcRenderer.invoke('db-run', 'DELETE FROM return_invoices WHERE reconciliation_id = ?', [reconciliationId]);
    await ipcRenderer.invoke('db-run', 'DELETE FROM suppliers WHERE reconciliation_id = ?', [reconciliationId]);

    for (const row of (sections.bankReceipts || [])) {
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO bank_receipts (reconciliation_id, operation_type, atm_id, amount, created_at) VALUES (?, ?, ?, ?, ?)',
        [reconciliationId, row.operation_type || 'settlement', row.atm_id || null, row.amount || 0, timestampOf(row)]
      );
    }

    for (const row of (sections.cashReceipts || [])) {
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO cash_receipts (reconciliation_id, denomination, quantity, total_amount, created_at) VALUES (?, ?, ?, ?, ?)',
        [reconciliationId, row.denomination || 0, row.quantity || 0, row.total_amount || 0, timestampOf(row)]
      );
    }

    for (const row of (sections.postpaidSales || [])) {
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO postpaid_sales (reconciliation_id, customer_name, amount, created_at) VALUES (?, ?, ?, ?)',
        [reconciliationId, row.customer_name || '', row.amount || 0, timestampOf(row)]
      );
    }

    for (const row of (sections.customerReceipts || [])) {
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO customer_receipts (reconciliation_id, customer_name, amount, payment_type, created_at) VALUES (?, ?, ?, ?, ?)',
        [reconciliationId, row.customer_name || '', row.amount || 0, row.payment_type || 'cash', timestampOf(row)]
      );
    }

    for (const row of (sections.returnInvoices || [])) {
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO return_invoices (reconciliation_id, invoice_number, amount, created_at) VALUES (?, ?, ?, ?)',
        [reconciliationId, row.invoice_number || '', row.amount || 0, timestampOf(row)]
      );
    }

    for (const row of (sections.suppliers || [])) {
      await ipcRenderer.invoke(
        'db-run',
        'INSERT INTO suppliers (reconciliation_id, supplier_name, invoice_number, amount, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [reconciliationId, row.supplier_name || '', row.invoice_number || '', row.amount || 0, row.notes || '', timestampOf(row)]
      );
    }

    return true;
  }

async function handleLogin(event) {
  event.preventDefault();

  logger.log('🔐 [LOGIN] بدء عملية تسجيل الدخول...');

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorDiv = document.getElementById('loginError');
  const fiscalYearValue = document.getElementById('fiscalYear')?.value;
  const fiscalYear = normalizeFiscalYear(fiscalYearValue);

  logger.log('📝 [LOGIN] بيانات الدخول:', { username, passwordLength: password.length });

  if (!fiscalYear) {
    logger.error('❌ [LOGIN] السنة المالية غير محددة');
    showError(errorDiv, 'يرجى اختيار السنة المالية');
    return;
  }

  if (!username || !password) {
    logger.error('❌ [LOGIN] بيانات الدخول فارغة');
    showError(errorDiv, 'يرجى إدخال اسم المستخدم وكلمة المرور');
    return;
  }

  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري التحقق...';
  submitBtn.disabled = true;

  try {
    logger.log('🔍 [LOGIN] البحث عن المستخدم في قاعدة البيانات...');

    const userRecord = await ipcRenderer.invoke(
      'db-get',
      'SELECT * FROM admins WHERE username = ? AND active = 1 LIMIT 1',
      [username]
    );

    const authResult = await ipcRenderer.invoke(
      'auth-verify-secret',
      userRecord ? userRecord.password : '',
      password
    );

    logger.log('📊 [LOGIN] نتيجة البحث:', userRecord && authResult.ok ? 'تم العثور على المستخدم' : 'لم يتم العثور على المستخدم');

    if (userRecord && authResult.ok) {
      if (authResult.needsRehash) {
        const hashedPassword = await ipcRenderer.invoke('auth-hash-secret', password);
        await ipcRenderer.invoke(
          'db-run',
          'UPDATE admins SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [hashedPassword, userRecord.id]
        );
      }

      const safeUser = { ...userRecord };
      delete safeUser.password;
      logger.log('✅ [LOGIN] تسجيل دخول ناجح للمستخدم:', safeUser.name);

      const normalizedUser = normalizeUser(safeUser);
      setCurrentUser(normalizedUser);
      setSelectedFiscalYear(fiscalYear);
      updateFiscalYearDisplay(document, fiscalYear);
      applyFiscalYearToAllDateFilters(document, fiscalYear, { force: true });
      syncFiscalYearSelectValue(document, 'fiscalYearSwitch', fiscalYear);

      document.getElementById('currentUser').textContent = normalizedUser.name;

      const currentUsernameEl = document.getElementById('currentUsername');
      if (currentUsernameEl) {
        currentUsernameEl.textContent = normalizedUser.username || normalizedUser.name || 'غير معروف';
      }

      const currentUserRoleEl = document.getElementById('currentUserRole');
      if (currentUserRoleEl) {
        currentUserRoleEl.textContent = normalizedUser.role === 'admin' ? 'مدير النظام' : 'مستخدم';
      }

      const lastLoginEl = document.getElementById('lastLogin');
      if (lastLoginEl) {
        lastLoginEl.textContent = new Date().toLocaleString('en-GB');
      }

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'flex';
      errorDiv.style.display = 'none';

      document.getElementById('loginForm').reset();

      applyPermissionsToDocument(normalizedUser);

      try {
        await loadSystemSettings();
        logger.log('⚙️ [LOGIN] تم تحميل إعدادات النظام');
      } catch (settingsError) {
        logger.warn('⚠️ [LOGIN] خطأ في تحميل إعدادات النظام:', settingsError);
      }

      await applyRuntimeSecuritySettings();

      applyPermissionsToDocument(normalizedUser);

      const defaultSection = getDefaultSectionForUser(normalizedUser) || 'reconciliation';
      if (typeof showSection === 'function') {
        showSection(defaultSection);
      }
      if (typeof highlightMenuItem === 'function') {
        highlightMenuItem(defaultSection);
      }

      await maybeRestorePendingReconciliation();

      logger.log('🎉 [LOGIN] تم تسجيل الدخول بنجاح');
    } else {
      logger.error('❌ [LOGIN] بيانات الدخول غير صحيحة');
      showError(errorDiv, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    }
  } catch (error) {
    logger.error('❌ [LOGIN] خطأ في تسجيل الدخول:', error);
    const friendly = mapDbErrorMessage(error, {
      fallback: 'تعذر إكمال عملية تسجيل الدخول.'
    });
    showError(errorDiv, `حدث خطأ أثناء تسجيل الدخول: ${friendly}`);
  } finally {
    submitBtn.innerHTML = originalBtnText;
    submitBtn.disabled = false;
  }
}

async function handleCancelNewReconciliation() {
  const currentReconciliation = getCurrentReconciliation();
  if (!currentReconciliation) {
    logger.warn('⚠️ [CANCEL] لا توجد تصفية حالية للإلغاء');
    getDialogUtils().showInfo('لا توجد تصفية حالية للإلغاء');
    return;
  }

  try {
    const isRecalled = isRecalledReconciliation(currentReconciliation);

    const message = isRecalled
      ? 'هل تريد إلغاء التعديلات على هذه التصفية؟ لن يتم حذف التصفية الأصلية.'
      : 'هل أنت متأكد من إلغاء التصفية الحالية؟ سيتم حذفها نهائياً.';

    const confirmed = await getDialogUtils().showConfirm(message, 'تأكيد الإلغاء');

    if (!confirmed) return;

    if (!isRecalled) {
      logger.log('🗑️ [CANCEL] حذف التصفية من قاعدة البيانات:', currentReconciliation.id);
      await ipcRenderer.invoke(
        'db-run',
        'DELETE FROM cashbox_vouchers WHERE source_reconciliation_id = ? AND COALESCE(is_auto_generated, 0) = 1',
        [currentReconciliation.id]
      );
      await ipcRenderer.invoke('db-run', 'DELETE FROM reconciliations WHERE id = ?', [currentReconciliation.id]);
      await ipcRenderer.invoke('db-run', 'DELETE FROM bank_receipts WHERE reconciliation_id = ?', [currentReconciliation.id]);
      await ipcRenderer.invoke('db-run', 'DELETE FROM cash_receipts WHERE reconciliation_id = ?', [currentReconciliation.id]);
      await ipcRenderer.invoke('db-run', 'DELETE FROM postpaid_sales WHERE reconciliation_id = ?', [currentReconciliation.id]);
      await ipcRenderer.invoke('db-run', 'DELETE FROM customer_receipts WHERE reconciliation_id = ?', [currentReconciliation.id]);
      await ipcRenderer.invoke('db-run', 'DELETE FROM return_invoices WHERE reconciliation_id = ?', [currentReconciliation.id]);
      await ipcRenderer.invoke('db-run', 'DELETE FROM suppliers WHERE reconciliation_id = ?', [currentReconciliation.id]);
    }

    if (isRecalled) {
      const snapshot = currentReconciliation.__snapshot || windowObj.recalledReconciliationSnapshot;
      if (snapshot) {
        logger.log('↩️ [CANCEL] استرجاع النسخة الأصلية للتصفية المستدعاة...');
        await restoreRecalledSnapshot(snapshot, currentReconciliation.id);
      }
      logger.log('🧹 [CANCEL] تنظيف واجهة المستخدم فقط للتصفية المستدعاة');
      await resetUIOnly();
      if (windowObj) {
        windowObj.recalledReconciliationSnapshot = null;
      }
    } else {
      await clearAllReconciliationData();
    }

    const infoDiv = document.getElementById('currentReconciliationInfo');
    if (infoDiv) {
      infoDiv.style.display = 'none';
    }

    resetSystemToNewReconciliationState();
    resetSaveButtonToDefaultMode();

    logger.log('✅ [CANCEL] تم إلغاء التصفية بنجاح');
    getDialogUtils().showSuccessToast('تم إلغاء التصفية بنجاح');
  } catch (error) {
    logger.error('❌ [CANCEL] خطأ في إلغاء التصفية:', error);
    getDialogUtils().showError(
      'حدث خطأ أثناء إلغاء التصفية. يرجى المحاولة مرة أخرى.',
      'خطأ في إلغاء التصفية'
    );
  }
}

async function handleLogout() {
  stopSecurityGuards();
  setCurrentUser(null);
  applyPermissionsToDocument({ role: 'admin', permissions: null });
  setCurrentReconciliation(null);
  clearActiveFormulaSettingsInDocument(document);

  setBankReceipts([]);
  setCashReceipts([]);
  setPostpaidSales([]);
  setCustomerReceipts([]);
  setReturnInvoices([]);
  setSuppliers([]);

  if (typeof resetUIOnly === 'function') {
    try {
      await resetUIOnly();
    } catch (error) {
      logger.warn('⚠️ [LOGOUT] Failed to reset UI:', error);
    }
  }

  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';

  document.querySelectorAll('form').forEach((form) => form.reset());

  document.getElementById('currentReconciliationInfo').style.display = 'none';
  resetSaveButtonToDefaultMode();

  logger.log('Logout successful');
}

  return {
    handleLogin,
    handleCancelNewReconciliation,
    handleLogout,
    applyRuntimeSecuritySettings
  };
}

module.exports = {
  createAppShellAuthHandlers
};
