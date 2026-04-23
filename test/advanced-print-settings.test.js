const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdvancedPrintSettingsHandlers } = require('../src/app/advanced-print-settings');

function createElement(initial = {}) {
  return {
    value: '',
    checked: false,
    innerHTML: '',
    children: [],
    ...initial,
    appendChild(child) {
      this.children.push(child);
    }
  };
}

function buildContext(overrides = {}) {
  const elements = {
    printerSelect: createElement(),
    copiesInput: createElement({ value: '1' }),
    paperSizeSelect: createElement({ value: 'A4' }),
    orientationSelect: createElement({ value: 'portrait' }),
    colorPrintCheck: createElement({ checked: false }),
    duplexSelect: createElement({ value: 'simplex' }),
    fontFamily: createElement({ value: 'Cairo' }),
    fontSize: createElement({ value: 'normal' }),
    printDialogMarginTop: createElement({ value: '1' }),
    printDialogMarginRight: createElement({ value: '1' }),
    printDialogMarginBottom: createElement({ value: '1' }),
    printDialogMarginLeft: createElement({ value: '1' })
  };

  const state = {
    availablePrinters: [],
    invokeCalls: []
  };

  const dialog = {
    errorToasts: [],
    showErrorToast(message) {
      this.errorToasts.push(message);
    }
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
        if (channel === 'get-printers') {
          return [{ name: 'P1', displayName: 'Printer 1', isDefault: true }];
        }
        if (channel === 'get-print-settings') {
          return {
            printerName: 'P1',
            copies: 2,
            paperSize: 'Letter',
            orientation: 'landscape',
            color: true,
            duplex: 'duplex',
            fontFamily: 'Arial',
            fontSize: 'large',
            margins: { top: 2, right: 3, bottom: 4, left: 5 }
          };
        }
        return null;
      }
    },
    getDialogUtils: () => dialog,
    getAvailablePrinters: () => state.availablePrinters,
    setAvailablePrinters: (value) => {
      state.availablePrinters = value;
    },
    logger: { log() {}, error() {} },
    ...overrides
  };

  const handlers = createAdvancedPrintSettingsHandlers(deps);
  return { handlers, elements, state, dialog };
}

test('initializePrintSystem loads printers and applies saved settings', async () => {
  const ctx = buildContext();

  await ctx.handlers.initializePrintSystem();

  assert.equal(ctx.state.availablePrinters.length, 1);
  assert.equal(ctx.elements.printerSelect.children.length, 1);
  assert.equal(ctx.elements.printerSelect.value, 'P1');
  assert.equal(ctx.elements.copiesInput.value, 2);
  assert.equal(ctx.elements.paperSizeSelect.value, 'Letter');
  assert.equal(ctx.elements.orientationSelect.value, 'landscape');
  assert.equal(ctx.elements.colorPrintCheck.checked, true);
});

test('getPrintSettings reads values and parses numeric fields', () => {
  const ctx = buildContext();
  ctx.elements.printerSelect.value = 'MyPrinter';
  ctx.elements.copiesInput.value = '3';
  ctx.elements.paperSizeSelect.value = 'A3';
  ctx.elements.orientationSelect.value = 'landscape';
  ctx.elements.colorPrintCheck.checked = true;
  ctx.elements.duplexSelect.value = 'duplex';
  ctx.elements.fontFamily.value = 'Arial';
  ctx.elements.fontSize.value = 'large';
  ctx.elements.printDialogMarginTop.value = '2.5';
  ctx.elements.printDialogMarginRight.value = '3.5';
  ctx.elements.printDialogMarginBottom.value = '1.2';
  ctx.elements.printDialogMarginLeft.value = '0.8';

  const settings = ctx.handlers.getPrintSettings();

  assert.equal(settings.printerName, 'MyPrinter');
  assert.equal(settings.copies, 3);
  assert.equal(settings.paperSize, 'A3');
  assert.equal(settings.orientation, 'landscape');
  assert.equal(settings.color, true);
  assert.equal(settings.margins.top, 2.5);
  assert.equal(settings.margins.left, 0.8);
});

test('loadPrintSettings applies defaults when values are missing', () => {
  const ctx = buildContext();

  ctx.handlers.loadPrintSettings({});

  assert.equal(ctx.elements.copiesInput.value, 1);
  assert.equal(ctx.elements.paperSizeSelect.value, 'A4');
  assert.equal(ctx.elements.orientationSelect.value, 'portrait');
  assert.equal(ctx.elements.colorPrintCheck.checked, false);
  assert.equal(ctx.elements.duplexSelect.value, 'simplex');
});
