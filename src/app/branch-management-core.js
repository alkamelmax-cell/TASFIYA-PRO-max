const { createBranchManagementRenderHandlers } = require('./branch-management-render');
const { mapDbErrorMessage, isDbConstraintError } = require('./db-error-messages');

function createBranchManagementCoreHandlers(context) {
  const doc = context.document;
  const ipc = context.ipcRenderer;
  const refreshDropdownData = context.refreshDropdownData || (() => {});
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const logger = context.logger || console;

  const renderHandlers = createBranchManagementRenderHandlers({
    document: doc,
    formatDate: context.formatDate
  });

  async function loadFormulaProfilesForBranchForm(selectedFormulaId = null) {
    const formulaSelect = doc.getElementById('branchFormulaProfileId');
    if (!formulaSelect) {
      return;
    }

    try {
      const profiles = await ipc.invoke(
        'db-query',
        `SELECT id, formula_name, is_default
         FROM reconciliation_formula_profiles
         WHERE is_active = 1
         ORDER BY is_default DESC, formula_name ASC`
      );

      const selectedValue = selectedFormulaId === null || selectedFormulaId === undefined
        ? ''
        : String(selectedFormulaId);

      const options = [
        '<option value="">الافتراضية العامة</option>',
        ...profiles.map((profile) => {
          const isSelected = String(profile.id) === selectedValue ? ' selected' : '';
          const suffix = profile.is_default ? ' (افتراضية)' : '';
          return `<option value="${profile.id}"${isSelected}>${profile.formula_name}${suffix}</option>`;
        })
      ];

      formulaSelect.innerHTML = options.join('');
      if (!selectedValue) {
        formulaSelect.value = '';
      }
    } catch (error) {
      logger.warn('⚠️ [BRANCHES] تعذر تحميل معادلات التصفية للفروع:', error);
    }
  }

  async function loadBranches() {
    logger.log('🏢 [BRANCHES] تحميل قائمة الفروع...');

    try {
      const branches = await ipc.invoke('db-query', `
        SELECT
          b.*,
          p.id AS formula_profile_id,
          p.formula_name AS formula_profile_name
        FROM branches b
        LEFT JOIN reconciliation_formula_profiles p
          ON p.id = b.reconciliation_formula_id
        ORDER BY b.branch_name
      `);

      logger.log('✅ [BRANCHES] تم تحميل الفروع بنجاح:', branches.length);

      renderHandlers.updateBranchesTable(branches);
      renderHandlers.updateBranchDropdowns(branches);
      await loadFormulaProfilesForBranchForm();

      return branches;
    } catch (error) {
      logger.error('❌ [BRANCHES] خطأ في تحميل الفروع:', error);
      const friendly = mapDbErrorMessage(error, {
        context: 'branch',
        fallback: 'تعذر تحميل بيانات الفروع.'
      });
      getDialogUtils().showError(`خطأ في تحميل الفروع: ${friendly}`, 'خطأ في النظام');
      return [];
    }
  }

  async function handleBranchForm(event) {
    event.preventDefault();

    const form = doc.getElementById('branchForm');
    if (!form) {
      return;
    }

    const editId = form.getAttribute('data-edit-id');

    const formulaProfileField = doc.getElementById('branchFormulaProfileId');
    const rawFormulaProfileId = formulaProfileField ? formulaProfileField.value : '';
    const parsedFormulaProfileId = rawFormulaProfileId ? parseInt(rawFormulaProfileId, 10) : null;
    const formulaProfileId = Number.isFinite(parsedFormulaProfileId) ? parsedFormulaProfileId : null;

    const formData = {
      branch_name: doc.getElementById('branchName').value.trim(),
      branch_address: doc.getElementById('branchAddress').value.trim(),
      branch_phone: doc.getElementById('branchPhone').value.trim(),
      reconciliation_formula_id: formulaProfileId,
      is_active: parseInt(doc.getElementById('branchStatus').value, 10)
    };

    if (!formData.branch_name) {
      getDialogUtils().showValidationError('يرجى إدخال اسم الفرع');
      return;
    }

    try {
      if (editId) {
        logger.log('🏢 [BRANCHES] تحديث فرع موجود:', { editId, ...formData });

        const result = await ipc.invoke('db-run', `
              UPDATE branches
              SET branch_name = ?, branch_address = ?, branch_phone = ?, reconciliation_formula_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
          `, [
          formData.branch_name,
          formData.branch_address,
          formData.branch_phone,
          formData.reconciliation_formula_id,
          formData.is_active,
          editId
        ]);

        if (result.changes > 0) {
          getDialogUtils().showSuccessToast('تم تحديث الفرع بنجاح');
          cancelBranchEdit();
          await loadBranches();
          refreshDropdownData();
        } else {
          getDialogUtils().showError('فشل في تحديث الفرع', 'خطأ في قاعدة البيانات');
        }
      } else {
        logger.log('🏢 [BRANCHES] إضافة فرع جديد:', formData);

        const result = await ipc.invoke('db-run', `
              INSERT INTO branches (branch_name, branch_address, branch_phone, reconciliation_formula_id, is_active)
              VALUES (?, ?, ?, ?, ?)
          `, [
          formData.branch_name,
          formData.branch_address,
          formData.branch_phone,
          formData.reconciliation_formula_id,
          formData.is_active
        ]);

        if (result.changes > 0) {
          getDialogUtils().showSuccessToast('تم إضافة الفرع بنجاح');
          clearBranchForm();
          await loadBranches();
          refreshDropdownData();
        } else {
          getDialogUtils().showError('فشل في إضافة الفرع', 'خطأ في قاعدة البيانات');
        }
      }
    } catch (error) {
      logger.error('❌ [BRANCHES] خطأ في إدارة الفرع:', error);
      const friendly = mapDbErrorMessage(error, {
        context: 'branch',
        requiredMessage: 'يرجى إدخال اسم الفرع وجميع الحقول المطلوبة.',
        foreignKeyMessage: 'المعادلة المختارة غير صالحة أو غير موجودة.',
        fallback: 'تعذر حفظ بيانات الفرع.'
      });
      const title = isDbConstraintError(error) ? 'خطأ في البيانات' : 'خطأ في النظام';
      getDialogUtils().showError(friendly, title);
    }
  }

  function clearBranchForm() {
    const form = doc.getElementById('branchForm');
    if (!form) {
      return;
    }
    form.reset();
    doc.getElementById('branchStatus').value = '1';
    const formulaSelect = doc.getElementById('branchFormulaProfileId');
    if (formulaSelect) {
      formulaSelect.value = '';
    }
  }

  async function editBranch(branchId) {
    try {
      const branch = await ipc.invoke('db-get', 'SELECT * FROM branches WHERE id = ?', [branchId]);

      if (!branch) {
        getDialogUtils().showError('الفرع غير موجود', 'خطأ في البيانات');
        return;
      }

      doc.getElementById('branchName').value = branch.branch_name;
      doc.getElementById('branchAddress').value = branch.branch_address || '';
      doc.getElementById('branchPhone').value = branch.branch_phone || '';
      await loadFormulaProfilesForBranchForm(branch.reconciliation_formula_id);
      const formulaSelect = doc.getElementById('branchFormulaProfileId');
      if (formulaSelect) {
        formulaSelect.value = branch.reconciliation_formula_id
          ? String(branch.reconciliation_formula_id)
          : '';
      }
      doc.getElementById('branchStatus').value = branch.is_active;

      const form = doc.getElementById('branchForm');
      form.setAttribute('data-edit-id', branchId);

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.textContent = 'تحديث الفرع';
      submitBtn.className = 'btn btn-warning';

      let cancelBtn = form.querySelector('.cancel-edit-btn');
      if (!cancelBtn) {
        cancelBtn = doc.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary cancel-edit-btn';
        cancelBtn.textContent = 'إلغاء التعديل';
        cancelBtn.onclick = cancelBranchEdit;
        submitBtn.parentNode.appendChild(cancelBtn);
      }

      form.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      logger.error('❌ [BRANCHES] خطأ في تحميل بيانات الفرع للتعديل:', error);
      const friendly = mapDbErrorMessage(error, {
        context: 'branch',
        fallback: 'تعذر تحميل بيانات الفرع.'
      });
      getDialogUtils().showError(`خطأ في تحميل بيانات الفرع: ${friendly}`, 'خطأ في النظام');
    }
  }

  function cancelBranchEdit() {
    const form = doc.getElementById('branchForm');
    form.removeAttribute('data-edit-id');

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'إضافة الفرع';
    submitBtn.className = 'btn btn-primary';

    const cancelBtn = form.querySelector('.cancel-edit-btn');
    if (cancelBtn) {
      cancelBtn.remove();
    }

    clearBranchForm();
  }

  async function deleteBranch(branchId) {
    try {
      const cashiersCount = await ipc.invoke('db-get', 'SELECT COUNT(*) as count FROM cashiers WHERE branch_id = ?', [branchId]);

      if (cashiersCount.count > 0) {
        getDialogUtils().showError(
          `لا يمكن حذف الفرع لأنه يحتوي على ${cashiersCount.count} كاشير. يرجى نقل الكاشيرين إلى فرع آخر أولاً.`,
          'لا يمكن الحذف'
        );
        return;
      }

      const confirmed = await getDialogUtils().showConfirm('هل أنت متأكد من حذف هذا الفرع؟', 'تأكيد الحذف');

      if (!confirmed) {
        return;
      }

      const result = await ipc.invoke('db-run', 'DELETE FROM branches WHERE id = ?', [branchId]);

      if (result.changes > 0) {
        getDialogUtils().showSuccessToast('تم حذف الفرع بنجاح');
        await loadBranches();
      } else {
        getDialogUtils().showError('فشل في حذف الفرع', 'خطأ في قاعدة البيانات');
      }
    } catch (error) {
      logger.error('❌ [BRANCHES] خطأ في حذف الفرع:', error);
      const friendly = mapDbErrorMessage(error, {
        context: 'branch',
        foreignKeyMessage: 'لا يمكن حذف الفرع لوجود بيانات مرتبطة به.',
        fallback: 'تعذر حذف الفرع.'
      });
      const title = isDbConstraintError(error) ? 'خطأ في البيانات' : 'خطأ في النظام';
      getDialogUtils().showError(friendly, title);
    }
  }

  async function toggleBranchStatus(branchId, currentStatus) {
    try {
      const newStatus = currentStatus ? 0 : 1;
      const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

      const confirmed = await getDialogUtils().showConfirm(`هل أنت متأكد من ${action} هذا الفرع؟`, `تأكيد ${action}`);

      if (!confirmed) {
        return;
      }

      const result = await ipc.invoke(
        'db-run',
        'UPDATE branches SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newStatus, branchId]
      );

      if (result.changes > 0) {
        getDialogUtils().showSuccessToast(`تم ${action} الفرع بنجاح`);
        await loadBranches();
        refreshDropdownData();
      } else {
        getDialogUtils().showError(`فشل في ${action} الفرع`, 'خطأ في قاعدة البيانات');
      }
    } catch (error) {
      logger.error('❌ [BRANCHES] خطأ في تغيير حالة الفرع:', error);
      const friendly = mapDbErrorMessage(error, {
        context: 'branch',
        fallback: 'تعذر تغيير حالة الفرع.'
      });
      const title = isDbConstraintError(error) ? 'خطأ في البيانات' : 'خطأ في النظام';
      getDialogUtils().showError(friendly, title);
    }
  }

  return {
    loadBranches,
    loadFormulaProfilesForBranchForm,
    updateBranchesTable: renderHandlers.updateBranchesTable,
    updateBranchDropdowns: renderHandlers.updateBranchDropdowns,
    handleBranchForm,
    clearBranchForm,
    editBranch,
    cancelBranchEdit,
    deleteBranch,
    toggleBranchStatus
  };
}

module.exports = {
  createBranchManagementCoreHandlers
};
