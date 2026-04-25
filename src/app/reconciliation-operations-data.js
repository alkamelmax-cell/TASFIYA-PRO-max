const {
  getEffectiveFormulaSettingsFromDocument,
  calculateReconciliationSummaryByFormula,
  parseStoredFormulaSettings,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS
} = require('./reconciliation-formula');
const { getCustomTableDefinitionsFromDocument } = require('./reconciliation-custom-tables');

function createReconciliationOperationsDataHandlers(context) {
  const doc = context.document;
  const ipc = context.ipcRenderer;
  const getCurrentReconciliation = context.getCurrentReconciliation;
  const getBankReceipts = context.getBankReceipts;
  const getCashReceipts = context.getCashReceipts;
  const getPostpaidSales = context.getPostpaidSales;
  const getCustomerReceipts = context.getCustomerReceipts;
  const getReturnInvoices = context.getReturnInvoices;
  const getSuppliers = context.getSuppliers;
  const logger = context.logger || console;

  function getCollections() {
    return {
      bankReceipts: getBankReceipts(),
      cashReceipts: getCashReceipts(),
      postpaidSales: getPostpaidSales(),
      customerReceipts: getCustomerReceipts(),
      returnInvoices: getReturnInvoices(),
      suppliers: getSuppliers(),
      customTables: doc.defaultView?.reconciliationCustomTablesManager
        && typeof doc.defaultView.reconciliationCustomTablesManager.getSerializableSections === 'function'
        ? doc.defaultView.reconciliationCustomTablesManager.getSerializableSections()
        : []
    };
  }

  async function prepareReconciliationData() {
    try {
      const currentReconciliation = getCurrentReconciliation();
      const {
        bankReceipts,
        cashReceipts,
        postpaidSales,
        customerReceipts,
        returnInvoices,
        suppliers,
        customTables
      } = getCollections();

      const cashier = await ipc.invoke('db-get', 'SELECT name, cashier_number FROM cashiers WHERE id = ?', [currentReconciliation.cashier_id]);
      const accountant = await ipc.invoke('db-get', 'SELECT name FROM accountants WHERE id = ?', [currentReconciliation.accountant_id]);

      const bankTotal = bankReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
      const cashTotal = cashReceipts.reduce((sum, receipt) => sum + receipt.total_amount, 0);
      const postpaidTotal = postpaidSales.reduce((sum, sale) => sum + sale.amount, 0);
      const customerTotal = customerReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
      const returnTotal = returnInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
      const supplierTotal = suppliers.reduce((sum, supplier) => sum + supplier.amount, 0);
      const customBucketTotals = {};
      customTables.forEach((section) => {
        const tableKey = section?.definition?.table_key;
        if (!tableKey) return;
        customBucketTotals[`custom:${tableKey}`] = (section.entries || []).reduce(
          (sum, entry) => sum + (parseFloat(entry.amount) || 0),
          0
        );
      });
      const systemSales = parseFloat(doc.getElementById('systemSales').value) || 0;
      const formulaSettings = getEffectiveFormulaSettingsFromDocument(doc);
      const formulaResult = calculateReconciliationSummaryByFormula(
        {
          bankTotal,
          cashTotal,
          postpaidTotal,
          customerTotal,
          returnTotal,
          supplierTotal,
          ...customBucketTotals
        },
        systemSales,
        formulaSettings,
        getCustomTableDefinitionsFromDocument(doc)
      );
      const totalReceipts = formulaResult.totalReceipts;
      const surplusDeficit = formulaResult.surplusDeficit;

      let reconciliationNumber = currentReconciliation.reconciliation_number;
      if (!reconciliationNumber) {
        reconciliationNumber = await ipc.invoke('get-next-reconciliation-number');
        logger.log('📊 [PREPARE-DATA] تم الحصول على رقم التصفية الجديد:', reconciliationNumber);
      }

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
          time_range_start: currentReconciliation.time_range_start,
          time_range_end: currentReconciliation.time_range_end,
          filter_notes: currentReconciliation.filter_notes
        },
        bankReceipts,
        cashReceipts,
        postpaidSales,
        customerReceipts,
        returnInvoices,
        suppliers,
        customTables,
        reconciliationId: currentReconciliation.id,
        reconciliation_number: reconciliationNumber,
        cashierName: cashier.name,
        cashierNumber: cashier.cashier_number,
        accountantName: accountant.name,
        reconciliationDate: currentReconciliation.reconciliation_date,
        companyName: 'شركة المثال التجارية',
        timeRangeStart: currentReconciliation.time_range_start,
        timeRangeEnd: currentReconciliation.time_range_end,
        filterNotes: currentReconciliation.filter_notes,
        formulaSettings,
        summary: {
          bankTotal,
          cashTotal,
          postpaidTotal,
          customerTotal,
          returnTotal,
          supplierTotal,
          customTableTotals: customBucketTotals,
          totalReceipts,
          systemSales,
          surplusDeficit,
          formulaSettings
        }
      };
    } catch (error) {
      logger.error('Error preparing reconciliation data:', error);
      throw error;
    }
  }

  async function prepareReconciliationDataById(id) {
    const reconciliation = await ipc.invoke('db-get', `
        SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
        FROM reconciliations r
        JOIN cashiers c ON r.cashier_id = c.id
        JOIN accountants a ON r.accountant_id = a.id
        WHERE r.id = ?
    `, [id]);

    if (!reconciliation) {
      throw new Error(`التصفية رقم ${id} غير موجودة`);
    }

    const bankReceipts = await ipc.invoke('db-query', `
        SELECT br.*, a.name as atm_name, a.bank_name
        FROM bank_receipts br
        LEFT JOIN atms a ON br.atm_id = a.id
        WHERE br.reconciliation_id = ?
    `, [id]);

    const cashReceipts = await ipc.invoke('db-query', 'SELECT * FROM cash_receipts WHERE reconciliation_id = ?', [id]);
    const postpaidSales = await ipc.invoke('db-query', 'SELECT * FROM postpaid_sales WHERE reconciliation_id = ?', [id]);
    const customerReceipts = await ipc.invoke('db-query', 'SELECT * FROM customer_receipts WHERE reconciliation_id = ?', [id]);
    const returnInvoices = await ipc.invoke('db-query', 'SELECT * FROM return_invoices WHERE reconciliation_id = ?', [id]);
    const suppliers = await ipc.invoke('db-query', 'SELECT * FROM suppliers WHERE reconciliation_id = ?', [id]);
    const customEntryRows = await ipc.invoke(
      'db-query',
      `SELECT
         e.*,
         d.table_key,
         d.table_name,
         d.entry_template,
         d.default_sign,
         d.display_order,
         d.is_active,
         d.config_json
       FROM reconciliation_custom_entries e
       INNER JOIN reconciliation_custom_table_definitions d
         ON d.id = e.definition_id
       WHERE e.reconciliation_id = ?
       ORDER BY d.display_order ASC, e.id ASC`,
      [id]
    );

    const bankTotal = bankReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const cashTotal = cashReceipts.reduce((sum, receipt) => sum + receipt.total_amount, 0);
    const postpaidTotal = postpaidSales.reduce((sum, sale) => sum + sale.amount, 0);
    const customerTotal = customerReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const returnTotal = returnInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const customTables = [];
    const customTableTotals = {};
    const sectionMap = new Map();

    (customEntryRows || []).forEach((row) => {
      const tableKey = row.table_key;
      if (!tableKey) {
        return;
      }

      if (!sectionMap.has(tableKey)) {
        sectionMap.set(tableKey, {
          definition: {
            id: row.definition_id,
            table_key: row.table_key,
            table_name: row.table_name,
            entry_template: row.entry_template,
            default_sign: row.default_sign,
            display_order: row.display_order,
            is_active: row.is_active,
            config_json: row.config_json
          },
          entries: []
        });
      }

      const payload = (() => {
        try {
          const parsed = JSON.parse(row.entry_payload_json || '{}');
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
          return {};
        }
      })();

      sectionMap.get(tableKey).entries.push({
        id: row.id,
        reconciliation_id: row.reconciliation_id,
        definition_id: row.definition_id,
        amount: parseFloat(row.amount) || 0,
        payload,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null
      });
    });

    sectionMap.forEach((section, tableKey) => {
      customTables.push(section);
      customTableTotals[`custom:${tableKey}`] = (section.entries || []).reduce(
        (sum, entry) => sum + (parseFloat(entry.amount) || 0),
        0
      );
    });

    const formulaSettings = parseStoredFormulaSettings(
      reconciliation.formula_settings,
      customTables.map((section) => section.definition)
    ) || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;

    return {
      reconciliation: {
        id: reconciliation.id,
        reconciliation_number: reconciliation.reconciliation_number || reconciliation.id,
        cashier_name: reconciliation.cashier_name,
        cashier_number: reconciliation.cashier_number,
        accountant_name: reconciliation.accountant_name,
        reconciliation_date: reconciliation.reconciliation_date,
        system_sales: reconciliation.system_sales,
        total_receipts: reconciliation.total_receipts,
        surplus_deficit: reconciliation.surplus_deficit,
        status: reconciliation.status || 'completed',
        created_at: reconciliation.created_at,
        last_modified_date: reconciliation.last_modified_date,
        time_range_start: reconciliation.time_range_start || null,
        time_range_end: reconciliation.time_range_end || null,
        filter_notes: reconciliation.filter_notes || null
      },
      reconciliationId: reconciliation.id,
      cashierName: reconciliation.cashier_name,
      cashierNumber: reconciliation.cashier_number,
      accountantName: reconciliation.accountant_name,
      reconciliationDate: reconciliation.reconciliation_date,
      companyName: 'شركة المثال التجارية',
      bankReceipts,
      cashReceipts,
      postpaidSales,
      customerReceipts,
      returnInvoices,
      suppliers,
      customTables,
      formulaSettings,
      summary: {
        bankTotal,
        cashTotal,
        postpaidTotal,
        customerTotal,
        returnTotal,
        customTableTotals,
        totalReceipts: reconciliation.total_receipts,
        systemSales: reconciliation.system_sales,
        surplusDeficit: reconciliation.surplus_deficit,
        formulaSettings
      }
    };
  }

  return {
    prepareReconciliationData,
    prepareReconciliationDataById
  };
}

module.exports = {
  createReconciliationOperationsDataHandlers
};
