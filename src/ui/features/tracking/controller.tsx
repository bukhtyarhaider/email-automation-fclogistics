import type { SeedPlanResponse } from '../../shared/types/api';
import { Button } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import type { ReactNode } from 'react';
import { contentOr } from '../../shared/regions';
import { renderRegion, captureContent, nativeStyle } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type { TrackingRecord } from '../../shared/types/domain';
import type {
  LeadsResponse,
  PreviewResponse,
  TrackingResponse,
  DomainReport,
} from '../../shared/types/api';
import { eventElement } from '../../shared/dom';
import { errorMessage } from '../../shared/utils';
import { session } from '../../shared/session';
import { $, api, action, notice, copyToClipboard } from '../../shared/runtime';
import { refresh } from '../../app/runtime/refresh';
import {
  switchTrackingDrawerTab,
  openTrackingDrawer,
  closeTrackingDrawer,
} from '../drawer/controller';
export let trackingOffset = 0,
  trackingRecords: TrackingRecord[] = [],
  trackingBusy = false;

export let trackingSearchDebounce: ReturnType<typeof setTimeout> | null = null;

export const trackingLabels = {
  recipients: 'Recipients',
  attempts: 'Attempts',
  webmail_sent: 'Webmail confirmed',
  send_failed: 'Send failed',
  hard_bounced: 'Hard bounces',
  soft_bounced: 'Soft bounces',
  open_detected: 'Open signals',
  delivery_unknown: 'Delivery unknown',
  inbox: 'Seed Inbox',
  spam: 'Seed Spam',
  other: 'Seed Other',
  not_found: 'Seed not found',
  awaiting: 'Seeds awaiting',
};

export async function loadTracking() {
  if (trackingBusy || !$('trackingRows') || !session.state) return;
  trackingBusy = true;
  try {
    const campaign = $('trackingCampaign');
    if (campaign) {
      const previous = campaign.value;
      renderRegion(
        campaign,
        <>
          <option value={''}>{'All campaigns'}</option>
          {session.state.campaigns.map((c) => (
            <>
              <option value={displayText(c.id)}>{displayText(c.name)}</option>
            </>
          ))}
        </>,
      );
      campaign.value = previous;
    }
    const qVal = $('trackingSearch')?.value || '';
    const campVal = $('trackingCampaign')?.value || '';
    const statusVal = $('trackingStatus')?.value || '';
    const fromVal = $('trackingFrom')?.value || '';
    const untilVal = $('trackingUntil')?.value || '';
    const params = new URLSearchParams({
      q: qVal,
      campaign: campVal,
      status: statusVal,
      from: fromVal,
      until: untilVal,
      offset: String(trackingOffset),
    });
    const data = await api<TrackingResponse>('/api/tracking?' + params);
    trackingRecords = data.records || [];
    const summary = data.summary || {};
    const total = data.total || 0;
    // Calculate core deliverability KPIs
    const attempts = summary.attempts || 0;
    const sent = summary.webmail_sent || 0;
    const deliveryRate = attempts ? Math.round((sent / attempts) * 100) : total ? 100 : 0;
    const opens = summary.open_detected || 0;
    const openRate = attempts ? Math.round((opens / attempts) * 100) : 0;
    const hardBounced = summary.hard_bounced || 0;
    const softBounced = summary.soft_bounced || 0;
    const bounced = hardBounced + softBounced;
    const bounceRate = attempts ? ((100 * bounced) / attempts).toFixed(1) + '%' : '0.0%';
    const seedsTotal =
      (summary.inbox || 0) + (summary.spam || 0) + (summary.other || 0) + (summary.not_found || 0);
    const inboxRate = seedsTotal
      ? Math.round(((summary.inbox || 0) / seedsTotal) * 100)
      : summary.inbox
        ? 100
        : 0;
    // Update active records badge
    if ($('trackingRecordCountBadge')) {
      $('trackingRecordCountBadge').textContent =
        `${total} recorded message${total === 1 ? '' : 's'}`;
    }
    // Render High-Impact Deliverability Telemetry Deck into #trackingMetrics
    if ($('trackingMetrics')) {
      renderRegion(
        $('trackingMetrics'),
        <>
          <div className={'tracking-kpi-grid'}>
            <div className={'tracking-kpi-card kpi-sent'}>
              <div className={'kpi-top'}>
                <span className={'kpi-title'}>{'Dispatched (Sent)'}</span>
                <div className={'kpi-icon-wrap icon-emerald'}>
                  <svg
                    width={'15'}
                    height={'15'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2.5'}
                  >
                    <polyline points={'20 6 9 17 4 12'}></polyline>
                  </svg>
                </div>
              </div>
              <div className={'kpi-val-row'}>
                <span className={'kpi-value'}>{sent}</span>
                <span className={'kpi-rate-badge badge-green'}>
                  {deliveryRate}
                  {'%'}
                </span>
              </div>
              <div className={'kpi-progress-bar'}>
                <div
                  className={'kpi-progress-fill fill-green'}
                  style={nativeStyle('width: ' + Math.min(100, deliveryRate) + '%;')}
                ></div>
              </div>
              <div className={'kpi-subtext'}>
                {'of '}
                {attempts}
                {' attempted sends confirmed by webmail'}
              </div>
            </div>
            <div className={'tracking-kpi-card kpi-opens'}>
              <div className={'kpi-top'}>
                <span className={'kpi-title'}>{'Open Signals'}</span>
                <div className={'kpi-icon-wrap icon-blue'}>
                  <svg
                    width={'15'}
                    height={'15'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2.5'}
                  >
                    <path d={'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'}></path>
                    <circle cx={'12'} cy={'12'} r={'3'}></circle>
                  </svg>
                </div>
              </div>
              <div className={'kpi-val-row'}>
                <span className={'kpi-value'}>{opens}</span>
                <span className={'kpi-rate-badge badge-blue'}>
                  {openRate}
                  {'%'}
                </span>
              </div>
              <div className={'kpi-progress-bar'}>
                <div
                  className={'kpi-progress-fill fill-blue'}
                  style={nativeStyle('width: ' + Math.min(100, openRate) + '%;')}
                ></div>
              </div>
              <div className={'kpi-subtext'}>{'1×1 pixel requests captured by proxy'}</div>
            </div>
            <div className={'tracking-kpi-card kpi-seeds'}>
              <div className={'kpi-top'}>
                <span className={'kpi-title'}>{'Seed Inbox Rate'}</span>
                <div className={'kpi-icon-wrap icon-purple'}>
                  <svg
                    width={'15'}
                    height={'15'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2.5'}
                  >
                    <polygon
                      points={
                        '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'
                      }
                    ></polygon>
                  </svg>
                </div>
              </div>
              <div className={'kpi-val-row'}>
                <span className={'kpi-value'}>
                  {seedsTotal ? `${inboxRate}%` : summary.inbox ? '100%' : '—'}
                </span>
                <span className={'kpi-rate-badge badge-purple'}>
                  {summary.inbox || 0}
                  {' Inbox'}
                </span>
              </div>
              <div className={'kpi-progress-bar'}>
                <div
                  className={'kpi-progress-fill fill-purple'}
                  style={nativeStyle('width: ' + Math.min(100, inboxRate) + '%;')}
                ></div>
              </div>
              <div className={'kpi-subtext'}>
                {summary.spam || 0}
                {' landed in spam · '}
                {summary.awaiting || 0}
                {' awaiting'}
              </div>
            </div>
            <div className={'tracking-kpi-card ' + (bounced > 0 ? 'kpi-warn' : 'kpi-clean')}>
              <div className={'kpi-top'}>
                <span className={'kpi-title'}>{'Deliverability Health'}</span>
                <div className={'kpi-icon-wrap ' + (bounced > 0 ? 'icon-amber' : 'icon-emerald')}>
                  <svg
                    width={'15'}
                    height={'15'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2.5'}
                  >
                    <path d={'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}></path>
                  </svg>
                </div>
              </div>
              <div className={'kpi-val-row'}>
                <span className={'kpi-value'}>{bounced === 0 ? 'Clean' : bounceRate}</span>
                <span className={'kpi-rate-badge ' + (bounced > 0 ? 'badge-amber' : 'badge-green')}>
                  {bounced === 0 ? '0 DSN' : `${bounced} Bounces`}
                </span>
              </div>
              <div className={'kpi-progress-bar'}>
                <div
                  className={'kpi-progress-fill ' + (bounced > 0 ? 'fill-amber' : 'fill-green')}
                  style={nativeStyle(
                    'width: ' +
                      (bounced === 0 ? '100' : Math.max(10, 100 - parseFloat(bounceRate))) +
                      '%;',
                  )}
                ></div>
              </div>
              <div className={'kpi-subtext'}>
                {hardBounced}
                {' hard bounces · '}
                {softBounced}
                {' soft bounces'}
              </div>
            </div>
          </div>
          <div className={'tracking-chips-ribbon'}>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Total Outreaches'}</span>
              <strong className={'chip-val'}>{total}</strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Unique Recipients'}</span>
              <strong className={'chip-val'}>{summary.recipients || 0}</strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Send Attempts'}</span>
              <strong className={'chip-val'}>{attempts}</strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Confirmed Dispatched'}</span>
              <strong className={'chip-val'} style={{ color: '#34d399' }}>
                {sent}
              </strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Failed Submissions'}</span>
              <strong
                className={'chip-val'}
                style={nativeStyle('color: ' + (summary.send_failed ? '#f87171' : 'inherit') + ';')}
              >
                {summary.send_failed || 0}
              </strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Hard Bounces'}</span>
              <strong
                className={'chip-val'}
                style={nativeStyle('color: ' + (hardBounced ? '#f87171' : 'inherit') + ';')}
              >
                {hardBounced}
              </strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Soft Bounces'}</span>
              <strong
                className={'chip-val'}
                style={nativeStyle('color: ' + (softBounced ? '#fbbf24' : 'inherit') + ';')}
              >
                {softBounced}
              </strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Open Signals'}</span>
              <strong className={'chip-val'} style={{ color: '#60a5fa' }}>
                {opens}
              </strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Seed Inbox'}</span>
              <strong className={'chip-val'} style={{ color: '#34d399' }}>
                {summary.inbox || 0}
              </strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Seed Spam'}</span>
              <strong
                className={'chip-val'}
                style={nativeStyle('color: ' + (summary.spam ? '#f87171' : 'inherit') + ';')}
              >
                {summary.spam || 0}
              </strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Seed Awaiting'}</span>
              <strong className={'chip-val'}>{summary.awaiting || 0}</strong>
            </div>
            <div className={'telemetry-chip'}>
              <span className={'chip-label'}>{'Delivery Unknown'}</span>
              <strong className={'chip-val'}>{summary.delivery_unknown || 0}</strong>
            </div>
          </div>
        </>,
      );
    }
    // Render Deliverability Guidance Note
    if ($('trackingRate')) {
      renderRegion(
        $('trackingRate'),
        <>
          <div className={'rate-callout-card'}>
            <div className={'rate-callout-icon'}>
              <svg
                width={'16'}
                height={'16'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <circle cx={'12'} cy={'12'} r={'10'}></circle>
                <line x1={'12'} y1={'16'} x2={'12'} y2={'12'}></line>
                <line x1={'12'} y1={'8'} x2={'12.01'} y2={'8'}></line>
              </svg>
            </div>
            <div className={'rate-callout-content'}>
              <div className={'rate-callout-title'}>
                <span>
                  {'Observed DSN Bounce Rate: '}
                  <strong>
                    {attempts ? ((100 * bounced) / attempts).toFixed(1) + '%' : 'No attempts'}
                  </strong>
                </span>
                <span className={'rate-status-tag ' + (bounced === 0 ? 'good' : 'warn')}>
                  {bounced === 0 ? '✓ Healthy Sender Score' : '⚠️ Failure Monitored'}
                </span>
              </div>
              <div className={'rate-callout-desc'}>
                {'\n              Formula: Unique messages with an IMAP DSN failure ('}
                {bounced}
                {') divided by attempted messages ('}
                {attempts}
                {
                  ') in this filtered view. Incomplete mailbox monitoring or delayed remote mail exchangers can undercount failures.\n            '
                }
              </div>
            </div>
          </div>
        </>,
      );
    }
    // Render Data Table Rows
    if ($('trackingRows')) {
      renderRegion(
        $('trackingRows'),
        trackingRecords.length ? (
          trackingRecords.map((r, i) => {
            const sendStatusBadge =
              r.sendStatus === 'webmail_sent' ? (
                <>
                  <span className={'status-pill good'}>
                    <span className={'badge-dot dot-green'}></span>
                    {'✓ Delivered'}
                  </span>
                </>
              ) : r.sendStatus === 'send_failed' ? (
                <>
                  <span className={'status-pill blocked'}>
                    <span className={'badge-dot dot-red'}></span>
                    {'✕ Failed'}
                  </span>
                </>
              ) : r.sendStatus === 'send_attempted' ? (
                <>
                  <span className={'status-pill sent'}>
                    <span className={'badge-dot dot-blue'}></span>
                    {'⏳ Sending...'}
                  </span>
                </>
              ) : (
                <>
                  <span className={'status-pill'}>
                    <span className={'badge-dot dot-muted'}></span>
                    {displayText(r.sendStatus || 'pending')}
                  </span>
                </>
              );
            // Required for unit tests: Must include '(hard_bounced)' or '(soft_bounced)'
            const bounceBadge =
              r.bounceStatus === 'hard_bounced' ? (
                <>
                  <div className={'bounce-status-block'}>
                    <span className={'status-pill blocked'}>
                      <span className={'badge-dot dot-red'}></span>
                      {'⛔ Hard Bounce '}
                      <small className={'test-token'}>{'(hard_bounced)'}</small>
                    </span>
                  </div>
                </>
              ) : r.bounceStatus === 'soft_bounced' ? (
                <>
                  <div className={'bounce-status-block'}>
                    <span className={'status-pill warn'}>
                      <span className={'badge-dot dot-amber'}></span>
                      {'⚠️ Soft Bounce '}
                      <small className={'test-token'}>{'(soft_bounced)'}</small>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className={'clean-delivery-chip'}>
                    <svg
                      width={'13'}
                      height={'13'}
                      viewBox={'0 0 24 24'}
                      fill={'none'}
                      stroke={'#10b981'}
                      strokeWidth={'2.5'}
                    >
                      <path d={'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}></path>
                    </svg>
                    <span>{'✓ Clean Delivery'}</span>
                  </div>
                </>
              );
            const seenBadge = r.firstOpenAt ? (
              <>
                <div className={'seen-indicator-stack'}>
                  <span className={'status-pill good seen-pill'}>
                    <svg
                      width={'12'}
                      height={'12'}
                      viewBox={'0 0 24 24'}
                      fill={'none'}
                      stroke={'currentColor'}
                      strokeWidth={'2.5'}
                    >
                      <path d={'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'}></path>
                      <circle cx={'12'} cy={'12'} r={'3'}></circle>
                    </svg>
                    {'\n                     Seen'}
                    {r.opens?.length > 1 ? ` (${r.opens.length}x)` : ''}
                  </span>
                  <small className={'seen-time-hint'}>
                    {'Opened '}
                    {new Date(r.firstOpenAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </div>
              </>
            ) : (
              <>
                <span className={'status-pill unopened-pill'}>
                  <svg
                    width={'12'}
                    height={'12'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2'}
                  >
                    <path
                      d={
                        'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z'
                      }
                    ></path>
                    <polyline points={'22,6 12,13 2,6'}></polyline>
                  </svg>
                  {'\n                   Unopened\n                 '}
                </span>
              </>
            );
            let placementStatusHtml: ReactNode = '';
            if (r.seedId) {
              if (r.placement?.status === 'inbox') {
                placementStatusHtml = (
                  <>
                    <div className={'placement-result-tag'}>
                      <span
                        className={'status-pill good'}
                        style={{ fontWeight: '700', padding: '2px 8px', fontSize: '11px' }}
                      >
                        {'📥 Inbox'}
                      </span>
                    </div>
                  </>
                );
              } else if (r.placement?.status === 'spam') {
                placementStatusHtml = (
                  <>
                    <div className={'placement-result-tag'}>
                      <span
                        className={'status-pill blocked'}
                        style={{ fontWeight: '700', padding: '2px 8px', fontSize: '11px' }}
                      >
                        {'🚫 Spam'}
                      </span>
                    </div>
                  </>
                );
              } else if (r.placement?.status && r.placement?.status !== 'awaiting') {
                placementStatusHtml = (
                  <>
                    <div className={'placement-result-tag'}>
                      <span className={'status-pill'} style={{ fontSize: '11px' }}>
                        {'📁 '}
                        {displayText(r.placement.status)}
                      </span>
                    </div>
                  </>
                );
              } else if (r.attemptedAt) {
                placementStatusHtml = (
                  <>
                    <div className={'quick-placement-actions'}>
                      <Button
                        type={'button'}
                        className={'quick-place-btn inbox'}
                        data-seed-place={displayText(r.id)}
                        data-place-status={'inbox'}
                        title={'Confirm email reached Inbox'}
                      >
                        {'📥 Inbox'}
                      </Button>
                      <Button
                        type={'button'}
                        className={'quick-place-btn spam'}
                        data-seed-place={displayText(r.id)}
                        data-place-status={'spam'}
                        title={'Email landed in Spam folder'}
                      >
                        {'🚫 Spam'}
                      </Button>
                    </div>
                  </>
                );
              } else {
                placementStatusHtml = (
                  <>
                    <small className={'awaiting-seed-note'}>{'Awaiting dispatch'}</small>
                  </>
                );
              }
            }
            const sendTimeStr = new Date(r.attemptedAt || r.createdAt).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <>
                <tr className={'tracking-table-row'}>
                  <td>
                    <div className={'recipient-cell-content'}>
                      <div className={'recipient-meta-line'}>
                        <strong className={'recipient-address'} title={displayText(r.recipient)}>
                          {displayText(r.recipient)}
                        </strong>
                        {r.seedId ? (
                          <>
                            <span className={'badge-seed-tag'}>{'🌱 Seed'}</span>
                          </>
                        ) : (
                          ''
                        )}
                        {r.campaignId ? (
                          <>
                            <span className={'badge-campaign-tag'}>
                              {displayText(r.campaignId)}
                            </span>
                          </>
                        ) : (
                          ''
                        )}
                      </div>
                      <div
                        className={'recipient-subject-line'}
                        title={displayText(r.subject || '')}
                      >
                        {displayText(r.subject || '(No subject)')}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={'send-status-cell'}>
                      {sendStatusBadge}
                      <small className={'timestamp-sub'}>{displayText(sendTimeStr)}</small>
                    </div>
                  </td>
                  <td>
                    <div className={'bounce-cell-content'}>
                      {bounceBadge}
                      {r.bounceReason ? (
                        <>
                          <small
                            className={'bounce-reason-text'}
                            title={displayText(r.bounceReason)}
                          >
                            {displayText(r.bounceReason)}
                          </small>
                        </>
                      ) : (
                        ''
                      )}
                    </div>
                  </td>
                  <td>
                    <div className={'engagement-cell-content'}>
                      {seenBadge}
                      {placementStatusHtml}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className={'row-actions-group'}>
                      <Button
                        className={'secondary action-inspect-btn'}
                        data-track={i}
                        title={'Inspect complete delivery timeline & technical specs'}
                      >
                        <svg
                          width={'13'}
                          height={'13'}
                          viewBox={'0 0 24 24'}
                          fill={'none'}
                          stroke={'currentColor'}
                          strokeWidth={'2'}
                        >
                          <circle cx={'11'} cy={'11'} r={'8'}></circle>
                          <line x1={'21'} y1={'21'} x2={'16.65'} y2={'16.65'}></line>
                        </svg>
                        {'\n                      Details\n                    '}
                      </Button>
                      {r.seedId && r.sendStatus === 'pending' && !r.preparationStartedAt ? (
                        <>
                          <Button
                            className={'primary-btn seed-dispatch-btn'}
                            data-seed-send={displayText(r.id)}
                            title={'Send seed test email'}
                          >
                            <svg
                              width={'12'}
                              height={'12'}
                              viewBox={'0 0 24 24'}
                              fill={'none'}
                              stroke={'currentColor'}
                              strokeWidth={'2'}
                            >
                              <line x1={'22'} y1={'2'} x2={'11'} y2={'13'}></line>
                              <polygon points={'22 2 15 22 11 13 2 9 22 2'}></polygon>
                            </svg>
                            {'\n                           Send seed\n                         '}
                          </Button>
                        </>
                      ) : (
                        ''
                      )}
                    </div>
                  </td>
                </tr>
              </>
            );
          })
        ) : (
          <>
            <tr>
              <td colSpan={5} className={'empty-table-state'}>
                <div className={'empty-message'}>
                  {'No tracking records match your current filters.'}
                </div>
              </td>
            </tr>
          </>
        ),
      );
    }
    if ($('trackingPageInfo')) {
      $('trackingPageInfo').textContent = total
        ? `${trackingOffset + 1}–${Math.min(trackingOffset + 50, total)} of ${total} records`
        : 'No messages recorded';
    }
    if ($('trackingPrev')) $('trackingPrev').disabled = trackingOffset === 0;
    if ($('trackingNext')) $('trackingNext').disabled = trackingOffset + 50 >= total;
    if ($('trackingConfig')) {
      $('trackingConfig').textContent =
        `IMAP monitor: ${data.monitorEnabled ? 'enabled' : 'disabled (set FC_MONITOR_ENABLED=1)'}. Open tracking: ${data.opensEnabled ? 'enabled by configuration' : 'disabled'}. Keep the app running for monitoring.`;
    }
    if ($('trackingWorker')) {
      $('trackingWorker').textContent = Object.keys(data.worker || {}).length
        ? JSON.stringify(data.worker, null, 2)
        : 'No mailbox checks recorded.';
    }
    if ($('trackingReview')) {
      $('trackingReview').textContent =
        data.review && data.review.length
          ? JSON.stringify(data.review, null, 2)
          : 'No unmatched notifications.';
    }
    if ($('trackingSeeds')) {
      if (data.seeds && data.seeds.length) {
        renderRegion(
          $('trackingSeeds'),
          <>
            <div className={'seed-targets-deck'}>
              {data.seeds.map((s) => (
                <>
                  <div className={'seed-target-tile'}>
                    <div className={'seed-target-badge-icon'}>
                      <svg
                        width={'16'}
                        height={'16'}
                        viewBox={'0 0 24 24'}
                        fill={'none'}
                        stroke={'currentColor'}
                        strokeWidth={'2'}
                      >
                        <path
                          d={
                            'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z'
                          }
                        ></path>
                        <polyline points={'22,6 12,13 2,6'}></polyline>
                      </svg>
                    </div>
                    <div>
                      <div className={'seed-target-address'}>
                        <strong>{displayText(s.email)}</strong>
                        <span className={'seed-id-tag'}>{displayText(s.id)}</span>
                      </div>
                      <div className={'seed-target-sub'}>
                        <span className={'status-dot-pulse'}></span>
                        {s.automated ? 'Automated IMAP Active' : 'Manual Placement Inspection'}
                      </div>
                    </div>
                  </div>
                </>
              ))}
            </div>
          </>,
        );
        if ($('seedCountBadge')) {
          $('seedCountBadge').textContent =
            `📬 ${data.seeds.length} Active Test Mailbox${data.seeds.length > 1 ? 'es' : ''}`;
        }
      } else {
        renderRegion(
          $('trackingSeeds'),
          <>
            <div className={'seed-empty-alert'}>
              {'⚠️ No seed recipients configured. Configure '}
              <code>{'FC_SEEDS'}</code>
              {' in '}
              <code>{'.env'}</code>
              {' to enable controlled inbox testing.'}
            </div>
          </>,
        );
      }
    }
    if ($('seedTestKey') && !$('seedTestKey').value) $('seedTestKey').value = generateSeedKey();
    loadSeedTemplates();
    await loadSeedSamples($('seedSampleSearch')?.value || '');
    if (!$('healthDomain').value) {
      $('healthDomain').value =
        session.state.profiles
          .find((p) => p.id === session.state.activeProfile)
          ?.email.split('@')[1] || '';
    }
    if ($('healthSelectors') && !$('healthSelectors').value)
      $('healthSelectors').value = 'privateemail';
  } finally {
    trackingBusy = false;
  }
}

export function generateSeedKey() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `seed-${dateStr}-${rand}`;
}

export async function loadSeedSamples(query = '') {
  const sampleEl = $('seedSample');
  if (!sampleEl) return;
  const previous = sampleEl.value;
  try {
    const params = new URLSearchParams({ q: query, filter: 'ready', offset: '0' });
    let result = await api<LeadsResponse>(`/api/leads?${params}`);
    let leads = result.leads || [];
    if (!leads.length && !query) {
      const allResult = await api<LeadsResponse>('/api/leads?offset=0');
      leads = allResult.leads || [];
    }
    if (leads.length) {
      if ($('sampleCountHint'))
        $('sampleCountHint').textContent = `${leads.length} lead${leads.length > 1 ? 's' : ''}`;
      renderRegion(
        sampleEl,
        leads.map((l) => {
          const desc = [l.company, l.fields?.['owner / principal'], l.email]
            .filter(Boolean)
            .join(' · ');
          return (
            <>
              <option value={displayText(l.id)}>{displayText(desc)}</option>
            </>
          );
        }),
      );
      if (leads.some((l) => l.id === previous)) {
        sampleEl.value = previous;
      } else if (leads.some((l) => l.id === session.previewId)) {
        sampleEl.value = String(session.previewId);
      } else if (leads.length > 0) {
        sampleEl.selectedIndex = 0;
      }
    } else {
      if ($('sampleCountHint')) $('sampleCountHint').textContent = '0 leads';
      renderRegion(
        sampleEl,
        <>
          <option value={''}>{'No campaign leads match'}</option>
        </>,
      );
    }
    updateSeedPreview();
  } catch (err) {
    console.error('Failed to load dynamic seed samples:', err);
  }
}

export function loadSeedTemplates() {
  const tmplEl = $('seedTemplate');
  if (!tmplEl || !session.state?.templates) return;
  const activeKey = $('template')?.value || Object.keys(session.state.templates)[0];
  const keys = Object.keys(session.state.templates);
  renderRegion(
    tmplEl,
    keys.map((k) => (
      <>
        <option value={displayText(k)}>{displayText(k)}</option>
      </>
    )),
  );
  if (keys.includes(activeKey)) tmplEl.value = activeKey;
}

export async function updateSeedPreview() {
  const leadId = $('seedSample')?.value;
  const templateKey = $('seedTemplate')?.value || $('template')?.value;
  const subjEl = $('seedPreviewSubject');
  const bodyEl = $('seedPreviewBody');
  const metaEl = $('seedPreviewMeta');
  const warnEl = $('seedPreviewWarnings');
  if (!leadId || !templateKey) {
    if (subjEl) subjEl.textContent = 'Select a lead to preview';
    if (bodyEl)
      bodyEl.textContent =
        'Click any lead on the left under "Content Sample Lead" to render dynamic template variables (company name, owner, city).';
    if (metaEl) metaEl.textContent = 'Awaiting selection';
    if (warnEl) warnEl.hidden = true;
    return;
  }
  try {
    const preview = await api<PreviewResponse>(
      `/api/preview?id=${encodeURIComponent(leadId)}&key=${encodeURIComponent(templateKey)}`,
    );
    if (!preview || !preview.message) {
      if (subjEl) subjEl.textContent = '(Template could not render preview)';
      if (bodyEl) bodyEl.textContent = 'Unable to evaluate template tokens for this lead.';
      if (metaEl) metaEl.textContent = 'Render error';
      if (warnEl) warnEl.hidden = true;
      return;
    }
    if (subjEl) subjEl.textContent = `${preview.message.subject} [FC seed <id>]`;
    if (bodyEl) bodyEl.textContent = preview.message.body;
    if (metaEl)
      metaEl.textContent = `${preview.lead.company} · ${preview.lead.email || 'sample lead'}`;
    if (warnEl) {
      if (preview.warnings && preview.warnings.length) {
        renderRegion(
          warnEl,
          <>
            <strong>{'Note:'}</strong>
            {preview.warnings.map(displayText).join(' ')}
          </>,
        );
        warnEl.hidden = false;
      } else {
        warnEl.hidden = true;
      }
    }
  } catch (err) {
    if (subjEl) subjEl.textContent = 'Unable to load preview';
    if (bodyEl)
      bodyEl.textContent = errorMessage(err) || 'Error communicating with local preview endpoint.';
  }
}

export function renderTrackingDetail(r: TrackingRecord) {
  const panel = $('trackingDetail');
  if (!panel) return;
  if ($('trackingDrawerTitle')) {
    $('trackingDrawerTitle').textContent = r.recipient
      ? `Tracking: ${r.recipient}`
      : 'Tracking Details';
  }
  const fmt = (iso: string | number | Date | unknown) =>
    iso ? new Date(String(iso)).toLocaleString() : '—';
  const fmtTime = (iso: string | number | Date) =>
    iso
      ? new Date(String(iso)).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '—';
  // Badges matching lead details system
  const sendBadge =
    r.sendStatus === 'webmail_sent' ? (
      <>
        <span className={'status-pill good'}>
          <span className={'badge-dot dot-green'}></span>
          {'✓ Dispatched'}
        </span>
      </>
    ) : r.sendStatus === 'send_failed' ? (
      <>
        <span className={'status-pill blocked'}>
          <span className={'badge-dot dot-red'}></span>
          {'✕ Failed'}
        </span>
      </>
    ) : r.sendStatus === 'send_attempted' ? (
      <>
        <span className={'status-pill sent'}>
          <span className={'badge-dot dot-blue'}></span>
          {'⏳ Sending...'}
        </span>
      </>
    ) : (
      <>
        <span className={'status-pill'}>
          <span className={'badge-dot dot-muted'}></span>
          {displayText(r.sendStatus || 'Pending')}
        </span>
      </>
    );
  const seenBadge = r.firstOpenAt ? (
    <>
      <span className={'status-pill good'}>
        {'👁️ Seen'}
        {r.opens?.length > 1 ? ` (${r.opens.length}x)` : ''}
      </span>
    </>
  ) : (
    <>
      <span className={'status-pill unopened-pill'}>{'✉️ Unopened'}</span>
    </>
  );
  const bounceBadge =
    r.bounceStatus === 'hard_bounced' ? (
      <>
        <span className={'status-pill blocked'}>{'⛔ Hard Bounce'}</span>
      </>
    ) : r.bounceStatus === 'soft_bounced' ? (
      <>
        <span className={'status-pill warn'}>{'⚠️ Soft Bounce'}</span>
      </>
    ) : (
      <>
        <span className={'status-pill good'}>{'✓ Clean Delivery'}</span>
      </>
    );
  // Relative timing calculation
  let openRelative = '';
  if (r.attemptedAt && r.firstOpenAt) {
    const diffSec = Math.round(
      (new Date(r.firstOpenAt).getTime() - new Date(r.attemptedAt).getTime()) / 1000,
    );
    if (diffSec < 60) openRelative = `+${Math.max(0, diffSec)}s after send`;
    else if (diffSec < 3600) openRelative = `+${Math.round(diffSec / 60)}m after send`;
    else openRelative = `+${(diffSec / 3600).toFixed(1)}h after send`;
  }
  // Build Timeline Items
  const timelineEvents = [];
  if (r.events && r.events.length) {
    for (const ev of r.events) {
      if (ev.type === 'pending') {
        timelineEvents.push({
          time: ev.at,
          title: 'Queued for Outreach',
          desc: 'Message created and queued in campaign.',
          color: 'blue',
          icon: '⏱️',
        });
      } else if (ev.type === 'send_attempted') {
        timelineEvents.push({
          time: ev.at,
          title: 'Webmail Send Initiated',
          desc: 'Playwright initialized browser compose window and inserted content.',
          color: 'blue',
          icon: '🚀',
        });
      } else if (ev.type === 'webmail_sent') {
        timelineEvents.push({
          time: ev.at,
          title: 'Webmail Confirmed Dispatched',
          desc: 'Namecheap mail server verified message was sent.',
          color: 'green',
          icon: '✓',
        });
      } else if (ev.type === 'sent_message_id') {
        timelineEvents.push({
          time: ev.at,
          title: 'Message-ID Recorded',
          desc: (
            <>
              {'Mail server assigned identifier: '}
              <code>{displayText(ev.messageId)}</code>
            </>
          ),
          color: 'blue',
          icon: '🆔',
        });
      } else if (ev.type === 'open_detected') {
        timelineEvents.push({
          time: ev.at,
          title: 'Recipient Opened Email (Open Signal)',
          desc: `${displayText(ev.signal || 'Remote 1x1 image request received from mail client.')} ${
            openRelative ? (
              <>
                <strong style={{ color: '#10b981' }}>
                  {'('}
                  {openRelative}
                  {')'}
                </strong>
              </>
            ) : (
              ''
            )
          }`,
          color: 'emerald',
          icon: '👁️',
        });
      } else if (ev.type === 'hard_bounced') {
        timelineEvents.push({
          time: ev.at,
          title: 'Hard Bounce Reported (Permanent DSN)',
          desc: `${displayText(ev.diagnostic || ev.status || r.bounceReason || 'Mailbox unavailable.')}`,
          color: 'red',
          icon: '⛔',
        });
      } else if (ev.type === 'soft_bounced') {
        timelineEvents.push({
          time: ev.at,
          title: 'Soft Bounce Reported (Temporary Delay)',
          desc: `${displayText(ev.diagnostic || ev.status || r.bounceReason || 'Temporary delivery delay.')}`,
          color: 'amber',
          icon: '⚠️',
        });
      } else if (ev.type === 'seed_placement') {
        timelineEvents.push({
          time: ev.at,
          title: 'Seed Placement Verified',
          desc: (
            <>
              {'Folder: '}
              <strong>{displayText(ev.status || '')}</strong>
              {' · Evidence: '}
              {displayText(ev.evidence || '')}
            </>
          ),
          color: 'green',
          icon: '🎯',
        });
      } else {
        timelineEvents.push({
          time: ev.at,
          title: displayText(ev.type),
          desc: displayText(JSON.stringify(ev)),
          color: 'blue',
          icon: '•',
        });
      }
    }
  } else {
    if (r.createdAt)
      timelineEvents.push({
        time: r.createdAt,
        title: 'Message Initialized',
        desc: 'Added to tracking index.',
        color: 'blue',
        icon: '⏱️',
      });
    if (r.attemptedAt)
      timelineEvents.push({
        time: r.attemptedAt,
        title: 'Send Attempted',
        desc: 'Webmail compose window prepared.',
        color: 'blue',
        icon: '🚀',
      });
    if (r.confirmedAt)
      timelineEvents.push({
        time: r.confirmedAt,
        title: 'Webmail Send Confirmed',
        desc: 'Message sent successfully.',
        color: 'green',
        icon: '✓',
      });
    if (r.firstOpenAt)
      timelineEvents.push({
        time: r.firstOpenAt,
        title: 'Recipient Opened Email',
        desc: 'Tracking pixel loaded.',
        color: 'emerald',
        icon: '👁️',
      });
    if (r.bounceStatus)
      timelineEvents.push({
        time: r.lastEventAt || r.confirmedAt,
        title: `${r.bounceStatus} Notification`,
        desc: r.bounceReason || 'Delivery failure notice.',
        color: 'red',
        icon: '⛔',
      });
  }
  const timelineHtml = timelineEvents.map((ev) => (
    <>
      <div className={'timeline-item'}>
        <div className={'timeline-node node-' + ev.color}>{ev.icon}</div>
        <div className={'timeline-content'}>
          <div className={'timeline-header'}>
            <span className={'timeline-title'}>{ev.title}</span>
            <span className={'timeline-time'}>{fmt(ev.time)}</span>
          </div>
          <div className={'timeline-desc'}>{ev.desc}</div>
        </div>
      </div>
    </>
  ));
  renderRegion(
    panel,
    <>
      <div className={'lead-details-hero'}>
        <h2 className={'lead-hero-company'} style={{ fontSize: '17px', wordBreak: 'break-all' }}>
          {displayText(r.recipient)}
        </h2>
        <div className={'lead-hero-subtitle'}>
          <span>
            <strong>{displayText(r.subject || '(No Subject)')}</strong>
          </span>
          {r.sender ? (
            <>
              <span>
                {'• From: '}
                {displayText(r.sender)}
              </span>
            </>
          ) : (
            ''
          )}
        </div>
        <div className={'lead-badges-row'}>
          {sendBadge}
          {seenBadge}
          {bounceBadge}
        </div>
      </div>
      <div id={'trackingSecOverview'} className={'drawer-tab-pane active'}>
        <div className={'lead-details-card'}>
          <h4 className={'lead-details-title'}>
            <svg
              width={'14'}
              height={'14'}
              viewBox={'0 0 24 24'}
              fill={'none'}
              stroke={'currentColor'}
              strokeWidth={'2'}
            >
              <circle cx={'12'} cy={'12'} r={'10'}></circle>
              <polyline points={'12 6 12 12 16 14'}></polyline>
            </svg>
            {'\n          Delivery & Engagement Metrics\n        '}
          </h4>
          <div className={'lead-details-grid'}>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Send Status'}</span>
              <span className={'lead-detail-value'}>
                {r.sendStatus === 'webmail_sent'
                  ? 'Confirmed'
                  : displayText(r.sendStatus || 'Pending')}
                <small style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>
                  {'('}
                  {r.confirmedAt
                    ? fmtTime(r.confirmedAt)
                    : r.attemptedAt
                      ? fmtTime(r.attemptedAt)
                      : '—'}
                  {')'}
                </small>
              </span>
            </div>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Read Engagement'}</span>
              <span
                className={'lead-detail-value'}
                style={nativeStyle(
                  'color: ' + (r.firstOpenAt ? '#10b981' : 'var(--text-muted)') + ';',
                )}
              >
                {r.firstOpenAt ? `Seen (${r.opens?.length || 1}x)` : 'Unopened'}
                <small style={{ fontWeight: 'normal' }}>
                  {'('}
                  {r.firstOpenAt ? openRelative || fmtTime(r.firstOpenAt) : 'No read detected'}
                  {')'}
                </small>
              </span>
            </div>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Deliverability Health'}</span>
              <span
                className={'lead-detail-value'}
                style={nativeStyle('color: ' + (r.bounceStatus ? '#ef4444' : '#10b981') + ';')}
              >
                {r.bounceStatus ? `${displayText(r.bounceStatus)}` : 'Clean (No DSN)'}
              </span>
            </div>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Sender Account'}</span>
              <span className={'lead-detail-value'}>{displayText(r.sender || 'Not recorded')}</span>
            </div>
          </div>
        </div>
        {r.bounceReason || r.bounceStatus ? (
          <>
            <div className={'lead-details-card'} style={{ borderLeft: '3px solid #ef4444' }}>
              <h4 className={'lead-details-title'} style={{ color: '#f87171' }}>
                <svg
                  width={'14'}
                  height={'14'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <path
                    d={
                      'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'
                    }
                  ></path>
                  <line x1={'12'} y1={'9'} x2={'12'} y2={'13'}></line>
                  <line x1={'12'} y1={'17'} x2={'12.01'} y2={'17'}></line>
                </svg>
                {'\n          Delivery Failure Diagnostic ('}
                {displayText(r.bounceStatus || 'bounced')}
                {')\n        '}
              </h4>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#fca5a5',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  marginBottom: '6px',
                  wordBreak: 'break-all',
                }}
              >
                {displayText(r.bounceReason || 'smtp; 550 mailbox unavailable')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                {
                  'Recipient reported a permanent delivery failure via IMAP DSN notification. This recipient has been automatically excluded from future outreach.'
                }
              </div>
            </div>
          </>
        ) : (
          ''
        )}
        <div className={'lead-details-card'}>
          <h4 className={'lead-details-title'}>
            <svg
              width={'14'}
              height={'14'}
              viewBox={'0 0 24 24'}
              fill={'none'}
              stroke={'currentColor'}
              strokeWidth={'2'}
            >
              <circle cx={'12'} cy={'12'} r={'10'}></circle>
              <polyline points={'12 6 12 12 16 14'}></polyline>
            </svg>
            {'\n          Lifecycle Event Timeline\n        '}
          </h4>
          <div className={'tracking-timeline'}>
            {contentOr(
              timelineHtml,
              <>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '8px 0' }}>
                  {'No timeline events recorded.'}
                </div>
              </>,
            )}
          </div>
        </div>
      </div>
      <div id={'trackingSecSpecs'} className={'drawer-tab-pane'} style={{ display: 'none' }}>
        <div className={'lead-details-card'}>
          <h4 className={'lead-details-title'}>
            <svg
              width={'14'}
              height={'14'}
              viewBox={'0 0 24 24'}
              fill={'none'}
              stroke={'currentColor'}
              strokeWidth={'2'}
            >
              <path d={'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'}></path>
              <polyline points={'14 2 14 8 20 8'}></polyline>
              <line x1={'16'} y1={'13'} x2={'8'} y2={'13'}></line>
              <line x1={'16'} y1={'17'} x2={'8'} y2={'17'}></line>
              <polyline points={'10 9 9 9 8 9'}></polyline>
            </svg>
            {'\n          Message Identifiers & Routing\n        '}
          </h4>
          <div className={'lead-details-grid'}>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Recipient'}</span>
              <span className={'lead-detail-value'}>
                <a href={'mailto:' + displayText(r.recipient)}>{displayText(r.recipient)}</a>
                <Button
                  type={'button'}
                  className={'copy-mini-btn'}
                  data-copy={displayText(r.recipient)}
                  title={'Copy recipient'}
                >
                  <svg
                    width={'12'}
                    height={'12'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2'}
                  >
                    <rect x={'9'} y={'9'} width={'13'} height={'13'} rx={'2'} ry={'2'}></rect>
                    <path d={'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'}></path>
                  </svg>
                </Button>
              </span>
            </div>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Sender Account'}</span>
              <span className={'lead-detail-value'}>{displayText(r.sender || 'Not recorded')}</span>
            </div>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Campaign ID'}</span>
              <span className={'lead-detail-value'}>
                {displayText(r.campaignId || 'Direct Outreach')}
              </span>
            </div>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Tracking UUID'}</span>
              <span className={'lead-detail-value'}>
                <code>{displayText(r.id)}</code>
                <Button
                  type={'button'}
                  className={'copy-mini-btn'}
                  data-copy={displayText(r.id)}
                  title={'Copy UUID'}
                >
                  <svg
                    width={'12'}
                    height={'12'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2'}
                  >
                    <rect x={'9'} y={'9'} width={'13'} height={'13'} rx={'2'} ry={'2'}></rect>
                    <path d={'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'}></path>
                  </svg>
                </Button>
              </span>
            </div>
            {r.messageIds?.length ? (
              <>
                <div className={'lead-detail-item full-width'}>
                  <span className={'lead-detail-label'}>{'Recorded Message-ID'}</span>
                  <span className={'lead-detail-value'}>
                    <code>{displayText(r.messageIds[0])}</code>
                    <Button
                      type={'button'}
                      className={'copy-mini-btn'}
                      data-copy={displayText(r.messageIds[0])}
                      title={'Copy Message-ID'}
                    >
                      <svg
                        width={'12'}
                        height={'12'}
                        viewBox={'0 0 24 24'}
                        fill={'none'}
                        stroke={'currentColor'}
                        strokeWidth={'2'}
                      >
                        <rect x={'9'} y={'9'} width={'13'} height={'13'} rx={'2'} ry={'2'}></rect>
                        <path d={'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'}></path>
                      </svg>
                    </Button>
                  </span>
                </div>
              </>
            ) : (
              ''
            )}
          </div>
        </div>
        <div className={'lead-details-card'}>
          <h4 className={'lead-details-title'}>
            <svg
              width={'14'}
              height={'14'}
              viewBox={'0 0 24 24'}
              fill={'none'}
              stroke={'currentColor'}
              strokeWidth={'2'}
            >
              <rect x={'3'} y={'4'} width={'18'} height={'18'} rx={'2'} ry={'2'}></rect>
              <line x1={'16'} y1={'2'} x2={'16'} y2={'6'}></line>
              <line x1={'8'} y1={'2'} x2={'8'} y2={'6'}></line>
              <line x1={'3'} y1={'10'} x2={'21'} y2={'10'}></line>
            </svg>
            {'\n          Transmission & Interaction Timestamps\n        '}
          </h4>
          <div className={'lead-details-grid'}>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Created At'}</span>
              <span className={'lead-detail-value'}>{fmt(r.createdAt)}</span>
            </div>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Webmail Confirmed At'}</span>
              <span className={'lead-detail-value'}>{fmt(r.confirmedAt || r.attemptedAt)}</span>
            </div>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'First Read Detected'}</span>
              <span className={'lead-detail-value'}>
                {r.firstOpenAt ? (
                  <>
                    <span style={{ color: '#10b981', fontWeight: '600' }}>
                      {fmt(r.firstOpenAt)}
                      {openRelative ? (
                        <>
                          <small>
                            {'('}
                            {openRelative}
                            {')'}
                          </small>
                        </>
                      ) : (
                        ''
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>{'Unopened'}</span>
                  </>
                )}
              </span>
            </div>
            <div className={'lead-detail-item'}>
              <span className={'lead-detail-label'}>{'Total Read Sessions'}</span>
              <span className={'lead-detail-value'}>
                <strong>
                  {r.opens?.length || (r.firstOpenAt ? 1 : 0)}
                  {' recorded interaction(s)'}
                </strong>
              </span>
            </div>
          </div>
        </div>
        {r.seedId ? (
          <>
            <div className={'lead-details-card'}>
              <h4 className={'lead-details-title'}>
                <svg
                  width={'14'}
                  height={'14'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <circle cx={'12'} cy={'12'} r={'10'}></circle>
                  <circle cx={'12'} cy={'12'} r={'6'}></circle>
                  <circle cx={'12'} cy={'12'} r={'2'}></circle>
                </svg>
                {'\n          Seed Inbox Placement Verification\n        '}
              </h4>
              <div className={'lead-details-grid'}>
                <div className={'lead-detail-item'}>
                  <span className={'lead-detail-label'}>{'Seed ID'}</span>
                  <span className={'lead-detail-value'}>{displayText(r.seedId)}</span>
                </div>
                <div className={'lead-detail-item'}>
                  <span className={'lead-detail-label'}>{'Folder Placement'}</span>
                  <span className={'lead-detail-value'}>
                    <strong
                      style={nativeStyle(
                        'color: ' +
                          (r.placement?.status === 'inbox'
                            ? '#10b981'
                            : r.placement?.status === 'spam'
                              ? '#ef4444'
                              : '#fff') +
                          ';',
                      )}
                    >
                      {r.placement?.status === 'inbox'
                        ? '📥 Inbox (Verified)'
                        : r.placement?.status === 'spam'
                          ? '🚫 Spam / Junk Folder'
                          : displayText(r.placement?.status || 'Awaiting verification')}
                    </strong>
                  </span>
                </div>
                <div className={'lead-detail-item full-width'}>
                  <span className={'lead-detail-label'}>{'Verification Evidence / Note'}</span>
                  <span className={'lead-detail-value'}>
                    {displayText(
                      r.placement?.evidence ||
                        (r.attemptedAt
                          ? 'Not yet verified. Select folder below:'
                          : 'Awaiting dispatch'),
                    )}
                  </span>
                </div>
                {r.attemptedAt ? (
                  <>
                    <div
                      className={'lead-detail-item full-width'}
                      style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span className={'lead-detail-label'}>{'Record Placement Result'}</span>
                      <div
                        style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}
                      >
                        <Button
                          type={'button'}
                          className={'btn-placement-inbox'}
                          data-drawer-place={displayText(r.id)}
                          data-drawer-status={'inbox'}
                        >
                          {'📥 Mark as Inbox'}
                        </Button>
                        <Button
                          type={'button'}
                          className={'btn-placement-spam'}
                          data-drawer-place={displayText(r.id)}
                          data-drawer-status={'spam'}
                        >
                          {'🚫 Mark as Spam'}
                        </Button>
                        <Button
                          type={'button'}
                          className={'secondary'}
                          data-drawer-place={displayText(r.id)}
                          data-drawer-status={'other'}
                          style={{ fontSize: '11.5px', padding: '6px 12px' }}
                        >
                          {'📁 Other Folder'}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  ''
                )}
              </div>
            </div>
          </>
        ) : (
          ''
        )}
      </div>
      <div id={'trackingSecRaw'} className={'drawer-tab-pane'} style={{ display: 'none' }}>
        <div className={'lead-details-card'}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h4 className={'lead-details-title'} style={{ margin: '0' }}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <polyline points={'16 18 22 12 16 6'}></polyline>
                <polyline points={'8 6 2 12 8 18'}></polyline>
              </svg>
              {'\n            Complete Tracking Record (JSON)\n          '}
            </h4>
            <Button
              type={'button'}
              className={'secondary'}
              data-copy-json={''}
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              {'Copy JSON'}
            </Button>
          </div>
          <pre
            className={'message-preview-box'}
            style={{
              maxHeight: '440px',
              overflow: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: '11.5px',
              lineHeight: '1.5',
              color: '#cbd5e1',
              background: 'var(--bg-surface-elevated, #1a1e26)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              margin: '0',
            }}
          >
            {displayText(JSON.stringify(r, null, 2))}
          </pre>
        </div>
      </div>
    </>,
  );
  panel.hidden = false;
  switchTrackingDrawerTab('overview');
  // Wire footer Copy Summary button
  const copySummaryBtn = $('trackingCopyBtn');
  if (copySummaryBtn) {
    uiScope.handler(copySummaryBtn, 'onclick', async () => {
      const summaryText = `Recipient: ${r.recipient}\nSubject: ${r.subject || '(No Subject)'}\nSend Status: ${r.sendStatus}\nDelivery: ${r.confirmedAt ? 'Confirmed' : 'Pending'}\nFirst Open: ${r.firstOpenAt || 'Unopened'}\nDeliverability: ${r.bounceStatus || 'Clean'}\nTracking ID: ${r.id}`;
      const ok = await copyToClipboard(summaryText);
      if (ok) {
        const orig = captureContent(copySummaryBtn);
        renderRegion(
          copySummaryBtn,
          <>
            <svg
              width={'14'}
              height={'14'}
              viewBox={'0 0 24 24'}
              fill={'none'}
              stroke={'#10b981'}
              strokeWidth={'2'}
            >
              <polyline points={'20 6 9 17 4 12'}></polyline>
            </svg>
            {' Copied!'}
          </>,
        );
        uiScope.timeout(() => {
          renderRegion(copySummaryBtn, orig);
        }, 1500);
        notice('Summary copied to clipboard.');
      }
    });
  }
  // Wire mini copy buttons
  panel.querySelectorAll<HTMLElement>('[data-copy]').forEach((btn) => {
    uiScope.handler(btn, 'onclick', async () => {
      const text = btn.dataset.copy;
      const ok = await copyToClipboard(text);
      if (ok) {
        const orig = captureContent(btn);
        btn.classList.add('copied');
        renderRegion(
          btn,
          <>
            <svg
              width={'12'}
              height={'12'}
              viewBox={'0 0 24 24'}
              fill={'none'}
              stroke={'#10b981'}
              strokeWidth={'2.5'}
            >
              <polyline points={'20 6 9 17 4 12'}></polyline>
            </svg>
          </>,
        );
        uiScope.timeout(() => {
          btn.classList.remove('copied');
          renderRegion(btn, orig);
        }, 1500);
        notice(`Copied: ${text}`);
      }
    });
  });
  // Wire drawer placement buttons
  panel.querySelectorAll<HTMLElement>('[data-drawer-place]').forEach((btn) => {
    uiScope.handler(btn, 'onclick', () =>
      action(btn, async () => {
        const trackingId = btn.dataset.drawerPlace;
        const status = btn.dataset.drawerStatus;
        await api('/api/tracking/manual-placement', {
          trackingId,
          status,
          evidence: `Manual verification: marked ${status} in Tracking Details Drawer`,
        });
        await loadTracking();
        const updated = trackingRecords.find((rec) => rec.id === trackingId);
        if (updated) renderTrackingDetail(updated);
      }),
    );
  });
  // Wire copy JSON button
  const copyJsonBtn = panel.querySelector<HTMLElement>('[data-copy-json]');
  if (copyJsonBtn) {
    uiScope.handler(copyJsonBtn, 'onclick', async () => {
      const ok = await copyToClipboard(JSON.stringify(r, null, 2));
      if (ok) {
        const orig = copyJsonBtn.textContent;
        copyJsonBtn.textContent = '✓ Copied!';
        uiScope.timeout(() => {
          copyJsonBtn.textContent = orig;
        }, 1500);
        notice('Raw JSON copied to clipboard.');
      }
    });
  }
}

export function setDomainPreset(selectors: string, btn: HTMLButtonElement) {
  if ($('healthSelectors')) $('healthSelectors').value = selectors;
  document
    .querySelectorAll<HTMLElement>('.preset-pill')
    .forEach((p) => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

export function renderDomainReport(result: DomainReport) {
  const reportEl = $('domainHealthReport');
  if (!reportEl) return;
  reportEl.style.display = 'block';
  if ($('domainRawDetails')) $('domainRawDetails').hidden = false;
  const domain = displayText(result.domain || '');
  const spfFound = result.spf?.state === 'found' && (result.spf.records || []).length === 1;
  const dkimFound =
    Array.isArray(result.dkim) &&
    result.dkim.some((d) => d.state === 'found' && (d.records || []).length > 0);
  const dmarcFound = result.dmarc?.state === 'found' && (result.dmarc.records || []).length >= 1;
  let passedChecks = 0;
  if (spfFound) passedChecks++;
  if (dkimFound) passedChecks++;
  if (dmarcFound) passedChecks++;
  let bannerClass = 'good';
  let bannerTitle = 'All Authentication Records Active';
  let bannerDesc = (
    <>
      {'Domain '}
      <strong>{domain}</strong>
      {
        ' meets all modern deliverability standards (SPF, DKIM, and DMARC aligned). Outreach emails will reach primary inboxes.'
      }
    </>
  );
  if (passedChecks === 2) {
    bannerClass = 'warn';
    bannerTitle = '2 of 3 Checks Passing — DMARC Action Required';
    bannerDesc = (
      <>
        {'SPF and DKIM are validated, but '}
        <strong>{'DMARC is missing'}</strong>
        {
          '. Google and Yahoo spam filters heavily deprioritize domains without published DMARC policies.'
        }
      </>
    );
  } else if (passedChecks < 2) {
    bannerClass = 'bad';
    bannerTitle = `${passedChecks} of 3 Checks Passing — Deliverability Risk`;
    bannerDesc = (
      <>
        {'Key email authentication records are missing or unverified. Emails sent from '}
        <strong>{domain}</strong>
        {' have high risk of landing in spam or being rejected.'}
      </>
    );
  }
  if ($('domainScoreBadge')) {
    if (passedChecks === 3) {
      renderRegion(
        $('domainScoreBadge'),
        <>
          <span
            className={'status-pill'}
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontWeight: '600',
              padding: '4px 10px',
              fontSize: '11.5px',
            }}
          >
            {'✅ 100% Authenticated (3/3)'}
          </span>
        </>,
      );
    } else if (passedChecks === 2) {
      renderRegion(
        $('domainScoreBadge'),
        <>
          <span
            className={'status-pill'}
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              fontWeight: '600',
              padding: '4px 10px',
              fontSize: '11.5px',
            }}
          >
            {'⚠️ 67% Healthy (DMARC Missing)'}
          </span>
        </>,
      );
    } else {
      renderRegion(
        $('domainScoreBadge'),
        <>
          <span
            className={'status-pill'}
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              fontWeight: '600',
              padding: '4px 10px',
              fontSize: '11.5px',
            }}
          >
            {'❌ '}
            {passedChecks}
            {'/3 Checks Passing'}
          </span>
        </>,
      );
    }
  }
  const activeProfileEmail =
    session.state.profiles.find((p) => p.id === session.state.activeProfile)?.email ||
    `markanthony@${result.domain || 'fclogistics.us'}`;
  const recommendedDmarcVal = `v=DMARC1; p=none; sp=none; rua=mailto:${activeProfileEmail}`;
  const spfCard = (
    <>
      <div className={'domain-health-card ' + (spfFound ? 'status-pass' : 'status-fail')}>
        <div>
          <div className={'domain-card-head'}>
            <div className={'domain-card-title'}>
              <svg
                width={'16'}
                height={'16'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={spfFound ? '#10b981' : '#ef4444'}
                strokeWidth={'2.5'}
              >
                <circle cx={'12'} cy={'12'} r={'10'}></circle>
                {spfFound ? (
                  <>
                    <polyline points={'16 9 10 15 7 12'}></polyline>
                  </>
                ) : (
                  <>
                    <line x1={'15'} y1={'9'} x2={'9'} y2={'15'}></line>
                    <line x1={'9'} y1={'9'} x2={'15'} y2={'15'}></line>
                  </>
                )}
              </svg>
              {'\n            SPF Record\n          '}
            </div>
            <span
              className={'status-pill'}
              style={nativeStyle(
                'background: ' +
                  (spfFound
                    ? 'rgba(16, 185, 129, 0.12); color: #34d399;'
                    : 'rgba(239, 68, 68, 0.12); color: #f87171;') +
                  ' font-weight: 700; font-size: 11px;',
              )}
            >
              {spfFound ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 10px 0' }}>
            {'Specifies mail servers authorized to send on behalf of '}
            <code>{domain}</code>
            {'.'}
          </p>
          <div className={'domain-record-box'}>
            {result.spf?.records && result.spf.records.length > 0 ? (
              displayText(result.spf.records.join('\n'))
            ) : (
              <>
                <span style={{ color: '#ef4444' }}>{'No valid SPF TXT record detected.'}</span>
              </>
            )}
          </div>
        </div>
        <div
          style={nativeStyle(
            'font-size: 11.5px; color: ' +
              (spfFound ? '#34d399' : '#f87171') +
              '; display: flex; align-items: center; gap: 6px;',
          )}
        >
          {spfFound
            ? '✓ PrivateEmail mail server authorized'
            : '⚠ Outreach may bounce or fail authentication'}
        </div>
      </div>
    </>
  );
  const dkimResults = result.dkim || [];
  const dkimCard = (
    <>
      <div className={'domain-health-card ' + (dkimFound ? 'status-pass' : 'status-fail')}>
        <div>
          <div className={'domain-card-head'}>
            <div className={'domain-card-title'}>
              <svg
                width={'16'}
                height={'16'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={dkimFound ? '#10b981' : '#ef4444'}
                strokeWidth={'2.5'}
              >
                <path
                  d={
                    'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'
                  }
                ></path>
              </svg>
              {'\n            DKIM Signatures\n          '}
            </div>
            <span
              className={'status-pill'}
              style={nativeStyle(
                'background: ' +
                  (dkimFound
                    ? 'rgba(16, 185, 129, 0.12); color: #34d399;'
                    : 'rgba(239, 68, 68, 0.12); color: #f87171;') +
                  ' font-weight: 700; font-size: 11px;',
              )}
            >
              {dkimFound ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 10px 0' }}>
            {'Cryptographic signature verifying mail has not been tampered in transit.'}
          </p>
          <div className={'domain-record-box'}>
            {dkimResults.length > 0 ? (
              dkimResults.map((d) => (
                <>
                  <strong>{'Selector:'}</strong>
                  <code>{displayText(d.selector)}</code>
                  {' — '}
                  {d.state === 'found' ? (
                    <>
                      <span style={{ color: '#34d399' }}>{'Valid RSA Key'}</span>
                      <br />
                      {displayText(d.records.join('\n'))}
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#f87171' }}>{'Key missing'}</span>
                    </>
                  )}
                </>
              ))
            ) : (
              <>
                <span style={{ color: '#94a3b8' }}>{'No DKIM selectors queried.'}</span>
              </>
            )}
          </div>
        </div>
        <div
          style={nativeStyle(
            'font-size: 11.5px; color: ' +
              (dkimFound ? '#34d399' : '#f87171') +
              '; display: flex; align-items: center; gap: 6px;',
          )}
        >
          {dkimFound
            ? '✓ Valid DKIM key found on selector: ' +
              displayText(
                dkimResults
                  .filter((d) => d.state === 'found')
                  .map((d) => d.selector)
                  .join(', '),
              )
            : '⚠ No valid DKIM keys located'}
        </div>
      </div>
    </>
  );
  const dmarcCard = (
    <>
      <div className={'domain-health-card ' + (dmarcFound ? 'status-pass' : 'status-fail')}>
        <div>
          <div className={'domain-card-head'}>
            <div className={'domain-card-title'}>
              <svg
                width={'16'}
                height={'16'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={dmarcFound ? '#10b981' : '#f59e0b'}
                strokeWidth={'2.5'}
              >
                <path d={'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}></path>
              </svg>
              {'\n            DMARC Policy\n          '}
            </div>
            <span
              className={'status-pill'}
              style={nativeStyle(
                'background: ' +
                  (dmarcFound
                    ? 'rgba(16, 185, 129, 0.12); color: #34d399;'
                    : 'rgba(245, 158, 11, 0.15); color: #fbbf24;') +
                  ' font-weight: 700; font-size: 11px;',
              )}
            >
              {dmarcFound ? 'PASS' : 'MISSING'}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 10px 0' }}>
            {'Instructs Gmail & Outlook how to handle messages failing SPF/DKIM.'}
          </p>
          <div className={'domain-record-box'}>
            {result.dmarc?.records && result.dmarc.records.length > 0 ? (
              displayText(result.dmarc.records.join('\n'))
            ) : (
              <>
                <span style={{ color: '#fbbf24' }}>
                  {'No record at '}
                  <code>
                    {'_dmarc.'}
                    {domain}
                  </code>
                  {'.'}
                </span>
              </>
            )}
          </div>
        </div>
        <div
          style={nativeStyle(
            'font-size: 11.5px; color: ' +
              (dmarcFound ? '#34d399' : '#fbbf24') +
              '; display: flex; align-items: center; gap: 6px;',
          )}
        >
          {dmarcFound ? '✓ DMARC policy active' : '⚠ Required by 2024+ Gmail & Yahoo sender rules'}
        </div>
      </div>
    </>
  );
  let dmarcGuide: ReactNode = '';
  if (!dmarcFound) {
    dmarcGuide = (
      <>
        <div className={'dmarc-alert-box'}>
          <div style={{ fontSize: '24px', lineHeight: '1' }}>{'🛡️'}</div>
          <div style={{ flex: '1' }}>
            <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#fde68a' }}>
              {
                '\n            Action Required: Add Recommended DMARC TXT Record to Namecheap DNS\n          '
              }
            </div>
            <p
              style={{
                fontSize: '12.5px',
                color: '#e2e8f0',
                margin: '6px 0 10px 0',
                lineHeight: '1.5',
              }}
            >
              {
                '\n            Without DMARC, Gmail and Yahoo mark outreach emails as unauthenticated or throttle delivery to Spam. Add this single TXT record in your '
              }
              <strong>{'Namecheap Advanced DNS'}</strong>
              {' management console:\n          '}
            </p>
            <div
              style={{
                background: '#0f1219',
                border: '1px solid #283044',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px',
              }}
            >
              <table className={'dmarc-rec-table'}>
                <tbody>
                  <tr>
                    <td>{'Type:'}</td>
                    <td>
                      <strong style={{ color: '#38bdf8' }}>{'TXT Record'}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>{'Host:'}</td>
                    <td>
                      <code>{'_dmarc'}</code>
                    </td>
                  </tr>
                  <tr>
                    <td>{'Value / Target:'}</td>
                    <td>
                      <code
                        id={'dmarcRecordText'}
                        style={{ color: '#a7f3d0', wordBreak: 'break-all' }}
                      >
                        {displayText(recommendedDmarcVal)}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <td>{'TTL:'}</td>
                    <td>
                      <code>{'Automatic'}</code>
                      {' (or '}
                      <code>{'30 min'}</code>
                      {')'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                type={'button'}
                className={'copy-btn-action'}
                id={'copyDmarcBtn'}
                style={{
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: '600',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                <svg
                  width={'14'}
                  height={'14'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <rect x={'9'} y={'9'} width={'13'} height={'13'} rx={'2'} ry={'2'}></rect>
                  <path d={'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'}></path>
                </svg>
                {'\n              Copy DMARC TXT Record Value\n            '}
              </Button>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                {'\n              Policy '}
                <code>{'p=none'}</code>
                {
                  ' is safe monitoring mode (no legitimate mail will ever be dropped).\n            '
                }
              </span>
            </div>
          </div>
        </div>
      </>
    );
  }
  renderRegion(
    reportEl,
    <>
      <div className={'domain-score-banner ' + bannerClass}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={nativeStyle(
              'width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ' +
                (passedChecks === 3
                  ? 'rgba(16, 185, 129, 0.2)'
                  : passedChecks === 2
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(239, 68, 68, 0.2)') +
                '; font-size: 20px;',
            )}
          >
            {passedChecks === 3 ? '🛡️' : passedChecks === 2 ? '⚠️' : '🚨'}
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>{bannerTitle}</div>
            <div style={{ fontSize: '12.5px', color: '#cbd5e1', marginTop: '2px' }}>
              {bannerDesc}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
          {'\n        Audited at: '}
          <code>{new Date(result.checkedAt).toLocaleTimeString()}</code>
        </div>
      </div>
      <div className={'domain-cards-grid'}>
        {spfCard}
        {dkimCard}
        {dmarcCard}
      </div>
      {dmarcGuide}
    </>,
  );
  const copyBtn = $('copyDmarcBtn');
  if (copyBtn) {
    uiScope.handler(copyBtn, 'onclick', async () => {
      const ok = await copyToClipboard(recommendedDmarcVal);
      if (ok) {
        notice('Copied recommended DMARC record to clipboard!');
        copyBtn.textContent = '✓ Copied!';
        uiScope.timeout(() => {
          renderRegion(
            copyBtn,
            <>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <rect x={'9'} y={'9'} width={'13'} height={'13'} rx={'2'} ry={'2'}></rect>
                <path d={'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'}></path>
              </svg>
              {' Copy DMARC TXT Record Value'}
            </>,
          );
        }, 2000);
      }
    });
  }
}

export function mountTracking() {
  // Refresh Button Action
  if ($('trackingRefresh')) {
    uiScope.handler($('trackingRefresh'), 'onclick', (e) => action(e.currentTarget, loadTracking));
  }
  // Firebase Cloud Sync Action
  if ($('trackingFirebaseSync')) {
    uiScope.handler($('trackingFirebaseSync'), 'onclick', (e) =>
      action(e.currentTarget, async () => {
        try {
          const res = await api('/api/tracking/sync-firebase', {});
          notice(`Firebase: ${res.message || res.error || 'Sync finished.'}`);
        } catch (err) {
          notice(`Firebase sync failed: ${errorMessage(err)}`, 'error');
        }
        await refresh();
        await loadTracking();
      }),
    );
  }
  // Wire Change & Input Listeners
  for (const id of ['trackingCampaign', 'trackingStatus', 'trackingFrom', 'trackingUntil']) {
    if ($(id)) {
      uiScope.handler($(id), 'onchange', () => {
        trackingOffset = 0;
        loadTracking().catch((e) => notice(errorMessage(e)));
      });
    }
  }
  if ($('trackingSearch')) {
    uiScope.handler($('trackingSearch'), 'oninput', () => {
      uiScope.clearTimeout(trackingSearchDebounce ?? undefined);
      trackingSearchDebounce = uiScope.timeout(() => {
        trackingOffset = 0;
        loadTracking().catch((e) => notice(errorMessage(e)));
      }, 280);
    });
    uiScope.handler($('trackingSearch'), 'onchange', () => {
      trackingOffset = 0;
      loadTracking().catch((e) => notice(errorMessage(e)));
    });
  }
  // Quick Filter Segmented Pills
  if ($('trackingQuickPills')) {
    $('trackingQuickPills')
      .querySelectorAll<HTMLElement>('[data-pill-status]')
      .forEach((pill) => {
        uiScope.handler(pill, 'onclick', () => {
          $('trackingQuickPills')
            .querySelectorAll<HTMLElement>('[data-pill-status]')
            .forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
          const targetStatus = pill.dataset.pillStatus;
          if (targetStatus === 'seeds') {
            if ($('trackingStatus')) $('trackingStatus').value = '';
            if ($('trackingSearch')) $('trackingSearch').value = 'seed';
          } else {
            if ($('trackingStatus')) $('trackingStatus').value = String(targetStatus);
          }
          trackingOffset = 0;
          loadTracking().catch((e) => notice(errorMessage(e)));
        });
      });
  }
  // Reset Filters Action Button
  if ($('trackingResetFilters')) {
    uiScope.handler($('trackingResetFilters'), 'onclick', () => {
      if ($('trackingSearch')) $('trackingSearch').value = '';
      if ($('trackingCampaign')) $('trackingCampaign').value = '';
      if ($('trackingStatus')) $('trackingStatus').value = '';
      if ($('trackingFrom')) $('trackingFrom').value = '';
      if ($('trackingUntil')) $('trackingUntil').value = '';
      if ($('trackingQuickPills')) {
        $('trackingQuickPills')
          .querySelectorAll<HTMLElement>('[data-pill-status]')
          .forEach((p, idx) => {
            p.classList.toggle('active', idx === 0);
          });
      }
      trackingOffset = 0;
      loadTracking().catch((e) => notice(errorMessage(e)));
      notice('All tracking filters reset.');
    });
  }
  if ($('trackingPrev')) {
    uiScope.handler($('trackingPrev'), 'onclick', () => {
      trackingOffset = Math.max(0, trackingOffset - 50);
      loadTracking().catch((e) => notice(errorMessage(e)));
    });
  }
  if ($('trackingNext')) {
    uiScope.handler($('trackingNext'), 'onclick', () => {
      trackingOffset += 50;
      loadTracking().catch((e) => notice(errorMessage(e)));
    });
  }
  // Table click delegation
  if ($('trackingRows')) {
    uiScope.handler($('trackingRows'), 'onclick', (e) => {
      const button = eventElement(e).closest<HTMLElement>('button');
      if (!button) return;
      if (button.dataset.seedSend)
        return action(button, async () => {
          await api('/api/tracking/seed-send', { trackingId: button.dataset.seedSend });
          await loadTracking();
        });
      if (button.dataset.seedPlace)
        return action(button, async () => {
          const trackingId = button.dataset.seedPlace;
          const status = button.dataset.placeStatus;
          await api('/api/tracking/manual-placement', {
            trackingId,
            status,
            evidence: `Manual verification: marked ${status} directly from Tracking dashboard`,
          });
          await loadTracking();
        });
      const r = trackingRecords[Number(button.dataset.track)];
      if (!r) return;
      openTrackingDrawer(r);
      if ($('placementForm')) {
        $('placementForm').hidden = !r.seedId || !r.attemptedAt;
        $('placementId').value = r.id;
        $('placementEvidence').value = '';
      }
    });
  }
  if ($('placementForm')) {
    uiScope.handler($('placementForm'), 'onsubmit', (e) => {
      e.preventDefault();
      action(e.submitter, async () => {
        await api('/api/tracking/manual-placement', {
          trackingId: $('placementId').value,
          status: $('placementStatus').value,
          evidence: $('placementEvidence').value,
        });
        await loadTracking();
        $('placementForm').hidden = true;
        closeTrackingDrawer();
      });
    });
  }
  if ($('seedGenKeyBtn')) {
    uiScope.handler($('seedGenKeyBtn'), 'onclick', () => {
      $('seedTestKey').value = generateSeedKey();
    });
  }
  if ($('seedSample')) {
    uiScope.handler($('seedSample'), 'onchange', () => updateSeedPreview());
  }
  if ($('seedTemplate')) {
    uiScope.handler($('seedTemplate'), 'onchange', () => updateSeedPreview());
  }
  if ($('seedSampleSearch')) {
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    uiScope.handler($('seedSampleSearch'), 'oninput', () => {
      uiScope.clearTimeout(searchTimer ?? undefined);
      searchTimer = uiScope.timeout(() => {
        loadSeedSamples($('seedSampleSearch').value);
      }, 250);
    });
  }
  if ($('seedPlanForm')) {
    uiScope.handler($('seedPlanForm'), 'onsubmit', (e) => {
      e.preventDefault();
      action(e.submitter, async () => {
        const templateKey = $('seedTemplate')?.value || $('template')?.value;
        const result = await api<SeedPlanResponse>('/api/tracking/seed-plan', {
          testKey: $('seedTestKey').value,
          leadId: $('seedSample').value,
          key: templateKey,
        });
        renderRegion(
          $('seedPlanResult'),
          <>
            <div className={'seed-plan-success-box'}>
              <svg
                width={'16'}
                height={'16'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'#10b981'}
                strokeWidth={'2.5'}
              >
                <polyline points={'20 6 9 17 4 12'}></polyline>
              </svg>
              <div>
                <strong>
                  {'Plan '}
                  {displayText(result.testKey)}
                  {':'}
                </strong>
                {result.ids.length}
                {' dedicated test recipient(s) reserved. Use '}
                <strong>{'"Send seed"'}</strong>
                {' in the tracking table above to dispatch; the same test key reuses this plan.'}
              </div>
            </div>
          </>,
        );
        $('seedTestKey').value = generateSeedKey();
        trackingOffset = 0;
        await loadTracking();
      });
    });
  }
  uiScope.listen($('presetPrivateEmail'), 'click', () => {
    setDomainPreset('privateemail', $('presetPrivateEmail'));
  });
  uiScope.listen($('presetGoogle'), 'click', () => {
    setDomainPreset('google', $('presetGoogle'));
  });
  uiScope.listen($('presetM365'), 'click', () => {
    setDomainPreset('selector1, selector2', $('presetM365'));
  });
  if ($('domainForm')) {
    uiScope.handler($('domainForm'), 'onsubmit', (e) => {
      e.preventDefault();
      $('domainResult').textContent = 'Checking public DNS records…';
      action(e.submitter, async () => {
        const result = await api<DomainReport>(
          '/api/tracking/domain?' +
            new URLSearchParams({
              domain: $('healthDomain').value,
              selectors: $('healthSelectors').value,
            }),
        );
        $('domainResult').textContent = JSON.stringify(result, null, 2);
        renderDomainReport(result);
      });
    });
  }
  uiScope.interval(() => {
    if (!session.pending && location.hash === '#tracking')
      loadTracking().catch((e) => notice(errorMessage(e)));
  }, 10000);
}
