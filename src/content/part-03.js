function requestCustomTabTitleSync() {
  if (!IS_TOP_FRAME) return;
  try {
    chrome.runtime.sendMessage({ action: 'get_custom_tab_title' }, (resp) => {
      if (chrome.runtime.lastError) return;
      customTabTitle = normalizeCustomTabTitle(resp?.title || '');
      if (!hasCustomTabTitle()) {
        const clean = getCleanDocumentTitleText();
        nativePageTitle = clean || nativePageTitle || activeSite?.name || 'AI';
      }
      applyDesiredDocumentTitle(true);
      updateSteeringUi();
    });
  } catch (_) {}
}
function verifyCustomTabTitleState(expectedTitle, onDone) {
  if (!IS_TOP_FRAME) {
    try { onDone?.(false, '상단 프레임에서만 탭 이름을 바꿀 수 있습니다.'); } catch (_) {}
    return;
  }
  try {
    chrome.runtime.sendMessage({ action: 'get_custom_tab_title' }, (resp) => {
      if (chrome.runtime.lastError) {
        try { onDone?.(false, chrome.runtime.lastError.message || '탭 이름 확인에 실패했습니다.'); } catch (_) {}
        return;
      }
      const actualTitle = normalizeCustomTabTitle(resp?.title || '');
      try { onDone?.(actualTitle === normalizeCustomTabTitle(expectedTitle), actualTitle); } catch (_) {}
    });
  } catch (_) {
    try { onDone?.(false, '탭 이름 확인에 실패했습니다.'); } catch (_) {}
  }
}
function setCustomTabTitleValue(nextTitle, options = {}) {
  if (!IS_TOP_FRAME) return;
  const normalized = normalizeCustomTabTitle(nextTitle);
  if (normalized) lastCustomTabTitle = normalized;
  customTabTitle = normalized;
  if (!normalized) {
    const clean = getCleanDocumentTitleText();
    nativePageTitle = clean || nativePageTitle || activeSite?.name || 'AI';
  }
  if (options.sync !== false) {
    applyDesiredDocumentTitle(true);
  }
  updateSteeringUi();
}
function saveCustomTabTitleFromInput() {
  if (!IS_TOP_FRAME) {
    setSteeringStatus('상단 프레임에서만 탭 이름을 바꿀 수 있습니다.', true);
    return;
  }
  const refs = ensureSteeringUi();
  const nextTitle = normalizeCustomTabTitle(refs?.tabTitleInput?.value || '');
  if (!nextTitle) {
    clearCustomTabTitleOverride();
    return;
  }
  const fallbackClean = getCleanDocumentTitleText();
  if (!hasCustomTabTitle()) nativePageTitle = fallbackClean || nativePageTitle || activeSite?.name || 'AI';
  setCustomTabTitleValue(nextTitle);
  const finalizeSuccess = (savedTitle = nextTitle) => {
    const confirmedTitle = normalizeCustomTabTitle(savedTitle || nextTitle) || nextTitle;
    setCustomTabTitleValue(confirmedTitle);
    setSteeringStatus(`크롬 탭 이름변경: ${confirmedTitle}`);
    updateSteeringUi();
  };
  const finalizeFailure = (message) => {
    setSteeringStatus(message || '탭 이름 저장에 실패했습니다.', true);
  };
  const verifyAfterFailure = (fallbackMessage) => {
    verifyCustomTabTitleState(nextTitle, (matched, info) => {
      if (matched) {
        finalizeSuccess(nextTitle);
        return;
      }
      finalizeFailure(typeof info === 'string' && info && info !== nextTitle ? fallbackMessage || info : fallbackMessage || '탭 이름 저장에 실패했습니다.');
    });
  };
  try {
    chrome.runtime.sendMessage({ action: 'set_custom_tab_title', title: nextTitle }, (resp) => {
      if (chrome.runtime.lastError) {
        verifyAfterFailure(chrome.runtime.lastError.message || '탭 이름 저장에 실패했습니다.');
        return;
      }
      if (resp?.ok === false) {
        verifyAfterFailure(resp?.message || '탭 이름 저장에 실패했습니다.');
        return;
      }
      finalizeSuccess(resp?.title || nextTitle);
    });
  } catch (_) {
    verifyAfterFailure('탭 이름 저장에 실패했습니다.');
  }
}
function clearCustomTabTitleOverride() {
  if (!IS_TOP_FRAME) {
    setSteeringStatus('상단 프레임에서만 탭 이름을 바꿀 수 있습니다.', true);
    return;
  }
  customTabTitle = '';
  applyDesiredDocumentTitle(true);
  updateSteeringUi();
  const finalizeSuccess = () => {
    setCustomTabTitleValue('', { sync: true });
    setSteeringStatus('크롬 탭 이름변경을 해제했습니다.');
    updateSteeringUi();
  };
  const verifyAfterFailure = (fallbackMessage) => {
    verifyCustomTabTitleState('', (matched, info) => {
      if (matched) {
        finalizeSuccess();
        return;
      }
      setSteeringStatus(fallbackMessage || (typeof info === 'string' ? info : '크롬 탭 이름변경 해제에 실패했습니다.'), true);
    });
  };
  try {
    chrome.runtime.sendMessage({ action: 'clear_custom_tab_title' }, (resp) => {
      if (chrome.runtime.lastError) {
        verifyAfterFailure(chrome.runtime.lastError.message || '크롬 탭 이름변경 해제에 실패했습니다.');
        return;
      }
      if (resp?.ok === false) {
        verifyAfterFailure(resp?.message || '크롬 탭 이름변경 해제에 실패했습니다.');
        return;
      }
      finalizeSuccess();
    });
  } catch (_) {
    verifyAfterFailure('크롬 탭 이름변경 해제에 실패했습니다.');
  }
}
function clearSteeringAutoSendTimer() {
  if (!steeringAutoSendTimer) return;
  try { clearTimeout(steeringAutoSendTimer); } catch (_) {}
  steeringAutoSendTimer = null;
}
function clearSteeringSendLock() {
  steeringSendLock = false;
  if (!steeringSendLockTimer) return;
  try { clearTimeout(steeringSendLockTimer); } catch (_) {}
  steeringSendLockTimer = null;
}
function clearSteeringAwaitingResponseStart() {
  steeringAwaitingResponseStart = false;
  if (!steeringAwaitingResponseTimer) return;
  try { clearTimeout(steeringAwaitingResponseTimer); } catch (_) {}
  steeringAwaitingResponseTimer = null;
}
function clearSteeringTurnCompletionWatchdog() {
  steeringTurnCompletionWatchdogStartedAt = 0;
  if (!steeringTurnCompletionWatchdogTimer) return;
  try { clearTimeout(steeringTurnCompletionWatchdogTimer); } catch (_) {}
  steeringTurnCompletionWatchdogTimer = null;
}
function getSteeringTurnWatchdogDelayMs() {
  return document.hidden ? STEERING_TURN_WATCHDOG_HIDDEN_MS : STEERING_TURN_WATCHDOG_VISIBLE_MS;
}
function isSteeringTurnWatchdogMature() {
  if (!steeringAwaitingTurnCompletion || !steeringTurnCompletionWatchdogStartedAt) return false;
  return Date.now() - steeringTurnCompletionWatchdogStartedAt >= getSteeringTurnWatchdogDelayMs();
}
function markSteeringGenerationObserved() {
  if (!steeringAwaitingTurnCompletion) return;
  steeringObservedGenerationSinceSend = true;
  clearSteeringAwaitingResponseStart();
}
function getChatGptAssistantTurnSnapshot() {
  if (!isChatGptSafeMode()) return null;
  let turns = [];
  try {
    turns = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
  } catch (_) {
    turns = [];
  }
  const last = turns[turns.length - 1] || null;
  if (!last) return { count: 0, identity: '', finalized: false };
  const turn = last.closest?.('[data-testid^="conversation-turn-"]') || last.parentElement || null;
  const identity = [
    last.getAttribute?.('data-message-id') || '',
    last.getAttribute?.('data-testid') || '',
    turn?.getAttribute?.('data-testid') || '',
  ].join('|');
  const finalized = !!turn?.querySelector?.(
    'button[data-testid="copy-turn-action-button"],button[aria-label*="응답 복사"],button[aria-label*="Copy response"]'
  );
  return {
    count: turns.length,
    identity,
    finalized,
  };
}
function captureSteeringChatGptAssistantBaseline() {
  steeringChatGptAssistantObservedAt = 0;
  steeringChatGptAssistantFinalizedAt = 0;
  steeringChatGptAssistantBaseline = getChatGptAssistantTurnSnapshot();
}
function clearSteeringChatGptAssistantObservation() {
  steeringChatGptAssistantBaseline = null;
  steeringChatGptAssistantObservedAt = 0;
  steeringChatGptAssistantFinalizedAt = 0;
}
function observeSteeringChatGptAssistantTurn() {
  if (!isChatGptSafeMode() || !steeringAwaitingTurnCompletion) return false;
  const baseline = steeringChatGptAssistantBaseline;
  const current = getChatGptAssistantTurnSnapshot();
  if (!baseline || !current) return false;
  const advanced = current.count > baseline.count
    || (
      current.count >= baseline.count
      && !!current.identity
      && current.identity !== baseline.identity
  );
  if (!advanced) return false;
  const now = Date.now();
  if (!steeringChatGptAssistantObservedAt) {
    steeringChatGptAssistantObservedAt = now;
  }
  if (current.finalized) {
    steeringChatGptAssistantFinalizedAt = steeringChatGptAssistantFinalizedAt || now;
  } else {
    steeringChatGptAssistantFinalizedAt = 0;
  }
  if (!steeringObservedGenerationSinceSend) markSteeringGenerationObserved();
  return true;
}
function isSteeringChatGptAssistantTurnStable(minStableMs = 250) {
  if (!steeringChatGptAssistantBaseline) return true;
  if (!steeringChatGptAssistantObservedAt) return false;
  if (!steeringChatGptAssistantFinalizedAt) return false;
  return Date.now() - steeringChatGptAssistantFinalizedAt >= Math.max(100, Number(minStableMs) || 250);
}
function isChatGptUnobservedSteeringTurnPending() {
  return !!(
    isChatGptSafeMode()
    && steeringAwaitingTurnCompletion
    && !steeringObservedGenerationSinceSend
  );
}
function isForcedSteeringResumeReason(reason = '') {
  return /resume|force/i.test(String(reason || ''));
}
function holdChatGptUnobservedSteeringTurn(reason = '') {
  if (!isChatGptUnobservedSteeringTurnPending()) return false;
  if (isForcedSteeringResumeReason(reason) || isSteeringTurnWatchdogMature()) return false;
  clearSteeringAutoSendTimer();
  completionStatus = 'idle';
  if (!steeringTurnCompletionWatchdogTimer) {
    armSteeringTurnCompletionWatchdog(getSteeringTurnWatchdogDelayMs());
  }
  setSteeringStatus('후속 대기: ChatGPT 응답 확인 중입니다.');
  updateTitleBadge();
  updateSteeringUi();
  return true;
}
function recoverStaleSteeringTurnWait(reason = '') {
  if (!monitoring || !steeringAwaitingTurnCompletion) return false;
  try { maybeRescanShadowRoots(); } catch (_) {}
  let generatingNow = false;
  try {
    generatingNow = !!(activeSite && detectGenerating(activeSite));
  } catch (_) {
    generatingNow = false;
  }
  observeSteeringChatGptAssistantTurn();
  const assistantTurnInProgress = !!(
    isChatGptSafeMode()
    && steeringChatGptAssistantBaseline
    && !isSteeringChatGptAssistantTurnStable()
    && (!chatGptLightGenerationWatchUntil || Date.now() < chatGptLightGenerationWatchUntil)
  );
  if (generatingNow || assistantTurnInProgress) {
    if (!isGenerating) {
      isGenerating = true;
      completionStatus = 'idle';
      steeringLastCompletionAt = 0;
    }
    markSteeringGenerationObserved();
    armSteeringTurnCompletionWatchdog(getSteeringTurnWatchdogDelayMs());
    updateTitleBadge();
    updateSteeringUi();
    return false;
  }
  if (holdChatGptUnobservedSteeringTurn(reason)) return false;
  if (isGenerating) isGenerating = false;
  clearSteeringTurnCompletionWait();
  clearSteeringAwaitingResponseStart();
  completionStatus = 'completed';
  steeringLastCompletionAt = Date.now();
  updateTitleBadge();
  updateSteeringUi();
  scheduleSteeringQueueProcessing(STEERING_AUTO_SEND_DELAY_MS);
  return true;
}
function armSteeringTurnCompletionWatchdog(ms = 0) {
  clearSteeringTurnCompletionWatchdog();
  if (!monitoring || !steeringAwaitingTurnCompletion) return;
  steeringTurnCompletionWatchdogStartedAt = Date.now();
  const delay = Math.max(5000, Number(ms) || getSteeringTurnWatchdogDelayMs());
  steeringTurnCompletionWatchdogTimer = setTimeout(() => {
    steeringTurnCompletionWatchdogTimer = null;
    recoverStaleSteeringTurnWait('turn_watchdog');
  }, delay);
}
function clearSteeringTurnCompletionWait() {
  steeringAwaitingTurnCompletion = false;
  steeringObservedGenerationSinceSend = false;
  clearSteeringChatGptAssistantObservation();
  clearSteeringTurnCompletionWatchdog();
}
function armSteeringAwaitingResponseStart(ms = 15000) {
  clearSteeringAwaitingResponseStart();
  steeringAwaitingResponseStart = true;
  steeringAwaitingResponseTimer = setTimeout(() => {
    steeringAwaitingResponseStart = false;
    steeringAwaitingResponseTimer = null;
    scheduleCheck(true);
    if (
      steeringAwaitingTurnCompletion
      && !steeringTurnCompletionWatchdogTimer
      && !steeringTurnCompletionWatchdogStartedAt
    ) {
      armSteeringTurnCompletionWatchdog(getSteeringTurnWatchdogDelayMs());
    }
    updateSteeringUi();
  }, Math.max(1500, ms));
}
function armSteeringSendLock(ms = 2000) {
  clearSteeringSendLock();
  steeringSendLock = true;
  steeringSendLockTimer = setTimeout(() => {
    steeringSendLock = false;
    steeringSendLockTimer = null;
    updateSteeringUi();
  }, Math.max(200, ms));
}
function acquireSteeringQueueDispatchLock(reason = '') {
  const now = Date.now();
  const token = `${now}:${Math.random().toString(36).slice(2)}`;
  try {
    const lock = globalThis.__ReadyAiSteeringQueueDispatchLock || {};
    if (Number(lock.until) > now) return '';
    globalThis.__ReadyAiSteeringQueueDispatchLock = {
      token,
      until: now + STEERING_QUEUE_DISPATCH_LOCK_MS,
      reason: String(reason || ''),
    };
    return token;
  } catch (_) {
    return token;
  }
}
function releaseSteeringQueueDispatchLock(token) {
  if (!token) return;
  try {
    const lock = globalThis.__ReadyAiSteeringQueueDispatchLock || {};
    if (lock.token === token) {
      globalThis.__ReadyAiSteeringQueueDispatchLock = null;
    }
  } catch (_) {}
}
function hasActiveSteeringOffer() {
  return !isGenerating && (completionStatus === 'completed' || completionStatus === 'idle');
}
function isGoogleSteeringQueueWaitingForCompletion() {
  const siteKey = getSiteKey();
  return (siteKey === 'gemini' || siteKey === 'aistudio') && completionStatus !== 'completed';
}
function canAutoSendSteeringNow(options = {}) {
  if (isChatGptUnobservedSteeringTurnPending()) return false;
  // Gemini와 AI Studio의 리치 편집기는 유휴 상태에서 확장 프로그램이
  // 자동으로 내용을 주입하면 편집기 재조정이 겹칠 수 있다. 자동 경로는
  // 실제 답변 완료 뒤에만 열고, 명시적인 수동 전송만 예외로 허용한다.
  if (!options.allowGoogleIdle && isGoogleSteeringQueueWaitingForCompletion()) return false;
  return hasActiveSteeringOffer() && !steeringSendLock && !steeringProcessing && !steeringAwaitingResponseStart && !steeringAwaitingTurnCompletion;
}
function canUserRunSteeringQueueNow() {
  return !!(monitoring && steeringEnabled && steeringQueue.length && canAutoSendSteeringNow({ allowGoogleIdle: true }));
}
function getSteeringQueueWaitMessage() {
  if (!steeringQueue.length) return '전송할 대기가 없습니다.';
  if (steeringProcessing) return '전송 처리 중입니다.';
  if (isGenerating || steeringAwaitingResponseStart || steeringAwaitingTurnCompletion || steeringSendLock) {
    return '후속 대기 중입니다. 응답이 끝나면 자동 전송합니다.';
  }
  return '지금은 전송할 수 없습니다.';
}
function getSteeringResumeButtonTitle() {
  if (canUserRunSteeringQueueNow()) return '다음 후속 지시를 지금 전송합니다.';
  return getSteeringQueueWaitMessage();
}
function wakeSteeringQueueAfterVisibilityRestore(reason = 'visibility') {
  if (!monitoring || !steeringEnabled || !steeringQueue.length || steeringProcessing) return false;
  if (!canAutoSendSteeringNow()) {
    if (!isSteeringTurnWatchdogMature()) return false;
    recoverStaleSteeringTurnWait(reason);
    return true;
  }
  scheduleSteeringQueueProcessing(0);
  return true;
}
function isSteeringFollowupWaiting() {
  return !!(
    steeringQueue.length
    && (
      steeringAwaitingTurnCompletion
      || steeringAwaitingResponseStart
      || isGenerating
      || steeringProcessing
    )
  );
}
function isSteeringQueueBlocked() {
  if (!steeringQueue.length || canAutoSendSteeringNow()) return false;
  if (steeringAwaitingResponseStart && !isSteeringTurnWatchdogMature()) return false;
  return true;
}
function getSteeringResumeLabel() {
  return '다음 보내기';
}
function clearSteeringCompletionOffer() {
  if (completionStatus === 'completed') {
    completionStatus = 'idle';
    updateTitleBadge();
    updateSteeringUi();
    try {
      chrome.runtime.sendMessage({
        action: 'user_activity',
        platform: getSiteKey(),
        siteName: activeSite?.name,
      });
    } catch (_) {}
  }
}
function getCurrentTitleBadgeGlyph() {
  if (isGenerating) return TITLE_BADGE.ORANGE;
  if (completionStatus === 'completed') return TITLE_BADGE.GREEN;
  return TITLE_BADGE.WHITE;
}
function getCurrentTitleBadgeState() {
  if (isGenerating) return 'running';
  if (completionStatus === 'completed') return 'completed';
  return 'idle';
}
function getSteeringLauncherText() {
  return steeringPanelOpen ? '후속 지시 닫기' : '후속 지시 열기';
}
function getSteeringLauncherSubText() {
  return '항상 열어둘 수 있는 후속 지시 패널';
}
function getSteeringStateLabel() {
  const name = activeSite?.name || 'AI';
  if (isSteeringFollowupWaiting()) return `${name} 후속 대기`;
  return `${name} 후속 지시`;
}
function getSteeringPrimaryLabel() {
  if (steeringAdvancedEnabled) {
    const hasFiles = typeof getSteeringDraftAttachmentCount === 'function' && getSteeringDraftAttachmentCount() > 0;
    return hasFiles ? '현재대화' : '새 채팅';
  }
  if (isSteeringFollowupWaiting()) return '후속 대기';
  return canAutoSendSteeringNow() ? 'Enter' : '입력 대기';
}
function setSteeringAdvancedEnabled(nextValue) {
  steeringAdvancedEnabled = !!nextValue;
  try {
    chrome.storage.local.set({ [STEERING_STORAGE_KEYS.ADVANCED_ENABLED]: steeringAdvancedEnabled });
  } catch (_) {}
  setSteeringStatus(steeringAdvancedEnabled ? '고급설정 ON · 새 채팅 전송 모드' : '고급설정 OFF · 현재 대화 후속 지시 모드');
  updateSteeringUi();
}
function setSteeringNewChatTabCountValue(value, options = {}) {
  const raw = String(value ?? '').trim();
  if (!raw && options.allowEmpty) return false;
  steeringNewChatTabCount = normalizeSteeringNewChatTabCount(raw || value);
  if (options.syncInput !== false && steeringRefs?.newChatCount && steeringRefs.newChatCount.value !== String(steeringNewChatTabCount)) {
    try { steeringRefs.newChatCount.value = String(steeringNewChatTabCount); } catch (_) {}
  }
  try {
    chrome.storage.local.set({ [STEERING_STORAGE_KEYS.NEW_CHAT_TAB_COUNT]: steeringNewChatTabCount });
  } catch (_) {}
  if (!options.silentStatus) setSteeringStatus(`새 채팅 탭 수: ${steeringNewChatTabCount}`);
  if (options.render !== false) updateSteeringUi();
  return true;
}
function applySteeringTheme() {
  if (!steeringHost || !steeringRoot) return;
  const nextTheme = normalizeSteeringTheme(steeringTheme);
  const dock = steeringRefs?.dock || steeringRoot.querySelector('.dock');
  const signature = `${nextTheme}|${!!dock}`;
  if (
    steeringAppliedThemeSignature === signature
    && steeringHost.dataset.theme === nextTheme
    && (!dock || dock.getAttribute('data-theme') === nextTheme)
  ) {
    return;
  }
  if (steeringHost.dataset.theme !== nextTheme) steeringHost.dataset.theme = nextTheme;
  if (dock && dock.getAttribute('data-theme') !== nextTheme) dock.setAttribute('data-theme', nextTheme);
  steeringAppliedThemeSignature = signature;
}
function getSteeringAnchorElement() {
  const composer = getActiveComposer();
  if (!composer) return null;
  const form = composer.closest?.('form');
  if (form && isVisible(form)) return form;
  const group = composer.closest?.('[data-testid], [role="group"], [role="presentation"]');
  if (group && isVisible(group)) return group;
  return composer;
}
function hasChatGptConversationTurns() {
  const now = Date.now();
  const ttl = document.hidden ? 3000 : 650;
  if (steeringConversationTurnsCacheAt && now - steeringConversationTurnsCacheAt < ttl) {
    return steeringConversationTurnsCacheValue;
  }
  const selectors = [
    '[data-testid^="conversation-turn-"]',
    'article[data-testid*="conversation-turn"]',
    'main [data-message-author-role]',
  ];
  const maxRecentTurns = 24;
  let found = false;
  for (const selector of selectors) {
    const candidates = qsa(selector);
    const start = Math.max(0, candidates.length - maxRecentTurns);
    for (let i = start; i < candidates.length; i++) {
      const el = candidates[i];
      if (!isVisible(el)) continue;
      const author = String(el.getAttribute?.('data-message-author-role') || '').trim();
      const testId = String(el.getAttribute?.('data-testid') || '').trim();
      if (author || /conversation-turn/i.test(testId)) {
        found = true;
        break;
      }
    }
    if (found) break;
  }
  steeringConversationTurnsCacheAt = now;
  steeringConversationTurnsCacheValue = found;
  return found;
}
function shouldDockSteeringAtViewportBottom() {
  if (getSiteKey() !== 'chatgpt') return false;
  return !hasChatGptConversationTurns();
}
function getSteeringLayoutPositionKey() {
  return [
    steeringPanelOpen ? 'open' : 'closed',
    steeringQueue.length ? 'queued' : 'empty',
    steeringAdvancedEnabled ? 'advanced' : 'basic',
  ].join(':');
}
function applySteeringViewportSizeVars(bottomPx = 140) {
  if (!steeringHost) return;
  try {
    const viewportHeight = Math.max(420, Number(window.innerHeight) || 0);
    const bottom = Math.max(12, Number(bottomPx) || 0);
    const safeTop = 12;
    const launcherReserve = 76;
    const queueReserve = (steeringPanelOpen && steeringQueue.length) ? 186 : 0;
    const cardMax = Math.max(320, Math.min(560, Math.floor(viewportHeight - bottom - safeTop - launcherReserve - queueReserve)));
    const queueMax = Math.max(96, Math.min(176, Math.floor(viewportHeight * 0.24)));
    const queueListMax = Math.max(72, queueMax - 64);
    steeringHost.style.setProperty('--ready-ai-card-max-height', `${cardMax}px`);
    steeringHost.style.setProperty('--ready-ai-queue-max-height', `${queueMax}px`);
    steeringHost.style.setProperty('--ready-ai-queue-list-max-height', `${queueListMax}px`);
  } catch (_) {}
}
function positionSteeringUi(force = false) {
  if (!steeringHost) return;
  const anchor = getSteeringAnchorElement();
  const layoutKey = getSteeringLayoutPositionKey();
  if (anchor) {
    try {
      const rect = anchor.getBoundingClientRect();
      const isChatGpt = getSiteKey() === 'chatgpt';
      const chatGptRightShift = isChatGpt ? 250 : 0;
      const chatGptScrollbarGutter = isChatGpt ? 12 : 0;
      const right = Math.max(12 + chatGptScrollbarGutter, Math.round(window.innerWidth - rect.right - chatGptRightShift + chatGptScrollbarGutter));
      const bottomAnchor = isChatGpt ? (window.innerHeight - 122) : (rect.top - 10);
      const bottom = Math.max(12, Math.round(window.innerHeight - bottomAnchor));
      const signature = `${right}|${bottom}|${isChatGpt ? 'chatgpt-stable' : 'anchor'}|${layoutKey}`;
      if (!force && steeringLastPositionSignature === signature) return;
      steeringLastPositionSignature = signature;
      steeringHost.style.left = 'auto';
      steeringHost.style.transform = 'none';
      steeringHost.style.right = `${right}px`;
      steeringHost.style.bottom = `${bottom}px`;
      applySteeringViewportSizeVars(bottom);
      return;
    } catch (_) {}
  }
  if (shouldDockSteeringAtViewportBottom()) {
    const bottomDockSignature = `18|18|bottomdock|${layoutKey}`;
    if (!force && steeringLastPositionSignature === bottomDockSignature) return;
    steeringLastPositionSignature = bottomDockSignature;
    steeringHost.style.left = 'auto';
    steeringHost.style.transform = 'none';
    steeringHost.style.right = '18px';
    steeringHost.style.bottom = '18px';
    applySteeringViewportSizeVars(18);
    return;
  }
  const fallbackSignature = `18|140|${layoutKey}`;
  if (!force && steeringLastPositionSignature === fallbackSignature) return;
  steeringLastPositionSignature = fallbackSignature;
  steeringHost.style.left = 'auto';
  steeringHost.style.transform = 'none';
  steeringHost.style.right = '18px';
  steeringHost.style.bottom = '140px';
  applySteeringViewportSizeVars(140);
}
function fitOpenSteeringUiInsideViewport() {
  if (!steeringHost || !steeringPanelOpen) return;
  try {
    const safeTop = 12;
    const rect = steeringHost.getBoundingClientRect();
    if (!Number.isFinite(rect.top) || rect.top >= safeTop) return;
    const currentBottom = Math.max(12, Number.parseFloat(steeringHost.style.bottom || '12') || 12);
    const nextBottom = Math.max(12, Math.floor(currentBottom - (safeTop - rect.top)));
    if (Math.abs(nextBottom - currentBottom) < 1) return;
    steeringHost.style.bottom = `${nextBottom}px`;
  } catch (_) {}
}
window.addEventListener('resize', () => {
  positionSteeringUi();
  fitOpenSteeringUiInsideViewport();
});
function isSteeringTarget(target) {
  if (!target) return false;
  try {
    if (steeringHost && steeringHost.contains(target)) return true;
  } catch (_) {}
  try {
    if (steeringRoot && target?.getRootNode?.() === steeringRoot) return true;
  } catch (_) {}
  return false;
}
function getCurrentComposerText(el) {
  if (!el) return '';
  const tagName = String(el.tagName || '').toLowerCase();
  try {
    if (tagName === 'textarea' || tagName === 'input') return String(el.value || '');
    if (el.isContentEditable) return String(el.innerText || el.textContent || '');
  } catch (_) {}
  return '';
}
function mergeSteeringText(existingText, nextText) {
  const existing = String(existingText || '').trim();
  const next = String(nextText || '').trim();
  if (!existing) return next;
  if (!next) return existing;
  if (existing === next) return existing;
  return `${existing}
${next}`;
}
function findVisibleEditable(selectors) {
  for (const selector of selectors) {
    const candidates = qsa(selector);
    for (const el of candidates) {
      if (!el || !isVisible(el)) continue;
      try {
        if (typeof isSteeringTargetNode === 'function' && isSteeringTargetNode(el)) continue;
      } catch (_) {}
      if (el.disabled === true || el.readOnly === true) continue;
      if (el.getAttribute?.('aria-hidden') === 'true') continue;
      return el;
    }
  }
  return null;
}
