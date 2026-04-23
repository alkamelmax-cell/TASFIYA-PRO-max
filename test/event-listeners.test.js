const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventListenersSetup } = require('../src/app/event-listeners');

function createElement(id, calls) {
  return {
    id,
    addEventListener(eventName, handler) {
      calls.push([id, eventName, typeof handler]);
    }
  };
}

test('setupEventListeners wires core forms/buttons without throwing', () => {
  const calls = [];
  const elements = new Map();
  const menuItems = [createElement('menu-1', calls), createElement('menu-2', calls)];

  const doc = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createElement(id, calls));
      }
      return elements.get(id);
    },
    querySelectorAll(selector) {
      if (selector === '.menu-item') {
        return menuItems;
      }
      return [];
    }
  };

  const noop = () => {};
  const setup = createEventListenersSetup({
    document: doc,
    handlers: new Proxy({}, { get: () => noop })
  });

  setup.setupEventListeners();

  assert.ok(calls.some((entry) => entry[0] === 'newReconciliationForm' && entry[1] === 'submit'));
  assert.ok(calls.some((entry) => entry[0] === 'printDetailedAtmReport' && entry[1] === 'click'));
  const recallCount = calls.filter((entry) => entry[0] === 'recallReconciliationBtn' && entry[1] === 'click').length;
  assert.ok(recallCount >= 1);
});
