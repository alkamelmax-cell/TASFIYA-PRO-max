const test = require('node:test');
const assert = require('node:assert/strict');
const { createThermalPrinterSettingsHandlers } = require('../src/app/thermal-printer-settings');

function createDialogTracker() {
  return {
    calls: [],
    showLoading(message) { this.calls.push(['showLoading', message]); },
    hideLoading() { this.calls.push(['hideLoading']); },
    showSuccessToast(message) { this.calls.push(['showSuccessToast', message]); },
    showSuccess(message, title) { this.calls.push(['showSuccess', message, title]); },
    showError(message, title) { this.calls.push(['showError', message, title]); }
  };
}

function createElement(initial = {}) {
  return {
    value: '',
    checked: false,
    innerHTML: '',
    options: [],
    listeners: {},
    ...initial,
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    },
    appendChild(option) {
      this.options.push(option);
    }
  };
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      return createElement();
    }
  };
}

test('loadAvailablePrinters fills printer select options', async () => {
  const elements = {
    thermalPrinterName: createElement()
  };

  const handlers = createThermalPrinterSettingsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        assert.equal(channel, 'thermal-printer-list');
        return {
          success: true,
          printers: [
            { name: 'P1', displayName: 'Printer One', isDefault: true },
            { name: 'P2', displayName: 'Printer Two', isDefault: false }
          ]
        };
      }
    },
    getDialogUtils: () => createDialogTracker(),
    logger: { log() {}, error() {}, warn() {} }
  });

  await handlers.loadAvailablePrinters();
  assert.equal(elements.thermalPrinterName.options.length, 2);
  assert.equal(elements.thermalPrinterName.options[0].value, 'P1');
  assert.equal(elements.thermalPrinterName.options[0].selected, true);
});

test('initializeThermalPrinterSettings wires listeners and loads settings', async () => {
  const elements = {
    thermalPrinterSettingsForm: createElement(),
    testThermalPrint: createElement(),
    refreshPrintersList: createElement(),
    thermalPrinterName: createElement(),
    thermalFontSize: createElement({ value: '' }),
    thermalFontName: createElement({ value: '' }),
    thermalCopies: createElement({ value: '' }),
    thermalColorPrint: createElement({ checked: false }),
    thermalAutoFeed: createElement({ checked: false }),
    thermalPaperWidth: createElement({ value: '' })
  };

  const invokedChannels = [];
  const handlers = createThermalPrinterSettingsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel) => {
        invokedChannels.push(channel);
        if (channel === 'thermal-printer-list') {
          return { success: false, printers: [] };
        }
        if (channel === 'thermal-printer-settings-get') {
          return {
            success: true,
            settings: {
              fontSize: 12,
              fontName: 'Tahoma',
              copies: 2,
              color: true,
              paperWidth: 58,
              printerName: 'SavedPrinter'
            }
          };
        }
        return { success: true };
      }
    },
    getDialogUtils: () => createDialogTracker(),
    logger: { log() {}, error() {}, warn() {} }
  });

  await handlers.initializeThermalPrinterSettings();

  assert.equal(typeof elements.thermalPrinterSettingsForm.listeners.submit, 'function');
  assert.equal(typeof elements.testThermalPrint.listeners.click, 'function');
  assert.equal(typeof elements.refreshPrintersList.listeners.click, 'function');
  assert.ok(invokedChannels.includes('thermal-printer-list'));
  assert.ok(invokedChannels.includes('thermal-printer-settings-get'));
  assert.equal(elements.thermalFontName.value, 'Tahoma');
  assert.equal(elements.thermalColorPrint.checked, true);
});

test('handleSaveThermalPrinterSettings submits parsed values', async () => {
  const elements = {
    thermalFontName: createElement({ value: 'Arial' }),
    thermalFontSize: createElement({ value: '11' }),
    thermalCopies: createElement({ value: '3' }),
    thermalColorPrint: createElement({ checked: true }),
    thermalPrinterName: createElement({ value: 'POS' }),
    thermalPaperWidth: createElement({ value: '80' })
  };
  const dialog = createDialogTracker();
  const invocations = [];

  const handlers = createThermalPrinterSettingsHandlers({
    document: createDocument(elements),
    ipcRenderer: {
      invoke: async (channel, payload) => {
        invocations.push([channel, payload]);
        return { success: true };
      }
    },
    getDialogUtils: () => dialog,
    logger: { log() {}, error() {}, warn() {} }
  });

  let prevented = false;
  await handlers.handleSaveThermalPrinterSettings({
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.equal(invocations[0][0], 'thermal-printer-settings-update');
  assert.deepEqual(invocations[0][1], {
    fontName: 'Arial',
    fontSize: 11,
    copies: 3,
    color: true,
    printerName: 'POS',
    paperWidth: 80
  });
  assert.equal(dialog.calls[0][0], 'showLoading');
  assert.equal(dialog.calls[2][0], 'showSuccessToast');
});
