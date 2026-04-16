const {
  clearActiveFormulaSettingsInDocument,
  DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
  getFormulaSettingsFromDocument,
  normalizeFormulaSettings,
  RECONCILIATION_FORMULA_FIELDS,
  setActiveFormulaSettingsInDocument,
  updateFormulaPreviewInDocument
} = require('./reconciliation-formula');
const { getSelectedFiscalYear } = require('./fiscal-year');

function createNewReconciliationHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const windowObj = deps.windowObj || globalThis;
  const logger = deps.logger || console;
  const updateSummary = typeof deps.updateSummary === 'function'
    ? deps.updateSummary
    : () => {};

  function applyFormulaSettingsToUi(formulaSettings) {
    if (!doc || typeof doc.getElementById !== 'function') {
      return;
    }

    RECONCILIATION_FORMULA_FIELDS.forEach((field) => {
      const selectEl = doc.getElementById(field.fieldId);
      if (selectEl) {
        selectEl.value = String(formulaSettings[field.settingKey]);
      }
    });

    updateFormulaPreviewInDocument(doc, formulaSettings);
  }

  function parseFormulaProfileId(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function getActiveFormulaProfileIdFromDocument() {
    const profileIdInput = doc.getElementById('activeReconciliationFormulaProfileId');
    if (!profileIdInput) {
      return null;
    }
    return parseFormulaProfileId(profileIdInput.value);
  }

  function setActiveFormulaProfileIdInDocument(profileId) {
    const profileIdInput = doc.getElementById('activeReconciliationFormulaProfileId');
    if (!profileIdInput) {
      return;
    }
    profileIdInput.value = profileId ? String(profileId) : '';
  }

  function parseFormulaProfileSettings(profileRow) {
    if (!profileRow || !profileRow.settings_json) {
      return null;
    }

    try {
      return normalizeFormulaSettings(JSON.parse(profileRow.settings_json));
    } catch (error) {
      return null;
    }
  }

  function applyResolvedFormulaSettings(formulaSettings, formulaProfileId = null) {
    const normalizedSettings = normalizeFormulaSettings({
      ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
      ...(formulaSettings || {})
    });
    applyFormulaSettingsToUi(normalizedSettings);
    setActiveFormulaProfileIdInDocument(formulaProfileId);
    return normalizedSettings;
  }

  async function resolveFormulaSettingsForNewReconciliation(branchId) {
    const formulaSettingsFromUi = getFormulaSettingsFromDocument(doc);
    const profileIdFromUi = getActiveFormulaProfileIdFromDocument();

    try {
      if (profileIdFromUi) {
        const selectedProfile = await ipc.invoke(
          'db-get',
          `SELECT id AS formula_profile_id, settings_json
           FROM reconciliation_formula_profiles
           WHERE id = ? AND is_active = 1
           LIMIT 1`,
          [profileIdFromUi]
        );
        const selectedProfileSettings = parseFormulaProfileSettings(selectedProfile);
        if (selectedProfileSettings) {
          const normalized = applyResolvedFormulaSettings(selectedProfileSettings, selectedProfile.formula_profile_id);
          return {
            formulaProfileId: selectedProfile.formula_profile_id,
            formulaSettings: normalized
          };
        }
      }

      const branchProfileId = parseFormulaProfileId(branchId);
      if (branchProfileId) {
        const branchProfile = await ipc.invoke(
          'db-get',
          `SELECT p.id AS formula_profile_id, p.settings_json
           FROM branches b
           LEFT JOIN reconciliation_formula_profiles p
             ON p.id = b.reconciliation_formula_id
           WHERE b.id = ?
           LIMIT 1`,
          [branchProfileId]
        );
        const branchProfileSettings = parseFormulaProfileSettings(branchProfile);
        if (branchProfileSettings) {
          const normalized = applyResolvedFormulaSettings(branchProfileSettings, branchProfile.formula_profile_id);
          return {
            formulaProfileId: branchProfile.formula_profile_id,
            formulaSettings: normalized
          };
        }
      }

      const defaultProfile = await ipc.invoke(
        'db-get',
        `SELECT id AS formula_profile_id, settings_json
         FROM reconciliation_formula_profiles
         WHERE is_active = 1
         ORDER BY is_default DESC, id ASC
         LIMIT 1`
      );
      const defaultProfileSettings = parseFormulaProfileSettings(defaultProfile);
      if (defaultProfileSettings) {
        const normalized = applyResolvedFormulaSettings(defaultProfileSettings, defaultProfile.formula_profile_id);
        return {
          formulaProfileId: defaultProfile.formula_profile_id,
          formulaSettings: normalized
        };
      }
    } catch (error) {
      logger.warn('⚠️ [RECONCILIATION] تعذر تحميل معادلة التصفية من ملف المعادلات، سيتم الاعتماد على الإعدادات الاحتياطية:', error);
    }

    try {
      const rows = await ipc.invoke(
        'db-query',
        'SELECT setting_key, setting_value FROM system_settings WHERE category = ?',
        ['reconciliation_formula']
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        const normalized = applyResolvedFormulaSettings(formulaSettingsFromUi, profileIdFromUi);
        return {
          formulaProfileId: profileIdFromUi,
          formulaSettings: normalized
        };
      }

      const storedSettings = {};
      rows.forEach((row) => {
        if (!row || !row.setting_key) {
          return;
        }
        storedSettings[row.setting_key] = row.setting_value;
      });

      const normalizedStoredSettings = normalizeFormulaSettings({
        ...DEFAULT_RECONCILIATION_FORMULA_SETTINGS,
        ...storedSettings
      });

      const activeProfileId = parseFormulaProfileId(storedSettings.active_profile_id) || profileIdFromUi;
      const normalized = applyResolvedFormulaSettings(normalizedStoredSettings, activeProfileId);
      return {
        formulaProfileId: activeProfileId,
        formulaSettings: normalized
      };
    } catch (error) {
      logger.warn('⚠️ [RECONCILIATION] تعذر تحميل معادلة التصفية من قاعدة البيانات، سيتم الاعتماد على واجهة الإعدادات:', error);
      const normalized = applyResolvedFormulaSettings(formulaSettingsFromUi, profileIdFromUi);
      return {
        formulaProfileId: profileIdFromUi,
        formulaSettings: normalized
      };
    }
  }

  function resetSaveButtonToDefaultMode() {
    const saveButton = doc.getElementById('saveReconciliationBtn');
    if (!saveButton) {
      return;
    }

    saveButton.disabled = false;
    saveButton.title = 'حفظ التصفية الحالية';
    saveButton.innerHTML = '<i class="icon">💾</i> حفظ التصفية';
  }

  async function isArchivedFiscalYear(year) {
    const normalizedYear = Number.parseInt(String(year || ''), 10);
    if (!Number.isFinite(normalizedYear)) {
      return false;
    }

    try {
      const row = await ipc.invoke(
        'db-get',
        'SELECT year FROM archived_years WHERE year = ? LIMIT 1',
        [String(normalizedYear)]
      );
      return !!row;
    } catch (_error) {
      return false;
    }
  }

  async function handleNewReconciliation(event) {
    event.preventDefault();

    clearActiveFormulaSettingsInDocument(doc);

    const branchId = doc.getElementById('branchSelect')?.value || '';
    const resolvedFormula = await resolveFormulaSettingsForNewReconciliation(branchId);
    const formulaSettingsForNewReconciliation = resolvedFormula.formulaSettings;
    const formulaProfileIdForNewReconciliation = resolvedFormula.formulaProfileId;
    setActiveFormulaSettingsInDocument(doc, formulaSettingsForNewReconciliation);
    setActiveFormulaProfileIdInDocument(formulaProfileIdForNewReconciliation);

    const cashierId = doc.getElementById('cashierSelect').value;
    const accountantId = doc.getElementById('accountantSelect').value;
    const reconciliationDate = doc.getElementById('reconciliationDate').value;

    const timeRangeStart = doc.getElementById('timeRangeStart').value || null;
    const timeRangeEnd = doc.getElementById('timeRangeEnd').value || null;
    const filterNotes = doc.getElementById('filterNotes').value.trim() || null;

    if (!cashierId || !accountantId || !reconciliationDate) {
      deps.getDialogUtils().showValidationError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    const dateYear = Number.parseInt(reconciliationDate.slice(0, 4), 10);
    if (Number.isFinite(dateYear)) {
      const archivedYear = await isArchivedFiscalYear(dateYear);
      if (archivedYear) {
        const confirmed = await deps.getDialogUtils().showConfirm(
          `سنة ${dateYear} مؤرشفة. إنشاء تصفية جديدة لهذه السنة قد يربك التقارير النشطة. هل تريد المتابعة؟`,
          'سنة مؤرشفة',
          'المتابعة رغم الأرشفة',
          'إلغاء'
        );
        if (!confirmed) {
          return;
        }
      }
    }

    const selectedFiscalYear = getSelectedFiscalYear();
    if (selectedFiscalYear && reconciliationDate) {
      if (Number.isFinite(dateYear) && dateYear !== selectedFiscalYear) {
        const confirmed = await deps.getDialogUtils().showConfirm(
          `تاريخ التصفية خارج السنة المالية المختارة (${selectedFiscalYear}). هل تريد المتابعة؟`,
          'تأكيد المتابعة'
        );
        if (!confirmed) {
          return;
        }
      }
    }

    if (timeRangeStart && timeRangeEnd && timeRangeStart >= timeRangeEnd) {
      deps.getDialogUtils().showValidationError('وقت البداية يجب أن يكون قبل وقت النهاية');
      return;
    }

    try {
      const formulaSettingsJson = JSON.stringify(formulaSettingsForNewReconciliation);
      const result = await ipc.invoke('db-run',
        `INSERT INTO reconciliations
           (cashier_id, accountant_id, reconciliation_date, time_range_start, time_range_end, filter_notes, formula_profile_id, formula_settings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cashierId,
          accountantId,
          reconciliationDate,
          timeRangeStart,
          timeRangeEnd,
          filterNotes,
          formulaProfileIdForNewReconciliation,
          formulaSettingsJson
        ]
      );

      const currentReconciliation = {
        id: result.lastInsertRowid,
        cashier_id: cashierId,
        accountant_id: accountantId,
        reconciliation_date: reconciliationDate,
        time_range_start: timeRangeStart,
        time_range_end: timeRangeEnd,
        filter_notes: filterNotes,
        formula_profile_id: formulaProfileIdForNewReconciliation,
        formula_settings: formulaSettingsForNewReconciliation,
        cashbox_posting_enabled: null,
        __mode: 'new',
        __snapshot: null
      };
      deps.setCurrentReconciliation(currentReconciliation);
      if (windowObj) {
        windowObj.recalledReconciliationSnapshot = null;
      }
      resetSaveButtonToDefaultMode();

      const cashier = await ipc.invoke('db-get',
        'SELECT name, cashier_number FROM cashiers WHERE id = ?', [cashierId]
      );
      const accountant = await ipc.invoke('db-get',
        'SELECT name FROM accountants WHERE id = ?', [accountantId]
      );

      const infoDiv = doc.getElementById('currentReconciliationInfo');
      const detailsSpan = doc.getElementById('currentReconciliationDetails');

      let infoText = `الكاشير: ${cashier.name} (${cashier.cashier_number}) - المحاسب: ${accountant.name} - التاريخ: ${reconciliationDate}`;

      if (timeRangeStart && timeRangeEnd) {
        infoText += ` - النطاق الزمني: ${timeRangeStart} إلى ${timeRangeEnd}`;
      } else if (timeRangeStart) {
        infoText += ` - من الوقت: ${timeRangeStart}`;
      } else if (timeRangeEnd) {
        infoText += ` - إلى الوقت: ${timeRangeEnd}`;
      }

      if (filterNotes) {
        infoText += ` - الملاحظات: ${filterNotes}`;
      }

      detailsSpan.textContent = infoText;
      infoDiv.style.display = 'block';

      deps.updateButtonStates('NEW_RECONCILIATION');

      deps.setBankReceipts([]);
      deps.setCashReceipts([]);
      deps.setPostpaidSales([]);
      deps.setCustomerReceipts([]);
      deps.setReturnInvoices([]);
      deps.setSuppliers([]);

      deps.updateBankReceiptsTable();
      deps.updateCashReceiptsTable();
      deps.updatePostpaidSalesTable();
      deps.updateCustomerReceiptsTable();
      deps.updateReturnInvoicesTable();
      deps.updateSuppliersTable();
      updateSummary();

      logger.log('New reconciliation created:', currentReconciliation);

      if (windowObj.pendingReconciliationData && windowObj.appAPI) {
        logger.log('📥 Loading pending web request data...');
        const pData = windowObj.pendingReconciliationData;
        const pDetails = (pData && pData.details && typeof pData.details === 'object')
          ? pData.details
          : {};

        const toArray = (value) => (Array.isArray(value) ? value : []);
        const parseAmount = (value) => {
          if (value === null || value === undefined || value === '') {
            return 0;
          }

          const parsed = parseFloat(String(value).replace(/,/g, '').trim());
          return Number.isFinite(parsed) ? parsed : 0;
        };
        const parseQuantity = (value) => {
          const parsed = Number.parseInt(value, 10);
          return Number.isFinite(parsed) ? parsed : 0;
        };

        if (pData.requestId) {
          currentReconciliation.originRequestId = pData.requestId;
          logger.log('🔗 [NEW] Linked to Request ID:', pData.requestId);
        }

        const sysSalesInput = doc.getElementById('systemSales');
        if (sysSalesInput) {
          sysSalesInput.value = parseAmount(pData.systemSales);
        }

        const cashBreakdown = toArray(pDetails.cash_breakdown);
        for (const item of cashBreakdown) {
          const denomination = parseAmount(item?.val ?? item?.value);
          const quantity = parseQuantity(item?.qty ?? item?.count);
          if (denomination > 0 && quantity > 0) {
            await windowObj.appAPI.addCashReceipt(denomination, quantity);
          }
        }

        const bankArray = Array.isArray(pDetails.bank_receipts)
          ? pDetails.bank_receipts
          : toArray(pDetails.bank_items);
        if (bankArray && bankArray.length > 0) {
          for (const item of bankArray) {
            const atm = item?.atm_name || item?.atm || '';
            const bank = item?.bank_name || item?.bank || 'Bank';
            const amount = parseAmount(item?.amount);
            const op = item?.operation_type || item?.op || 'settlement';

            if (amount > 0) {
              await windowObj.appAPI.addDetailedBankReceipt(atm, bank, amount, op);
            }
          }
        } else if (pData.total_bank > 0) {
          await windowObj.appAPI.addDetailedBankReceipt(
            'من طلب ويب قديم',
            'تحويل',
            parseAmount(pData.total_bank),
            'settlement'
          );
        }

        const cleanWebText = (text) => {
          if (!text) return '';
          return text.toString().replace(/\uFFFD/g, '').replaceAll('\u0000', '').trim();
        };

        for (const item of toArray(pDetails.postpaid_items)) {
          const name = cleanWebText(item?.customer_name || item?.name);
          const amount = parseAmount(item?.amount);
          if (name && amount > 0) {
            await windowObj.appAPI.addPostpaidSale(name, amount);
          }
        }

        for (const item of toArray(pDetails.customer_receipts)) {
          const name = cleanWebText(item?.customer_name || item?.name);
          const notes = cleanWebText(item?.notes || '');
          const amount = parseAmount(item?.amount);
          const paymentType = cleanWebText(item?.payment_type || item?.type || 'نقدي');
          if (name && amount > 0) {
            await windowObj.appAPI.addCustomerReceipt(name, amount, paymentType, notes);
          }
        }

        for (const item of toArray(pDetails.return_items)) {
          const num = cleanWebText(item?.invoice_number || item?.num);
          const note = cleanWebText(item?.note || item?.notes || '');
          const amount = parseAmount(item?.amount);
          if (num && amount > 0) {
            await windowObj.appAPI.addReturnInvoice(num, amount, note);
          }
        }

        for (const item of toArray(pDetails.supplier_items)) {
          const name = cleanWebText(item?.supplier_name || item?.name);
          const inv = cleanWebText(item?.invoice_number || item?.inv);
          const notes = cleanWebText(item?.notes || '');
          const amount = parseAmount(item?.amount);
          const vat = parseAmount(item?.vat);
          if (name && amount > 0) {
            await windowObj.appAPI.addSupplier(name, inv, amount, vat, notes);
          }
        }

        updateSummary();

        logger.log('🧹 [INIT] Clearing pendingReconciliationData from memory');
        windowObj.pendingReconciliationData = null;

        deps.getDialogUtils().showSuccessToast('تم تحميل بيانات الطلب بنجاح');
      }
    } catch (error) {
      logger.error('Error creating reconciliation:', error);
      deps.getDialogUtils().showErrorToast('حدث خطأ أثناء إنشاء التصفية');
    }
  }

  return {
    handleNewReconciliation
  };
}

module.exports = {
  createNewReconciliationHandlers
};
