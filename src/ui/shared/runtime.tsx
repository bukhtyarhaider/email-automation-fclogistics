import { uiScope } from './lifecycle';
import { renderRegion } from './regions';
import { displayText } from './utils';
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
import type { ActionResult } from './types/api';
import { requestJson } from './api';
import { errorMessage } from './utils';
export { element as $ } from './dom';
export { displayText } from './utils';
import { element as $ } from './dom';
import { session } from './session';
import { refresh } from '../app/runtime/refresh';
import { loadLeads } from '../features/leads/controller';
import { loadHistory } from '../features/history/controller';
import { updateControls } from '../app/runtime/controls';
import type { Template } from './types/domain';
import type { Dictionary } from './types/utilities';

export function waitDuration(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${secs}s`]
    .filter(Boolean)
    .join(' ');
}

export function waitClock(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds) || 0);
  const parts = [Math.floor(total / 60) % 60, total % 60];
  if (total >= 3600) parts.unshift(Math.floor(total / 3600));
  return parts.map((n) => String(n).padStart(2, '0')).join(':');
}

export async function api<T = ActionResult>(url: string, data?: unknown): Promise<T> {
  return requestJson<T>(url, data);
}

export function notice(text: string | null | undefined, _tone?: string) {
  const el = $('notice');
  if (!el) return;
  el.hidden = !text;
  el.textContent = String(text);
  if (text) {
    uiScope.clearTimeout(noticeTimer);
    noticeTimer = uiScope.timeout(() => {
      el.hidden = true;
    }, 7000);
  }
}

export async function action(button: EventTarget | null, fn: () => unknown | Promise<unknown>) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (session.pending) return;
  session.pending = true;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  notice('');
  try {
    await fn();
    await refresh();
    await loadLeads();
    await loadHistory();
  } catch (e) {
    notice(errorMessage(e));
  } finally {
    session.pending = false;
    button.textContent = original;
    button.disabled = false;
    updateControls();
  }
}

export async function copyToClipboard(text: string | undefined) {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.warn('navigator.clipboard failed, attempting fallback execCommand', e);
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    return false;
  }
}

export function downloadJson(
  data: { exportedAt?: string; templates?: Dictionary<Template> },
  filename: string,
) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function syncOptions(
  id: string,
  entries: Array<{ id: string; name: string }>,
  value: string,
) {
  const el = $<HTMLSelectElement>(id);
  if (!el) return;
  const snapshot = JSON.stringify(entries.map((x) => [x.id, x.name]));
  if (el.dataset.options !== snapshot) {
    renderRegion(
      el,
      entries.map((x: { id: unknown; name: unknown }) => (
        <>
          <option value={displayText(x.id)}>{displayText(x.name)}</option>
        </>
      )),
    );
    el.dataset.options = snapshot;
  }
  el.value = value || '';
}
