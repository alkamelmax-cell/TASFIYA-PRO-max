const Joi = require('joi');

// مخططات التحقق من صحة البيانات
const schemas = {
    // التحقق من صحة بيانات العميل
    customer: Joi.object({
        name: Joi.string().min(2).max(100).required()
            .pattern(/^[\u0600-\u06FFa-zA-Z0-9\s.-]+$/)
            .messages({
                'string.pattern.base': 'اسم العميل يجب أن يحتوي على حروف عربية وإنجليزية وأرقام فقط'
            }),
        phone: Joi.string().pattern(/^[0-9+]+$/).min(10).max(15).optional(),
        email: Joi.string().email().optional()
    }),

    // التحقق من صحة المعاملات المالية
    transaction: Joi.object({
        amount: Joi.number().positive().precision(2).required()
            .messages({
                'number.positive': 'يجب أن يكون المبلغ أكبر من صفر',
                'number.precision': 'يجب أن يكون المبلغ برقمين عشريين كحد أقصى'
            }),
        type: Joi.string().valid('receipt', 'postpaid').required(),
        customerName: Joi.string().min(2).max(100).required(),
        reason: Joi.string().max(500).optional().allow(''),
        date: Joi.date().iso().required()
    }),

    // التحقق من صحة بيانات التصفية
    reconciliation: Joi.object({
        cashierId: Joi.number().integer().positive().required(),
        accountantId: Joi.number().integer().positive().required(),
        reconciliationDate: Joi.date().iso().required(),
        systemSales: Joi.number().min(0).required(),
        totalReceipts: Joi.number().min(0).required(),
        surplusDeficit: Joi.number().required(),
        status: Joi.string().valid('draft', 'completed').required()
    }),

    // التحقق من صحة استعلامات قاعدة البيانات
    dbQuery: {
        // التحقق من صحة معرفات السجلات
        id: Joi.number().integer().positive(),
        
        // التحقق من صحة حقول الترتيب
        orderBy: Joi.string().valid(
            'id', 'created_at', 'amount', 'customer_name',
            'reconciliation_date', 'status'
        ),

        // التحقق من صحة اتجاه الترتيب
        orderDirection: Joi.string().valid('ASC', 'DESC'),

        // التحقق من صحة حدود الصفحات
        limit: Joi.number().integer().min(1).max(100),
        offset: Joi.number().integer().min(0),

        // التحقق من صحة نطاق التواريخ
        dateRange: Joi.object({
            start: Joi.date().iso(),
            end: Joi.date().iso().min(Joi.ref('start'))
        })
    }
};

/**
 * التحقق من صحة بيانات العميل
 * @param {Object} customerData - بيانات العميل للتحقق منها
 * @returns {Object} نتيجة التحقق
 */
function validateCustomer(customerData) {
    return schemas.customer.validate(customerData, { abortEarly: false });
}

/**
 * التحقق من صحة بيانات المعاملة
 * @param {Object} transactionData - بيانات المعاملة للتحقق منها
 * @returns {Object} نتيجة التحقق
 */
function validateTransaction(transactionData) {
    return schemas.transaction.validate(transactionData, { abortEarly: false });
}

/**
 * التحقق من صحة بيانات التصفية
 * @param {Object} reconciliationData - بيانات التصفية للتحقق منها
 * @returns {Object} نتيجة التحقق
 */
function validateReconciliation(reconciliationData) {
    return schemas.reconciliation.validate(reconciliationData, { abortEarly: false });
}

/**
 * التحقق من صحة معرف السجل
 * @param {number} id - معرف السجل للتحقق منه
 * @returns {Object} نتيجة التحقق
 */
function validateId(id) {
    return schemas.dbQuery.id.validate(id);
}

/**
 * تنظيف وتأمين استعلام SQL
 * @param {string} sql - استعلام SQL للتنظيف
 * @returns {string} استعلام SQL نظيف
 */
function sanitizeSql(sql) {
    if (typeof sql !== 'string') {
        throw new Error('الاستعلام يجب أن يكون نصياً');
    }

    // إزالة التعليقات متعددة الأسطر
    sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // إزالة التعليقات أحادية السطر
    sql = sql.replace(/--.*$/gm, '');
    
    // التحقق من عدم وجود استعلامات متعددة
    if (sql.includes(';')) {
        throw new Error('لا يسمح بالاستعلامات المتعددة');
    }

    // التحقق من الكلمات المحظورة
    const blacklist = [
        'DROP', 'TRUNCATE', 'DELETE FROM', 'UPDATE',
        'ALTER', 'EXECUTE', 'EXEC', 'DECLARE'
    ];

    const containsBlacklisted = blacklist.some(word => 
        sql.toUpperCase().includes(word)
    );

    if (containsBlacklisted) {
        throw new Error('استعلام غير مسموح به');
    }

    return sql.trim();
}

/**
 * التحقق من صحة معلمات الاستعلام
 * @param {Array} params - معلمات الاستعلام للتحقق منها
 * @returns {Array} معلمات نظيفة
 */
function validateQueryParams(params) {
    if (!Array.isArray(params)) {
        throw new Error('المعلمات يجب أن تكون مصفوفة');
    }

    return params.map(param => {
        switch (typeof param) {
            case 'string':
                // تنظيف النصوص من أي رموز خاصة
                return param.replace(/[^\u0600-\u06FF\w\s.-]/g, '');
            case 'number':
                // التحقق من أن الرقم صالح
                if (isNaN(param)) {
                    throw new Error('قيمة رقمية غير صالحة');
                }
                return param;
            case 'boolean':
                return param;
            case 'undefined':
                return null;
            default:
                throw new Error('نوع معلمة غير مدعوم');
        }
    });
}

module.exports = {
    validateCustomer,
    validateTransaction,
    validateReconciliation,
    validateId,
    sanitizeSql,
    validateQueryParams
};