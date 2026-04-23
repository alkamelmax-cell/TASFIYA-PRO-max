const { mapDbErrorMessage, isDbConstraintError } = require('./db-error-messages');

function createCashierManagementHandlers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const formatDate = deps.formatDate;
  const windowObj = deps.windowObj || globalThis;
  const logger = deps.logger || console;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const refreshDropdownData = deps.refreshDropdownData || (() => {});

  let editingCashierId = null;

  async function handleAddCashier(event) {
    event.preventDefault();
    logger.log('👤 [CASHIER] بدء إضافة/تعديل الكاشير...');

    const name = doc.getElementById('cashierNameInput').value.trim();
    const cashierNumber = doc.getElementById('cashierNumberInput').value.trim();
    const branchId = doc.getElementById('cashierBranchSelect').value;
    const dialogUtils = getDialogUtils();

    logger.log('📝 [CASHIER] البيانات المدخلة:', {
      name,
      cashierNumber,
      branchId,
      nameLength: name.length,
      cashierNumberLength: cashierNumber.length,
      isEditing: !!editingCashierId,
      editingId: editingCashierId
    });

    if (!name || !cashierNumber || !branchId) {
      logger.error('❌ [CASHIER] حقول مفقودة - الاسم:', !!name, 'الرقم:', !!cashierNumber, 'الفرع:', !!branchId);
      dialogUtils.showValidationError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (name.length < 2) {
      logger.error('❌ [CASHIER] اسم قصير جداً:', name.length);
      dialogUtils.showValidationError('اسم الكاشير يجب أن يكون أكثر من حرفين');
      return;
    }

    if (cashierNumber.length < 1) {
      logger.error('❌ [CASHIER] رقم الكاشير فارغ');
      dialogUtils.showValidationError('رقم الكاشير مطلوب');
      return;
    }

    try {
      if (editingCashierId) {
        logger.log('✏️ [CASHIER] تحديث كاشير موجود - معرف:', editingCashierId);

        const conflictingCashier = await ipc.invoke('db-get',
          'SELECT id, name FROM cashiers WHERE cashier_number = ? AND id != ?',
          [cashierNumber, editingCashierId]
        );

        if (conflictingCashier) {
          logger.error('❌ [CASHIER] تعارض في رقم الكاشير أثناء التحديث:', {
            newNumber: cashierNumber,
            conflictingId: conflictingCashier.id,
            conflictingName: conflictingCashier.name,
            editingId: editingCashierId
          });
          dialogUtils.showValidationError(`رقم الكاشير "${cashierNumber}" مستخدم بواسطة "${conflictingCashier.name}". يرجى اختيار رقم آخر.`);
          return;
        }

        await ipc.invoke('db-run',
          'UPDATE cashiers SET name = ?, cashier_number = ?, branch_id = ? WHERE id = ?',
          [name, cashierNumber, branchId, editingCashierId]
        );
        logger.log('✅ [CASHIER] تم تحديث الكاشير بنجاح');
        dialogUtils.showSuccessToast('تم تحديث الكاشير بنجاح');
      } else {
        logger.log('➕ [CASHIER] إضافة كاشير جديد...');
        logger.log('🔍 [CASHIER] فحص وجود رقم الكاشير في قاعدة البيانات...');

        const existingCashier = await ipc.invoke('db-get',
          'SELECT id, name, cashier_number FROM cashiers WHERE cashier_number = ?',
          [cashierNumber]
        );

        logger.log('📊 [CASHIER] نتيجة البحث عن رقم مكرر:', {
          found: !!existingCashier,
          searchedNumber: cashierNumber,
          existingData: existingCashier ? {
            id: existingCashier.id,
            name: existingCashier.name,
            number: existingCashier.cashier_number
          } : null
        });

        if (existingCashier) {
          logger.error('❌ [CASHIER] رقم الكاشير موجود مسبقاً:', {
            inputNumber: cashierNumber,
            existingNumber: existingCashier.cashier_number,
            existingName: existingCashier.name,
            existingId: existingCashier.id,
            numbersMatch: cashierNumber === existingCashier.cashier_number,
            typeComparison: {
              inputType: typeof cashierNumber,
              existingType: typeof existingCashier.cashier_number
            }
          });
          dialogUtils.showValidationError(`رقم الكاشير "${cashierNumber}" موجود مسبقاً لدى "${existingCashier.name}". يرجى اختيار رقم آخر.`);
          return;
        }

        logger.log('🔍 [CASHIER] فحص إضافي - جميع أرقام الكاشيرين الموجودة...');
        const allCashiers = await ipc.invoke('db-query',
          'SELECT id, name, cashier_number FROM cashiers ORDER BY id'
        );

        logger.log('📋 [CASHIER] جميع الكاشيرين الموجودين:', allCashiers.map((c) => ({
          id: c.id,
          name: c.name,
          number: c.cashier_number,
          type: typeof c.cashier_number
        })));

        const duplicateFound = allCashiers.find((c) => String(c.cashier_number).trim() === String(cashierNumber).trim());
        if (duplicateFound) {
          logger.error('❌ [CASHIER] تم العثور على رقم مكرر في الفحص الإضافي:', {
            inputNumber: cashierNumber,
            duplicateData: duplicateFound,
            stringComparison: String(duplicateFound.cashier_number).trim() === String(cashierNumber).trim()
          });
          dialogUtils.showValidationError(`رقم الكاشير "${cashierNumber}" موجود مسبقاً لدى "${duplicateFound.name}". يرجى اختيار رقم آخر.`);
          return;
        }

        logger.log('✅ [CASHIER] رقم الكاشير متاح للاستخدام');
        logger.log('💾 [CASHIER] إدراج الكاشير الجديد في قاعدة البيانات...');
        const result = await ipc.invoke('db-run',
          'INSERT INTO cashiers (name, cashier_number, branch_id) VALUES (?, ?, ?)',
          [name, cashierNumber, branchId]
        );

        logger.log('✅ [CASHIER] تم إضافة الكاشير بنجاح - معرف جديد:', result.lastInsertRowid);
        dialogUtils.showSuccessToast('تم إضافة الكاشير بنجاح');
      }

      logger.log('🔄 [CASHIER] تحديث واجهة المستخدم...');
      resetCashierForm();
      loadCashiersList();
      refreshDropdownData();
    } catch (error) {
      logger.error('❌ [CASHIER] خطأ في إدارة الكاشير:', {
        error: error.message,
        code: error.code,
        stack: error.stack,
        inputData: { name, cashierNumber },
        isEditing: !!editingCashierId
      });
      const friendly = mapDbErrorMessage(error, {
        context: 'cashier',
        requiredMessage: 'جميع الحقول مطلوبة. يرجى ملء البيانات كاملة.',
        foreignKeyMessage: 'الفرع المحدد غير صالح أو غير موجود.',
        fallback: 'حدث خطأ أثناء حفظ الكاشير.'
      });
      const title = isDbConstraintError(error) ? 'خطأ في البيانات' : 'خطأ في النظام';
      dialogUtils.showError(friendly, title);
    }
  }

  function resetCashierForm() {
    doc.getElementById('addCashierForm').reset();
    editingCashierId = null;
    doc.querySelector('#addCashierForm button[type="submit"]').textContent = 'إضافة الكاشير';
  }

  async function loadCashiersList() {
    try {
      const cashiers = await ipc.invoke('db-query', `
            SELECT c.*, b.branch_name
            FROM cashiers c
            LEFT JOIN branches b ON c.branch_id = b.id
            ORDER BY c.created_at DESC
        `);

      const tbody = doc.getElementById('cashiersListTable');
      tbody.innerHTML = '';

      cashiers.forEach((cashier, index) => {
        const row = doc.createElement('tr');
        row.innerHTML = `
                <td>${index + 1}</td>
                <td>${cashier.name}</td>
                <td>${cashier.cashier_number}</td>
                <td>${cashier.branch_name || 'غير محدد'}</td>
                <td>
                    <span class="badge ${cashier.active ? 'bg-success' : 'bg-danger'}">
                        ${cashier.active ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>${formatDate(cashier.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editCashier(${cashier.id})">
                        تعديل
                    </button>
                    <button class="btn btn-sm ${cashier.active ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleCashierStatus(${cashier.id}, ${cashier.active})">
                        ${cashier.active ? 'إلغاء تفعيل' : 'تفعيل'}
                    </button>
                </td>
            `;
        tbody.appendChild(row);
      });
    } catch (error) {
      logger.error('Error loading cashiers:', error);
    }
  }

  async function editCashier(id) {
    try {
      const cashier = await ipc.invoke('db-get',
        'SELECT * FROM cashiers WHERE id = ?', [id]
      );

      if (cashier) {
        doc.getElementById('cashierNameInput').value = cashier.name;
        doc.getElementById('cashierNumberInput').value = cashier.cashier_number;
        doc.getElementById('cashierBranchSelect').value = cashier.branch_id || '';
        editingCashierId = id;
        doc.querySelector('#addCashierForm button[type="submit"]').textContent = 'تحديث الكاشير';
      }
    } catch (error) {
      logger.error('Error loading cashier for edit:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'cashier',
          fallback: 'حدث خطأ أثناء تحميل بيانات الكاشير.'
        })
      );
    }
  }

  async function toggleCashierStatus(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const action = newStatus ? 'تفعيل' : 'إلغاء تفعيل';

    const confirmed = await getDialogUtils().showToggleConfirm(action, 'الكاشير');
    if (!confirmed) {
      return;
    }

    try {
      await ipc.invoke('db-run',
        'UPDATE cashiers SET active = ? WHERE id = ?',
        [newStatus, id]
      );

      loadCashiersList();
      refreshDropdownData();
    } catch (error) {
      logger.error('Error toggling cashier status:', error);
      getDialogUtils().showErrorToast(
        mapDbErrorMessage(error, {
          context: 'cashier',
          fallback: 'حدث خطأ أثناء تغيير حالة الكاشير.'
        })
      );
    }
  }

  windowObj.editCashier = editCashier;
  windowObj.toggleCashierStatus = toggleCashierStatus;

  return {
    handleAddCashier,
    resetCashierForm,
    loadCashiersList,
    editCashier,
    toggleCashierStatus
  };
}

module.exports = {
  createCashierManagementHandlers
};
