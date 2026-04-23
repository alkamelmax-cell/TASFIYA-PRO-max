const {
  BANK_FEE_OPERATION_OPTIONS,
  createEmptyBankFeeRule,
  normalizeBankFeeRule,
  normalizeBankFeeSettings,
  parseStoredBankFeeSettings
} = require('./bank-fee-settings');

function createBankFeeSettingsUiHelpers(context) {
  const document = context.document;

  function getTableBody() {
    return document.getElementById('bankFeeRulesTableBody');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildOperationTypeOptions(selectedValue = '') {
    return BANK_FEE_OPERATION_OPTIONS.map((option) => {
      const isSelected = option.value === selectedValue ? ' selected' : '';
      return `<option value="${escapeHtml(option.value)}"${isSelected}>${escapeHtml(option.label)}</option>`;
    }).join('');
  }

  function buildBankFeeRuleRowHtml(rule = {}) {
    const normalizedRule = normalizeBankFeeRule(rule);
    return `
      <tr data-bank-fee-rule-row="true">
        <td>
          <input
            type="text"
            class="form-control form-control-sm"
            data-bank-fee-field="bank_name"
            value="${escapeHtml(normalizedRule.bank_name)}"
            placeholder="مثال: الراجحي أو اتركه فارغًا"
          >
        </td>
        <td>
          <select class="form-select form-select-sm" data-bank-fee-field="operation_type">
            ${buildOperationTypeOptions(normalizedRule.operation_type)}
          </select>
        </td>
        <td>
          <input
            type="number"
            class="form-control form-control-sm"
            data-bank-fee-field="fee_percent"
            value="${escapeHtml(normalizedRule.fee_percent)}"
            min="0"
            step="any"
            placeholder="0.0000"
          >
        </td>
        <td>
          <input
            type="number"
            class="form-control form-control-sm"
            data-bank-fee-field="fee_vat_percent"
            value="${escapeHtml(normalizedRule.fee_vat_percent)}"
            min="0"
            step="any"
            placeholder="15.00"
          >
        </td>
        <td class="text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-bank-fee-rule">
            حذف
          </button>
        </td>
      </tr>
    `;
  }

  function renderBankFeeRules(settings = {}) {
    const tbody = getTableBody();
    const normalizedSettings = parseStoredBankFeeSettings(settings);
    if (!tbody) {
      return normalizedSettings;
    }

    const rulesToRender = normalizedSettings.rules.length > 0
      ? normalizedSettings.rules
      : [createEmptyBankFeeRule()];

    tbody.innerHTML = rulesToRender.map((rule) => buildBankFeeRuleRowHtml(rule)).join('');
    return normalizedSettings;
  }

  function hasBlankRuleRow() {
    const rows = collectBankFeeSettingsFromDocument({ includeEmptyRows: true }).rules;
    return rows.some((rule) => (
      !rule.bank_name
      && !rule.operation_type
      && Number(rule.fee_percent || 0) === 0
      && Number(rule.fee_vat_percent || 0) === 15
    ));
  }

  function appendBankFeeRuleRow(rule = {}) {
    const tbody = getTableBody();
    if (!tbody) {
      return normalizeBankFeeRule(rule);
    }

    if (hasBlankRuleRow()) {
      return createEmptyBankFeeRule();
    }

    if (typeof tbody.querySelectorAll === 'function' && tbody.querySelectorAll('tr[data-bank-fee-rule-row="true"]').length === 0) {
      tbody.innerHTML = '';
    }

    const rowHtml = buildBankFeeRuleRowHtml(rule);
    if (typeof tbody.insertAdjacentHTML === 'function') {
      tbody.insertAdjacentHTML('beforeend', rowHtml);
    } else {
      tbody.innerHTML += rowHtml;
    }

    return normalizeBankFeeRule(rule);
  }

  function collectBankFeeSettingsFromDocument(options = {}) {
    const includeEmptyRows = options.includeEmptyRows === true;
    const tbody = getTableBody();
    if (!tbody || typeof tbody.querySelectorAll !== 'function') {
      return normalizeBankFeeSettings();
    }

    const rows = Array.from(tbody.querySelectorAll('tr[data-bank-fee-rule-row="true"]'));
    const rawRules = rows.map((row) => {
      const readField = (fieldName) => {
        const field = typeof row.querySelector === 'function'
          ? row.querySelector(`[data-bank-fee-field="${fieldName}"]`)
          : null;
        return field ? field.value : '';
      };

      return normalizeBankFeeRule({
        bank_name: readField('bank_name'),
        operation_type: readField('operation_type'),
        fee_percent: readField('fee_percent'),
        fee_vat_percent: readField('fee_vat_percent')
      });
    });

    if (includeEmptyRows) {
      return { rules: rawRules };
    }

    return normalizeBankFeeSettings({ rules: rawRules });
  }

  function removeBankFeeRuleRow(trigger) {
    const tbody = getTableBody();
    if (!tbody || !trigger || typeof trigger.closest !== 'function') {
      return;
    }

    const row = trigger.closest('tr[data-bank-fee-rule-row="true"]');
    if (row && row.parentNode) {
      row.parentNode.removeChild(row);
    }

    const currentRules = collectBankFeeSettingsFromDocument();
    if (currentRules.rules.length === 0) {
      renderBankFeeRules();
    }
  }

  return {
    renderBankFeeRules,
    appendBankFeeRuleRow,
    collectBankFeeSettingsFromDocument,
    removeBankFeeRuleRow
  };
}

module.exports = {
  createBankFeeSettingsUiHelpers
};
