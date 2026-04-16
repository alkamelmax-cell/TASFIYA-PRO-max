const { mapDbErrorMessage } = require('./db-error-messages');

function createAtmManagementHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const formatDate = deps.formatDate;
  const windowObj = deps.windowObj || globalThis;
  const logger = deps.logger || console;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const refreshDropdownData = deps.refreshDropdownData || (() => {});

  let editingAtmId = null;

  async function loadBranchesForAtms() {
    try {
      const branches = await ipc.invoke('db-query',
        'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name'
      );

      const branchSelect = doc.getElementById('atmBranchSelect');
      branchSelect.innerHTML = '<option value="">اختر الفرع</option>';

      branches.forEach((branch) => {
        const option = doc.createElement('option');
        option.value = branch.id;
        option.textContent = branch.branch_name;
        branchSelect.appendChild(option);
      });
    } catch (error) {
      logger.error('Error loading branches for ATMs:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'atm',
          fallback: 'تعذر تحميل فروع أجهزة الصراف.'
        })
      );
    }
  }

  async function handleAddAtm(event) {
    event.preventDefault();

    const name = doc.getElementById('atmNameInput').value.trim();
    const bankName = doc.getElementById('atmBankInput').value.trim();
    const branchId = doc.getElementById('atmBranchSelect').value;
    const location = doc.getElementById('atmLocationInput').value.trim() || 'غير محدد';

    if (!name || !bankName || !branchId) {
      getDialogUtils().showValidationError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      if (editingAtmId) {
        await ipc.invoke('db-run',
          'UPDATE atms SET name = ?, bank_name = ?, branch_id = ?, location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [name, bankName, branchId, location, editingAtmId]
        );
        getDialogUtils().showSuccessToast('تم تحديث الجهاز بنجاح');
      } else {
        await ipc.invoke('db-run',
          'INSERT INTO atms (name, bank_name, branch_id, location) VALUES (?, ?, ?, ?)',
          [name, bankName, branchId, location]
        );
        getDialogUtils().showSuccessToast('تم إضافة الجهاز بنجاح');
      }

      resetAtmForm();
      loadAtmsList();
      refreshDropdownData();
    } catch (error) {
      logger.error('Error managing ATM:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'atm',
          requiredMessage: 'يرجى ملء جميع الحقول المطلوبة.',
          foreignKeyMessage: 'الفرع المحدد غير صالح أو غير موجود.',
          fallback: 'حدث خطأ أثناء حفظ الجهاز.'
        })
      );
    }
  }

  function resetAtmForm() {
    doc.getElementById('addAtmForm').reset();
    doc.getElementById('atmBranchSelect').value = '';
    editingAtmId = null;
    doc.querySelector('#addAtmForm button[type="submit"]').textContent = 'إضافة الجهاز';
  }

  async function loadAtmsList() {
    try {
      const atms = await ipc.invoke('db-query',
        `SELECT a.*, b.branch_name
             FROM atms a
             LEFT JOIN branches b ON a.branch_id = b.id
             ORDER BY a.created_at DESC`
      );

      const tbody = doc.getElementById('atmsListTable');
      tbody.innerHTML = '';

      atms.forEach((atm, index) => {
        const row = doc.createElement('tr');
        row.innerHTML = `
                <td>${index + 1}</td>
                <td>${atm.name}</td>
                <td>${atm.bank_name}</td>
                <td>
                    <span class="badge bg-info">
                        ${atm.branch_name || 'غير محدد'}
                    </span>
                </td>
                <td>${atm.location || 'غير محدد'}</td>
                <td>
                    <span class="badge ${atm.active ? 'bg-success' : 'bg-danger'}">
                        ${atm.active ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>${formatDate(atm.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editAtm(${atm.id})">
                        تعديل
                    </button>
                    <button class="btn btn-sm ${atm.active ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleAtmStatus(${atm.id}, ${atm.active})">
                        ${atm.active ? 'إلغاء تفعيل' : 'تفعيل'}
                    </button>
                </td>
            `;
        tbody.appendChild(row);
      });
    } catch (error) {
      logger.error('Error loading ATMs:', error);
    }
  }

  async function editAtm(id) {
    try {
      const atm = await ipc.invoke('db-get',
        'SELECT * FROM atms WHERE id = ?', [id]
      );

      if (atm) {
        doc.getElementById('atmNameInput').value = atm.name;
        doc.getElementById('atmBankInput').value = atm.bank_name;
        doc.getElementById('atmBranchSelect').value = atm.branch_id || '';
        doc.getElementById('atmLocationInput').value = atm.location || '';
        editingAtmId = id;
        doc.querySelector('#addAtmForm button[type="submit"]').textContent = 'تحديث الجهاز';
      }
    } catch (error) {
      logger.error('Error loading ATM for edit:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'atm',
          fallback: 'حدث خطأ أثناء تحميل بيانات الجهاز.'
        })
      );
    }
  }

  async function toggleAtmStatus(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

    const confirmed = await getDialogUtils().showToggleConfirm(action, 'الجهاز');
    if (!confirmed) {
      return;
    }

    try {
      await ipc.invoke('db-run',
        'UPDATE atms SET active = ? WHERE id = ?',
        [newStatus, id]
      );

      loadAtmsList();
      refreshDropdownData();
    } catch (error) {
      logger.error('Error toggling ATM status:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'atm',
          fallback: 'حدث خطأ أثناء تغيير حالة الجهاز.'
        })
      );
    }
  }

  windowObj.editAtm = editAtm;
  windowObj.toggleAtmStatus = toggleAtmStatus;

  return {
    loadBranchesForAtms,
    handleAddAtm,
    resetAtmForm,
    loadAtmsList,
    editAtm,
    toggleAtmStatus
  };
}

module.exports = {
  createAtmManagementHandlers
};
