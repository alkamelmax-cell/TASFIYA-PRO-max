function createBranchManagementRenderHandlers(context) {
  const doc = context.document;
  const formatDate = context.formatDate;

  function updateBranchesTable(branches) {
    const tableBody = doc.getElementById('branchesTable');
    if (!tableBody) {
      return;
    }

    if (branches.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center">لا توجد فروع مسجلة</td></tr>';
      return;
    }

    tableBody.innerHTML = branches.map((branch) => `
      <tr>
          <td>${branch.id}</td>
          <td>${branch.branch_name}</td>
          <td>${branch.branch_address || '-'}</td>
          <td>${branch.branch_phone || '-'}</td>
          <td>${branch.formula_profile_name || 'الافتراضية العامة'}</td>
          <td>
              <span class="badge ${branch.is_active ? 'bg-success' : 'bg-secondary'}">
                  ${branch.is_active ? 'نشط' : 'غير نشط'}
              </span>
          </td>
          <td>${formatDate(branch.created_at)}</td>
          <td>
              <div class="btn-group" role="group">
                  <button class="btn btn-sm btn-primary" onclick="editBranch(${branch.id})" title="تعديل الفرع">
                      <i class="bi bi-pencil-square"></i>
                      تعديل
                  </button>
                  <button class="btn btn-sm ${branch.is_active ? 'btn-warning' : 'btn-success'}" onclick="toggleBranchStatus(${branch.id}, ${branch.is_active})" title="${branch.is_active ? 'إلغاء التفعيل' : 'تفعيل'}">
                      <i class="bi ${branch.is_active ? 'bi-lock-fill' : 'bi-unlock-fill'}"></i>
                      ${branch.is_active ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="deleteBranch(${branch.id})" title="حذف الفرع">
                      <i class="bi bi-trash-fill"></i>
                      حذف
                  </button>
              </div>
          </td>
      </tr>
  `).join('');
  }

  function updateBranchDropdowns(branches) {
    const dropdowns = ['branchSelect', 'cashierBranchSelect', 'searchBranchFilter'];

    dropdowns.forEach((dropdownId) => {
      const dropdown = doc.getElementById(dropdownId);
      if (!dropdown) {
        return;
      }

      const placeholder = dropdown.querySelector('option[value=""]');
      dropdown.innerHTML = '';
      if (placeholder) {
        dropdown.appendChild(placeholder);
      }

      branches.filter((branch) => branch.is_active).forEach((branch) => {
        const option = doc.createElement('option');
        option.value = branch.id;
        option.textContent = branch.branch_name;
        dropdown.appendChild(option);
      });
    });
  }

  return {
    updateBranchesTable,
    updateBranchDropdowns
  };
}

module.exports = {
  createBranchManagementRenderHandlers
};
