const { mapDbErrorMessage } = require('./db-error-messages');

function createAccountantManagementHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const formatDate = deps.formatDate;
  const windowObj = deps.windowObj || globalThis;
  const logger = deps.logger || console;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const refreshDropdownData = deps.refreshDropdownData || (() => {});

  let editingAccountantId = null;

  async function handleAddAccountant(event) {
    event.preventDefault();

    const name = doc.getElementById('accountantNameInput').value.trim();
    if (!name) {
      getDialogUtils().showValidationError('يرجى إدخال اسم المحاسب');
      return;
    }

    try {
      if (editingAccountantId) {
        await ipc.invoke('db-run',
          'UPDATE accountants SET name = ? WHERE id = ?',
          [name, editingAccountantId]
        );
        getDialogUtils().showSuccessToast('تم تحديث المحاسب بنجاح');
      } else {
        await ipc.invoke('db-run',
          'INSERT INTO accountants (name) VALUES (?)',
          [name]
        );
        getDialogUtils().showSuccessToast('تم إضافة المحاسب بنجاح');
      }

      resetAccountantForm();
      loadAccountantsList();
      refreshDropdownData();
    } catch (error) {
      logger.error('Error managing accountant:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'accountant',
          requiredMessage: 'يرجى إدخال اسم المحاسب.',
          fallback: 'حدث خطأ أثناء حفظ المحاسب.'
        })
      );
    }
  }

  function resetAccountantForm() {
    doc.getElementById('addAccountantForm').reset();
    editingAccountantId = null;
    doc.querySelector('#addAccountantForm button[type="submit"]').textContent = 'إضافة المحاسب';
  }

  async function loadAccountantsList() {
    try {
      const accountants = await ipc.invoke('db-query',
        'SELECT * FROM accountants ORDER BY created_at DESC'
      );

      const tbody = doc.getElementById('accountantsListTable');
      tbody.innerHTML = '';

      accountants.forEach((accountant, index) => {
        const row = doc.createElement('tr');
        row.innerHTML = `
                <td>${index + 1}</td>
                <td>${accountant.name}</td>
                <td>
                    <span class="badge ${accountant.active ? 'bg-success' : 'bg-danger'}">
                        ${accountant.active ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>${formatDate(accountant.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editAccountant(${accountant.id})">
                        تعديل
                    </button>
                    <button class="btn btn-sm ${accountant.active ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleAccountantStatus(${accountant.id}, ${accountant.active})">
                        ${accountant.active ? 'إلغاء تفعيل' : 'تفعيل'}
                    </button>
                </td>
            `;
        tbody.appendChild(row);
      });
    } catch (error) {
      logger.error('Error loading accountants:', error);
    }
  }

  async function editAccountant(id) {
    try {
      const accountant = await ipc.invoke('db-get',
        'SELECT * FROM accountants WHERE id = ?', [id]
      );

      if (accountant) {
        doc.getElementById('accountantNameInput').value = accountant.name;
        editingAccountantId = id;
        doc.querySelector('#addAccountantForm button[type="submit"]').textContent = 'تحديث المحاسب';
      }
    } catch (error) {
      logger.error('Error loading accountant for edit:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'accountant',
          fallback: 'حدث خطأ أثناء تحميل بيانات المحاسب.'
        })
      );
    }
  }

  async function toggleAccountantStatus(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

    const confirmed = await getDialogUtils().showToggleConfirm(action, 'المحاسب');
    if (!confirmed) {
      return;
    }

    try {
      await ipc.invoke('db-run',
        'UPDATE accountants SET active = ? WHERE id = ?',
        [newStatus, id]
      );

      loadAccountantsList();
      refreshDropdownData();
    } catch (error) {
      logger.error('Error toggling accountant status:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'accountant',
          fallback: 'حدث خطأ أثناء تغيير حالة المحاسب.'
        })
      );
    }
  }

  windowObj.editAccountant = editAccountant;
  windowObj.toggleAccountantStatus = toggleAccountantStatus;

  return {
    handleAddAccountant,
    resetAccountantForm,
    loadAccountantsList,
    editAccountant,
    toggleAccountantStatus
  };
}

module.exports = {
  createAccountantManagementHandlers
};
