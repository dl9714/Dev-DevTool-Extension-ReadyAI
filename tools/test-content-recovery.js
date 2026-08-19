const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8');

function extractSimpleFunction(source, name) {
  const pattern = new RegExp(`function ${name}\\([^]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

const context = {};
vm.createContext(context);
vm.runInContext(
  `${extractSimpleFunction(background, 'shouldRecoverManifestManagedContent')}\n`
    + 'this.shouldRecover = shouldRecoverManifestManagedContent;',
  context
);

const cases = [
  ['completed tab with no listener is recovered', { status: 'complete' }, null, {}, true],
  ['completed tab with a responsive listener is not duplicated', { status: 'complete' }, { ok: true }, {}, false],
  ['completed tab with an older responsive build is replaced', { status: 'complete' }, { ok: true }, { recoverVersionMismatch: true }, true],
  ['loading tab with an older responsive build waits', { status: 'loading' }, { ok: true }, { recoverVersionMismatch: true }, false],
  ['loading tab waits for manifest document_idle injection', { status: 'loading' }, null, {}, false],
  ['unknown tab state is not injected speculatively', {}, null, {}, false],
  ['an explicit force can recover a non-complete tab', { status: 'loading' }, null, { forceInject: true }, true],
  ['force still does not duplicate a responsive listener', { status: 'complete' }, { ok: true }, { forceInject: true }, false],
];

for (const [label, tab, response, options, expected] of cases) {
  assert.equal(context.shouldRecover(tab, response, options), expected, label);
}

assert.match(background, /recoverVersionMismatch: true/);
assert.match(background, /return isCurrentBuild\(reinjected\);/);
assert.match(background, /kickActivePrimaryAiTabs\('sw_init_active'\)/);

console.log(`Ready_Ai content recovery: ${cases.length} policy cases passed`);
