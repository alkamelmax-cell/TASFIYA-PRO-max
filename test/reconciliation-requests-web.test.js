const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readPageScript() {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'web-dashboard', 'reconciliation-requests.html'),
    'utf8'
  );
  const inlineScripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
    .map((match) => match[1])
    .filter((script) => script.trim());
  return inlineScripts.at(-1);
}

function createElement() {
  return {
    innerHTML: '',
    style: {},
    classList: { add() {}, remove() {} }
  };
}

test('pending requests render even when the optional OneSignal helper is unavailable', async () => {
  const requestsTableBody = createElement();
  const mobileCardsContainer = createElement();
  const elements = new Map([
    ['requestsTableBody', requestsTableBody],
    ['mobileCardsContainer', mobileCardsContainer]
  ]);

  const document = {
    visibilityState: 'visible',
    documentElement: createElement(),
    body: createElement(),
    getElementById(id) {
      return elements.get(id) || createElement();
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {}
  };
  const window = {
    location: { href: '', hostname: 'example.test' },
    addEventListener() {}
  };

  const context = vm.createContext({
    window,
    document,
    localStorage: {
      getItem(key) {
        return key === 'user' ? JSON.stringify({ id: 1, role: 'admin' }) : null;
      }
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          success: true,
          data: [{
            id: 695,
            cashier_id: 12,
            cashier_name: 'علاء',
            status: 'pending',
            created_at: '2026-08-18T18:36:16.801Z',
            total_cash: '5278.00'
          }]
        });
      }
    }),
    Swal: { async fire() { return {}; } },
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout,
    clearTimeout,
    console
  });
  window.window = window;
  window.document = document;

  vm.runInContext(readPageScript(), context, {
    filename: 'reconciliation-requests.inline.js'
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(requestsTableBody.innerHTML, /#695/);
  assert.match(requestsTableBody.innerHTML, /علاء/);
});
