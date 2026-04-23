function extractDbErrorMessage(error) {
  return String(error && error.message ? error.message : error || '').trim();
}

function isDbConstraintError(error) {
  const message = extractDbErrorMessage(error);
  if (!message) return false;

  return (
    message.includes('SQLITE_CONSTRAINT')
    || message.includes('UNIQUE constraint failed')
    || message.includes('NOT NULL constraint failed')
    || message.includes('FOREIGN KEY constraint failed')
  );
}

function mapUniqueConstraintMessage(message, context = '') {
  const normalizedContext = String(context || '').trim().toLowerCase();

  if (message.includes('idx_branches_name_unique_nocase') || message.includes('branches.branch_name')) {
    return 'اسم الفرع موجود مسبقاً';
  }
  if (message.includes('cashiers.cashier_number')) {
    return 'رقم الكاشير موجود مسبقاً. يرجى اختيار رقم آخر.';
  }
  if (message.includes('admins.username')) {
    return 'اسم المستخدم موجود مسبقاً';
  }
  if (message.includes('reconciliations.reconciliation_number')) {
    return 'رقم التصفية مستخدم مسبقاً.';
  }
  if (message.includes('cashbox_vouchers.voucher_number') || message.includes('idx_cashbox_vouchers_type_sequence_unique')) {
    return 'رقم السند مستخدم مسبقاً. أعد المحاولة لتوليد رقم جديد.';
  }

  if (normalizedContext === 'branch') return 'اسم الفرع موجود مسبقاً';
  if (normalizedContext === 'cashier') return 'رقم الكاشير موجود مسبقاً. يرجى اختيار رقم آخر.';
  if (normalizedContext === 'admin') return 'اسم المستخدم موجود مسبقاً';

  return 'القيمة موجودة مسبقاً ولا يمكن تكرارها.';
}

function mapTriggerConstraintMessage(message) {
  if (message.includes('manual_supplier_transactions_invalid_data')) {
    return 'بيانات حركة المورد غير صالحة. تأكد من الاسم ونوع الحركة والمبلغ.';
  }
  if (message.includes('manual_postpaid_sales_invalid_data')) {
    return 'بيانات الحركة اليدوية (آجل) غير صالحة. تأكد من الاسم والمبلغ.';
  }
  if (message.includes('manual_customer_receipts_invalid_data')) {
    return 'بيانات الحركة اليدوية (مقبوض) غير صالحة. تأكد من الاسم والمبلغ.';
  }
  if (message.includes('postpaid_sales_invalid_data') || message.includes('customer_receipts_invalid_data')) {
    return 'بيانات العملاء غير صالحة. تأكد من الاسم والمبلغ ونوع الدفع.';
  }
  if (message.includes('suppliers_invalid_data')) {
    return 'بيانات المورد غير صالحة. تأكد من الاسم والمبلغ.';
  }
  if (message.includes('cashbox_vouchers_invalid_data')) {
    return 'بيانات سند الصندوق غير صالحة. تأكد من النوع والطرف والمبلغ والتاريخ.';
  }
  if (message.includes('reconciliations_invalid_status')) {
    return 'حالة التصفية غير صالحة.';
  }
  return '';
}

function mapDbErrorMessage(error, options = {}) {
  const message = extractDbErrorMessage(error);
  const context = options.context || '';
  const fallback = options.fallback || 'حدث خطأ أثناء معالجة العملية.';

  if (!message) {
    return fallback;
  }

  const triggerMessage = mapTriggerConstraintMessage(message);
  if (triggerMessage) {
    return triggerMessage;
  }

  if (message.includes('UNIQUE constraint failed') || message.includes('SQLITE_CONSTRAINT_UNIQUE')) {
    return mapUniqueConstraintMessage(message, context);
  }

  if (message.includes('NOT NULL constraint failed') || message.includes('SQLITE_CONSTRAINT_NOTNULL')) {
    return options.requiredMessage || 'جميع الحقول المطلوبة يجب إدخالها.';
  }

  if (message.includes('FOREIGN KEY constraint failed') || message.includes('SQLITE_CONSTRAINT_FOREIGNKEY')) {
    return options.foreignKeyMessage || 'القيمة المرتبطة غير صالحة أو غير موجودة.';
  }

  if (message.includes('SQLITE_CONSTRAINT')) {
    return options.constraintMessage || 'فشلت العملية بسبب قيد سلامة البيانات.';
  }

  if (message.toLowerCase().includes('invalid devicename provided')) {
    return 'اسم الطابعة المحدد غير صالح أو غير متصل. اختر طابعة متاحة أو اترك الاختيار على الطابعة الافتراضية.';
  }

  return message;
}

module.exports = {
  extractDbErrorMessage,
  isDbConstraintError,
  mapDbErrorMessage
};
