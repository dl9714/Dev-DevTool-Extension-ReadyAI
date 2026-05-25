var STEERING_UI_STYLE_TEMPLATE_B = `
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .queue-action {
        border: 0;
        background: transparent;
        color: #94a3b8;
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        padding: 0 2px;
      }
      .queue-action.hidden {
        display: none;
      }
      .queue-action.solid,
      .queue-action.muted {
        padding: 5px 7px;
        border-radius: 8px;
        font-size: 10px;
        line-height: 1.1;
        font-weight: 800;
        border: 1px solid rgba(148, 163, 184, 0.24);
      }
      .queue-action.solid {
        background: rgba(99, 102, 241, 0.18);
        color: #eef2ff;
        border-color: rgba(99, 102, 241, 0.32);
      }
      .queue-action.muted {
        background: rgba(148, 163, 184, 0.1);
        color: #e2e8f0;
      }
      .dock[data-theme="light"] .queue-action.muted {
        color: #334155;
      }
      .queue-action.danger {
        color: #fca5a5;
      }
      .title-edit-card {
        margin-top: 10px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 14px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.03);
      }
      .dock[data-theme="light"] .title-edit-card {
        background: rgba(248, 250, 252, 0.95);
      }
      .title-edit-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
      }
      .title-edit-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        color: #e5e7eb;
        font-size: 11px;
        font-weight: 800;
        line-height: 1.25;
      }
      .dock[data-theme="light"] .title-edit-label {
        color: #0f172a;
      }
      .title-label-badge {
        display: inline-block;
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
        flex: 0 0 auto;
      }
      .title-edit {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 6px;
        align-items: center;
        margin-top: 8px;
      }
      .title-input {
        min-width: 0;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 10px;
        background: rgba(2, 6, 23, 0.32);
        color: #f8fafc;
        padding: 8px 10px;
        font-size: 11px;
        line-height: 1.2;
        outline: none;
      }
      .title-input:focus {
        border-color: rgba(99, 102, 241, 0.5);
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
      }
      .title-btn {
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.06);
        color: #e2e8f0;
        padding: 8px 10px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .title-btn.subtle {
        background: transparent;
        color: #cbd5e1;
      }
      .dock[data-theme="light"] .title-input {
        background: rgba(248, 250, 252, 0.96);
        color: #0f172a;
      }
      .dock[data-theme="light"] .title-btn {
        background: rgba(248, 250, 252, 0.96);
        color: #334155;
      }
      .dock[data-theme="light"] .title-btn.subtle {
        color: #64748b;
      }
      .title-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }
      .title-preset-btn {
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: #cbd5e1;
        padding: 5px 9px;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
      }
      .dock[data-theme="light"] .title-preset-btn {
        background: rgba(248, 250, 252, 0.96);
        color: #475569;
      }
      .title-meta {
        min-width: 0;
        flex: 1 1 auto;
        font-size: 10px;
        line-height: 1.35;
        color: #94a3b8;
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dock[data-theme="light"] .title-meta {
        color: #64748b;
      }
      .card[data-advanced="true"] {
        width: min(430px, calc(100vw - 28px));
        max-height: min(760px, calc(100vh - 32px));
        overflow-y: auto;
        padding-bottom: 16px;
      }
      .card[data-advanced="true"] .input {
        min-height: 132px;
      }
      .advanced-card {
        margin-top: 10px;
        border: 1px solid rgba(99, 102, 241, 0.2);
        border-radius: 14px;
        padding: 10px;
        background: rgba(99, 102, 241, 0.08);
      }
      .dock[data-theme="light"] .advanced-card {
        background: rgba(99, 102, 241, 0.06);
      }
      .advanced-toggle-row,
      .advanced-field-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .advanced-toggle-row {
        justify-content: space-between;
      }
      .advanced-copy {
        min-width: 0;
      }
      .advanced-title {
        color: #eef2ff;
        font-size: 11px;
        font-weight: 800;
        line-height: 1.3;
      }
      .dock[data-theme="light"] .advanced-title {
        color: #312e81;
      }
      .advanced-sub,
      .advanced-hint {
        color: #a5b4fc;
        font-size: 10px;
        line-height: 1.4;
      }
      .dock[data-theme="light"] .advanced-sub,
      .dock[data-theme="light"] .advanced-hint {
        color: #64748b;
      }
      .advanced-switch {
        position: relative;
        display: inline-flex;
        width: 42px;
        height: 24px;
        flex: 0 0 auto;
        cursor: pointer;
      }
      .advanced-switch input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      .advanced-switch span {
        width: 100%;
        height: 100%;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.28);
        border: 1px solid rgba(148, 163, 184, 0.24);
        transition: background 0.16s ease, border-color 0.16s ease;
      }
      .advanced-switch span::after {
        content: '';
        position: absolute;
        top: 4px;
        left: 4px;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: #f8fafc;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.25);
        transition: transform 0.16s ease;
      }
      .advanced-switch input:checked + span {
        background: rgba(99, 102, 241, 0.82);
        border-color: rgba(129, 140, 248, 0.76);
      }
      .advanced-switch input:checked + span::after {
        transform: translateX(18px);
      }
      .advanced-body {
        display: none;
        flex-direction: column;
        gap: 8px;
        margin-top: 10px;
      }
      .advanced-card.enabled .advanced-body {
        display: flex;
      }
      .advanced-field-row label {
        color: #c7d2fe;
        font-size: 10px;
        font-weight: 800;
        white-space: nowrap;
      }
      .dock[data-theme="light"] .advanced-field-row label {
        color: #4338ca;
      }
      .advanced-field-row input {
        width: 56px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 10px;
        background: rgba(2, 6, 23, 0.32);
        color: #f8fafc;
        padding: 7px 8px;
        font-size: 11px;
        font-weight: 800;
        outline: none;
      }
      .dock[data-theme="light"] .advanced-field-row input {
        background: rgba(248, 250, 252, 0.96);
        color: #0f172a;
      }
      .advanced-btn {
        flex: 1 1 auto;
        border: 1px solid rgba(129, 140, 248, 0.36);
        border-radius: 10px;
        background: linear-gradient(180deg, rgba(129, 140, 248, 0.32), rgba(99, 102, 241, 0.16));
        color: #eef2ff;
        padding: 8px 10px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
        white-space: nowrap;
      }
      .advanced-btn[disabled] {
        opacity: 0.55;
        cursor: default;
      }
      .dock[data-theme="light"] .advanced-btn {
        background: linear-gradient(180deg, rgba(99, 102, 241, 0.16), rgba(99, 102, 241, 0.06));
        color: #312e81;
      }
.template-wrap {
  display: none;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 14px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
}
.dock[data-theme="light"] .template-wrap {
  background: rgba(248, 250, 252, 0.95);
}
.template-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.template-label {
  font-size: 11px;
  font-weight: 800;
}
.template-sub {
  font-size: 10px;
  color: #94a3b8;
}
.dock[data-theme="light"] .template-sub {
  color: #64748b;
}
.template-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.template-btn {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #e8ecff;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.template-btn:hover {
  border-color: rgba(129, 140, 248, 0.4);
  background: rgba(99, 102, 241, 0.2);
}
.dock[data-theme="light"] .template-btn {
  background: rgba(99, 102, 241, 0.08);
  color: #3730a3;
}
.status {
        min-height: 16px;
        margin-top: 8px;
        font-size: 11px;
        line-height: 1.4;
        color: #94a3b8;
      }
      .dock[data-theme="light"] .status {
        color: #64748b;
      }
      .status[data-state="error"] {
        color: #f87171;
      }
      .attachment-wrap {
        display: none;
        flex-direction: column;
        gap: 8px;
        margin-top: 10px;
        border: 1px dashed rgba(148, 163, 184, 0.28);
        border-radius: 14px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.03);
      }
      .attachment-wrap.dragging {
        border-color: rgba(99, 102, 241, 0.7);
        background: rgba(99, 102, 241, 0.08);
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
      }
      .dock[data-theme="light"] .attachment-wrap {
        background: rgba(248, 250, 252, 0.92);
      }
      .attachment-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .attachment-meta-line {
        font-size: 11px;
        color: #94a3b8;
      }
      .dock[data-theme="light"] .attachment-meta-line {
        color: #64748b;
      }
      .attachment-dropzone {
        display: flex;
        min-height: 54px;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        border-radius: 12px;
        border: 1px dashed rgba(129, 140, 248, 0.44);
        background: rgba(99, 102, 241, 0.08);
        text-align: center;
        color: #e0e7ff;
      }
      .attachment-dropzone[hidden] {
        display: none;
      }
      .attachment-dropzone strong {
        font-size: 11px;
        line-height: 1.25;
      }
      .attachment-dropzone span {
        max-width: 260px;
        font-size: 9.5px;
        line-height: 1.25;
        color: #a5b4fc;
      }
      .dock[data-theme="light"] .attachment-dropzone {
        background: rgba(99, 102, 241, 0.06);
        color: #3730a3;
      }
      .dock[data-theme="light"] .attachment-dropzone span {
        color: #64748b;
      }
      .attachment-hint {
        font-size: 10px;
        line-height: 1.35;
        color: #94a3b8;
      }
      .dock[data-theme="light"] .attachment-hint {
        color: #64748b;
      }
      .attachment-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .attachment-btn {
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        color: #e2e8f0;
        padding: 5px 9px;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
      }
      .dock[data-theme="light"] .attachment-btn {
        background: rgba(248, 250, 252, 0.95);
        color: #334155;
      }
      .attachment-btn[disabled] {
        opacity: 0.45;
        cursor: default;
      }
      .attachment-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 180px;
        overflow: auto;
      }
      .attachment-list[hidden] {
        display: none;
      }
      .attachment-item {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(255, 255, 255, 0.04);
        padding: 6px;
      }
      .dock[data-theme="light"] .attachment-item {
        background: rgba(255, 255, 255, 0.9);
      }
      .attachment-thumb {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        object-fit: cover;
        background: rgba(15, 23, 42, 0.5);
        color: #cbd5e1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 800;
        cursor: pointer;
      }
      .attachment-meta {
        min-width: 0;
      }
      .attachment-name {
        font-size: 11px;
        font-weight: 700;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .attachment-sub {
        margin-top: 2px;
        font-size: 10px;
        color: #94a3b8;
      }
      .dock[data-theme="light"] .attachment-sub {
        color: #64748b;
      }
      .attachment-row-actions {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .attachment-mini-btn,
      .attachment-remove {
        border: none;
        min-width: 26px;
        height: 26px;
        padding: 0 8px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.88);
        cursor: pointer;
        font-size: 11px;
        line-height: 1;
      }
      .dock[data-theme="light"] .attachment-mini-btn,
      .dock[data-theme="light"] .attachment-remove {
        background: rgba(241, 245, 249, 0.95);
        color: #334155;
      }
      .attachment-remove {
        color: #fca5a5;
      }
      .attachment-mini-btn[disabled],
      .attachment-remove[disabled] {
        opacity: 0.38;
        cursor: default;
      }
      .attachment-preview {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 22px;
        background: rgba(3, 7, 18, 0.78);
      }
      .attachment-preview[hidden] {
        display: none;
      }
      .attachment-preview-card {
        width: min(860px, calc(100vw - 28px));
        max-height: calc(100vh - 28px);
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(15, 23, 42, 0.97);
        box-shadow: 0 24px 70px rgba(0,0,0,0.42);
      }
      .attachment-preview-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .attachment-preview-title {
        font-size: 13px;
        font-weight: 800;
        color: #f8fafc;
      }
      .attachment-preview-close,
      .attachment-preview-nav {
        border: none;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.92);
        cursor: pointer;
      }
      .attachment-preview-body {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      .attachment-preview-image {
        max-width: min(760px, calc(100vw - 130px));
        max-height: calc(100vh - 170px);
        border-radius: 18px;
        object-fit: contain;
        background: rgba(255,255,255,0.03);
      }
      .attachment-preview-file {
        min-width: min(420px, calc(100vw - 150px));
        max-width: min(620px, calc(100vw - 150px));
        min-height: 220px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 26px;
        border-radius: 18px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        background: rgba(255,255,255,0.04);
        text-align: center;
      }
      .attachment-preview-file[hidden] {
        display: none;
      }
      .attachment-preview-file-icon {
        min-width: 72px;
        height: 72px;
        padding: 0 14px;
        border-radius: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(99, 102, 241, 0.16);
        color: #c7d2fe;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.04em;
      }
      .attachment-preview-file-name {
        max-width: 100%;
        color: #f8fafc;
        font-size: 14px;
        font-weight: 800;
        word-break: break-word;
      }
      .attachment-preview-file-hint {
        color: rgba(226, 232, 240, 0.72);
        font-size: 12px;
        line-height: 1.45;
      }
      .attachment-preview-meta {
        font-size: 12px;
        line-height: 1.45;
        color: rgba(226, 232, 240, 0.78);
        word-break: break-word;
      }
      .file-input {
        display: none;
      }
      .launcher {
        border-color: rgba(148, 163, 184, 0.3);
        background: rgba(15, 23, 42, 0.96);
        box-shadow: 0 16px 34px rgba(2, 6, 23, 0.34);
      }
      .launcher-count {
        background: rgba(30, 41, 59, 0.82);
      }
      .card,
      .queue-wrap,
      .title-edit-card,
      .template-wrap,
      .advanced-card,
      .attachment-wrap,
      .attachment-preview-card {
        border-radius: 8px;
      }
      .card {
        border-color: rgba(100, 116, 139, 0.42);
        background: rgba(15, 23, 42, 0.98);
        box-shadow: 0 22px 54px rgba(2, 6, 23, 0.5);
      }
      .top {
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.16);
      }
      .title {
        letter-spacing: 0;
      }
      .input,
      .title-input,
      .queue-edit-input,
      .advanced-field-row input {
        border-radius: 8px;
        border-color: rgba(148, 163, 184, 0.3);
        background: rgba(2, 6, 23, 0.42);
      }
      .input:focus,
      .title-input:focus,
      .queue-edit-input:focus,
      .advanced-field-row input:focus {
        border-color: rgba(37, 99, 235, 0.62);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
      }
      .btn,
      .title-btn,
      .advanced-btn,
      .queue-head-btn,
      .attachment-btn,
      .template-btn {
        border-radius: 8px;
        transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
      }
      .btn {
        border-color: rgba(37, 99, 235, 0.4);
        background: #1d4ed8;
        color: #eff6ff;
      }
      .btn.secondary,
      .btn.subtle,
      .title-btn,
      .queue-head-btn,
      .attachment-btn {
        background: rgba(30, 41, 59, 0.74);
      }
      .btn:not([disabled]):hover,
      .title-btn:not([disabled]):hover,
      .advanced-btn:not([disabled]):hover,
      .queue-head-btn:not([disabled]):hover,
      .attachment-btn:not([disabled]):hover,
      .template-btn:not([disabled]):hover {
        border-color: rgba(96, 165, 250, 0.58);
        box-shadow: 0 8px 18px rgba(2, 6, 23, 0.18);
      }
      .advanced-card {
        border-color: rgba(37, 99, 235, 0.28);
        background: rgba(30, 41, 59, 0.48);
      }
      .advanced-switch input:checked + span {
        background: #2563eb;
        border-color: rgba(96, 165, 250, 0.7);
      }
      .card[data-advanced="true"] #ready-ai-steering-primary,
      .advanced-btn {
        background: linear-gradient(180deg, rgba(20, 184, 166, 0.36), rgba(15, 118, 110, 0.58));
        border-color: rgba(45, 212, 191, 0.46);
        color: #ecfeff;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }
      .card[data-advanced="true"] #ready-ai-steering-primary:not([disabled]):hover,
      .advanced-btn:not([disabled]):hover {
        background: linear-gradient(180deg, rgba(20, 184, 166, 0.5), rgba(13, 148, 136, 0.66));
        border-color: rgba(94, 234, 212, 0.62);
      }
      .advanced-btn[disabled] {
        background: rgba(20, 184, 166, 0.16);
        border-color: rgba(45, 212, 191, 0.2);
        color: rgba(204, 251, 241, 0.54);
      }
      .queue-wrap {
        border-color: rgba(100, 116, 139, 0.32);
        background: rgba(15, 23, 42, 0.96);
      }
      .queue-item,
      .attachment-item {
        border-radius: 8px;
        background: rgba(30, 41, 59, 0.58);
      }
      .status {
        color: #93c5fd;
      }
      .dock[data-theme="light"] .launcher,
      .dock[data-theme="light"] .card,
      .dock[data-theme="light"] .queue-wrap,
      .dock[data-theme="light"] .title-edit-card,
      .dock[data-theme="light"] .template-wrap,
      .dock[data-theme="light"] .advanced-card,
      .dock[data-theme="light"] .attachment-wrap {
        background: rgba(255, 255, 255, 0.98);
        border-color: rgba(203, 213, 225, 0.82);
      }
      .dock[data-theme="light"] .card {
        box-shadow: 0 22px 54px rgba(15, 23, 42, 0.18);
      }
      .dock[data-theme="light"] .input,
      .dock[data-theme="light"] .title-input,
      .dock[data-theme="light"] .queue-edit-input,
      .dock[data-theme="light"] .advanced-field-row input {
        background: #f8fafc;
        border-color: #cbd5e1;
      }
      .dock[data-theme="light"] .btn {
        background: #eff6ff;
        color: #1d4ed8;
      }
      .dock[data-theme="light"] .card[data-advanced="true"] #ready-ai-steering-primary,
      .dock[data-theme="light"] .advanced-btn {
        background: linear-gradient(180deg, #ccfbf1, #99f6e4);
        border-color: #5eead4;
        color: #115e59;
      }
      .dock[data-theme="light"] .card[data-advanced="true"] #ready-ai-steering-primary:not([disabled]):hover,
      .dock[data-theme="light"] .advanced-btn:not([disabled]):hover {
        background: linear-gradient(180deg, #99f6e4, #5eead4);
        border-color: #2dd4bf;
      }
      .dock[data-theme="light"] .btn.secondary,
      .dock[data-theme="light"] .btn.subtle,
      .dock[data-theme="light"] .title-btn,
      .dock[data-theme="light"] .queue-head-btn,
      .dock[data-theme="light"] .attachment-btn {
        background: #f8fafc;
      }
      .dock[data-theme="light"] .queue-item,
      .dock[data-theme="light"] .attachment-item {
        background: #f8fafc;
      }
      .dock[data-theme="light"] .status {
        color: #2563eb;
      }
    </style>
`;