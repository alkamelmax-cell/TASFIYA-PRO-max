function createEditModalLoaders(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const logger = deps.logger || console;

  async function loadEditCashiersByBranch(branchId, preferredCashierId = null) {
    const editCashierSelect = doc.getElementById('editCashierSelect');
    if (!editCashierSelect) {
      return;
    }

    try {
      let query = 'SELECT * FROM cashiers WHERE active = 1';
      const params = [];

      if (branchId) {
        query += ' AND branch_id = ?';
        params.push(branchId);
      }

      query += ' ORDER BY name';
      let cashiers = await ipc.invoke('db-all', query, params);
      const parsedPreferredCashierId = Number.parseInt(preferredCashierId, 10);
      if (Number.isFinite(parsedPreferredCashierId) && parsedPreferredCashierId > 0) {
        const hasPreferredCashier = (Array.isArray(cashiers) ? cashiers : []).some(
          (cashier) => Number(cashier?.id) === parsedPreferredCashierId
        );
        if (!hasPreferredCashier) {
          const preferredCashier = await ipc.invoke(
            'db-get',
            'SELECT * FROM cashiers WHERE id = ? LIMIT 1',
            [parsedPreferredCashierId]
          );
          if (preferredCashier && preferredCashier.id) {
            cashiers = [preferredCashier, ...(Array.isArray(cashiers) ? cashiers : [])];
          }
        }
      }

      const currentCashierId = Number.isFinite(parsedPreferredCashierId) && parsedPreferredCashierId > 0
        ? String(parsedPreferredCashierId)
        : String(editCashierSelect.value || '').trim();

      editCashierSelect.innerHTML = '<option value="">اختر الكاشير</option>';
      const appendedCashierIds = new Set();
      (Array.isArray(cashiers) ? cashiers : []).forEach((cashier) => {
        const cashierId = String(cashier?.id || '').trim();
        if (!cashierId || appendedCashierIds.has(cashierId)) {
          return;
        }
        appendedCashierIds.add(cashierId);

        const option = doc.createElement('option');
        option.value = cashierId;
        option.textContent = cashier.name;
        option.dataset.cashierNumber = cashier.cashier_number;
        option.dataset.branchId = cashier.branch_id;
        editCashierSelect.appendChild(option);
      });

      if (currentCashierId && editCashierSelect.querySelector(`option[value="${currentCashierId}"]`)) {
        editCashierSelect.value = currentCashierId;
      }

      logger.log(`✅ [EDIT-BRANCH] تم تحميل ${cashiers.length} كاشير للفرع: ${branchId}`);
    } catch (error) {
      logger.error('❌ [EDIT-BRANCH] خطأ في تحميل الكاشيرين حسب الفرع:', error);
    }
  }

  async function loadEditATMs() {
    const editAtmSelect = doc.getElementById('editAtmSelect');
    if (!editAtmSelect) {
      return;
    }

    try {
      const atms = await ipc.invoke(
        'db-all',
        `SELECT a.*, b.branch_name
             FROM atms a
             LEFT JOIN branches b ON a.branch_id = b.id
             ORDER BY b.branch_name, a.name`
      );
      editAtmSelect.innerHTML = '<option value="">اختر الجهاز</option>';

      atms.forEach((atm) => {
        const option = doc.createElement('option');
        option.value = atm.id;
        option.textContent = `${atm.name} - ${atm.branch_name || 'غير محدد'}`;
        option.dataset.bankName = atm.bank_name;
        editAtmSelect.appendChild(option);
      });

      editAtmSelect.addEventListener('change', function onAtmChange() {
        const selectedOption = this.options[this.selectedIndex];
        const editBankName = doc.getElementById('editBankName');
        if (editBankName) {
          editBankName.value = selectedOption?.dataset?.bankName || '';
        }
      });
    } catch (error) {
      logger.error('خطأ في تحميل أجهزة الصراف الآلي:', error);
    }

    const editCashierSelect = doc.getElementById('editCashierSelect');
    if (editCashierSelect) {
      editCashierSelect.addEventListener('change', function onCashierChange() {
        const selectedOption = this.options[this.selectedIndex];
        const editCashierNumber = doc.getElementById('editCashierNumber');
        if (editCashierNumber) {
          editCashierNumber.value = selectedOption?.dataset?.cashierNumber || '';
        }

        const editBranchSelect = doc.getElementById('editBranchSelect');
        if (editBranchSelect && selectedOption?.dataset?.branchId) {
          editBranchSelect.value = selectedOption.dataset.branchId;
        }
      });
    }
  }

  async function ensureCashiersAndAccountantsLoaded() {
    const editBranchSelect = doc.getElementById('editBranchSelect');
    const editCashierSelect = doc.getElementById('editCashierSelect');
    const editAccountantSelect = doc.getElementById('editAccountantSelect');

    if (editBranchSelect && editBranchSelect.children.length <= 1) {
      try {
        const branches = await ipc.invoke(
          'db-all',
          'SELECT * FROM branches WHERE is_active = 1 ORDER BY branch_name'
        );
        editBranchSelect.innerHTML = '<option value="">اختر الفرع</option>';
        branches.forEach((branch) => {
          const option = doc.createElement('option');
          option.value = branch.id;
          option.textContent = branch.branch_name;
          editBranchSelect.appendChild(option);
        });

        editBranchSelect.addEventListener('change', async function onBranchChange() {
          await loadEditCashiersByBranch(this.value);
        });

        logger.log('✅ [EDIT] تم تحميل الفروع بنجاح:', branches.length);
      } catch (error) {
        logger.error('❌ [EDIT] خطأ في تحميل الفروع:', error);
      }
    }

    if (editCashierSelect && editCashierSelect.children.length <= 1) {
      try {
        const cashiers = await ipc.invoke('db-all', 'SELECT * FROM cashiers ORDER BY name');
        editCashierSelect.innerHTML = '<option value="">اختر الكاشير</option>';
        cashiers.forEach((cashier) => {
          const option = doc.createElement('option');
          option.value = cashier.id;
          option.textContent = cashier.name;
          option.dataset.cashierNumber = cashier.cashier_number;
          option.dataset.branchId = cashier.branch_id;
          editCashierSelect.appendChild(option);
        });
      } catch (error) {
        logger.error('خطأ في تحميل الكاشيرين:', error);
      }
    }

    if (editAccountantSelect && editAccountantSelect.children.length <= 1) {
      try {
        const accountants = await ipc.invoke('db-all', 'SELECT * FROM accountants ORDER BY name');
        editAccountantSelect.innerHTML = '<option value="">اختر المحاسب</option>';
        accountants.forEach((accountant) => {
          const option = doc.createElement('option');
          option.value = accountant.id;
          option.textContent = accountant.name;
          editAccountantSelect.appendChild(option);
        });
      } catch (error) {
        logger.error('خطأ في تحميل المحاسبين:', error);
      }
    }

    await loadEditATMs();
  }

  return {
    ensureCashiersAndAccountantsLoaded,
    loadEditATMs,
    loadEditCashiersByBranch
  };
}

module.exports = {
  createEditModalLoaders
};
