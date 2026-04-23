function createAppApi(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const getCurrentReconciliation = deps.getCurrentReconciliation;
  const setCurrentReconciliation = deps.setCurrentReconciliation;
  const getBankReceipts = deps.getBankReceipts;
  const setBankReceipts = deps.setBankReceipts;
  const getCashReceipts = deps.getCashReceipts;
  const setCashReceipts = deps.setCashReceipts;
  const getPostpaidSales = deps.getPostpaidSales;
  const setPostpaidSales = deps.setPostpaidSales;
  const getCustomerReceipts = deps.getCustomerReceipts;
  const setCustomerReceipts = deps.setCustomerReceipts;
  const getReturnInvoices = deps.getReturnInvoices;
  const setReturnInvoices = deps.setReturnInvoices;
  const getSuppliers = deps.getSuppliers;
  const setSuppliers = deps.setSuppliers;
  const updateBankReceiptsTable = deps.updateBankReceiptsTable;
  const updateCashReceiptsTable = deps.updateCashReceiptsTable;
  const updatePostpaidSalesTable = deps.updatePostpaidSalesTable;
  const updateCustomerReceiptsTable = deps.updateCustomerReceiptsTable;
  const updateReturnInvoicesTable = deps.updateReturnInvoicesTable;
  const updateSuppliersTable = deps.updateSuppliersTable;
  const logger = deps.logger || console;
  const updateSummary = typeof deps.updateSummary === 'function'
    ? deps.updateSummary
    : () => {};
  const EventCtor = deps.EventCtor || Event;

  if (typeof deps.updateSummary !== 'function') {
    logger.warn('⚠️ [APP-API] updateSummary dependency is missing. Using no-op fallback.');
  }

  return {
    navigateToNewReconciliation: () => {
      const menuItem = doc.querySelector('.menu-item[data-section="reconciliation"]');
      if (menuItem) {
        menuItem.click();
      }
    },

    resetReconciliationForm: async () => {
      setBankReceipts([]);
      setCashReceipts([]);
      setPostpaidSales([]);
      setCustomerReceipts([]);
      setReturnInvoices([]);
      setSuppliers([]);

      updateBankReceiptsTable();
      updateCashReceiptsTable();
      updatePostpaidSalesTable();
      updateCustomerReceiptsTable();
      updateReturnInvoicesTable();
      updateSuppliersTable();
      updateSummary();

      const systemSalesEl = doc.getElementById('systemSales');
      if (systemSalesEl) {
        systemSalesEl.value = '';
      }

      const filterNotesEl = doc.getElementById('filterNotes');
      if (filterNotesEl) {
        filterNotesEl.value = '';
      }

      const currentReconciliation = getCurrentReconciliation();
      if (currentReconciliation && !currentReconciliation.id) {
        setCurrentReconciliation(null);
      }
    },

    setSystemSales: (amount) => {
      const el = doc.getElementById('systemSales');
      if (el) {
        el.value = amount;
        el.dispatchEvent(new EventCtor('input'));
      }
    },

    setNotes: (notes) => {
      const el = doc.getElementById('filterNotes');
      if (el) {
        el.value = notes;
      }
    },

    addCashReceipt: async (val, qty) => {
      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation || !currentReconciliation.id) {
        logger.warn('⚠️ No active reconciliation to add cash receipt to');
        return;
      }

      const total = val * qty;

      try {
        const result = await ipc.invoke(
          'db-run',
          'INSERT INTO cash_receipts (reconciliation_id, denomination, quantity, total_amount) VALUES (?, ?, ?, ?)',
          [currentReconciliation.id, val, qty, total]
        );

        getCashReceipts().push({
          id: result.lastInsertRowid,
          reconciliation_id: currentReconciliation.id,
          denomination: val,
          quantity: qty,
          total_amount: total
        });

        updateCashReceiptsTable();
        updateSummary();
        logger.log('✅ Cash receipt saved to database');
      } catch (error) {
        logger.error('❌ Error saving cash receipt:', error);
      }
    },

    addBankReceipt: (amount) => {
      getBankReceipts().push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        operation_type: 'settlement',
        atm_name: 'من طلب التصفية',
        bank_name: '-',
        amount: parseFloat(amount)
      });
      updateBankReceiptsTable();
    },

    updateSummary: () => {
      if (typeof updateSummary === 'function') {
        updateSummary();
      }
    },

    addPostpaidSale: async (customerName, amount) => {
      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation || !currentReconciliation.id) return;
      try {
        const result = await ipc.invoke(
          'db-run',
          'INSERT INTO postpaid_sales (reconciliation_id, customer_name, amount) VALUES (?, ?, ?)',
          [currentReconciliation.id, customerName, parseFloat(amount)]
        );
        getPostpaidSales().push({
          id: result.lastInsertRowid,
          reconciliation_id: currentReconciliation.id,
          customer_name: customerName,
          amount: parseFloat(amount)
        });
        updatePostpaidSalesTable();
        updateSummary();
      } catch (error) {
        logger.error('❌ Error saving postpaid sale:', error);
      }
    },

    addCustomerReceipt: async (customerName, amount, paymentType, notes) => {
      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation || !currentReconciliation.id) return;
      try {
        const result = await ipc.invoke(
          'db-run',
          'INSERT INTO customer_receipts (reconciliation_id, customer_name, amount, payment_type, notes) VALUES (?, ?, ?, ?, ?)',
          [currentReconciliation.id, customerName, parseFloat(amount), paymentType || 'cash', notes || '']
        );
        getCustomerReceipts().push({
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
        logger.error('❌ Error saving customer receipt:', error);
      }
    },

    addReturnInvoice: async (invoiceNo, amount, notes) => {
      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation || !currentReconciliation.id) return;
      try {
        const result = await ipc.invoke(
          'db-run',
          'INSERT INTO return_invoices (reconciliation_id, invoice_number, amount, notes) VALUES (?, ?, ?, ?)',
          [currentReconciliation.id, invoiceNo, parseFloat(amount), notes || '']
        );
        getReturnInvoices().push({
          id: result.lastInsertRowid,
          reconciliation_id: currentReconciliation.id,
          invoice_number: invoiceNo,
          amount: parseFloat(amount),
          notes: notes || ''
        });
        updateReturnInvoicesTable();
        updateSummary();
        logger.log('✅ Return invoice saved to database');
      } catch (error) {
        logger.error('❌ Error saving return invoice:', error);
      }
    },

    addSupplier: async (supplierName, invoiceNo, amount, vat, notes) => {
      void vat;
      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation || !currentReconciliation.id) return;
      try {
        const result = await ipc.invoke(
          'db-run',
          'INSERT INTO suppliers (reconciliation_id, supplier_name, invoice_number, amount, notes) VALUES (?, ?, ?, ?, ?)',
          [currentReconciliation.id, supplierName, invoiceNo || '', parseFloat(amount), notes || '']
        );
        getSuppliers().push({
          id: result.lastInsertRowid,
          reconciliation_id: currentReconciliation.id,
          supplier_name: supplierName,
          invoice_number: invoiceNo || '',
          amount: parseFloat(amount),
          notes: notes || ''
        });
        updateSuppliersTable();
        updateSummary();
        logger.log('✅ Supplier saved to database');
      } catch (error) {
        logger.error('❌ Error saving supplier:', error);
      }
    },

    addDetailedBankReceipt: async (atmName, bankName, amount, operationType) => {
      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation || !currentReconciliation.id) return;
      try {
        let atmId = null;
        const isTransfer = atmName === 'تحويل بنكي' || operationType === 'تحويل بنكي (Bank Transfer)';

        if (atmName && !isTransfer) {
          try {
            const atm = await ipc.invoke('db-get', 'SELECT id FROM atms WHERE name LIKE ? OR name LIKE ?', [atmName, `%${atmName}%`]);
            if (atm) atmId = atm.id;
          } catch (error) {
            logger.warn('⚠️ Could not resolve ATM ID for name:', atmName, error);
          }
        } else if (isTransfer) {
          logger.log('📝 [BANK] تحويل بنكي - لا يتطلب ربط بجهاز ATM');
        }

        const result = await ipc.invoke(
          'db-run',
          'INSERT INTO bank_receipts (reconciliation_id, operation_type, amount, atm_id) VALUES (?, ?, ?, ?)',
          [currentReconciliation.id, operationType || 'settlement', parseFloat(amount), atmId]
        );

        getBankReceipts().push({
          id: result.lastInsertRowid,
          reconciliation_id: currentReconciliation.id,
          operation_type: operationType || 'settlement',
          atm_name: atmName || (atmId ? 'جهاز مسجل' : 'غير محدد'),
          bank_name: bankName,
          amount: parseFloat(amount),
          atm_id: atmId
        });
        updateBankReceiptsTable();
        updateSummary();
      } catch (error) {
        logger.error('❌ Error saving bank receipt:', error);
      }
    }
  };
}

module.exports = {
  createAppApi
};
