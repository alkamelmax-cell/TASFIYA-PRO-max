const test = require('node:test');
const assert = require('node:assert/strict');

function loadKeyboardShortcuts() {
  const listeners = {};

  global.document = {
    addEventListener(eventName, callback) {
      listeners[eventName] = callback;
    }
  };

  global.window = {};

  const modulePath = require.resolve('../src/keyboard-shortcuts');
  delete require.cache[modulePath];
  const keyboardShortcuts = require(modulePath);

  return { keyboardShortcuts, listeners };
}

function cleanupGlobals() {
  delete global.document;
  delete global.window;
}

test('buildKeyCombo handles missing key without throwing', () => {
  const { keyboardShortcuts } = loadKeyboardShortcuts();

  assert.equal(keyboardShortcuts.buildKeyCombo(null), '');
  assert.equal(keyboardShortcuts.buildKeyCombo({ ctrlKey: true }), 'ctrl');
  assert.equal(keyboardShortcuts.buildKeyCombo({ key: 'A' }), 'a');

  cleanupGlobals();
});

test('isInputElement allows Escape key in input fields', () => {
  const { keyboardShortcuts } = loadKeyboardShortcuts();

  const inputElement = { tagName: 'INPUT', isContentEditable: false };
  assert.equal(keyboardShortcuts.isInputElement(inputElement, 'Enter'), true);
  assert.equal(keyboardShortcuts.isInputElement(inputElement, 'Escape'), false);
  assert.equal(keyboardShortcuts.isInputElement(null, 'Escape'), false);

  cleanupGlobals();
});

test('handleKeyDown does not crash when key is undefined', () => {
  const { keyboardShortcuts } = loadKeyboardShortcuts();

  let called = false;
  keyboardShortcuts.register('ctrl+s', () => {
    called = true;
  }, 'save');

  assert.doesNotThrow(() => {
    keyboardShortcuts.handleKeyDown({
      ctrlKey: true,
      key: undefined,
      target: { tagName: 'DIV', isContentEditable: false },
      preventDefault() {}
    });
  });

  keyboardShortcuts.handleKeyDown({
    ctrlKey: true,
    key: 's',
    target: { tagName: 'DIV', isContentEditable: false },
    preventDefault() {}
  });

  assert.equal(called, true);
  cleanupGlobals();
});
