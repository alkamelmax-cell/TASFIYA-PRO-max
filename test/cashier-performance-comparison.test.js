const test = require('node:test');
const assert = require('node:assert/strict');
const { createCashierPerformanceComparisonHandlers } = require('../src/app/cashier-performance-comparison');

function createElement(initial = {}) {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    style: {},
    options: [],
    selectedIndex: 0,
    children: [],
    ...initial,
    appendChild(child) {
      this.children.push(child);
      this.options.push(child);
    }
  };
}

function buildContext(overrides = {}) {
  const elements = {
    performanceDateFrom: createElement(),
    performanceDateTo: createElement(),
    performanceBranch: createElement(),
    performanceLoading: createElement({ style: { display: 'none' } }),
    performanceResults: createElement({ style: { display: 'none' } }),
    performanceSummary: createElement(),
    cashierRankingList: createElement(),
    cashierPerformanceCards: createElement(),
    exportPerformancePdfBtn: createElement({ style: { display: 'none' } })
  };

  const dialog = {
    validations: [],
    infos: [],
    errors: [],
    showValidationError(message) {
      this.validations.push(message);
    },
    showInfo(message) {
      this.infos.push(message);
    },
    showError(message) {
      this.errors.push(message);
    },
    showLoading() {},
    close() {},
    showSuccess() {}
  };

  const state = {
    invokeCalls: []
  };

  const deps = {
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
      createElement() {
        return createElement();
      }
    },
    ipcRenderer: {
      async invoke(channel) {
        state.invokeCalls.push(channel);
        if (channel === 'db-query') {
          return [{ id: 1, branch_name: 'Main' }];
        }
        return [];
      }
    },
    windowObj: {},
    getDialogUtils: () => dialog,
    calculateAccuracyScore: () => 80,
    calculateVolumeScore: () => 70,
    calculateConsistencyScore: () => 90,
    calculateOverallRating: () => 4.2,
    getPerformanceBadge: () => ({ class: 'bg-success', icon: 'A', text: 'Great' }),
    generatePerformanceSummary: () => ({
      totalCashiers: 1,
      totalSales: 500,
      averageRating: 4.2,
      totalDeficit: 10
    }),
    generateStarRating: () => '⭐⭐⭐⭐',
    buildPerformanceComprehensivePdfContent: () => '<html></html>',
    formatNumber: (v) => String(v),
    formatCurrency: (v) => String(v),
    getCurrentDate: () => '2026-02-25',
    logger: { log() {}, error() {} },
    ...overrides
  };

  const handlers = createCashierPerformanceComparisonHandlers(deps);
  return { handlers, elements, dialog, state, deps };
}

test('loadCashierPerformanceFilters sets default dates and fills branch options', async () => {
  const ctx = buildContext();

  await ctx.handlers.loadCashierPerformanceFilters();

  assert.notEqual(ctx.elements.performanceDateFrom.value, '');
  assert.notEqual(ctx.elements.performanceDateTo.value, '');
  assert.equal(ctx.elements.performanceBranch.children.length, 1);
});

test('handleGeneratePerformanceComparison validates missing date fields', async () => {
  const ctx = buildContext();
  ctx.elements.performanceDateFrom.value = '';
  ctx.elements.performanceDateTo.value = '';

  await ctx.handlers.handleGeneratePerformanceComparison();

  assert.equal(ctx.dialog.validations.length, 1);
});

test('generateCashierPerformanceData returns processed cashier metrics', async () => {
  const ctx = buildContext({
    ipcRenderer: {
      async invoke(channel) {
        if (channel === 'db-query') {
          return [{
            cashier_id: 9,
            cashier_name: 'Ali',
            cashier_number: '001',
            branch_name: 'Main',
            total_reconciliations: 4,
            total_sales: '1000',
            total_deficit: '25',
            avg_deficit: '6.25'
          }];
        }
        return [];
      }
    }
  });

  const result = await ctx.handlers.generateCashierPerformanceData('2026-01-01', '2026-01-31', '');

  assert.equal(result.cashiers.length, 1);
  assert.equal(result.cashiers[0].total_sales, 1000);
  assert.equal(result.cashiers[0].overall_rating, 4.2);
});
