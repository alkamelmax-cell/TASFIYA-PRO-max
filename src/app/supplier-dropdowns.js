function createSupplierDropdownLoader(deps) {
  const ipc = deps.ipcRenderer;
  const doc = deps.document;
  const logger = deps.logger || console;
  let suppliersList = [];

  async function ensureManualSuppliersTable() {
    try {
      await ipc.invoke(
        'db-run',
        `CREATE TABLE IF NOT EXISTS manual_supplier_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          supplier_name TEXT NOT NULL,
          transaction_type TEXT NOT NULL DEFAULT 'payment',
          amount DECIMAL(10,2) NOT NULL,
          reference_no TEXT,
          notes TEXT,
          branch_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME
        )`
      );
    } catch (error) {
      logger.warn('⚠️ [SUPPLIERS] تعذر التأكد من جدول الحركات اليدوية للموردين:', error);
    }
  }

  async function hasManualSuppliersTable() {
    try {
      const row = await ipc.invoke(
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
      const columns = await ipc.invoke('db-query', 'PRAGMA table_info(manual_supplier_transactions)');
      return Array.isArray(columns) && columns.some((column) => String(column?.name || '') === 'branch_id');
    } catch (_error) {
      return false;
    }
  }

  return async function loadSuppliersForDropdowns(branchId = '') {
    try {
      const normalizedBranchId = String(branchId || '').trim();
      const hasBranchFilter = normalizedBranchId.length > 0;

      logger.log('📋 [SUPPLIERS] جاري تحميل قائمة الموردين...');

      await ensureManualSuppliersTable();

      const manualTableExists = await hasManualSuppliersTable();
      const manualHasBranchId = manualTableExists ? await manualSuppliersHasBranchColumn() : false;
      const manualUnionSql = manualTableExists
        ? `
          UNION
          SELECT
            mst.supplier_name AS supplier_name,
            ${manualHasBranchId ? 'mst.branch_id' : 'NULL'} AS branch_id
          FROM manual_supplier_transactions mst
        `
        : '';

      const query = `
        SELECT DISTINCT s.supplier_name
        FROM (
          SELECT sp.supplier_name AS supplier_name, ch.branch_id AS branch_id
          FROM suppliers sp
          JOIN reconciliations r ON sp.reconciliation_id = r.id
          JOIN cashiers ch ON r.cashier_id = ch.id

          ${manualUnionSql}
        ) s
        WHERE s.supplier_name IS NOT NULL
          AND TRIM(s.supplier_name) != ''
          ${hasBranchFilter ? 'AND s.branch_id = ?' : 'AND 1 = 0'}
        ORDER BY s.supplier_name
      `;

      const suppliers = await ipc.invoke('db-query', query, hasBranchFilter ? [normalizedBranchId] : []);
      suppliersList = (suppliers || []).map((supplier) => supplier.supplier_name);

      const mainDatalist = doc.getElementById('supplierMainList');
      const editDatalist = doc.getElementById('supplierEditList');

      if (mainDatalist) {
        mainDatalist.innerHTML = '';
      }
      if (editDatalist) {
        editDatalist.innerHTML = '';
      }

      suppliersList.forEach((supplierName) => {
        if (mainDatalist) {
          const mainOption = doc.createElement('option');
          mainOption.value = supplierName;
          mainDatalist.appendChild(mainOption);
        }

        if (editDatalist) {
          const editOption = doc.createElement('option');
          editOption.value = supplierName;
          editDatalist.appendChild(editOption);
        }
      });

      logger.log(`✅ [SUPPLIERS] تم تحميل ${suppliersList.length} مورد للفرع ${normalizedBranchId || 'غير محدد'}`);
    } catch (error) {
      logger.error('❌ [SUPPLIERS] خطأ في تحميل الموردين:', error);
    }
  };
}

module.exports = {
  createSupplierDropdownLoader
};
