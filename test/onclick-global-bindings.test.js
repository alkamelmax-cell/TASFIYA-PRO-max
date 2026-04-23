const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function collectFiles(dir, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, list);
      continue;
    }

    if (entry.isFile() && /\.(js|html)$/i.test(entry.name)) {
      list.push(fullPath);
    }
  }

  return list;
}

test('all inline onclick handlers in src/app have global function bindings', () => {
  const appRoot = path.join(__dirname, '..', 'src', 'app');
  const files = collectFiles(appRoot);

  const onclickRegex = /onclick\s*=\s*(["'`])([\s\S]*?)\1/g;
  const callRegex = /(?:^|[^\w$.])(?:window\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  const globalAssignRegex = /(?:windowObj|window|globalThis)\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g;
  const ignoredBuiltins = new Set(['print', 'close']);

  const onclickCalls = new Map();
  const globalBindings = new Set();

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    let match;
    while ((match = onclickRegex.exec(content)) !== null) {
      const onclickBody = match[2];

      let callMatch;
      while ((callMatch = callRegex.exec(onclickBody)) !== null) {
        const fnName = callMatch[1];
        if (ignoredBuiltins.has(fnName)) {
          continue;
        }
        if (!onclickCalls.has(fnName)) {
          onclickCalls.set(fnName, new Set());
        }
        onclickCalls.get(fnName).add(path.relative(process.cwd(), file));
      }
    }

    while ((match = globalAssignRegex.exec(content)) !== null) {
      globalBindings.add(match[1]);
    }
  }

  const unresolved = [];
  for (const [fnName, refs] of onclickCalls.entries()) {
    if (!globalBindings.has(fnName)) {
      unresolved.push({
        fnName,
        refs: Array.from(refs).sort()
      });
    }
  }

  assert.deepEqual(
    unresolved,
    [],
    `Missing global onclick bindings:\n${unresolved.map((item) => `${item.fnName} <- ${item.refs.join(', ')}`).join('\n')}`
  );
});
