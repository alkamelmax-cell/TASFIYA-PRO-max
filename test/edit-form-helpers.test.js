const test = require('node:test');
const assert = require('node:assert/strict');
const { createEditFormHelpers } = require('../src/app/edit-form-helpers');

function createDoc(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    }
  };
}

test('validateEditForm returns error when required fields are missing', () => {
  const elements = {
    editBranchSelect: { value: '' },
    editCashierSelect: { value: '1' },
    editAccountantSelect: { value: '2' },
    editReconciliationDate: { value: '2026-02-24' },
    editSystemSales: { value: '100' }
  };

  const helpers = createEditFormHelpers({
    document: createDoc(elements),
    getEditMode: () => ({ originalData: {} }),
    logger: { log() {} }
  });

  const result = helpers.validateEditForm();
  assert.equal(result.isValid, false);
  assert.equal(result.message, 'يجب اختيار الفرع');
});

test('collectEditFormData calculates totals and maps edit arrays', () => {
  const editMode = {
    reconciliationId: 10,
    originalData: {
      bankReceipts: [{ operation_type: 'ATM', atm_id: 1, amount: '30.5' }],
      cashReceipts: [{ denomination: '100', quantity: '2', total_amount: '200' }],
      postpaidSales: [{ customer_name: 'C1', amount: '20' }],
      customerReceipts: [{ customer_name: 'C2', amount: '5', payment_type: 'نقدي' }],
      returnInvoices: [{ invoice_number: 'R1', amount: '3.5' }],
      suppliers: [{ supplier_name: 'S1', amount: '7' }]
    }
  };

  const elements = {
    editCashierSelect: { value: '11' },
    editAccountantSelect: { value: '22' },
    editReconciliationDate: { value: '2026-02-24' },
    editSystemSales: { value: '200' },
    editTimeRangeStart: { value: '08:00' },
    editTimeRangeEnd: { value: '16:00' },
    editFilterNotes: { value: '  note  ' },
    editBankReceiptsTotal: { textContent: '30.5' },
    editCashReceiptsTotal: { textContent: '200' },
    editPostpaidSalesTotal: { textContent: '20' },
    editCustomerReceiptsTotal: { textContent: '5' },
    editReturnInvoicesTotal: { textContent: '3.5' },
    editSuppliersTotal: { textContent: '7' }
  };

  const helpers = createEditFormHelpers({
    document: createDoc(elements),
    getEditMode: () => editMode,
    logger: { log() {} }
  });

  const data = helpers.collectEditFormData();
  assert.equal(data.reconciliationId, 10);
  assert.equal(data.totalReceipts, 249);
  assert.equal(data.surplusDeficit, 49);
  assert.equal(data.supplierTotal, 7);
  assert.equal(data.filterNotes, 'note');
  assert.equal(data.bankReceipts[0].amount, 30.5);
  assert.equal(data.cashReceipts[0].total_amount, 200);
});

test('collectTableData returns parsed rows', () => {
  const rowA = {
    querySelectorAll() {
      return [{ textContent: 'A' }, { textContent: '12.5' }];
    }
  };

  const rowB = {
    querySelectorAll() {
      return [{ textContent: 'B' }, { textContent: '8' }];
    }
  };

  const elements = {
    sampleTable: {
      querySelectorAll() {
        return [rowA, rowB];
      }
    }
  };

  const helpers = createEditFormHelpers({
    document: createDoc(elements),
    getEditMode: () => ({ originalData: {} }),
    logger: { log() {} }
  });

  const rows = helpers.collectTableData('sampleTable', ['name', 'amount']);
  assert.deepEqual(rows, [
    { name: 'A', amount: 12.5 },
    { name: 'B', amount: 8 }
  ]);
});
