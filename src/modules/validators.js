/**
 * @file validators.js
 * @description وحدة التحقق - تحتوي على مخططات وقواعد التحقق من البيانات
 */

const Joi = require('joi');

class Validators {
    constructor() {
        // تعريف الثوابت المشتركة
        this.PHONE_REGEX = /^(05|9665)\d{8}$/;
        this.AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;
        this.ID_REGEX = /^[A-Z0-9]{10}$/;
        this.EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    }

    /**
     * تحقق من بيانات المستخدم
     */
    get userSchema() {
        return Joi.object({
            name: Joi.string()
                .min(3)
                .max(100)
                .required()
                .messages({
                    'string.min': 'يجب أن يكون الاسم 3 أحرف على الأقل',
                    'string.max': 'يجب أن لا يتجاوز الاسم 100 حرف',
                    'string.empty': 'الاسم مطلوب',
                    'any.required': 'الاسم مطلوب'
                }),

            username: Joi.string()
                .min(3)
                .max(50)
                .pattern(/^[a-zA-Z0-9_]+$/)
                .required()
                .messages({
                    'string.min': 'يجب أن يكون اسم المستخدم 3 أحرف على الأقل',
                    'string.max': 'يجب أن لا يتجاوز اسم المستخدم 50 حرف',
                    'string.pattern.base': 'اسم المستخدم يجب أن يحتوي على أحرف وأرقام وشرطة سفلية فقط',
                    'string.empty': 'اسم المستخدم مطلوب',
                    'any.required': 'اسم المستخدم مطلوب'
                }),

            password: Joi.string()
                .min(6)
                .pattern(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/)
                .required()
                .messages({
                    'string.min': 'يجب أن تكون كلمة المرور 6 أحرف على الأقل',
                    'string.pattern.base': 'كلمة المرور يجب أن تحتوي على أحرف وأرقام',
                    'string.empty': 'كلمة المرور مطلوبة',
                    'any.required': 'كلمة المرور مطلوبة'
                }),

            email: Joi.string()
                .pattern(this.EMAIL_REGEX)
                .allow(null, '')
                .messages({
                    'string.pattern.base': 'البريد الإلكتروني غير صحيح'
                }),

            phone: Joi.string()
                .pattern(this.PHONE_REGEX)
                .allow(null, '')
                .messages({
                    'string.pattern.base': 'رقم الجوال غير صحيح'
                }),

            userType: Joi.string()
                .valid('admin', 'accountant', 'cashier')
                .required()
                .messages({
                    'any.only': 'نوع المستخدم غير صحيح',
                    'any.required': 'نوع المستخدم مطلوب'
                }),

            isActive: Joi.boolean()
                .default(true)
        });
    }

    /**
     * تحقق من بيانات الكاشير
     */
    get cashierSchema() {
        return Joi.object({
            name: Joi.string()
                .min(3)
                .max(100)
                .required()
                .messages({
                    'string.min': 'يجب أن يكون الاسم 3 أحرف على الأقل',
                    'string.max': 'يجب أن لا يتجاوز الاسم 100 حرف',
                    'string.empty': 'الاسم مطلوب',
                    'any.required': 'الاسم مطلوب'
                }),

            cashierNumber: Joi.string()
                .min(3)
                .max(20)
                .required()
                .messages({
                    'string.min': 'يجب أن يكون رقم الكاشير 3 أحرف على الأقل',
                    'string.max': 'يجب أن لا يتجاوز رقم الكاشير 20 حرف',
                    'string.empty': 'رقم الكاشير مطلوب',
                    'any.required': 'رقم الكاشير مطلوب'
                }),

            branchId: Joi.number()
                .integer()
                .positive()
                .required()
                .messages({
                    'number.base': 'الفرع مطلوب',
                    'number.positive': 'معرف الفرع غير صحيح',
                    'any.required': 'الفرع مطلوب'
                }),

            phone: Joi.string()
                .pattern(this.PHONE_REGEX)
                .allow(null, '')
                .messages({
                    'string.pattern.base': 'رقم الجوال غير صحيح'
                }),

            isActive: Joi.boolean()
                .default(true)
        });
    }

    /**
     * تحقق من بيانات المحاسب
     */
    get accountantSchema() {
        return Joi.object({
            name: Joi.string()
                .min(3)
                .max(100)
                .required()
                .messages({
                    'string.min': 'يجب أن يكون الاسم 3 أحرف على الأقل',
                    'string.max': 'يجب أن لا يتجاوز الاسم 100 حرف',
                    'string.empty': 'الاسم مطلوب',
                    'any.required': 'الاسم مطلوب'
                }),

            idNumber: Joi.string()
                .pattern(this.ID_REGEX)
                .required()
                .messages({
                    'string.pattern.base': 'رقم الهوية غير صحيح',
                    'string.empty': 'رقم الهوية مطلوب',
                    'any.required': 'رقم الهوية مطلوب'
                }),

            phone: Joi.string()
                .pattern(this.PHONE_REGEX)
                .required()
                .messages({
                    'string.pattern.base': 'رقم الجوال غير صحيح',
                    'string.empty': 'رقم الجوال مطلوب',
                    'any.required': 'رقم الجوال مطلوب'
                }),

            email: Joi.string()
                .pattern(this.EMAIL_REGEX)
                .required()
                .messages({
                    'string.pattern.base': 'البريد الإلكتروني غير صحيح',
                    'string.empty': 'البريد الإلكتروني مطلوب',
                    'any.required': 'البريد الإلكتروني مطلوب'
                }),

            isActive: Joi.boolean()
                .default(true)
        });
    }

    /**
     * تحقق من بيانات التصفية
     */
    get reconciliationSchema() {
        return Joi.object({
            cashierId: Joi.number()
                .integer()
                .positive()
                .required()
                .messages({
                    'number.base': 'الكاشير مطلوب',
                    'number.positive': 'معرف الكاشير غير صحيح',
                    'any.required': 'الكاشير مطلوب'
                }),

            accountantId: Joi.number()
                .integer()
                .positive()
                .required()
                .messages({
                    'number.base': 'المحاسب مطلوب',
                    'number.positive': 'معرف المحاسب غير صحيح',
                    'any.required': 'المحاسب مطلوب'
                }),

            reconciliationDate: Joi.date()
                .iso()
                .required()
                .messages({
                    'date.base': 'تاريخ التصفية غير صحيح',
                    'date.format': 'تاريخ التصفية غير صحيح',
                    'any.required': 'تاريخ التصفية مطلوب'
                }),

            totalReceipts: Joi.string()
                .pattern(this.AMOUNT_REGEX)
                .required()
                .messages({
                    'string.pattern.base': 'إجمالي المقبوضات غير صحيح',
                    'string.empty': 'إجمالي المقبوضات مطلوب',
                    'any.required': 'إجمالي المقبوضات مطلوب'
                }),

            systemSales: Joi.string()
                .pattern(this.AMOUNT_REGEX)
                .required()
                .messages({
                    'string.pattern.base': 'مبيعات النظام غير صحيحة',
                    'string.empty': 'مبيعات النظام مطلوبة',
                    'any.required': 'مبيعات النظام مطلوبة'
                }),

            surplusDeficit: Joi.string()
                .pattern(/^-?\d+(\.\d{1,2})?$/)
                .required()
                .messages({
                    'string.pattern.base': 'الفائض/العجز غير صحيح',
                    'string.empty': 'الفائض/العجز مطلوب',
                    'any.required': 'الفائض/العجز مطلوب'
                }),

            notes: Joi.string()
                .max(500)
                .allow(null, '')
                .messages({
                    'string.max': 'يجب أن لا تتجاوز الملاحظات 500 حرف'
                }),

            status: Joi.string()
                .valid('draft', 'completed')
                .default('draft')
                .messages({
                    'any.only': 'حالة التصفية غير صحيحة'
                })
        });
    }

    /**
     * تحقق من بيانات الإيصال
     */
    get receiptSchema() {
        return Joi.object({
            reconciliationId: Joi.number()
                .integer()
                .positive()
                .required()
                .messages({
                    'number.base': 'رقم التصفية مطلوب',
                    'number.positive': 'رقم التصفية غير صحيح',
                    'any.required': 'رقم التصفية مطلوب'
                }),

            receiptType: Joi.string()
                .valid('cash', 'card', 'cheque', 'transfer')
                .required()
                .messages({
                    'any.only': 'نوع الإيصال غير صحيح',
                    'any.required': 'نوع الإيصال مطلوب'
                }),

            amount: Joi.string()
                .pattern(this.AMOUNT_REGEX)
                .required()
                .messages({
                    'string.pattern.base': 'المبلغ غير صحيح',
                    'string.empty': 'المبلغ مطلوب',
                    'any.required': 'المبلغ مطلوب'
                }),

            cardNumber: Joi.when('receiptType', {
                is: 'card',
                then: Joi.string()
                    .pattern(/^\d{4}$/)
                    .required()
                    .messages({
                        'string.pattern.base': 'آخر 4 أرقام من البطاقة غير صحيحة',
                        'string.empty': 'آخر 4 أرقام من البطاقة مطلوبة',
                        'any.required': 'آخر 4 أرقام من البطاقة مطلوبة'
                    }),
                otherwise: Joi.string().allow(null, '')
            }),

            chequeNumber: Joi.when('receiptType', {
                is: 'cheque',
                then: Joi.string()
                    .pattern(/^\d+$/)
                    .required()
                    .messages({
                        'string.pattern.base': 'رقم الشيك غير صحيح',
                        'string.empty': 'رقم الشيك مطلوب',
                        'any.required': 'رقم الشيك مطلوب'
                    }),
                otherwise: Joi.string().allow(null, '')
            }),

            bankName: Joi.when('receiptType', {
                is: Joi.valid('cheque', 'transfer'),
                then: Joi.string()
                    .required()
                    .messages({
                        'string.empty': 'اسم البنك مطلوب',
                        'any.required': 'اسم البنك مطلوب'
                    }),
                otherwise: Joi.string().allow(null, '')
            }),

            referenceNumber: Joi.when('receiptType', {
                is: 'transfer',
                then: Joi.string()
                    .pattern(/^[A-Z0-9]+$/)
                    .required()
                    .messages({
                        'string.pattern.base': 'رقم المرجع غير صحيح',
                        'string.empty': 'رقم المرجع مطلوب',
                        'any.required': 'رقم المرجع مطلوب'
                    }),
                otherwise: Joi.string().allow(null, '')
            }),

            notes: Joi.string()
                .max(200)
                .allow(null, '')
                .messages({
                    'string.max': 'يجب أن لا تتجاوز الملاحظات 200 حرف'
                })
        });
    }

    /**
     * تحقق من مرشحات التقرير
     */
    get reportFiltersSchema() {
        return Joi.object({
            dateFrom: Joi.date()
                .iso()
                .allow(null)
                .messages({
                    'date.base': 'تاريخ البداية غير صحيح'
                }),

            dateTo: Joi.date()
                .iso()
                .allow(null)
                .min(Joi.ref('dateFrom'))
                .messages({
                    'date.base': 'تاريخ النهاية غير صحيح',
                    'date.min': 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية'
                }),

            branchId: Joi.number()
                .integer()
                .positive()
                .allow(null)
                .messages({
                    'number.base': 'معرف الفرع غير صحيح',
                    'number.positive': 'معرف الفرع غير صحيح'
                }),

            cashierId: Joi.number()
                .integer()
                .positive()
                .allow(null)
                .messages({
                    'number.base': 'معرف الكاشير غير صحيح',
                    'number.positive': 'معرف الكاشير غير صحيح'
                }),

            accountantId: Joi.number()
                .integer()
                .positive()
                .allow(null)
                .messages({
                    'number.base': 'معرف المحاسب غير صحيح',
                    'number.positive': 'معرف المحاسب غير صحيح'
                }),

            status: Joi.string()
                .valid('draft', 'completed')
                .allow(null)
                .messages({
                    'any.only': 'حالة التصفية غير صحيحة'
                }),

            minAmount: Joi.number()
                .min(0)
                .allow(null)
                .messages({
                    'number.base': 'الحد الأدنى للمبلغ غير صحيح',
                    'number.min': 'الحد الأدنى للمبلغ يجب أن يكون صفر أو أكبر'
                }),

            maxAmount: Joi.number()
                .min(Joi.ref('minAmount'))
                .allow(null)
                .messages({
                    'number.base': 'الحد الأقصى للمبلغ غير صحيح',
                    'number.min': 'الحد الأقصى للمبلغ يجب أن يكون أكبر من الحد الأدنى'
                }),

            searchText: Joi.string()
                .max(50)
                .allow(null, '')
                .messages({
                    'string.max': 'يجب أن لا يتجاوز نص البحث 50 حرف'
                })
        });
    }

    /**
     * تحقق من البيانات باستخدام مخطط محدد
     * @param {Object} data - البيانات المراد التحقق منها
     * @param {Object} schema - مخطط التحقق
     */
    validate(data, schema) {
        const { error, value } = schema.validate(data, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => detail.message);
            throw new Error(errors.join('\n'));
        }

        return value;
    }
}

module.exports = new Validators();