const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterVisibleBranches,
  isExperimentalBranchName
} = require('../src/app/branch-visibility');

test('branch visibility helper hides experimental branches by name', () => {
  assert.equal(isExperimentalBranchName('SYNC TEST BRANCH'), true);
  assert.equal(isExperimentalBranchName('فرع تجريبي'), true);
  assert.equal(isExperimentalBranchName('الفرع الرئيسي'), false);

  const visibleBranches = filterVisibleBranches([
    { id: 1, branch_name: 'الفرع الرئيسي' },
    { id: 2, branch_name: 'SYNC TEST BRANCH' },
    { id: 3, branch_name: 'فرع تجريبي' }
  ]);

  assert.deepEqual(visibleBranches.map((branch) => branch.branch_name), ['الفرع الرئيسي']);
});
