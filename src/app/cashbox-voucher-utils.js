function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSyncKeyText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function encodeSyncKeyPart(value, fallback = '-') {
  const normalized = normalizeSyncKeyText(value);
  return String(normalized || fallback).replace(/\s/g, '%20');
}

function normalizeSyncTimestamp(value) {
  const normalized = normalizeSyncKeyText(value);
  if (!normalized) {
    return '';
  }

  return normalized
    .replace('T', ' ')
    .replace(/Z$/i, '')
    .replace(/\.\d+$/, '')
    .trim();
}

function buildCashboxVoucherSyncKey(voucher = {}) {
  const explicitSyncKey = normalizeSyncKeyText(voucher.sync_key || voucher.syncKey);
  if (explicitSyncKey) {
    return explicitSyncKey;
  }

  const sourceReconciliationId = toNumber(
    voucher.source_reconciliation_id ?? voucher.sourceReconciliationId,
    0
  );
  const sourceEntryKey = normalizeSyncKeyText(
    voucher.source_entry_key ?? voucher.sourceEntryKey
  );

  if (sourceReconciliationId > 0 && sourceEntryKey) {
    return `recon:${sourceReconciliationId}:${encodeSyncKeyPart(sourceEntryKey)}`;
  }

  const localId = toNumber(voucher.id ?? voucher.local_id ?? voucher.localId, 0);
  const voucherNumber = toNumber(voucher.voucher_number ?? voucher.voucherNumber, 0);
  const voucherSequenceNumber = toNumber(
    voucher.voucher_sequence_number ?? voucher.voucherSequenceNumber,
    0
  );
  const localIdentity = localId > 0
    ? localId
    : (voucherNumber > 0 ? voucherNumber : voucherSequenceNumber);
  const createdAt = normalizeSyncTimestamp(voucher.created_at ?? voucher.createdAt)
    || normalizeSyncTimestamp(voucher.updated_at ?? voucher.updatedAt)
    || normalizeSyncTimestamp(voucher.voucher_date ?? voucher.voucherDate)
    || 'no-timestamp';

  return `manual:${encodeSyncKeyPart(createdAt, 'no-timestamp')}:${localIdentity || 0}`;
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
