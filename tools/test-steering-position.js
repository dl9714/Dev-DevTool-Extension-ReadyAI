const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const part03 = fs.readFileSync(path.join(root, 'src', 'content', 'part-03.js'), 'utf8');

function extractSimpleFunction(source, name) {
  const pattern = new RegExp(`(?:async\\s+)?function ${name}\\([^]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

const context = {};
vm.createContext(context);
vm.runInContext(
  `${extractSimpleFunction(part03, 'getSteeringAnchorElement')}\n`
    + 'this.getAnchor = getSteeringAnchorElement;',
  context
);

let siteKey = 'gemini';
let outerVisible = true;
const inputArea = { id: 'gemini-input-area' };
const form = { id: 'fallback-form' };
const composer = {
  closest(selector) {
    if (selector.includes('input-area-v2')) return inputArea;
    if (selector === 'form') return form;
    return null;
  },
};
context.getActiveComposer = () => composer;
context.getSiteKey = () => siteKey;
context.isVisible = (element) => element === inputArea ? outerVisible : true;

assert.equal(context.getAnchor(), inputArea, 'Gemini uses the full input container, including right-side controls');

outerVisible = false;
assert.equal(context.getAnchor(), form, 'Gemini safely falls back when the outer container is hidden');

outerVisible = true;
for (const key of ['chatgpt', 'aistudio', 'claude', 'perplexity']) {
  siteKey = key;
  assert.equal(context.getAnchor(), form, `${key} keeps its existing anchor behavior`);
}

context.getActiveComposer = () => null;
assert.equal(context.getAnchor(), null, 'a missing composer remains safe');

const positionContext = {};
vm.createContext(positionContext);
vm.runInContext(
  `${extractSimpleFunction(part03, 'getSteeringStableBottom')}\n`
    + `${extractSimpleFunction(part03, 'positionSteeringUi')}\n`
    + `${extractSimpleFunction(part03, 'refreshFallbackSteeringPosition')}\n`
    + 'this.position = positionSteeringUi;',
  positionContext
);

let anchorRect = { right: 1316, top: 738 };
let positionSiteKey = 'gemini';
let sizeVarApplyCount = 0;
positionContext.steeringHost = { style: { setProperty() {} } };
positionContext.steeringPanelOpen = false;
positionContext.steeringQueue = [];
positionContext.steeringAdvancedEnabled = false;
positionContext.steeringLastPositionSignature = '';
positionContext.window = { innerWidth: 1920, innerHeight: 855 };
positionContext.getSteeringAnchorElement = () => ({ getBoundingClientRect: () => anchorRect });
positionContext.getSteeringLayoutPositionKey = () => 'closed:empty:basic';
positionContext.getSiteKey = () => positionSiteKey;
positionContext.applySteeringViewportSizeVars = () => { sizeVarApplyCount += 1; };
positionContext.shouldDockSteeringAtViewportBottom = () => false;

assert.equal(positionContext.getSteeringStableBottom('gemini'), 111, 'Gemini uses the measured conversation dock height');
assert.equal(positionContext.getSteeringStableBottom('chatgpt'), 122, 'ChatGPT retains its existing stable dock height');
assert.equal(positionContext.getSteeringStableBottom('aistudio'), null, 'AI Studio retains composer-relative vertical positioning');

positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '604px', '1920px Gemini aligns with the measured full input right edge');
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'Gemini launcher starts at the same lower dock used during a conversation');

anchorRect = { right: 1316, top: 395.5 };
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'Gemini home composer does not pull the launcher into the middle of the viewport');

const sizeVarApplyCountBeforeRepeat = sizeVarApplyCount;
for (let i = 0; i < 1000; i += 1) positionContext.position(false);
assert.equal(sizeVarApplyCount, sizeVarApplyCountBeforeRepeat, 'unchanged repeated positioning is skipped');

for (const scenario of [
  { width: 360, height: 420, right: 348, top: 190, expectedRight: 12 },
  { width: 1024, height: 640, right: 890, top: 280, expectedRight: 134 },
  { width: 1366, height: 768, right: 1100, top: 650, expectedRight: 266 },
  { width: 2560, height: 1440, right: 1880, top: 1260, expectedRight: 680 },
]) {
  positionContext.window.innerWidth = scenario.width;
  positionContext.window.innerHeight = scenario.height;
  anchorRect = { right: scenario.right, top: scenario.top };
  positionContext.steeringLastPositionSignature = '';
  positionContext.position(true);
  assert.equal(positionContext.steeringHost.style.right, `${scenario.expectedRight}px`, `Gemini keeps safe horizontal alignment at ${scenario.width}x${scenario.height}`);
  assert.equal(positionContext.steeringHost.style.bottom, '111px', `Gemini keeps the lower dock at ${scenario.width}x${scenario.height}`);
}

positionContext.window.innerWidth = 760;
positionContext.window.innerHeight = 700;
anchorRect = { right: 748, top: 620 };
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '12px', 'narrow Gemini view keeps the 12px viewport safe margin');
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'narrow Gemini view keeps the stable lower dock');

positionContext.window.innerWidth = 1920;
positionContext.window.innerHeight = 855;
anchorRect = { right: 1316, top: 395.5 };
positionContext.getSteeringAnchorElement = () => null;
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '18px', 'Gemini stays safe before its composer is mounted');
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'Gemini starts at the lower dock even before its composer is mounted');
assert.match(positionContext.steeringLastPositionSignature, /\|fallback\|/, 'Gemini keeps retrying horizontal anchoring while its composer is missing');

positionContext.getSteeringAnchorElement = () => ({ getBoundingClientRect: () => anchorRect });
assert.equal(positionContext.refreshFallbackSteeringPosition(), true, 'Gemini retries horizontal anchoring after the composer mounts');
assert.equal(positionContext.steeringHost.style.right, '604px', 'Gemini resolves to the full composer right edge without a click');
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'Gemini remains at the lower dock after resolving its composer');

positionSiteKey = 'chatgpt';
positionContext.window.innerWidth = 1920;
positionContext.window.innerHeight = 855;
anchorRect = { right: 1200, top: 730 };
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '482px', 'ChatGPT keeps its existing 250px shift and scrollbar gutter');
assert.equal(positionContext.steeringHost.style.bottom, '122px', 'ChatGPT keeps its stable vertical dock');

positionSiteKey = 'aistudio';
anchorRect = { right: 1200, top: 730 };
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '720px', 'AI Studio remains anchored without a Gemini-specific shift');

positionContext.getSteeringAnchorElement = () => null;
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '18px', 'a missing AI Studio composer uses the temporary viewport fallback');
assert.match(positionContext.steeringLastPositionSignature, /\|fallback\|/, 'the temporary position remains identifiable for a later DOM refresh');

positionContext.getSteeringAnchorElement = () => ({ getBoundingClientRect: () => anchorRect });
assert.equal(positionContext.refreshFallbackSteeringPosition(), true, 'a status refresh retries the temporary position');
assert.equal(positionContext.steeringHost.style.right, '720px', 'AI Studio moves to the composer anchor without requiring a launcher click');
assert.doesNotMatch(positionContext.steeringLastPositionSignature, /\|fallback\|/, 'the resolved position stops fallback retries');

const fitContext = {};
vm.createContext(fitContext);
vm.runInContext(
  `${extractSimpleFunction(part03, 'fitOpenSteeringUiInsideViewport')}\n`
    + 'this.fit = fitOpenSteeringUiInsideViewport;',
  fitContext
);
fitContext.steeringPanelOpen = true;
fitContext.steeringHost = {
  style: { bottom: '111px' },
  getBoundingClientRect: () => ({ top: -30 }),
};
fitContext.fit();
assert.equal(fitContext.steeringHost.style.bottom, '69px', 'an open Gemini panel shifts down only enough to keep its top clickable');

fitContext.steeringPanelOpen = false;
fitContext.steeringHost.style.bottom = '111px';
fitContext.fit();
assert.equal(fitContext.steeringHost.style.bottom, '111px', 'a closed launcher keeps the stable lower dock');

console.log('steering position regression tests passed');
