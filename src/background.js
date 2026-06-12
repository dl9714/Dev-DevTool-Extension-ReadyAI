// sites registry (builtin/custom)
try {
  // background(service_worker)는 extension root 기준 경로가 안전함
  importScripts('src/sites.js');
} catch (_) {
  // ignore
}
// tabStates 구조(확장됨):
// {
//   [tabId]: {
//     status: 'WHITE' | 'ORANGE' | 'GREEN',
//     platform: string,
//     siteName?: string,
//     windowId?: number,
//     lastUpdateAt?: number,
//     orangeSinceAt?: number,
//     lastNudgeAt?: number,
//   }
// }
let tabStates = {};
// 프레임별 상태(iframe 대응)
// - all_frames=true + (특정 사이트는 UI가 cross-origin iframe에 있을 수 있음)
// - 따라서 탭 단위 상태는 "프레임들 중 하나라도 생성중이면 ORANGE" 로 계산한다.
// - 프레임 하나가 계속 false를 보내서 ORANGE->GREEN을 조기 트리거하는 문제를 막는다.
let frameStates = {}; // { tabId: { frameId: { isGenerating, platform, siteName, ts } } }
// ===== Settings (storage.local) =====
const STORAGE_KEYS = {
  DND_MODE: 'dndMode',
  BADGE_ENABLED: 'badgeEnabled',
  BADGE_COUNT_ENABLED: 'badgeCountEnabled',
  COMPLETION_HISTORY_ENABLED: 'completionHistoryEnabled',
  INDIVIDUAL_COMPLETION_NOTIFICATION_ENABLED: 'individualCompletionNotificationEnabled',
  INDIVIDUAL_COMPLETION_SOUND: 'individualCompletionSound',
  BATCH_COMPLETION_NOTIFICATION_ENABLED: 'batchCompletionNotificationEnabled',
  BATCH_COMPLETION_SOUND: 'batchCompletionSound',
  BATCH_COMPLETION_THRESHOLD: 'batchCompletionThreshold',
  INDIVIDUAL_COMPLETION_VOLUME: 'individualCompletionVolume',
  BATCH_COMPLETION_VOLUME: 'batchCompletionVolume',
  INDIVIDUAL_COMPLETION_CUSTOM_SOUND_DATA_URL: 'individualCompletionCustomSoundDataUrl',
  BATCH_COMPLETION_CUSTOM_SOUND_DATA_URL: 'batchCompletionCustomSoundDataUrl',
  INDIVIDUAL_COMPLETION_CUSTOM_SOUND_NAME: 'individualCompletionCustomSoundName',
  BATCH_COMPLETION_CUSTOM_SOUND_NAME: 'batchCompletionCustomSoundName',
  // Gemini는 "백그라운드에서는 완료 UI가 늦게 갱신" 되는 케이스가 있어서,
  // 유휴(Idle) 상태에서만 "탭을 잠깐 활성화"해서 완료를 확인하는 옵션을 추가한다.
  GEMINI_PROBE_ENABLED: 'geminiProbeEnabled',
  GEMINI_PROBE_PERIOD_MIN: 'geminiProbePeriodMin',
  GEMINI_PROBE_ONLY_IDLE: 'geminiProbeOnlyIdle',
  GEMINI_PROBE_IDLE_SEC: 'geminiProbeIdleSec',
  GEMINI_PROBE_MIN_ORANGE_SEC: 'geminiProbeMinOrangeSec',
  NOTIFICATION_SNOOZE_UNTIL: 'notificationSnoozeUntil',
  COMPLETION_HISTORY: 'completionHistory',
  QUIET_HOURS_ENABLED: 'quietHoursEnabled',
  QUIET_HOURS_START: 'quietHoursStart',
  QUIET_HOURS_END: 'quietHoursEnd',
  CUSTOM_TAB_TITLES: 'customTabTitles',
  CHATGPT_RATE_LIMIT_UNTIL: 'chatGptRateLimitUntil',
};
const GEMINI_PROBE_ALARM = 'ready_ai_gemini_probe';
const STEERING_QUEUE_PROBE_ALARM = 'ready_ai_steering_queue_probe';
const GEMINI_PROBE_MIN_PERIOD_MIN = 1; // chrome.alarms 최소 1분
const STEERING_QUEUE_PROBE_MIN_PERIOD_MIN = 1;
const GEMINI_PROBE_NUDGE_COOLDOWN_MS = 30_000; // 너무 자주 탭 전환하면 거슬림
const CHATGPT_NEW_CHAT_TAB_GAP_MS = 7_000;
const CHATGPT_NEW_CHAT_PREOPEN_GAP_MS = 450;
const CHATGPT_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const CHATGPT_NEW_CHAT_MAX_TABS = 8;
const READY_AI_CONTENT_VERSION = '2026-06-12.11-codex-like-queue-grip';
const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen.html';
const TITLE_GUARD_MAIN_FILE = 'src/content/title-guard-main.js';
const CONTENT_SCRIPT_FILES = Object.freeze([
  'src/sites.js',
  'src/content/part-01.js',
  'src/content/part-02.js',
  'src/content/part-03.js',
  'src/content/part-04.js',
  'src/content/part-05.js',
  'src/content/part-06.js',
  'src/content/part-07.js',
  'src/content/part-08.js',
  'src/content/part-09.js',
  'src/content/part-10.js',
  'src/content/part-11.js',
  'src/content/part-12.js',
]);
const SOUND_PRESETS = Object.freeze({
  off: 'off',
  soft: 'soft',
  double: 'double',
  triple: 'triple',
  long: 'long',
  custom: 'custom',
});
const DEFAULT_SETTINGS = Object.freeze({
  dndMode: false,
  badgeEnabled: false,
  badgeCountEnabled: false,
  completionHistoryEnabled: true,
  individualCompletionNotificationEnabled: true,
  individualCompletionSound: SOUND_PRESETS.soft,
  batchCompletionNotificationEnabled: true,
  batchCompletionSound: SOUND_PRESETS.triple,
  batchCompletionThreshold: 4,
  individualCompletionVolume: 0.75,
  batchCompletionVolume: 0.9,
  individualCompletionCustomSoundDataUrl: '',
  batchCompletionCustomSoundDataUrl: '',
  individualCompletionCustomSoundName: '',
  batchCompletionCustomSoundName: '',
  geminiProbeEnabled: true,
  geminiProbePeriodMin: 1,
  geminiProbeOnlyIdle: true,
  geminiProbeIdleSec: 60,
  geminiProbeMinOrangeSec: 12,
  notificationSnoozeUntil: 0,
  quietHoursEnabled: false,
  quietHoursStart: '23:00',
  quietHoursEnd: '08:00',
});
let settings = { ...DEFAULT_SETTINGS };
const notificationTargets = {};
let batchWave = {
  active: false,
  startedAt: 0,
  peakOrangeCount: 0,
};
let creatingOffscreenDocument = null;
const COMPLETION_HISTORY_LIMIT = 40;
let _siteConfigCache = { enabledSites: null, customSites: [] };
let completionHistoryCache = [];
let completionHistoryFlushTimer = null;
let chatGptNewChatRateLimitUntil = 0;
let tabMetaCache = {}; // { [tabId]: { id, title, url, active, discarded, windowId } }
let tabCacheInitialized = false;
let actionStateCache = {}; // { [tabId]: signature }
let dashboardVersion = 1;
let customTabTitles = {};
let customTabTitlesFlushTimer = null;
let lastPersistedCustomTabTitlesSignature = '';
let dashboardMetaCache = {
  itemsCount: 0,
  hasOrange: false,
  hasGreen: false,
};
let dashboardItemsCacheVersion = 0;
let dashboardItemsCache = [];
const CUSTOM_TAB_TITLE_MAX_LENGTH = 80;
const LAST_UPDATE_HEARTBEAT_THROTTLE_MS = 30_000;
function titleHasReadyAiPrefix(title) {
  return /^[⚪🔵🟠🟢]/u.test(String(title || '').trimStart());
}
function refreshDashboardMetaCache() {
  const states = Object.values(tabStates);
  dashboardMetaCache = {
    itemsCount: states.length,
    hasOrange: states.some((state) => state?.status === 'ORANGE'),
    hasGreen: states.some((state) => state?.status === 'GREEN'),
  };
}
function bumpDashboardVersion() {
  refreshDashboardMetaCache();
  dashboardItemsCacheVersion = 0;
  dashboardVersion += 1;
}
function getActiveTabIdForWindow(windowId) {
  if (typeof windowId !== 'number') return null;
  for (const id of Object.keys(tabMetaCache)) {
    const meta = tabMetaCache[id];
    if (!meta) continue;
    if (meta.windowId === windowId && meta.active) return Number(id);
  }
  return null;
}
function normalizeCustomTabTitleValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, CUSTOM_TAB_TITLE_MAX_LENGTH);
}
function normalizeCustomTabTitlesMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    const tabId = parseInt(key, 10);
    if (!Number.isFinite(tabId)) continue;
    const title = normalizeCustomTabTitleValue(value);
    if (!title) continue;
    out[String(tabId)] = title;
  }
  return out;
}
function flushCustomTabTitlesNow() {
  if (customTabTitlesFlushTimer) {
    clearTimeout(customTabTitlesFlushTimer);
    customTabTitlesFlushTimer = null;
  }
  const signature = JSON.stringify(customTabTitles);
  if (signature === lastPersistedCustomTabTitlesSignature) return;
  lastPersistedCustomTabTitlesSignature = signature;
  try {
    chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_TAB_TITLES]: customTabTitles });
  } catch (_) {}
}
function persistCustomTabTitles() {
  if (customTabTitlesFlushTimer) return;
  customTabTitlesFlushTimer = setTimeout(() => {
    customTabTitlesFlushTimer = null;
    flushCustomTabTitlesNow();
  }, 150);
}
function getCustomTabTitleForTab(tabId) {
  if (!Number.isFinite(tabId)) return '';
  return normalizeCustomTabTitleValue(customTabTitles[String(tabId)] || '');
}
function setCustomTabTitleForTab(tabId, title) {
  if (!Number.isFinite(tabId)) return '';
  const normalized = normalizeCustomTabTitleValue(title);
  if (!normalized) return '';
  customTabTitles[String(tabId)] = normalized;
  if (tabMetaCache[tabId]) tabMetaCache[tabId] = { ...(tabMetaCache[tabId] || {}), title: normalized };
  persistCustomTabTitles();
  bumpDashboardVersion();
  return normalized;
}
function clearCustomTabTitleForTab(tabId) {
  if (!Number.isFinite(tabId)) return false;
  const key = String(tabId);
  const existed = Object.prototype.hasOwnProperty.call(customTabTitles, key);
  if (!existed) return false;
  delete customTabTitles[key];
  persistCustomTabTitles();
  bumpDashboardVersion();
  return true;
}
function sendCustomTabTitleMessage(tabId, message) {
  if (!Number.isFinite(tabId) || tabId <= 0) return;
  try {
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, () => {
      try { void chrome.runtime.lastError; } catch (_) {}
    });
  } catch (_) {}
}
function notifyCustomTabTitleUpdated(tabId, title) {
  sendCustomTabTitleMessage(tabId, { action: 'custom_tab_title_updated', title: normalizeCustomTabTitleValue(title) });
}
function notifyCustomTabTitleCleared(tabId) {
  sendCustomTabTitleMessage(tabId, { action: 'custom_tab_title_cleared' });
}
function setCustomTabTitlesForTabs(items) {
  const targets = Array.isArray(items) ? items : [];
  const changed = [];
  let applied = 0;
  for (const item of targets) {
    const tabId = clampInt(item?.tabId, NaN, 0, Number.MAX_SAFE_INTEGER);
    const title = normalizeCustomTabTitleValue(item?.title || '');
    if (!Number.isFinite(tabId) || tabId <= 0 || !title) continue;
    const key = String(tabId);
    if (customTabTitles[key] === title) continue;
    customTabTitles[key] = title;
    if (tabMetaCache[tabId]) tabMetaCache[tabId] = { ...(tabMetaCache[tabId] || {}), title };
    changed.push({ tabId, title });
    applied += 1;
  }
  if (applied > 0) {
    persistCustomTabTitles();
    bumpDashboardVersion();
    for (const item of changed) notifyCustomTabTitleUpdated(item.tabId, item.title);
  }
  return { ok: applied > 0, count: applied, total: targets.length, changed };
}
function clearCustomTabTitlesForTabs(tabIds) {
  const targets = Array.isArray(tabIds) ? tabIds : [];
  const cleared = [];
  for (const rawTabId of targets) {
    const tabId = clampInt(rawTabId, NaN, 0, Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(tabId) || tabId <= 0) continue;
    const key = String(tabId);
    if (!Object.prototype.hasOwnProperty.call(customTabTitles, key)) continue;
    delete customTabTitles[key];
    cleared.push(tabId);
  }
  if (cleared.length > 0) {
    persistCustomTabTitles();
    bumpDashboardVersion();
    for (const tabId of cleared) notifyCustomTabTitleCleared(tabId);
  }
  return { ok: cleared.length > 0, count: cleared.length, total: targets.length, cleared };
}
function getSiteConfig(cb) {
  const sitesApi = globalThis?.ReadyAi?.sites;
  const enabledKey = sitesApi?.STORAGE_KEYS?.ENABLED_SITES || 'enabledSites';
  const customKey = sitesApi?.STORAGE_KEYS?.CUSTOM_SITES || 'customSites';
  chrome.storage.local.get([enabledKey, customKey], (res) => {
    const enabledSites = sitesApi?.ensureEnabledSitesObject
      ? sitesApi.ensureEnabledSitesObject(res?.[enabledKey])
      : (res?.[enabledKey] || {});
    const customSites = sitesApi?.normalizeCustomSites
      ? sitesApi.normalizeCustomSites(res?.[customKey])
      : (res?.[customKey] || []);
    _siteConfigCache = { enabledSites, customSites };
    cb?.(_siteConfigCache);
  });
}
// 초기 설정 로드
function safeActionCall(callResult) {
  // Chrome MV3 환경에 따라 promise/void 둘 다 올 수 있어서 안전하게 처리
  try {
    Promise.resolve(callResult).catch(() => {});
  } catch (_) {}
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function clampInt(v, fallback, min, max) {
  const n = parseInt(v, 10);
  const out = Number.isFinite(n) ? n : fallback;
  if (typeof min === 'number' && out < min) return min;
  if (typeof max === 'number' && out > max) return max;
  return out;
}
function clampNumber(v, fallback, min, max) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  const out = Number.isFinite(n) ? n : fallback;
  if (typeof min === 'number' && out < min) return min;
  if (typeof max === 'number' && out > max) return max;
  return out;
}
function isNotificationSnoozed() {
  return Number.isFinite(settings.notificationSnoozeUntil) && settings.notificationSnoozeUntil > Date.now();
}
function normalizeClockTime(value, fallback = '23:00') {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return fallback;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10) || 0));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function clockTimeToMinutes(value, fallback = 0) {
  const normalized = normalizeClockTime(value, '00:00');
  const [hh, mm] = normalized.split(':').map((v) => parseInt(v, 10) || 0);
  return (hh * 60) + mm;
}
function getStorageChangeValue(changes, key, fallback) {
  const change = changes?.[key];
  if (!change || !Object.prototype.hasOwnProperty.call(change, 'newValue')) return fallback;
  return change.newValue === undefined ? fallback : change.newValue;
}
function isQuietHoursActive(ts = Date.now()) {
  if (!settings.quietHoursEnabled) return false;
  const start = clockTimeToMinutes(settings.quietHoursStart, 23 * 60);
  const end = clockTimeToMinutes(settings.quietHoursEnd, 8 * 60);
  if (start === end) return true;
  const d = new Date(ts);
  const nowMinutes = (d.getHours() * 60) + d.getMinutes();
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}
function getNotificationSuppressionReason() {
  if (settings.dndMode) return 'dnd';
  if (isNotificationSnoozed()) return 'snooze';
  if (isQuietHoursActive()) return 'quiet_hours';
  return '';
}
function scheduleCompletionHistoryFlush() {
  if (completionHistoryFlushTimer) return;
  completionHistoryFlushTimer = setTimeout(() => {
    completionHistoryFlushTimer = null;
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.COMPLETION_HISTORY]: completionHistoryCache.slice(0, COMPLETION_HISTORY_LIMIT) });
    } catch (_) {}
  }, 250);
}
function pushCompletionHistory(entry) {
  if (settings.completionHistoryEnabled === false) return;
  completionHistoryCache = [entry, ...completionHistoryCache].slice(0, COMPLETION_HISTORY_LIMIT);
  bumpDashboardVersion();
  scheduleCompletionHistoryFlush();
}
function pTabsQuery(query) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query(query, (tabs) => {
        const list = Array.isArray(tabs) ? tabs : [];
        for (const tab of list) upsertTabMetaFromTab(tab);
        resolve(list);
      });
    } catch (_) {
      resolve([]);
    }
  });
}
function pTabsUpdate(tabId, updateProps) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.update(tabId, updateProps, (tab) => {
        if (tab) upsertTabMetaFromTab(tab);
        resolve(tab || null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}
function pTabsCreate(createProps) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.create(createProps, (tab) => {
        if (chrome.runtime.lastError) return resolve(null);
        if (tab) upsertTabMetaFromTab(tab);
        resolve(tab || null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}
function pTabsGet(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) return resolve(null);
        if (tab) upsertTabMetaFromTab(tab);
        resolve(tab || null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}
function pTabsReload(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.reload(tabId, {}, () => {
        if (chrome.runtime.lastError) return resolve(false);
        resolve(true);
      });
    } catch (_) {
      resolve(false);
    }
  });
}
function pTabsSendMessage(tabId, message, options = null) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, options || {}, () => {
        // 수신자가 없으면 runtime.lastError가 설정된다.
        if (chrome.runtime.lastError) return resolve(false);
        resolve(true);
      });
    } catch (_) {
      resolve(false);
    }
  });
}
function pTabsSendMessageResult(tabId, message, timeoutMs = 0, options = null) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) {
        try { clearTimeout(timer); } catch (_) {}
        timer = null;
      }
      resolve(value);
    };
    const timeout = Number(timeoutMs) || 0;
    if (timeout > 0) {
      timer = setTimeout(() => {
        finish({ ok: false, message: '새 채팅 탭 전송 응답 시간이 초과되었습니다.' });
      }, Math.max(1000, timeout));
    }
    try {
      chrome.tabs.sendMessage(tabId, message, options || {}, (response) => {
        if (chrome.runtime.lastError) {
          finish({ ok: false, message: chrome.runtime.lastError.message || '탭 메시지 전송 실패' });
          return;
        }
        if (!response) {
          finish({ ok: false, message: '탭에서 전송 결과를 받지 못했습니다.' });
          return;
        }
        finish(response);
      });
    } catch (_) {
      finish({ ok: false, message: '탭 메시지 전송 실패' });
    }
  });
}
function upsertTabMetaFromTab(tab) {
  if (!tab || typeof tab.id !== 'number') return;
  if (tab.active && typeof tab.windowId === 'number') {
    for (const id of Object.keys(tabMetaCache)) {
      if (Number(id) !== tab.id && tabMetaCache[id]?.windowId === tab.windowId) {
        tabMetaCache[id] = { ...(tabMetaCache[id] || {}), active: false };
      }
    }
  }
  tabMetaCache[tab.id] = {
    ...(tabMetaCache[tab.id] || {}),
    id: tab.id,
    title: tab.title || '',
    url: tab.url || '',
    active: !!tab.active,
    discarded: !!tab.discarded,
    windowId: typeof tab.windowId === 'number' ? tab.windowId : (tabMetaCache[tab.id]?.windowId ?? null),
  };
}
function ensureTabMetaCache(cb) {
  if (tabCacheInitialized) {
    cb?.(tabMetaCache);
    return;
  }
  chrome.tabs.query({}, (tabs) => {
    tabMetaCache = {};
    for (const tab of (Array.isArray(tabs) ? tabs : [])) upsertTabMetaFromTab(tab);
    tabCacheInitialized = true;
    cb?.(tabMetaCache);
  });
}
function getDashboardItemsFromCache() {
  if (dashboardItemsCacheVersion === dashboardVersion && Array.isArray(dashboardItemsCache)) {
    return dashboardItemsCache.slice();
  }
  dashboardItemsCache = Object.entries(tabStates).map(([rawTabId, state]) => {
    const tabId = parseInt(rawTabId, 10);
    const tab = tabMetaCache[tabId] || null;
    const url = tab?.url || '';
    let host = '';
    try { host = new URL(url).host; } catch (_) {}
    const customTabTitle = getCustomTabTitleForTab(tabId);
    return {
      tabId,
      status: state?.status || 'WHITE',
      platform: state?.platform || '',
      siteName: state?.siteName || '',
      lastUpdateAt: state?.lastUpdateAt || 0,
      orangeSinceAt: state?.orangeSinceAt || 0,
      steeringQueueCount: Math.max(0, Number(state?.steeringQueueCount) || 0),
      title: tab?.title || customTabTitle || state?.siteName || host || `탭 ${tabId}`,
      customTabTitle,
      hasCustomTabTitle: !!customTabTitle,
      url,
      host,
      active: !!tab?.active,
      discarded: !!tab?.discarded,
      windowId: tab?.windowId || state?.windowId || null,
    };
  }).sort((a, b) => {
    const rank = (v) => v === 'ORANGE' ? 3 : (v === 'GREEN' ? 2 : 1);
    return rank(b.status) - rank(a.status) || (b.lastUpdateAt || 0) - (a.lastUpdateAt || 0);
  });
  dashboardItemsCacheVersion = dashboardVersion;
  return dashboardItemsCache.slice();
}
function pScriptingExec(tabId, files, allFrames = true) {
  return new Promise((resolve) => {
    try {
      if (!chrome.scripting?.executeScript) return resolve(false);
      chrome.scripting.executeScript(
        {
          target: { tabId, allFrames: !!allFrames },
          files: Array.isArray(files) ? files : [files],
        },
        () => {
          if (chrome.runtime.lastError) return resolve(false);
          resolve(true);
        }
      );
    } catch (_) {
      resolve(false);
    }
  });
}
function pScriptingExecMainFiles(tabId, files, allFrames = false) {
  return new Promise((resolve) => {
    try {
      if (!chrome.scripting?.executeScript) return resolve(false);
      chrome.scripting.executeScript(
        {
          target: { tabId, allFrames: !!allFrames },
          files: Array.isArray(files) ? files : [files],
          world: 'MAIN',
        },
        () => {
          if (chrome.runtime.lastError) return resolve(false);
          resolve(true);
        }
      );
    } catch (_) {
      resolve(false);
    }
  });
}
function pScriptingExecMainFunction(tabId, func, args = []) {
  return new Promise((resolve) => {
    const run = (withMainWorld) => {
      try {
        if (!chrome.scripting?.executeScript) return resolve(null);
        const details = {
          target: { tabId, allFrames: false },
          func,
          args: Array.isArray(args) ? args : [],
        };
        if (withMainWorld) details.world = 'MAIN';
        chrome.scripting.executeScript(details, (results) => {
          if (chrome.runtime.lastError) {
            if (withMainWorld) return run(false);
            return resolve(null);
          }
          const first = Array.isArray(results) ? results[0] : null;
          resolve(first?.result ?? null);
        });
      } catch (_) {
        if (withMainWorld) return run(false);
        resolve(null);
      }
    };
    run(true);
  });
}
async function ensureMainWorldTitleGuard(tabId) {
  if (typeof tabId !== 'number') return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isChatGptUrl(tab?.url || '')) return false;
  } catch (_) {}
  const alreadyInstalled = await pScriptingExecMainFunction(tabId, () => !!window.__ReadyAiTitleGuardV7 || !!window.__ReadyAiTitleGuardV6 || !!window.__ReadyAiTitleGuardV5 || !!window.__ReadyAiTitleGuardV4 || !!window.__ReadyAiTitleGuardV3);
  if (alreadyInstalled) return true;
  const injected = await pScriptingExecMainFiles(tabId, TITLE_GUARD_MAIN_FILE, false);
  if (!injected) return false;
  const installed = await pScriptingExecMainFunction(tabId, () => !!window.__ReadyAiTitleGuardV7 || !!window.__ReadyAiTitleGuardV6 || !!window.__ReadyAiTitleGuardV5 || !!window.__ReadyAiTitleGuardV4 || !!window.__ReadyAiTitleGuardV3);
  return !!installed;
}
function pRuntimeSendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) return resolve(false);
        if (response && Object.prototype.hasOwnProperty.call(response, 'ok')) {
          resolve(!!response.ok);
          return;
        }
        resolve(true);
      });
    } catch (_) {
      resolve(false);
    }
  });
}
async function ensureOffscreenDocument() {
  try {
    if (!chrome.offscreen?.createDocument) return false;
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    if ('getContexts' in chrome.runtime) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl],
      });
      if (contexts.length > 0) return true;
    } else if (globalThis.clients?.matchAll) {
      const matchedClients = await clients.matchAll();
      if (matchedClients.some((client) => client.url === offscreenUrl || client.url.includes(OFFSCREEN_DOCUMENT_PATH))) {
        return true;
      }
    }
    if (creatingOffscreenDocument) {
      await creatingOffscreenDocument;
      return true;
    }
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play individual and batch completion alert sounds.',
    });
    await creatingOffscreenDocument;
    return true;
  } catch (_) {
    return false;
  } finally {
    creatingOffscreenDocument = null;
  }
}
function normalizeSoundKey(soundKey, fallback = SOUND_PRESETS.soft) {
  const key = String(soundKey || '').trim();
  return Object.prototype.hasOwnProperty.call(SOUND_PRESETS, key) ? key : fallback;
}
function normalizeVolume(value, fallback = 0.8) {
  return clampNumber(value, fallback, 0, 1);
}
async function playAlertSound(soundKey, options = {}) {
  const normalizedSoundKey = normalizeSoundKey(soundKey, SOUND_PRESETS.soft);
  if (!normalizedSoundKey || normalizedSoundKey === SOUND_PRESETS.off) return false;
  const ready = await ensureOffscreenDocument();
  if (!ready) return false;
  return pRuntimeSendMessage({
    target: 'offscreen',
    action: 'play_alert_sound',
    soundKey: normalizedSoundKey,
    volume: normalizeVolume(options.volume, 0.8),
    customSoundDataUrl: String(options.customSoundDataUrl || ''),
  });
}
function getSoundOptionsByKind(kind) {
  if (kind === 'batch') {
    return {
      soundKey: normalizeSoundKey(settings.batchCompletionSound, SOUND_PRESETS.triple),
      volume: normalizeVolume(settings.batchCompletionVolume, 0.9),
      customSoundDataUrl: settings.batchCompletionCustomSoundDataUrl || '',
      customSoundName: settings.batchCompletionCustomSoundName || '',
    };
  }
  return {
    soundKey: normalizeSoundKey(settings.individualCompletionSound, SOUND_PRESETS.soft),
    volume: normalizeVolume(settings.individualCompletionVolume, 0.75),
    customSoundDataUrl: settings.individualCompletionCustomSoundDataUrl || '',
    customSoundName: settings.individualCompletionCustomSoundName || '',
  };
}
async function ensureContentScripts(tab, options = {}) {
  // 세션 복원/탭 discard 타이밍에 따라 content script가 아직 주입되지 않은 탭이 생긴다.
  // 이 경우 title 뱃지(이모지)와 status_update가 올라오지 않아서 “뱃지 사라짐”처럼 보인다.
  const tabId = tab?.id;
  if (typeof tabId !== 'number') return false;
  const url = tab?.url || '';
  if (!url) return false;
  const site = resolveSiteForUrl(url);
  if (!site) return false; // 등록/활성된 사이트만
  const messageOptions = options.frameId === 0 ? { frameId: 0 } : null;
  const topFrameOnly = !!options.topFrameOnly;
  const injectAllFrames = options.allFrames !== false;
  // 1) ping으로 content 존재 확인. 구버전 content script는 버전이 없으므로 재주입한다.
  const alive = await pTabsSendMessageResult(tabId, { action: 'ping', topFrameOnly }, 1500, messageOptions);
  if (alive?.ok && alive.readyAiContentVersion === READY_AI_CONTENT_VERSION && !options.forceInject) {
    if (site?.key !== 'chatgpt') await ensureMainWorldTitleGuard(tabId);
    return true;
  }
  // 2) 없으면 강제 주입(필요 권한: "scripting")
  let injected = await pScriptingExec(tabId, CONTENT_SCRIPT_FILES, injectAllFrames);
  if (!injected && injectAllFrames) injected = await pScriptingExec(tabId, CONTENT_SCRIPT_FILES, false);
  if (!injected) return false;
  if (site?.key !== 'chatgpt') await ensureMainWorldTitleGuard(tabId);
  // 3) 주입 직후 즉시 체크 요청
  const reinjected = await pTabsSendMessageResult(tabId, { action: 'ping', topFrameOnly }, 1500, messageOptions);
  await pTabsSendMessage(tabId, { action: 'force_check', reason: 'inject' }, messageOptions);
  return !!reinjected?.ok;
}
function isChatGptUrl(url) {
  try {
    const host = new URL(String(url || '')).hostname.toLowerCase();
    return host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com';
  } catch (_) {
    return false;
  }
}
function getChatGptNewChatUrl(sourceUrl) {
  try {
    const parsed = new URL(String(sourceUrl || ''));
    const host = parsed.hostname.toLowerCase();
    if (host === 'chat.openai.com') return 'https://chat.openai.com/';
  } catch (_) {}
  return 'https://chatgpt.com/';
}
function noteChatGptRateLimit() {
  chatGptNewChatRateLimitUntil = Math.max(chatGptNewChatRateLimitUntil || 0, Date.now() + CHATGPT_RATE_LIMIT_COOLDOWN_MS);
  try { chrome.storage.local.set({ [STORAGE_KEYS.CHATGPT_RATE_LIMIT_UNTIL]: chatGptNewChatRateLimitUntil }); } catch (_) {}
}
function getChatGptRateLimitRemainingSec() {
  return Math.max(0, Math.ceil(((chatGptNewChatRateLimitUntil || 0) - Date.now()) / 1000));
}
function isChatGptConversationUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (!isChatGptUrl(parsed.href)) return false;
    return /^\/c\/[^/]+/i.test(parsed.pathname) || /\/c\/[^/]+/i.test(parsed.pathname);
  } catch (_) {
    return false;
  }
}
async function waitForChatGptTabUrl(tabId, timeoutMs = 7000) {
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 7000);
  let lastChatGptTab = null;
  while (Date.now() <= deadline) {
    const tab = await pTabsGet(tabId);
    if (tab?.id && isChatGptUrl(tab.url || '')) {
      lastChatGptTab = tab;
      return tab;
    }
    await sleep(180);
  }
  return lastChatGptTab;
}
function getChatGptTabReuseRank(tab, sourceTab) {
  const sourceWindowId = typeof sourceTab?.windowId === 'number' ? sourceTab.windowId : null;
  const sourceIndex = typeof sourceTab?.index === 'number' ? sourceTab.index : null;
  const tabIndex = typeof tab?.index === 'number' ? tab.index : null;
  const sameWindowRank = sourceWindowId != null && tab?.windowId === sourceWindowId ? 0 : 1;
  const distance = sourceIndex != null && tabIndex != null ? Math.abs(tabIndex - sourceIndex) : 9999;
  const rightSideRank = sourceIndex != null && tabIndex != null && tabIndex >= sourceIndex ? 0 : 1;
  return { sameWindowRank, distance, rightSideRank, tabIndex: tabIndex ?? 9999 };
}
function sortReusableChatGptTabs(tabs, sourceTab) {
  return tabs.slice().sort((a, b) => {
    const ar = getChatGptTabReuseRank(a, sourceTab);
    const br = getChatGptTabReuseRank(b, sourceTab);
    return (ar.sameWindowRank - br.sameWindowRank)
      || (ar.distance - br.distance)
      || (ar.rightSideRank - br.rightSideRank)
      || (ar.tabIndex - br.tabIndex)
      || ((a.id || 0) - (b.id || 0));
  });
}
function pushUniqueTab(list, tab) {
  if (!tab?.id) return false;
  if (list.some((item) => item?.id === tab.id)) return false;
  list.push(tab);
  return true;
}
async function waitForNewChatContent(tabId, timeoutMs = 30000) {
  const deadline = Date.now() + Math.max(5000, Number(timeoutMs) || 30000);
  while (Date.now() <= deadline) {
    const tab = await pTabsGet(tabId);
    if (tab?.id && isChatGptUrl(tab.url || '')) {
      const ready = await ensureContentScripts(tab, { allFrames: false, topFrameOnly: true, frameId: 0 });
      if (ready) {
        const alive = await pTabsSendMessage(tabId, { action: 'ping', topFrameOnly: true }, { frameId: 0 });
        if (alive) return true;
      }
    }
    await sleep(450);
  }
  return false;
}
async function inspectChatGptTabRender(tabId, text) {
  return pScriptingExecMainFunction(tabId, (rawText) => {
    const norm = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const target = norm(rawText);
    const isVisible = (el) => {
      if (!el) return false;
      try {
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        if (parseFloat(style.opacity || '1') === 0) return false;
        const rect = el.getBoundingClientRect();
        return !!rect && rect.width > 0 && rect.height > 0;
      } catch (_) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects?.().length);
      }
    };
    const bodyText = norm(document.body?.innerText || document.documentElement?.innerText || '');
    const turnNodes = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"], article[data-testid*="conversation-turn"], main [data-message-author-role]'));
    const hasTurns = turnNodes.some((node) => isVisible(node));
    const hasTarget = !!target && turnNodes.some((node) => {
      try { return isVisible(node) && norm(node.innerText || node.textContent || '').includes(target); } catch (_) { return false; }
    });
    const composer = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], textarea, div[contenteditable="true"][role="textbox"]');
    const hasComposer = isVisible(composer);
    const rateLimited = /(요청이\s*너무\s*많|너무\s*빠르게\s*보내|일시적으로\s*제한|몇\s*분\s*후\s*다시|too\s*many\s*requests|sending\s*requests\s*too\s*fast|temporarily\s*limited|rate\s*limit)/i.test(bodyText);
    return {
      href: String(location.href || ''),
      title: String(document.title || ''),
      readyState: String(document.readyState || ''),
      bodyTextLength: bodyText.length,
      hasComposer,
      hasTarget,
      hasTurns,
      rateLimited,
      blank: bodyText.length < 20 && !hasComposer && !hasTurns,
    };
  }, [text]);
}
async function findChatGptRateLimitNotice(tabIds = null) {
  const tabs = Array.isArray(tabIds) && tabIds.length
    ? (await Promise.all(tabIds.map((tabId) => pTabsGet(tabId)))).filter(Boolean)
    : (await pTabsQuery({}));
  for (const tab of tabs) {
    if (!tab?.id || !isChatGptUrl(tab.url || '')) continue;
    const snapshot = await inspectChatGptTabRender(tab.id, '');
    if (snapshot?.rateLimited) {
      noteChatGptRateLimit();
      return {
        ok: false,
        tabId: tab.id,
        rateLimited: true,
        message: 'ChatGPT 요청 제한이 감지되어 새 채팅 전송을 중단했습니다. 몇 분 후 다시 시도해 주세요.',
      };
    }
  }
  return null;
}
async function waitForNewChatConversationSettled(tabId, text, timeoutMs = 26000) {
  const deadline = Date.now() + Math.max(6000, Number(timeoutMs) || 26000);
  let last = null;
  let blankSince = 0;
  let reloadedBlankTab = false;
  while (Date.now() <= deadline) {
    const tab = await pTabsGet(tabId);
    if (!tab?.id) return { ok: false, tabId, message: '새 채팅 탭을 찾지 못했습니다.' };
    const snapshot = await inspectChatGptTabRender(tabId, text);
    const href = snapshot?.href || tab.url || '';
    last = { ...(snapshot || {}), tabStatus: tab.status || '', tabUrl: tab.url || '' };
    if (snapshot?.rateLimited) {
      noteChatGptRateLimit();
      return { ok: false, tabId, rateLimited: true, message: 'ChatGPT 요청 제한이 감지되었습니다.' };
    }
    const conversationUrl = isChatGptConversationUrl(href);
    if (snapshot?.hasTarget) return { ok: true, tabId, url: href, settled: true };
    if (conversationUrl && snapshot?.hasTurns && !snapshot?.blank) return { ok: true, tabId, url: href, settled: true };
    if (conversationUrl && snapshot?.bodyTextLength > 120 && !snapshot?.blank) return { ok: true, tabId, url: href, settled: true };
    const looksBlank = !!snapshot?.blank || (conversationUrl && tab.status === 'complete' && (!snapshot || (snapshot.bodyTextLength < 40 && !snapshot.hasComposer && !snapshot.hasTurns)));
    if (looksBlank) {
      if (!blankSince) blankSince = Date.now();
      if (!reloadedBlankTab && Date.now() - blankSince > 1800) {
        await pTabsReload(tabId);
        reloadedBlankTab = true;
        blankSince = 0;
        await sleep(1800);
        continue;
      }
    } else {
      blankSince = 0;
    }
    await sleep(tab.status === 'loading' ? 240 : 420);
  }
  return {
    ok: false,
    tabId,
    renderUnsettled: true,
    last,
    message: '전송 후 새 채팅 화면 렌더링을 확인하지 못했습니다.',
  };
}
async function runDirectNewChatPromptSend(tabId, text) {
  const result = await pScriptingExecMainFunction(tabId, (rawText) => {
    const targetText = String(rawText || '').trim();
    const startedAt = Date.now();
    const beforeUrl = String(location.href || '');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const norm = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const pageText = () => {
      try { return norm(document.body?.innerText || document.documentElement?.innerText || ''); } catch (_) { return ''; }
    };
    const rateLimited = () => {
      const hay = pageText();
      return /(요청이\s*너무\s*많|너무\s*빠르게\s*보내|일시적으로\s*제한|몇\s*분\s*후\s*다시|too\s*many\s*requests|sending\s*requests\s*too\s*fast|temporarily\s*limited|rate\s*limit)/i.test(hay);
    };
    const isVisible = (el) => {
      if (!el) return false;
      try {
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        if (parseFloat(style.opacity || '1') === 0) return false;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        return true;
      } catch (_) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects?.().length);
      }
    };
    const isEnabled = (el) => {
      if (!el) return false;
      if (el.disabled === true) return false;
      const ariaDisabled = String(el.getAttribute?.('aria-disabled') || '').toLowerCase();
      if (ariaDisabled === 'true') return false;
      return true;
    };
    const isProbablySteeringUi = (el) => {
      try {
        const root = el?.getRootNode?.();
        const host = root?.host || null;
        const hostText = host ? `${host.id || ''} ${host.className || ''}` : '';
        const ownText = `${el.id || ''} ${el.className || ''} ${el.getAttribute?.('data-ready-ai') || ''}`;
        if (/ready[-_ ]?ai|steering|followup/i.test(`${hostText} ${ownText}`)) return true;
      } catch (_) {}
      try {
        return !!el.closest?.('[data-ready-ai], [id^="ready-ai"], [class*="ready-ai"], [class*="steering"]');
      } catch (_) {
        return false;
      }
    };
    const textOf = (el) => {
      if (!el) return '';
      const tag = String(el.tagName || '').toLowerCase();
      try {
        if (tag === 'textarea' || tag === 'input') return String(el.value || '');
        if (el.isContentEditable) return String(el.innerText || el.textContent || '');
      } catch (_) {}
      return '';
    };
    const composerScore = (el) => {
      if (!el || !isVisible(el) || isProbablySteeringUi(el)) return -999;
      if (el.disabled === true || el.readOnly === true) return -999;
      if (el.getAttribute?.('aria-hidden') === 'true') return -999;
      const tag = String(el.tagName || '').toLowerCase();
      const hay = [
        el.id,
        el.getAttribute?.('data-testid'),
        el.getAttribute?.('role'),
        el.getAttribute?.('placeholder'),
        el.getAttribute?.('aria-label'),
        el.getAttribute?.('aria-placeholder'),
        el.className,
      ].filter(Boolean).join(' ');
      let score = 0;
      if (/prompt-textarea/i.test(hay)) score += 18;
      if (/textbox/i.test(hay)) score += 6;
      if (/message|메시지|무엇이든|prompt/i.test(hay)) score += 5;
      if (tag === 'textarea') score += 6;
      if (el.isContentEditable) score += 6;
      try {
        const form = el.closest?.('form');
        if (form) score += 5;
      } catch (_) {}
      try {
        const rect = el.getBoundingClientRect();
        if (rect.width >= 250) score += 3;
        if (rect.top >= window.innerHeight * 0.35) score += 3;
        if (rect.bottom <= window.innerHeight + 40) score += 2;
      } catch (_) {}
      return score;
    };
    const findComposer = () => {
      const selectors = [
        '#prompt-textarea',
        '[data-testid="prompt-textarea"]',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="message"]',
        'textarea[placeholder*="메시지"]',
        'div[contenteditable="true"][data-testid="prompt-textarea"]',
        'div[contenteditable="true"][role="textbox"]',
        'form textarea',
        'textarea',
      ];
      const seen = new Set();
      let best = null;
      let bestScore = -999;
      for (const selector of selectors) {
        const items = Array.from(document.querySelectorAll(selector));
        for (const el of items) {
          if (seen.has(el)) continue;
          seen.add(el);
          const score = composerScore(el);
          if (score > bestScore) {
            best = el;
            bestScore = score;
          }
        }
      }
      return bestScore >= 4 ? best : null;
    };
    const hasSubmittedTarget = () => {
      const target = norm(targetText);
      if (!target) return false;
      const selectors = [
        '[data-message-author-role="user"]',
        '[data-testid^="conversation-turn-"] [data-message-author-role="user"]',
        'main [data-message-author-role="user"]',
      ];
      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          try {
            if (isVisible(el) && norm(el.innerText || el.textContent || '').includes(target)) return true;
          } catch (_) {}
        }
      }
      return false;
    };
    const liveComposer = (composer) => {
      try {
        if (composer && document.contains(composer) && isVisible(composer)) return composer;
      } catch (_) {}
      return findComposer();
    };
    const dispatchTextEvents = (el, value) => {
      const data = String(value || '');
      try { el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data, inputType: 'insertReplacementText' })); } catch (_) {}
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data, inputType: 'insertText' })); } catch (_) {
        try { el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true })); } catch (_) {}
      }
      try { el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true })); } catch (_) {}
    };
    const setComposerText = (el, value) => {
      const nextValue = String(value || '');
      const tag = String(el.tagName || '').toLowerCase();
      try { el.focus({ preventScroll: false }); } catch (_) {}
      if (tag === 'textarea' || tag === 'input') {
        try {
          const proto = tag === 'textarea' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
          const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, nextValue);
          else el.value = nextValue;
          dispatchTextEvents(el, nextValue);
          try { el.setSelectionRange(nextValue.length, nextValue.length); } catch (_) {}
          return norm(el.value) === norm(nextValue);
        } catch (_) {}
      }
      if (el.isContentEditable) {
        try {
          const selection = window.getSelection?.();
          const range = document.createRange();
          range.selectNodeContents(el);
          selection?.removeAllRanges?.();
          selection?.addRange?.(range);
          let inserted = false;
          try { inserted = document.execCommand('insertText', false, nextValue); } catch (_) {}
          if (!inserted || norm(textOf(el)) !== norm(nextValue)) {
            el.textContent = '';
            el.appendChild(document.createTextNode(nextValue));
          }
          dispatchTextEvents(el, nextValue);
          return norm(textOf(el)) === norm(nextValue);
        } catch (_) {
          try {
            el.textContent = nextValue;
            dispatchTextEvents(el, nextValue);
            return norm(textOf(el)) === norm(nextValue);
          } catch (_) {}
        }
      }
      return false;
    };
    const waitForComposerText = async (composer, expectedText, timeoutMs = 1500) => {
      const deadline = Date.now() + Math.max(300, Number(timeoutMs) || 1500);
      let current = composer;
      while (Date.now() <= deadline) {
        current = liveComposer(current);
        if (current && norm(textOf(current)) === norm(expectedText)) {
          return { ok: true, composer: current, text: textOf(current) };
        }
        await sleep(90);
      }
      current = liveComposer(current);
      return { ok: false, composer: current, text: textOf(current) };
    };
    const ensureComposerText = async (composer, expectedText) => {
      let current = liveComposer(composer);
      let lastText = current ? textOf(current) : '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        current = liveComposer(current);
        if (!current) break;
        lastText = textOf(current);
        if (norm(lastText) === norm(expectedText)) {
          return { ok: true, composer: current, text: lastText };
        }
        setComposerText(current, expectedText);
        const verified = await waitForComposerText(current, expectedText, attempt === 0 ? 1400 : 1900);
        current = verified.composer || current;
        lastText = verified.text || '';
        if (verified.ok) return verified;
        await sleep(160);
      }
      return { ok: false, composer: current, text: lastText };
    };
    const buttonText = (el) => [
      el?.getAttribute?.('aria-label'),
      el?.getAttribute?.('title'),
      el?.getAttribute?.('data-testid'),
      el?.innerText,
      el?.textContent,
    ].filter(Boolean).join(' ');
    const scoreButton = (el, composer, requireEnabled = true) => {
      if (!el || !isVisible(el) || (requireEnabled && !isEnabled(el)) || isProbablySteeringUi(el)) return -999;
      const hay = buttonText(el);
      if (/(stop|중지|cancel|abort|voice|mic|upload|첨부|attachment|tool|menu|옵션|plus|더보기)/i.test(hay)) return -999;
      let score = 0;
      if (/send|전송|보내기|submit|arrow-up|paper-plane/i.test(hay)) score += 8;
      if (el.getAttribute?.('type') === 'submit') score += 5;
      try {
        const form = composer?.closest?.('form');
        if (form && form.contains(el)) score += 5;
      } catch (_) {}
      try {
        const cr = composer.getBoundingClientRect();
        const br = el.getBoundingClientRect();
        const dy = Math.abs((br.top + br.bottom) / 2 - (cr.top + cr.bottom) / 2);
        const dx = Math.abs((br.left + br.right) / 2 - (cr.left + cr.right) / 2);
        if (dy < 90) score += 3;
        if (dx < 520) score += 1;
      } catch (_) {}
      return score;
    };
    const findSendButton = (composer, requireEnabled = true) => {
      const selectors = [
        '[data-testid="send-button"]',
        'button[aria-label*="Send message"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="전송"]',
        'button[aria-label*="보내기"]',
        'form button[type="submit"]',
        'button[type="submit"]',
      ];
      let best = null;
      let bestScore = -999;
      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const score = scoreButton(el, composer, requireEnabled);
          if (score > bestScore) {
            best = el;
            bestScore = score;
          }
        }
      }
      return bestScore >= 5 ? best : null;
    };
    const waitForSendButton = async (composer, timeoutMs = 5500) => {
      const deadline = Date.now() + Math.max(500, Number(timeoutMs) || 5500);
      let current = composer;
      let lastButton = null;
      while (Date.now() <= deadline) {
        current = liveComposer(current);
        if (current && norm(textOf(current)) !== norm(targetText)) {
          const ensured = await ensureComposerText(current, targetText);
          current = ensured.composer || current;
        }
        const btn = findSendButton(current, true);
        if (btn) return { composer: current, button: btn };
        lastButton = findSendButton(current, false) || lastButton;
        await sleep(110);
      }
      return { composer: liveComposer(current), button: null, disabledButton: lastButton };
    };
    const clickButton = (el) => {
      if (!el) return false;
      try { el.focus?.({ preventScroll: false }); } catch (_) {}
      const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      let dispatched = false;
      for (const type of events) {
        try {
          const Ctor = type.startsWith('pointer') && window.PointerEvent ? window.PointerEvent : window.MouseEvent;
          const event = new Ctor(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: type.endsWith('down') ? 1 : 0 });
          el.dispatchEvent(event);
          dispatched = true;
        } catch (_) {}
      }
      try { el.click(); return true; } catch (_) {}
      return dispatched;
    };
    const hasTurns = () => !!document.querySelector('[data-testid^="conversation-turn-"], article[data-testid*="conversation-turn"], main [data-message-author-role]');
    const generating = () => Array.from(document.querySelectorAll('button, [role="button"]')).some((el) => {
      const hay = buttonText(el);
      return isVisible(el) && /(stop|중지|cancel|abort)/i.test(hay);
    });
    const submitKey = (el, extra = {}) => {
      const init = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', which: 13, keyCode: 13, ...extra };
      try {
        el.focus?.({ preventScroll: false });
        el.dispatchEvent(new KeyboardEvent('keydown', init));
        el.dispatchEvent(new KeyboardEvent('keypress', init));
        el.dispatchEvent(new KeyboardEvent('keyup', init));
        return true;
      } catch (_) {
        return false;
      }
    };
    const waitForSubmit = async (composer, beforeHadTurns, timeoutMs) => {
      const deadline = Date.now() + Math.max(2500, Number(timeoutMs) || 9000);
      let current = composer;
      let composerClearedAt = 0;
      while (Date.now() <= deadline) {
        if (rateLimited()) return false;
        if (hasSubmittedTarget()) return true;
        current = liveComposer(current);
        const currentText = current ? textOf(current) : '';
        if (!beforeHadTurns && hasTurns()) return true;
        const urlChanged = !!beforeUrl && location.href !== beforeUrl;
        if (generating() && urlChanged) return true;
        if (urlChanged && (!norm(currentText) || hasTurns())) return true;
        if (!norm(currentText)) {
          if (!composerClearedAt) composerClearedAt = Date.now();
          if (Date.now() - composerClearedAt >= 1800) return true;
        } else {
          composerClearedAt = 0;
        }
        await sleep(120);
      }
      return false;
    };
    return (async () => {
      if (!targetText) return { ok: false, message: '보낼 문구가 비어 있습니다.' };
      if (rateLimited()) return { ok: false, sent: false, rateLimited: true, message: 'ChatGPT 요청 제한이 감지되었습니다.' };
      if (hasSubmittedTarget()) return { ok: true, sent: true, alreadySent: true, message: '이미 전송된 문구입니다.' };
      const readyDeadline = Date.now() + 10000;
      while (Date.now() <= readyDeadline) {
        if (rateLimited()) return { ok: false, sent: false, rateLimited: true, message: 'ChatGPT 요청 제한이 감지되었습니다.' };
        if (document.body && /^(interactive|complete)$/i.test(String(document.readyState || ''))) break;
        await sleep(100);
      }
      let composer = null;
      const composerDeadline = Date.now() + 16000;
      while (Date.now() <= composerDeadline) {
        if (rateLimited()) return { ok: false, sent: false, rateLimited: true, message: 'ChatGPT 요청 제한이 감지되었습니다.' };
        if (hasSubmittedTarget()) return { ok: true, sent: true, alreadySent: true, message: '이미 전송된 문구입니다.' };
        composer = findComposer();
        if (composer) break;
        await sleep(150);
      }
      if (!composer) return { ok: false, message: '입력창을 찾지 못했습니다.' };
      const beforeText = textOf(composer);
      const fillResult = await ensureComposerText(composer, targetText);
      composer = fillResult.composer || composer;
      const afterFill = fillResult.text || textOf(composer);
      if (!fillResult.ok && norm(afterFill) !== norm(targetText)) {
        return { ok: false, message: '입력창에 후속 지시를 넣지 못했습니다.', beforeText, afterFill };
      }
      const beforeHadTurns = hasTurns();
      const attempts = [
        async () => {
          const ensured = await ensureComposerText(composer, targetText);
          composer = ensured.composer || composer;
          if (!ensured.ok) return false;
          const ready = await waitForSendButton(composer, 2500);
          composer = ready.composer || composer;
          const btn = ready.button || findSendButton(composer, true);
          if (!btn) return false;
          return clickButton(btn);
        },
        async () => {
          const ensured = await ensureComposerText(composer, targetText);
          composer = ensured.composer || composer;
          if (!ensured.ok) return false;
          const form = composer.closest?.('form');
          if (!form) return false;
          try {
            const btn = findSendButton(composer) || undefined;
            if (typeof form.requestSubmit === 'function') form.requestSubmit(btn);
            else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            return true;
          } catch (_) {
            return false;
          }
        },
        async () => {
          const ensured = await ensureComposerText(composer, targetText);
          composer = ensured.composer || composer;
          return ensured.ok && submitKey(composer);
        },
        async () => {
          const ensured = await ensureComposerText(composer, targetText);
          composer = ensured.composer || composer;
          return ensured.ok && submitKey(composer, { metaKey: true });
        },
        async () => {
          const ensured = await ensureComposerText(composer, targetText);
          composer = ensured.composer || composer;
          return ensured.ok && submitKey(composer, { ctrlKey: true });
        },
      ];
      let lastTriggered = false;
      for (const attempt of attempts) {
        if (rateLimited()) return { ok: false, sent: false, rateLimited: true, message: 'ChatGPT 요청 제한이 감지되었습니다.' };
        if (hasSubmittedTarget()) return { ok: true, sent: true, alreadySent: true, message: '이미 전송된 문구입니다.' };
        lastTriggered = false;
        try { lastTriggered = (await attempt()) !== false; } catch (_) { lastTriggered = false; }
        if (!lastTriggered) continue;
        if (await waitForSubmit(composer, beforeHadTurns, 9000)) {
          return { ok: true, sent: true, message: '전송했습니다.', beforeText, afterFill, elapsedMs: Date.now() - startedAt, urlChanged: location.href !== beforeUrl };
        }
        if (rateLimited()) return { ok: false, sent: false, rateLimited: true, message: 'ChatGPT 요청 제한이 감지되었습니다.' };
        await sleep(450);
      }
      return {
        ok: false,
        sent: false,
        message: lastTriggered ? '전송 버튼을 눌렀지만 전송 시작을 확인하지 못했습니다.' : '전송 버튼을 찾지 못했습니다.',
        beforeText,
        afterFill,
      };
    })();
  }, [text]);
  if (result?.ok && result?.sent !== false) return { ok: true, tabId, direct: true };
  if (result?.rateLimited) {
    return {
      ok: false,
      tabId,
      direct: true,
      rateLimited: true,
      message: result?.message || 'ChatGPT 요청 제한이 감지되었습니다.',
    };
  }
  return {
    ok: false,
    tabId,
    direct: true,
    message: result?.message || '직접 새 채팅 전송에 실패했습니다.',
  };
}
async function enqueuePromptInNewChatTab(tab, text) {
  if (!tab?.id) return { ok: false, tabId: null, message: '탭 생성 실패' };
  await pTabsUpdate(tab.id, { active: true });
  const chatGptTab = await waitForChatGptTabUrl(tab.id, 7000);
  if (!chatGptTab?.id) {
    return { ok: false, tabId: tab.id, message: '새 채팅 탭이 준비되지 않았습니다.' };
  }
  let directResult = null;
  const directDelays = [900];
  for (const delay of directDelays) {
    if (delay > 0) await sleep(delay);
    directResult = await runDirectNewChatPromptSend(tab.id, text);
    if (directResult?.ok) {
      const settled = await waitForNewChatConversationSettled(tab.id, text);
      if (settled?.rateLimited) return settled;
      return { ...directResult, renderSettled: !!settled?.ok, renderMessage: settled?.message || '', url: settled?.url };
    }
    if (directResult?.rateLimited) {
      noteChatGptRateLimit();
      return directResult;
    }
  }
  const ready = await waitForNewChatContent(tab.id, 10000);
  if (!ready) {
    return { ok: false, tabId: tab.id, message: directResult?.message || '새 채팅 탭 준비 시간 초과' };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await pTabsSendMessageResult(tab.id, {
      action: 'send_steering_prompt_now',
      text,
      timeoutMs: 45000,
      submitStartTimeoutMs: attempt === 0 ? 3200 : 4800,
      source: 'new_chat_tab',
      skipReadinessGate: true,
      topFrameOnly: true,
    }, 52000, { frameId: 0 });
    if (response?.ok && response?.sent !== false) {
      const settled = await waitForNewChatConversationSettled(tab.id, text);
      if (settled?.rateLimited) return settled;
      return { ok: true, tabId: tab.id, renderSettled: !!settled?.ok, renderMessage: settled?.message || '', url: settled?.url };
    }
    if (response?.rateLimited) {
      noteChatGptRateLimit();
      return { ok: false, tabId: tab.id, rateLimited: true, message: response?.message || 'ChatGPT 요청 제한이 감지되었습니다.' };
    }
    await sleep(900 + attempt * 400);
    directResult = await runDirectNewChatPromptSend(tab.id, text);
    if (directResult?.ok) {
      const settled = await waitForNewChatConversationSettled(tab.id, text);
      if (settled?.rateLimited) return settled;
      return { ...directResult, renderSettled: !!settled?.ok, renderMessage: settled?.message || '', url: settled?.url };
    }
    if (directResult?.rateLimited) {
      noteChatGptRateLimit();
      return directResult;
    }
    if (attempt === 2) {
      return { ok: false, tabId: tab.id, message: response?.message || directResult?.message || '새 채팅 탭에 문구를 전송하지 못했습니다.' };
    }
  }
  return { ok: false, tabId: tab.id, message: '새 채팅 탭에 문구를 전송하지 못했습니다.' };
}
async function openChatGptNewChatTabsForPrompt(message, sender) {
  const text = String(message?.text || '').trim();
  if (!text) return { ok: false, message: '보낼 문구가 비어 있습니다.' };
  const senderTab = sender?.tab || null;
  const sourceTab = senderTab?.id ? ((await pTabsGet(senderTab.id)) || senderTab) : null;
  const sourceUrl = String(message?.sourceUrl || sourceTab?.url || senderTab?.url || '');
  const remainingSec = getChatGptRateLimitRemainingSec();
  if (remainingSec > 0) {
    return { ok: false, rateLimited: true, message: `ChatGPT 요청 제한 감지 후 안정화를 위해 ${remainingSec}초 뒤 다시 시도해 주세요.` };
  }
  const existingLimit = await findChatGptRateLimitNotice(sourceTab?.id ? [sourceTab.id] : null);
  if (existingLimit) return existingLimit;
  const count = clampInt(message?.count, 3, 1, CHATGPT_NEW_CHAT_MAX_TABS);
  const url = getChatGptNewChatUrl(sourceUrl);
  const createdTabs = [];
  const targetTabs = [];
  const results = [];
  let stoppedByRateLimit = false;
  const existingTabs = await pTabsQuery({});
  const sourceFromExisting = sourceTab?.id
    ? (existingTabs.find((tab) => tab?.id === sourceTab.id) || sourceTab)
    : null;
  if (sourceFromExisting?.id && isChatGptUrl(sourceUrl || sourceFromExisting.url || '')) {
    pushUniqueTab(targetTabs, sourceFromExisting);
  }
  const reusableTabs = sortReusableChatGptTabs(
    existingTabs.filter((tab) => {
      if (!tab?.id || !isChatGptUrl(tab.url || '')) return false;
      if (typeof sourceTab?.windowId !== 'number') return true;
      return tab.windowId === sourceTab.windowId;
    }),
    sourceFromExisting || sourceTab
  );
  for (const tab of reusableTabs) {
    if (targetTabs.length >= count) break;
    pushUniqueTab(targetTabs, tab);
  }
  while (targetTabs.length < count) {
    const activeLimit = await findChatGptRateLimitNotice();
    if (activeLimit) {
      stoppedByRateLimit = true;
      results.push(activeLimit);
      break;
    }
    const props = {
      url,
      active: false,
    };
    if (typeof sourceTab?.windowId === 'number') props.windowId = sourceTab.windowId;
    if (typeof sourceTab?.index === 'number') props.index = sourceTab.index + targetTabs.length + 1;
    const tab = await pTabsCreate(props);
    if (!tab?.id) {
      results.push({ ok: false, tabId: null, message: '새 ChatGPT 탭을 만들지 못했습니다.' });
      break;
    }
    createdTabs.push(tab);
    targetTabs.push(tab);
    await sleep(CHATGPT_NEW_CHAT_PREOPEN_GAP_MS);
  }
  for (let i = 0; i < targetTabs.length; i += 1) {
    const activeLimit = await findChatGptRateLimitNotice();
    if (activeLimit) {
      stoppedByRateLimit = true;
      results.push(activeLimit);
      break;
    }
    const tab = targetTabs[i];
    const result = await enqueuePromptInNewChatTab(tab, text);
    results.push(result);
    if (result?.rateLimited) {
      stoppedByRateLimit = true;
      noteChatGptRateLimit();
      break;
    }
    if (i < targetTabs.length - 1) await sleep(CHATGPT_NEW_CHAT_TAB_GAP_MS);
  }
  if (typeof sourceTab?.id === 'number') {
    await pTabsUpdate(sourceTab.id, { active: true });
  }
  if (!targetTabs.length) {
    return { ok: false, message: '전송할 ChatGPT 탭을 준비하지 못했습니다.' };
  }
  const sent = results.filter((item) => item?.ok);
  const firstFailure = results.find((item) => !item?.ok && item?.message);
  const reusedCount = Math.max(0, targetTabs.length - createdTabs.length);
  return {
    ok: sent.length > 0,
    requestedCount: count,
    createdCount: createdTabs.length,
    reusedCount,
    targetCount: targetTabs.length,
    sentCount: sent.length,
    tabIds: sent.map((item) => item.tabId).filter(Number.isFinite),
    rateLimited: stoppedByRateLimit,
    message: stoppedByRateLimit
      ? (sent.length > 0
        ? `ChatGPT 탭 ${sent.length}개 전송 후 요청 제한 감지로 중단했습니다. 잠시 후 다시 시도해 주세요.`
        : (firstFailure?.message || 'ChatGPT 요청 제한이 감지되었습니다. 잠시 후 다시 시도해 주세요.'))
      : (sent.length > 0
        ? `기존 ChatGPT 탭 ${Math.min(sent.length, reusedCount)}개 재사용, 새 탭 ${createdTabs.length}개 생성 후 전송 요청 완료`
        : (firstFailure?.message || 'ChatGPT 탭 전송에 실패했습니다.')),
  };
}
function pIdleQueryState(idleSec) {
  return new Promise((resolve) => {
    try {
      chrome.idle.queryState(idleSec, (state) => resolve(state || 'active'));
    } catch (_) {
      resolve('active');
    }
  });
}
function clearBadgesForAllTabs(options = {}) {
  actionStateCache = {};
  // Legacy completion badges are disabled; queue count badges are restored by updateIcon.
  safeActionCall(chrome.action.setBadgeText({ text: '' }));
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (!t || typeof t.id !== 'number') continue;
      safeActionCall(chrome.action.setBadgeText({ text: '', tabId: t.id }));
    }
    if (options.restoreQueueBadges) refreshTrackedTabs();
  });
}
function resetRuntimeCachesForStorageReplace() {
  if (completionHistoryFlushTimer) {
    try { clearTimeout(completionHistoryFlushTimer); } catch (_) {}
    completionHistoryFlushTimer = null;
  }
  if (customTabTitlesFlushTimer) {
    try { clearTimeout(customTabTitlesFlushTimer); } catch (_) {}
    customTabTitlesFlushTimer = null;
  }
  settings = { ...DEFAULT_SETTINGS };
  completionHistoryCache = [];
  customTabTitles = {};
  lastPersistedCustomTabTitlesSignature = JSON.stringify(customTabTitles);
  chatGptNewChatRateLimitUntil = 0;
  clearBadgesForAllTabs({ restoreQueueBadges: true });
  ensureGeminiProbeAlarm();
  bumpDashboardVersion();
}
function refreshTrackedTabs() {
  // 현재 상태를 알고 있는 탭(= tabStates)에 대해서만 아이콘을 다시 반영
  for (const id of Object.keys(tabStates)) {
    const tabId = parseInt(id, 10);
    if (!Number.isFinite(tabId)) continue;
    updateIcon(tabId);
  }
}
function ensureGeminiProbeAlarm() {
  // 설정값이 바뀌었을 때, alarms를 즉시 반영
  const enabled = !!settings.geminiProbeEnabled;
  if (!enabled) {
    try { chrome.alarms.clear(GEMINI_PROBE_ALARM); } catch (_) {}
    return;
  }
  const periodMin = clampNumber(settings.geminiProbePeriodMin, 1, GEMINI_PROBE_MIN_PERIOD_MIN, 60);
  try {
    chrome.alarms.create(GEMINI_PROBE_ALARM, { periodInMinutes: periodMin });
  } catch (_) {}
}
// 초기 설정 로드
chrome.storage.local.get([
  STORAGE_KEYS.DND_MODE,
  STORAGE_KEYS.BADGE_ENABLED,
  STORAGE_KEYS.BADGE_COUNT_ENABLED,
  STORAGE_KEYS.COMPLETION_HISTORY_ENABLED,
  STORAGE_KEYS.INDIVIDUAL_COMPLETION_NOTIFICATION_ENABLED,
  STORAGE_KEYS.INDIVIDUAL_COMPLETION_SOUND,
  STORAGE_KEYS.BATCH_COMPLETION_NOTIFICATION_ENABLED,
  STORAGE_KEYS.BATCH_COMPLETION_SOUND,
  STORAGE_KEYS.BATCH_COMPLETION_THRESHOLD,
  STORAGE_KEYS.INDIVIDUAL_COMPLETION_VOLUME,
  STORAGE_KEYS.BATCH_COMPLETION_VOLUME,
  STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_DATA_URL,
  STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_DATA_URL,
  STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_NAME,
  STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_NAME,
  STORAGE_KEYS.GEMINI_PROBE_ENABLED,
  STORAGE_KEYS.GEMINI_PROBE_PERIOD_MIN,
  STORAGE_KEYS.GEMINI_PROBE_ONLY_IDLE,
  STORAGE_KEYS.GEMINI_PROBE_IDLE_SEC,
  STORAGE_KEYS.GEMINI_PROBE_MIN_ORANGE_SEC,
  STORAGE_KEYS.NOTIFICATION_SNOOZE_UNTIL,
  STORAGE_KEYS.COMPLETION_HISTORY,
  STORAGE_KEYS.QUIET_HOURS_ENABLED,
  STORAGE_KEYS.QUIET_HOURS_START,
  STORAGE_KEYS.QUIET_HOURS_END,
  STORAGE_KEYS.CUSTOM_TAB_TITLES,
  STORAGE_KEYS.CHATGPT_RATE_LIMIT_UNTIL,
], (res) => {
  if (typeof res[STORAGE_KEYS.DND_MODE] === 'boolean') settings.dndMode = res[STORAGE_KEYS.DND_MODE];
  if (typeof res[STORAGE_KEYS.BADGE_ENABLED] === 'boolean') settings.badgeEnabled = res[STORAGE_KEYS.BADGE_ENABLED];
  if (typeof res[STORAGE_KEYS.BADGE_COUNT_ENABLED] === 'boolean') settings.badgeCountEnabled = res[STORAGE_KEYS.BADGE_COUNT_ENABLED];
  if (typeof res[STORAGE_KEYS.COMPLETION_HISTORY_ENABLED] === 'boolean') settings.completionHistoryEnabled = res[STORAGE_KEYS.COMPLETION_HISTORY_ENABLED];
  if (typeof res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_NOTIFICATION_ENABLED] === 'boolean') settings.individualCompletionNotificationEnabled = res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_NOTIFICATION_ENABLED];
  if (typeof res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_SOUND] === 'string') settings.individualCompletionSound = normalizeSoundKey(res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_SOUND], SOUND_PRESETS.soft);
  if (typeof res[STORAGE_KEYS.BATCH_COMPLETION_NOTIFICATION_ENABLED] === 'boolean') settings.batchCompletionNotificationEnabled = res[STORAGE_KEYS.BATCH_COMPLETION_NOTIFICATION_ENABLED];
  if (typeof res[STORAGE_KEYS.BATCH_COMPLETION_SOUND] === 'string') settings.batchCompletionSound = normalizeSoundKey(res[STORAGE_KEYS.BATCH_COMPLETION_SOUND], SOUND_PRESETS.triple);
  if (res[STORAGE_KEYS.BATCH_COMPLETION_THRESHOLD] != null) settings.batchCompletionThreshold = clampInt(res[STORAGE_KEYS.BATCH_COMPLETION_THRESHOLD], 4, 2, 99);
  if (res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_VOLUME] != null) settings.individualCompletionVolume = normalizeVolume(res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_VOLUME], 0.75);
  if (res[STORAGE_KEYS.BATCH_COMPLETION_VOLUME] != null) settings.batchCompletionVolume = normalizeVolume(res[STORAGE_KEYS.BATCH_COMPLETION_VOLUME], 0.9);
  if (typeof res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_DATA_URL] === 'string') settings.individualCompletionCustomSoundDataUrl = res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_DATA_URL] || '';
  if (typeof res[STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_DATA_URL] === 'string') settings.batchCompletionCustomSoundDataUrl = res[STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_DATA_URL] || '';
  if (typeof res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_NAME] === 'string') settings.individualCompletionCustomSoundName = res[STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_NAME] || '';
  if (typeof res[STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_NAME] === 'string') settings.batchCompletionCustomSoundName = res[STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_NAME] || '';
  if (typeof res[STORAGE_KEYS.GEMINI_PROBE_ENABLED] === 'boolean') settings.geminiProbeEnabled = res[STORAGE_KEYS.GEMINI_PROBE_ENABLED];
  if (typeof res[STORAGE_KEYS.GEMINI_PROBE_ONLY_IDLE] === 'boolean') settings.geminiProbeOnlyIdle = res[STORAGE_KEYS.GEMINI_PROBE_ONLY_IDLE];
  if (res[STORAGE_KEYS.GEMINI_PROBE_PERIOD_MIN] != null) settings.geminiProbePeriodMin = clampNumber(res[STORAGE_KEYS.GEMINI_PROBE_PERIOD_MIN], 1, 1, 60);
  if (res[STORAGE_KEYS.GEMINI_PROBE_IDLE_SEC] != null) settings.geminiProbeIdleSec = clampInt(res[STORAGE_KEYS.GEMINI_PROBE_IDLE_SEC], 60, 15, 3600);
  if (res[STORAGE_KEYS.GEMINI_PROBE_MIN_ORANGE_SEC] != null) settings.geminiProbeMinOrangeSec = clampInt(res[STORAGE_KEYS.GEMINI_PROBE_MIN_ORANGE_SEC], 12, 3, 600);
  if (res[STORAGE_KEYS.NOTIFICATION_SNOOZE_UNTIL] != null) settings.notificationSnoozeUntil = clampInt(res[STORAGE_KEYS.NOTIFICATION_SNOOZE_UNTIL], 0, 0, Number.MAX_SAFE_INTEGER);
  if (res[STORAGE_KEYS.CHATGPT_RATE_LIMIT_UNTIL] != null) chatGptNewChatRateLimitUntil = clampInt(res[STORAGE_KEYS.CHATGPT_RATE_LIMIT_UNTIL], 0, 0, Number.MAX_SAFE_INTEGER);
  completionHistoryCache = Array.isArray(res?.[STORAGE_KEYS.COMPLETION_HISTORY]) ? res[STORAGE_KEYS.COMPLETION_HISTORY].slice(0, COMPLETION_HISTORY_LIMIT) : [];
  if (typeof res[STORAGE_KEYS.QUIET_HOURS_ENABLED] === 'boolean') settings.quietHoursEnabled = !!res[STORAGE_KEYS.QUIET_HOURS_ENABLED];
  if (res[STORAGE_KEYS.QUIET_HOURS_START] != null) settings.quietHoursStart = normalizeClockTime(res[STORAGE_KEYS.QUIET_HOURS_START], '23:00');
  if (res[STORAGE_KEYS.QUIET_HOURS_END] != null) settings.quietHoursEnd = normalizeClockTime(res[STORAGE_KEYS.QUIET_HOURS_END], '08:00');
  customTabTitles = normalizeCustomTabTitlesMap(res?.[STORAGE_KEYS.CUSTOM_TAB_TITLES]);
  lastPersistedCustomTabTitlesSignature = JSON.stringify(customTabTitles);
  settings.badgeEnabled = false;
  settings.badgeCountEnabled = false;
  clearBadgesForAllTabs();
  ensureGeminiProbeAlarm();
});
// 설정 변경 감지 (Popup에서 변경 시)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName && areaName !== 'local') return;
  let dashboardRelevantChanged = false;
  if (changes[STORAGE_KEYS.DND_MODE]) {
    settings.dndMode = !!getStorageChangeValue(changes, STORAGE_KEYS.DND_MODE, DEFAULT_SETTINGS.dndMode);
    dashboardRelevantChanged = true;
  }
  if (changes.enabledSites || changes.customSites) {
    // 모니터링 대상에서 빠진 탭은 상태를 지워서 "등록된 사이트만" 관리되도록.
    getSiteConfig(() => purgeDisabledTabs());
  }
  if (changes[STORAGE_KEYS.CUSTOM_TAB_TITLES]) {
    customTabTitles = normalizeCustomTabTitlesMap(getStorageChangeValue(changes, STORAGE_KEYS.CUSTOM_TAB_TITLES, {}));
    lastPersistedCustomTabTitlesSignature = JSON.stringify(customTabTitles);
    dashboardRelevantChanged = true;
  }
  if (changes[STORAGE_KEYS.BADGE_ENABLED]) {
    settings.badgeEnabled = false;
    clearBadgesForAllTabs({ restoreQueueBadges: true });
  }
  if (changes[STORAGE_KEYS.BADGE_COUNT_ENABLED]) {
    settings.badgeCountEnabled = false;
    clearBadgesForAllTabs({ restoreQueueBadges: true });
  }
  if (changes[STORAGE_KEYS.COMPLETION_HISTORY_ENABLED]) {
    settings.completionHistoryEnabled = !!getStorageChangeValue(changes, STORAGE_KEYS.COMPLETION_HISTORY_ENABLED, DEFAULT_SETTINGS.completionHistoryEnabled);
    if (!settings.completionHistoryEnabled) {
      completionHistoryCache = [];
      try { chrome.storage.local.set({ [STORAGE_KEYS.COMPLETION_HISTORY]: [] }); } catch (_) {}
    }
    dashboardRelevantChanged = true;
  }
  if (changes[STORAGE_KEYS.INDIVIDUAL_COMPLETION_NOTIFICATION_ENABLED]) settings.individualCompletionNotificationEnabled = !!getStorageChangeValue(changes, STORAGE_KEYS.INDIVIDUAL_COMPLETION_NOTIFICATION_ENABLED, DEFAULT_SETTINGS.individualCompletionNotificationEnabled);
  if (changes[STORAGE_KEYS.INDIVIDUAL_COMPLETION_SOUND]) settings.individualCompletionSound = normalizeSoundKey(getStorageChangeValue(changes, STORAGE_KEYS.INDIVIDUAL_COMPLETION_SOUND, DEFAULT_SETTINGS.individualCompletionSound), SOUND_PRESETS.soft);
  if (changes[STORAGE_KEYS.BATCH_COMPLETION_NOTIFICATION_ENABLED]) settings.batchCompletionNotificationEnabled = !!getStorageChangeValue(changes, STORAGE_KEYS.BATCH_COMPLETION_NOTIFICATION_ENABLED, DEFAULT_SETTINGS.batchCompletionNotificationEnabled);
  if (changes[STORAGE_KEYS.BATCH_COMPLETION_SOUND]) settings.batchCompletionSound = normalizeSoundKey(getStorageChangeValue(changes, STORAGE_KEYS.BATCH_COMPLETION_SOUND, DEFAULT_SETTINGS.batchCompletionSound), SOUND_PRESETS.triple);
  if (changes[STORAGE_KEYS.BATCH_COMPLETION_THRESHOLD]) settings.batchCompletionThreshold = clampInt(getStorageChangeValue(changes, STORAGE_KEYS.BATCH_COMPLETION_THRESHOLD, DEFAULT_SETTINGS.batchCompletionThreshold), 4, 2, 99);
  if (changes[STORAGE_KEYS.INDIVIDUAL_COMPLETION_VOLUME]) settings.individualCompletionVolume = normalizeVolume(getStorageChangeValue(changes, STORAGE_KEYS.INDIVIDUAL_COMPLETION_VOLUME, DEFAULT_SETTINGS.individualCompletionVolume), 0.75);
  if (changes[STORAGE_KEYS.BATCH_COMPLETION_VOLUME]) settings.batchCompletionVolume = normalizeVolume(getStorageChangeValue(changes, STORAGE_KEYS.BATCH_COMPLETION_VOLUME, DEFAULT_SETTINGS.batchCompletionVolume), 0.9);
  if (changes[STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_DATA_URL]) settings.individualCompletionCustomSoundDataUrl = String(getStorageChangeValue(changes, STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_DATA_URL, DEFAULT_SETTINGS.individualCompletionCustomSoundDataUrl) || '');
  if (changes[STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_DATA_URL]) settings.batchCompletionCustomSoundDataUrl = String(getStorageChangeValue(changes, STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_DATA_URL, DEFAULT_SETTINGS.batchCompletionCustomSoundDataUrl) || '');
  if (changes[STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_NAME]) settings.individualCompletionCustomSoundName = String(getStorageChangeValue(changes, STORAGE_KEYS.INDIVIDUAL_COMPLETION_CUSTOM_SOUND_NAME, DEFAULT_SETTINGS.individualCompletionCustomSoundName) || '');
  if (changes[STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_NAME]) settings.batchCompletionCustomSoundName = String(getStorageChangeValue(changes, STORAGE_KEYS.BATCH_COMPLETION_CUSTOM_SOUND_NAME, DEFAULT_SETTINGS.batchCompletionCustomSoundName) || '');
  // Gemini probe settings
  if (changes[STORAGE_KEYS.GEMINI_PROBE_ENABLED]) settings.geminiProbeEnabled = !!getStorageChangeValue(changes, STORAGE_KEYS.GEMINI_PROBE_ENABLED, DEFAULT_SETTINGS.geminiProbeEnabled);
  if (changes[STORAGE_KEYS.GEMINI_PROBE_ONLY_IDLE]) settings.geminiProbeOnlyIdle = !!getStorageChangeValue(changes, STORAGE_KEYS.GEMINI_PROBE_ONLY_IDLE, DEFAULT_SETTINGS.geminiProbeOnlyIdle);
  if (changes[STORAGE_KEYS.GEMINI_PROBE_PERIOD_MIN]) settings.geminiProbePeriodMin = clampNumber(getStorageChangeValue(changes, STORAGE_KEYS.GEMINI_PROBE_PERIOD_MIN, DEFAULT_SETTINGS.geminiProbePeriodMin), 1, 1, 60);
  if (changes[STORAGE_KEYS.GEMINI_PROBE_IDLE_SEC]) settings.geminiProbeIdleSec = clampInt(getStorageChangeValue(changes, STORAGE_KEYS.GEMINI_PROBE_IDLE_SEC, DEFAULT_SETTINGS.geminiProbeIdleSec), 60, 15, 3600);
  if (changes[STORAGE_KEYS.GEMINI_PROBE_MIN_ORANGE_SEC]) settings.geminiProbeMinOrangeSec = clampInt(getStorageChangeValue(changes, STORAGE_KEYS.GEMINI_PROBE_MIN_ORANGE_SEC, DEFAULT_SETTINGS.geminiProbeMinOrangeSec), 12, 3, 600);
  if (changes[STORAGE_KEYS.NOTIFICATION_SNOOZE_UNTIL]) {
    settings.notificationSnoozeUntil = clampInt(getStorageChangeValue(changes, STORAGE_KEYS.NOTIFICATION_SNOOZE_UNTIL, DEFAULT_SETTINGS.notificationSnoozeUntil), 0, 0, Number.MAX_SAFE_INTEGER);
    dashboardRelevantChanged = true;
  }
  if (changes[STORAGE_KEYS.CHATGPT_RATE_LIMIT_UNTIL]) {
    chatGptNewChatRateLimitUntil = clampInt(getStorageChangeValue(changes, STORAGE_KEYS.CHATGPT_RATE_LIMIT_UNTIL, 0), 0, 0, Number.MAX_SAFE_INTEGER);
  }
  if (changes[STORAGE_KEYS.COMPLETION_HISTORY]) {
    completionHistoryCache = Array.isArray(changes[STORAGE_KEYS.COMPLETION_HISTORY].newValue) ? changes[STORAGE_KEYS.COMPLETION_HISTORY].newValue.slice(0, COMPLETION_HISTORY_LIMIT) : [];
    dashboardRelevantChanged = true;
  }
  if (changes[STORAGE_KEYS.QUIET_HOURS_ENABLED]) {
    settings.quietHoursEnabled = !!getStorageChangeValue(changes, STORAGE_KEYS.QUIET_HOURS_ENABLED, DEFAULT_SETTINGS.quietHoursEnabled);
    dashboardRelevantChanged = true;
  }
  if (changes[STORAGE_KEYS.QUIET_HOURS_START]) {
    settings.quietHoursStart = normalizeClockTime(getStorageChangeValue(changes, STORAGE_KEYS.QUIET_HOURS_START, DEFAULT_SETTINGS.quietHoursStart), '23:00');
    dashboardRelevantChanged = true;
  }
  if (changes[STORAGE_KEYS.QUIET_HOURS_END]) {
    settings.quietHoursEnd = normalizeClockTime(getStorageChangeValue(changes, STORAGE_KEYS.QUIET_HOURS_END, DEFAULT_SETTINGS.quietHoursEnd), '08:00');
    dashboardRelevantChanged = true;
  }
  // 관련 설정이 바뀌었으면 알람 갱신
  if (
    changes[STORAGE_KEYS.GEMINI_PROBE_ENABLED] ||
    changes[STORAGE_KEYS.GEMINI_PROBE_PERIOD_MIN]
  ) {
    ensureGeminiProbeAlarm();
  }
  if (dashboardRelevantChanged) bumpDashboardVersion();
});
function resolveSiteForUrl(url) {
  const sitesApi = globalThis?.ReadyAi?.sites;
  if (!sitesApi?.resolveSiteFromConfig) return null;
  try {
    return sitesApi.resolveSiteFromConfig(url, _siteConfigCache.enabledSites, _siteConfigCache.customSites);
  } catch (_) {
    return null;
  }
}
function isGeminiSite(site) {
  if (!site) return false;
  // builtin: key === 'gemini'
  if (site.key === 'gemini') return true;
  // custom: detection === 'gemini'
  if (site.detection === 'gemini') return true;
  return false;
}
async function tickGeminiProbe() {
  // 1) 설정 OFF면 아무 것도 안 함
  if (!settings.geminiProbeEnabled) return;
  // 2) 현재 탭들 중 "Gemini로 감지되는" 탭만 골라서,
  //    content script에 "force_check"를 보내서 우선 갱신을 시도.
  const tabs = await pTabsQuery({});
  const now = Date.now();
  /** @type {{tab:any, site:any, orangeAgeSec:number}[]} */
  const candidates = [];
  for (const t of tabs) {
    if (!t || typeof t.id !== 'number') continue;
    const url = t.url || '';
    if (!url) continue;
    if (!isMonitoredUrl(url)) continue;
    const site = resolveSiteForUrl(url);
    if (!isGeminiSite(site)) continue;
    // 백그라운드에서 실행되는 content script에 "상태 한번 더 체크" 요청
    await pTabsSendMessage(t.id, { action: 'force_check', reason: 'gemini_probe_tick' });
    // 탭을 "잠깐 활성화"시키는 nudge 후보(= ORANGE가 오래 유지되는 Gemini 탭)
    const st = tabStates[t.id];
    if (!st || st.status !== 'ORANGE') continue;
    const orangeSinceAt = st.orangeSinceAt || st.lastUpdateAt || now;
    const orangeAgeSec = (now - orangeSinceAt) / 1000;
    const lastNudgeAt = st.lastNudgeAt || 0;
    const cooledDown = (now - lastNudgeAt) >= GEMINI_PROBE_NUDGE_COOLDOWN_MS;
    const oldEnough = orangeAgeSec >= (settings.geminiProbeMinOrangeSec || 12);
    const notAlreadyActive = !t.active;
    if (cooledDown && oldEnough && notAlreadyActive) {
      candidates.push({ tab: t, site, orangeAgeSec });
    }
  }
  // 3) "유휴일 때만" 옵션이면, active 상태에서는 절대 탭 전환 안 함
  let allowNudge = true;
  if (settings.geminiProbeOnlyIdle) {
    const idleSec = clampInt(settings.geminiProbeIdleSec, 60, 15, 3600);
    const state = await pIdleQueryState(idleSec);
    allowNudge = (state === 'idle' || state === 'locked');
  }
  if (!allowNudge) return;
  // 4) 후보 중 "가장 오래 ORANGE"인 탭 1개만 nudge
  if (!candidates.length) return;
  candidates.sort((a, b) => b.orangeAgeSec - a.orangeAgeSec);
  const pick = candidates[0];
  if (!pick?.tab?.id) return;
  await nudgeTabForGeminiCompletion(pick.tab.id, pick.tab.windowId);
}
function getQueuedSteeringTabIds() {
  return Object.entries(tabStates)
    .filter(([, state]) => Math.max(0, Number(state?.steeringQueueCount) || 0) > 0)
    .map(([tabId]) => parseInt(tabId, 10))
    .filter(Number.isFinite);
}
function ensureSteeringQueueProbeAlarm() {
  const hasQueuedTabs = getQueuedSteeringTabIds().length > 0;
  try {
    if (!hasQueuedTabs) {
      chrome.alarms.clear(STEERING_QUEUE_PROBE_ALARM);
      return;
    }
    chrome.alarms.create(STEERING_QUEUE_PROBE_ALARM, { periodInMinutes: STEERING_QUEUE_PROBE_MIN_PERIOD_MIN });
  } catch (_) {}
}
async function tickSteeringQueueProbe() {
  const queuedTabIds = getQueuedSteeringTabIds();
  if (!queuedTabIds.length) {
    ensureSteeringQueueProbeAlarm();
    return;
  }
  const tabs = await pTabsQuery({});
  const tabsById = new Map((tabs || []).filter((tab) => typeof tab?.id === 'number').map((tab) => [tab.id, tab]));
  for (const tabId of queuedTabIds) {
    const tab = tabsById.get(tabId);
    if (!tab || !isMonitoredUrl(tab.url || '')) continue;
    await ensureContentScripts(tab);
    await pTabsSendMessage(tabId, { action: 'force_check', reason: 'steering_queue_probe', topFrameOnly: true }, { frameId: 0 });
    await pTabsSendMessage(tabId, { action: 'process_steering_queue_now', reason: 'steering_queue_probe', topFrameOnly: true }, { frameId: 0 });
  }
  ensureSteeringQueueProbeAlarm();
}
async function nudgeTabForGeminiCompletion(targetTabId, windowId) {
  // 안전장치: 현재 tabStates가 ORANGE가 아니면 굳이 안 건드린다.
  const st = tabStates[targetTabId];
  if (!st || st.status !== 'ORANGE') {
    await pTabsSendMessage(targetTabId, { action: 'force_check', reason: 'gemini_probe_nudge_skipped' });
    return;
  }
  // 같은 윈도우에서 원래 활성 탭을 저장했다가 복구
  const activeTabs = await pTabsQuery({ windowId, active: true });
  const restoreTabId = (activeTabs && activeTabs[0] && typeof activeTabs[0].id === 'number') ? activeTabs[0].id : null;
  // 1) Gemini 탭을 활성화
  await pTabsUpdate(targetTabId, { active: true });
  await sleep(320);
  // 2) 활성화된 김에 강제 체크 한 번 더
  await pTabsSendMessage(targetTabId, { action: 'force_check', reason: 'gemini_probe_nudge' });
  await sleep(320);
  // 3) 원래 탭으로 복구
  if (restoreTabId != null && restoreTabId !== targetTabId) {
    await pTabsUpdate(restoreTabId, { active: true });
  }
  // 4) nudge 시간 기록(쿨다운)
  if (tabStates[targetTabId]) {
    tabStates[targetTabId].lastNudgeAt = Date.now();
  }
}
try {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm) return;
    if (alarm.name === GEMINI_PROBE_ALARM) {
      safeActionCall(tickGeminiProbe());
      return;
    }
    if (alarm.name === STEERING_QUEUE_PROBE_ALARM) {
      safeActionCall(tickSteeringQueueProbe());
    }
  });
} catch (_) {}
function getOrangeTabCount() {
  return Object.values(tabStates).filter((state) => state?.status === 'ORANGE').length;
}
function startBatchWave(initialOrangeCount) {
  batchWave.active = initialOrangeCount > 0;
  batchWave.startedAt = batchWave.active ? Date.now() : 0;
  batchWave.peakOrangeCount = batchWave.active ? initialOrangeCount : 0;
}
function resetBatchWave() {
  batchWave.active = false;
  batchWave.startedAt = 0;
  batchWave.peakOrangeCount = 0;
}
function rebaseBatchWave() {
  const orangeCount = getOrangeTabCount();
  resetBatchWave();
  if (orangeCount > 0) startBatchWave(orangeCount);
}
function handleOrangeWaveChange(prevOrangeCount, nextOrangeCount, options = {}) {
  if (options.cancelWave) {
    rebaseBatchWave();
    return;
  }
  if (prevOrangeCount <= 0 && nextOrangeCount > 0) {
    startBatchWave(nextOrangeCount);
    return;
  }
  if (nextOrangeCount > 0) {
    if (!batchWave.active) {
      startBatchWave(nextOrangeCount);
    } else if (nextOrangeCount > batchWave.peakOrangeCount) {
      batchWave.peakOrangeCount = nextOrangeCount;
    }
  }
  if (prevOrangeCount > 0 && nextOrangeCount <= 0) {
    const peakOrangeCount = batchWave.peakOrangeCount || prevOrangeCount;
    const shouldBatchAlert = peakOrangeCount >= clampInt(settings.batchCompletionThreshold, 4, 2, 99);
    resetBatchWave();
    if (shouldBatchAlert) {
      safeActionCall(emitBatchCompletionAlert({ peakOrangeCount }));
    }
  }
}
function buildSingleNotificationTitle(platform, siteName) {
  if (siteName) return `${siteName} 답변 완료`;
  if (platform === 'chatgpt') return 'ChatGPT 답변 완료';
  if (platform === 'gemini') return 'Gemini 답변 완료';
  if (platform === 'aistudio') return 'AI Studio 답변 완료';
  if (platform === 'claude') return 'Claude 답변 완료';
  return 'AI 답변 완료';
}
function createBasicNotification(notificationId, title, message) {
  try {
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'assets/bell_notice.png',
      title,
      message,
      priority: 2,
    }, () => {
      if (chrome.runtime.lastError) delete notificationTargets[notificationId];
    });
  } catch (_) {}
}
async function emitSingleCompletionAlert({ tabId, platform, siteName }) {
  pushCompletionHistory({
    kind: 'single',
    at: Date.now(),
    tabId,
    platform: platform || '',
    siteName: siteName || buildSingleNotificationTitle(platform, siteName),
  });
  if (getNotificationSuppressionReason()) return;
  const title = buildSingleNotificationTitle(platform, siteName);
  if (settings.individualCompletionNotificationEnabled) {
    const notificationId = `ready_ai_single_${tabId}_${Date.now()}`;
    notificationTargets[notificationId] = { type: 'single', tabId };
    createBasicNotification(notificationId, title, '작업이 완료되었습니다. 확인하려면 클릭하세요.');
  }
  const soundOptions = getSoundOptionsByKind('single');
  if (soundOptions.soundKey !== SOUND_PRESETS.off) {
    await playAlertSound(soundOptions.soundKey, soundOptions);
  }
}
async function emitBatchCompletionAlert({ peakOrangeCount }) {
  pushCompletionHistory({
    kind: 'batch',
    at: Date.now(),
    peakOrangeCount: clampInt(peakOrangeCount, 0, 0, 999),
    siteName: `대기 ${peakOrangeCount}개 전체 완료`,
  });
  if (getNotificationSuppressionReason()) return;
  if (settings.batchCompletionNotificationEnabled) {
    const notificationId = `ready_ai_batch_${Date.now()}`;
    notificationTargets[notificationId] = { type: 'batch' };
    createBasicNotification(
      notificationId,
      `대기 ${peakOrangeCount}개 전체 완료`,
      `동시에 대기 중이던 ${peakOrangeCount}개 작업 묶음이 모두 완료되었습니다.`
    );
  }
  const soundOptions = getSoundOptionsByKind('batch');
  if (soundOptions.soundKey !== SOUND_PRESETS.off) {
    await playAlertSound(soundOptions.soundKey, soundOptions);
  }
}
function updateIcon(tabId) {
  // Chrome 툴바/확장프로그램 메인 아이콘은 고정하고, 후속 지시 대기열 수만 badge로 표시한다.
  const iconPath = 'assets/bell_profile.png';
  const queueCount = Math.max(0, Number(tabStates?.[tabId]?.steeringQueueCount) || 0);
  const badgeText = queueCount > 0 ? (queueCount > 99 ? '99+' : String(queueCount)) : '';
  const signature = JSON.stringify({
    iconPath,
    badgeText,
  });
  if (actionStateCache[tabId] === signature) return;
  actionStateCache[tabId] = signature;
  safeActionCall(chrome.action.setIcon({ path: iconPath, tabId: tabId }));
  safeActionCall(chrome.action.setBadgeText({ text: badgeText, tabId: tabId }));
  if (badgeText) {
    safeActionCall(chrome.action.setBadgeBackgroundColor({ color: '#0f766e', tabId: tabId }));
  }
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'test_alert_sound') {
    const kind = message.kind === 'batch' ? 'batch' : 'single';
    const fallback = getSoundOptionsByKind(kind);
    const soundKey = normalizeSoundKey(message.soundKey, fallback.soundKey);
    const volume = normalizeVolume(message.volume, fallback.volume);
    const customSoundDataUrl = String(message.customSoundDataUrl || fallback.customSoundDataUrl || '');
    playAlertSound(soundKey, { volume, customSoundDataUrl })
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const popupScopedActions = new Set([
    'get_custom_tab_title_for_tab',
    'set_custom_tab_title_for_tab',
    'clear_custom_tab_title_for_tab',
    'get_custom_tab_titles_map',
    'batch_set_custom_tab_titles_for_tabs',
    'batch_clear_custom_tab_titles_for_tabs',
    'reset_runtime_caches_for_storage_replace',
  ]);
  if (!popupScopedActions.has(message?.action)) return;
  const tabId = clampInt(message?.tabId, NaN, 0, Number.MAX_SAFE_INTEGER);
  if (message.action === 'get_custom_tab_titles_map') {
    sendResponse({ ok: true, titles: { ...customTabTitles } });
    return;
  }
  if (message.action === 'batch_set_custom_tab_titles_for_tabs') {
    const result = setCustomTabTitlesForTabs(message.items);
    sendResponse({ ok: true, count: result.count, total: result.total, changed: result.changed });
    return;
  }
  if (message.action === 'batch_clear_custom_tab_titles_for_tabs') {
    const result = clearCustomTabTitlesForTabs(message.tabIds);
    sendResponse({ ok: true, count: result.count, total: result.total, cleared: result.cleared });
    return;
  }
  if (message.action === 'reset_runtime_caches_for_storage_replace') {
    resetRuntimeCachesForStorageReplace();
    sendResponse({ ok: true });
    return;
  }
  if (!Number.isFinite(tabId) || tabId <= 0) {
    sendResponse({ ok: false, message: '탭을 찾지 못했습니다.' });
    return;
  }
  if (message.action === 'get_custom_tab_title_for_tab') {
    sendResponse({ ok: true, title: getCustomTabTitleForTab(tabId) });
    return;
  }
  if (message.action === 'set_custom_tab_title_for_tab') {
    const title = setCustomTabTitleForTab(tabId, message.title || '');
    if (!title) {
      sendResponse({ ok: false, message: '탭 이름이 비어 있습니다.' });
      return;
    }
    notifyCustomTabTitleUpdated(tabId, title);
    sendResponse({ ok: true, title });
    return;
  }
  if (message.action === 'clear_custom_tab_title_for_tab') {
    clearCustomTabTitleForTab(tabId);
    notifyCustomTabTitleCleared(tabId);
    sendResponse({ ok: true });
    return;
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return;
  const tabId = sender.tab.id;
  const frameId = typeof sender.frameId === 'number' ? sender.frameId : 0;
  if (message.action === 'open_chatgpt_new_chat_tabs') {
    openChatGptNewChatTabsForPrompt(message, sender)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, message: '새 채팅 탭 전송 중 오류가 발생했습니다.' }));
    return true;
  }
  // content script(iframe)에서 top tab URL이 필요할 때 사용
  if (message.action === 'get_tab_url') {
    sendResponse({ url: sender.tab?.url || '' });
    return;
  }
  if (message.action === 'ensure_title_guard') {
    ensureMainWorldTitleGuard(tabId)
      .then((ok) => sendResponse({ ok: !!ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.action === 'get_custom_tab_title') {
    sendResponse({ ok: true, title: getCustomTabTitleForTab(tabId) });
    return;
  }
  if (message.action === 'set_custom_tab_title') {
    const title = setCustomTabTitleForTab(tabId, message.title || '');
    if (!title) {
      sendResponse({ ok: false, message: '탭 이름이 비어 있습니다.' });
      return;
    }
    notifyCustomTabTitleUpdated(tabId, title);
    sendResponse({ ok: true, title });
    return;
  }
  if (message.action === 'clear_custom_tab_title') {
    clearCustomTabTitleForTab(tabId);
    notifyCustomTabTitleCleared(tabId);
    sendResponse({ ok: true });
    return;
  }
  function upsertFrameState(isGenerating, platform, siteName) {
    const now = Date.now();
    if (!frameStates[tabId]) frameStates[tabId] = {};
    frameStates[tabId][frameId] = {
      isGenerating: !!isGenerating,
      platform: platform || '',
      siteName: siteName || '',
      ts: now,
    };
  }
  function getAggregatedState() {
    const frames = frameStates[tabId] || {};
    const entries = Object.values(frames);
    // any generating?
    const anyGen = entries.some((e) => e?.isGenerating);
    // platform/siteName: generating 프레임 우선, 아니면 가장 최근
    let pick = null;
    if (anyGen) {
      pick = entries.find((e) => e?.isGenerating) || null;
    }
    if (!pick) {
      let best = null;
      for (const e of entries) {
        if (!e) continue;
        if (!best || (e.ts || 0) > (best.ts || 0)) best = e;
      }
      pick = best;
    }
    return {
      anyGen,
      platform: pick?.platform || '',
      siteName: pick?.siteName || '',
    };
  }
  if (message.action === 'status_update') {
    const platform = message.platform;
    const siteName = message.siteName;
    const prevState = tabStates[tabId] ? { ...tabStates[tabId] } : null;
    const prevStatus = prevState?.status;
    const prevOrangeCount = getOrangeTabCount();
    const now = Date.now();
    upsertFrameState(message.isGenerating, platform, siteName);
    const agg = getAggregatedState();
    const nextPlatform = agg.platform || platform || prevState?.platform || '';
    const nextSiteName = agg.siteName || siteName || prevState?.siteName || '';
    // 1) "프레임 중 하나라도" 생성중이면 ORANGE
    if (agg.anyGen) {
      const nextStatus = 'ORANGE';
      const meaningfulChanged = !prevState
        || prevStatus !== nextStatus
        || (prevState?.platform || '') !== nextPlatform
        || (prevState?.siteName || '') !== nextSiteName
        || (prevState?.windowId || null) !== (sender.tab?.windowId || null);
      tabStates[tabId] = {
        ...prevState,
        status: nextStatus,
        platform: nextPlatform,
        siteName: nextSiteName,
        windowId: sender.tab?.windowId,
        lastSeenAt: now,
        lastUpdateAt: meaningfulChanged
          ? now
          : (((now - (prevState?.lastUpdateAt || 0)) >= LAST_UPDATE_HEARTBEAT_THROTTLE_MS) ? now : (prevState?.lastUpdateAt || now)),
        orangeSinceAt: prevStatus === 'ORANGE' ? (prevState?.orangeSinceAt || now) : now,
        steeringQueueCount: prevState?.steeringQueueCount || 0,
      };
      handleOrangeWaveChange(prevOrangeCount, getOrangeTabCount());
      if (meaningfulChanged) bumpDashboardVersion();
      updateIcon(tabId);
      return;
    }
    // 2) 어떤 프레임도 생성중이 아니면:
    //    - ORANGE -> GREEN (완료, 표시는 흰색)
    //    - (첫 보고) -> WHITE (아무 질문 없음, 표시는 연두색)
    //    - GREEN/WHITE 유지
    if (!prevStatus) {
      tabStates[tabId] = {
        status: 'WHITE',
        platform: nextPlatform,
        siteName: nextSiteName,
        windowId: sender.tab?.windowId,
        lastSeenAt: now,
        lastUpdateAt: now,
        steeringQueueCount: prevState?.steeringQueueCount || 0,
      };
      bumpDashboardVersion();
      updateIcon(tabId);
      return;
    }
    if (prevStatus === 'ORANGE') {
      tabStates[tabId] = {
        ...prevState,
        status: 'GREEN',
        platform: nextPlatform,
        siteName: nextSiteName,
        windowId: sender.tab?.windowId,
        lastSeenAt: now,
        lastUpdateAt: now,
        steeringQueueCount: prevState?.steeringQueueCount || 0,
      };
      handleOrangeWaveChange(prevOrangeCount, getOrangeTabCount());
      bumpDashboardVersion();
      updateIcon(tabId);
      // 탭이 현재 비활성이면(다른 탭 보고 있으면) 알림/알림음을 보낼 수 있음
      const activeTabId = getActiveTabIdForWindow(sender.tab?.windowId);
      const isActiveTab = Number.isFinite(activeTabId) && activeTabId === tabId;
      if (!isActiveTab) safeActionCall(emitSingleCompletionAlert({ tabId, platform: nextPlatform, siteName: nextSiteName }));
      return;
    }
    if (prevStatus === 'GREEN' || prevStatus === 'WHITE') {
      const meaningfulChanged = (prevState?.platform || '') !== nextPlatform
        || (prevState?.siteName || '') !== nextSiteName
        || (prevState?.windowId || null) !== (sender.tab?.windowId || null);
      tabStates[tabId] = {
        ...prevState,
        status: prevStatus,
        platform: nextPlatform,
        siteName: nextSiteName,
        windowId: sender.tab?.windowId,
        lastSeenAt: now,
        lastUpdateAt: meaningfulChanged
          ? now
          : (((now - (prevState?.lastUpdateAt || 0)) >= LAST_UPDATE_HEARTBEAT_THROTTLE_MS) ? now : (prevState?.lastUpdateAt || now)),
        steeringQueueCount: prevState?.steeringQueueCount || 0,
      };
      if (meaningfulChanged) bumpDashboardVersion();
      updateIcon(tabId);
      return;
    }
  }
  if (message.action === 'steering_queue_update') {
    const prevState = tabStates[tabId] ? { ...tabStates[tabId] } : {};
    const now = Date.now();
    const nextCount = Math.max(0, Number(message.count) || 0);
    const nextPlatform = message.platform || prevState.platform || '';
    const nextSiteName = message.siteName || prevState.siteName || '';
    const meaningfulChanged = !prevState?.status
      || (prevState?.platform || '') !== nextPlatform
      || (prevState?.siteName || '') !== nextSiteName
      || (prevState?.windowId || null) !== (sender.tab?.windowId || null)
      || Math.max(0, Number(prevState?.steeringQueueCount) || 0) !== nextCount;
    tabStates[tabId] = {
      ...prevState,
      status: prevState.status || 'WHITE',
      platform: nextPlatform,
      siteName: nextSiteName,
      windowId: sender.tab?.windowId,
      lastSeenAt: now,
      lastUpdateAt: meaningfulChanged ? now : (prevState?.lastUpdateAt || now),
      steeringQueueCount: nextCount,
    };
    if (meaningfulChanged) bumpDashboardVersion();
    updateIcon(tabId);
    ensureSteeringQueueProbeAlarm();
    return;
  }
  // content 쪽 사용자 상호작용(클릭/스크롤)로 ⚪ -> 🟢
  if (message.action === 'user_activity') {
    const prev = tabStates[tabId]?.status;
    if (prev === 'GREEN') {
      tabStates[tabId].status = 'WHITE';
      tabStates[tabId].lastSeenAt = Date.now();
      tabStates[tabId].lastUpdateAt = Date.now();
      bumpDashboardVersion();
      updateIcon(tabId);
    }
  }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'get_dashboard_meta') {
    sendResponse({
      ok: true,
      version: dashboardVersion,
      itemsCount: dashboardMetaCache.itemsCount,
      hasOrange: dashboardMetaCache.hasOrange,
      hasGreen: dashboardMetaCache.hasGreen,
    });
    return;
  }
  if (message?.action !== 'get_dashboard') return;
  ensureTabMetaCache(() => {
    sendResponse({
      ok: true,
      version: dashboardVersion,
      items: getDashboardItemsFromCache(),
      snoozeUntil: clampInt(settings.notificationSnoozeUntil, 0, 0, Number.MAX_SAFE_INTEGER),
      history: completionHistoryCache.slice(0, COMPLETION_HISTORY_LIMIT),
      quietHoursActive: isQuietHoursActive(),
      quietHoursEnabled: !!settings.quietHoursEnabled,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      suppressionReason: getNotificationSuppressionReason(),
    });
  });
  return true;
});
chrome.tabs.query({}, (tabs) => {
  tabMetaCache = {};
  for (const tab of (Array.isArray(tabs) ? tabs : [])) upsertTabMetaFromTab(tab);
  tabCacheInitialized = true;
});
chrome.tabs.onCreated.addListener((tab) => {
  upsertTabMetaFromTab(tab);
  tabCacheInitialized = true;
  bumpDashboardVersion();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const prevMeta = tabMetaCache[tabId] || {};
  upsertTabMetaFromTab({ ...prevMeta, ...(tab || {}), id: tabId, ...changeInfo });
  if ('title' in changeInfo || 'url' in changeInfo || 'discarded' in changeInfo || 'status' in changeInfo) {
    bumpDashboardVersion();
  }
  const nextUrl = tab?.url || changeInfo.url || prevMeta.url || '';
  const titleChangedWithoutBadge = Object.prototype.hasOwnProperty.call(changeInfo, 'title')
    && isMonitoredUrl(nextUrl)
    && !titleHasReadyAiPrefix(changeInfo.title || tab?.title || '');
  if (changeInfo.status === 'complete' || changeInfo.url || titleChangedWithoutBadge) {
    const candidate = { ...prevMeta, ...(tab || {}), id: tabId, url: nextUrl };
    if (isMonitoredUrl(candidate.url || '')) {
      safeActionCall((async () => {
        const ready = await ensureContentScripts(candidate);
        if (!ready) return;
        if (titleChangedWithoutBadge) {
          if (!isChatGptUrl(candidate.url || '')) await ensureMainWorldTitleGuard(tabId);
          await pTabsSendMessage(tabId, { action: 'force_title_sync', reason: 'tab_title' }, { frameId: 0 });
          return;
        }
        await pTabsSendMessage(tabId, { action: 'force_check', reason: changeInfo.status === 'complete' ? 'tab_complete' : 'tab_url' });
      })());
    }
  }
});
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  for (const id of Object.keys(tabMetaCache)) {
    if ((tabMetaCache[id]?.windowId || null) === windowId) {
      tabMetaCache[id] = { ...(tabMetaCache[id] || {}), active: Number(id) === tabId };
    }
  }
  bumpDashboardVersion();
  safeActionCall((async () => {
    const tab = await pTabsGet(tabId);
    if (!tab?.id || !isMonitoredUrl(tab.url || '')) return;
    const ready = await ensureContentScripts(tab);
    if (ready) await pTabsSendMessage(tabId, { action: 'force_check', reason: 'tab_activated' });
  })());
});
// 알림 클릭 시 해당 탭으로 이동
chrome.notifications.onClicked.addListener((notificationId) => {
  let tabId = null;
  const target = notificationTargets[notificationId];
  if (target?.type === 'single' && typeof target.tabId === 'number') {
    tabId = target.tabId;
  } else {
    const match = String(notificationId || '').match(/^ready_ai_single_(\d+)_/);
    if (match) tabId = parseInt(match[1], 10);
  }
  if (!Number.isFinite(tabId)) return;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    chrome.tabs.update(tabId, { active: true });
    if (typeof tab.windowId === 'number') {
      chrome.windows.update(tab.windowId, { focused: true });
    }
  });
  // 요구사항: 탭을 여는 것만으로는 ⚪를 없애지 않는다.
  // (클릭/스크롤로만 🟢로 전환)
});
chrome.notifications.onClosed.addListener((notificationId) => {
  delete notificationTargets[notificationId];
});
// 탭 닫힘 정리
chrome.tabs.onRemoved.addListener((tabId) => {
  clearCustomTabTitleForTab(tabId);
  delete tabMetaCache[tabId];
  delete actionStateCache[tabId];
  const hadTrackedState = !!tabStates[tabId];
  const wasOrange = tabStates[tabId]?.status === 'ORANGE';
  const prevOrangeCount = wasOrange ? getOrangeTabCount() : 0;
  delete tabStates[tabId];
  delete frameStates[tabId];
  if (hadTrackedState) bumpDashboardVersion();
  if (wasOrange) handleOrangeWaveChange(prevOrangeCount, getOrangeTabCount(), { cancelWave: true });
  if (hadTrackedState) ensureSteeringQueueProbeAlarm();
});
function isMonitoredUrl(url) {
  if (!url || !(url.startsWith('http://') || url.startsWith('https://'))) return false;
  const sitesApi = globalThis?.ReadyAi?.sites;
  if (!sitesApi?.resolveSiteFromConfig) return true; // fallback
  try {
    const site = sitesApi.resolveSiteFromConfig(url, _siteConfigCache.enabledSites, _siteConfigCache.customSites);
    return !!site;
  } catch (_) {
    return true;
  }
}
function purgeDisabledTabs() {
  chrome.tabs.query({}, (tabs) => {
    let removedOrange = false;
    let removedAny = false;
    let prevOrangeCount = getOrangeTabCount();
    for (const t of tabs) {
      if (!t?.id) continue;
      if (!tabStates[t.id]) continue;
      const url = t.url || '';
      if (!url) continue;
      if (isMonitoredUrl(url)) continue;
      // 더 이상 등록된 사이트가 아니면 상태 정리 + 아이콘 연두색으로
      if (tabStates[t.id]?.status === 'ORANGE') removedOrange = true;
      removedAny = true;
      delete tabStates[t.id];
      delete frameStates[t.id];
      updateIcon(t.id);
    }
    if (removedAny) bumpDashboardVersion();
    if (removedOrange) handleOrangeWaveChange(prevOrangeCount, getOrangeTabCount(), { cancelWave: true });
    if (removedAny) ensureSteeringQueueProbeAlarm();
  });
}
async function kickAllTabs(reason) {
  getSiteConfig(async () => {
    const tabs = await pTabsQuery({});
    let seeded = false;
    for (const t of tabs) {
      if (!t || typeof t.id !== 'number') continue;
      const url = t.url || '';
      const site = resolveSiteForUrl(url);
      if (!site) continue; // 등록/활성된 사이트만
      // 상태가 비어 있으면 최소 WHITE(표시는 연두색)라도 찍어서 "완전 공백"을 방지
      if (!tabStates[t.id]) {
        tabStates[t.id] = {
          status: 'WHITE',
          platform: site.key,
          siteName: site.name,
          windowId: t.windowId,
          lastSeenAt: Date.now(),
          lastUpdateAt: Date.now(),
        };
        seeded = true;
        updateIcon(t.id);
      }
      // content가 없으면 주입해서 title 뱃지도 복구
      safeActionCall(ensureContentScripts(t));
      safeActionCall(pTabsSendMessage(t.id, { action: 'force_check', reason: reason || 'kick' }));
    }
    if (seeded) bumpDashboardVersion();
  });
}
try {
  chrome.runtime.onStartup.addListener(() => {
    safeActionCall(kickAllTabs('onStartup'));
  });
} catch (_) {}
try {
  chrome.runtime.onInstalled.addListener(() => {
    safeActionCall(kickAllTabs('onInstalled'));
  });
} catch (_) {}
safeActionCall(kickAllTabs('sw_init'));
