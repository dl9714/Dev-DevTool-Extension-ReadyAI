# Content Script Structure

## Active Chrome Load Path

On this machine, Chrome's unpacked Ready_Ai entry currently points to:

`C:\Users\dl971\Development\project-extension\Ready_Ai`

Do not assume that editing this git checkout alone updates the running Chrome extension. After changing the extension, mirror the committed extension files to that load path, then reload the unpacked extension in Chrome. If this path is missing, recreate it from the current committed extension root before debugging missing panels.

## Injection Rules

The extension must not declare default `content_scripts` in `manifest.json`.
The background service worker manually injects content scripts only for the
active ChatGPT tab, queued ChatGPT tabs, or an explicit popup target tab.
For ChatGPT, injection must stay top-frame-only.

Manual injection load order:

1. `src/sites.js`
2. `src/content/part-01.js` through `src/content/part-12.js`

`src/content.js` was removed to avoid maintaining two copies of the same content script. If content logic changes, update the split files that are listed in `CONTENT_SCRIPT_FILES` inside `src/background.js`.

Do not re-add a ChatGPT `content_scripts` block to `manifest.json`, do not set `all_frames: true`, and do not restore `match_about_blank` for ChatGPT. Those settings wake too many frames/tabs and can make Chrome lag when several ChatGPT tabs are open.
