(function () {
  if (window.top !== window) return;

  const FLAG = '__ReadyAiChatGptBootstrapV1';
  if (globalThis[FLAG]) return;
  globalThis[FLAG] = true;

  function isChatGptUrl(url) {
    try {
      const host = new URL(String(url || '')).hostname.toLowerCase();
      return host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com';
    } catch (_) {
      return false;
    }
  }

  if (!isChatGptUrl(location.href)) return;

  let lastRequestAt = 0;
  function requestReadyAiContent(reason) {
    const now = Date.now();
    if (now - lastRequestAt < 5000) return;
    lastRequestAt = now;
    try {
      chrome.runtime.sendMessage({
        action: 'ensure_content_for_current_chatgpt_tab',
        reason: reason || 'chatgpt_bootstrap',
      }, () => {
        try { void chrome.runtime.lastError; } catch (_) {}
      });
    } catch (_) {}
  }

  requestReadyAiContent('chatgpt_bootstrap');

  window.addEventListener('pageshow', () => requestReadyAiContent('chatgpt_pageshow'), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestReadyAiContent('chatgpt_visible');
  }, { passive: true });
})();
