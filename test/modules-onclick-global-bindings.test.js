const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('all inline onclick handlers in src/modules/receipts.js have global bindings', () => {
  const filePath = path.join(__dirname, '..', 'src', 'modules', 'receipts.js');
  const content = fs.readFileSync(filePath, 'utf8');

  const onclickRegex = /onclick\s*=\s*(["'`])([\s\S]*?)\1/g;
  const callRegex = /(?:^|[^\w$.])(?:window\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  const globalAssignRegex = /(?:windowObj|window|globalThis)\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g;

  const onclickCalls = new Set();
  const globalBindings = new Set();

  let match;
  while ((match = onclickRegex.exec(content)) !== null) {
    const body = match[2];

    let callMatch;
    while ((callMatch = callRegex.exec(body)) !== null) {
      onclickCalls.add(callMatch[1]);
    }
  }

  while ((match = globalAssignRegex.exec(content)) !== null) {
    globalBindings.add(match[1]);
  }

  const unresolved = Array.from(onclickCalls).filter((fnName) => !globalBindings.has(fnName)).sort();

  assert.deepEqual(
    unresolved,
    [],
    `Missing global onclick bindings in receipts module: ${unresolved.join(', ')}`
  );
});
