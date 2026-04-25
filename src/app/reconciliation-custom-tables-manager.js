const {
  getCustomTableTemplate,
  normalizeCustomTableDefinition,
  normalizeCustomTableDefinitions,
  setCustomTableDefinitionsInDocument
} = require('./reconciliation-custom-tables');

function createReconciliationCustomTablesManager(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const windowObj = deps.windowObj || globalThis;
  const logger = deps.logger || console;
  const formatCurrency = typeof deps.formatCurrency === 'function'
    ? deps.formatCurrency
    : ((value) => Number(value || 0).toFixed(2));
  const getCurrentReconciliation = typeof deps.getCurrentReconciliation === 'function'
    ? deps.getCurrentReconciliation
    : () => null;
  const updateSummary = typeof deps.updateSummary === 'function'
    ? deps.updateSummary
    : () => {};
  const getDialogUtils = typeof deps.getDialogUtils === 'function'
    ? deps.getDialogUtils
    : () => null;

  const state = {
    initialized: false,
    definitions: [],
    entriesByTableKey: {},
    editStateByTableKey: {}
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseAmount(value) {
    if (value === null || value === undefined || value === '') {
      return 0;
    }

    const parsed = Number.parseFloat(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getRenderableDefinitions() {
    return state.definitions.filter((definition) => {
      const entries = state.entriesByTableKey[definition.table_key] || [];
      return definition.is_active !== 0 || entries.length > 0;
    });
  }

  function ensureTableState(tableKey) {
    if (!Array.isArray(state.entriesByTableKey[tableKey])) {
      state.entriesByTableKey[tableKey] = [];
    }

    if (!state.editStateByTableKey[tableKey]) {
      state.editStateByTableKey[tableKey] = {
        editingEntryId: null
      };
    }
  }

  function getDefinitionByTableKey(tableKey) {
    return state.definitions.find((definition) => definition.table_key === tableKey) || null;
  }

  function getEntriesForTable(tableKey) {
    ensureTableState(tableKey);
    return state.entriesByTableKey[tableKey];
  }

  function getTemplateFields(definition) {
    return getCustomTableTemplate(definition.entry_template).fields;
  }

  function getFooterRowClass(definition) {
    if ((definition && Number(definition.default_sign)) < 0) {
      return 'table-warning';
    }
    return 'table-info';
  }

  function getTableTotal(tableKey) {
    return getEntriesForTable(tableKey).reduce((sum, entry) => sum + parseAmount(entry.amount), 0);
  }

  function getSummaryRowsContainer() {
    return document.getElementById('customSummaryRows');
  }

  function renderSummaryRows() {
    const container = getSummaryRowsContainer();
    if (!container) {
      return;
    }

    const definitions = getRenderableDefinitions();
    if (definitions.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = definitions.map((definition) => `
      <div class="summary-item">
        <label class="form-label">إجمالي ${escapeHtml(definition.table_name)}:</label>
        <div class="summary-value text-currency">${escapeHtml(formatCurrency(getTableTotal(definition.table_key)))}</div>
      </div>
    `).join('');
  }

  function getFieldInputId(tableKey, fieldKey) {
    return `customTableField_${tableKey}_${fieldKey}`;
  }

  function getFormId(tableKey) {
    return `customTableForm_${tableKey}`;
  }

  function getRowsBodyId(tableKey) {
    return `customTableRows_${tableKey}`;
  }

  function getTotalId(tableKey) {
    return `customTableTotal_${tableKey}`;
  }

  function getCancelEditButtonId(tableKey) {
    return `customTableCancelEdit_${tableKey}`;
  }

  function getSubmitButtonId(tableKey) {
    return `customTableSubmit_${tableKey}`;
  }

  function getFormFieldValue(tableKey, field) {
    const input = document.getElementById(getFieldInputId(tableKey, field.key));
    if (!input) {
      return '';
    }
    return (input.value || '').trim();
  }

  function setFormFieldValue(tableKey, field, value) {
    const input = document.getElementById(getFieldInputId(tableKey, field.key));
    if (input) {
      input.value = value == null ? '' : String(value);
    }
  }

  function clearForm(tableKey) {
    const definition = getDefinitionByTableKey(tableKey);
    if (!definition) {
      return;
    }

    getTemplateFields(definition).forEach((field) => {
      setFormFieldValue(tableKey, field, '');
    });

    const submitButton = document.getElementById(getSubmitButtonId(tableKey));
    if (submitButton) {
      submitButton.textContent = 'إضافة';
    }

    const cancelButton = document.getElementById(getCancelEditButtonId(tableKey));
    if (cancelButton) {
      cancelButton.classList.add('d-none');
    }

    ensureTableState(tableKey);
    state.editStateByTableKey[tableKey].editingEntryId = null;
  }

  function buildSectionHtml(definition) {
    const template = getCustomTableTemplate(definition.entry_template);

    const fieldsMarkup = template.fields.map((field) => {
      const columnClass = field.isAmount ? 'col-md-4' : 'col-md-8';
      const attributes = field.isAmount
        ? 'step="0.01" min="0.01"'
        : '';
      return `
        <div class="${columnClass}">
          <label for="${escapeHtml(getFieldInputId(definition.table_key, field.key))}" class="form-label">${escapeHtml(field.label)}</label>
          <input
            type="${escapeHtml(field.type)}"
            class="form-control"
            id="${escapeHtml(getFieldInputId(definition.table_key, field.key))}"
            ${field.required ? 'required' : ''}
            ${attributes}
            placeholder="${escapeHtml(field.label)}">
        </div>
      `;
    }).join('');

    const headerMarkup = template.fields.map((field) => `<th>${escapeHtml(field.tableLabel || field.label)}</th>`).join('');

    return `
      <div class="card mb-4 custom-reconciliation-table-card" data-custom-table-key="${escapeHtml(definition.table_key)}">
        <div class="card-header">
          <h5>${escapeHtml(definition.table_name)} <small class="text-muted">(التأثير على المجاميع حسب معادلة التصفية)</small></h5>
        </div>
        <div class="card-body">
          <form id="${escapeHtml(getFormId(definition.table_key))}" class="row g-3">
            ${fieldsMarkup}
            <div class="col-12 d-flex gap-2">
              <button type="submit" class="btn btn-primary" id="${escapeHtml(getSubmitButtonId(definition.table_key))}">إضافة</button>
              <button type="button" class="btn btn-outline-secondary d-none" id="${escapeHtml(getCancelEditButtonId(definition.table_key))}">إلغاء التعديل</button>
            </div>
          </form>
          <div class="table-responsive mt-3">
            <table class="table table-striped">
              <thead>
                <tr>
                  ${headerMarkup}
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody id="${escapeHtml(getRowsBodyId(definition.table_key))}"></tbody>
              <tfoot>
                <tr class="${escapeHtml(getFooterRowClass(definition))}">
                  <th colspan="${template.fields.length - 1}">المجموع</th>
                  <th id="${escapeHtml(getTotalId(definition.table_key))}">0.00</th>
                  <th></th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderTableRows(definition) {
    const body = document.getElementById(getRowsBodyId(definition.table_key));
    const totalEl = document.getElementById(getTotalId(definition.table_key));
    if (!body || !totalEl) {
      return;
    }

    const templateFields = getTemplateFields(definition);
    const entries = getEntriesForTable(definition.table_key);
    const editingEntryId = state.editStateByTableKey[definition.table_key]?.editingEntryId || null;

    if (entries.length === 0) {
      body.innerHTML = `
        <tr>
          <td colspan="${templateFields.length + 1}" class="text-center text-muted py-3">لا توجد بيانات بعد</td>
        </tr>
      `;
      totalEl.textContent = '0.00';
      return;
    }

    body.innerHTML = entries.map((entry) => {
      const cells = templateFields.map((field) => {
        if (field.isAmount) {
          return `<td class="text-currency">${escapeHtml(formatCurrency(entry.amount))}</td>`;
        }
        return `<td>${escapeHtml(entry.payload?.[field.key] || '-')}</td>`;
      }).join('');
      const rowClass = entry.id === editingEntryId ? ' class="table-warning"' : '';

      return `
        <tr${rowClass}>
          ${cells}
          <td>
            <button type="button" class="btn btn-sm btn-warning me-1" data-custom-action="edit" data-entry-id="${entry.id}" data-table-key="${escapeHtml(definition.table_key)}">تعديل</button>
            <button type="button" class="btn btn-sm btn-danger" data-custom-action="delete" data-entry-id="${entry.id}" data-table-key="${escapeHtml(definition.table_key)}">حذف</button>
          </td>
        </tr>
      `;
    }).join('');

    totalEl.textContent = formatCurrency(getTableTotal(definition.table_key));
  }

  function bindSectionEvents(definition) {
    const form = document.getElementById(getFormId(definition.table_key));
    if (form) {
      form.addEventListener('submit', (event) => {
        void handleSubmit(definition, event);
      });
    }

    const cancelButton = document.getElementById(getCancelEditButtonId(definition.table_key));
    if (cancelButton) {
      cancelButton.addEventListener('click', () => clearForm(definition.table_key));
    }

    const body = document.getElementById(getRowsBodyId(definition.table_key));
    if (body) {
      body.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-custom-action]');
        if (!actionButton) {
          return;
        }

        const entryId = Number.parseInt(actionButton.getAttribute('data-entry-id'), 10);
        const action = actionButton.getAttribute('data-custom-action');

        if (!Number.isFinite(entryId) || entryId <= 0) {
          return;
        }

        if (action === 'edit') {
          handleEdit(definition, entryId);
          return;
        }

        if (action === 'delete') {
          void handleDelete(definition, entryId);
        }
      });
    }
  }

  function renderSections() {
    const container = document.getElementById('customReconciliationTablesContainer');
    if (!container) {
      return;
    }

    const definitions = getRenderableDefinitions();
    if (definitions.length === 0) {
      container.innerHTML = '';
      renderSummaryRows();
      return;
    }

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h4 class="mb-0">الجداول الإضافية</h4>
        <small class="text-muted">الجداول المضافة من إعدادات معادلة التصفية تظهر هنا تلقائيًا</small>
      </div>
      ${definitions.map((definition) => buildSectionHtml(definition)).join('')}
    `;

    definitions.forEach((definition) => {
      bindSectionEvents(definition);
      renderTableRows(definition);
    });

    renderSummaryRows();
  }

  async function showDeleteConfirm(definition) {
    const dialogUtils = getDialogUtils();
    if (dialogUtils && typeof dialogUtils.showConfirm === 'function') {
      return dialogUtils.showConfirm(
        `هل تريد حذف هذا السطر من جدول ${definition.table_name}؟`,
        'تأكيد الحذف'
      );
    }

    return windowObj.confirm(`هل تريد حذف هذا السطر من جدول ${definition.table_name}؟`);
  }

  async function handleDelete(definition, entryId) {
    const confirmed = await showDeleteConfirm(definition);
    if (!confirmed) {
      return;
    }

    await ipcRenderer.invoke(
      'db-run',
      'DELETE FROM reconciliation_custom_entries WHERE id = ?',
      [entryId]
    );

    state.entriesByTableKey[definition.table_key] = getEntriesForTable(definition.table_key)
      .filter((entry) => entry.id !== entryId);

    clearForm(definition.table_key);
    renderTableRows(definition);
    renderSummaryRows();
    updateSummary();
  }

  function handleEdit(definition, entryId) {
    const entry = getEntriesForTable(definition.table_key).find((row) => row.id === entryId);
    if (!entry) {
      return;
    }

    getTemplateFields(definition).forEach((field) => {
      const value = field.isAmount
        ? entry.amount
        : (entry.payload?.[field.key] || '');
      setFormFieldValue(definition.table_key, field, value);
    });

    ensureTableState(definition.table_key);
    state.editStateByTableKey[definition.table_key].editingEntryId = entryId;

    const submitButton = document.getElementById(getSubmitButtonId(definition.table_key));
    if (submitButton) {
      submitButton.textContent = 'حفظ التعديل';
    }

    const cancelButton = document.getElementById(getCancelEditButtonId(definition.table_key));
    if (cancelButton) {
      cancelButton.classList.remove('d-none');
    }
  }

  function collectPayload(definition) {
    const payload = {};
    let amount = 0;

    for (const field of getTemplateFields(definition)) {
      const value = getFormFieldValue(definition.table_key, field);
      if (field.required && !value) {
        throw new Error(`يرجى تعبئة حقل ${field.label}`);
      }

      if (field.isAmount) {
        amount = parseAmount(value);
        if (amount <= 0) {
          throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
        }
        payload[field.key] = amount;
      } else {
        payload[field.key] = value;
      }
    }

    return { payload, amount };
  }

  async function handleSubmit(definition, event) {
    event.preventDefault();

    const currentReconciliation = getCurrentReconciliation();
    if (!currentReconciliation || !currentReconciliation.id) {
      const dialogUtils = getDialogUtils();
      if (dialogUtils && typeof dialogUtils.showValidationError === 'function') {
        dialogUtils.showValidationError('ابدأ التصفية أولًا قبل إضافة بيانات الجدول');
      }
      return;
    }

    try {
      const { payload, amount } = collectPayload(definition);
      ensureTableState(definition.table_key);

      const editState = state.editStateByTableKey[definition.table_key];
      const editingEntryId = editState.editingEntryId;
      const payloadJson = JSON.stringify(payload);

      if (editingEntryId) {
        await ipcRenderer.invoke(
          'db-run',
          `UPDATE reconciliation_custom_entries
           SET entry_payload_json = ?, amount = ?, is_modified = 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [payloadJson, amount, editingEntryId]
        );

        state.entriesByTableKey[definition.table_key] = getEntriesForTable(definition.table_key).map((entry) => (
          entry.id === editingEntryId
            ? {
              ...entry,
              payload,
              amount,
              updated_at: new Date().toISOString()
            }
            : entry
        ));
      } else {
        const result = await ipcRenderer.invoke(
          'db-run',
          `INSERT INTO reconciliation_custom_entries (
             reconciliation_id,
             definition_id,
             entry_payload_json,
             amount,
             updated_at
           ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [currentReconciliation.id, definition.id, payloadJson, amount]
        );

        state.entriesByTableKey[definition.table_key].push({
          id: result.lastInsertRowid,
          reconciliation_id: currentReconciliation.id,
          definition_id: definition.id,
          amount,
          payload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          definition
        });
      }

      clearForm(definition.table_key);
      renderTableRows(definition);
      renderSummaryRows();
      updateSummary();
    } catch (error) {
      const dialogUtils = getDialogUtils();
      if (dialogUtils && typeof dialogUtils.showValidationError === 'function') {
        dialogUtils.showValidationError(error.message || 'تعذر حفظ سطر الجدول الإضافي');
      } else {
        logger.error('❌ [CUSTOM-TABLES] Failed to save entry:', error);
      }
    }
  }

  function mergeDefinitions(nextDefinitions) {
    const merged = new Map();
    normalizeCustomTableDefinitions(nextDefinitions).forEach((definition) => {
      merged.set(definition.table_key, definition);
    });

    Object.values(state.entriesByTableKey).forEach((entries) => {
      entries.forEach((entry) => {
        if (entry.definition && !merged.has(entry.definition.table_key)) {
          merged.set(entry.definition.table_key, normalizeCustomTableDefinition(entry.definition));
        }
      });
    });

    return normalizeCustomTableDefinitions(Array.from(merged.values()));
  }

  function applyDefinitions(definitions) {
    state.definitions = mergeDefinitions(definitions);
    state.definitions.forEach((definition) => ensureTableState(definition.table_key));
    setCustomTableDefinitionsInDocument(
      document,
      state.definitions.filter((definition) => definition.is_active !== 0)
    );
    renderSections();
    updateSummary();
  }

  async function loadDefinitionsFromDatabase(includeInactive = false) {
    const query = includeInactive
      ? `SELECT * FROM reconciliation_custom_table_definitions ORDER BY display_order ASC, id ASC`
      : `SELECT * FROM reconciliation_custom_table_definitions WHERE is_active = 1 ORDER BY display_order ASC, id ASC`;
    const rows = await ipcRenderer.invoke('db-query', query);
    return normalizeCustomTableDefinitions(rows || []);
  }

  async function reloadDefinitions() {
    const definitions = await loadDefinitionsFromDatabase(false);
    applyDefinitions(definitions);
    return definitions;
  }

  function getFormulaBuckets() {
    const buckets = {};
    getRenderableDefinitions().forEach((definition) => {
      buckets[`custom:${definition.table_key}`] = getTableTotal(definition.table_key);
    });
    return buckets;
  }

  function getSerializableSections() {
    return getRenderableDefinitions().map((definition) => ({
      definition: {
        ...definition
      },
      entries: getEntriesForTable(definition.table_key).map((entry) => ({
        id: entry.id,
        reconciliation_id: entry.reconciliation_id,
        definition_id: entry.definition_id,
        amount: entry.amount,
        payload: { ...(entry.payload || {}) },
        created_at: entry.created_at || null,
        updated_at: entry.updated_at || null
      }))
    }));
  }

  async function loadEntriesForReconciliation(reconciliationId) {
    const rows = await ipcRenderer.invoke(
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
      [reconciliationId]
    );

    const grouped = new Map();
    (rows || []).forEach((row) => {
      const definition = normalizeCustomTableDefinition(row);
      if (!grouped.has(definition.table_key)) {
        grouped.set(definition.table_key, {
          definition,
          entries: []
        });
      }

      grouped.get(definition.table_key).entries.push({
        id: row.id,
        reconciliation_id: row.reconciliation_id,
        definition_id: row.definition_id,
        amount: parseAmount(row.amount),
        payload: (() => {
          try {
            const parsed = JSON.parse(row.entry_payload_json || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
          } catch (_error) {
            return {};
          }
        })(),
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        definition
      });
    });

    return Array.from(grouped.values());
  }

  function applyLoadedEntries(customSections = []) {
    state.entriesByTableKey = {};
    state.editStateByTableKey = {};

    const nextDefinitions = [];
    (customSections || []).forEach((section) => {
      if (!section || !section.definition) {
        return;
      }

      const definition = normalizeCustomTableDefinition(section.definition);
      nextDefinitions.push(definition);
      ensureTableState(definition.table_key);

      state.entriesByTableKey[definition.table_key] = (section.entries || []).map((entry) => ({
        id: entry.id,
        reconciliation_id: entry.reconciliation_id,
        definition_id: entry.definition_id || definition.id,
        amount: parseAmount(entry.amount),
        payload: entry.payload && typeof entry.payload === 'object'
          ? { ...entry.payload }
          : {},
        created_at: entry.created_at || null,
        updated_at: entry.updated_at || null,
        definition
      }));
    });

    applyDefinitions([...state.definitions, ...nextDefinitions]);
  }

  function resetEntries() {
    state.entriesByTableKey = {};
    state.editStateByTableKey = {};
    state.definitions.forEach((definition) => ensureTableState(definition.table_key));
    renderSections();
    updateSummary();
  }

  function getTotalEntriesCount() {
    return Object.values(state.entriesByTableKey).reduce((sum, entries) => sum + entries.length, 0);
  }

  async function initialize() {
    if (state.initialized) {
      return;
    }

    state.initialized = true;
    windowObj.reconciliationCustomTablesManager = api;

    windowObj.addEventListener('reconciliation-custom-table-definitions-changed', (event) => {
      const definitions = Array.isArray(event?.detail?.definitions) ? event.detail.definitions : [];
      applyDefinitions(definitions);
    });

    try {
      await reloadDefinitions();
    } catch (error) {
      logger.warn('⚠️ [CUSTOM-TABLES] تعذر تحميل تعريفات الجداول المخصصة:', error);
      applyDefinitions([]);
    }
  }

  const api = {
    initialize,
    reloadDefinitions,
    applyDefinitions,
    applyLoadedEntries,
    loadEntriesForReconciliation,
    getFormulaBuckets,
    getSerializableSections,
    resetEntries,
    getTotalEntriesCount
  };

  return api;
}

module.exports = {
  createReconciliationCustomTablesManager
};
