import type { HistoryReviewResponse } from '../../shared/types/api';
import { Button } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import type { ReactNode } from 'react';
import { regionSignature } from '../../shared/regions';
import { renderRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type { HistoryRecord, HistorySummary } from '../../shared/types/domain';
import type { HistoryResponse } from '../../shared/types/api';
import { eventElement } from '../../shared/dom';
import { errorMessage } from '../../shared/utils';
import { session } from '../../shared/session';
import { $, action, api, notice } from '../../shared/runtime';
export const historyFilterIds = {
  q: 'historySearch',
  status: 'historyStatus',
  seen: 'historySeen',
  mailbox: 'historyMailbox',
  campaign: 'historyCampaign',
  template: 'historyTemplate',
  reply: 'historyReply',
  from: 'historyFrom',
  until: 'historyUntil',
  sort: 'historySort',
};

export let historyRequest = 0,
  historySelected: HistoryRecord | null = null,
  historyReviewDirty = false;

export function historyParams() {
  return new URLSearchParams(
    Object.entries(historyFilterIds).map(([key, id]) => [
      key,
      ($(id) as HTMLInputElement)?.value || '',
    ]),
  );
}

export function historyDate(value: string | undefined) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : 'Not recorded';
}

export function historyDuration(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export function historySelectOptions(
  id: string,
  options: Array<string | { id: string; name: string }>,
  title: string,
  extra: ReactNode = '',
) {
  const el = $<HTMLSelectElement>(id),
    previous = el.value;
  const markup = (
    <>
      {
        <>
          <option value={''}>{title}</option>
        </>
      }
      {extra}
      {options.map((o) => (
        <>
          <option value={displayText(typeof o === 'string' ? o : o.id)}>
            {displayText(typeof o === 'string' ? o : o.name)}
          </option>
        </>
      ))}
    </>
  );
  if (el.dataset.options !== regionSignature(markup)) {
    renderRegion(el, markup);
    el.value = previous;
    el.dataset.options = regionSignature(markup);
  }
}

export function renderHistorySummary(s: HistorySummary) {
  const percent = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);
  const metrics = [
    ['Confirmed sent', s.sent, `${s.attempts} total attempts · ${s.uncertain} unresolved`],
    ['Seen signals', s.sentSeen, `Among confirmed sends · ${s.noSignal} tracked with no signal`],
    ['Sent → seen rate', percent(s.seenRate), `${s.sentSeen} seen / ${s.sent} confirmed sends`],
    [
      'Average first seen',
      historyDuration(s.averageFirstSeenMs),
      `${s.timingSamples} valid timing sample(s)`,
    ],
    [
      'Median first seen',
      historyDuration(s.medianFirstSeenMs),
      'Middle confirmed-send → first-signal interval',
    ],
    [
      'Fastest first seen',
      historyDuration(s.fastestFirstSeenMs),
      s.fastestRecipient || 'No eligible timing sample',
    ],
    [
      'Tracking coverage',
      `${s.trackedSent} / ${s.sent}`,
      `${s.untrackedSent} sent without tracking · ${percent(s.trackedSeenRate)} seen among tracked sends`,
    ],
    [
      'Reply review',
      `${s.replied} replied`,
      `${s.noReply} checked, no reply · ${s.unreviewed} not reviewed · manual`,
    ],
  ];
  renderRegion(
    $('historyMetrics'),
    metrics.map(([label, value, hint]) => (
      <>
        <div className={'history-metric'}>
          <span>{displayText(label)}</span>
          <strong>{displayText(value)}</strong>
          <small>{displayText(hint)}</small>
        </div>
      </>
    )),
  );
  $('historyTimingNote').textContent =
    `Timing uses confirmed sent time to the first recorded image request. ${s.timingExcluded} seen send(s) excluded because a timestamp is missing or precedes confirmation. ${s.bounced} bounce record(s) in this filtered view.`;
}

export async function loadHistory() {
  if (!$('historyRows')) return;
  const request = ++historyRequest;
  const params = historyParams();
  params.set('offset', String(session.historyOffset));
  $('historyLoadStatus').textContent = 'Updating history…';
  try {
    const result = await api<HistoryResponse>('/api/history?' + params);
    if (request !== historyRequest) return;
    session.historyRecords = result.records;
    session.historyOffset = result.offset;
    session.lastHistoryRefresh = Date.now();
    historySelectOptions('historyMailbox', result.options.mailboxes, 'All mailboxes');
    historySelectOptions(
      'historyCampaign',
      result.options.campaigns,
      'All campaigns',
      <>
        <option value={'legacy'}>{'Legacy / unassigned'}</option>
      </>,
    );
    historySelectOptions('historyTemplate', result.options.templates, 'All templates');
    renderHistorySummary(result.summary);
    const exportParams = historyParams();
    for (const [id, scope, format] of [
      ['historyExportCsv', 'filtered', 'csv'],
      ['historyExportJson', 'filtered', 'json'],
      ['historyExportStats', 'stats', 'csv'],
    ] as const) {
      const p = new URLSearchParams(exportParams);
      p.set('scope', scope);
      p.set('format', format);
      $(id).href = '/api/export-history?' + p;
    }
    renderRegion(
      $('historyRows'),
      session.historyRecords.length ? (
        session.historyRecords.map((r, index) => (
          <>
            <tr>
              <td>
                <strong>{displayText(r.to)}</strong>
                <small>{displayText(historyDate(r.confirmedAt || r.at))}</small>
              </td>
              <td>
                {displayText(r.accountEmail || 'Legacy')}
                <small>{displayText(r.campaignName)}</small>
              </td>
              <td>
                {displayText(r.subject || 'No recorded subject')}
                <small>{displayText(r.templateName)}</small>
              </td>
              <td>
                <span className={'status-pill ' + (r.confirmedSent ? 'good' : 'blocked')}>
                  {displayText(r.status)}
                </span>
                <small>
                  {r.replyStatus === 'unreviewed'
                    ? 'Reply not reviewed'
                    : r.replyStatus === 'replied'
                      ? 'Replied · manual'
                      : 'No reply · manual'}
                </small>
                {r.bounceStatus ? (
                  <>
                    <small className={'history-warning'}>{displayText(r.bounceStatus)}</small>
                  </>
                ) : (
                  ''
                )}
              </td>
              <td>
                {r.firstOpenAt ? (
                  <>
                    <span className={'status-pill good'}>{'Seen · image signal'}</span>
                    <small>
                      {'First: '}
                      {displayText(historyDate(r.firstOpenAt))}
                    </small>
                    <small>
                      {'Last: '}
                      {displayText(historyDate(r.lastOpenAt))}
                    </small>
                    <small>
                      {r.opensCount}
                      {' retained hourly signal(s)'}
                    </small>
                  </>
                ) : (
                  <>
                    <span className={'status-pill'}>
                      {r.trackingEnabled ? 'No signal recorded' : 'Tracking not enabled'}
                    </span>
                  </>
                )}
              </td>
              <td>
                {displayText(historyDuration(r.firstSeenDelayMs))}
                {r.timingExcluded ? (
                  <>
                    <small>{'Timestamp excluded'}</small>
                  </>
                ) : (
                  ''
                )}
              </td>
              <td>
                <Button className={'secondary'} data-history={index}>
                  {'View'}
                </Button>
              </td>
            </tr>
          </>
        ))
      ) : (
        <>
          <tr>
            <td colSpan={7}>
              {'No records match these filters. Clear filters to see all attempts.'}
            </td>
          </tr>
        </>
      ),
    );
    $('historyPageInfo').textContent = result.total
      ? `Showing ${result.offset + 1}–${Math.min(result.offset + result.pageSize, result.total)} of ${result.total} matching attempts`
      : 'No matching attempts';
    $('historyPrev').disabled = result.offset === 0;
    $('historyNext').disabled = result.offset + result.pageSize >= result.total;
    $('historyLoadStatus').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    const selected = session.historyRecords.find(
      (r) => r.trackingId === historySelected?.trackingId,
    );
    if (selected && !historyReviewDirty) showHistoryDetail(selected, false);
  } catch (error) {
    if (request === historyRequest)
      $('historyLoadStatus').textContent = `Could not update: ${errorMessage(error)}`;
    throw error;
  }
}

export function showHistoryDetail(r: HistoryRecord, scroll = true) {
  historySelected = r;
  const opens = r.opens.length
    ? r.opens.map((event) => `  ${historyDate(event.at)}`).join('\n')
    : '  No retained open signals';
  $('historyMessage').textContent =
    `To: ${r.to}\nFrom: ${r.accountEmail || 'Not recorded'}\nCampaign: ${r.campaignName}\nTemplate: ${r.templateName}\nOutcome: ${r.status}\nTracking ID: ${r.trackingId || 'Legacy'}\nSend status: ${r.sendStatus || 'Legacy'}\nConfirmation evidence: ${r.evidence || 'Not confirmed'}\nAttempt: ${historyDate(r.at)}\nConfirmed send: ${historyDate(r.confirmedAt)}\nFirst seen (image request): ${historyDate(r.firstOpenAt)}\nLast seen: ${historyDate(r.lastOpenAt)}\nSend → first seen: ${historyDuration(r.firstSeenDelayMs)}\nBounce: ${r.bounceStatus || 'None recorded'}${r.bounceReason ? ` — ${r.bounceReason}` : ''}\n\nRetained hourly open signals (up to 96; repeated requests within an hour are coalesced):\n${opens}\n\nSubject: ${r.subject || 'Not recorded'}\n\n${r.body || 'Message body was not recorded by the previous version.'}\n\n${r.signature || ''}`;
  $('historyReviewStatus').value = r.replyStatus;
  $('historyReviewNote').value = r.followUp.note || '';
  $('historyReviewSaved').textContent = r.followUp.reviewedAt
    ? `Last reviewed ${historyDate(r.followUp.reviewedAt)}`
    : 'Not reviewed yet';
  $('historyInspector').hidden = false;
  if (scroll) {
    historyReviewDirty = false;
    $('historyInspector').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export let historyTimer: ReturnType<typeof setTimeout> | undefined;

export function mountHistory() {
  if ($('recovery'))
    uiScope.handler($('recovery'), 'onclick', (e) => {
      if (eventElement(e).dataset.reconcile)
        action(eventElement(e), () =>
          api('/api/reconcile', {
            email: eventElement(e).dataset.reconcile,
            outcome: eventElement(e).dataset.outcome,
          }),
        );
    });
  uiScope.handler($('historyRows'), 'onclick', (e) => {
    const button = eventElement(e).closest<HTMLElement>('[data-history]');
    if (button) showHistoryDetail(session.historyRecords[Number(button.dataset.history)]);
  });
  uiScope.handler($('historyCloseDetail'), 'onclick', () => {
    $('historyInspector').hidden = true;
    historySelected = null;
    historyReviewDirty = false;
  });
  for (const id of ['historyReviewStatus', 'historyReviewNote'])
    uiScope.handler($(id), 'oninput', () => {
      historyReviewDirty = true;
      $('historyReviewSaved').textContent = 'Unsaved review';
    });
  uiScope.handler($('historySaveReview'), 'onclick', () =>
    action($('historySaveReview'), async () => {
      if (!historySelected) return;
      const result = await api<HistoryReviewResponse>('/api/history/review', {
        trackingId: historySelected.trackingId,
        status: $('historyReviewStatus').value,
        note: $('historyReviewNote').value,
      });
      historySelected.followUp = result.review;
      historySelected.replyStatus = result.review.status;
      historyReviewDirty = false;
      showHistoryDetail(historySelected, false);
      await loadHistory();
      notice('Manual reply review saved.');
    }),
  );
  uiScope.handler($('historySearch'), 'oninput', () => {
    uiScope.clearTimeout(historyTimer);
    historyTimer = uiScope.timeout(() => {
      session.historyOffset = 0;
      loadHistory().catch((e) => notice(errorMessage(e)));
    }, 250);
  });
  for (const id of Object.values(historyFilterIds).filter((id) => id !== 'historySearch'))
    uiScope.handler($(id), 'onchange', () => {
      session.historyOffset = 0;
      loadHistory().catch((e) => notice(errorMessage(e)));
    });
  uiScope.handler($('historyClearFilters'), 'onclick', () => {
    for (const id of Object.values(historyFilterIds))
      ($(id) as HTMLInputElement).value = id === 'historySort' ? 'newest' : '';
    session.historyOffset = 0;
    loadHistory().catch((e) => notice(errorMessage(e)));
  });
  uiScope.handler($('historyRefresh'), 'onclick', () => action($('historyRefresh'), loadHistory));
  uiScope.handler($('historyPrev'), 'onclick', () => {
    session.historyOffset = Math.max(0, session.historyOffset - 25);
    loadHistory().catch((e) => notice(errorMessage(e)));
  });
  uiScope.handler($('historyNext'), 'onclick', () => {
    session.historyOffset += 25;
    loadHistory().catch((e) => notice(errorMessage(e)));
  });
  uiScope.handler($('historyConversations'), 'onclick', () => {
    if (!historySelected) return;
    location.hash = 'conversations';
    window.dispatchEvent(new CustomEvent('fc-conversation-search', { detail: historySelected.to }));
  });
}
