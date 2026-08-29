const { createCustomerCodeHelpers } = require('./customer-code-helpers');

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
  const customerCodeHelpers = deps.resolveCustomerIdentity
    ? null
    : createCustomerCodeHelpers({ ipcRenderer: ipc, logger });
  const resolveCustomerIdentity = deps.resolveCustomerIdentity
    || customerCodeHelpers.resolveCustomerIdentity;

  if (typeof deps.updateSummary !== 'function') {
    logger.warn('⚠️ [APP-API] updateSummary dependency is missing. Using no-op fallback.');
  }

  function normalizeText(value) {
    return String(value == null ? '' : value).replace(/\uFFFD/g, '').replaceAll('\u0000', '').trim();
  }

  function normalizeCode(value) {
    const normalized = normalizeText(value).toUpperCase();
    return ['', '-', '–', '—'].includes(normalized) ? '' : normalized;
  }

  function normalizePositiveInteger(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  }

  async function resolveCurrentReconciliationBranchId(currentReconciliation) {
    const directBranchId = normalizePositiveInteger(currentReconciliation?.branch_id);
    if (directBranchId) {
      return directBranchId;
    }

    const cashierId = normalizePositiveInteger(currentReconciliation?.cashier_id);
    if (!cashierId) {
      return null;
    }

    try {
      const cashier = await ipc.invoke(
        'db-get',
        'SELECT branch_id FROM cashiers WHERE id = ? LIMIT 1',
        [cashierId]
      );
      return normalizePositiveInteger(cashier?.branch_id);
    } catch (error) {
      logger.error('❌ Error resolving reconciliation branch:', error);
      return null;
    }
  }

  async function resolveBranchCustomerCodePrefix(branchId) {
    const normalizedBranchId = normalizePositiveInteger(branchId);
    if (!normalizedBranchId) {
      return '';
    }

    try {
      const branch = await ipc.invoke(
        'db-get',
        'SELECT customer_code_prefix FROM branches WHERE id = ? LIMIT 1',
        [normalizedBranchId]
      );
      return normalizeCode(branch?.customer_code_prefix) || `C${normalizedBranchId}`;
    } catch (error) {
      logger.error('❌ Error resolving branch customer code prefix:', error);
      return `C${normalizedBranchId}`;
    }
  }

  async function resolveCustomerForInsert(customerInput, currentReconciliation) {
    const source = customerInput && typeof customerInput === 'object'
      ? customerInput
      : { customer_name: customerInput };
    const branchId = normalizePositiveInteger(source.branch_id)
      || await resolveCurrentReconciliationBranchId(currentReconciliation);
    const inputName = normalizeText(source.customer_name || source.name);
    let inputCode = normalizeCode(source.customer_code || source.code);
    const inputId = normalizePositiveInteger(source.customer_id || source.id);

    if (inputCode && branchId) {
      const branchPrefix = await resolveBranchCustomerCodePrefix(branchId);
      if (branchPrefix && !inputCode.startsWith(`${branchPrefix}-`)) {
        inputCode = '';
      }
    }

    if (inputId) {
      try {
        const existing = await ipc.invoke(
          'db-get',
          'SELECT id, customer_name, customer_code, branch_id FROM customers WHERE id = ? LIMIT 1',
          [inputId]
        );
        const existingBranchId = normalizePositiveInteger(existing?.branch_id);
        const sameBranch = !branchId || !existingBranchId || branchId === existingBranchId;
        const sameName = !inputName || normalizeText(existing?.customer_name) === inputName;
        const sameCode = !inputCode || normalizeCode(existing?.customer_code) === inputCode;
        if (existing && sameBranch && sameName && sameCode) {
          return {
            customer_id: normalizePositiveInteger(existing.id),
            customer_name: normalizeText(existing.customer_name) || inputName,
            customer_code: normalizeCode(existing.customer_code) || inputCode,
            branch_id: existingBranchId || branchId || null
          };
        }
      } catch (error) {
        logger.error('❌ Error reading customer identity by id:', error);
      }
    }

    const identity = await resolveCustomerIdentity({
      customerName: inputName,
      customerCode: inputCode,
      branchId
    });

    return {
      customer_id: normalizePositiveInteger(identity.customer_id || identity.id),
      customer_name: normalizeText(identity.customer_name) || inputName,
      customer_code: normalizeCode(identity.customer_code) || inputCode,
      branch_id: normalizePositiveInteger(identity.branch_id) || branchId || null
    };
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

    addPostpaidSale: async (customerInput, amount) => {
      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation || !currentReconciliation.id) return;
      try {
        const identity = await resolveCustomerForInsert(customerInput, currentReconciliation);
        const result = await ipc.invoke(
          'db-run',
          'INSERT INTO postpaid_sales (reconciliation_id, customer_id, customer_name, customer_code, amount) VALUES (?, ?, ?, ?, ?)',
          [
            currentReconciliation.id,
            identity.customer_id || null,
            identity.customer_name,
            identity.customer_code || '',
            parseFloat(amount)
          ]
        );
        getPostpaidSales().push({
          id: result.lastInsertRowid,
          reconciliation_id: currentReconciliation.id,
          customer_id: identity.customer_id || null,
          customer_name: identity.customer_name,
          customer_code: identity.customer_code || '',
          amount: parseFloat(amount)
        });
        updatePostpaidSalesTable();
        updateSummary();
      } catch (error) {
        logger.error('❌ Error saving postpaid sale:', error);
      }
    },

    addCustomerReceipt: async (customerInput, amount, paymentType, notes) => {
      const currentReconciliation = getCurrentReconciliation();
      if (!currentReconciliation || !currentReconciliation.id) return;
      try {
        const identity = await resolveCustomerForInsert(customerInput, currentReconciliation);
        const result = await ipc.invoke(
          'db-run',
          'INSERT INTO customer_receipts (reconciliation_id, customer_id, customer_name, customer_code, amount, payment_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            currentReconciliation.id,
            identity.customer_id || null,
            identity.customer_name,
            identity.customer_code || '',
            parseFloat(amount),
            paymentType || 'cash',
            notes || ''
          ]
        );
        getCustomerReceipts().push({
          id: result.lastInsertRowid,
          reconciliation_id: currentReconciliation.id,
          customer_id: identity.customer_id || null,
          customer_name: identity.customer_name,
          customer_code: identity.customer_code || '',
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
