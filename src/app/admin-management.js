const { mapDbErrorMessage } = require('./db-error-messages');

function createAdminManagementHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const formatDate = deps.formatDate;
  const windowObj = deps.windowObj || globalThis;
  const logger = deps.logger || console;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);

  let editingAdminId = null;

  function canManageAdmins() {
    const submitBtn = doc.querySelector('#addAdminForm button[type="submit"]');
    return !submitBtn || !submitBtn.disabled;
  }

  async function handleAddAdmin(event) {
    event.preventDefault();

    const name = doc.getElementById('adminNameInput').value.trim();
    const username = doc.getElementById('adminUsernameInput').value.trim();
    const passwordInput = doc.getElementById('adminPasswordInput');
    const password = passwordInput.value.trim();
    const dialogUtils = getDialogUtils();

    if (!name || !username || (!editingAdminId && !password)) {
      dialogUtils.showValidationError('يرجى ملء جميع الحقول');
      return;
    }

    if (!canManageAdmins()) {
      dialogUtils.showErrorToast('لا تملك صلاحية إدارة المسؤولين');
      return;
    }

        try {
            if (editingAdminId) {
                if (password) {
                    const hashedPassword = await ipc.invoke('auth-hash-secret', password);
                    await ipc.invoke('db-run',
                        'UPDATE admins SET name = ?, username = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [name, username, hashedPassword, editingAdminId]
                    );
                } else {
                    await ipc.invoke('db-run',
                        'UPDATE admins SET name = ?, username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [name, username, editingAdminId]
          );
                }
                dialogUtils.showSuccessToast('تم تحديث المسؤول بنجاح');
            } else {
                const hashedPassword = await ipc.invoke('auth-hash-secret', password);
                await ipc.invoke('db-run',
                  'INSERT INTO admins (name, username, password) VALUES (?, ?, ?)',
                  [name, username, hashedPassword]
                );
                dialogUtils.showSuccessToast('تم إضافة المسؤول بنجاح');
            }

      resetAdminForm();
      loadAdminsList();
    } catch (error) {
      logger.error('Error managing admin:', error);
      dialogUtils.showErrorToast(
        mapDbErrorMessage(error, {
          context: 'admin',
          requiredMessage: 'يرجى ملء جميع الحقول المطلوبة.',
          fallback: 'حدث خطأ أثناء حفظ المسؤول.'
        })
      );
    }
  }

  function resetAdminForm() {
    doc.getElementById('addAdminForm').reset();
    doc.getElementById('adminPasswordInput').placeholder = '';
    editingAdminId = null;
    doc.querySelector('#addAdminForm button[type="submit"]').textContent = 'إضافة المسؤول';
  }

  async function loadAdminsList() {
    try {
      const admins = await ipc.invoke('db-query',
        'SELECT id, name, username, active, created_at FROM admins ORDER BY created_at DESC'
      );

      const tbody = doc.getElementById('adminsListTable');
      tbody.innerHTML = '';

      admins.forEach((admin, index) => {
        const allowManage = canManageAdmins();
        const row = doc.createElement('tr');
        row.innerHTML = `
                <td>${index + 1}</td>
                <td>${admin.name}</td>
                <td>${admin.username}</td>
                <td>
                    <span class="badge ${admin.active ? 'bg-success' : 'bg-danger'}">
                        ${admin.active ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>${formatDate(admin.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editAdmin(${admin.id})" ${allowManage ? '' : 'disabled'}>
                        تعديل
                    </button>
                    <button class="btn btn-sm ${admin.active ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleAdminStatus(${admin.id}, ${admin.active})" ${allowManage ? '' : 'disabled'}>
                        ${admin.active ? 'إلغاء تفعيل' : 'تفعيل'}
                    </button>
                </td>
            `;
        tbody.appendChild(row);
      });
    } catch (error) {
      logger.error('Error loading admins:', error);
    }
  }

  async function editAdmin(id) {
    if (!canManageAdmins()) {
      getDialogUtils().showErrorToast('لا تملك صلاحية إدارة المسؤولين');
      return;
    }

    try {
      const admin = await ipc.invoke('db-get',
        'SELECT id, name, username FROM admins WHERE id = ?', [id]
      );

      if (admin) {
        doc.getElementById('adminNameInput').value = admin.name;
        doc.getElementById('adminUsernameInput').value = admin.username;
        doc.getElementById('adminPasswordInput').value = '';
        doc.getElementById('adminPasswordInput').placeholder = 'اتركها فارغة إذا لم ترد تغيير كلمة المرور';
        editingAdminId = id;
        doc.querySelector('#addAdminForm button[type="submit"]').textContent = 'تحديث المسؤول';
      }
    } catch (error) {
      logger.error('Error loading admin for edit:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'admin',
          fallback: 'حدث خطأ أثناء تحميل بيانات المسؤول.'
        })
      );
    }
  }

  async function toggleAdminStatus(id, currentStatus) {
    if (!canManageAdmins()) {
      getDialogUtils().showErrorToast('لا تملك صلاحية إدارة المسؤولين');
      return;
    }

    const newStatus = currentStatus ? 0 : 1;
    const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

    const confirmed = await getDialogUtils().showToggleConfirm(action, 'المسؤول');
    if (!confirmed) {
      return;
    }

    try {
      await ipc.invoke('db-run',
        'UPDATE admins SET active = ? WHERE id = ?',
        [newStatus, id]
      );

      loadAdminsList();
    } catch (error) {
      logger.error('Error toggling admin status:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'admin',
          fallback: 'حدث خطأ أثناء تغيير حالة المسؤول.'
        })
      );
    }
  }

  windowObj.editAdmin = editAdmin;
  windowObj.toggleAdminStatus = toggleAdminStatus;

  return {
    handleAddAdmin,
    resetAdminForm,
    loadAdminsList,
    editAdmin,
    toggleAdminStatus
  };
}

module.exports = {
  createAdminManagementHandlers
};
