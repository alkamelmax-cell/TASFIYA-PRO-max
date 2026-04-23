function createCustomerDropdownLoader(deps) {
  const ipc = deps.ipcRenderer;
  const doc = deps.document;
  const logger = deps.logger || console;
  let customersList = [];

  return async function loadCustomersForDropdowns(branchId = '') {
    try {
      const normalizedBranchId = String(branchId || '').trim();
      const hasBranchFilter = normalizedBranchId.length > 0;

      logger.log('📋 [CUSTOMERS] جاري تحميل قائمة العملاء...');

      const query = `
            SELECT DISTINCT c.customer_name
            FROM (
                SELECT ps.customer_name, ch.branch_id
                FROM postpaid_sales ps
                JOIN reconciliations r ON ps.reconciliation_id = r.id
                JOIN cashiers ch ON r.cashier_id = ch.id
                UNION
                SELECT cr.customer_name, ch.branch_id
                FROM customer_receipts cr
                JOIN reconciliations r ON cr.reconciliation_id = r.id
                JOIN cashiers ch ON r.cashier_id = ch.id
            ) c
            WHERE c.customer_name IS NOT NULL
              AND TRIM(c.customer_name) != ''
              ${hasBranchFilter ? 'AND c.branch_id = ?' : 'AND 1 = 0'}
            ORDER BY c.customer_name
        `;

      const customers = await ipc.invoke('db-query', query, hasBranchFilter ? [normalizedBranchId] : []);
      customersList = customers.map((c) => c.customer_name);

      const customersDatalist = doc.getElementById('customersList');
      const customerReceiptsDatalist = doc.getElementById('customerReceiptsList');

      if (customersDatalist && customerReceiptsDatalist) {
        customersDatalist.innerHTML = '';
        customerReceiptsDatalist.innerHTML = '';

        customersList.forEach((customerName) => {
          const option1 = doc.createElement('option');
          option1.value = customerName;
          customersDatalist.appendChild(option1);

          const option2 = doc.createElement('option');
          option2.value = customerName;
          customerReceiptsDatalist.appendChild(option2);
        });
      }

      logger.log(`✅ [CUSTOMERS] تم تحميل ${customersList.length} عميل للفرع ${normalizedBranchId || 'غير محدد'}`);

    } catch (error) {
      logger.error('❌ [CUSTOMERS] خطأ في تحميل العملاء:', error);
    }
  };
}

module.exports = {
  createCustomerDropdownLoader
};
