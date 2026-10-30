import { Button } from '../../design-system/primitives';
import { renderRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type { AppState } from '../../shared/types/api';
import { errorMessage } from '../../shared/utils';
import { session } from '../../shared/session';
import { api, $, syncOptions, waitDuration } from '../../shared/runtime';
import { fillTemplate, renderTemplatesTable } from '../../features/templates/controller';
import {
  fillSettings,
  fillProfile,
  renderFirebaseDiagnostics,
  renderProfilesTable,
} from '../../features/settings/controller';
import { fillCampaign } from '../../features/campaigns/controller';
import { renderLiveActivityView } from '../../features/live-activity/controller';
import { renderSuppressionList } from '../../features/suppression/controller';
import { updateControls } from './controls';
export async function refresh() {
  session.state = await api<AppState>('/api/state');
  if ($('releasePreviewBanner')) $('releasePreviewBanner').hidden = !session.state.previewMode;
  if ($('appVersion')) $('appVersion').textContent = `Desktop v${session.state.appVersion}`;
  for (const key of ['total', 'ready', 'excluded', 'sent']) {
    const el = $(key);
    if (el) el.textContent = session.state.counts[key].toLocaleString();
  }
  const conn = $('connection');
  if ($('browserSessionStatus'))
    $('browserSessionStatus').textContent =
      session.state.browserSession?.message || 'Connect your mailbox.';
  if (conn) {
    conn.textContent = session.state.connected ? 'Mailbox connected' : 'Mailbox disconnected';
    conn.className = `connection-pill ${session.state.connected ? 'good' : ''}`;
  }
  const wbName = $('workbookName');
  if (wbName) {
    wbName.textContent = session.state.workbook?.name || 'No workbook imported.';
  }
  const options = JSON.stringify(session.state.sheets);
  const sheetSelect = $('sheet');
  if (sheetSelect && sheetSelect.dataset.options !== options) {
    const v = sheetSelect.value;
    renderRegion(
      sheetSelect,
      <>
        <option value={''}>{'All worksheets'}</option>
        {session.state.sheets.map((s) => (
          <>
            <option value={displayText(s.name)}>
              {displayText(s.name)}
              {s.hidden ? ' (hidden)' : ''}
            </option>
          </>
        ))}
      </>,
    );
    sheetSelect.value = v;
    sheetSelect.dataset.options = options;
  }
  const templateOptions = JSON.stringify(
    Object.entries(session.state.templates).map(([k, t]) => [k, t.name]),
  );
  const tempSelect = $('template');
  if (tempSelect && tempSelect.dataset.options !== templateOptions) {
    const v = tempSelect.value;
    renderRegion(
      tempSelect,
      Object.entries(session.state.templates).map(([key, t]) => (
        <>
          <option value={displayText(key)}>{displayText(t.name)}</option>
        </>
      )),
    );
    if (session.state.templates[v]) tempSelect.value = v;
    tempSelect.dataset.options = templateOptions;
    fillTemplate();
  }
  const quotaEl = $('quota');
  if (quotaEl) {
    quotaEl.textContent = `${session.state.remaining} attempts remaining this rolling hour; ${session.state.dayRemaining} in the next rolling 24-hour allowance. One recipient per message.`;
  }
  syncOptions('profileSelect', session.state.profiles, session.state.activeProfile);
  syncOptions('campaignSelect', session.state.campaigns, session.state.activeCampaign);
  const p = session.state.profiles.find((p) => p.id === session.state.activeProfile);
  if ($('profileName')) $('profileName').textContent = p?.name || 'My Mailbox';
  if ($('brandName')) $('brandName').textContent = p?.business?.company || 'OUTREACH DESK';
  if ($('brandMark')) {
    $('brandMark').textContent = (p?.business?.company || 'Outreach Desk')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  if (!session.configLoaded) {
    fillSettings();
    fillProfile();
    fillCampaign();
    session.configLoaded = true;
    if (!p?.email && $('settingsDetails')) $('settingsDetails').open = true;
  }
  const teamSt = $('teamStatus');
  if (teamSt) {
    teamSt.textContent = session.state.settings.team.enabled
      ? session.state.teamConnected
        ? 'Team token connected. The shared server is checked before each send.'
        : 'Shared team server needs its access token.'
      : 'Independent PC mode. Other PCs’ sends are not tracked here.';
  }
  const nextSendEl = $('nextSend');
  const waitStatus = $('settingsWaitStatus');
  if (waitStatus) {
    const remaining = Math.max(
      0,
      Math.ceil((Date.parse(session.state.job.nextAt) - Date.now()) / 1000),
    );
    waitStatus.textContent = session.state.job.nextAt
      ? `${session.state.job.status} · ${waitDuration(remaining)} until the next queue check (${new Date(session.state.job.nextAt).toLocaleString()}). ${session.state.job.message || ''}`
      : `No scheduled wait. ${session.state.job.sincePause || 0} sends since the last rest.`;
  }
  if (nextSendEl) {
    nextSendEl.textContent = session.state.job.nextAt
      ? `Next check: ${new Date(session.state.job.nextAt).toLocaleString()} (${waitDuration((Date.parse(session.state.job.nextAt) - Date.now()) / 1000)} remaining)`
      : '';
  }
  const jobSt = $('jobStatus');
  if (jobSt) {
    jobSt.textContent = session.state.job.status;
    jobSt.className = `status-badge ${session.state.job.enabled ? 'active' : ''}`;
  }
  const jobMsg = $('jobMessage');
  if (jobMsg) jobMsg.textContent = session.state.job.message;
  const prog = $('progress');
  if (prog) {
    prog.max = session.state.job.total || 1;
    prog.value = session.state.job.current;
  }
  const eventsEl = $('events');
  if (eventsEl) {
    renderRegion(
      eventsEl,
      session.state.events
        .slice()
        .reverse()
        .slice(0, 15)
        .map((e) => (
          <>
            <li>
              <time>{displayText(new Date(e.at).toLocaleTimeString())}</time>
              <span>{displayText(errorMessage(e))}</span>
            </li>
          </>
        )),
    );
  }
  renderFirebaseDiagnostics();
  renderLiveActivityView();
  renderProfilesTable();
  renderTemplatesTable();
  renderSuppressionList();
  const rec = $('recovery');
  if (rec) {
    renderRegion(
      rec,
      Object.entries(session.state.attempts)
        .filter(([, i]) => i.status === 'Uncertain' || i.syncNeeded || i.teamSyncNeeded)
        .map(([email, i]) => (
          <>
            <div className={'recovery-item'}>
              <strong>{displayText(email)}</strong>
              <p>
                {i.status === 'Uncertain'
                  ? 'Send result uncertain. Check the Sent folder in your browser. This address remains blocked from automatic retries.'
                  : 'Send confirmed. Workbook update needs repair.'}
              </p>
              {i.status === 'Uncertain' ? (
                <>
                  <Button
                    className={'secondary'}
                    data-reconcile={displayText(email)}
                    data-outcome={'sent'}
                  >
                    {'I verified it was sent'}
                  </Button>
                  <Button
                    className={'secondary'}
                    data-reconcile={displayText(email)}
                    data-outcome={'not-sent'}
                  >
                    {'I verified it was not sent'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    className={'secondary'}
                    data-reconcile={displayText(email)}
                    data-outcome={'sent'}
                  >
                    {'Repair workbook status'}
                  </Button>
                </>
              )}
            </div>
          </>
        )),
    );
  }
  if (session.state.prepared && $('signatureText')) {
    $('signatureText').textContent =
      session.state.prepared.signature || 'No signature configured in this mailbox.';
  }
  updateControls();
}
