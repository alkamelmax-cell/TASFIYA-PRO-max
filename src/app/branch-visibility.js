function normalizeBranchName(branchName) {
  return String(branchName == null ? '' : branchName).trim().toLowerCase();
}

function isExperimentalBranchName(branchName) {
  const normalized = normalizeBranchName(branchName);
  if (!normalized) {
    return false;
  }

  return /\btest\b/i.test(normalized) || /اختبار|تجريبي/i.test(normalized);
}

function getBranchName(branch) {
  if (typeof branch === 'string') {
    return branch;
  }

  if (!branch || typeof branch !== 'object') {
    return '';
  }

  return branch.branch_name ?? branch.name ?? '';
}

function filterVisibleBranches(branches) {
  if (!Array.isArray(branches)) {
    return [];
  }

  return branches.filter((branch) => !isExperimentalBranchName(getBranchName(branch)));
}

module.exports = {
  filterVisibleBranches,
  isExperimentalBranchName,
  getBranchName
};
