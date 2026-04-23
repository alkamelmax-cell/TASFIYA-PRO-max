const { mapDbErrorMessage } = require('./db-error-messages');

function normalizeId(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isInteger(normalized) ? normalized : null;
}

function ensureArrayTable(data, tableName) {
  if (!data || typeof data !== 'object') {
    return [];
  }

  if (!Array.isArray(data[tableName])) {
    data[tableName] = [];
  }

  return data[tableName];
}

function buildEntityMap(rows) {
  const map = new Map();

  if (!Array.isArray(rows)) {
    return map;
  }

  rows.forEach((row) => {
    const id = normalizeId(row && row.id);
    if (id !== null) {
      map.set(id, row);
    }
  });

  return map;
}

function summarizeIssues(issues) {
  return issues.join(' | ');
}

function countMissingReferences(rows, fieldName, validIds, options = {}) {
  if (!Array.isArray(rows) || !validIds) {
    return 0;
  }

  const allowNull = options.allowNull !== false;
  return rows.reduce((count, row) => {
    const value = normalizeId(row && row[fieldName]);
    if (value === null) {
      return allowNull ? count : count + 1;
    }

    return validIds.has(value) ? count : count + 1;
  }, 0);
}

function createBackupRestoreRestoreValidationHandlers(context) {
  const ipcRenderer = context.ipcRenderer;

  function validateBackupData(backupData) {
    try {
      if (!backupData || typeof backupData !== 'object') {
        return { valid: false, error: 'بنية البيانات غير صحيحة' };
      }

      if (!backupData.metadata || !backupData.data) {
        return { valid: false, error: 'ملف النسخة الاحتياطية لا يحتوي على البيانات المطلوبة' };
      }

      if (backupData.metadata.app_name !== 'نظام تصفية الكاشير') {
        return { valid: false, error: 'ملف النسخة الاحتياطية من تطبيق مختلف' };
      }

      if (!backupData.data || typeof backupData.data !== 'object') {
        return { valid: false, error: 'بيانات الجداول غير موجودة' };
      }

      const requiredTables = ['branches', 'cashiers', 'accountants', 'atms'];
      const missingTables = requiredTables.filter((table) => !Array.isArray(backupData.data[table]));

      if (missingTables.length > 0) {
        console.warn('⚠️ [RESTORE] جداول مطلوبة مفقودة:', missingTables);
      }

      console.log('✅ [RESTORE] تم التحقق من صحة ملف النسخة الاحتياطية');
      return { valid: true };
    } catch (error) {
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر التحقق من ملف النسخة الاحتياطية.'
      });
      return { valid: false, error: `خطأ في التحقق: ${friendly}` };
    }
  }

  async function repairBackupForeignKeyReferences(data) {
    try {
      const safeData = data && typeof data === 'object' ? data : {};
      const now = new Date().toISOString();
      const today = now.slice(0, 10);

      const branches = ensureArrayTable(safeData, 'branches');
      const cashiers = ensureArrayTable(safeData, 'cashiers');
      const accountants = ensureArrayTable(safeData, 'accountants');
      const atms = ensureArrayTable(safeData, 'atms');
      const reconciliations = ensureArrayTable(safeData, 'reconciliations');
      const bankReceipts = ensureArrayTable(safeData, 'bank_receipts');
      const cashReceipts = ensureArrayTable(safeData, 'cash_receipts');
      const postpaidSales = ensureArrayTable(safeData, 'postpaid_sales');
      const customerReceipts = ensureArrayTable(safeData, 'customer_receipts');
      const returnInvoices = ensureArrayTable(safeData, 'return_invoices');
      const suppliers = ensureArrayTable(safeData, 'suppliers');
      const reconciliationRequests = ensureArrayTable(safeData, 'reconciliation_requests');
      const manualSupplierTransactions = ensureArrayTable(safeData, 'manual_supplier_transactions');
      const branchCashboxes = ensureArrayTable(safeData, 'branch_cashboxes');
      const cashboxVouchers = ensureArrayTable(safeData, 'cashbox_vouchers');
      const cashboxVoucherAuditLog = ensureArrayTable(safeData, 'cashbox_voucher_audit_log');

      const branchById = buildEntityMap(branches);
      const cashierById = buildEntityMap(cashiers);
      const accountantById = buildEntityMap(accountants);
      const atmById = buildEntityMap(atms);
      const reconciliationById = buildEntityMap(reconciliations);
      const cashboxById = buildEntityMap(branchCashboxes);

      const cashierNumbers = new Set(
        cashiers
          .map((row) => String(row && row.cashier_number ? row.cashier_number : '').trim())
          .filter(Boolean)
      );

      const summary = {
        placeholderBranches: 0,
        placeholderCashiers: 0,
        placeholderAccountants: 0,
        placeholderAtms: 0,
        placeholderReconciliations: 0,
        placeholderCashboxes: 0,
        nullifiedCashierBranches: 0,
        nullifiedAtmBranches: 0,
        nullifiedManualSupplierBranches: 0,
        nullifiedVoucherCashiers: 0,
        nullifiedAuditBranches: 0,
        repairedRequestCashiers: 0,
        repairedVoucherBranches: 0,
        repairedVoucherCashboxes: 0,
        repairedBranchCashboxes: 0,
        repairedReconciliationParents: 0,
        repairedReceiptReconciliations: 0,
        repairedBankReceiptAtms: 0
      };

      const getDefaultBranchId = () => {
        const firstBranch = branches.find((branch) => normalizeId(branch && branch.id) !== null);
        return firstBranch ? normalizeId(firstBranch.id) : null;
      };

      const ensureBranch = (id) => {
        const normalizedId = normalizeId(id);
        if (normalizedId === null) {
          return getDefaultBranchId();
        }

        if (branchById.has(normalizedId)) {
          return normalizedId;
        }

        const branch = {
          id: normalizedId,
          branch_name: `فرع مستعاد #${normalizedId}`,
          branch_address: '',
          branch_phone: '',
          is_active: 0,
          created_at: now,
          updated_at: now
        };

        branches.push(branch);
        branchById.set(normalizedId, branch);
        summary.placeholderBranches += 1;
        return normalizedId;
      };

      const generateUniqueCashierNumber = (id) => {
        const base = `RESTORE-${id}`;
        if (!cashierNumbers.has(base)) {
          cashierNumbers.add(base);
          return base;
        }

        let suffix = 1;
        while (cashierNumbers.has(`${base}-${suffix}`)) {
          suffix += 1;
        }

        const number = `${base}-${suffix}`;
        cashierNumbers.add(number);
        return number;
      };

      const ensureCashier = (id, branchId = null) => {
        const normalizedId = normalizeId(id);
        if (normalizedId === null) {
          return null;
        }

        if (cashierById.has(normalizedId)) {
          return normalizedId;
        }

        const normalizedBranchId = normalizeId(branchId);
        const cashier = {
          id: normalizedId,
          name: `كاشير مستعاد #${normalizedId}`,
          cashier_number: generateUniqueCashierNumber(normalizedId),
          branch_id: normalizedBranchId !== null ? ensureBranch(normalizedBranchId) : getDefaultBranchId(),
          active: 0,
          pin_code: '',
          created_at: now,
          updated_at: now
        };

        cashiers.push(cashier);
        cashierById.set(normalizedId, cashier);
        summary.placeholderCashiers += 1;
        return normalizedId;
      };

      const ensureAccountant = (id) => {
        const normalizedId = normalizeId(id);
        if (normalizedId === null) {
          return null;
        }

        if (accountantById.has(normalizedId)) {
          return normalizedId;
        }

        const accountant = {
          id: normalizedId,
          name: `محاسب مستعاد #${normalizedId}`,
          active: 0,
          created_at: now,
          updated_at: now
        };

        accountants.push(accountant);
        accountantById.set(normalizedId, accountant);
        summary.placeholderAccountants += 1;
        return normalizedId;
      };

      const ensureAtm = (id, branchId = null) => {
        const normalizedId = normalizeId(id);
        if (normalizedId === null) {
          return null;
        }

        if (atmById.has(normalizedId)) {
          return normalizedId;
        }

        const normalizedBranchId = normalizeId(branchId);
        const atm = {
          id: normalizedId,
          name: `جهاز مستعاد #${normalizedId}`,
          bank_name: 'غير معروف',
          location: 'غير محدد',
          branch_id: normalizedBranchId !== null ? ensureBranch(normalizedBranchId) : getDefaultBranchId(),
          active: 0,
          created_at: now,
          updated_at: now
        };

        atms.push(atm);
        atmById.set(normalizedId, atm);
        summary.placeholderAtms += 1;
        return normalizedId;
      };

      const ensureReconciliation = (id, options = {}) => {
        const normalizedId = normalizeId(id);
        if (normalizedId === null) {
          return null;
        }

        if (reconciliationById.has(normalizedId)) {
          return normalizedId;
        }

        const branchId = normalizeId(options.branchId);
        const cashierId = ensureCashier(options.cashierId !== undefined ? options.cashierId : normalizedId, branchId);
        const accountantId = ensureAccountant(
          options.accountantId !== undefined ? options.accountantId : normalizedId
        );

        const reconciliation = {
          id: normalizedId,
          reconciliation_number: null,
          cashier_id: cashierId,
          accountant_id: accountantId,
          reconciliation_date: options.reconciliationDate || today,
          system_sales: 0,
          total_receipts: 0,
          surplus_deficit: 0,
          status: 'draft',
          notes: options.notes || 'تم إنشاء هذا السجل تلقائيًا أثناء استعادة النسخة الاحتياطية',
          created_at: now,
          updated_at: now
        };

        reconciliations.push(reconciliation);
        reconciliationById.set(normalizedId, reconciliation);
        summary.placeholderReconciliations += 1;
        return normalizedId;
      };

      const ensureCashbox = (id, branchId = null) => {
        const normalizedId = normalizeId(id);
        if (normalizedId === null) {
          return null;
        }

        if (cashboxById.has(normalizedId)) {
          return normalizedId;
        }

        const preferredBranchId = normalizeId(branchId) !== null
          ? normalizeId(branchId)
          : normalizeId(normalizedId);
        const resolvedBranchId = ensureBranch(preferredBranchId);
        const cashbox = {
          id: normalizedId,
          branch_id: resolvedBranchId,
          cashbox_name: `صندوق مستعاد #${normalizedId}`,
          opening_balance: 0,
          is_active: 0,
          created_at: now,
          updated_at: now
        };

        branchCashboxes.push(cashbox);
        cashboxById.set(normalizedId, cashbox);
        summary.placeholderCashboxes += 1;
        return normalizedId;
      };

      cashiers.forEach((cashier) => {
        const branchId = normalizeId(cashier && cashier.branch_id);
        if (branchId !== null && !branchById.has(branchId)) {
          cashier.branch_id = null;
          summary.nullifiedCashierBranches += 1;
        }
      });

      atms.forEach((atm) => {
        const branchId = normalizeId(atm && atm.branch_id);
        if (branchId !== null && !branchById.has(branchId)) {
          atm.branch_id = null;
          summary.nullifiedAtmBranches += 1;
        }
      });

      manualSupplierTransactions.forEach((transaction) => {
        const branchId = normalizeId(transaction && transaction.branch_id);
        if (branchId !== null && !branchById.has(branchId)) {
          transaction.branch_id = null;
          summary.nullifiedManualSupplierBranches += 1;
        }
      });

      branchCashboxes.forEach((cashbox) => {
        const branchId = normalizeId(cashbox && cashbox.branch_id);
        if (branchId === null || !branchById.has(branchId)) {
          cashbox.branch_id = ensureBranch(branchId !== null ? branchId : cashbox && cashbox.id);
          summary.repairedBranchCashboxes += 1;
        }
      });

      reconciliations.forEach((reconciliation) => {
        const cashierId = normalizeId(reconciliation && reconciliation.cashier_id);
        const accountantId = normalizeId(reconciliation && reconciliation.accountant_id);

        if (cashierId === null || !cashierById.has(cashierId)) {
          reconciliation.cashier_id = ensureCashier(cashierId !== null ? cashierId : reconciliation && reconciliation.id);
          summary.repairedReconciliationParents += 1;
        }

        if (accountantId === null || !accountantById.has(accountantId)) {
          reconciliation.accountant_id = ensureAccountant(
            accountantId !== null ? accountantId : reconciliation && reconciliation.id
          );
          summary.repairedReconciliationParents += 1;
        }
      });

      const repairReconciliationReferences = (rows, counterFieldName) => {
        rows.forEach((row) => {
          const reconciliationId = normalizeId(row && row.reconciliation_id);
          if (reconciliationId === null || !reconciliationById.has(reconciliationId)) {
            row.reconciliation_id = ensureReconciliation(
              reconciliationId !== null ? reconciliationId : row && row.id,
              {
                reconciliationDate: row && row.created_at ? String(row.created_at).slice(0, 10) : today
              }
            );
            summary[counterFieldName] += 1;
          }
        });
      };

      repairReconciliationReferences(cashReceipts, 'repairedReceiptReconciliations');
      repairReconciliationReferences(postpaidSales, 'repairedReceiptReconciliations');
      repairReconciliationReferences(customerReceipts, 'repairedReceiptReconciliations');
      repairReconciliationReferences(returnInvoices, 'repairedReceiptReconciliations');
      repairReconciliationReferences(suppliers, 'repairedReceiptReconciliations');

      bankReceipts.forEach((receipt) => {
        const reconciliationId = normalizeId(receipt && receipt.reconciliation_id);
        if (reconciliationId === null || !reconciliationById.has(reconciliationId)) {
          receipt.reconciliation_id = ensureReconciliation(
            reconciliationId !== null ? reconciliationId : receipt && receipt.id,
            {
              reconciliationDate: receipt && receipt.created_at ? String(receipt.created_at).slice(0, 10) : today
            }
          );
          summary.repairedReceiptReconciliations += 1;
        }

        const atmId = normalizeId(receipt && receipt.atm_id);
        if (atmId !== null && !atmById.has(atmId)) {
          receipt.atm_id = ensureAtm(atmId);
          summary.repairedBankReceiptAtms += 1;
        }
      });

      reconciliationRequests.forEach((request) => {
        const cashierId = normalizeId(request && request.cashier_id);
        if (cashierId === null || !cashierById.has(cashierId)) {
          request.cashier_id = ensureCashier(cashierId !== null ? cashierId : request && request.id);
          summary.repairedRequestCashiers += 1;
        }
      });

      cashboxVouchers.forEach((voucher) => {
        const branchId = normalizeId(voucher && voucher.branch_id);
        if (branchId === null || !branchById.has(branchId)) {
          voucher.branch_id = ensureBranch(branchId !== null ? branchId : voucher && voucher.cashbox_id);
          summary.repairedVoucherBranches += 1;
        }

        const cashboxId = normalizeId(voucher && voucher.cashbox_id);
        if (cashboxId === null || !cashboxById.has(cashboxId)) {
          voucher.cashbox_id = ensureCashbox(
            cashboxId !== null ? cashboxId : voucher && voucher.id,
            voucher.branch_id
          );
          summary.repairedVoucherCashboxes += 1;
        }

        const cashierId = normalizeId(voucher && voucher.cashier_id);
        if (cashierId !== null && !cashierById.has(cashierId)) {
          voucher.cashier_id = null;
          summary.nullifiedVoucherCashiers += 1;
        }
      });

      cashboxVoucherAuditLog.forEach((entry) => {
        const branchId = normalizeId(entry && entry.branch_id);
        if (branchId !== null && !branchById.has(branchId)) {
          entry.branch_id = null;
          summary.nullifiedAuditBranches += 1;
        }
      });

      const touchedCounts = Object.values(summary).reduce((sum, value) => sum + value, 0);
      if (touchedCounts > 0) {
        console.log('🔧 [RESTORE] تم إصلاح مراجع النسخة الاحتياطية تلقائيًا:', summary);
      } else {
        console.log('✅ [RESTORE] لم يتم العثور على مراجع ناقصة تحتاج إلى إصلاح');
      }

      return {
        repaired: touchedCounts > 0,
        summary
      };
    } catch (e) {
      console.warn('⚠️ [RESTORE] فشل إصلاح مراجع النسخة الاحتياطية المفقودة:', e);
      return {
        repaired: false,
        summary: {},
        error: e.message
      };
    }
  }

  async function repairBackupAtmReferences(data) {
    return repairBackupForeignKeyReferences(data);
  }

  function validateDataConsistency(data) {
    try {
      console.log('🔍 [RESTORE] فحص تناسق البيانات...');

      const branches = ensureArrayTable(data, 'branches');
      const cashiers = ensureArrayTable(data, 'cashiers');
      const accountants = ensureArrayTable(data, 'accountants');
      const atms = ensureArrayTable(data, 'atms');
      const reconciliations = ensureArrayTable(data, 'reconciliations');
      const bankReceipts = ensureArrayTable(data, 'bank_receipts');
      const cashReceipts = ensureArrayTable(data, 'cash_receipts');
      const postpaidSales = ensureArrayTable(data, 'postpaid_sales');
      const customerReceipts = ensureArrayTable(data, 'customer_receipts');
      const returnInvoices = ensureArrayTable(data, 'return_invoices');
      const suppliers = ensureArrayTable(data, 'suppliers');
      const reconciliationRequests = ensureArrayTable(data, 'reconciliation_requests');
      const manualSupplierTransactions = ensureArrayTable(data, 'manual_supplier_transactions');
      const branchCashboxes = ensureArrayTable(data, 'branch_cashboxes');
      const cashboxVouchers = ensureArrayTable(data, 'cashbox_vouchers');
      const cashboxVoucherAuditLog = ensureArrayTable(data, 'cashbox_voucher_audit_log');

      const branchIds = new Set(Array.from(buildEntityMap(branches).keys()));
      const cashierIds = new Set(Array.from(buildEntityMap(cashiers).keys()));
      const accountantIds = new Set(Array.from(buildEntityMap(accountants).keys()));
      const atmIds = new Set(Array.from(buildEntityMap(atms).keys()));
      const reconciliationIds = new Set(Array.from(buildEntityMap(reconciliations).keys()));
      const cashboxIds = new Set(Array.from(buildEntityMap(branchCashboxes).keys()));

      const issues = [];

      const invalidCashierBranches = countMissingReferences(cashiers, 'branch_id', branchIds);
      if (invalidCashierBranches > 0) {
        issues.push(`كاشيرين يشيرون إلى فروع غير موجودة: ${invalidCashierBranches}`);
      }

      const invalidAtmBranches = countMissingReferences(atms, 'branch_id', branchIds);
      if (invalidAtmBranches > 0) {
        issues.push(`أجهزة صراف تشير إلى فروع غير موجودة: ${invalidAtmBranches}`);
      }

      const invalidReconciliationCashiers = countMissingReferences(
        reconciliations,
        'cashier_id',
        cashierIds,
        { allowNull: false }
      );
      if (invalidReconciliationCashiers > 0) {
        issues.push(`تصفيات تشير إلى كاشيرين غير موجودين: ${invalidReconciliationCashiers}`);
      }

      const invalidReconciliationAccountants = countMissingReferences(
        reconciliations,
        'accountant_id',
        accountantIds,
        { allowNull: false }
      );
      if (invalidReconciliationAccountants > 0) {
        issues.push(`تصفيات تشير إلى محاسبين غير موجودين: ${invalidReconciliationAccountants}`);
      }

      const invalidBankReceiptReconciliations = countMissingReferences(
        bankReceipts,
        'reconciliation_id',
        reconciliationIds,
        { allowNull: false }
      );
      if (invalidBankReceiptReconciliations > 0) {
        issues.push(`مقبوضات بنكية تشير إلى تصفيات غير موجودة: ${invalidBankReceiptReconciliations}`);
      }

      const invalidBankReceiptAtms = countMissingReferences(bankReceipts, 'atm_id', atmIds);
      if (invalidBankReceiptAtms > 0) {
        issues.push(`مقبوضات بنكية تشير إلى أجهزة صراف غير موجودة: ${invalidBankReceiptAtms}`);
      }

      const reconciliationChildren = [
        ['cash_receipts', cashReceipts],
        ['postpaid_sales', postpaidSales],
        ['customer_receipts', customerReceipts],
        ['return_invoices', returnInvoices],
        ['suppliers', suppliers]
      ];

      reconciliationChildren.forEach(([tableName, rows]) => {
        const invalidCount = countMissingReferences(rows, 'reconciliation_id', reconciliationIds, { allowNull: false });
        if (invalidCount > 0) {
          issues.push(`${tableName} تشير إلى تصفيات غير موجودة: ${invalidCount}`);
        }
      });

      const invalidRequestCashiers = countMissingReferences(
        reconciliationRequests,
        'cashier_id',
        cashierIds,
        { allowNull: false }
      );
      if (invalidRequestCashiers > 0) {
        issues.push(`طلبات التصفية تشير إلى كاشيرين غير موجودين: ${invalidRequestCashiers}`);
      }

      const invalidManualSupplierBranches = countMissingReferences(
        manualSupplierTransactions,
        'branch_id',
        branchIds
      );
      if (invalidManualSupplierBranches > 0) {
        issues.push(`حركات الموردين اليدوية تشير إلى فروع غير موجودة: ${invalidManualSupplierBranches}`);
      }

      const invalidBranchCashboxes = countMissingReferences(
        branchCashboxes,
        'branch_id',
        branchIds,
        { allowNull: false }
      );
      if (invalidBranchCashboxes > 0) {
        issues.push(`صناديق الفروع تشير إلى فروع غير موجودة: ${invalidBranchCashboxes}`);
      }

      const invalidCashboxVoucherBranches = countMissingReferences(
        cashboxVouchers,
        'branch_id',
        branchIds,
        { allowNull: false }
      );
      if (invalidCashboxVoucherBranches > 0) {
        issues.push(`سندات الصناديق تشير إلى فروع غير موجودة: ${invalidCashboxVoucherBranches}`);
      }

      const invalidCashboxVoucherCashboxes = countMissingReferences(
        cashboxVouchers,
        'cashbox_id',
        cashboxIds,
        { allowNull: false }
      );
      if (invalidCashboxVoucherCashboxes > 0) {
        issues.push(`سندات الصناديق تشير إلى صناديق غير موجودة: ${invalidCashboxVoucherCashboxes}`);
      }

      const invalidCashboxVoucherCashiers = countMissingReferences(
        cashboxVouchers,
        'cashier_id',
        cashierIds
      );
      if (invalidCashboxVoucherCashiers > 0) {
        issues.push(`سندات الصناديق تشير إلى كاشيرين غير موجودين: ${invalidCashboxVoucherCashiers}`);
      }

      const invalidAuditBranches = countMissingReferences(
        cashboxVoucherAuditLog,
        'branch_id',
        branchIds
      );
      if (invalidAuditBranches > 0) {
        issues.push(`سجل تدقيق الصندوق يشير إلى فروع غير موجودة: ${invalidAuditBranches}`);
      }

      if (issues.length === 0) {
        console.log('✅ [RESTORE] تم التحقق من تناسق البيانات');
        return { valid: true };
      }

      console.warn('⚠️ [RESTORE] مشاكل في تناسق البيانات:', issues);
      return {
        valid: false,
        error: summarizeIssues(issues),
        issues
      };
    } catch (error) {
      const friendly = mapDbErrorMessage(error, {
        fallback: 'تعذر فحص تناسق البيانات.'
      });
      return { valid: false, error: `خطأ في فحص التناسق: ${friendly}` };
    }
  }

  async function performDatabaseIntegrityCheck() {
    console.log('🔍 [DB-CHECK] بدء فحص سلامة قاعدة البيانات...');

    try {
      const issues = [];

      const fkViolations = await ipcRenderer.invoke('db-query', 'PRAGMA foreign_key_check', []);
      if (fkViolations && fkViolations.length > 0) {
        issues.push(`انتهاكات المفاتيح الخارجية: ${fkViolations.length}`);
        console.error('❌ [DB-CHECK] انتهاكات المفاتيح الخارجية:', fkViolations);
      }

      const orphanedChecks = [
        {
          name: 'كاشيرين بدون فروع',
          query: 'SELECT COUNT(*) as count FROM cashiers WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM branches)'
        },
        {
          name: 'تصفيات بدون كاشيرين',
          query: 'SELECT COUNT(*) as count FROM reconciliations WHERE cashier_id NOT IN (SELECT id FROM cashiers)'
        },
        {
          name: 'تصفيات بدون محاسبين',
          query: 'SELECT COUNT(*) as count FROM reconciliations WHERE accountant_id NOT IN (SELECT id FROM accountants)'
        },
        {
          name: 'مقبوضات بنكية بدون تصفيات',
          query: 'SELECT COUNT(*) as count FROM bank_receipts WHERE reconciliation_id NOT IN (SELECT id FROM reconciliations)'
        },
        {
          name: 'مقبوضات بنكية بدون أجهزة صراف',
          query: 'SELECT COUNT(*) as count FROM bank_receipts WHERE atm_id NOT IN (SELECT id FROM atms)'
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
      }

      console.warn('⚠️ [DB-CHECK] مشاكل في قاعدة البيانات:', issues);
      return { valid: false, issues };
    } catch (error) {
      console.error('❌ [DB-CHECK] خطأ في فحص قاعدة البيانات:', error);
      return {
        valid: false,
        error: mapDbErrorMessage(error, {
          fallback: 'تعذر فحص سلامة قاعدة البيانات.'
        })
      };
    }
  }

  return {
    validateBackupData,
    repairBackupAtmReferences,
    repairBackupForeignKeyReferences,
    validateDataConsistency,
    performDatabaseIntegrityCheck
  };
}

module.exports = {
  createBackupRestoreRestoreValidationHandlers
};
