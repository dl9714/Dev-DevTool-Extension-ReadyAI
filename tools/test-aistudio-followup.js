const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const part11 = fs.readFileSync(path.join(root, 'src', 'content', 'part-11.js'), 'utf8');

function extractSimpleFunction(source, name) {
  const pattern = new RegExp(`function ${name}\\([^]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

const context = {};
vm.createContext(context);
vm.runInContext(
  `${extractSimpleFunction(part11, 'shouldInferAiStudioGeneratingFromRunButton')}\n`
    + `${extractSimpleFunction(part11, 'clearAiStudioGenerationProbeBurst')}\n`
    + `${extractSimpleFunction(part11, 'armAiStudioGenerationProbeBurst')}\n`
    + `${extractSimpleFunction(part11, 'hasVisibleAiStudioStopControl')}\n`
    + `${extractSimpleFunction(part11, 'hasVisibleAiStudioScopedActivitySignal')}\n`
    + 'this.policy = shouldInferAiStudioGeneratingFromRunButton;\n'
    + 'this.clearProbeBurst = clearAiStudioGenerationProbeBurst;\n'
    + 'this.armProbeBurst = armAiStudioGenerationProbeBurst;\n'
    + 'this.stopControlPolicy = hasVisibleAiStudioStopControl;\n'
    + 'this.scopedActivityPolicy = hasVisibleAiStudioScopedActivitySignal;',
  context
);

const cases = [
  ['recent Ctrl+Enter plus missing Run is generating', { composerVisible: true, runButtonVisible: false, runRequestedRecently: true }, true],
  ['Ready_Ai response wait plus missing Run is generating', { composerVisible: true, runButtonVisible: false, awaitingResponseStart: true }, true],
  ['queued turn wait plus missing Run is generating', { composerVisible: true, runButtonVisible: false, awaitingTurnCompletion: true }, true],
  ['an observed generation stays active while Run is absent', { composerVisible: true, runButtonVisible: false, wasGenerating: true }, true],
  ['Run returning ends generation', { composerVisible: true, runButtonVisible: true, runRequestedRecently: true, wasGenerating: true }, false],
  ['missing composer is not a generation signal', { composerVisible: false, runButtonVisible: false, runRequestedRecently: true }, false],
  ['idle initial page is not generating', { composerVisible: true, runButtonVisible: false }, false],
  ['normal idle Run is not generating', { composerVisible: true, runButtonVisible: true }, false],
];

for (const [label, options, expected] of cases) {
  assert.equal(context.policy(options), expected, label);
}

let nextTimerId = 1;
const scheduledTimers = new Map();
const clearedTimerIds = [];
let pollingForceCalls = 0;
let scheduledForcedChecks = 0;
context.getSiteKey = () => 'aistudio';
context.ensurePolling = (force) => { if (force) pollingForceCalls += 1; };
context.scheduleCheck = (force) => { if (force) scheduledForcedChecks += 1; };
context.window = {
  setTimeout: (callback, delay) => {
    const id = nextTimerId++;
    scheduledTimers.set(id, { callback, delay });
    return id;
  },
};
context.clearTimeout = (id) => {
  clearedTimerIds.push(id);
  scheduledTimers.delete(id);
};
context.aiStudioRunRequestedAt = 0;
context.aiStudioGenerationProbeTimers = [];
assert.equal(context.armProbeBurst(), true, 'AI Studio run arms a generation probe burst');
assert.equal(context.aiStudioGenerationProbeTimers.length, 9, 'the bounded burst owns exactly nine timers');
assert.deepEqual(
  Array.from(scheduledTimers.values(), (timer) => timer.delay),
  [0, 90, 220, 500, 900, 1500, 2600, 4500, 7500],
  'the probe schedule covers immediate start and delayed completion'
);
assert.equal(pollingForceCalls, 1, 'arming immediately refreshes the polling cadence');
for (const timer of scheduledTimers.values()) timer.callback();
assert.equal(scheduledForcedChecks, 9, 'every probe requests a forced status check');

const firstBurstTimerIds = [...context.aiStudioGenerationProbeTimers];
assert.equal(context.armProbeBurst(), true, 'a repeated Run replaces the prior burst');
assert.ok(firstBurstTimerIds.every((id) => clearedTimerIds.includes(id)), 'rearming clears every prior timer');
assert.equal(context.aiStudioGenerationProbeTimers.length, 9, 'rearming never grows the timer set');
context.clearProbeBurst();
assert.equal(context.aiStudioGenerationProbeTimers.length, 0, 'completion clears every probe timer');
assert.equal(context.aiStudioRunRequestedAt, 0, 'completion clears the recent Run marker');

context.getSiteKey = () => 'chatgpt';
assert.equal(context.armProbeBurst(), false, 'non-AI-Studio pages do not allocate probe timers');
assert.equal(context.aiStudioGenerationProbeTimers.length, 0, 'non-AI-Studio pages remain timer-free');

context.isVisible = (el) => el?.visible !== false;
context.isEnabledButtonLike = (el) => el?.enabled !== false;
context.qsa = () => [{ visible: true, enabled: true }];
assert.equal(context.stopControlPolicy(), true, 'a visible enabled Stop control is detected');
context.qsa = () => [{ visible: true, enabled: false }];
assert.equal(context.stopControlPolicy(), false, 'a disabled Stop control does not hold generation open');

const mockElement = ({ matches = false, text = '', fontIcon = '', svgIcon = '', visible = true } = {}) => ({
  visible,
  textContent: text,
  matches: () => matches,
  getAttribute: (name) => (name === 'fonticon' ? fontIcon : (name === 'svgicon' ? svgIcon : '')),
});
const mockScope = (elements) => ({ querySelectorAll: () => elements });
context.getVisibleAiStudioSignalScopes = () => [mockScope([mockElement({ matches: true })])];
assert.equal(context.scopedActivityPolicy(), true, 'a scoped progress element is detected');
context.getVisibleAiStudioSignalScopes = () => [mockScope([mockElement({ text: 'stop_circle' })])];
assert.equal(context.scopedActivityPolicy(), true, 'a scoped Stop icon is detected');
context.getVisibleAiStudioSignalScopes = () => [mockScope([mockElement({ text: 'keyboard_return' })])];
assert.equal(context.scopedActivityPolicy(), false, 'an unrelated Material icon is ignored');
context.getVisibleAiStudioSignalScopes = () => [];
assert.equal(context.scopedActivityPolicy(), false, 'a missing active prompt scope stays idle');

assert.match(part11, /const delays = \[0, 90, 220, 500, 900, 1500, 2600, 4500, 7500\]/);
assert.match(part11, /platform === 'aistudio'\) clearAiStudioGenerationProbeBurst\(\)/);
assert.doesNotMatch(part11, /\.material-symbols-outlined:not\(\[class\*="keyboard"\]\)/);
assert.match(part11, /getVisibleAiStudioSignalScopes\(\)/);
const part07 = fs.readFileSync(path.join(root, 'src', 'content', 'part-07.js'), 'utf8');
assert.match(part07, /siteKey === 'aistudio'\) armAiStudioGenerationProbeBurst\(\)/);
const part01 = fs.readFileSync(path.join(root, 'src', 'content', 'part-01.js'), 'utf8');
assert.match(part01, /CHECK_INTERVAL_VISIBLE_IDLE_MS = 5000/);
assert.match(part01, /MIN_CHECK_GAP_IDLE_MS = 1500/);

console.log(`Ready_Ai AI Studio follow-up: ${cases.length + 25} cases passed`);
