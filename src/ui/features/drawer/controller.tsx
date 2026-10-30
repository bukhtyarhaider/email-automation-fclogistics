import { Button } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import type { ReactNode } from 'react';
import { renderRegion, captureContent } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type { TrackingRecord } from '../../shared/types/domain';
import type { PreviewResponse } from '../../shared/types/api';
import type { Lead, Message } from '../../shared/types/domain';
import { eventElement } from '../../shared/dom';
import { session } from '../../shared/session';
import { $, copyToClipboard, notice, action, api } from '../../shared/runtime';
import { renderTrackingDetail } from '../tracking/controller';
export function openPreviewDrawer() {
  const drawer = $('leadPreviewDrawer');
  if (drawer) drawer.classList.add('open');
}

export function closePreviewDrawer() {
  const drawer = $('leadPreviewDrawer');
  if (drawer) drawer.classList.remove('open');
}

export function switchDrawerTab(tabName: string) {
  const tabDetails = $('tabLeadDetails');
  const tabEmail = $('tabEmailDraft');
  const sectionDetails = $('leadDetailsSection');
  const sectionEmail = $('emailDraftSection');
  if (tabName === 'email') {
    if (tabEmail) tabEmail.classList.add('active');
    if (tabDetails) tabDetails.classList.remove('active');
    if (sectionEmail) sectionEmail.style.display = 'block';
    if (sectionDetails) sectionDetails.style.display = 'none';
  } else {
    if (tabDetails) tabDetails.classList.add('active');
    if (tabEmail) tabEmail.classList.remove('active');
    if (sectionDetails) sectionDetails.style.display = 'block';
    if (sectionEmail) sectionEmail.style.display = 'none';
  }
}

export function openTrackingDrawer(r: TrackingRecord) {
  const drawer = $('trackingDrawer');
  if (drawer) drawer.classList.add('open');
  if (r) renderTrackingDetail(r);
}

export function closeTrackingDrawer() {
  const drawer = $('trackingDrawer');
  if (drawer) drawer.classList.remove('open');
}

export function switchTrackingDrawerTab(tabName: string) {
  const tabOverview = $('tabTrackingOverview');
  const tabSpecs = $('tabTrackingSpecs');
  const tabRaw = $('tabTrackingRaw');
  const secOverview = $('trackingSecOverview');
  const secSpecs = $('trackingSecSpecs');
  const secRaw = $('trackingSecRaw');
  if (tabOverview) tabOverview.classList.toggle('active', tabName === 'overview');
  if (tabSpecs) tabSpecs.classList.toggle('active', tabName === 'specs');
  if (tabRaw) tabRaw.classList.toggle('active', tabName === 'raw');
  if (secOverview) secOverview.style.display = tabName === 'overview' ? 'block' : 'none';
  if (secSpecs) secSpecs.style.display = tabName === 'specs' ? 'block' : 'none';
  if (secRaw) secRaw.style.display = tabName === 'raw' ? 'block' : 'none';
}

export function renderLeadDetails(lead: Lead, message: Message | null, warnings: unknown[]) {
  const container = $('leadDetailsContainer');
  if (!container) return;
  if (!lead) {
    renderRegion(
      container,
      <>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '13px',
            textAlign: 'center',
            padding: '24px',
          }}
        >
          {'No lead details available.'}
        </p>
      </>,
    );
    return;
  }
  const f = lead.fields || {};
  const contactName =
    f['owner / principal'] || f['contact'] || f['contact name'] || f['name'] || '';
  const contactTitle = f['owner title'] || f['title'] || '';
  const phone = f['phone'] || f['telephone'] || f['cell'] || f['phone number'] || '';
  const address = f['physical address'] || f['address'] || f['street'] || '';
  const city = f['city'] || '';
  const state = f['state'] || '';
  const zip = f['zip code'] || f['zip'] || f['postal code'] || '';
  const locationStr = [city, state, zip].filter(Boolean).join(', ');
  const usdot = f['usdot #'] || f['usdot'] || f['dot'] || '';
  const mc = f['mc docket #'] || f['mc'] || f['mc/ff/mx number'] || '';
  const authorityAge = f['authority age'] || '';
  const operatingStatus = f['operating status'] || '';
  const vettingTier = f['vetting tier'] || '';
  const drivers = f['drivers'] || '';
  const powerUnits = f['power units'] || '';
  const historicalNotes = f['historical notes'] || '';
  const sortedKeys = Object.keys(f).sort();
  const statusPill = lead.blocked ? (
    <>
      <span className={'status-pill blocked'}>
        {'Excluded: '}
        {displayText(lead.blocked)}
      </span>
    </>
  ) : (
    <>
      <span className={'status-pill ready'}>{'Ready for outreach'}</span>
    </>
  );
  const sheetStatusTag = lead.status ? (
    <>
      <span className={'tag-badge'}>
        {'Workbook status: '}
        {displayText(lead.status)}
      </span>
    </>
  ) : (
    ''
  );
  let lastAttemptHtml = (
    <>
      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
        {'No past outreach attempts recorded'}
      </span>
    </>
  );
  if (lead.lastAttempt) {
    const atStr = lead.lastAttempt.at ? new Date(lead.lastAttempt.at).toLocaleString() : 'Recorded';
    lastAttemptHtml = (
      <>
        <div
          style={{
            fontSize: '12px',
            color: '#93c5fd',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '6px',
            padding: '8px 12px',
          }}
        >
          <strong>{displayText(lead.lastAttempt.status || 'Attempted')}</strong>
          {' via '}
          {displayText(lead.lastAttempt.accountEmail || 'mailbox')}
          {' on '}
          {atStr}
          {lead.lastAttempt.subject ? (
            <>
              <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                {'Subject: "'}
                {displayText(lead.lastAttempt.subject)}
                {'"'}
              </div>
            </>
          ) : (
            ''
          )}
        </div>
      </>
    );
  }
  let warningsHtml: ReactNode = '';
  if (warnings && warnings.length) {
    warningsHtml = (
      <>
        <div className={'warning-callout'} style={{ marginBottom: '14px' }}>
          <strong>{'Note:'}</strong>
          {warnings.map(displayText).join(' ')}
        </div>
      </>
    );
  }
  let historicalNotesHtml: ReactNode = '';
  if (historicalNotes && historicalNotes.trim()) {
    historicalNotesHtml = (
      <>
        <div className={'lead-details-card'} style={{ borderLeft: '3px solid #f59e0b' }}>
          <h4 className={'lead-details-title'} style={{ color: '#fbbf24' }}>
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
            {'\n          Historical Notes / Remarks\n        '}
          </h4>
          <div
            style={{
              fontSize: '12.5px',
              color: '#e5e7eb',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
            }}
          >
            {displayText(historicalNotes)}
          </div>
        </div>
      </>
    );
  }
  const fieldsTableRows = sortedKeys.length ? (
    sortedKeys.map((k) => {
      const val = f[k];
      return (
        <>
          <tr>
            <td className={'field-key'}>{displayText(k)}</td>
            <td className={'field-val'}>
              {val ? (
                displayText(val)
              ) : (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>{'—'}</span>
                </>
              )}
            </td>
          </tr>
        </>
      );
    })
  ) : (
    <>
      <tr>
        <td
          colSpan={2}
          style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}
        >
          {'No attributes found'}
        </td>
      </tr>
    </>
  );
  renderRegion(
    container,
    <>
      <div className={'lead-details-hero'}>
        <h2 className={'lead-hero-company'}>{displayText(lead.company || 'Unnamed Lead')}</h2>
        <div className={'lead-hero-subtitle'}>
          {contactName ? (
            <>
              <span>
                <strong>{displayText(contactName)}</strong>
                {contactTitle ? ` (${displayText(contactTitle)})` : ''}
              </span>
            </>
          ) : (
            ''
          )}
          {locationStr ? (
            <>
              <span>
                {'• '}
                {displayText(locationStr)}
              </span>
            </>
          ) : (
            ''
          )}
        </div>
        <div className={'lead-badges-row'}>
          {statusPill}
          {sheetStatusTag}
        </div>
      </div>
      {warningsHtml}
      <section className={'carrier-evidence'}>
        <h4>{'Carrier identity & source'}</h4>
        {lead.carrier ? (
          <>
            <p>
              {displayText(lead.carrier.identityStatus)}
              {' · USDOT '}
              {displayText(lead.carrier.dot || 'unresolved')}
              {' · '}
              {displayText(lead.carrier.id)}
            </p>
            <p>
              {'Source: '}
              {displayText(lead.carrier.provenance.sourceLabel)}
              {' · Acquired: '}
              {displayText(lead.carrier.provenance.acquiredAt || 'unknown')}
              {' · Contact permission: '}
              {displayText(lead.carrier.provenance.permission)}
            </p>
            <p>{'Source-reported identity; authority has not been verified.'}</p>
          </>
        ) : (
          <>
            <p>
              {
                'Legacy / unreviewed import. Review and activate a revision to attach stable identity and source evidence.'
              }
            </p>
          </>
        )}
        <Button className={'secondary'} data-conversation-email={displayText(lead.email)}>
          {'View captured conversations'}
        </Button>
      </section>
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
            <path
              d={
                'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'
              }
            ></path>
          </svg>
          {'\n        Contact Information\n      '}
        </h4>
        <div className={'lead-details-grid'}>
          <div className={'lead-detail-item'}>
            <span className={'lead-detail-label'}>{'Email Address'}</span>
            <span className={'lead-detail-value'}>
              {lead.email ? (
                <>
                  <a href={'mailto:' + displayText(lead.email)}>{displayText(lead.email)}</a>
                  <Button
                    type={'button'}
                    className={'copy-mini-btn'}
                    data-copy={displayText(lead.email)}
                    title={'Copy email'}
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
                </>
              ) : (
                '—'
              )}
            </span>
          </div>
          <div className={'lead-detail-item'}>
            <span className={'lead-detail-label'}>{'Phone'}</span>
            <span className={'lead-detail-value'}>
              {phone ? (
                <>
                  <a href={'tel:' + displayText(phone)}>{displayText(phone)}</a>
                  <Button
                    type={'button'}
                    className={'copy-mini-btn'}
                    data-copy={displayText(phone)}
                    title={'Copy phone'}
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
                </>
              ) : (
                '—'
              )}
            </span>
          </div>
          <div className={'lead-detail-item'}>
            <span className={'lead-detail-label'}>{'Contact / Owner'}</span>
            <span className={'lead-detail-value'}>{displayText(contactName || '—')}</span>
          </div>
          <div className={'lead-detail-item'}>
            <span className={'lead-detail-label'}>{'Title / Role'}</span>
            <span className={'lead-detail-value'}>{displayText(contactTitle || '—')}</span>
          </div>
          <div className={'lead-detail-item full-width'}>
            <span className={'lead-detail-label'}>{'Physical Address'}</span>
            <span className={'lead-detail-value'}>
              {displayText(address || locationStr || '—')}
            </span>
          </div>
        </div>
      </div>
      {usdot || mc || authorityAge || operatingStatus || vettingTier || drivers || powerUnits ? (
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
                <rect x={'1'} y={'3'} width={'15'} height={'13'}></rect>
                <polygon points={'16 8 20 8 23 11 23 16 16 16 8'}></polygon>
                <circle cx={'5.5'} cy={'18.5'} r={'2.5'}></circle>
                <circle cx={'18.5'} cy={'18.5'} r={'2.5'}></circle>
              </svg>
              {'\n        Carrier & Regulatory Credentials\n      '}
            </h4>
            <div className={'lead-details-grid'}>
              <div className={'lead-detail-item'}>
                <span className={'lead-detail-label'}>{'USDOT #'}</span>
                <span className={'lead-detail-value'}>{displayText(usdot || '—')}</span>
              </div>
              <div className={'lead-detail-item'}>
                <span className={'lead-detail-label'}>{'MC Docket #'}</span>
                <span className={'lead-detail-value'}>{displayText(mc || '—')}</span>
              </div>
              <div className={'lead-detail-item'}>
                <span className={'lead-detail-label'}>{'Operating Status'}</span>
                <span className={'lead-detail-value'}>{displayText(operatingStatus || '—')}</span>
              </div>
              <div className={'lead-detail-item'}>
                <span className={'lead-detail-label'}>{'Authority Age'}</span>
                <span className={'lead-detail-value'}>{displayText(authorityAge || '—')}</span>
              </div>
              <div className={'lead-detail-item'}>
                <span className={'lead-detail-label'}>{'Vetting Tier'}</span>
                <span className={'lead-detail-value'}>{displayText(vettingTier || '—')}</span>
              </div>
              <div className={'lead-detail-item'}>
                <span className={'lead-detail-label'}>{'Fleet Size / Drivers'}</span>
                <span className={'lead-detail-value'}>
                  {displayText(
                    drivers ? `${drivers} drivers` : powerUnits ? `${powerUnits} units` : '—',
                  )}
                </span>
              </div>
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
            <path d={'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'}></path>
            <polyline points={'14 2 14 8 20 8'}></polyline>
            <line x1={'16'} y1={'13'} x2={'8'} y2={'13'}></line>
            <line x1={'16'} y1={'17'} x2={'8'} y2={'17'}></line>
            <polyline points={'10 9 9 9 8 9'}></polyline>
          </svg>
          {'\n        Workbook Origin & Status\n      '}
        </h4>
        <div className={'lead-details-grid'}>
          <div className={'lead-detail-item'}>
            <span className={'lead-detail-label'}>{'Worksheet Tab'}</span>
            <span className={'lead-detail-value'}>{displayText(lead.sheet || 'Default')}</span>
          </div>
          <div className={'lead-detail-item'}>
            <span className={'lead-detail-label'}>{'Row & Cell Address'}</span>
            <span className={'lead-detail-value'}>
              {'Row '}
              {lead.row}
              {lead.emailCell ? ` (Email: ${lead.emailCell})` : ''}
              {lead.statusCell ? ` (Status: ${lead.statusCell})` : ''}
            </span>
          </div>
          <div className={'lead-detail-item full-width'}>
            <span className={'lead-detail-label'}>{'Past Outreach History'}</span>
            <div style={{ marginTop: '4px' }}>{lastAttemptHtml}</div>
          </div>
        </div>
      </div>
      {historicalNotesHtml}
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
            <polyline points={'21 8 21 21 3 21 3 8'}></polyline>
            <line x1={'1'} y1={'3'} x2={'23'} y2={'3'}></line>
            <polygon points={'10 8 14 8 14 12 10 12'}></polygon>
          </svg>
          {'\n        All Spreadsheet Columns ('}
          {sortedKeys.length}
          {')\n      '}
        </h4>
        <div
          style={{
            maxHeight: '280px',
            overflowY: 'auto',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 'var(--radius-sm)',
            background: '#111318',
          }}
        >
          <table className={'lead-fields-table'}>
            <tbody>{fieldsTableRows}</tbody>
          </table>
        </div>
      </div>
      <div className={'lead-action-cta'}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff' }}>
            {'Personalized Email Preview'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {message
              ? displayText(message.subject)
              : 'Click to view the drafted message for this lead'}
          </div>
        </div>
        <Button
          type={'button'}
          className={'secondary'}
          id={'btnSwitchToEmailDraft'}
          style={{ fontSize: '11px', padding: '5px 10px', whiteSpace: 'nowrap' }}
        >
          {'\n        View Email Draft →\n      '}
        </Button>
      </div>
    </>,
  );
  const ctaBtn = $('btnSwitchToEmailDraft');
  if (ctaBtn) {
    uiScope.handler(ctaBtn, 'onclick', () => switchDrawerTab('email'));
  }
  container.querySelectorAll<HTMLElement>('[data-copy]').forEach((btn) => {
    uiScope.handler(btn, 'onclick', async (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      const ok = await copyToClipboard(text);
      if (ok) {
        const originalHtml = captureContent(btn);
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
          renderRegion(btn, originalHtml);
        }, 1500);
        notice(`Copied to clipboard: ${text}`);
      }
    });
  });
}

export function mountDrawer() {
  if ($('prepare'))
    uiScope.handler($('prepare'), 'onclick', () =>
      action($('prepare'), async () => {
        const r = await api<PreviewResponse>('/api/prepare', {
          id: session.previewId,
          key: $('template').value,
          randomTemplates: $('randomTemplates').checked,
        });
        if ($('signatureText'))
          $('signatureText').textContent = String(
            r.signature || 'No signature configured in this mailbox.',
          );
        if ($('previewTitle')) $('previewTitle').textContent = r!.message.subject;
        if ($('previewBody')) $('previewBody').textContent = r!.message.body;
        if ($('warnings')) {
          $('warnings').hidden = !r.warnings?.length;
          $('warnings').textContent = (r.warnings || []).join(' ');
        }
        notice(
          `Compose filled in your browser. Review it before sending.${r.warnings?.length ? ' Review note: ' + r.warnings.join(' ') : ''}`,
        );
      }),
    );
  if ($('release'))
    uiScope.handler($('release'), 'onclick', () =>
      action($('release'), () => {
        closePreviewDrawer();
        return api('/api/release', {});
      }),
    );
  if ($('sendOne'))
    uiScope.handler($('sendOne'), 'onclick', () =>
      action($('sendOne'), async () => {
        await api('/api/send', {});
        session.selected.delete(session.previewId!);
        closePreviewDrawer();
        notice('Send confirmed. Workbook status updated.');
      }),
    );
  // Drawer tab switching listeners
  if ($('tabLeadDetails')) {
    uiScope.handler($('tabLeadDetails'), 'onclick', () => switchDrawerTab('details'));
  }
  if ($('tabEmailDraft')) {
    uiScope.handler($('tabEmailDraft'), 'onclick', () => switchDrawerTab('email'));
  }
  if ($('closeDrawerBtn')) {
    uiScope.handler($('closeDrawerBtn'), 'onclick', closePreviewDrawer);
  }
  // Close drawer listeners
  if ($('closePreviewDrawer')) {
    uiScope.handler($('closePreviewDrawer'), 'onclick', closePreviewDrawer);
  }
  if ($('leadPreviewDrawer')) {
    uiScope.handler($('leadPreviewDrawer'), 'onclick', (e) => {
      if (eventElement(e) === $('leadPreviewDrawer')) closePreviewDrawer();
    });
  }
  if ($('tabTrackingOverview')) {
    uiScope.handler($('tabTrackingOverview'), 'onclick', () => switchTrackingDrawerTab('overview'));
  }
  if ($('tabTrackingSpecs')) {
    uiScope.handler($('tabTrackingSpecs'), 'onclick', () => switchTrackingDrawerTab('specs'));
  }
  if ($('tabTrackingRaw')) {
    uiScope.handler($('tabTrackingRaw'), 'onclick', () => switchTrackingDrawerTab('raw'));
  }
  if ($('closeTrackingDrawerBtn')) {
    uiScope.handler($('closeTrackingDrawerBtn'), 'onclick', closeTrackingDrawer);
  }
  if ($('closeTrackingDrawer')) {
    uiScope.handler($('closeTrackingDrawer'), 'onclick', closeTrackingDrawer);
  }
  if ($('trackingDrawer')) {
    uiScope.handler($('trackingDrawer'), 'onclick', (e) => {
      if (eventElement(e) === $('trackingDrawer')) closeTrackingDrawer();
    });
  }
  uiScope.listen(window, 'keydown', (e) => {
    if (e.key === 'Escape') {
      closePreviewDrawer();
      closeTrackingDrawer();
    }
  });
}
