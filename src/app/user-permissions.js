const SECTION_RULES = [
  { key: 'section:reconciliation', section: 'reconciliation', label: 'التصفية الجديدة' },
  { key: 'section:branches', section: 'branches', label: 'إدارة الفروع' },
  { key: 'section:cashiers', section: 'cashiers', label: 'إدارة الكاشير' },
  { key: 'section:cashboxes', section: 'cashboxes', label: 'الصناديق' },
  { key: 'section:admins', section: 'admins', label: 'إدارة المسؤولين' },
  { key: 'section:accountants', section: 'accountants', label: 'إدارة المحاسبين' },
  { key: 'section:atms', section: 'atms', label: 'إدارة الآلات' },
  { key: 'section:saved-reconciliations', section: 'saved-reconciliations', label: 'التصفيات المحفوظة' },
  { key: 'section:reconciliation-requests', section: 'reconciliation-requests', label: 'طلبات التصفية' },
  { key: 'section:reports', section: 'reports', label: 'تقارير التصفيات' },
  { key: 'section:advanced-reports', section: 'advanced-reports', label: 'تقارير متقدمة' },
  { key: 'section:cashier-performance', section: 'cashier-performance', label: 'مقارنة أداء الكاشير' },
  { key: 'section:customer-ledger', section: 'customer-ledger', label: 'دفتر العملاء' },
  { key: 'section:supplier-ledger', section: 'supplier-ledger', label: 'دفتر الموردين' },
  { key: 'section:settings', section: 'settings', label: 'الإعدادات' }
];

const SETTINGS_TAB_RULES = [
  { key: 'settings-tab:general', tabButtonId: 'general-tab', tabPaneId: 'general-settings', label: 'الإعدادات العامة' },
  { key: 'settings-tab:print', tabButtonId: 'print-tab', tabPaneId: 'print-settings', label: 'إعدادات الطباعة' },
  { key: 'settings-tab:thermal-printer', tabButtonId: 'thermal-printer-tab', tabPaneId: 'thermal-printer-settings', label: 'الطابعة الحرارية' },
  { key: 'settings-tab:database', tabButtonId: 'database-tab', tabPaneId: 'database-settings', label: 'قاعدة البيانات' },
  { key: 'settings-tab:users', tabButtonId: 'users-tab', tabPaneId: 'users-settings', label: 'المستخدمين' },
  { key: 'settings-tab:reports', tabButtonId: 'reports-tab', tabPaneId: 'reports-settings', label: 'التقارير' },
  { key: 'settings-tab:reconciliation-formula', tabButtonId: 'reconciliation-formula-tab', tabPaneId: 'reconciliation-formula-settings', label: 'معادلة التصفية' },
  { key: 'settings-tab:system-info', tabButtonId: 'system-tab', tabPaneId: 'system-info', label: 'معلومات النظام' }
];

const OPERATION_RULES = [
  { key: 'operation:save-reconciliation', label: 'حفظ التصفية', selectors: ['#saveReconciliationBtn'] },
  { key: 'operation:print-reconciliation', label: 'طباعة/معاينة التصفية', selectors: ['#printNewReconciliationBtn', '#quickPrintBtn', '#thermalPrinterPreviewBtn', '#thermalPrinterPrintBtn'] },
  { key: 'operation:manage-branches', label: 'إدارة الفروع (إضافة/تعديل)', selectors: ['#branchForm button[type="submit"]'] },
  { key: 'operation:manage-cashiers', label: 'إدارة الكاشير (إضافة/تعديل)', selectors: ['#addCashierForm button[type="submit"]'] },
  { key: 'operation:manage-admins', label: 'إدارة المسؤولين (إضافة/تعديل)', selectors: ['#addAdminForm button[type="submit"]'] },
  { key: 'operation:manage-accountants', label: 'إدارة المحاسبين (إضافة/تعديل)', selectors: ['#addAccountantForm button[type="submit"]'] },
  { key: 'operation:manage-atms', label: 'إدارة الآلات (إضافة/تعديل)', selectors: ['#addAtmForm button[type="submit"]'] },
  { key: 'operation:manage-backup', label: 'النسخ الاحتياطي والاستعادة', selectors: ['#createBackupBtn', '#restoreBackupBtn', '#exportDataBtn', '#selectBackupLocation'] },
  { key: 'operation:manage-db-maintenance', label: 'صيانة قاعدة البيانات', selectors: ['#optimizeDbBtn', '#repairDbBtn', '#analyzeDbBtn', '#saveDatabaseSettings', '#archiveFiscalYearBtn', '#archiveYearSelect', '#archiveBrowseYearSelect', '#loadArchivedReconciliationsBtn', '#archiveBrowseSearchNumber', '#archiveBrowseSearchDate', '#archiveBrowseSearchCashier', '#archiveBrowseSearchBtn', '#archiveBrowseClearBtn', '#archiveBrowseResetSortBtn', '#restoreArchivedYearBtn', '.archived-rec-actions-toggle', '.archived-rec-view-btn', '.archived-rec-a4-btn', '.archived-rec-pdf-btn', '.archived-rec-thermal-preview-btn', '.archived-rec-thermal-print-btn', '.archived-rec-thermal-summary-btn', '#archivedRecPrevPage', '#archivedRecNextPage'] },
  { key: 'operation:manage-user-settings', label: 'حفظ إعدادات المستخدمين', selectors: ['#saveUserSettings'] },
  { key: 'operation:change-password', label: 'تغيير كلمة المرور', selectors: ['#changePasswordBtn'] }
];

// Backward-compatibility map for newly introduced permissions.
// This keeps older explicit permission sets from hiding brand-new tabs unexpectedly.
const COMPATIBILITY_PERMISSION_RULES = Object.freeze([
  {
    key: 'section:cashboxes',
    fallbackKeys: ['section:supplier-ledger']
  },
  {
    key: 'settings-tab:reconciliation-formula',
    fallbackKeys: ['settings-tab:reports', 'settings-tab:general']
  }
]);

const PERMISSION_GROUPS = Object.freeze({
  sections: SECTION_RULES,
  settingsTabs: SETTINGS_TAB_RULES,
  operations: OPERATION_RULES
});

const ALL_PERMISSION_KEYS = Object.freeze([
  ...SECTION_RULES.map((rule) => rule.key),
  ...SETTINGS_TAB_RULES.map((rule) => rule.key),
  ...OPERATION_RULES.map((rule) => rule.key)
]);

function uniqStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0))];
}

function parseStoredPermissions(rawPermissions) {
  if (Array.isArray(rawPermissions)) {
    return { permissions: uniqStrings(rawPermissions), explicit: true };
  }

  if (typeof rawPermissions !== 'string') {
    return { permissions: [], explicit: false };
  }

  const trimmed = rawPermissions.trim();
  if (!trimmed) {
    return { permissions: [], explicit: false };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return { permissions: uniqStrings(parsed), explicit: true };
    }
  } catch (_error) {
    const csv = trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    if (csv.length > 0) {
      return { permissions: uniqStrings(csv), explicit: true };
    }
  }

  return { permissions: [], explicit: true };
}

function matchesPermission(grantedPermission, requestedPermission) {
  if (!grantedPermission || !requestedPermission) {
    return false;
  }

  if (grantedPermission === '*') {
    return true;
  }

  if (grantedPermission === requestedPermission) {
    return true;
  }

  if (grantedPermission.endsWith(':*')) {
    const prefix = grantedPermission.slice(0, -1);
    return requestedPermission.startsWith(prefix);
  }

  return false;
}

function buildPermissionProfile(user) {
  const parsed = parseStoredPermissions(user ? user.permissions : null);
  const granted = parsed.permissions;
  const hasWildcard = granted.some((permission) => permission === '*' || permission.endsWith(':*'));
  const isLegacyAdmin = !!(user && user.role === 'admin' && !parsed.explicit);
  const fullAccess = isLegacyAdmin || hasWildcard;

  return {
    explicit: parsed.explicit,
    granted,
    fullAccess
  };
}

function hasPermission(user, permissionKey) {
  const profile = buildPermissionProfile(user);
  if (profile.fullAccess) {
    return true;
  }

  const compatibilityRule = COMPATIBILITY_PERMISSION_RULES.find((rule) => rule.key === permissionKey);
  if (compatibilityRule && profile.explicit) {
    const hasFallbackAccess = compatibilityRule.fallbackKeys.some((fallbackKey) => {
      return profile.granted.some((permission) => matchesPermission(permission, fallbackKey));
    });

    if (hasFallbackAccess) {
      return true;
    }
  }

  return profile.granted.some((permission) => matchesPermission(permission, permissionKey));
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') {
    return user;
  }

  const profile = buildPermissionProfile(user);

  return {
    ...user,
    permissions: profile.explicit ? profile.granted : null,
    _permissionsMeta: profile
  };
}

function serializePermissions(permissionList) {
  const allowed = new Set(ALL_PERMISSION_KEYS);
  const clean = uniqStrings(permissionList).filter((permission) => {
    if (permission === '*' || permission.endsWith(':*')) {
      return true;
    }
    return allowed.has(permission);
  });

  return JSON.stringify(clean);
}

function getFirstAllowedSection(user, fallback = 'reconciliation') {
  const firstAllowed = SECTION_RULES.find((rule) => hasPermission(user, rule.key));
  if (firstAllowed) {
    return firstAllowed.section;
  }
  return fallback;
}

function hasSectionAccess(user, sectionName) {
  const rule = SECTION_RULES.find((entry) => entry.section === sectionName);
  if (!rule) {
    return true;
  }
  return hasPermission(user, rule.key);
}

function setNodeVisibility(node, isVisible) {
  if (!node) return;

  if (isVisible) {
    node.style.removeProperty('display');
  } else {
    node.style.display = 'none';
  }
}

function setControlPermissionState(control, isAllowed) {
  if (!control) return;

  if (control.dataset.permissionOriginalDisabled == null && typeof control.disabled === 'boolean') {
    control.dataset.permissionOriginalDisabled = control.disabled ? '1' : '0';
  }

  if (isAllowed) {
    control.classList.remove('permission-locked');
    control.removeAttribute('title');
    if (typeof control.disabled === 'boolean') {
      control.disabled = control.dataset.permissionOriginalDisabled === '1';
    }
    return;
  }

  control.classList.add('permission-locked');
  if (!control.getAttribute('title')) {
    control.setAttribute('title', 'لا تملك صلاحية تنفيذ هذه العملية');
  }
  if (typeof control.disabled === 'boolean') {
    control.disabled = true;
  }
}

function ensureAllowedSettingsTabIsActive(document) {
  const tabButtons = SETTINGS_TAB_RULES
    .map((rule) => document.getElementById(rule.tabButtonId))
    .filter((button) => button && button.style.display !== 'none');

  if (tabButtons.length === 0) {
    return;
  }

  const activeButton = tabButtons.find((button) => button.classList.contains('active'));
  if (activeButton) {
    return;
  }

  const firstButton = tabButtons[0];
  firstButton.classList.add('active');
  firstButton.setAttribute('aria-selected', 'true');

  const targetSelector = firstButton.getAttribute('data-bs-target');
  if (!targetSelector || !targetSelector.startsWith('#')) {
    return;
  }

  const targetPane = document.getElementById(targetSelector.slice(1));
  if (!targetPane) {
    return;
  }

  document.querySelectorAll('#settingsTabContent .tab-pane').forEach((pane) => {
    pane.classList.remove('active', 'show');
  });

  targetPane.classList.add('active', 'show');
}

function applyPermissionsToDocument(document, user) {
  if (!document) {
    return;
  }

  SECTION_RULES.forEach((rule) => {
    const allowed = hasPermission(user, rule.key);
    const menuLink = document.querySelector(`[data-section="${rule.section}"]`);
    if (menuLink) {
      setNodeVisibility(menuLink.closest('li') || menuLink, allowed);
      if (!allowed) {
        menuLink.classList.remove('active');
      }
    }

    const sectionEl = document.getElementById(`${rule.section}-section`);
    if (sectionEl && !allowed) {
      sectionEl.classList.remove('active');
    }
  });

  SETTINGS_TAB_RULES.forEach((rule) => {
    const allowed = hasPermission(user, rule.key);
    const tabButton = document.getElementById(rule.tabButtonId);
    const tabPane = document.getElementById(rule.tabPaneId);

    if (tabButton) {
      setNodeVisibility(tabButton.closest('.nav-item') || tabButton, allowed);
      if (!allowed) {
        tabButton.classList.remove('active');
        tabButton.setAttribute('aria-selected', 'false');
      }
    }

    if (tabPane && !allowed) {
      tabPane.classList.remove('active', 'show');
    }
  });

  ensureAllowedSettingsTabIsActive(document);

  OPERATION_RULES.forEach((rule) => {
    const allowed = hasPermission(user, rule.key);
    rule.selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((control) => {
        setControlPermissionState(control, allowed);
      });
    });
  });
}

module.exports = {
  SECTION_RULES,
  SETTINGS_TAB_RULES,
  OPERATION_RULES,
  PERMISSION_GROUPS,
  ALL_PERMISSION_KEYS,
  parseStoredPermissions,
  normalizeUser,
  serializePermissions,
  hasPermission,
  hasSectionAccess,
  getFirstAllowedSection,
  applyPermissionsToDocument
};
