function createAutocompleteHelpers(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const getAutocompleteSystem = deps.getAutocompleteSystem;
  const formatDecimal = deps.formatDecimal;
  const logger = deps.logger || console;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;

  function initializeAutocomplete() {
    logger.log('🔮 [AUTOCOMPLETE] بدء تهيئة نظام النص التنبؤي...');

    try {
      const autocompleteSystem = getAutocompleteSystem();
      if (!autocompleteSystem) {
        logger.error('❌ [AUTOCOMPLETE] نظام النص التنبؤي غير متاح');
        return;
      }

      initializeEditModalAutocomplete();
      logger.log('✅ [AUTOCOMPLETE] تم تهيئة نظام النص التنبؤي بنجاح');
    } catch (error) {
      logger.error('❌ [AUTOCOMPLETE] خطأ في تهيئة نظام النص التنبؤي:', error);
    }
  }

  function initializeEditModalAutocomplete() {
    logger.log('✏️ [AUTOCOMPLETE] تهيئة النص التنبؤي لنماذج التعديل...');
    const autocompleteSystem = getAutocompleteSystem();
    if (!autocompleteSystem) {
      return;
    }

    autocompleteSystem.initialize('postpaidSaleCustomerName', {
      minLength: 1,
      debounceDelay: 300,
      maxResults: 8,
      placeholder: 'ابدأ كتابة اسم العميل...',
      dataSource: async (query) => {
        try {
          return await ipc.invoke('autocomplete-postpaid-customers', query, 8);
        } catch (error) {
          logger.error('❌ [AUTOCOMPLETE] خطأ في جلب اقتراحات تعديل المبيعات الآجلة:', error);
          return [];
        }
      },
      onSelect: (value) => {
        logger.log(`✅ [AUTOCOMPLETE] تم اختيار عميل في نموذج تعديل المبيعات الآجلة: "${value}"`);
      }
    });

    autocompleteSystem.initialize('customerReceiptEditCustomerName', {
      minLength: 1,
      debounceDelay: 300,
      maxResults: 8,
      placeholder: 'ابدأ كتابة اسم العميل...',
      dataSource: async (query) => {
        try {
          return await ipc.invoke('autocomplete-customer-receipts', query, 8);
        } catch (error) {
          logger.error('❌ [AUTOCOMPLETE] خطأ في جلب اقتراحات تعديل مقبوضات العملاء:', error);
          return [];
        }
      },
      onSelect: (value) => {
        logger.log(`✅ [AUTOCOMPLETE] تم اختيار عميل في نموذج تعديل مقبوضات العملاء: "${value}"`);
      }
    });

    logger.log('✅ [AUTOCOMPLETE] تم تهيئة النص التنبؤي لنماذج التعديل');
  }

  async function showCustomerQuickStats(customerName, context) {
    try {
      logger.log(`📊 [AUTOCOMPLETE] جلب إحصائيات العميل: "${customerName}" في سياق: ${context}`);
      const stats = await ipc.invoke('autocomplete-customer-stats', customerName);

      if (stats && stats.totalTransactions > 0) {
        const message = `📊 إحصائيات العميل "${customerName}":
• إجمالي المعاملات: ${stats.totalTransactions}
• المبيعات الآجلة: ${stats.postpaidSales.count} (${formatDecimal(stats.postpaidSales.totalAmount)} ريال)
• المقبوضات: ${stats.customerReceipts.count} (${formatDecimal(stats.customerReceipts.totalAmount)} ريال)`;

        showQuickTooltip(message, 3000);
        logger.log('✅ [AUTOCOMPLETE] تم عرض إحصائيات العميل');
      }
    } catch (error) {
      logger.error('❌ [AUTOCOMPLETE] خطأ في عرض إحصائيات العميل:', error);
    }
  }

  function showQuickTooltip(message, duration = 2000) {
    const tooltip = doc.createElement('div');
    tooltip.className = 'autocomplete-quick-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        font-size: 12px;
        white-space: pre-line;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        direction: rtl;
        text-align: right;
    `;
    tooltip.textContent = message;

    doc.body.appendChild(tooltip);
    setTimeoutFn(() => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }, duration);
  }

  return {
    initializeAutocomplete,
    initializeEditModalAutocomplete,
    showCustomerQuickStats,
    showQuickTooltip
  };
}

module.exports = {
  createAutocompleteHelpers
};
