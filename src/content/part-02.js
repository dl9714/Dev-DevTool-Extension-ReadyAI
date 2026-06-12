function applyDesiredDocumentTitle(force = false) {
  if (!monitoring) return;
  if (!IS_TOP_FRAME) return;
  if (!isChatGptSafeMode()) publishTitleGuardState({ force });
  const currentTitle = String(document.title || '');
  const targetTitle = computeDesiredDocumentTitle(currentTitle);
  if (currentTitle === targetTitle) return;
  titleSyncMuted = true;
  try {
    document.title = targetTitle;
  } catch (_) {}
  if (titleSyncApplyTimer) {
    try { clearTimeout(titleSyncApplyTimer); } catch (_) {}
  }
  titleSyncApplyTimer = setTimeout(() => {
    titleSyncMuted = false;
    titleSyncApplyTimer = null;
  }, 0);
}
function queueDesiredDocumentTitleSync(force = false) {
  if (!monitoring) return;
  if (!IS_TOP_FRAME) return;
  if (!isChatGptSafeMode()) publishTitleGuardState({ force });
  titleSyncQueuedForce = titleSyncQueuedForce || !!force;
  if (titleSyncQueued) return;
  titleSyncQueued = true;
  Promise.resolve().then(() => {
    const shouldForce = titleSyncQueuedForce;
    titleSyncQueuedForce = false;
    titleSyncQueued = false;
    applyDesiredDocumentTitle(shouldForce);
  });
}
function getTitleBadgeStabilityIntervalMs() {
  return document.hidden ? 220 : 80;
}
function armTitleBadgeStabilityWindow(ms = 1800) {
  if (isChatGptSafeMode()) return;
  if (!monitoring) return;
  if (!IS_TOP_FRAME) return;
  if (!titleBadgeEnabled) return;
  titleBadgeStabilityUntil = Math.max(titleBadgeStabilityUntil || 0, Date.now() + Math.max(200, ms));
  if (titleBadgeStabilityTimer) return;
  const tick = () => {
    titleBadgeStabilityTimer = null;
    if (!monitoring || !IS_TOP_FRAME || !titleBadgeEnabled) return;
    applyDesiredDocumentTitle();
    if (Date.now() < titleBadgeStabilityUntil) {
      titleBadgeStabilityTimer = setTimeout(tick, getTitleBadgeStabilityIntervalMs());
    }
  };
  titleBadgeStabilityTimer = setTimeout(tick, 0);
}
function clearTitleBadgeStabilityWindow() {
  titleBadgeStabilityUntil = 0;
  if (titleBadgeStabilityTimer) {
    try { clearTimeout(titleBadgeStabilityTimer); } catch (_) {}
    titleBadgeStabilityTimer = null;
  }
}
function getTitleGuardPrefix() {
  if (!titleBadgeEnabled) return '';
  const badge = TITLE_BADGE[getTitleBadgeStateKey()] || TITLE_BADGE.WHITE;
  const countGlyph = getTitleBadgeCountGlyph();
  return `${badge}${countGlyph}`.trim();
}
function markTitleGuardInstalled(seq = 0) {
  titleGuardInstalled = true;
  titleGuardInstallInFlight = false;
  if (Number(seq) > 0) {
    titleGuardLastAckSeq = Math.max(titleGuardLastAckSeq || 0, Number(seq) || 0);
    if (titleGuardLastAckSeq >= titleGuardStateSeq && titleGuardStateRetryTimer) {
      try { clearTimeout(titleGuardStateRetryTimer); } catch (_) {}
      titleGuardStateRetryTimer = null;
      titleGuardStateRetryUntil = 0;
    }
  }
  if (titleGuardInstallRetryTimer) {
    try { clearTimeout(titleGuardInstallRetryTimer); } catch (_) {}
    titleGuardInstallRetryTimer = null;
  }
}
function ensureTitleGuardMessageBridge() {
  if (!IS_TOP_FRAME) return;
  if (titleGuardBridgeBound) return;
  titleGuardBridgeBound = true;
  try {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.source !== 'Ready_Ai') return;
      if (data.type === 'ready_ai_title_guard_ready') {
        titleGuardVersion = Math.max(titleGuardVersion || 0, Number(data.guardVersion) || 0);
        markTitleGuardInstalled();
        publishTitleGuardState({ force: titleGuardLastAckSeq < titleGuardStateSeq || titleGuardStateSeq <= 0 });
        return;
      }
      if (data.type === 'ready_ai_title_guard_ack') {
        markTitleGuardInstalled(data.seq || 0);
      }
    }, false);
  } catch (_) {}
}
function requestTitleGuardInstall() {
  if (isChatGptSafeMode()) return;
  if (!IS_TOP_FRAME) return;
  ensureTitleGuardMessageBridge();
  if (titleGuardInstalled || titleGuardInstallInFlight) return;
  titleGuardInstallRequested = true;
  titleGuardInstallInFlight = true;
  try {
    chrome.runtime.sendMessage({ action: 'ensure_title_guard' }, (resp) => {
      const ok = !!resp?.ok && !chrome.runtime.lastError;
      titleGuardInstallInFlight = false;
      if (ok) {
        markTitleGuardInstalled();
        publishTitleGuardState({ force: true });
        return;
      }
      scheduleTitleGuardInstallRetry();
    });
  } catch (_) {
    titleGuardInstallInFlight = false;
    scheduleTitleGuardInstallRetry();
  }
}
function scheduleTitleGuardInstallRetry() {
  if (!monitoring || !IS_TOP_FRAME || titleGuardInstalled) return;
  if (titleGuardInstallRetryTimer) return;
  titleGuardInstallRetryTimer = setTimeout(() => {
    titleGuardInstallRetryTimer = null;
    titleGuardInstallRequested = false;
    requestTitleGuardInstall();
  }, 900);
}
function scheduleTitleGuardStateRetry() {
  if (!monitoring || !IS_TOP_FRAME || !titleBadgeEnabled) return;
  if (titleGuardLastAckSeq >= titleGuardStateSeq) return;
  if (!titleGuardStateRetryUntil) titleGuardStateRetryUntil = Date.now() + 5000;
  if (titleGuardStateRetryTimer) return;
  titleGuardStateRetryTimer = setTimeout(() => {
    titleGuardStateRetryTimer = null;
    if (!monitoring || !IS_TOP_FRAME || !titleBadgeEnabled) return;
    if (titleGuardLastAckSeq >= titleGuardStateSeq) {
      titleGuardStateRetryUntil = 0;
      return;
    }
    if (Date.now() > titleGuardStateRetryUntil) {
      titleGuardStateRetryUntil = 0;
      titleGuardInstalled = false;
      titleGuardInstallInFlight = false;
      titleGuardStateSignature = '';
      requestTitleGuardInstall();
      return;
    }
    publishTitleGuardState({ force: true });
  }, titleGuardInstalled ? 180 : 320);
}
function publishTitleGuardState(options = {}) {
  if (isChatGptSafeMode()) return;
  if (!IS_TOP_FRAME) return;
  ensureTitleGuardMessageBridge();
  const enabled = Object.prototype.hasOwnProperty.call(options, 'enabled')
    ? !!options.enabled
    : !!(monitoring && titleBadgeEnabled);
  const prefix = enabled ? getTitleGuardPrefix() : '';
  const customBaseTitle = enabled && hasCustomTabTitle() ? normalizeCustomTabTitle(customTabTitle) : '';
  const fallbackBaseTitle = enabled ? getDesiredBaseTitle(getCleanDocumentTitleText()) : '';
  const payload = {
    source: 'Ready_Ai',
    type: 'ready_ai_title_guard_state',
    enabled,
    prefix,
    customBaseTitle,
    fallbackBaseTitle,
  };
  const signature = JSON.stringify(payload);
  if (!options.force && signature === titleGuardStateSignature) {
    if (enabled && titleGuardLastAckSeq < titleGuardStateSeq) scheduleTitleGuardStateRetry();
    return;
  }
  if (signature !== titleGuardStateSignature || titleGuardStateSeq <= 0) {
    titleGuardStateSeq += 1;
    titleGuardLastAckSeq = Math.min(titleGuardLastAckSeq || 0, titleGuardStateSeq - 1);
    titleGuardStateRetryUntil = 0;
    titleGuardStateSignature = signature;
  }
  payload.seq = titleGuardStateSeq;
  try { window.postMessage(payload, '*'); } catch (_) {}
  if (!enabled) {
    if (titleGuardStateRetryTimer) {
      try { clearTimeout(titleGuardStateRetryTimer); } catch (_) {}
      titleGuardStateRetryTimer = null;
    }
    titleGuardStateRetryUntil = 0;
    return;
  }
  if (enabled) scheduleTitleGuardStateRetry();
  if (enabled && !titleGuardInstalled) scheduleTitleGuardInstallRetry();
}
function syncNativePageTitleFromDocumentTitle() {
  if (hasCustomTabTitle()) return;
  const cleanTitle = getCleanDocumentTitleText();
  const normalizedClean = normalizeCustomTabTitle(cleanTitle);
  const rememberedCustom = normalizeCustomTabTitle(lastCustomTabTitle);
  if (!normalizedClean || normalizedClean !== rememberedCustom) {
    nativePageTitle = cleanTitle || nativePageTitle || activeSite?.name || 'AI';
    if (normalizedClean && normalizedClean !== rememberedCustom) lastCustomTabTitle = '';
  }
}
function reconcileDesiredDocumentTitleFromMutation() {
  if (!monitoring) return;
  if (!IS_TOP_FRAME) return;
  syncNativePageTitleFromDocumentTitle();
  const currentTitle = String(document.title || '');
  const targetTitle = computeDesiredDocumentTitle(currentTitle);
  if (currentTitle === targetTitle) return;
  queueDesiredDocumentTitleSync(true);
  if (titleBadgeEnabled) {
    armTitleBadgeStabilityWindow(titleSyncMuted ? 1200 : 1800);
  }
}
function ensureTitleSyncObserver() {
  if (isChatGptSafeMode()) return;
  if (!IS_TOP_FRAME) return;
  if (titleSyncObserver) return;
  const target = document.head || document.documentElement;
  if (!target) return;
  titleSyncObserver = new MutationObserver(() => {
    reconcileDesiredDocumentTitleFromMutation();
  });
  try {
    titleSyncObserver.observe(target, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  } catch (_) {
    titleSyncObserver = null;
  }
}
function disconnectTitleSyncObserver() {
  if (!titleSyncObserver) return;
  try { titleSyncObserver.disconnect(); } catch (_) {}
  titleSyncObserver = null;
}
function updateTitleBadge() {
  if (!isChatGptSafeMode()) requestTitleGuardInstall();
  applyDesiredDocumentTitle();
}
function getTitleBadgeUiSyncSignature() {
  return JSON.stringify({
    enabled: !!titleBadgeEnabled,
    countEnabled: !!titleBadgeCountEnabled,
    state: getTitleBadgeStateKey(),
    queue: titleBadgeCountEnabled ? getTitleBadgeCountGlyph() : '',
    custom: normalizeCustomTabTitle(customTabTitle),
    native: normalizeCustomTabTitle(nativePageTitle || activeSite?.name || 'AI'),
  });
}
function syncTitleBadgeFromUiRender(force = false) {
  if (!monitoring || !IS_TOP_FRAME) return;
  const now = Date.now();
  const signature = getTitleBadgeUiSyncSignature();
  const sameSignature = signature === titleBadgeLastUiSyncSignature;
  const minGap = document.hidden ? 6000 : 3000;
  if (!force && sameSignature && titleBadgeLastUiSyncAt && now - titleBadgeLastUiSyncAt < minGap) return;
  titleBadgeLastUiSyncSignature = signature;
  titleBadgeLastUiSyncAt = now;
  updateTitleBadge();
}
function syncTitleBadgeFromStatusLoop(force = false) {
  if (isChatGptSafeMode()) return;
  if (!monitoring || !IS_TOP_FRAME) return;
  const now = Date.now();
  const minGap = document.hidden ? 2500 : 1200;
  if (!force && titleBadgeLastLoopSyncAt && now - titleBadgeLastLoopSyncAt < minGap) return;
  titleBadgeLastLoopSyncAt = now;
  applyDesiredDocumentTitle();
}
function clearTitleBadge() {
  if (!IS_TOP_FRAME) return;
  if (!isChatGptSafeMode()) publishTitleGuardState({ enabled: false, force: true });
  const cleanTitle = hasCustomTabTitle() ? normalizeCustomTabTitle(customTabTitle) : getDesiredBaseTitle(getCleanDocumentTitleText());
  try { document.title = cleanTitle; } catch (_) {}
}
function detectChatGptGeneratingLight() {
  if (!isChatGptSafeMode()) return false;
  const selector = typeof CHATGPT_STOP_SELECTOR === 'string'
    ? CHATGPT_STOP_SELECTOR
    : '[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="stop"],button[aria-label*="중지"],button[data-testid*="stop"]';
  let buttons = [];
  try { buttons = Array.from(document.querySelectorAll(selector)).slice(-8); } catch (_) { buttons = []; }
  return buttons.some((btn) => isVisible(btn) && isEnabledButtonLike(btn));
}
function sendChatGptLightStatusUpdate() {
  if (!activeSite || !isChatGptSafeMode()) return;
  try {
    chrome.runtime.sendMessage({
      action: 'status_update',
      platform: activeSite.key,
      siteName: activeSite.name,
      isGenerating,
    });
    hasSentInitialState = true;
    _lastHeartbeatAt = Date.now();
  } catch (_) {}
}
function runChatGptLightTitleBadgeSync() {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  syncNativePageTitleFromDocumentTitle();
  applyDesiredDocumentTitle(true);
}
function ensureChatGptLightTitleObserver() {
  if (!isChatGptSafeMode() || !IS_TOP_FRAME || chatGptLightTitleObserver) return;
  const scheduleSync = () => {
    if (chatGptLightTitleObserverQueued) return;
    chatGptLightTitleObserverQueued = true;
    Promise.resolve().then(() => {
      chatGptLightTitleObserverQueued = false;
      if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
      applyDesiredDocumentTitle(true);
    });
  };
  try {
    chatGptLightTitleObserver = new MutationObserver(() => scheduleSync());
    const target = document.head || document.querySelector('title') || document.documentElement;
    if (!target) {
      chatGptLightTitleObserver = null;
      return;
    }
    chatGptLightTitleObserver.observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  } catch (_) {
    chatGptLightTitleObserver = null;
  }
}
function disconnectChatGptLightTitleObserver() {
  if (!chatGptLightTitleObserver) return;
  try { chatGptLightTitleObserver.disconnect(); } catch (_) {}
  chatGptLightTitleObserver = null;
  chatGptLightTitleObserverQueued = false;
}
function scheduleChatGptLightTitleBadgeSync(delay = 0) {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  if (chatGptLightTitleBadgeTimer) {
    try { clearTimeout(chatGptLightTitleBadgeTimer); } catch (_) {}
    chatGptLightTitleBadgeTimer = null;
  }
  chatGptLightTitleBadgeTimer = setTimeout(() => {
    chatGptLightTitleBadgeTimer = null;
    runChatGptLightTitleBadgeSync();
  }, Math.max(0, Number(delay) || 0));
}
function armChatGptLightTitleBadgeBurst() {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  clearChatGptLightTitleBadgeBurst();
  const delays = [0, 80, 240, 600, 1200, 2400, 4800];
  for (const delay of delays) {
    const timer = setTimeout(() => runChatGptLightTitleBadgeSync(), delay);
    chatGptLightTitleBadgeBurstTimers.push(timer);
  }
}
function clearChatGptLightTitleBadgeBurst() {
  if (!chatGptLightTitleBadgeBurstTimers.length) return;
  for (const timer of chatGptLightTitleBadgeBurstTimers) {
    try { clearTimeout(timer); } catch (_) {}
  }
  chatGptLightTitleBadgeBurstTimers = [];
}
function startChatGptLightTitleBadgeKeepAlive() {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  ensureChatGptLightTitleObserver();
  if (chatGptLightTitleBadgeKeepAliveTimer) return;
  const tick = () => {
    chatGptLightTitleBadgeKeepAliveTimer = null;
    if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
    runChatGptLightTitleBadgeSync();
    chatGptLightTitleBadgeKeepAliveTimer = setTimeout(tick, document.hidden ? 7000 : 1600);
  };
  chatGptLightTitleBadgeKeepAliveTimer = setTimeout(tick, 900);
}
function stopChatGptLightTitleBadgeKeepAlive() {
  disconnectChatGptLightTitleObserver();
  if (chatGptLightTitleBadgeTimer) {
    try { clearTimeout(chatGptLightTitleBadgeTimer); } catch (_) {}
    chatGptLightTitleBadgeTimer = null;
  }
  if (chatGptLightTitleBadgeKeepAliveTimer) {
    try { clearTimeout(chatGptLightTitleBadgeKeepAliveTimer); } catch (_) {}
    chatGptLightTitleBadgeKeepAliveTimer = null;
  }
  clearChatGptLightTitleBadgeBurst();
}
function setChatGptLightGenerating(nextGenerating, options = {}) {
  if (!isChatGptSafeMode() || !monitoring) return;
  const next = !!nextGenerating;
  if (next) {
    const observed = Object.prototype.hasOwnProperty.call(options, 'observed')
      ? !!options.observed
      : detectChatGptGeneratingLight();
    chatGptLightGenerationStartedAt = Date.now();
    chatGptLightGenerationWatchUntil = Date.now() + 10 * 60 * 1000;
    steeringLastCompletionAt = 0;
    clearSteeringAutoSendTimer();
    clearSteeringSendLock();
    if (observed) {
      clearSteeringAwaitingResponseStart();
      markSteeringGenerationObserved();
    }
    if (!isGenerating || completionStatus === 'completed') {
      isGenerating = true;
      completionStatus = 'idle';
      updateTitleBadge();
      updateSteeringUi();
      sendChatGptLightStatusUpdate();
    }
    scheduleChatGptLightCompletionWatch(500);
    return;
  }
  if (isGenerating) {
    isGenerating = false;
    completionStatus = 'completed';
    steeringLastCompletionAt = Date.now();
    const canAdvanceSteeringQueue = !steeringAwaitingTurnCompletion || steeringObservedGenerationSinceSend;
    if (steeringAwaitingTurnCompletion && steeringObservedGenerationSinceSend) {
      clearSteeringTurnCompletionWait();
    }
    if (canAdvanceSteeringQueue) {
      scheduleSteeringQueueProcessing(STEERING_AUTO_SEND_DELAY_MS);
    }
    updateTitleBadge();
    updateSteeringUi();
    sendChatGptLightStatusUpdate();
  } else {
    updateTitleBadge();
  }
}
function scheduleChatGptLightCompletionWatch(delay = 900) {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  if (chatGptLightCompletionWatchTimer) {
    try { clearTimeout(chatGptLightCompletionWatchTimer); } catch (_) {}
    chatGptLightCompletionWatchTimer = null;
  }
  chatGptLightCompletionWatchTimer = setTimeout(() => {
    chatGptLightCompletionWatchTimer = null;
    if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
    const now = Date.now();
    const generatingNow = detectChatGptGeneratingLight();
    if (generatingNow) {
      setChatGptLightGenerating(true, { observed: true });
      scheduleChatGptLightCompletionWatch(document.hidden ? 1800 : 900);
      return;
    }
    if (isGenerating && now - chatGptLightGenerationStartedAt >= 2200) {
      const awaitingUnobservedSteeringTurn = !!(
        steeringAwaitingTurnCompletion
        && !steeringObservedGenerationSinceSend
      );
      if (awaitingUnobservedSteeringTurn && now < chatGptLightGenerationWatchUntil) {
        scheduleChatGptLightCompletionWatch(document.hidden ? 1800 : 900);
        return;
      }
      setChatGptLightGenerating(false);
      return;
    }
    if (now < chatGptLightGenerationWatchUntil) {
      scheduleChatGptLightCompletionWatch(700);
    }
  }, Math.max(0, Number(delay) || 0));
}
function clearChatGptLightCompletionWatch() {
  if (chatGptLightCompletionWatchTimer) {
    try { clearTimeout(chatGptLightCompletionWatchTimer); } catch (_) {}
    chatGptLightCompletionWatchTimer = null;
  }
  chatGptLightGenerationStartedAt = 0;
  chatGptLightGenerationWatchUntil = 0;
}
function isChatGptLightSendClick(event) {
  const target = event?.target;
  if (!target || isSteeringTarget(target)) return false;
  let button = null;
  try { button = target.closest?.('button, [role="button"], input[type="submit"]') || null; } catch (_) { button = null; }
  if (!button) return false;
  const aria = (button.getAttribute?.('aria-label') || '').trim();
  const title = (button.getAttribute?.('title') || '').trim();
  const testId = (button.getAttribute?.('data-testid') || '').trim();
  const type = (button.getAttribute?.('type') || '').trim();
  const text = (button.innerText || button.textContent || '').trim();
  const hay = `${aria} ${title} ${testId} ${type} ${text}`.trim();
  if (/(stop|중지|cancel|취소|abort|voice|mic|마이크|upload|첨부|attachment|plus|더보기)/i.test(hay)) return false;
  if (/send|전송|보내기|submit|arrow-up|paper-plane/i.test(hay)) return true;
  try {
    const activeSend = typeof getActiveSendButton === 'function' ? getActiveSendButton() : null;
    return !!(activeSend && (button === activeSend || button.contains(activeSend) || activeSend.contains(button)));
  } catch (_) {
    return false;
  }
}
function isChatGptLightSendKey(event) {
  if (!event || event.key !== 'Enter') return false;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return false;
  if (isSteeringTarget(event.target)) return false;
  try {
    if (typeof isEditableInteractionTarget === 'function') return isEditableInteractionTarget(event.target);
  } catch (_) {}
  return false;
}
function noteChatGptLightPossibleSend(event) {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  const isSend = event?.type === 'click' ? isChatGptLightSendClick(event) : isChatGptLightSendKey(event);
  if (!isSend) return;
  armChatGptLightTitleBadgeBurst();
  setTimeout(() => setChatGptLightGenerating(true, { observed: false }), 120);
}
function bindChatGptLightTitleBadgeTriggers() {
  if (chatGptLightTitleBadgeTriggersBound || !IS_TOP_FRAME) return;
  chatGptLightTitleBadgeTriggersBound = true;
  document.addEventListener('click', (event) => {
    if (!isChatGptSafeMode()) return;
    scheduleChatGptLightTitleBadgeSync(60);
    noteChatGptLightPossibleSend(event);
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!isChatGptSafeMode()) return;
    scheduleChatGptLightTitleBadgeSync(60);
    noteChatGptLightPossibleSend(event);
  }, true);
  document.addEventListener('input', () => {
    if (!isChatGptSafeMode()) return;
    scheduleChatGptLightTitleBadgeSync(120);
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (!isChatGptSafeMode()) return;
    armChatGptLightTitleBadgeBurst();
    startChatGptLightTitleBadgeKeepAlive();
  });
  window.addEventListener('pageshow', () => {
    if (!isChatGptSafeMode()) return;
    armChatGptLightTitleBadgeBurst();
    startChatGptLightTitleBadgeKeepAlive();
  });
}
var STEERING_AUTO_SEND_DELAY_MS = 1000;
var STEERING_TURN_WATCHDOG_VISIBLE_MS = 12000;
var STEERING_TURN_WATCHDOG_HIDDEN_MS = 20000;
var READY_AI_CONTENT_VERSION = '2026-06-12.7-followup-wait-guard';
try {
  var existingSteeringHost = document.getElementById('ready-ai-steering-host');
  if (existingSteeringHost) existingSteeringHost.remove();
} catch (_) {}
var steeringHost = null;
var steeringRoot = null;
var steeringRefs = null;
var steeringPanelOpen = false;
var STEERING_STORAGE_KEYS = Object.freeze({
  ENABLED: 'steeringEnabled',
  THEME: 'steeringTheme',
  LAUNCHER_VISIBLE: 'steeringLauncherVisible',
  AUTO_FOCUS_INPUT: 'steeringAutoFocusInput',
  CLOSE_AFTER_SEND: 'steeringCloseAfterSend',
  QUEUE_COUNT_VISIBLE: 'steeringQueueCountVisible',
  TEMPLATES: 'steeringTemplates',
  ADVANCED_ENABLED: 'steeringAdvancedEnabled',
  NEW_CHAT_TAB_COUNT: 'steeringNewChatTabCount',
});
var TITLE_BADGE_STORAGE_KEYS = Object.freeze({
  ENABLED: 'titleBadgeEnabled',
  COUNT_ENABLED: 'titleBadgeCountEnabled',
});
var CUSTOM_TAB_TITLE_MAX_LENGTH = 80;
var STEERING_THEME = Object.freeze({
  DARK: 'dark',
  LIGHT: 'light',
});
var steeringEnabled = true;
var steeringTheme = STEERING_THEME.DARK;
var steeringLauncherVisible = true;
var steeringAutoFocusInput = true;
var steeringCloseAfterSend = false;
var steeringQueueCountVisible = true;
var steeringTemplates = [];
var steeringAdvancedEnabled = false;
var steeringNewChatTabCount = 3;
var titleBadgeEnabled = true;
var titleBadgeCountEnabled = true;
var customTabTitle = '';
var lastCustomTabTitle = '';
var nativePageTitle = '';
var titleSyncObserver = null;
var titleSyncApplyTimer = null;
var titleSyncMuted = false;
var titleSyncQueued = false;
var titleSyncQueuedForce = false;
var titleBadgeStabilityTimer = null;
var titleBadgeStabilityUntil = 0;
var titleGuardInstallRequested = false;
var titleGuardInstallInFlight = false;
var titleGuardInstalled = false;
var titleGuardInstallRetryTimer = null;
var titleGuardBridgeBound = false;
var titleGuardStateSignature = '';
var titleGuardStateSeq = 0;
var titleGuardLastAckSeq = 0;
var titleGuardStateRetryTimer = null;
var titleGuardStateRetryUntil = 0;
var titleGuardVersion = 0;
var titleBadgeLastLoopSyncAt = 0;
var titleBadgeLastUiSyncAt = 0;
var titleBadgeLastUiSyncSignature = '';
var chatGptLightTitleBadgeTimer = null;
var chatGptLightTitleBadgeBurstTimers = [];
var chatGptLightTitleBadgeKeepAliveTimer = null;
var chatGptLightTitleObserver = null;
var chatGptLightTitleObserverQueued = false;
var chatGptLightTitleBadgeTriggersBound = false;
var chatGptLightCompletionWatchTimer = null;
var chatGptLightGenerationStartedAt = 0;
var chatGptLightGenerationWatchUntil = 0;
var steeringQueue = [];
var steeringQueueSeq = 1;
var steeringAutoSendTimer = null;
var steeringSendLock = false;
var steeringSendLockTimer = null;
var steeringProcessing = false;
var STEERING_ATTACHMENT_LIMIT = 8;
var STEERING_FILE_MAX_BYTES = 50 * 1024 * 1024;
var STEERING_IMAGE_LIMIT = STEERING_ATTACHMENT_LIMIT; // 기존 내부 호출 호환용
var STEERING_IMAGE_MAX_BYTES = STEERING_FILE_MAX_BYTES;
var STEERING_IMAGE_OPTIMIZE_TARGET_BYTES = 6 * 1024 * 1024;
var STEERING_IMAGE_OPTIMIZE_MAX_DIMENSION = 2400;
var steeringAttachments = [];
var steeringAttachmentSeq = 1;
var steeringPreviewAttachmentId = null;
var steeringSuppressAcknowledgeUntil = 0;
var steeringLastReportedQueueCount = null;
var steeringLastCompletionAt = 0;
var steeringAwaitingResponseStart = false;
var steeringAwaitingResponseTimer = null;
var steeringAwaitingTurnCompletion = false;
var steeringObservedGenerationSinceSend = false;
var steeringTurnCompletionWatchdogTimer = null;
var steeringTurnCompletionWatchdogStartedAt = 0;
var steeringAttachmentRenderSignature = '';
var steeringQueueRenderSignature = '';
var steeringPreviewRenderSignature = '';
var steeringTemplateRenderSignature = '';
var steeringUiRafId = 0;
var steeringLastPositionSignature = '';
var steeringAppliedThemeSignature = '';
var steeringConversationTurnsCacheAt = 0;
var steeringConversationTurnsCacheValue = false;
var steeringDraftText = '';
var steeringNewChatSendPending = false;
var steeringSessionSiteKey = '';
var steeringQueueEditingId = null;
var steeringQueueEditingText = '';
var steeringDragActive = false;
var steeringDragHideTimer = null;
var steeringDropPointerGuardUntil = 0;
function setSteeringTextIfChanged(el, value) {
  if (!el) return;
  const nextValue = String(value ?? '');
  if (el.textContent !== nextValue) el.textContent = nextValue;
}
function setSteeringValueIfChanged(el, value) {
  if (!el) return;
  const nextValue = String(value ?? '');
  if (String(el.value ?? '') !== nextValue) el.value = nextValue;
}
function setSteeringDisplayIfChanged(el, value) {
  if (!el) return;
  const nextValue = String(value || '');
  if (el.style.display !== nextValue) el.style.display = nextValue;
}
function setSteeringDisabledIfChanged(el, disabled) {
  if (!el) return;
  const nextValue = !!disabled;
  if (el.disabled !== nextValue) el.disabled = nextValue;
}
function setSteeringCheckedIfChanged(el, checked) {
  if (!el) return;
  const nextValue = !!checked;
  if (el.checked !== nextValue) el.checked = nextValue;
}
function setSteeringDatasetIfChanged(el, key, value) {
  if (!el || !key) return;
  const nextValue = String(value ?? '');
  if (el.dataset[key] !== nextValue) el.dataset[key] = nextValue;
}
function setSteeringClassToggleIfChanged(el, className, enabled) {
  if (!el || !className) return;
  const nextValue = !!enabled;
  if (el.classList.contains(className) !== nextValue) el.classList.toggle(className, nextValue);
}
function setSteeringDraftText(value, options = {}) {
  steeringDraftText = String(value || '');
  if (options.syncInput && steeringRefs?.input && String(steeringRefs.input.value || '') !== steeringDraftText) {
    try { steeringRefs.input.value = steeringDraftText; } catch (_) {}
  }
}
function syncSteeringDraftFromInput() {
  setSteeringDraftText(steeringRefs?.input?.value || '');
}
function restoreSteeringDraftToInput() {
  const input = steeringRefs?.input;
  if (!input) return;
  const desired = String(steeringDraftText || '');
  const current = String(input.value || '');
  if (current === desired) return;
  const inputActive = steeringRoot?.activeElement === input;
  if (inputActive && current) return;
  try { input.value = desired; } catch (_) {}
}
function isSteeringTargetNode(target) {
  if (!target) return false;
  if (target === steeringHost) return true;
  try {
    if (steeringHost?.contains?.(target)) return true;
  } catch (_) {}
  try {
    if (target?.getRootNode?.() === steeringRoot) return true;
  } catch (_) {}
  return false;
}
function setSteeringDragActive(active) {
  const next = !!active;
  if (steeringDragHideTimer) {
    try { clearTimeout(steeringDragHideTimer); } catch (_) {}
    steeringDragHideTimer = null;
  }
  if (next) {
    steeringDragActive = true;
    steeringRefs?.attachmentWrap?.classList.add('dragging');
    if (steeringRefs?.dropShield) steeringRefs.dropShield.hidden = false;
    return;
  }
  steeringDragHideTimer = setTimeout(() => {
    steeringDragActive = false;
    steeringRefs?.attachmentWrap?.classList.remove('dragging');
    if (steeringRefs?.dropShield) steeringRefs.dropShield.hidden = true;
    steeringDragHideTimer = null;
  }, 60);
}
function armSteeringDropPointerGuard(duration = 360) {
  steeringDropPointerGuardUntil = Date.now() + Math.max(120, Number(duration) || 0);
}
function suppressFollowupPointerAfterSteeringDrop(event) {
  if (Date.now() > steeringDropPointerGuardUntil) return;
  if (isSteeringTargetNode(event?.target)) return;
  try { event.preventDefault(); } catch (_) {}
  try { event.stopPropagation(); } catch (_) {}
  try { event.stopImmediatePropagation?.(); } catch (_) {}
}
function getSteeringQueueEditingItem() {
  if (steeringQueueEditingId == null) return null;
  return steeringQueue.find((item) => item?.id === steeringQueueEditingId) || null;
}
function beginSteeringQueueEdit(itemId) {
  const item = steeringQueue.find((entry) => entry?.id === itemId);
  if (!item) return false;
  steeringQueueEditingId = item.id;
  steeringQueueEditingText = String(item.text || '');
  updateSteeringUi();
  return true;
}
function syncSteeringQueueEditDraft(value) {
  steeringQueueEditingText = String(value || '');
}
function cancelSteeringQueueEdit(options = {}) {
  const hadEdit = steeringQueueEditingId != null;
  steeringQueueEditingId = null;
  steeringQueueEditingText = '';
  if (hadEdit && !options.silent) updateSteeringUi();
  return hadEdit;
}
function commitSteeringQueueEdit() {
  const item = getSteeringQueueEditingItem();
  if (!item) return false;
  const nextText = String(steeringQueueEditingText || '').trim();
  steeringQueue = steeringQueue.map((entry) => entry?.id === item.id ? { ...entry, text: nextText } : entry);
  cancelSteeringQueueEdit({ silent: true });
  setSteeringStatus(nextText ? '대기를 수정했습니다.' : (getSteeringItemAttachmentCount(item) ? '파일 첨부 대기를 수정했습니다.' : '빈 대기로 변경했습니다.'));
  updateSteeringUi();
  return true;
}
function syncSteeringQueueEditState() {
  if (steeringQueueEditingId == null) return;
  const item = getSteeringQueueEditingItem();
  if (item) return;
  steeringQueueEditingId = null;
  steeringQueueEditingText = '';
}
function resetSteeringSessionState(nextSiteKey = '') {
  steeringQueue = [];
  steeringLastReportedQueueCount = null;
  steeringProcessing = false;
  steeringPanelOpen = false;
  steeringQueueEditingId = null;
  steeringQueueEditingText = '';
  steeringConversationTurnsCacheAt = 0;
  steeringConversationTurnsCacheValue = false;
  clearSteeringTurnCompletionWait();
  setSteeringDraftText('');
  clearSteeringDraftAttachments({ keepFileInputValue: true });
  try { if (steeringRefs?.input) steeringRefs.input.value = ''; } catch (_) {}
  steeringSessionSiteKey = String(nextSiteKey || '');
}
function suppressComposerAcknowledge(ms = 1200) {
  steeringSuppressAcknowledgeUntil = Date.now() + Math.max(0, ms);
}
function isComposerAcknowledgeSuppressed() {
  return Date.now() < steeringSuppressAcknowledgeUntil;
}
function normalizeSteeringTheme(value) {
  return String(value || '').trim().toLowerCase() === STEERING_THEME.LIGHT ? STEERING_THEME.LIGHT : STEERING_THEME.DARK;
}
function normalizeSteeringNewChatTabCount(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(8, parsed));
}
function truncateSteeringText(value, max = 80) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}
function normalizeSteeringTemplate(item, index = 0) {
  if (typeof item === 'string') {
    const text = String(item || '').trim();
    if (!text) return null;
    return {
      id: `tpl_${index}_${text.slice(0, 16)}`,
      name: truncateSteeringText(`템플릿 ${index + 1}`, 24),
      text,
      tooltip: '',
    };
  }
  if (!item || typeof item !== 'object') return null;
  const text = String(item.text ?? item.content ?? '').trim();
  if (!text) return null;
  return {
    id: String(item.id || `tpl_${index}_${Date.now()}`),
    name: truncateSteeringText(item.name ?? item.title ?? item.label ?? `템플릿 ${index + 1}`, 24),
    text,
    tooltip: truncateSteeringText(item.tooltip ?? item.note ?? item.description ?? '', 160),
  };
}
function normalizeSteeringTemplates(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => normalizeSteeringTemplate(item, index)).filter(Boolean).slice(0, 20);
}
function getSteeringTemplateTooltip(template) {
  const parts = [];
  const name = String(template?.name || '').trim();
  const tooltip = String(template?.tooltip || '').trim();
  const text = String(template?.text || '').trim();
  if (name) parts.push(name);
  if (tooltip) parts.push(tooltip);
  if (text) parts.push(`문구: ${text}`);
  return parts.join('\n');
}
function loadSteeringPrefs(cb) {
  try {
    chrome.storage.local.get([
      STEERING_STORAGE_KEYS.ENABLED,
      STEERING_STORAGE_KEYS.THEME,
      STEERING_STORAGE_KEYS.LAUNCHER_VISIBLE,
      STEERING_STORAGE_KEYS.AUTO_FOCUS_INPUT,
      STEERING_STORAGE_KEYS.CLOSE_AFTER_SEND,
      STEERING_STORAGE_KEYS.QUEUE_COUNT_VISIBLE,
      STEERING_STORAGE_KEYS.TEMPLATES,
      STEERING_STORAGE_KEYS.ADVANCED_ENABLED,
      STEERING_STORAGE_KEYS.NEW_CHAT_TAB_COUNT,
      TITLE_BADGE_STORAGE_KEYS.ENABLED,
      TITLE_BADGE_STORAGE_KEYS.COUNT_ENABLED,
    ], (res) => {
      steeringEnabled = typeof res?.[STEERING_STORAGE_KEYS.ENABLED] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.ENABLED] : true;
      steeringTheme = normalizeSteeringTheme(res?.[STEERING_STORAGE_KEYS.THEME]);
      steeringLauncherVisible = typeof res?.[STEERING_STORAGE_KEYS.LAUNCHER_VISIBLE] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.LAUNCHER_VISIBLE] : true;
      steeringAutoFocusInput = typeof res?.[STEERING_STORAGE_KEYS.AUTO_FOCUS_INPUT] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.AUTO_FOCUS_INPUT] : true;
      steeringCloseAfterSend = typeof res?.[STEERING_STORAGE_KEYS.CLOSE_AFTER_SEND] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.CLOSE_AFTER_SEND] : false;
      steeringQueueCountVisible = typeof res?.[STEERING_STORAGE_KEYS.QUEUE_COUNT_VISIBLE] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.QUEUE_COUNT_VISIBLE] : true;
      steeringTemplates = normalizeSteeringTemplates(res?.[STEERING_STORAGE_KEYS.TEMPLATES]);
      steeringAdvancedEnabled = typeof res?.[STEERING_STORAGE_KEYS.ADVANCED_ENABLED] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.ADVANCED_ENABLED] : false;
      steeringNewChatTabCount = normalizeSteeringNewChatTabCount(res?.[STEERING_STORAGE_KEYS.NEW_CHAT_TAB_COUNT]);
      titleBadgeEnabled = typeof res?.[TITLE_BADGE_STORAGE_KEYS.ENABLED] === 'boolean' ? !!res[TITLE_BADGE_STORAGE_KEYS.ENABLED] : true;
      titleBadgeCountEnabled = typeof res?.[TITLE_BADGE_STORAGE_KEYS.COUNT_ENABLED] === 'boolean' ? !!res[TITLE_BADGE_STORAGE_KEYS.COUNT_ENABLED] : true;
      cb?.();
    });
  } catch (_) {
    steeringEnabled = true;
    steeringTheme = STEERING_THEME.DARK;
    steeringLauncherVisible = true;
    steeringAutoFocusInput = true;
    steeringCloseAfterSend = false;
    steeringQueueCountVisible = true;
    steeringTemplates = [];
    steeringAdvancedEnabled = false;
    steeringNewChatTabCount = 3;
    titleBadgeEnabled = true;
    titleBadgeCountEnabled = true;
    cb?.();
  }
}
