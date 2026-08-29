const {
  parseStoredFormulaSettings,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS
} = require('./reconciliation-formula');
const { mapDbErrorMessage } = require('./db-error-messages');

function createSavedReconciliationPrintHandlers(deps) {
  const ipc = deps.ipcRenderer;
  const logger = deps.logger || console;

  async function printSavedReconciliation(reconciliationId) {
    logger.log('🖨️ [NEW-PRINT] بدء نظام الطباعة الجديد للتصفية:', reconciliationId);

    try {
      const reconciliationData = await loadReconciliationForPrint(reconciliationId);
      if (!reconciliationData) {
        deps.getDialogUtils().showError('فشل في تحميل بيانات التصفية', 'خطأ في البيانات');
        return;
      }

      deps.setCurrentPrintReconciliation(reconciliationData);
      deps.onShowPrintSectionSelectionDialog();
    } catch (error) {
      logger.error('❌ [NEW-PRINT] خطأ في تحميل بيانات الطباعة:', error);
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر تحميل بيانات التصفية للطباعة.'
      });
      deps.getDialogUtils().showError(`خطأ في تحميل البيانات: ${friendly}`, 'خطأ في النظام');
    }
  }

  async function loadReconciliationForPrint(reconciliationId) {
    logger.log('📊 [NEW-PRINT] تحميل بيانات التصفية للطباعة:', reconciliationId);

    try {
      const reconciliation = await ipc.invoke('db-get', `
            SELECT r.*, c.name as cashier_name, c.cashier_number, a.name as accountant_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            WHERE r.id = ?
        `, [reconciliationId]);

      if (!reconciliation) {
        throw new Error('التصفية غير موجودة');
      }

      const formulaSettings = parseStoredFormulaSettings(reconciliation.formula_settings)
        || DEFAULT_RECONCILIATION_FORMULA_SETTINGS;
      reconciliation.formula_settings = formulaSettings;

      const [bankReceipts, cashReceipts, postpaidSales, customerReceipts, returnInvoices, suppliers] = await Promise.all([
        ipc.invoke('db-query', `
                SELECT br.*, atm.name as atm_name, atm.bank_name
                FROM bank_receipts br
                LEFT JOIN atms atm ON br.atm_id = atm.id
                WHERE br.reconciliation_id = ?
                ORDER BY br.id
            `, [reconciliationId]),
        ipc.invoke('db-query', 'SELECT * FROM cash_receipts WHERE reconciliation_id = ? ORDER BY id', [reconciliationId]),
        ipc.invoke('db-query', 'SELECT * FROM postpaid_sales WHERE reconciliation_id = ? ORDER BY id', [reconciliationId]),
        ipc.invoke('db-query', 'SELECT * FROM customer_receipts WHERE reconciliation_id = ? ORDER BY id', [reconciliationId]),
        ipc.invoke('db-query', 'SELECT * FROM return_invoices WHERE reconciliation_id = ? ORDER BY id', [reconciliationId]),
        ipc.invoke('db-query', 'SELECT * FROM suppliers WHERE reconciliation_id = ? ORDER BY id', [reconciliationId])
      ]);

      logger.log('✅ [NEW-PRINT] تم تحميل البيانات بنجاح:', {
        reconciliation: reconciliation.id,
        bankReceipts: bankReceipts.length,
        cashReceipts: cashReceipts.length,
        postpaidSales: postpaidSales.length,
        customerReceipts: customerReceipts.length,
        returnInvoices: returnInvoices.length,
        suppliers: suppliers.length
      });

      if (bankReceipts.length > 0) {
        logger.log('📊 [NEW-PRINT] عينة من المقبوضات البنكية:', bankReceipts[0]);
      }
      if (cashReceipts.length > 0) {
        logger.log('📊 [NEW-PRINT] عينة من المقبوضات النقدية:', cashReceipts[0]);
      }
      if (postpaidSales.length > 0) {
        logger.log('📊 [NEW-PRINT] عينة من المبيعات الآجلة:', postpaidSales[0]);
      }

      return {
        reconciliation,
        formulaSettings,
        bankReceipts,
        cashReceipts,
        postpaidSales,
        customerReceipts,
        returnInvoices,
        suppliers
      };
    } catch (error) {
      logger.error('❌ [NEW-PRINT] خطأ في تحميل البيانات:', error);
      throw error;
    }
  }

  return {
    printSavedReconciliation,
    loadReconciliationForPrint
  };
}

module.exports = {
  createSavedReconciliationPrintHandlers
};
