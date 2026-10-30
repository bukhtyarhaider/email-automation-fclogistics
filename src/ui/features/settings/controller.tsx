import { Icon, Trash2 } from '../../design-system/icons';
import type { BrowserDiscoveryResponse } from '../../shared/types/api';
import { Button } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import { renderRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type { Profile, Pacing } from '../../shared/types/domain';
import { eventElement } from '../../shared/dom';
import { errorMessage } from '../../shared/utils';
import { session } from '../../shared/session';
import { $, action, api, notice } from '../../shared/runtime';
import { updateTemplateLivePreview } from '../templates/controller';
import { updateControls } from '../../app/runtime/controls';
import { refresh } from '../../app/runtime/refresh';
export function renderProfilesTable() {
  const tbody = $('profilesTableBody');
  if (!tbody || !session.state?.profiles) return;
  const countBadge = $('profilesCountBadge');
  if (countBadge) {
    countBadge.textContent = `${session.state.profiles.length} Profile${session.state.profiles.length === 1 ? '' : 's'}`;
  }
  renderRegion(
    tbody,
    session.state.profiles.length ? (
      session.state.profiles.map((p) => {
        const isActive = p.id === session.state.activeProfile;
        const channelName = p.browserChannel === 'msedge' ? 'Edge' : 'Chrome';
        return (
          <>
            <tr>
              <td>
                <strong>{displayText(p.name || 'Untitled')}</strong>
              </td>
              <td>{displayText(p.email)}</td>
              <td>
                <span className={'tag-badge'}>{displayText(channelName)}</span>
                <small style={{ color: 'var(--text-muted)' }}>
                  {displayText(p.provider || 'webmail')}
                </small>
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className={'status-pill ' + (isActive ? 'ready' : 'blocked')}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <div className={'row-actions'}>
                  {!isActive ? (
                    <>
                      <Button
                        className={'secondary'}
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        data-select-profile={displayText(p.id)}
                        title={'Switch active mailbox'}
                      >
                        {'Activate'}
                      </Button>
                    </>
                  ) : (
                    ''
                  )}
                  <Button
                    className={'secondary'}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    data-edit-profile={displayText(p.id)}
                    title={'Edit profile in form'}
                  >
                    {'Edit'}
                  </Button>
                  <Button
                    className={'secondary danger-hover'}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    data-delete-profile={displayText(p.id)}
                    {...{ disabled: session.state.profiles.length <= 1 }}
                    title={'Delete this mailbox profile'}
                  >
                    <Icon icon={Trash2} size={12} />
                  </Button>
                </div>
              </td>
            </tr>
          </>
        );
      })
    ) : (
      <>
        <tr>
          <td
            colSpan={5}
            style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}
          >
            {'No profiles configured.'}
          </td>
        </tr>
      </>
    ),
  );
}

export function fillBrowserMethod() {
  if ($('cdpSettings')) $('cdpSettings').hidden = $('connectionMode')?.value !== 'cdp';
  const guide =
    session.state?.browserGuides?.[$('browserChannel')?.value] || session.state?.browserGuide;
  if ($('browserGuideMessage')) $('browserGuideMessage').textContent = guide?.message || '';
  if ($('browserDebugCommand')) $('browserDebugCommand').textContent = guide?.command || '';
}

export const pacingFields: Array<keyof Pacing> = [
  'minSeconds',
  'maxSeconds',
  'hourlyCap',
  'dailyCap',
  'pauseEveryMin',
  'pauseEveryMax',
  'pauseMinSeconds',
  'pauseMaxSeconds',
  'pollSeconds',
];

export const PACING_PRESETS: Record<string, Pacing & { name: string }> = {
  warmup: {
    name: 'New Mailbox Warmup',
    minSeconds: 240,
    maxSeconds: 480,
    hourlyCap: 10,
    dailyCap: 40,
    pauseEveryMin: 5,
    pauseEveryMax: 8,
    pauseMinSeconds: 900,
    pauseMaxSeconds: 1800,
    pollSeconds: 60,
  },
  balanced: {
    name: 'Balanced Human Pace',
    minSeconds: 150,
    maxSeconds: 300,
    hourlyCap: 18,
    dailyCap: 80,
    pauseEveryMin: 8,
    pauseEveryMax: 14,
    pauseMinSeconds: 600,
    pauseMaxSeconds: 1200,
    pollSeconds: 60,
  },
  established: {
    name: 'Aged / Established Domain',
    minSeconds: 90,
    maxSeconds: 180,
    hourlyCap: 25,
    dailyCap: 120,
    pauseEveryMin: 12,
    pauseEveryMax: 20,
    pauseMinSeconds: 480,
    pauseMaxSeconds: 900,
    pollSeconds: 45,
  },
  stealth: {
    name: 'Stealth Background',
    minSeconds: 300,
    maxSeconds: 600,
    hourlyCap: 8,
    dailyCap: 50,
    pauseEveryMin: 6,
    pauseEveryMax: 10,
    pauseMinSeconds: 900,
    pauseMaxSeconds: 1500,
    pollSeconds: 60,
  },
};

export function highlightPacingPreset(presetKey: string | null | undefined) {
  document.querySelectorAll<HTMLElement>('.pacing-preset-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.preset === presetKey);
  });
}

export function detectActivePreset() {
  for (const [key, preset] of Object.entries(PACING_PRESETS)) {
    let matches = true;
    for (const [field, val] of Object.entries(preset)) {
      if (field !== 'name') {
        const inputVal = Number(($(field) as HTMLInputElement)?.value);
        if (inputVal !== val) {
          matches = false;
          break;
        }
      }
    }
    if (matches) {
      highlightPacingPreset(key);
      return key;
    }
  }
  highlightPacingPreset(null);
  return null;
}

export function applyPacingPreset(presetKey: string, showNotice = true) {
  const preset = PACING_PRESETS[presetKey];
  if (!preset) return;
  for (const [key, val] of Object.entries(preset)) {
    if (key !== 'name' && $(key)) {
      ($(key) as HTMLInputElement).value = val;
    }
  }
  highlightPacingPreset(presetKey);
  if (showNotice) {
    notice(`Applied "${preset.name}" preset. Click "Save sending settings" to persist.`);
  }
}

export function readBusiness() {
  return {
    company: $('businessName')?.value || '',
    senderName: $('senderName')?.value || '',
    legalName: $('legalName')?.value || '',
    address: $('address')?.value || '',
    services: $('services')?.value || '',
  };
}

export function fillProfile(explicitProfile?: Profile) {
  const p =
    explicitProfile ||
    session.state.profiles.find(
      (p) => p.id === (session.profileEditId || session.state.activeProfile),
    );
  session.profileEditId = p?.id || null;
  if ($('accountName')) $('accountName').value = p?.name || '';
  if ($('accountEmail')) $('accountEmail').value = p?.email || '';
  if ($('accountUrl')) $('accountUrl').value = p?.url || 'https://privateemail.com/spm/mail/INBOX/';
  if ($('provider')) $('provider').value = p?.provider || 'privateemail';
  if ($('browserChannel')) $('browserChannel').value = p?.browserChannel || 'chrome';
  if ($('connectionMode')) $('connectionMode').value = p?.connectionMode || 'saved';
  if ($('cdpEndpoint')) $('cdpEndpoint').value = p?.cdpEndpoint || 'http://127.0.0.1:9222';
  if ($('autoReconnect')) $('autoReconnect').checked = p?.autoReconnect !== false;
  fillBrowserMethod();
  const b = p?.business || session.state.settings.business;
  for (const [id, key] of Object.entries({
    businessName: 'company',
    senderName: 'senderName',
    legalName: 'legalName',
    address: 'address',
    services: 'services',
  })) {
    if ($(id)) ($(id) as HTMLInputElement).value = b[key as keyof typeof b] || '';
  }
  updateTemplateLivePreview();
  updateControls();
}

export function updateTemplateCheckControls() {
  $('templateCheckOptions').disabled = !$('templateChecksEnabled').checked;
}

export function fillSettings() {
  const s = session.state.settings;
  const checks = s.templateChecks || {};
  $('templateChecksEnabled').checked = checks.enabled !== false;
  $('promotionalClaimsCheck').value = checks.promotionalClaims || 'warn';
  $('messageLengthCheck').value = checks.messageLength || 'warn';
  updateTemplateCheckControls();
  for (const key of pacingFields) {
    if ($(key)) ($(key) as HTMLInputElement).value = String(s.pacing[key]);
  }
  for (const key of ['requireActive', 'requireNoOutOfService', 'allowHidden']) {
    if ($(key))
      ($(key) as HTMLInputElement).checked =
        s.eligibility[key as 'requireActive' | 'requireNoOutOfService' | 'allowHidden'];
  }
  if ($('readyStatuses')) {
    $('readyStatuses').value = s.eligibility.readyStatuses.map((v) => v || 'blank').join(', ');
  }
  if ($('sentStatus')) $('sentStatus').value = s.eligibility.sentStatus;
  if ($('teamEnabled')) $('teamEnabled').checked = s.team.enabled;
  if ($('teamUrl')) $('teamUrl').value = s.team.url;
  if ($('workerName')) $('workerName').value = s.team.workerName;
  if ($('firebaseSyncMode')) {
    $('firebaseSyncMode').value = s.tracking?.syncMode || 'auto';
  }
  if ($('trackingPcId')) $('trackingPcId').value = s.tracking?.pcId || '';
  if ($('trackingPublicUrl')) $('trackingPublicUrl').value = s.tracking?.publicUrl || '';
  if ($('firebaseBackend')) $('firebaseBackend').value = s.tracking?.firebaseBackend || 'both';
  if ($('firebaseSyncMode')?.onchange) $('firebaseSyncMode').dispatchEvent(new Event('change'));
  detectActivePreset();
}

export function renderFirebaseDiagnostics() {
  const d = session.state?.firebaseSync;
  if (!d || !$('firebaseDiagnostics')) return;
  const badge = $('settingsFirebaseStatusBadge');
  badge.textContent = String(d.running ? 'Syncing' : d.status);
  badge.className = `status-pill ${d.status === 'Active' && !d!.warnings.length ? 'ready' : ''}`;
  $('settingsFirebaseDiag').textContent = String(d.message);
  renderRegion(
    $('firebaseWarnings'),
    d!.warnings.map((warning: unknown) => (
      <>
        <p>{displayText(warning)}</p>
      </>
    )),
  );
  $('firebaseWarnings').hidden = !d!.warnings.length;
  $('trackingPcIdHint').textContent =
    `Effective PC ID: ${d.pcId} · Source: ${d.pcIdSource}. Save a unique ID on each PC. Blank uses the environment, then the legacy default 1.`;
  const date = (value: string | null) => (value ? new Date(value).toLocaleString() : 'Not yet');
  const rows = [
    ['PC ID / source', `${d.pcId} / ${d.pcIdSource}`],
    ['Computer / platform', `${d.hostname} / ${d.platform}`],
    ['Team worker ID', d.workerId || 'Not set'],
    ['Local data folder', d.dataDirectory],
    ['Sync mode / interval', `${d.mode} / ${d.pollSeconds}s while running`],
    ['Selected database', d.backend],
    ['Firebase project', d.projectId || 'Not configured'],
    ['Realtime Database URL', d.databaseURL],
    ['Database URL source', d.databaseUrlSource],
    ['Credential source', d.credentialsSource],
    ['Credentials loaded', d.configured ? 'Yes; see connection results below' : 'No'],
    ['Cloud collection / path', d.collection],
    ['Effective public tracking URL', d.publicUrl || 'Not set'],
    ['Tracking URL source', d.publicUrlSource],
    [
      'New-email tracking / consent',
      `${d.openTrackingEnabled ? 'Enabled' : 'Disabled'} / ${d.consent ? 'Set' : 'Not set'}`,
    ],
    ['Local emails / tracking tokens', `${d.localRecords} / ${d.localTokens}`],
    ['Last attempt', date(d.lastAttemptAt)],
    ['Last completed cloud scan', date(d.lastSyncAt)],
    ['New signals this session', d.totalSynced],
    [
      'Scan limit per database / run',
      `${d!.pageSize * d!.maxPages} records; continues on next sync`,
    ],
    ['Last error', d.lastError || 'None reported this session'],
  ];
  renderRegion(
    $('firebaseDiagnostics'),
    rows.map(([label, value]) => (
      <>
        <div>
          <dt>{displayText(label)}</dt>
          <dd>{displayText(value)}</dd>
        </div>
      </>
    )),
  );
  renderRegion(
    $('firebaseBackendDiagnostics'),
    Object.entries(d.backends).map(([name, b]) => {
      const totals = b!.sweep || b;
      return (
        <>
          <div>
            <strong>
              {displayText(name)}
              {' · '}
              {b!.error ? 'Failed' : b!.complete ? 'Scan complete' : 'Scan in progress'}
            </strong>
            <p>
              {b!.scanned}
              {' checked this run · '}
              {b!.matched}
              {' matched · '}
              {b!.synced}
              {' new signals · '}
              {b!.alreadyApplied}
              {' already applied · '}
              {b!.acknowledged}
              {' acknowledged'}
            </p>
            <p>
              {totals.otherPc}
              {' other-PC events · '}
              {totals.unmatched}
              {' missing local matches · '}
              {totals.invalid}
              {' invalid events · '}
              {totals.pcMismatches}
              {' PC ID mismatches'}
              {b!.sweep ? ' (completed sweep)' : ' (this run)'}
            </p>
            {b!.error ? (
              <>
                <p className={'firebase-error'}>{displayText(b!.error)}</p>
              </>
            ) : (
              ''
            )}
          </div>
        </>
      );
    }),
  );
}

export function mountSettings() {
  if ($('connect'))
    uiScope.handler($('connect'), 'onclick', () =>
      action($('connect'), async () => {
        const password = $('password').value;
        $('password').value = '';
        const result = await api('/api/connect', { password });
        notice(
          result.message ||
            (result.connected
              ? 'Mailbox connected successfully.'
              : 'Complete sign-in in the browser.'),
        );
      }),
    );
  if ($('disconnect'))
    uiScope.handler($('disconnect'), 'onclick', () =>
      action($('disconnect'), () => api('/api/disconnect', {})),
    );
  if ($('resume'))
    uiScope.handler($('resume'), 'onclick', () =>
      action($('resume'), async () => {
        const result = await api('/api/resume', {});
        notice(result.message || 'Mailbox connected.');
      }),
    );
  if ($('connectionMode')) uiScope.handler($('connectionMode'), 'onchange', fillBrowserMethod);
  if ($('browserChannel')) uiScope.handler($('browserChannel'), 'onchange', fillBrowserMethod);
  if ($('discoverBrowsers'))
    uiScope.handler($('discoverBrowsers'), 'onclick', () =>
      action($('discoverBrowsers'), async () => {
        const result = await api<BrowserDiscoveryResponse>('/api/browser-discover', {
          endpoint: $('cdpEndpoint').value,
        });
        renderRegion(
          $('availableBrowsers'),
          <>
            <option value={''}>{'Select a debugging browser'}</option>
            {result.browsers.map((b) => (
              <>
                <option value={displayText(b.endpoint)}>
                  {displayText(b.browser)}
                  {' — '}
                  {displayText(b.endpoint)}
                </option>
              </>
            ))}
          </>,
        );
        notice(
          result.browsers.length
            ? 'Select a browser, then save the mailbox profile.'
            : 'No debugging browser found. Start one using the command below, or use Saved Browser Profile.',
        );
      }),
    );
  if ($('availableBrowsers'))
    uiScope.handler($('availableBrowsers'), 'onchange', () => {
      if ($('availableBrowsers').value) $('cdpEndpoint').value = $('availableBrowsers').value;
    });
  if ($('templateChecksEnabled'))
    uiScope.handler($('templateChecksEnabled'), 'onchange', updateTemplateCheckControls);
  if ($('saveProfile'))
    uiScope.handler($('saveProfile'), 'onclick', () =>
      action($('saveProfile'), async () => {
        await api('/api/profile', {
          id: session.profileEditId,
          name: $('accountName').value,
          email: $('accountEmail').value,
          url: $('accountUrl').value,
          provider: $('provider').value,
          browserChannel: $('browserChannel').value,
          connectionMode: $('connectionMode').value,
          cdpEndpoint: $('cdpEndpoint').value,
          autoReconnect: $('autoReconnect').checked,
          business: readBusiness(),
        });
        await refresh();
        fillProfile();
        notice('Profile saved.');
      }),
    );
  if ($('newProfile'))
    uiScope.handler($('newProfile'), 'onclick', () => {
      session.profileEditId = null;
      if ($('accountName')) {
        $('accountName').value = '';
        $('accountName').focus();
      }
      if ($('accountEmail')) $('accountEmail').value = '';
      if ($('password')) $('password').value = '';
      if ($('senderName')) $('senderName').value = '';
      updateControls();
      notice('Enter the new profile details, then save.');
    });
  if ($('newProfileBtn'))
    uiScope.handler($('newProfileBtn'), 'onclick', () => {
      if ($('newProfile')) $('newProfile').click();
      $('profileSetupTitle')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  if ($('deleteCurrentProfile'))
    uiScope.handler($('deleteCurrentProfile'), 'onclick', () => {
      if (!session.profileEditId) return;
      const p = session.state.profiles.find((p) => p.id === session.profileEditId);
      if (!confirm(`Are you sure you want to delete mailbox profile "${p?.name || p?.email}"?`))
        return;
      action($('deleteCurrentProfile'), async () => {
        await api('/api/delete-profile', { id: session.profileEditId });
        session.profileEditId = null;
        await refresh();
        fillProfile();
        notice('Mailbox profile deleted.');
      });
    });
  if ($('profilesTableBody')) {
    uiScope.handler($('profilesTableBody'), 'onclick', (e) => {
      const selBtn = eventElement(e).closest<HTMLElement>('[data-select-profile]');
      if (selBtn) {
        action(selBtn, async () => {
          await api('/api/select-profile', { id: selBtn.dataset.selectProfile });
          await refresh();
          fillProfile();
          notice('Mailbox profile activated.');
        });
        return;
      }
      const editBtn = eventElement(e).closest<HTMLElement>('[data-edit-profile]');
      if (editBtn) {
        const p = session.state.profiles.find((x) => x.id === editBtn.dataset.editProfile);
        if (p) {
          fillProfile(p);
          $('profileSetupTitle')?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
          $('accountName')?.focus();
        }
        return;
      }
      const delBtn = eventElement(e).closest<HTMLElement>('[data-delete-profile]');
      if (delBtn) {
        const p = session.state.profiles.find((x) => x.id === delBtn.dataset.deleteProfile);
        if (!confirm(`Are you sure you want to delete mailbox profile "${p?.name || p?.email}"?`))
          return;
        action(delBtn, async () => {
          await api('/api/delete-profile', { id: delBtn.dataset.deleteProfile });
          if (session.profileEditId === delBtn.dataset.deleteProfile) session.profileEditId = null;
          await refresh();
          fillProfile();
          notice('Mailbox profile deleted.');
        });
        return;
      }
    });
  }
  if ($('profileSelect'))
    uiScope.handler($('profileSelect'), 'onchange', () =>
      action($('connect'), async () => {
        await api('/api/select-profile', { id: $('profileSelect').value });
        await refresh();
        fillProfile();
        if ($('password')) $('password').value = '';
      }),
    );
  if ($('saveSettings'))
    uiScope.handler($('saveSettings'), 'onclick', () =>
      action($('saveSettings'), async () => {
        const s = structuredClone(session.state.settings);
        s.templateChecks = {
          enabled: $('templateChecksEnabled').checked,
          promotionalClaims: $('promotionalClaimsCheck').value,
          messageLength: $('messageLengthCheck').value,
        };
        s.business = readBusiness();
        for (const key of pacingFields) s.pacing[key] = Number(($(key) as HTMLInputElement).value);
        for (const key of ['requireActive', 'requireNoOutOfService', 'allowHidden'])
          s.eligibility[key as 'requireActive' | 'requireNoOutOfService' | 'allowHidden'] = (
            $(key) as HTMLInputElement
          ).checked;
        s.eligibility.readyStatuses = $('readyStatuses')
          .value.split(',')
          .map((v) => (v.trim() === 'blank' ? '' : v.trim()));
        s.eligibility.sentStatus = $('sentStatus').value;
        s.team = {
          enabled: $('teamEnabled').checked,
          url: $('teamUrl').value,
          workerName: $('workerName').value,
        };
        s.tracking = {
          ...s.tracking,
          syncMode: $('firebaseSyncMode')?.value || 'auto',
          pcId: $('trackingPcId')?.value.trim() || '',
          publicUrl: $('trackingPublicUrl')?.value.trim() || '',
          firebaseBackend: $('firebaseBackend')?.value || 'both',
        };
        const token = $('teamToken').value;
        $('teamToken').value = '';
        await api('/api/settings', { settings: s, teamToken: token });
        await refresh();
        notice('Sending settings saved.');
      }),
    );
  if ($('resetWait'))
    uiScope.handler($('resetWait'), 'onclick', () => {
      const shared = session.state.settings.team.enabled
        ? '\nShared mailbox counters will also reset on the team server for all PCs using this mailbox.'
        : '';
      if (
        !confirm(
          'Hard reset this mailbox’s wait and quota counters?\n\n' +
            'This overrides the current countdown, minimum send interval, hourly/24-hour app quotas, and rest counter. An active queue may send immediately. New sends will count toward the configured limits again.' +
            shared +
            '\n\nProvider-enforced limits still apply. Send history, uncertain outcomes, duplicate protection, and Do Not Contact records are kept.\n\nContinue with hard reset?',
        )
      )
        return;
      action($('resetWait'), async () => {
        const result = await api<{
          job: { message: string; nextAt: string };
          cleared: boolean;
          message: string;
        }>('/api/reset-wait', { hardReset: true, confirmOverride: true });
        session.liveCountdownTotal = null;
        await refresh();
        notice(
          result.job.nextAt
            ? `${result.message} Next check: ${new Date(result.job.nextAt).toLocaleString()}.`
            : result.message,
        );
      });
    });
  if ($('settingsFirebaseSyncBtn'))
    uiScope.handler($('settingsFirebaseSyncBtn'), 'onclick', () =>
      action($('settingsFirebaseSyncBtn'), async () => {
        try {
          const res = await api('/api/tracking/sync-firebase', {});
          notice(`Firebase: ${res.message || res.error || 'Sync finished.'}`);
        } catch (err) {
          notice(`Firebase sync failed: ${errorMessage(err)}`, 'error');
        }
        await refresh();
      }),
    );
  if ($('firebaseSyncMode'))
    uiScope.handler($('firebaseSyncMode'), 'onchange', () => {
      const isManual = $('firebaseSyncMode').value === 'manual';
      if ($('firebaseSyncModeHint')) {
        $('firebaseSyncModeHint').textContent = isManual
          ? "In manual mode, background polling is paused. You can sync opens anytime by clicking 'Sync Firebase'."
          : 'In automatic mode, open signals from recipients are fetched seamlessly in the background while the app is running.';
      }
    });
  // Pacing presets click and input listeners
  const presetsGrid = $('pacingPresetsGrid');
  if (presetsGrid) {
    uiScope.handler(presetsGrid, 'onclick', (e) => {
      const card = eventElement(e).closest<HTMLElement>('.pacing-preset-card');
      if (card && card.dataset.preset) {
        applyPacingPreset(card.dataset.preset, true);
      }
    });
  }
  for (const key of pacingFields) {
    if ($(key)) {
      uiScope.listen($(key), 'input', detectActivePreset);
    }
  }
}
