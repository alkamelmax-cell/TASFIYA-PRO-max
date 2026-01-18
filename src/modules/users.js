/**
 * @file users.js
 * @description وحدة إدارة المستخدمين - تحتوي على عمليات إدارة الصلاحيات والمستخدمين
 */

const { ipcRenderer } = require('electron');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const DialogUtils = require('./dialog-utils');
const { formatDate } = require('./utils');

class UsersManager {
    constructor() {
        this.currentUser = null;
        this.permissions = new Map();
        this.userTypes = ['admin', 'accountant', 'cashier'];
        this.usersCache = new Map(); // تخزين مؤقت للمستخدمين
    }

    /**
     * تهيئة مدير المستخدمين
     */
    async initialize() {
        console.log('👥 [USERS] تهيئة مدير المستخدمين...');

        try {
            // تحميل التصاريح
            await this.loadPermissions();

            console.log('✅ [USERS] تم تهيئة مدير المستخدمين بنجاح');
        } catch (error) {
            console.error('❌ [USERS] خطأ في تهيئة مدير المستخدمين:', error);
            throw error;
        }
    }

    /**
     * تسجيل الدخول
     * @param {string} username - اسم المستخدم
     * @param {string} password - كلمة المرور
     */
    async login(username, password) {
        console.log('🔐 [LOGIN] محاولة تسجيل الدخول...');

        try {
            // التحقق من المدخلات
            const schema = Joi.object({
                username: Joi.string().min(3).max(50).required(),
                password: Joi.string().min(6).required()
            });

            const validation = schema.validate({ username, password });
            if (validation.error) {
                throw new Error(validation.error.details[0].message);
            }

            // جلب بيانات المستخدم
            const user = await ipcRenderer.invoke('db-get', 
                'SELECT * FROM users WHERE username = ?', [username]);

            if (!user) {
                throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
            }

            // التحقق من كلمة المرور
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
            }

            // التحقق من حالة الحساب
            if (!user.is_active) {
                throw new Error('هذا الحساب معطل');
            }

            // تسجيل الدخول
            await this.setCurrentUser(user);

            // تسجيل محاولة الدخول
            await this.logLoginAttempt(user.id, true);

            console.log('✅ [LOGIN] تم تسجيل الدخول بنجاح:', username);
            DialogUtils.showSuccessToast(`مرحباً ${user.name}`);

            return user;

        } catch (error) {
            console.error('❌ [LOGIN] خطأ في تسجيل الدخول:', error);

            // تسجيل محاولة الدخول الفاشلة
            if (error.userId) {
                await this.logLoginAttempt(error.userId, false);
            }

            throw error;
        }
    }

    /**
     * تسجيل الخروج
     */
    async logout() {
        console.log('🔒 [LOGOUT] تسجيل الخروج...');

        try {
            if (!this.currentUser) return;

            // تسجيل الخروج
            await ipcRenderer.invoke('user-logout', this.currentUser.id);

            // مسح بيانات المستخدم
            this.currentUser = null;
            this.permissions.clear();
            this.usersCache.clear();

            console.log('✅ [LOGOUT] تم تسجيل الخروج بنجاح');
            DialogUtils.showSuccessToast('تم تسجيل الخروج بنجاح');

        } catch (error) {
            console.error('❌ [LOGOUT] خطأ في تسجيل الخروج:', error);
            throw error;
        }
    }

    /**
     * تحديد المستخدم الحالي
     * @private
     * @param {Object} user - بيانات المستخدم
     */
    async setCurrentUser(user) {
        // حفظ بيانات المستخدم
        this.currentUser = {
            id: user.id,
            name: user.name,
            username: user.username,
            type: user.user_type,
            permissions: await this.getUserPermissions(user.id)
        };

        // تحديث حالة الواجهة
        document.dispatchEvent(new CustomEvent('userChanged', { 
            detail: { user: this.currentUser }
        }));
    }

    /**
     * إنشاء مستخدم جديد
     * @param {Object} userData - بيانات المستخدم
     */
    async createUser(userData) {
        console.log('➕ [USERS] إنشاء مستخدم جديد...');

        try {
            // التحقق من الصلاحيات
            if (!this.hasPermission('manage_users')) {
                throw new Error('ليس لديك صلاحية لإنشاء مستخدم جديد');
            }

            // التحقق من المدخلات
            const schema = Joi.object({
                name: Joi.string().min(3).max(100).required(),
                username: Joi.string().min(3).max(50).required(),
                password: Joi.string().min(6).required(),
                userType: Joi.string().valid(...this.userTypes).required(),
                permissions: Joi.array().items(Joi.string()).default([])
            });

            const validation = schema.validate(userData);
            if (validation.error) {
                throw new Error(validation.error.details[0].message);
            }

            // التحقق من عدم وجود المستخدم
            const exists = await ipcRenderer.invoke('db-get',
                'SELECT id FROM users WHERE username = ?', [userData.username]);

            if (exists) {
                throw new Error('اسم المستخدم موجود مسبقاً');
            }

            // تشفير كلمة المرور
            const hashedPassword = await bcrypt.hash(userData.password, 10);

            // إنشاء المستخدم
            const userId = await ipcRenderer.invoke('db-run',
                `INSERT INTO users (name, username, password, user_type, created_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [userData.name, userData.username, hashedPassword, userData.userType, new Date().toISOString()]
            );

            // إضافة الصلاحيات
            if (userData.permissions && userData.permissions.length > 0) {
                await this.updateUserPermissions(userId, userData.permissions);
            }

            console.log('✅ [USERS] تم إنشاء المستخدم بنجاح:', userData.username);
            DialogUtils.showSuccessToast('تم إنشاء المستخدم بنجاح');

            // تحديث التخزين المؤقت
            this.usersCache.clear();

            return userId;

        } catch (error) {
            console.error('❌ [USERS] خطأ في إنشاء المستخدم:', error);
            throw error;
        }
    }

    /**
     * تحديث بيانات مستخدم
     * @param {number} userId - معرف المستخدم
     * @param {Object} updates - التحديثات
     */
    async updateUser(userId, updates) {
        console.log('📝 [USERS] تحديث بيانات المستخدم:', userId);

        try {
            // التحقق من الصلاحيات
            if (!this.hasPermission('manage_users')) {
                throw new Error('ليس لديك صلاحية لتحديث بيانات المستخدم');
            }

            // التحقق من المدخلات
            const schema = Joi.object({
                name: Joi.string().min(3).max(100),
                password: Joi.string().min(6),
                userType: Joi.string().valid(...this.userTypes),
                isActive: Joi.boolean(),
                permissions: Joi.array().items(Joi.string())
            });

            const validation = schema.validate(updates);
            if (validation.error) {
                throw new Error(validation.error.details[0].message);
            }

            // تجهيز التحديثات
            const fields = [];
            const values = [];

            if (updates.name) {
                fields.push('name = ?');
                values.push(updates.name);
            }

            if (updates.password) {
                fields.push('password = ?');
                values.push(await bcrypt.hash(updates.password, 10));
            }

            if (updates.userType) {
                fields.push('user_type = ?');
                values.push(updates.userType);
            }

            if (typeof updates.isActive === 'boolean') {
                fields.push('is_active = ?');
                values.push(updates.isActive);
            }

            if (fields.length > 0) {
                // تحديث البيانات
                values.push(userId);
                await ipcRenderer.invoke('db-run',
                    `UPDATE users SET ${fields.join(', ')}, updated_at = ? 
                     WHERE id = ?`,
                    [...values, new Date().toISOString()]
                );
            }

            // تحديث الصلاحيات
            if (updates.permissions) {
                await this.updateUserPermissions(userId, updates.permissions);
            }

            console.log('✅ [USERS] تم تحديث بيانات المستخدم بنجاح');
            DialogUtils.showSuccessToast('تم تحديث بيانات المستخدم بنجاح');

            // تحديث التخزين المؤقت
            this.usersCache.clear();

            // إذا كان المستخدم الحالي
            if (this.currentUser && this.currentUser.id === userId) {
                const user = await this.getUser(userId);
                await this.setCurrentUser(user);
            }

        } catch (error) {
            console.error('❌ [USERS] خطأ في تحديث بيانات المستخدم:', error);
            throw error;
        }
    }

    /**
     * تغيير كلمة المرور
     * @param {string} currentPassword - كلمة المرور الحالية
     * @param {string} newPassword - كلمة المرور الجديدة
     */
    async changePassword(currentPassword, newPassword) {
        console.log('🔑 [USERS] تغيير كلمة المرور...');

        try {
            if (!this.currentUser) {
                throw new Error('يجب تسجيل الدخول أولاً');
            }

            // التحقق من المدخلات
            const schema = Joi.object({
                currentPassword: Joi.string().min(6).required(),
                newPassword: Joi.string().min(6).required()
            });

            const validation = schema.validate({ currentPassword, newPassword });
            if (validation.error) {
                throw new Error(validation.error.details[0].message);
            }

            // التحقق من كلمة المرور الحالية
            const user = await ipcRenderer.invoke('db-get',
                'SELECT password FROM users WHERE id = ?', [this.currentUser.id]);

            const isValid = await bcrypt.compare(currentPassword, user.password);
            if (!isValid) {
                throw new Error('كلمة المرور الحالية غير صحيحة');
            }

            // تشفير وتحديث كلمة المرور
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await this.updateUser(this.currentUser.id, { password: hashedPassword });

            console.log('✅ [USERS] تم تغيير كلمة المرور بنجاح');
            DialogUtils.showSuccessToast('تم تغيير كلمة المرور بنجاح');

        } catch (error) {
            console.error('❌ [USERS] خطأ في تغيير كلمة المرور:', error);
            throw error;
        }
    }

    /**
     * جلب قائمة المستخدمين
     * @param {Object} filters - مرشحات البحث
     */
    async getUsers(filters = {}) {
        try {
            // التحقق من الصلاحيات
            if (!this.hasPermission('view_users')) {
                throw new Error('ليس لديك صلاحية لعرض المستخدمين');
            }

            let query = `
                SELECT u.id, u.name, u.username, u.user_type, u.is_active,
                       u.created_at, u.updated_at, u.last_login
                FROM users u
                WHERE 1=1
            `;
            const params = [];

            // إضافة المرشحات
            if (filters.userType) {
                query += ' AND u.user_type = ?';
                params.push(filters.userType);
            }

            if (typeof filters.isActive === 'boolean') {
                query += ' AND u.is_active = ?';
                params.push(filters.isActive);
            }

            if (filters.search) {
                query += ' AND (u.name LIKE ? OR u.username LIKE ?)';
                const searchPattern = `%${filters.search}%`;
                params.push(searchPattern, searchPattern);
            }

            query += ' ORDER BY u.name';

            const users = await ipcRenderer.invoke('db-all', query, params);

            // تخزين في الذاكرة المؤقتة
            users.forEach(user => this.usersCache.set(user.id, user));

            return users;

        } catch (error) {
            console.error('❌ [USERS] خطأ في جلب قائمة المستخدمين:', error);
            throw error;
        }
    }

    /**
     * جلب بيانات مستخدم
     * @param {number} userId - معرف المستخدم
     */
    async getUser(userId) {
        try {
            // التحقق من التخزين المؤقت
            if (this.usersCache.has(userId)) {
                return this.usersCache.get(userId);
            }

            const user = await ipcRenderer.invoke('db-get',
                `SELECT id, name, username, user_type, is_active,
                        created_at, updated_at, last_login
                 FROM users WHERE id = ?`, [userId]);

            if (user) {
                // تخزين في الذاكرة المؤقتة
                this.usersCache.set(userId, user);
            }

            return user;

        } catch (error) {
            console.error('❌ [USERS] خطأ في جلب بيانات المستخدم:', error);
            throw error;
        }
    }

    /**
     * تحميل التصاريح
     * @private
     */
    async loadPermissions() {
        try {
            const permissions = await ipcRenderer.invoke('db-all',
                'SELECT * FROM permissions');

            this.permissions.clear();
            permissions.forEach(p => {
                this.permissions.set(p.name, {
                    id: p.id,
                    name: p.name,
                    description: p.description
                });
            });

        } catch (error) {
            console.error('❌ [USERS] خطأ في تحميل التصاريح:', error);
            throw error;
        }
    }

    /**
     * جلب صلاحيات مستخدم
     * @private
     * @param {number} userId - معرف المستخدم
     */
    async getUserPermissions(userId) {
        try {
            const perms = await ipcRenderer.invoke('db-all',
                `SELECT p.name
                 FROM user_permissions up
                 JOIN permissions p ON up.permission_id = p.id
                 WHERE up.user_id = ?`, [userId]);

            return perms.map(p => p.name);

        } catch (error) {
            console.error('❌ [USERS] خطأ في جلب صلاحيات المستخدم:', error);
            throw error;
        }
    }

    /**
     * تحديث صلاحيات مستخدم
     * @private
     * @param {number} userId - معرف المستخدم
     * @param {Array} permissions - الصلاحيات
     */
    async updateUserPermissions(userId, permissions) {
        try {
            // حذف الصلاحيات الحالية
            await ipcRenderer.invoke('db-run',
                'DELETE FROM user_permissions WHERE user_id = ?', [userId]);

            if (permissions.length > 0) {
                // إضافة الصلاحيات الجديدة
                const values = permissions
                    .filter(p => this.permissions.has(p))
                    .map(p => [userId, this.permissions.get(p).id]);

                if (values.length > 0) {
                    await ipcRenderer.invoke('db-run',
                        `INSERT INTO user_permissions (user_id, permission_id)
                         VALUES ${values.map(() => '(?, ?)').join(', ')}`,
                        values.flat()
                    );
                }
            }

        } catch (error) {
            console.error('❌ [USERS] خطأ في تحديث صلاحيات المستخدم:', error);
            throw error;
        }
    }

    /**
     * التحقق من وجود صلاحية
     * @param {string} permission - الصلاحية المطلوبة
     */
    hasPermission(permission) {
        if (!this.currentUser) return false;
        if (this.currentUser.type === 'admin') return true;
        return this.currentUser.permissions.includes(permission);
    }

    /**
     * تسجيل محاولة الدخول
     * @private
     * @param {number} userId - معرف المستخدم
     * @param {boolean} success - نجاح المحاولة
     */
    async logLoginAttempt(userId, success) {
        try {
            await ipcRenderer.invoke('db-run',
                `INSERT INTO login_attempts (user_id, success, attempt_time, ip_address)
                 VALUES (?, ?, ?, ?)`,
                [userId, success ? 1 : 0, new Date().toISOString(), await this.getIpAddress()]
            );

            if (success) {
                await ipcRenderer.invoke('db-run',
                    'UPDATE users SET last_login = ? WHERE id = ?',
                    [new Date().toISOString(), userId]
                );
            }

        } catch (error) {
            console.error('❌ [USERS] خطأ في تسجيل محاولة الدخول:', error);
        }
    }

    /**
     * الحصول على عنوان IP
     * @private
     */
    async getIpAddress() {
        try {
            return await ipcRenderer.invoke('get-ip-address');
        } catch (error) {
            console.error('❌ [USERS] خطأ في الحصول على عنوان IP:', error);
            return '127.0.0.1';
        }
    }
}

module.exports = new UsersManager();