function markAsAcknowledged(event) {
  if (completionStatus !== 'completed' || isGenerating) return;
  if (isSteeringTarget(event?.target)) return;
  acknowledgeCompletion();
}
// =========================
// Monitor lifecycle (start/stop) - registered sites only
// =========================
var _observer = null;
var _handlersBound = false;
function bindHandlersOnce() {
  if (_handlersBound) return;
  _handlersBound = true;
  // 이벤트 리스너 등록
  // - focus/keydown으로는 절대 지우지 않는다.
  // - "클릭" 또는 "스크롤(휠/스크롤 이벤트)"로만 ⚪ -> 🟢
  document.addEventListener('click', markAsAcknowledged, true);
  document.addEventListener('scroll', markAsAcknowledged, true);
  document.addEventListener('wheel', markAsAcknowledged, { passive: true, capture: true });
  document.addEventListener('click', noteAiStudioPossibleRun, true);
  document.addEventListener('keydown', noteAiStudioPossibleRun, true);
  document.addEventListener('keydown', handleChatGptNativeComposerFollowupEnter, true);
  document.addEventListener('keydown', markTypingAcknowledged, true);
  document.addEventListener('input', markTypingAcknowledged, true);
  // 탭 활성/비활성 전환 시에도 상태 재평가(백그라운드 완료 감지 보강)
  document.addEventListener('visibilitychange', () => {
    ensurePolling(true);
    armTitleBadgeStabilityWindow(1800);
    scheduleCheck(true);
    wakeSteeringQueueAfterVisibilityRestore('visibility');
  });
  window.addEventListener('focus', () => {
    scheduleCheck(true);
    wakeSteeringQueueAfterVisibilityRestore('focus');
  });
  window.addEventListener('pageshow', () => {
    scheduleCheck(true);
    wakeSteeringQueueAfterVisibilityRestore('pageshow');
  });
}
// shadow DOM deep-scan / deep-observe는 Gemini 완료 감지 보강용이 핵심이라
// 기본은 Gemini에서만 켠다.
function shouldEnableDeepForSite(site) {
  const mode = site?.detection || site?.key || '';
  return mode === 'gemini' || site?.key === 'gemini';
}
function shouldObserveStatusAttributes(site) {
  const mode = site?.detection || site?.key || '';
  return mode !== 'chatgpt';
}
function bootstrapChatGptSafeModeTitleBadge() {
  clearTitleBadgeStabilityWindow();
  bindChatGptLightTitleBadgeTriggers();
  startChatGptLightTitleBadgeKeepAlive();
  loadSteeringPrefs(() => {
    requestCustomTabTitleSync();
    updateTitleBadge();
    armChatGptLightTitleBadgeBurst();
    sendChatGptLightStatusUpdate();
    updateSteeringUi();
  });
}
function startMonitoring(site) {
  if (!claimReadyAiContentOwnership('start_monitoring')) {
    stopMonitoring();
    return;
  }
  const nextSiteKey = String(site?.key || '');
  const chatGptSafeModeCandidate = nextSiteKey === 'chatgpt' || isChatGptSafeMode();
  if (monitoring && activeSite?.key === site?.key) {
    if (chatGptSafeModeCandidate) bootstrapChatGptSafeModeTitleBadge();
    return;
  }
  if (steeringSessionSiteKey && steeringSessionSiteKey !== nextSiteKey) {
    resetSteeringSessionState(nextSiteKey);
  } else if (!steeringSessionSiteKey) {
    steeringSessionSiteKey = nextSiteKey;
  }
  stopMonitoring();
  activeSite = site;
  monitoring = true;
  isGenerating = false;
  completionStatus = 'idle';
  clearAiStudioGenerationProbeBurst();
  hasSentInitialState = false;
  const chatGptSafeMode = chatGptSafeModeCandidate;
  if (!hasCustomTabTitle()) nativePageTitle = getCleanDocumentTitleText() || activeSite?.name || 'AI';
  if (!chatGptSafeMode && !isGoogleAiTitleSafeMode()) ensureTitleSyncObserver();
  clearSteeringAutoSendTimer();
  clearSteeringSendLock();
  steeringProcessing = false;
  clearSteeringAwaitingResponseStart();
  bindHandlersOnce();
  if (chatGptSafeMode) {
    bootstrapChatGptSafeModeTitleBadge();
    return;
  }
  if (isGoogleAiTitleSafeMode()) publishTitleGuardState({ enabled: false, force: true });
  // Gemini deep observer는 document도 포함하므로 같은 전체 DOM을 두 번 감시하지 않는다.
  const deepEnabled = shouldEnableDeepForSite(site);
  try { setDeepEnabled(deepEnabled); } catch (_) {}
  if (!deepEnabled) {
    _observer = new MutationObserver(() => scheduleCheck());
    try {
      const observeOptions = { childList: true, subtree: true };
      if (shouldObserveStatusAttributes(site)) {
        observeOptions.attributes = true;
        observeOptions.attributeFilter = ['aria-label', 'hidden', 'disabled', 'aria-disabled'];
      }
      _observer.observe(document.body, observeOptions);
    } catch (_) {
      // 일부 문서(특수 프레임)에서는 observe 실패할 수 있음
    }
  }
  ensurePolling();
  loadSteeringPrefs(() => {
    requestCustomTabTitleSync();
    armTitleBadgeStabilityWindow(2500);
    updateTitleBadge();
    updateSteeringUi();
    scheduleCheck(true);
  });
}
function stopMonitoring() {
  syncSteeringDraftFromInput();
  monitoring = false;
  activeSite = null;
  isGenerating = false;
  completionStatus = 'idle';
  clearAiStudioGenerationProbeBurst();
  hasSentInitialState = false;
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  if (_checkTimer) {
    try { clearTimeout(_checkTimer); } catch (_) {}
    _checkTimer = null;
  }
  _checkScheduled = false;
  if (_observer) {
    try { _observer.disconnect(); } catch (_) {}
    _observer = null;
  }
  setDeepEnabled(false);
  _lastHeartbeatAt = 0;
  disconnectTitleSyncObserver();
  clearTitleBadgeStabilityWindow();
  stopChatGptLightTitleBadgeKeepAlive();
  clearChatGptLightCompletionWatch();
  if (titleGuardInstallRetryTimer) {
    try { clearTimeout(titleGuardInstallRetryTimer); } catch (_) {}
    titleGuardInstallRetryTimer = null;
  }
  if (titleGuardStateRetryTimer) {
    try { clearTimeout(titleGuardStateRetryTimer); } catch (_) {}
    titleGuardStateRetryTimer = null;
  }
  titleGuardStateRetryUntil = 0;
  titleGuardInstallInFlight = false;
  titleGuardInstalled = false;
  titleBadgeLastLoopSyncAt = 0;
  titleBadgeLastUiSyncAt = 0;
  titleBadgeLastUiSyncSignature = '';
  if (!isReadyAiDuplicateContentInstance()) clearTitleBadge();
  clearSteeringAutoSendTimer();
  clearSteeringSendLock();
  steeringProcessing = false;
  clearSteeringAwaitingResponseStart();
  clearSteeringTurnCompletionWait();
  hideSteeringUi();
}
var _bootRetryCount = 0;
function shouldSkipFrameMonitoringForSite(site) {
  if (IS_TOP_FRAME) return false;
  const key = String(site?.key || site?.detection || '').toLowerCase();
  return key === 'chatgpt';
}
function refreshSiteFromStorage() {
  // sites.js가 아직 준비되지 않은 상태(세션 복원 타이밍 등)에서는
  // 뱃지가 초기화되지 않고 그대로 비는 현상이 생길 수 있어, 짧게 재시도한다.
  if (!window?.ReadyAi?.sites) {
    if (_bootRetryCount < 20) {
      _bootRetryCount += 1;
      setTimeout(refreshSiteFromStorage, 250);
    }
    return;
  }
  chrome.storage.local.get([
    window.ReadyAi.sites.STORAGE_KEYS.ENABLED_SITES,
    window.ReadyAi.sites.STORAGE_KEYS.CUSTOM_SITES,
  ], (res) => {
    const enabledSites = window.ReadyAi.sites.ensureEnabledSitesObject(res?.enabledSites);
    const customSites = window.ReadyAi.sites.normalizeCustomSites(res?.customSites);
    // 1) 현재 프레임 URL로 먼저 판단
    let site = null;
    try {
      site = window.ReadyAi.sites.resolveSiteFromConfig(window.location.href, enabledSites, customSites);
    } catch (_) {
      site = null;
    }
    if (site) {
      if (shouldSkipFrameMonitoringForSite(site)) {
        stopMonitoring();
        return;
      }
      startMonitoring(site);
      return;
    }
    // 2) iframe인 경우: "탭 URL" 기준으로 다시 판단
    //    (AI Studio처럼 UI가 다른 origin iframe 안에 들어간 경우를 살린다)
    if (!IS_TOP_FRAME) {
      chrome.runtime.sendMessage({ action: 'get_tab_url' }, (resp) => {
        const tabUrl = resp?.url || '';
        let tabSite = null;
        try {
          if (tabUrl) tabSite = window.ReadyAi.sites.resolveSiteFromConfig(tabUrl, enabledSites, customSites);
        } catch (_) {
          tabSite = null;
        }
        if (tabSite && !shouldSkipFrameMonitoringForSite(tabSite)) startMonitoring(tabSite);
        else stopMonitoring();
      });
      return;
    }
    stopMonitoring();
  });
}
// 설정 변경 시(팝업에서 사이트 on/off 또는 custom 추가/삭제) 즉시 반영
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const siteConfigChanged = !!(changes.enabledSites || changes.customSites);
    if (siteConfigChanged) loadSteeringPrefs(() => {
      refreshSiteFromStorage();
    });
    if (!monitoring && !siteConfigChanged) return;
    if (Object.prototype.hasOwnProperty.call(changes, STEERING_STORAGE_KEYS.ENABLED)) {
      steeringEnabled = typeof changes[STEERING_STORAGE_KEYS.ENABLED]?.newValue === 'boolean' ? !!changes[STEERING_STORAGE_KEYS.ENABLED].newValue : true;
      updateSteeringUi();
    }
    if (Object.prototype.hasOwnProperty.call(changes, STEERING_STORAGE_KEYS.THEME)) {
      steeringTheme = normalizeSteeringTheme(changes[STEERING_STORAGE_KEYS.THEME]?.newValue);
      applySteeringTheme();
      updateSteeringUi();
    }
    if (Object.prototype.hasOwnProperty.call(changes, STEERING_STORAGE_KEYS.LAUNCHER_VISIBLE)) {
      steeringLauncherVisible = typeof changes[STEERING_STORAGE_KEYS.LAUNCHER_VISIBLE]?.newValue === 'boolean' ? !!changes[STEERING_STORAGE_KEYS.LAUNCHER_VISIBLE].newValue : true;
      updateSteeringUi();
    }
    if (Object.prototype.hasOwnProperty.call(changes, STEERING_STORAGE_KEYS.AUTO_FOCUS_INPUT)) {
      steeringAutoFocusInput = typeof changes[STEERING_STORAGE_KEYS.AUTO_FOCUS_INPUT]?.newValue === 'boolean' ? !!changes[STEERING_STORAGE_KEYS.AUTO_FOCUS_INPUT].newValue : true;
    }
    if (Object.prototype.hasOwnProperty.call(changes, STEERING_STORAGE_KEYS.CLOSE_AFTER_SEND)) {
      steeringCloseAfterSend = typeof changes[STEERING_STORAGE_KEYS.CLOSE_AFTER_SEND]?.newValue === 'boolean' ? !!changes[STEERING_STORAGE_KEYS.CLOSE_AFTER_SEND].newValue : false;
    }
    if (Object.prototype.hasOwnProperty.call(changes, STEERING_STORAGE_KEYS.QUEUE_COUNT_VISIBLE)) {
      steeringQueueCountVisible = typeof changes[STEERING_STORAGE_KEYS.QUEUE_COUNT_VISIBLE]?.newValue === 'boolean' ? !!changes[STEERING_STORAGE_KEYS.QUEUE_COUNT_VISIBLE].newValue : true;
      updateSteeringUi();
    }
    if (Object.prototype.hasOwnProperty.call(changes, STEERING_STORAGE_KEYS.ADVANCED_ENABLED)) {
      steeringAdvancedEnabled = typeof changes[STEERING_STORAGE_KEYS.ADVANCED_ENABLED]?.newValue === 'boolean' ? !!changes[STEERING_STORAGE_KEYS.ADVANCED_ENABLED].newValue : false;
      updateSteeringUi();
    }
    if (Object.prototype.hasOwnProperty.call(changes, STEERING_STORAGE_KEYS.NEW_CHAT_TAB_COUNT)) {
      steeringNewChatTabCount = normalizeSteeringNewChatTabCount(changes[STEERING_STORAGE_KEYS.NEW_CHAT_TAB_COUNT]?.newValue);
      updateSteeringUi();
    }
    if (Object.prototype.hasOwnProperty.call(changes, STEERING_STORAGE_KEYS.TEMPLATES)) {
      steeringTemplates = normalizeSteeringTemplates(changes[STEERING_STORAGE_KEYS.TEMPLATES]?.newValue);
      steeringTemplateRenderSignature = '';
      updateSteeringUi();
    }
    if (Object.prototype.hasOwnProperty.call(changes, TITLE_BADGE_STORAGE_KEYS.ENABLED)) {
      titleBadgeEnabled = typeof changes[TITLE_BADGE_STORAGE_KEYS.ENABLED]?.newValue === 'boolean' ? !!changes[TITLE_BADGE_STORAGE_KEYS.ENABLED].newValue : true;
      armTitleBadgeStabilityWindow(1600);
      updateTitleBadge();
    }
    if (Object.prototype.hasOwnProperty.call(changes, TITLE_BADGE_STORAGE_KEYS.COUNT_ENABLED)) {
      titleBadgeCountEnabled = typeof changes[TITLE_BADGE_STORAGE_KEYS.COUNT_ENABLED]?.newValue === 'boolean' ? !!changes[TITLE_BADGE_STORAGE_KEYS.COUNT_ENABLED].newValue : true;
      armTitleBadgeStabilityWindow(1600);
      updateTitleBadge();
    }
    if (changes.customTabTitles) {
      requestCustomTabTitleSync();
    }
  });
} catch (_) {}
refreshSiteFromStorage();
console.log('[Ready_Ai] content script loaded', READY_AI_CONTENT_BUILD_VERSION);
// background(service_worker)에서 강제 체크 요청
try {
  ((readyAiContentInstanceSeq) => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isReadyAiCurrentContentInstance(readyAiContentInstanceSeq)) return false;
    if (!msg) return;
    if (msg.topFrameOnly && !IS_TOP_FRAME) return;
    const action = String(msg.action || '');
    const tabLevelSteeringAction = /^(open_steering_panel|send_steering_prompt_now|enqueue_steering_prompt|clear_steering_queue|process_steering_queue_now|get_steering_state)$/.test(action);
    if (!IS_TOP_FRAME && tabLevelSteeringAction) return;
    if (msg.action === 'ping') {
      try {
        sendResponse?.({
          ok: true,
          readyAiContentVersion: READY_AI_CONTENT_VERSION,
          readyAiContentBuildVersion: READY_AI_CONTENT_BUILD_VERSION,
          duplicate: isReadyAiDuplicateContentInstance(),
          extensionId: getReadyAiExtensionId(),
        });
      } catch (_) {}
      return;
    }
    if (isReadyAiDuplicateContentInstance()) {
      try { sendResponse?.({ ok: false, skipped: true, duplicate: true, extensionId: getReadyAiExtensionId() }); } catch (_) {}
      return;
    }
    if (msg.action === 'force_check') {
      if (isChatGptSafeMode()) {
        armChatGptLightTitleBadgeBurst();
        if (detectChatGptGeneratingLight()) setChatGptLightGenerating(true, { observed: true });
        try { sendResponse?.({ ok: true, skipped: true }); } catch (_) {}
        return;
      }
      // 상태는 polling/observer로도 갱신되지만,
      // Gemini는 탭 활성화 직후에 DOM이 크게 변하는 경우가 있어
      // background에서 "지금 한 번만" 더 체크하라고 신호를 줄 수 있게 한다.
      scheduleCheck(true);
      try { sendResponse?.({ ok: true }); } catch (_) {}
      return;
    }
    if (msg.action === 'force_title_sync') {
      if (isChatGptSafeMode()) {
        syncNativePageTitleFromDocumentTitle();
        updateTitleBadge();
        armChatGptLightTitleBadgeBurst();
        try { sendResponse?.({ ok: true, lightweight: true }); } catch (_) {}
        return;
      }
      requestTitleGuardInstall();
      publishTitleGuardState({ force: true });
      reconcileDesiredDocumentTitleFromMutation();
      armTitleBadgeStabilityWindow(1600);
      updateTitleBadge();
      try { sendResponse?.({ ok: true }); } catch (_) {}
      return;
    }
    if (msg.action === 'custom_tab_title_updated') {
      setCustomTabTitleValue(msg.title || '');
      try { sendResponse?.({ ok: true }); } catch (_) {}
      return;
    }
    if (msg.action === 'custom_tab_title_cleared') {
      setCustomTabTitleValue('');
      try { sendResponse?.({ ok: true }); } catch (_) {}
      return;
    }
    if (msg.action === 'open_steering_panel') {
      if (!steeringEnabled) {
        try { sendResponse?.({ ok: false, message: '후속 지시 기능이 꺼져 있습니다.' }); } catch (_) {}
        return;
      }
      if (!monitoring) {
        try { sendResponse?.({ ok: false, message: '이 탭은 Ready_Ai 지원 대상이 아닙니다.' }); } catch (_) {}
        return;
      }
      steeringPanelOpen = true;
      ensureSteeringUi();
      updateSteeringUi();
      if (steeringAutoFocusInput) {
        window.setTimeout(() => {
          try { steeringRefs?.input?.focus(); } catch (_) {}
        }, 50);
      }
      try { sendResponse?.({ ok: true, open: true, count: steeringQueue.length }); } catch (_) {}
      return;
    }
    if (msg.action === 'send_steering_prompt_now') {
      const text = String(msg.text || '').trim();
      if (!text) {
        try { sendResponse?.({ ok: false, sent: false, message: '내용이 비어 있습니다.' }); } catch (_) {}
        return;
      }
      Promise.resolve(sendSteeringPromptTextWhenReady(text, {
        timeoutMs: msg.timeoutMs,
        submitStartTimeoutMs: msg.submitStartTimeoutMs,
        source: msg.source || '',
        skipReadinessGate: !!msg.skipReadinessGate,
      }))
        .then((result) => {
          try { sendResponse?.(result || { ok: false, sent: false, message: '전송하지 못했습니다.' }); } catch (_) {}
        })
        .catch(() => {
          try { sendResponse?.({ ok: false, sent: false, message: '새 채팅 탭 전송 중 오류가 발생했습니다.' }); } catch (_) {}
        });
      return true;
    }
    if (msg.action === 'enqueue_steering_prompt') {
      const text = String(msg.text || '').trim();
      if (!text) {
        try { sendResponse?.({ ok: false, message: '내용이 비어 있습니다.' }); } catch (_) {}
        return;
      }
      if (!steeringEnabled) {
        try { sendResponse?.({ ok: false, message: '후속 지시 기능이 꺼져 있습니다.' }); } catch (_) {}
        return;
      }
      const item = enqueueSteeringPrompt(text, { files: [], source: 'runtime' });
      if (!item) {
        try { sendResponse?.({ ok: false, message: '대기열 추가 실패' }); } catch (_) {}
        return;
      }
      ensureSteeringUi();
      setSteeringStatus(`${getSteeringQueueCountLabel()}`);
      updateSteeringUi();
      if (steeringPanelOpen && steeringAutoFocusInput) { try { steeringRefs?.input?.focus(); } catch (_) {} }
      scheduleSteeringQueueProcessing(Math.max(150, Math.min(10000, Number(msg.autoSendDelayMs) || 150)));
      try { sendResponse?.({ ok: true, count: steeringQueue.length }); } catch (_) {}
      return;
    }
    if (msg.action === 'clear_steering_queue') {
      clearSteeringQueue(false);
      try { sendResponse?.({ ok: true, count: steeringQueue.length }); } catch (_) {}
      return;
    }
    if (msg.action === 'process_steering_queue_now') {
      if (msg.forceResume) {
        Promise.resolve(resumeSteeringQueueNow({ source: 'message', force: true }))
          .then((ok) => {
            try { sendResponse?.({ ok: !!ok, count: steeringQueue.length }); } catch (_) {}
          })
          .catch(() => {
            try { sendResponse?.({ ok: false, count: steeringQueue.length }); } catch (_) {}
          });
        return true;
      }
      if (isSteeringTurnWatchdogMature()) {
        recoverStaleSteeringTurnWait('process_request');
      }
      Promise.resolve(processSteeringQueue({ source: 'manual' }))
        .then((ok) => {
          try { sendResponse?.({ ok: !!ok, count: steeringQueue.length }); } catch (_) {}
        })
        .catch(() => {
          try { sendResponse?.({ ok: false, count: steeringQueue.length }); } catch (_) {}
        });
      return true;
    }
    if (msg.action === 'get_steering_state') {
      try {
        sendResponse?.({
          ok: true,
          enabled: !!steeringEnabled,
          count: steeringQueue.length,
          canSendNow: canAutoSendSteeringNow(),
        });
      } catch (_) {}
      return;
    }
  });
  })(getReadyAiContentInstanceSeq());
} catch (_) {}
