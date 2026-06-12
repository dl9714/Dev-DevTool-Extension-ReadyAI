# Content Script Structure

## Active Chrome Load Path

On this machine, Chrome's unpacked Ready_Ai entry currently points to:

`C:\Users\dl971\Development\project-extension\Ready_Ai`

Do not assume that editing this git checkout alone updates the running Chrome extension. After changing the extension, mirror the committed extension files to that load path, then reload the unpacked extension in Chrome. If this path is missing, recreate it from the current committed extension root before debugging missing panels.

Chrome may also have the repo checkout itself loaded as another unpacked Ready_Ai extension:

`C:\Users\dl971\Development\DevTool\Dev-DevTool-Extension-ReadyAI`

Do not leave both Ready_Ai unpacked entries enabled during normal use. Two extension IDs inject separate isolated content scripts into the same ChatGPT page, which can duplicate follow-up buttons, make the panels fight over `#ready-ai-steering-host`, and freeze Chrome when more than one ChatGPT tab is open. The local canonical development extension id is `deojggohikpfbhgdjbdogmkdgpkcighm`; the older mirrored-path id observed on this PC is `ajnolilmicdilijebljgchoodgajnfeg`.

The content script has a page-level duplicate guard using `data-ready-ai-extension-owner`, `data-ready-ai-extension-id`, and `data-ready-ai-content-version`. Do not remove it. It lets one Ready_Ai instance own the ChatGPT page while duplicate instances answer `ping` but skip UI, status checks, and queue processing.

Do not bump the `readyAiContentVersion` handshake string for ordinary content changes. Chrome can keep an older service worker alive after files are updated; if the old worker expects the previous string and the newly injected content reports a newer string, the worker repeatedly reinjects the full content script set and can freeze ChatGPT tabs. Keep `READY_AI_CONTENT_VERSION` stable for compatibility, and put the actual build marker in `READY_AI_CONTENT_BUILD_VERSION` / `readyAiContentBuildVersion` / `data-ready-ai-content-version`.

## Injection Rules

The extension must not declare default `content_scripts` in `manifest.json`.
The background service worker manually injects content scripts only for the
active ChatGPT tab, queued ChatGPT tabs, or an explicit popup target tab.
For ChatGPT, injection must stay top-frame-only.

When a top-level ChatGPT URL loads, the background must ensure the content script even if the tab-active cache is stale. Chrome can emit URL/status events before this extension's active-tab metadata catches up, which otherwise makes newly opened ChatGPT tabs miss the follow-up launcher. This is safe only because ChatGPT injection remains top-frame-only and `readyAiContentVersion` stays stable.

Manual injection load order:

1. `src/sites.js`
2. `src/content/part-01.js` through `src/content/part-12.js`

`src/content.js` was removed to avoid maintaining two copies of the same content script. If content logic changes, update the split files that are listed in `CONTENT_SCRIPT_FILES` inside `src/background.js`.

Do not re-add a ChatGPT `content_scripts` block to `manifest.json`, do not set `all_frames: true`, and do not restore `match_about_blank` for ChatGPT. Those settings wake too many frames/tabs and can make Chrome lag when several ChatGPT tabs are open.
