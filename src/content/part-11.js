function mountSteeringUi() {
  try { (document.body || document.documentElement).appendChild(steeringHost); } catch (_) {}
  restoreSteeringDraftToInput();
  applySteeringTheme();
  positionSteeringUi(true);
  renderSteeringQueue();
  renderSteeringTemplates();
  renderSteeringAttachments();
  syncSteeringAttachmentPreview();
}
function ensureSteeringUi() {
  if (steeringHost && steeringRoot && steeringRefs) {
    return reuseExistingSteeringUi();
  }
  createSteeringUiHost();
  buildSteeringRefs();
  bindSteeringUiEvents();
  mountSteeringUi();
  return steeringRefs;
}
function acknowledgeCompletion() {
  if (!monitoring) return;
  if (isGenerating) return;
  if (completionStatus !== 'completed') return;
  completionStatus = 'idle';
  updateTitleBadge();
  updateSteeringUi();
  chrome.runtime.sendMessage({
    action: 'user_activity',
    platform: getSiteKey(),
    siteName: activeSite?.name,
  });
}
function applySteeringUiNow() {
  if (!monitoring || !steeringEnabled) {
    hideSteeringUi();
    return;
  }
  const refs = ensureSteeringUi();
  if (!refs) return;
  const queueCountLabel = getSteeringQueueCountLabel();
  setSteeringTextIfChanged(refs.title, getSteeringStateLabel());
  setSteeringTextIfChanged(refs.meta, queueCountLabel);
  if (refs.tabTitleBadge) {
    setSteeringTextIfChanged(refs.tabTitleBadge, getCurrentTitleBadgeGlyph());
    setSteeringDatasetIfChanged(refs.tabTitleBadge, 'state', getCurrentTitleBadgeState());
  }
  if (refs.launcherCount) {
    setSteeringTextIfChanged(refs.launcherCount, queueCountLabel);
    setSteeringDisplayIfChanged(refs.launcherCount, steeringQueueCountVisible ? 'inline-flex' : 'none');
  }
  setSteeringTextIfChanged(refs.launcherTitle, getSteeringLauncherText());
  setSteeringTextIfChanged(refs.launcherSub, getSteeringLauncherSubText());
  if (refs.tabTitleMeta) refs.tabTitleMeta.textContent = hasCustomTabTitle() ? `크롬 탭 이름변경: ${normalizeCustomTabTitle(customTabTitle)} · 원래 제목: ${normalizeCustomTabTitle(nativePageTitle || activeSite?.name || 'AI')}` : `크롬 탭 이름 자동 · 원래 제목: ${normalizeCustomTabTitle(nativePageTitle || activeSite?.name || 'AI')}`;
  const titleInputActive = steeringRoot?.activeElement === refs.tabTitleInput;
  if (refs.tabTitleInput && (!titleInputActive || !String(refs.tabTitleInput.value || '').trim())) {
    setSteeringValueIfChanged(refs.tabTitleInput, normalizeCustomTabTitle(customTabTitle));
  }
  restoreSteeringDraftToInput();
  setSteeringDisabledIfChanged(refs.tabTitleSave, !IS_TOP_FRAME);
  setSteeringDisabledIfChanged(refs.tabTitleClear, !IS_TOP_FRAME || !hasCustomTabTitle());
  setSteeringDatasetIfChanged(refs.card, 'advanced', steeringAdvancedEnabled ? 'true' : 'false');
  setSteeringClassToggleIfChanged(refs.advancedCard, 'enabled', steeringAdvancedEnabled);
  setSteeringCheckedIfChanged(refs.advancedToggle, steeringAdvancedEnabled);
  setSteeringDisplayIfChanged(refs.advancedBody, steeringAdvancedEnabled ? 'flex' : 'none');
  const newChatCountActive = steeringRoot?.activeElement === refs.newChatCount;
  if (refs.newChatCount && !newChatCountActive && refs.newChatCount.value !== String(steeringNewChatTabCount)) {
    refs.newChatCount.value = String(steeringNewChatTabCount);
  }
  setSteeringTextIfChanged(refs.primary, getSteeringPrimaryLabel());
  setSteeringDisabledIfChanged(refs.primary, false);
  const hasDraftText = !!String(refs.input?.value || '').trim();
  const hasDraftImages = getSteeringDraftAttachmentCount() > 0;
  setSteeringDisabledIfChanged(refs.newChatSend, steeringNewChatSendPending || !steeringAdvancedEnabled || !hasDraftText || hasDraftImages);
  setSteeringDisabledIfChanged(refs.sendNow, !steeringQueue.length && !hasDraftText && !hasDraftImages);
  setSteeringDisabledIfChanged(refs.clear, !steeringQueue.length && !hasDraftText && !hasDraftImages);
  if (refs.runNext) setSteeringTextIfChanged(refs.runNext, getSteeringResumeLabel());
  setSteeringDisabledIfChanged(refs.runNext, !steeringQueue.length);
  setSteeringDisabledIfChanged(refs.clearQueue, !steeringQueue.length);
  setSteeringDisplayIfChanged(refs.launcherRow, steeringLauncherVisible ? 'inline-flex' : 'none');
  setSteeringDisplayIfChanged(refs.launcher, steeringLauncherVisible ? 'inline-flex' : 'none');
  setSteeringDisplayIfChanged(refs.card, steeringPanelOpen ? 'block' : 'none');
  applySteeringTheme();
  positionSteeringUi();
  renderSteeringQueue();
  renderSteeringTemplates();
  renderSteeringAttachments();
  syncSteeringAttachmentPreview();
  syncSteeringQueueCount();
  syncTitleBadgeFromUiRender(false);
  setSteeringDisplayIfChanged(steeringHost, (steeringPanelOpen || steeringLauncherVisible) ? 'block' : 'none');
}
function updateSteeringUi() {
  if (steeringUiRafId) return;
  const schedule = window.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16));
  steeringUiRafId = schedule(() => {
    steeringUiRafId = 0;
    applySteeringUiNow();
  });
}
// =========================
// Generating detection rules
// =========================
// Generating detection rules
// =========================
var CHATGPT_IMAGE_GENERATING_RE = /(\b(?:creating|generating|making|rendering|drawing)\s+(?:an?\s+)?images?\b|\bimages?\s+(?:is|are|being)?\s*(?:created|generated|rendered)\b|이미지(?:를|가)?\s*(?:생성|만들|그리)(?:하는|하고\s*있는|고\s*있는|는)?\s*중|이미지\s*생성\s*중)/i;
var CHATGPT_STOP_SELECTOR = '[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="stop"],button[aria-label*="\uC911\uC9C0"],button[data-testid*="stop"]';
var CHATGPT_IMAGE_STATUS_SELECTOR = '[role="status"],[aria-live],[aria-busy="true"],[data-testid*="image-generation"],[data-testid*="image_generation"],[data-testid*="generating-image"],[data-testid*="image-gen"],[data-testid*="progress"],[data-testid*="loading"]';
var CHATGPT_TURN_SELECTOR = '[data-message-author-role="assistant"],[data-testid^="conversation-turn-"],article[data-testid*="conversation-turn"]';
var CHATGPT_PROGRESS_SELECTOR = '[role="progressbar"],[aria-busy="true"],[data-testid*="progress"],[data-testid*="loading"],.animate-spin,.animate-pulse,[class*="shimmer"],[class*="skeleton"]';
function getElementSignalText(el) {
  if (!el) return '';
  const attrs = [
    el.getAttribute?.('aria-label'),
    el.getAttribute?.('title'),
    el.getAttribute?.('data-testid'),
    el.getAttribute?.('role'),
    el.getAttribute?.('class'),
  ];
  return `${attrs.filter(Boolean).join(' ')} ${el.textContent || ''}`.replace(/\s+/g, ' ').trim();
}
function hasChatGptImageGenerationSignal(el) {
  const signal = getElementSignalText(el);
  if (CHATGPT_IMAGE_GENERATING_RE.test(signal)) return true;
  return /(?:image|이미지).*(?:generat|creat|progress|loading|skeleton|생성|진행|로딩)|(?:generat|creat).*(?:image)/i.test(signal);
}
function hasChatGptProgressIndicator(el) {
  if (!el) return false;
  const candidates = el.matches?.(CHATGPT_PROGRESS_SELECTOR) ? [el] : Array.from(el.querySelectorAll?.(CHATGPT_PROGRESS_SELECTOR) || []);
  return candidates.some((candidate) => isVisible(candidate));
}
function getVisibleChatGptTurnCandidates() {
  const maxRecentTurns = 16;
  const out = [];
  const candidates = qsa(CHATGPT_TURN_SELECTOR);
  const start = Math.max(0, candidates.length - maxRecentTurns);
  for (let i = start; i < candidates.length; i++) {
    const el = candidates[i];
    if (!el || !isVisible(el)) continue;
    out.push(el);
    if (out.length >= maxRecentTurns) return out;
  }
  return out;
}
function isLikelyUserChatGptTurn(el) {
  const author = String(el?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase();
  if (author === 'user') return true;
  if (author === 'assistant') return false;
  const hasUser = !!el?.querySelector?.('[data-message-author-role="user"]');
  const hasAssistant = !!el?.querySelector?.('[data-message-author-role="assistant"]');
  return hasUser && !hasAssistant;
}
function detectChatGPTImageGenerating() {
  const statusCandidates = qsa(CHATGPT_IMAGE_STATUS_SELECTOR);
  const statusStart = Math.max(0, statusCandidates.length - 24);
  for (let i = statusStart; i < statusCandidates.length; i++) {
    const el = statusCandidates[i];
    if (!isVisible(el)) continue;
    if (hasChatGptImageGenerationSignal(el)) return true;
  }
  const turns = getVisibleChatGptTurnCandidates();
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (isLikelyUserChatGptTurn(turn)) continue;
    if (CHATGPT_IMAGE_GENERATING_RE.test(getElementSignalText(turn))) return true;
    if (hasChatGptProgressIndicator(turn) && hasChatGptImageGenerationSignal(turn)) return true;
  }
  return false;
}
function detectChatGPTGenerating() {
  const mergedBtns = qsa(CHATGPT_STOP_SELECTOR);
  return mergedBtns.some((btn) => isVisible(btn) && isEnabledButtonLike(btn));
}
function detectGeminiGenerating() {
  // Gemini: "중지" 또는 "Stop" 단어가 들어간 버튼이 화면에 보이는지 확인
  // (open shadowRoot 내부에 들어가는 케이스 대응)
  const btns = qsa('[aria-label*="중지"], [aria-label*="Stop"], [aria-label*="stop"]');
  return btns.some((btn) => isVisible(btn) && isEnabledButtonLike(btn));
}
function detectAiStudioGenerating() {
  // AI Studio는 "Run" 버튼이 사라지고 "Stop" 전용 요소가 생기거나,
  // Material icon이 fonticon/innerText로 stop 계열을 표시하는 경우가 많다.
  // 또한 일부 구성은 오픈 shadowRoot 아래에 버튼이 들어가므로 qsa(deep query) 사용.
  // 0) 명시적 stop 버튼
  const stopButtonSelectors = [
    'ms-stop-button',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
    'button[aria-label*="중지"]',
    'button[title*="Stop"]',
    'button[title*="중지"]',
  ];
  for (const sel of stopButtonSelectors) {
    const els = qsa(sel);
    if (els.some((e) => isVisible(e))) return true;
  }
  // 1) Run 버튼이 "Stop"으로 바뀌는 케이스(텍스트/aria-label 기반)
  const runBtnSelectors = [
    'ms-run-button button.run-button',
    'ms-run-button button[type="submit"]',
    'button.run-button',
    'button[aria-label="Run"]',
    'button[aria-label*="Run"]',
  ];
  const RUN_STOP_RE = /(\bstop\b|\bcancel\b|중지|취소)/i;
  for (const sel of runBtnSelectors) {
    const btns = qsa(sel);
    for (const btn of btns) {
      if (!isVisible(btn)) continue;
      const aria = (btn.getAttribute?.('aria-label') || '').trim();
      const title = (btn.getAttribute?.('title') || '').trim();
      const txt = (btn.innerText || btn.textContent || '').trim();
      const hay = `${aria} ${title} ${txt}`.trim();
      if (hay && RUN_STOP_RE.test(hay)) return true;
      // 아이콘으로만 표시되는 케이스
      const iconCandidates = [
        ...(btn.querySelectorAll?.('mat-icon') ? Array.from(btn.querySelectorAll('mat-icon')) : []),
        ...(btn.querySelectorAll?.('.material-symbols-outlined') ? Array.from(btn.querySelectorAll('.material-symbols-outlined')) : []),
      ];
      for (const icon of iconCandidates) {
        if (!icon) continue;
        const iconText = (icon.textContent || '').trim().toLowerCase();
        const fontIcon = (icon.getAttribute?.('fonticon') || '').trim().toLowerCase();
        const svgIcon = (icon.getAttribute?.('svgicon') || '').trim().toLowerCase();
        const iconHay = `${iconText} ${fontIcon} ${svgIcon}`.trim();
        if (!iconHay) continue;
        if (/(\bstop\b|stop_circle|stop_circle_filled|cancel)/i.test(iconHay)) return true;
      }
    }
  }
  // 2) Material icon (fonticon/innerText) 기반 stop
  const iconSelectors = [
    // fonticon으로 stop을 쓰는 케이스
    'button mat-icon[fonticon="stop"]',
    'button mat-icon[fonticon="stop_circle"]',
    'mat-icon[fonticon="stop"]',
    'mat-icon[fonticon="stop_circle"]',
    // svgicon 기반
    'button mat-icon[svgicon*="stop"]',
    'mat-icon[svgicon*="stop"]',
    // material symbols(outlined) text 기반
    'button .material-symbols-outlined:not([class*="keyboard"])',
    '.material-symbols-outlined:not([class*="keyboard"])',
    // 일반 mat-icon 텍스트
    'button mat-icon',
    'mat-icon',
  ];
  for (const sel of iconSelectors) {
    const els = qsa(sel);
    for (const el of els) {
      if (!isVisible(el)) continue;
      const t = (el.textContent || '').trim().toLowerCase();
      const fontIcon = (el.getAttribute?.('fonticon') || '').trim().toLowerCase();
      const svgIcon = (el.getAttribute?.('svgicon') || '').trim().toLowerCase();
      const hay = `${t} ${fontIcon} ${svgIcon}`.trim();
      if (!hay) continue;
      if (/(\bstop\b|stop_circle|stop_circle_filled|\bcancel\b)/i.test(hay)) return true;
    }
  }
  // 3) 로딩/프로그레스 인디케이터
  const progressSelectors = [
    '.mat-progress-spinner',
    '.mat-mdc-progress-spinner',
    'mat-progress-spinner',
    'mat-spinner',
    '.mat-progress-bar',
    '.mat-mdc-progress-bar',
    'mat-progress-bar',
  ];
  for (const sel of progressSelectors) {
    const els = qsa(sel);
    if (els.some((e) => isVisible(e))) return true;
  }
  // 4) aria-busy 힌트
  const busy = qsa('[aria-busy="true"]');
  if (busy.some((e) => isVisible(e))) return true;
  return false;
}
function detectClaudeGenerating() {
  // Claude: 버튼 텍스트에 "Stop"이 포함되어 있는지 확인
  const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
  return buttons.some((btn) => String(btn.textContent || '').includes('Stop') && isVisible(btn));
}
function detectGenericStopGenerating() {
  // 범용: Stop/중지/Cancel/취소/Abort 텍스트 or aria-label 기반
  // (등록된 사이트에서만 쓰이므로, 너무 공격적으로 잡지 않는다)
  const STOP_RE = /(\bstop\b|\bcancel\b|\babort\b|중지|취소)/i;
  const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const aria = (el.getAttribute('aria-label') || '').trim();
    const txt = (el.textContent || '').trim();
    const hay = `${aria} ${txt}`.trim();
    if (!hay) continue;
    if (STOP_RE.test(hay)) return true;
  }
  return false;
}
function detectGenerating(site) {
  const mode = site?.detection || 'generic_stop';
  if (mode === 'chatgpt') return detectChatGPTGenerating();
  if (mode === 'gemini') return detectGeminiGenerating();
  if (mode === 'aistudio') return detectAiStudioGenerating();
  if (mode === 'claude') return detectClaudeGenerating();
  return detectGenericStopGenerating();
}
function checkStatus() {
  if (!monitoring || !activeSite) return;
  const platform = activeSite.key;
  let currentlyGenerating = false;
  beginStatusQueryCache();
  try {
    // web component/shadow root 구조가 동적으로 바뀌는 사이트(AI Studio 등) 보강
    // open shadowRoot가 동적으로 생기는 사이트(특히 Gemini) 대비
    maybeRescanShadowRoots();
    currentlyGenerating = detectGenerating(activeSite);
  } catch (_) {
    currentlyGenerating = false;
  } finally {
    endStatusQueryCache();
  }
  // 상태가 변했을 때만 처리 + heartbeat(프레임 합산용)
  let shouldSend = false;
  let visualChanged = false;
  if (isGenerating !== currentlyGenerating) {
    isGenerating = currentlyGenerating;
    visualChanged = true;
    // 요구사항:
    // - 생성 시작: 🟢 -> 🟠
    // - 생성 완료: 🟠 -> ⚪ (탭이 포커스인지 여부와 무관하게 무조건 ⚪)
    // - ⚪ 상태는 "클릭/스크롤"로만 🟢로 돌아간다.
    if (isGenerating) {
      completionStatus = 'idle';
      steeringLastCompletionAt = 0;
      clearSteeringAutoSendTimer();
      clearSteeringSendLock();
      clearSteeringAwaitingResponseStart();
      markSteeringGenerationObserved();
    } else {
      completionStatus = 'completed';
      steeringLastCompletionAt = Date.now();
      // Completion may queue/follow up work, but the panel itself only opens via the launcher click.
      const canAdvanceSteeringQueue = !steeringAwaitingTurnCompletion || steeringObservedGenerationSinceSend;
      if (steeringAwaitingTurnCompletion && steeringObservedGenerationSinceSend) {
        clearSteeringTurnCompletionWait();
      }
      if (canAdvanceSteeringQueue) {
        scheduleSteeringQueueProcessing(STEERING_AUTO_SEND_DELAY_MS);
      }
    }
    armTitleBadgeStabilityWindow(isGenerating ? 1800 : 4000);
    shouldSend = true;
    ensurePolling(true);
  } else if (!hasSentInitialState) {
    // 초기 1회는 무조건 상태 전송(연두색 뱃지 표시용)
    shouldSend = true;
    visualChanged = true;
  } else {
    // frame TTL이 남지 않도록 주기적으로 status를 보내준다(오탐 방지: 5초에 1번)
    const now = Date.now();
    if (!_lastHeartbeatAt || now - _lastHeartbeatAt >= HEARTBEAT_MS) {
      shouldSend = true;
    }
  }
  if (shouldSend) {
    chrome.runtime.sendMessage({
      action: "status_update",
      platform,
      siteName: activeSite.name,
      isGenerating,
    });
    hasSentInitialState = true;
    _lastHeartbeatAt = Date.now();
  }
  if (visualChanged) {
    updateTitleBadge();
    updateSteeringUi();
  } else {
    syncTitleBadgeFromStatusLoop(false);
  }
}
function isEditableInteractionTarget(target) {
  if (!target) return false;
  try {
    if (target.closest?.('textarea, input, [contenteditable="true"], [role="textbox"]')) return true;
  } catch (_) {}
  const tagName = String(target?.tagName || '').toLowerCase();
  if (tagName === 'textarea' || tagName === 'input') return true;
  if (target?.isContentEditable) return true;
  return false;
}
function markTypingAcknowledged(event) {
  if (completionStatus !== 'completed' || isGenerating) return;
  if (isSteeringTarget(event?.target)) return;
  if (isComposerAcknowledgeSuppressed()) return;
  if (!isEditableInteractionTarget(event?.target)) return;
  acknowledgeCompletion();
}
// 사용자 상호작용(클릭/스크롤) 시 ⚪ -> 🟢 전환 (요구사항)
