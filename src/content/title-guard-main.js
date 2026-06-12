(function installReadyAiTitleGuard() {
  try {
    const host = String(location.hostname || '').toLowerCase();
    if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') return;
  } catch (_) {}
  if (window.__ReadyAiTitleGuardV7) {
    try {
      window.postMessage({ source: 'Ready_Ai', type: 'ready_ai_title_guard_ready', guardVersion: 7 }, '*');
    } catch (_) {}
    return;
  }
  const MESSAGE_TYPE = 'ready_ai_title_guard_state';
  const READY_TYPE = 'ready_ai_title_guard_ready';
  const ACK_TYPE = 'ready_ai_title_guard_ack';
  const GUARD_VERSION = 7;
  const PREFIX_RE = /^(?:[⚪🔵🟠🟢](?:\[?\d+\+?\]?|\s*(?:\d+\+?)?)?\s*)+/u;
  let state = {
    enabled: false,
    prefix: '',
    customBaseTitle: '',
    fallbackBaseTitle: '',
  };
  let writeDepth = 0;

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function cleanTitle(value) {
    return normalize(value).replace(PREFIX_RE, '').trimStart();
  }
  function composeTitle(rawTitle) {
    const raw = normalize(rawTitle);
    if (!state.enabled || !state.prefix) return raw;
    const base = normalize(state.customBaseTitle) || cleanTitle(raw) || normalize(state.fallbackBaseTitle) || 'AI';
    return `${state.prefix} ${base}`.trim();
  }
  function notify(type, extra = {}) {
    try {
      window.postMessage({
        source: 'Ready_Ai',
        type,
        guardVersion: GUARD_VERSION,
        ...extra,
      }, '*');
    } catch (_) {}
  }
  function announceReady() {
    notify(READY_TYPE);
  }
  function findTitleDescriptor() {
    let owner = document;
    while (owner) {
      const desc = Object.getOwnPropertyDescriptor(owner, 'title');
      if (desc && typeof desc.get === 'function' && typeof desc.set === 'function') {
        return { owner, desc };
      }
      owner = Object.getPrototypeOf(owner);
    }
    return null;
  }

  const found = findTitleDescriptor();
  function readTitle() {
    try {
      if (found?.desc?.get) return String(found.desc.get.call(document) || '');
    } catch (_) {}
    try { return String(document.querySelector('title')?.textContent || ''); } catch (_) {}
    return '';
  }
  function writeTitle(nextTitle) {
    const next = String(nextTitle || '');
    if (readTitle() === next) return;
    writeDepth += 1;
    try {
      if (found?.desc?.set) {
        found.desc.set.call(document, next);
        return;
      }
      let el = document.querySelector('title');
      if (!el) {
        el = document.createElement('title');
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = next;
    } catch (_) {
    } finally {
      writeDepth = Math.max(0, writeDepth - 1);
    }
  }
  function applyTitle(rawTitle) {
    if (writeDepth > 0) return;
    writeTitle(composeTitle(rawTitle == null ? readTitle() : rawTitle));
  }

  try {
    if (found?.owner && found?.desc?.set) {
      Object.defineProperty(found.owner, 'title', {
        configurable: true,
        enumerable: !!found.desc.enumerable,
        get() {
          return found.desc.get.call(this);
        },
        set(value) {
          if (this === document && writeDepth === 0) {
            writeDepth += 1;
            try {
              return found.desc.set.call(this, composeTitle(value));
            } finally {
              writeDepth = Math.max(0, writeDepth - 1);
            }
          }
          return found.desc.set.call(this, value);
        },
      });
    }
  } catch (_) {}

  try {
    const observer = new MutationObserver(() => {
      if (writeDepth === 0) applyTitle(readTitle());
    });
    const observe = () => {
      const target = document.head || document.documentElement;
      if (!target) return;
      try {
        observer.disconnect();
        observer.observe(target, { childList: true, subtree: true, characterData: true });
      } catch (_) {}
    };
    observe();
    document.addEventListener('readystatechange', observe, true);
  } catch (_) {}

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source !== 'Ready_Ai' || data.type !== MESSAGE_TYPE) return;
    state = {
      enabled: !!data.enabled,
      prefix: normalize(data.prefix),
      customBaseTitle: normalize(data.customBaseTitle),
      fallbackBaseTitle: normalize(data.fallbackBaseTitle),
    };
    applyTitle(readTitle());
    notify(ACK_TYPE, { seq: Number(data.seq) || 0 });
  }, false);

  window.__ReadyAiTitleGuardV7 = true;
  window.__ReadyAiTitleGuardV6 = true;
  window.__ReadyAiTitleGuardV5 = true;
  window.__ReadyAiTitleGuardV4 = true;
  applyTitle(readTitle());
  announceReady();
  setTimeout(announceReady, 0);
  setTimeout(announceReady, 120);
  setTimeout(announceReady, 500);
  setTimeout(announceReady, 1500);
})();
