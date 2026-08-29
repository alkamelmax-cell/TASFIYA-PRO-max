const {
  buildCustomersByBranchQuery,
  createCustomerOption,
  normalizeBranchId,
  normalizeCustomerListRows
} = require('./customer-list-data');

function createCustomerDropdownLoader(deps) {
  const ipc = deps.ipcRenderer;
  const doc = deps.document;
  const logger = deps.logger || console;
  let customersList = [];
  let loadRequestSeq = 0;

  function renderCustomerOptions(customersDatalist, customerReceiptsDatalist, customers) {
    if (!customersDatalist || !customerReceiptsDatalist) {
      return;
    }

    customersDatalist.innerHTML = '';
    customerReceiptsDatalist.innerHTML = '';

    customers.forEach((customer) => {
      customersDatalist.appendChild(createCustomerOption(doc, customer));
      customerReceiptsDatalist.appendChild(createCustomerOption(doc, customer));
    });
  }

  return async function loadCustomersForDropdowns(branchId = '') {
    const requestSeq = ++loadRequestSeq;
    try {
      const normalizedBranchId = normalizeBranchId(branchId);
      const hasBranchFilter = normalizedBranchId !== null;
      const customersDatalist = doc.getElementById('customersList');
      const customerReceiptsDatalist = doc.getElementById('customerReceiptsList');

      logger.log('📋 [CUSTOMERS] جاري تحميل قائمة العملاء...');

      if (!hasBranchFilter) {
        customersList = [];
        renderCustomerOptions(customersDatalist, customerReceiptsDatalist, customersList);
        logger.log('ℹ️ [CUSTOMERS] لم يتم اختيار فرع، تم تفريغ قائمة العملاء');
        return customersList;
      }

      const customers = await ipc.invoke('db-query', buildCustomersByBranchQuery(), [normalizedBranchId]);
      if (requestSeq !== loadRequestSeq) {
        logger.log('ℹ️ [CUSTOMERS] تم تجاهل نتيجة قديمة لتحميل العملاء');
        return customersList;
      }

      customersList = normalizeCustomerListRows(customers);

      renderCustomerOptions(customersDatalist, customerReceiptsDatalist, customersList);

      logger.log(`✅ [CUSTOMERS] تم تحميل ${customersList.length} عميل للفرع ${normalizedBranchId || 'غير محدد'}`);
      return customersList;

    } catch (error) {
      logger.error('❌ [CUSTOMERS] خطأ في تحميل العملاء:', error);
      return customersList;
    }
  };
}

module.exports = {
  createCustomerDropdownLoader
};
