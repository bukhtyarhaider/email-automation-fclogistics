import { uiScope } from '../../shared/lifecycle';
import { renderRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type { ActivityEvent } from '../../shared/types/domain';
import { eventElement } from '../../shared/dom';
import { errorMessage } from '../../shared/utils';
import { session } from '../../shared/session';
import { $, waitClock, api, notice, copyToClipboard, action } from '../../shared/runtime';
import { refresh } from '../../app/runtime/refresh';
/** Keep distinct messages and categories even when the server timestamps them together. */
export function eventIdentity(event: ActivityEvent): string {
  return JSON.stringify([
    event.at,
    event.kind,
    event.message,
    event.seconds,
    event.company,
    event.email,
  ]);
}

// Live System Activity Logic
export function classifyEvent(event: ActivityEvent): 'error' | 'pause' | 'send' | 'system' {
  const kind = event.kind?.toLowerCase();
  if (kind === 'error') return 'error';
  if (['pause', 'pacing', 'rest', 'waiting'].includes(kind)) return 'pause';
  if (['sent', 'send', 'start'].includes(kind)) return 'send';
  if (['system', 'template', 'import', 'stop', 'settings', 'profile'].includes(kind))
    return 'system';
  const message = event.message || '';
  if (/\b(fail(?:ed|ure|ing)?|error|uncertain|needs attention|blocked)\b/i.test(message))
    return 'error';
  if (
    /\b(paus(?:e|ed|ing)|rest(?:ing)?|seconds?|waiting for leads|team pacing|interval|allowance pause)\b/i.test(
      message,
    )
  )
    return 'pause';
  if (/sent to|sending to|started .* outreach|dispatched/i.test(message)) return 'send';
  return 'system';
}

export function renderLiveActivityView() {
  if (!session.state) return;
  // 1. Accumulate events into liveEventsList without duplicates
  if (Array.isArray(session.state.events)) {
    const existingKeys = new Set(session.liveEventsList.map((e) => eventIdentity(e)));
    for (const e of session.state.events) {
      const key = eventIdentity(e);
      if (!existingKeys.has(key) && !session.liveClearedEvents.has(key)) {
        session.liveEventsList.push(e);
        existingKeys.add(key);
      }
    }
  }
  // 2. Telemetry Card 1: Runner Engine
  const runnerBadge = $('liveRunnerBadge');
  const runnerState = $('liveRunnerStateText');
  const runnerMsg = $('liveRunnerMsgText');
  const countdownWrap = $('liveCountdownWrapper');
  const countdownTimer = $('liveCountdownTimer');
  const countdownLabel = $('liveCountdownLabel');
  const job = session.state.job || {};
  const isRunning = session.state.job.enabled;
  const runnerStatus = job.status || (isRunning ? 'Running' : 'Stopped');
  if (runnerBadge) {
    runnerBadge.textContent = runnerStatus;
    runnerBadge.className = `status-badge ${isRunning ? 'active' : ''}`;
  }
  if (runnerState) {
    runnerState.textContent = isRunning ? job.status || 'Running' : 'Idle / Stopped';
  }
  if (runnerMsg) {
    runnerMsg.textContent = job.message || 'Queue is stopped. Start continuous outreach to resume.';
  }
  if (job.nextAt && Date.parse(job.nextAt) > Date.now()) {
    if (countdownWrap) countdownWrap.hidden = false;
    const diffMs = Date.parse(job.nextAt) - Date.now();
    const totalSec = Math.max(0, Math.ceil(diffMs / 1000));
    if (countdownTimer) countdownTimer.textContent = waitClock(totalSec);
    if (countdownLabel)
      countdownLabel.textContent = job.status ? `${job.status}:` : 'Next send scheduled in:';
  } else {
    if (countdownWrap) countdownWrap.hidden = true;
  }
  // 3. Telemetry Card 2: Mailbox Session
  const mailboxPill = $('liveMailboxPill');
  const mailboxStatus = $('liveMailboxStatusText');
  const mailboxAccount = $('liveMailboxAccountText');
  const coordStatus = $('liveCoordinatorStatusText');
  const p = session.state.profiles
    ? session.state.profiles.find((p) => p.id === session.state.activeProfile)
    : null;
  const currentEmail = p?.email || session.state.settings?.account?.email || 'No account';
  if (mailboxPill) {
    mailboxPill.className = `connection-pill ${session.state.connected ? 'good' : ''}`;
  }
  if (mailboxStatus) {
    mailboxStatus.textContent = session.state.connected ? 'Connected' : 'Disconnected';
  }
  if (mailboxAccount) {
    mailboxAccount.textContent = currentEmail;
    mailboxAccount.title = currentEmail;
  }
  if (coordStatus) {
    if (session.state.settings?.team?.enabled) {
      coordStatus.textContent = session.state.teamConnected
        ? `Coordinator: Connected (${displayText(session.state.settings.team.workerName || 'worker')})`
        : 'Coordinator: Connecting / Waiting';
    } else {
      coordStatus.textContent = 'Coordinator: Standalone';
    }
  }
  // 4. Telemetry Card 3: Pacing Quotas
  const hourVal = $('liveHourQuotaText');
  const hourFill = $('liveHourQuotaFill');
  const dayVal = $('liveDayQuotaText');
  const dayFill = $('liveDayQuotaFill');
  const pacing = session.state.settings?.pacing || { hourlyCap: 20, dailyCap: 100 };
  const hourRemaining = session.state.remaining ?? pacing.hourlyCap;
  const dayRemaining = session.state.dayRemaining ?? pacing.dailyCap;
  const hourPct = Math.min(100, Math.max(0, (hourRemaining / (pacing.hourlyCap || 1)) * 100));
  const dayPct = Math.min(100, Math.max(0, (dayRemaining / (pacing.dailyCap || 1)) * 100));
  if (hourVal) hourVal.textContent = `${hourRemaining} / ${pacing.hourlyCap} left`;
  if (hourFill) {
    hourFill.style.width = `${hourPct}%`;
    hourFill.style.background = hourPct < 20 ? '#ef4444' : hourPct < 50 ? '#f59e0b' : '#8b5cf6';
  }
  if (dayVal) dayVal.textContent = `${dayRemaining} / ${pacing.dailyCap} left`;
  if (dayFill) {
    dayFill.style.width = `${dayPct}%`;
    dayFill.style.background = dayPct < 20 ? '#ef4444' : dayPct < 50 ? '#f59e0b' : '#3b82f6';
  }
  // 5. Telemetry Card 4: Metrics Breakdown
  let countSent = 0,
    countPacing = 0,
    countSystem = 0,
    countError = 0;
  for (const e of session.liveEventsList) {
    const cls = classifyEvent(e);
    if (cls === 'send') countSent++;
    else if (cls === 'pause') countPacing++;
    else if (cls === 'system') countSystem++;
    else if (cls === 'error') countError++;
  }
  if ($('liveTotalCountBadge'))
    $('liveTotalCountBadge').textContent = `${session.liveEventsList.length} events`;
  if ($('liveStreamCounter'))
    $('liveStreamCounter').textContent = `${session.liveEventsList.length} total`;
  if ($('liveMetricSent')) $('liveMetricSent').textContent = String(countSent);
  if ($('liveMetricPacing')) $('liveMetricPacing').textContent = String(countPacing);
  if ($('liveMetricSystem')) $('liveMetricSystem').textContent = String(countSystem);
  if ($('liveMetricError')) $('liveMetricError').textContent = String(countError);
  if ($('tabChipAll')) $('tabChipAll').textContent = String(session.liveEventsList.length);
  if ($('tabChipSend')) $('tabChipSend').textContent = String(countSent);
  if ($('tabChipPause')) $('tabChipPause').textContent = String(countPacing);
  if ($('tabChipSystem')) $('tabChipSystem').textContent = String(countSystem);
  if ($('tabChipError')) $('tabChipError').textContent = String(countError);
  // 6. Live Stream status badge
  const streamBadge = $('liveStreamStatusBadge');
  const streamText = $('liveStreamStatusText');
  if (session.livePaused) {
    if (streamBadge) streamBadge.className = 'live-stream-badge paused';
    if (streamText) streamText.textContent = 'FEED PAUSED';
    return;
  } else {
    if (streamBadge) streamBadge.className = 'live-stream-badge';
    if (streamText) streamText.textContent = 'STREAMING LIVE';
  }
  // 7. Filter & Search
  const query = session.liveSearchQuery.trim().toLowerCase();
  const filtered = session.liveEventsList.filter((e) => {
    const cls = classifyEvent(e);
    if (session.liveFilterKind !== 'all' && cls !== session.liveFilterKind) return false;
    if (query) {
      const text = `${e.message} ${e.kind || ''} ${cls}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });
  if ($('liveFilteredCountText')) {
    $('liveFilteredCountText').textContent =
      session.liveFilterKind === 'all' && !query
        ? `Showing all ${filtered.length} events`
        : `Showing ${filtered.length} of ${session.liveEventsList.length} events (filtered)`;
  }
  // 8. Render Visual Feed
  const visualList = $('liveVisualEventsList');
  const emptyState = $('liveVisualEmptyState');
  if (visualList) {
    if (filtered.length === 0) {
      renderRegion(visualList, '');
      if (emptyState) emptyState.hidden = false;
    } else {
      if (emptyState) emptyState.hidden = true;
      renderRegion(
        visualList,
        filtered
          .slice()
          .reverse()
          .map((e) => {
            const cls = classifyEvent(e);
            const time = new Date(e.at).toLocaleTimeString();
            const badgeText = cls.toUpperCase();
            const metaTags = [];
            if (e.seconds) metaTags.push(`${e.seconds}s delay`);
            if (e.company) metaTags.push(displayText(e.company));
            if (e.email) metaTags.push(displayText(e.email));
            if (e.kind && e.kind !== cls) metaTags.push(displayText(e.kind));
            return (
              <>
                <li className={'live-event-card event-' + cls}>
                  <span className={'event-type-badge'}>{badgeText}</span>
                  <time className={'event-time'} title={displayText(e.at)}>
                    {displayText(time)}
                  </time>
                  <div className={'event-body'}>
                    <span className="event-message">{displayText(e.message)}</span>
                    {metaTags.length > 0 && (
                      <div className="event-meta-tags">
                        {metaTags.map((tag) => (
                          <span key={tag} className="event-meta-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              </>
            );
          }),
      );
    }
  }
  // 9. Render Terminal Feed
  const termOutput = $('liveTerminalOutput');
  if (termOutput && session.liveViewMode === 'terminal') {
    if (filtered.length === 0) {
      termOutput.textContent = '# [fc-telemetry] No events matching current criteria.';
    } else {
      const termLines = filtered
        .map((e) => {
          const cls = classifyEvent(e).toUpperCase().padEnd(6);
          const time = new Date(e.at).toLocaleTimeString();
          return `[${time}] [${cls}] ${e.message}`;
        })
        .join('\n');
      termOutput.textContent = termLines;
    }
  }
  // 10. Auto-scroll
  if (session.liveAutoScroll) {
    const feedWrap = $('liveVisualFeedContainer');
    if (feedWrap && session.liveViewMode === 'visual') {
      feedWrap.scrollTop = 0;
    }
    const termWrap = $('liveTerminalContainer');
    if (termWrap && session.liveViewMode === 'terminal') {
      const termPre = $('liveTerminalOutput');
      if (termPre) termPre.scrollTop = termPre.scrollHeight;
    }
  }
}

export function mountLiveActivity() {
  // Live Countdown Ticker Loop (500ms for smooth ticking)
  uiScope.interval(() => {
    if (session.state?.job?.nextAt) {
      const diffMs = Date.parse(session.state.job.nextAt) - Date.now();
      const wrap = $('liveCountdownWrapper');
      if (diffMs > 0) {
        if (wrap) wrap.hidden = false;
        const totalSec = Math.ceil(diffMs / 1000);
        const timerEl = $('liveCountdownTimer');
        if (timerEl) timerEl.textContent = waitClock(totalSec);
        const barEl = $('liveCountdownBar');
        if (barEl) {
          if (!session.liveCountdownTotal || totalSec > session.liveCountdownTotal) {
            session.liveCountdownTotal = totalSec;
          }
          const pct = Math.max(
            0,
            Math.min(
              100,
              ((session.liveCountdownTotal - totalSec) / session.liveCountdownTotal) * 100,
            ),
          );
          barEl.style.width = `${pct}%`;
        }
      } else {
        session.liveCountdownTotal = null;
        if (wrap) wrap.hidden = true;
      }
    } else {
      session.liveCountdownTotal = null;
      const wrap = $('liveCountdownWrapper');
      if (wrap) wrap.hidden = true;
    }
  }, 500);
  // Live System Activity setup listeners
  if ($('liveCategoryTabs')) {
    uiScope.listen($('liveCategoryTabs'), 'click', (e) => {
      const tab = eventElement(e).closest<HTMLElement>('.cat-tab');
      if (!tab) return;
      document.querySelectorAll<HTMLElement>('.cat-tab').forEach((item) => {
        item.classList.toggle('active', item === tab);
        item.setAttribute('aria-selected', String(item === tab));
      });
      session.liveFilterKind = tab.dataset.kind || 'all';
      renderLiveActivityView();
    });
  }
  if ($('liveSearchInput')) {
    uiScope.listen($('liveSearchInput'), 'input', (e) => {
      session.liveSearchQuery = (eventElement(e) as HTMLInputElement).value;
      renderLiveActivityView();
    });
  }
  if ($('liveAutoScrollCheck')) {
    uiScope.listen($('liveAutoScrollCheck'), 'change', (e) => {
      session.liveAutoScroll = !!(eventElement(e) as HTMLInputElement).checked;
    });
  }
  if ($('livePauseToggleBtn')) {
    uiScope.listen($('livePauseToggleBtn'), 'click', () => {
      session.livePaused = !session.livePaused;
      const btnText = $('livePauseBtnText');
      if (btnText) btnText.textContent = session.livePaused ? 'Resume Feed' : 'Pause Feed';
      $('livePauseToggleBtn').classList.toggle('danger', session.livePaused);
      $('livePauseToggleBtn').classList.toggle('secondary', !session.livePaused);
      renderLiveActivityView();
    });
  }
  if ($('liveClearEventsBtn')) {
    uiScope.listen($('liveClearEventsBtn'), 'click', async () => {
      for (const event of [...session.liveEventsList, ...session.state.events])
        session.liveClearedEvents.add(eventIdentity(event));
      session.liveEventsList = [];
      if (
        window.confirm(
          'Clear server activity event history as well? Click OK to reset server log, or Cancel to clear current screen view only.',
        )
      ) {
        try {
          await api('/api/clear-events', {});
          notice('Server activity log cleared.');
        } catch (err) {
          notice(`Failed to clear server log: ${errorMessage(err)}`);
        }
      } else {
        notice('Screen event view cleared.');
      }
      renderLiveActivityView();
    });
  }
  if ($('btnModeVisual')) {
    uiScope.listen($('btnModeVisual'), 'click', () => {
      session.liveViewMode = 'visual';
      $('btnModeVisual').classList.add('active');
      $('btnModeTerminal').classList.remove('active');
      if ($('liveVisualFeedContainer')) $('liveVisualFeedContainer').hidden = false;
      if ($('liveTerminalContainer')) $('liveTerminalContainer').hidden = true;
      renderLiveActivityView();
    });
  }
  if ($('btnModeTerminal')) {
    uiScope.listen($('btnModeTerminal'), 'click', () => {
      session.liveViewMode = 'terminal';
      $('btnModeTerminal').classList.add('active');
      $('btnModeVisual').classList.remove('active');
      if ($('liveVisualFeedContainer')) $('liveVisualFeedContainer').hidden = true;
      if ($('liveTerminalContainer')) $('liveTerminalContainer').hidden = false;
      renderLiveActivityView();
    });
  }
  if ($('liveTerminalCopyBtn')) {
    uiScope.listen($('liveTerminalCopyBtn'), 'click', async () => {
      const text = $('liveTerminalOutput')?.textContent || '';
      if (text) {
        const ok = await copyToClipboard(text);
        if (ok) {
          const btn = $('liveTerminalCopyBtn');
          const orig = btn.textContent;
          btn.textContent = '✓ Copied!';
          uiScope.timeout(() => {
            btn.textContent = orig;
          }, 1800);
          notice('Terminal console log copied to clipboard.');
        }
      } else {
        notice('No log content to copy.');
      }
    });
  }
  if ($('reload'))
    uiScope.handler($('reload'), 'onclick', () =>
      action($('reload'), () => api('/api/reload', {})),
    );
  if ($('batch'))
    uiScope.handler($('batch'), 'onclick', () =>
      action($('batch'), async () => {
        await api('/api/batch', {
          ids: [...session.selected],
          key: $('template').value,
          randomTemplates: $('randomTemplates').checked,
        });
        session.selected.clear();
        notice('Batch dispatch initiated.');
      }),
    );
  if ($('start'))
    uiScope.handler($('start'), 'onclick', () =>
      action($('start'), async () => {
        await api('/api/start', {
          key: $('template').value,
          randomTemplates: $('randomTemplates').checked,
        });
        notice('Continuous outreach started.');
      }),
    );
  if ($('stop'))
    uiScope.handler($('stop'), 'onclick', async () => {
      try {
        await api('/api/stop', {});
        await refresh();
        notice('Outreach stop requested.');
      } catch (e) {
        notice(errorMessage(e));
      }
    });
}
