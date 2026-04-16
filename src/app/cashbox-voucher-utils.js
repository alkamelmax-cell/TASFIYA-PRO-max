function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toOptionalText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function buildCashboxVoucherSyncKey(voucher = {}, options = {}) {
  const explicitSyncKey = toOptionalText(voucher.sync_key ?? voucher.syncKey);
  if (explicitSyncKey) {
    return explicitSyncKey;
  }

  const localCashboxToBranchMap = options.localCashboxToBranchMap instanceof Map
    ? options.localCashboxToBranchMap
    : new Map();

  const localCashboxId = parseInteger(voucher.cashbox_id ?? voucher.cashboxId);
  let branchId = parseInteger(options.branchId ?? voucher.branch_id ?? voucher.branchId);
  if (branchId === null && localCashboxId !== null && localCashboxToBranchMap.has(localCashboxId)) {
    branchId = localCashboxToBranchMap.get(localCashboxId);
  }

  if (branchId === null) {
    return null;
  }

  const sourceReconciliationId = parseInteger(
    voucher.source_reconciliation_id ?? voucher.sourceReconciliationId
  );
  const sourceEntryKey = toOptionalText(voucher.source_entry_key ?? voucher.sourceEntryKey);
  if (sourceReconciliationId !== null && sourceEntryKey) {
    return `recon:${sourceReconciliationId}:${sourceEntryKey}`;
  }

  const voucherType = toOptionalText(voucher.voucher_type ?? voucher.voucherType) || 'unknown';
  const voucherSequenceNumber = parseInteger(
    voucher.voucher_sequence_number ?? voucher.voucherSequenceNumber
  );
  if (voucherSequenceNumber !== null) {
    return `seq:${branchId}:${voucherType}:${voucherSequenceNumber}`;
  }

  const voucherNumber = parseInteger(voucher.voucher_number ?? voucher.voucherNumber);
  if (voucherNumber !== null) {
    return `num:${branchId}:${voucherType}:${voucherNumber}`;
  }

  const voucherDate = toOptionalText(voucher.voucher_date ?? voucher.voucherDate) || 'na';
  const amount = toNumber(voucher.amount, 0);
  const counterpartyType = toOptionalText(voucher.counterparty_type ?? voucher.counterpartyType) || 'na';
  const counterpartyName = toOptionalText(voucher.counterparty_name ?? voucher.counterpartyName) || 'na';
  const createdAt = toOptionalText(voucher.created_at ?? voucher.createdAt) || 'na';
  const localId = toOptionalText(voucher.id ?? voucher.local_id ?? voucher.localId) || 'na';

  return `fallback:${branchId}:${voucherType}:${voucherDate}:${amount}:${counterpartyType}:${counterpartyName}:${createdAt}:${localId}`;
}

function buildCashboxVoucherLabel(voucherType, voucherSequenceNumber, fallbackVoucherNumber = 0) {
  const prefix = voucherType === 'receipt' ? 'قبض' : 'صرف';
  const primaryNumber = Number(voucherSequenceNumber);
  const resolvedNumber = Number.isFinite(primaryNumber) && primaryNumber > 0
    ? primaryNumber
    : toNumber(fallbackVoucherNumber, 0);
  return `${prefix}-${String(resolvedNumber).padStart(6, '0')}`;
}

function getCashboxVoucherChangedFields(previousVoucher, nextValues = {}) {
  const changedFields = [];
  const addField = (label) => {
    if (!changedFields.includes(label)) {
      changedFields.push(label);
    }
  };

  if (String(previousVoucher?.branch_id || '') !== String(nextValues.branchId || '')) {
    addField('الفرع');
  }

  if (String(previousVoucher?.counterparty_name || '') !== String(nextValues.counterpartyName || '')) {
    addField(previousVoucher?.counterparty_type === 'cashier' ? 'الكاشير' : 'المورد');
  }

  if (String(previousVoucher?.cashier_id || '') !== String(nextValues.cashierId || '')) {
    addField('الكاشير');
  }

  if (toNumber(previousVoucher?.amount, 0) !== Math.abs(toNumber(nextValues.amount, 0))) {
    addField('المبلغ');
  }

  if (String(previousVoucher?.voucher_date || '') !== String(nextValues.voucherDate || '')) {
    addField('التاريخ');
  }

  if (String(previousVoucher?.reference_no || '') !== String(nextValues.referenceNo || '')) {
    addField('المرجع');
  }

  if (String(previousVoucher?.description || '') !== String(nextValues.description || '')) {
    addField('البيان');
  }

  return changedFields;
}

function buildCashboxVoucherAuditNote(options = {}) {
  const actionType = options.actionType || 'update';
  const voucherType = options.voucherType || options.previousVoucher?.voucher_type || options.nextValues?.voucherType || 'receipt';
  const label = buildCashboxVoucherLabel(
    voucherType,
    options.voucherSequenceNumber,
    options.voucherNumber
  );
  const voucherTypeLabel = voucherType === 'receipt' ? 'سند قبض' : 'سند صرف';

  if (actionType === 'create') {
    return `إنشاء ${voucherTypeLabel} ${label}`;
  }

  if (actionType === 'delete') {
    return `حذف ${voucherTypeLabel} ${label}`;
  }

  const changedFields = getCashboxVoucherChangedFields(options.previousVoucher, options.nextValues);
  if (changedFields.length === 0) {
    return `تعديل ${voucherTypeLabel} ${label}`;
  }

  return `تعديل ${voucherTypeLabel} ${label}: ${changedFields.join('، ')}`;
}

module.exports = {
  buildCashboxVoucherLabel,
  buildCashboxVoucherSyncKey,
  getCashboxVoucherChangedFields,
  buildCashboxVoucherAuditNote
};
