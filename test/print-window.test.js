const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrintWindowHandlers } = require('../src/app/print-window');

function createWindowStub() {
  const opened = [];
  return {
    opened,
    open: (url, name) => {
      const win = {
        closed: false,
        document: {
          html: '',
          write(content) { this.html = content; },
          close() {}
        },
        focused: false,
        printed: false,
        closeCalled: false,
        focus() { this.focused = true; },
        print() { this.printed = true; },
        close() { this.closeCalled = true; this.closed = true; }
      };
      opened.push({ url, name, win });
      return win;
    }
  };
}

test('generatePrintPreview writes html and focuses preview window', () => {
  const windowStub = createWindowStub();
  const handlers = createPrintWindowHandlers({
    windowObj: windowStub,
    generatePrintHTML: () => '<html>preview</html>',
    getDialogUtils: () => ({ showError() {}, showSuccessToast() {} }),
    logger: { log() {}, error() {} }
  });

  handlers.generatePrintPreview({ sections: {}, options: {} });
  assert.equal(windowStub.opened.length, 1);
  assert.equal(windowStub.opened[0].name, 'printPreview');
  assert.equal(windowStub.opened[0].win.document.html, '<html>preview</html>');
  assert.equal(windowStub.opened[0].win.focused, true);
});

test('generateAndPrint shows popup error when print window cannot open', () => {
  const errors = [];
  const handlers = createPrintWindowHandlers({
    windowObj: { open: () => null },
    generatePrintHTML: () => '<html>print</html>',
    getDialogUtils: () => ({
      showError: (msg) => errors.push(msg),
      showSuccessToast() {}
    }),
    logger: { log() {}, error() {} }
  });

  handlers.generateAndPrint({ sections: {}, options: {} });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('فشل في فتح نافذة الطباعة'));
});

test('generateAndPrint prints then closes temporary window', () => {
  const windowStub = createWindowStub();
  const success = [];
  const timers = [];
  const handlers = createPrintWindowHandlers({
    windowObj: windowStub,
    setTimeoutFn: (fn, ms) => {
      timers.push(ms);
      fn();
      return 1;
    },
    generatePrintHTML: () => '<html>print</html>',
    getDialogUtils: () => ({
      showError() {},
      showSuccessToast: (msg) => success.push(msg)
    }),
    logger: { log() {}, error() {} }
  });

  handlers.generateAndPrint({ sections: {}, options: {} });
  const printWindow = windowStub.opened[0].win;
  printWindow.onload();

  assert.equal(printWindow.printed, true);
  assert.equal(printWindow.closeCalled, true);
  assert.deepEqual(timers, [500, 1000]);
  assert.equal(success.length, 1);
});
