function createReconciliationDataEntryShared(context) {
  const getCurrentReconciliation = context.getCurrentReconciliation;
  const DialogUtils = context.DialogUtils;
  const ipcRenderer = context.ipcRenderer;
  const logger = context.logger || console;

  function ensureCurrentReconciliation() {
    const currentReconciliation = getCurrentReconciliation();
    if (!currentReconciliation) {
      DialogUtils.showValidationError('يرجى إنشاء تصفية جديدة أولاً');
      return null;
    }
    return currentReconciliation;
  }

  function getArraySafe(getter) {
    const value = getter();
    return Array.isArray(value) ? value : [];
  }

  function setArray(setter, getter, nextItems) {
    setter(Array.isArray(nextItems) ? nextItems : getArraySafe(getter));
  }

  function normalizeOptionalBranchId(branchId) {
    const numericBranchId = Number(branchId);
    return Number.isFinite(numericBranchId) && numericBranchId > 0 ? numericBranchId : null;
  }

  async function resolveReconciliationBranchId(currentReconciliation = null) {
    const reconciliation = currentReconciliation || getCurrentReconciliation();
    if (!reconciliation) return null;

    const directBranchId = normalizeOptionalBranchId(reconciliation.branch_id);
    if (directBranchId) return directBranchId;

    const cashierId = Number(reconciliation.cashier_id);
    if (!Number.isFinite(cashierId) || cashierId <= 0) {
      return null;
    }

    try {
      const cashier = await ipcRenderer.invoke(
        'db-get',
        'SELECT branch_id FROM cashiers WHERE id = ?',
        [cashierId]
      );
      return normalizeOptionalBranchId(cashier?.branch_id);
    } catch (error) {
      logger.error('Error resolving reconciliation branch id:', error);
      return null;
    }
  }

  async function isExistingCustomer(customerName) {
    const normalizedCustomerName = String(customerName == null ? '' : customerName);
    if (!normalizedCustomerName.trim()) return false;

    try {
      const postpaidCustomer = await ipcRenderer.invoke(
        'db-get',
        'SELECT COUNT(*) as count FROM postpaid_sales WHERE customer_name = ?',
        [normalizedCustomerName]
      );

      const receiptCustomer = await ipcRenderer.invoke(
        'db-get',
        'SELECT COUNT(*) as count FROM customer_receipts WHERE customer_name = ?',
        [normalizedCustomerName]
      );

      return (postpaidCustomer.count > 0 || receiptCustomer.count > 0);
    } catch (error) {
      logger.error('Error checking customer existence:', error);
      return false;
    }
  }

  async function isExistingCustomerInBranch(customerName, branchId) {
    const normalizedCustomerName = String(customerName == null ? '' : customerName);
    if (!normalizedCustomerName.trim()) return false;

    const normalizedBranchId = normalizeOptionalBranchId(branchId);
    if (!normalizedBranchId) {
      return isExistingCustomer(normalizedCustomerName);
    }

    try {
      const result = await ipcRenderer.invoke(
        'db-get',
        `
          SELECT
            (CASE WHEN EXISTS (
              SELECT 1
              FROM postpaid_sales ps
              JOIN reconciliations r ON r.id = ps.reconciliation_id
              LEFT JOIN cashiers c ON c.id = r.cashier_id
              WHERE ps.customer_name = ?
                AND COALESCE(c.branch_id, 0) = ?
            ) THEN 1 ELSE 0 END)
            +
            (CASE WHEN EXISTS (
              SELECT 1
              FROM customer_receipts cr
              JOIN reconciliations r ON r.id = cr.reconciliation_id
              LEFT JOIN cashiers c ON c.id = r.cashier_id
              WHERE cr.customer_name = ?
                AND COALESCE(c.branch_id, 0) = ?
            ) THEN 1 ELSE 0 END) AS total
        `,
        [normalizedCustomerName, normalizedBranchId, normalizedCustomerName, normalizedBranchId]
      );

      return Number(result?.total || 0) > 0;
    } catch (error) {
      logger.error('Error checking customer existence in branch:', error);
      return isExistingCustomer(normalizedCustomerName);
    }
  }

  async function hasManualSuppliersTable() {
    try {
      const row = await ipcRenderer.invoke(
        'db-get',
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'manual_supplier_transactions'"
      );
      return !!(row && row.name);
    } catch (_error) {
      return false;
    }
  }

  async function manualSuppliersHasBranchColumn() {
    try {
      const columns = await ipcRenderer.invoke('db-query', 'PRAGMA table_info(manual_supplier_transactions)');
      return Array.isArray(columns) && columns.some((column) => String(column?.name || '') === 'branch_id');
    } catch (_error) {
      return false;
    }
  }

  async function isExistingSupplier(supplierName) {
    const normalizedSupplierName = String(supplierName == null ? '' : supplierName);
    if (!normalizedSupplierName.trim()) return false;

    try {
      const supplierRow = await ipcRenderer.invoke(
        'db-get',
        'SELECT COUNT(*) as count FROM suppliers WHERE supplier_name = ?',
        [normalizedSupplierName]
      );

      let manualCount = 0;
      if (await hasManualSuppliersTable()) {
        const manualRow = await ipcRenderer.invoke(
          'db-get',
          'SELECT COUNT(*) as count FROM manual_supplier_transactions WHERE supplier_name = ?',
          [normalizedSupplierName]
        );
        manualCount = Number(manualRow?.count || 0);
      }

      return (Number(supplierRow?.count || 0) + manualCount) > 0;
    } catch (error) {
      logger.error('Error checking supplier existence:', error);
      return false;
    }
  }

  async function isExistingSupplierInBranch(supplierName, branchId) {
    const normalizedSupplierName = String(supplierName == null ? '' : supplierName);
    if (!normalizedSupplierName.trim()) return false;

    const normalizedBranchId = normalizeOptionalBranchId(branchId);
    if (!normalizedBranchId) {
      return isExistingSupplier(normalizedSupplierName);
    }

    try {
      const result = await ipcRenderer.invoke(
        'db-get',
        `
          SELECT CASE WHEN EXISTS (
            SELECT 1
            FROM suppliers sp
            JOIN reconciliations r ON r.id = sp.reconciliation_id
            LEFT JOIN cashiers c ON c.id = r.cashier_id
            WHERE sp.supplier_name = ?
              AND COALESCE(c.branch_id, 0) = ?
          ) THEN 1 ELSE 0 END AS total
        `,
        [normalizedSupplierName, normalizedBranchId]
      );

      if (Number(result?.total || 0) > 0) {
        return true;
      }

      const manualTableExists = await hasManualSuppliersTable();
      if (!manualTableExists) {
        return false;
      }

      const hasBranchColumn = await manualSuppliersHasBranchColumn();
      if (!hasBranchColumn) {
        return false;
      }

      const manualResult = await ipcRenderer.invoke(
        'db-get',
        `
          SELECT CASE WHEN EXISTS (
            SELECT 1
            FROM manual_supplier_transactions
            WHERE supplier_name = ?
              AND COALESCE(branch_id, 0) = ?
          ) THEN 1 ELSE 0 END AS total
        `,
        [normalizedSupplierName, normalizedBranchId]
      );

      return Number(manualResult?.total || 0) > 0;
    } catch (error) {
      logger.error('Error checking supplier existence in branch:', error);
      return isExistingSupplier(normalizedSupplierName);
    }
  }

  return {
    ensureCurrentReconciliation,
    getArraySafe,
    setArray,
    resolveReconciliationBranchId,
    isExistingCustomer,
    isExistingCustomerInBranch,
    isExistingSupplier,
    isExistingSupplierInBranch
  };
}

module.exports = {
  createReconciliationDataEntryShared
};
