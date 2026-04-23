function createAdvancedPrintSettingsHandlers(deps) {
  const document = deps.document;
  const ipcRenderer = deps.ipcRenderer;
  const getDialogUtils = deps.getDialogUtils || (() => deps.dialogUtils);
  const getAvailablePrinters = deps.getAvailablePrinters || (() => []);
  const setAvailablePrinters = deps.setAvailablePrinters || (() => {});
  const logger = deps.logger || console;
  const modalMarginIds = {
    top: 'printDialogMarginTop',
    right: 'printDialogMarginRight',
    bottom: 'printDialogMarginBottom',
    left: 'printDialogMarginLeft'
  };

  function updatePrintersList() {
    const printerSelect = document.getElementById('printerSelect');
    if (!printerSelect) {
      return;
    }

    printerSelect.innerHTML = '';

    const availablePrinters = getAvailablePrinters();
    if (availablePrinters.length === 0) {
      printerSelect.innerHTML = '<option value="">لا توجد طابعات متاحة</option>';
      return;
    }

    availablePrinters.forEach((printer) => {
      const option = document.createElement('option');
      option.value = printer.name;
      option.textContent = `${printer.displayName}${printer.isDefault ? ' (افتراضي)' : ''}`;
      if (printer.isDefault) {
        option.selected = true;
      }
      printerSelect.appendChild(option);
    });
  }

  function loadPrintSettings(settings = {}) {
    const printerSelect = document.getElementById('printerSelect');
    const copiesInput = document.getElementById('copiesInput');
    const paperSizeSelect = document.getElementById('paperSizeSelect');
    const orientationSelect = document.getElementById('orientationSelect');
    const colorPrintCheck = document.getElementById('colorPrintCheck');
    const duplexSelect = document.getElementById('duplexSelect');

    if (printerSelect && settings.printerName) {
      printerSelect.value = settings.printerName;
    }
    if (copiesInput) copiesInput.value = settings.copies || 1;
    if (paperSizeSelect) paperSizeSelect.value = settings.paperSize || 'A4';
    if (orientationSelect) orientationSelect.value = settings.orientation || 'portrait';
    if (colorPrintCheck) colorPrintCheck.checked = settings.color || false;
    if (duplexSelect) duplexSelect.value = settings.duplex || 'simplex';

    const fontFamily = document.getElementById('fontFamily');
    if (fontFamily) {
      fontFamily.value = settings.fontFamily || 'Cairo';
    }

    const fontSize = document.getElementById('fontSize');
    if (fontSize) {
      fontSize.value = settings.fontSize || 'normal';
    }

    if (settings.margins) {
      const marginTop = document.getElementById(modalMarginIds.top);
      const marginRight = document.getElementById(modalMarginIds.right);
      const marginBottom = document.getElementById(modalMarginIds.bottom);
      const marginLeft = document.getElementById(modalMarginIds.left);

      if (marginTop) marginTop.value = settings.margins.top ?? 20;
      if (marginRight) marginRight.value = settings.margins.right ?? 15;
      if (marginBottom) marginBottom.value = settings.margins.bottom ?? 20;
      if (marginLeft) marginLeft.value = settings.margins.left ?? 15;
    }
  }

  function getPrintSettings() {
    return {
      printerName: document.getElementById('printerSelect')?.value || '',
      copies: parseInt(document.getElementById('copiesInput')?.value, 10) || 1,
      paperSize: document.getElementById('paperSizeSelect')?.value || 'A4',
      orientation: document.getElementById('orientationSelect')?.value || 'portrait',
      color: !!document.getElementById('colorPrintCheck')?.checked,
      duplex: document.getElementById('duplexSelect')?.value || 'simplex',
      fontSize: document.getElementById('fontSize') ? document.getElementById('fontSize').value : 'normal',
      fontFamily: document.getElementById('fontFamily') ? document.getElementById('fontFamily').value : 'Cairo',
      margins: {
        top: parseFloat(document.getElementById(modalMarginIds.top)?.value) || 20,
        right: parseFloat(document.getElementById(modalMarginIds.right)?.value) || 15,
        bottom: parseFloat(document.getElementById(modalMarginIds.bottom)?.value) || 20,
        left: parseFloat(document.getElementById(modalMarginIds.left)?.value) || 15
      }
    };
  }

  async function initializePrintSystem() {
    try {
      const printers = await ipcRenderer.invoke('get-printers');
      setAvailablePrinters(Array.isArray(printers) ? printers : []);
      updatePrintersList();

      const settings = await ipcRenderer.invoke('get-print-settings');
      loadPrintSettings(settings || {});

      logger.log('Print system initialized successfully');
    } catch (error) {
      logger.error('Error initializing print system:', error);
      getDialogUtils().showErrorToast('حدث خطأ في تهيئة نظام الطباعة');
    }
  }

  return {
    initializePrintSystem,
    loadPrintSettings,
    getPrintSettings,
    updatePrintersList
  };
}

module.exports = {
  createAdvancedPrintSettingsHandlers
};
