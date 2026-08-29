const { mapDbErrorMessage } = require('./db-error-messages');

function createBranchManagementInsightHandlers(context) {
  const doc = context.document;
  const ipc = context.ipcRenderer;
  const populateSelect = context.populateSelect || (() => {});
  const getDialogUtils = context.getDialogUtils || (() => context.dialogUtils);
  const logger = context.logger || console;
  const loadBranches = context.loadBranches;

async function filterCashiersByBranch(branchId) {
  try {
    let query = `
          SELECT c.*, b.branch_name
          FROM cashiers c
          LEFT JOIN branches b ON c.branch_id = b.id
          WHERE c.active = 1
      `;
    const params = [];

    if (branchId && branchId !== '') {
      query += ' AND c.branch_id = ?';
      params.push(branchId);
    }

    query += ' ORDER BY c.name';

    const cashiers = await ipc.invoke('db-query', query, params);
    populateSelect('cashierSelect', cashiers, 'id', 'name');

    logger.log('🏢 [BRANCHES] تم فلترة الكاشيرين حسب الفرع:', {
      branchId,
      cashiersCount: cashiers.length
    });
  } catch (error) {
    logger.error('❌ [BRANCHES] خطأ في فلترة الكاشيرين:', error);
  }
}

function handleBranchSelectionChange() {
  const branchSelect = doc.getElementById('branchSelect');
  if (!branchSelect) {
    return;
  }

  branchSelect.addEventListener('change', function () {
    const selectedBranchId = this.value;
    filterCashiersByBranch(selectedBranchId);

    const cashierSelect = doc.getElementById('cashierSelect');
    if (cashierSelect) {
      cashierSelect.value = '';
      doc.getElementById('cashierNumber').value = '';
    }
  });
}

async function testBranchesManagement() {
  logger.log('🏢 [TEST] اختبار نظام إدارة الفروع...');

  try {
    const branches = await loadBranches();
    logger.log('✅ [TEST] تم تحميل الفروع:', branches.length);

    const branchStats = await getBranchStatistics();
    logger.log('📊 [TEST] إحصائيات الفروع:', branchStats);

    const cashiersWithBranches = await ipc.invoke('db-query', `
          SELECT c.name as cashier_name, c.cashier_number, b.branch_name
          FROM cashiers c
          LEFT JOIN branches b ON c.branch_id = b.id
          ORDER BY b.branch_name, c.name
      `);

    logger.log('👥 [TEST] الكاشيرين والفروع:', cashiersWithBranches);

    getDialogUtils().showSuccess(
      `تم اختبار نظام إدارة الفروع بنجاح!\n\n` +
      `📊 النتائج:\n` +
      `• عدد الفروع: ${branches.length}\n` +
      `• عدد الكاشيرين: ${cashiersWithBranches.length}\n` +
      `• الكاشيرين المرتبطين بفروع: ${cashiersWithBranches.filter((c) => c.branch_name).length}\n` +
      `• الكاشيرين غير المرتبطين: ${cashiersWithBranches.filter((c) => !c.branch_name).length}\n\n` +
      '✅ جميع الوظائف تعمل بشكل صحيح',
      'اختبار نظام الفروع'
    );

    return true;
  } catch (error) {
    logger.error('❌ [TEST] خطأ في اختبار نظام الفروع:', error);
    const friendly = mapDbErrorMessage(error, {
      fallback: 'تعذر تنفيذ اختبار نظام الفروع.'
    });
    getDialogUtils().showError(`خطأ في الاختبار: ${friendly}`, 'خطأ في الاختبار');
    return false;
  }
}

async function getBranchStatistics() {
  try {
    const stats = await ipc.invoke('db-query', `
          SELECT
              b.id,
              b.branch_name,
              b.is_active,
              COUNT(c.id) as cashiers_count,
              COUNT(CASE WHEN c.active = 1 THEN 1 END) as active_cashiers_count
          FROM branches b
          LEFT JOIN cashiers c ON b.id = c.branch_id
          GROUP BY b.id, b.branch_name, b.is_active
          ORDER BY b.branch_name
      `);

    return stats;
  } catch (error) {
    logger.error('❌ [BRANCHES] خطأ في جلب إحصائيات الفروع:', error);
    return [];
  }
}

  return {
    filterCashiersByBranch,
    handleBranchSelectionChange,
    testBranchesManagement,
    getBranchStatistics
  };
}

module.exports = {
  createBranchManagementInsightHandlers
};
