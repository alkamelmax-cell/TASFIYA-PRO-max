const test = require('node:test');
const assert = require('node:assert/strict');
const { createSidebarToggleHandlers } = require('../src/app/sidebar-toggle');

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(token) { values.add(token); },
    remove(token) { values.delete(token); },
    contains(token) { return values.has(token); }
  };
}

function createElement(initialClasses = []) {
  return {
    classList: createClassList(initialClasses),
    style: {},
    attributes: {},
    title: '',
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

function buildContext(overrides = {}) {
  const elements = {
    sidebar: createElement(),
    mainContent: createElement(),
    sidebarToggle: createElement(),
    fixedSidebarToggle: createElement(['hidden'])
  };

  const listeners = {};
  const storage = new Map();

  const document = {
    getElementById(id) {
      return elements[id] || null;
    },
    addEventListener(name, handler) {
      listeners[name] = handler;
    }
  };

  const localStorageObj = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    }
  };

  const windowObj = {};

  const handlers = createSidebarToggleHandlers({
    document,
    localStorageObj,
    windowObj,
    logger: { log() {}, error() {} },
    ...overrides
  });

  return { handlers, elements, listeners, storage, windowObj };
}

test('initializeSidebarToggle restores collapsed state from local storage', () => {
  const { handlers, elements, storage, windowObj } = buildContext();
  storage.set('sidebarCollapsed', 'true');

  handlers.initializeSidebarToggle();

  assert.equal(handlers.isSidebarCollapsed(), true);
  assert.equal(elements.sidebar.classList.contains('collapsed'), true);
  assert.equal(elements.mainContent.classList.contains('expanded'), true);
  assert.equal(elements.fixedSidebarToggle.style.display, 'flex');
  assert.equal(typeof windowObj.toggleSidebar, 'function');
});

test('toggleSidebar updates classes and persists value', () => {
  const { handlers, elements, storage } = buildContext();

  handlers.toggleSidebar();

  assert.equal(handlers.isSidebarCollapsed(), true);
  assert.equal(storage.get('sidebarCollapsed'), 'true');
  assert.equal(elements.sidebar.classList.contains('collapsed'), true);
  assert.equal(elements.fixedSidebarToggle.style.display, 'flex');
});

test('keydown ctrl+b toggles sidebar and resetSidebarState expands it', () => {
  const { handlers, listeners, storage } = buildContext();
  handlers.initializeSidebarToggle();

  let prevented = false;
  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    key: 'b',
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(handlers.isSidebarCollapsed(), true);

  handlers.resetSidebarState();

  assert.equal(handlers.isSidebarCollapsed(), false);
  assert.equal(storage.get('sidebarCollapsed'), 'false');
});
