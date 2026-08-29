function createAppShellNavigationHandlers(context) {
  const document = context.document;
  const localStorageObj = context.localStorageObj || globalThis.localStorage;
  const hasSectionAccess = context.hasSectionAccess || (() => true);
  const getFallbackSection = context.getFallbackSection || (() => 'reconciliation');
  const onAccessDenied = context.onAccessDenied || (() => {});
  const loadBranches = context.loadBranches;
  const loadCashiersList = context.loadCashiersList;
  const loadCashboxes = context.loadCashboxes;
  const loadCashboxFilters = context.loadCashboxFilters;
  const loadAdminsList = context.loadAdminsList;
  const loadAccountantsList = context.loadAccountantsList;
  const loadAtmsList = context.loadAtmsList;
  const loadATMsList = context.loadATMsList;
  const loadBanksList = context.loadBanksList;
  const loadSuppliersList = context.loadSuppliersList;
  const loadCustomersList = context.loadCustomersList;
  const loadCustomerLedger = context.loadCustomerLedger;
  const loadCustomerLedgerFilters = context.loadCustomerLedgerFilters;
  const loadSupplierLedger = context.loadSupplierLedger;
  const loadSupplierLedgerFilters = context.loadSupplierLedgerFilters;
  const loadReportsList = context.loadReportsList;
  const loadReconciliationsList = context.loadReconciliationsList;
  const loadSavedReconciliations = context.loadSavedReconciliations;
  const loadSearchFilters = context.loadSearchFilters;
  const loadReportFilters = context.loadReportFilters;
  const loadAdvancedReportFilters = context.loadAdvancedReportFilters;
  const loadCashierPerformanceFilters = context.loadCashierPerformanceFilters;
  const loadAllSettings = context.loadAllSettings;
  const loadBranchesForAtms = context.loadBranchesForAtms;
  let currentSectionName = null;
  let scheduledLoaderToken = 0;

  function safeInvoke(handler, ...args) {
    if (typeof handler !== 'function') {
      return undefined;
    }
    return handler(...args);
  }

  function persistLastSection(sectionName) {
    try {
      if (localStorageObj && typeof localStorageObj.setItem === 'function') {
        localStorageObj.setItem('lastSection', sectionName);
      }
    } catch (_error) {
      // Ignore storage write issues (private mode / restricted storage).
    }
  }

  function animateSectionSwitch() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent || !mainContent.classList) {
      return;
    }

    mainContent.classList.add('section-switching');
    const clearClass = () => mainContent.classList.remove('section-switching');

    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        setTimeout(clearClass, 190);
      });
      return;
    }

    setTimeout(clearClass, 190);
  }

  function highlightMenuItem(sectionName) {
    document.querySelectorAll('.menu-item').forEach((item) => {
      item.classList.remove('active');
      if (item.dataset.section === sectionName) {
        item.classList.add('active');
      }
    });
  }

  function activateSection(sectionName) {
    document.querySelectorAll('.content-section').forEach((section) => {
      section.classList.remove('active');
      if (section.style) {
        if (typeof section.style.removeProperty === 'function') {
          section.style.removeProperty('display');
        } else {
          section.style.display = '';
        }
      }
    });

    const targetSection = document.getElementById(`${sectionName}-section`);
    if (!targetSection) {
      return false;
    }

    if (targetSection.style) {
      if (typeof targetSection.style.removeProperty === 'function') {
        targetSection.style.removeProperty('display');
      } else {
        targetSection.style.display = '';
      }
    }
    targetSection.classList.add('active');
    return true;
  }

  function resolveSectionElement(sectionName) {
    let targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
      return targetSection;
    }

    if (sectionName === 'reconciliation-requests') {
      safeInvoke(globalThis?.reconciliationRequests?.ensureSection);
      targetSection = document.getElementById(`${sectionName}-section`);
    }

    return targetSection;
  }

  function runSectionLoaders(sectionName) {
    switch (sectionName) {
      case 'branches':
        safeInvoke(loadBranches);
        break;
      case 'cashiers':
        safeInvoke(loadCashiersList);
        safeInvoke(loadBranches);
        break;
      case 'cashboxes':
        safeInvoke(loadCashboxFilters);
        safeInvoke(loadCashboxes);
        break;
      case 'admins':
        safeInvoke(loadAdminsList);
        break;
      case 'accountants':
        safeInvoke(loadAccountantsList);
        break;
      case 'atms':
        if (typeof loadATMsList === 'function') {
          loadATMsList();
        } else {
          safeInvoke(loadAtmsList);
        }
        safeInvoke(loadBranchesForAtms);
        safeInvoke(loadBranches);
        break;
      case 'banks':
        safeInvoke(loadBanksList);
        break;
      case 'suppliers':
        safeInvoke(loadSuppliersList);
        break;
      case 'customers':
        safeInvoke(loadCustomersList);
        break;
      case 'customer-ledger':
        safeInvoke(loadCustomerLedgerFilters);
        safeInvoke(loadCustomerLedger);
        break;
      case 'supplier-ledger':
        safeInvoke(loadSupplierLedgerFilters);
        safeInvoke(loadSupplierLedger);
        break;
      case 'reports':
        safeInvoke(loadReportFilters);
        safeInvoke(loadReportsList);
        break;
      case 'advanced-reports':
        safeInvoke(loadAdvancedReportFilters);
        break;
      case 'cashier-performance':
        safeInvoke(loadCashierPerformanceFilters);
        break;
      case 'saved-reconciliations':
        safeInvoke(loadSavedReconciliations);
        safeInvoke(loadSearchFilters);
        safeInvoke(loadReconciliationsList);
        break;
      case 'reconciliation-requests':
        safeInvoke(globalThis?.reconciliationRequests?.loadRequests);
        break;
      case 'settings':
        safeInvoke(loadAllSettings);
        break;
      default:
        break;
    }
  }

  function scheduleSectionLoaders(sectionName) {
    const token = ++scheduledLoaderToken;
    const flushLoaders = () => {
      if (token !== scheduledLoaderToken || currentSectionName !== sectionName) {
        return;
      }

      runSectionLoaders(sectionName);
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        Promise.resolve().then(flushLoaders);
      });
      return;
    }

    flushLoaders();
  }

  function showSection(sectionName) {
    if (!sectionName) {
      return;
    }

    if (!hasSectionAccess(sectionName)) {
      onAccessDenied(sectionName);
      const fallbackSection = getFallbackSection();
      if (fallbackSection && fallbackSection !== sectionName && hasSectionAccess(fallbackSection)) {
        showSection(fallbackSection);
      }
      return;
    }

    const targetSection = resolveSectionElement(sectionName);
    const isAlreadyActive = Boolean(
      targetSection
      && currentSectionName === sectionName
      && targetSection.classList
      && typeof targetSection.classList.contains === 'function'
      && targetSection.classList.contains('active')
    );

    if (isAlreadyActive) {
      highlightMenuItem(sectionName);
      persistLastSection(sectionName);
      return;
    }

    highlightMenuItem(sectionName);

    if (!activateSection(sectionName)) {
      return;
    }

    currentSectionName = sectionName;
    animateSectionSwitch();
    scheduleSectionLoaders(sectionName);
    persistLastSection(sectionName);
  }

  function handleNavigation(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const sectionName = event?.currentTarget?.getAttribute('data-section');
    if (!sectionName) {
      return;
    }

    showSection(sectionName);
  }

  return {
    showSection,
    highlightMenuItem,
    handleNavigation
  };
}

module.exports = {
  createAppShellNavigationHandlers
};
