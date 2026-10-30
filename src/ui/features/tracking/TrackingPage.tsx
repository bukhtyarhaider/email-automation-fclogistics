import { Button, Input, Select } from '../../design-system/primitives';
export function TrackingPage() {
  return (
    <>
      <section className={'view-page'} id={'view-tracking'}>
        <div className={'page-header tracking-header'}>
          <div>
            <p className={'page-eyebrow'}>
              <span className={'live-pulse-dot'}></span>
              {' EVIDENCE & TELEMETRY MONITORING\n                '}
            </p>
            <h1 className={'page-title'}>
              <svg
                width={'22'}
                height={'22'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2.2'}
              >
                <path d={'M22 12h-4l-3 9L9 3l-3 9H2'}></path>
              </svg>
              {'\n                  Email Tracking\n                '}
            </h1>
            <p className={'page-subtitle'}>
              {
                'Real-time webmail confirmation, 1×1 pixel telemetry, bounce DSN diagnostics, and controlled seed placement verification.'
              }
            </p>
          </div>
          <div className={'header-actions'}>
            <a href={'#trackingSeedStudio'} className={'header-nav-chip'}>
              <svg
                width={'13'}
                height={'13'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <polygon
                  points={
                    '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'
                  }
                ></polygon>
              </svg>
              {'\n                  Seed Studio\n                '}
            </a>
            <a href={'#trackingDomainHealth'} className={'header-nav-chip'}>
              <svg
                width={'13'}
                height={'13'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <path d={'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}></path>
              </svg>
              {'\n                  Domain Health\n                '}
            </a>
            <Button
              id={'trackingFirebaseSync'}
              className={'secondary'}
              title={'Sync opens from Firebase Cloud Firestore'}
            >
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
                    'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83'
                  }
                ></path>
              </svg>
              {'\n                  Sync Firebase\n                '}
            </Button>
            <Button
              id={'trackingRefresh'}
              className={'secondary refresh-btn'}
              title={'Refresh tracking telemetries'}
            >
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <polyline points={'23 4 23 10 17 10'}></polyline>
                <polyline points={'1 20 1 14 7 14'}></polyline>
                <path
                  d={'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'}
                ></path>
              </svg>
              {'\n                  Refresh Data\n                '}
            </Button>
          </div>
        </div>

        <div className={'tracking-advisory-banner'}>
          <div className={'advisory-icon'}>
            <svg
              width={'20'}
              height={'20'}
              viewBox={'0 0 24 24'}
              fill={'none'}
              stroke={'currentColor'}
              strokeWidth={'2'}
            >
              <path d={'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}></path>
              <circle cx={'12'} cy={'11'} r={'1'}></circle>
              <line x1={'12'} y1={'15'} x2={'12'} y2={'15.01'}></line>
            </svg>
          </div>
          <div className={'advisory-content'}>
            <strong>{'Evidence & Verification Protocol:'}</strong>
            {
              ' Webmail confirmation records transmission. Inbox arrival is confirmed through automated IMAP DSN bounce notices or controlled seed inspections. Remote 1×1 image requests capture open signals (which security gateways may also scan). Seed placement reflects the tested mailbox environment.\n              '
            }
          </div>
        </div>

        <div className={'panel tracking-main-panel'}>
          <div className={'panel-head tracking-panel-head'}>
            <div>
              <h2 className={'panel-title'}>
                <svg
                  width={'17'}
                  height={'17'}
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
                {'\n                    Delivery Telemetry & Outreach Audit\n                  '}
              </h2>
              <p className={'panel-subtitle'}>
                {
                  'Comprehensive audit trail of dispatched cold outreaches, delivery receipts, and open telemetry.'
                }
              </p>
            </div>
            <div className={'tracking-live-tag'}>
              <span className={'status-dot-pulse'}></span>
              <span id={'trackingRecordCountBadge'}>{'18 tracked events'}</span>
            </div>
          </div>

          <div id={'trackingMetrics'} className={'tracking-metrics'} aria-live={'polite'}></div>

          <div id={'trackingRate'} className={'tracking-rate-callout'}></div>

          <div className={'tracking-toolbar-container'}>
            <div className={'tracking-quick-pills'} id={'trackingQuickPills'}>
              <Button type={'button'} className={'filter-chip active'} data-pill-status={''}>
                {'All Records'}
              </Button>
              <Button type={'button'} className={'filter-chip'} data-pill-status={'webmail_sent'}>
                {'✓ Delivered'}
              </Button>
              <Button type={'button'} className={'filter-chip'} data-pill-status={'open_detected'}>
                {'👁️ Opened'}
              </Button>
              <Button type={'button'} className={'filter-chip'} data-pill-status={'hard_bounced'}>
                {'⛔ Bounced'}
              </Button>
              <Button type={'button'} className={'filter-chip'} data-pill-status={'seeds'}>
                {'🌱 Seed Tests'}
              </Button>
            </div>

            <div className={'tracking-filters-row'}>
              <div className={'filter-search-box'}>
                <svg
                  width={'14'}
                  height={'14'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <circle cx={'11'} cy={'11'} r={'8'}></circle>
                  <line x1={'21'} y1={'21'} x2={'16.65'} y2={'16.65'}></line>
                </svg>
                <Input
                  id={'trackingSearch'}
                  type={'search'}
                  placeholder={'Search recipient, sender, subject…'}
                  spellCheck={'false'}
                />
              </div>
              <div className={'filter-select-group'}>
                <label className={'filter-inline-label'} htmlFor={'trackingCampaign'}>
                  {'Campaign'}
                </label>
                <Select id={'trackingCampaign'}>
                  <option value={''}>{'All campaigns'}</option>
                </Select>
              </div>
              <div className={'filter-select-group'}>
                <label className={'filter-inline-label'} htmlFor={'trackingStatus'}>
                  {'Status'}
                </label>
                <Select id={'trackingStatus'}>
                  <option value={''}>{'All statuses'}</option>
                  <option value={'pending'}>{'pending'}</option>
                  <option value={'send_attempted'}>{'send_attempted'}</option>
                  <option value={'webmail_sent'}>{'webmail_sent'}</option>
                  <option value={'send_failed'}>{'send_failed'}</option>
                  <option value={'hard_bounced'}>{'hard_bounced'}</option>
                  <option value={'soft_bounced'}>{'soft_bounced'}</option>
                  <option value={'open_detected'}>{'open_detected'}</option>
                  <option value={'delivery_unknown'}>{'delivery_unknown'}</option>
                </Select>
              </div>
              <div className={'filter-date-group'}>
                <label className={'filter-date-item'}>
                  <span>{'From (UTC)'}</span>
                  <Input id={'trackingFrom'} type={'date'} />
                </label>
                <label className={'filter-date-item'}>
                  <span>{'Until (UTC)'}</span>
                  <Input id={'trackingUntil'} type={'date'} />
                </label>
              </div>
              <Button
                type={'button'}
                id={'trackingResetFilters'}
                className={'secondary tracking-clear-btn'}
                title={'Reset all active search filters'}
              >
                <svg
                  width={'12'}
                  height={'12'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2.5'}
                >
                  <line x1={'18'} y1={'6'} x2={'6'} y2={'18'}></line>
                  <line x1={'6'} y1={'6'} x2={'18'} y2={'18'}></line>
                </svg>
                {'\n                    Reset\n                  '}
              </Button>
            </div>
          </div>

          <div className={'table-wrap tracking-table-wrap'}>
            <table className={'tracking-table'}>
              <thead>
                <tr>
                  <th>
                    <span className={'th-label'}>{'Recipient / Subject'}</span>
                  </th>
                  <th>
                    <span className={'th-label'}>{'Send status / Time'}</span>
                  </th>
                  <th>
                    <span className={'th-label'}>{'Delivery failure'}</span>
                  </th>
                  <th>
                    <span className={'th-label'}>{'Open signal / Placement'}</span>
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <span className={'th-label'}>{'Actions'}</span>
                  </th>
                </tr>
              </thead>
              <tbody id={'trackingRows'}></tbody>
            </table>
          </div>

          <div className={'table-footer'}>
            <span id={'trackingPageInfo'} className={'tracking-page-info'}></span>
            <div className={'pagination-controls'}>
              <Button id={'trackingPrev'} className={'secondary'} title={'Previous 50 records'}>
                <svg
                  width={'13'}
                  height={'13'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <polyline points={'15 18 9 12 15 6'}></polyline>
                </svg>
                {'\n                    Previous\n                  '}
              </Button>
              <Button id={'trackingNext'} className={'secondary'} title={'Next 50 records'}>
                {'\n                    Next\n                    '}
                <svg
                  width={'13'}
                  height={'13'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <polyline points={'9 18 15 12 9 6'}></polyline>
                </svg>
              </Button>
            </div>
          </div>

          <form id={'placementForm'} className={'placement-dock-form'} hidden={true}>
            <Input id={'placementId'} type={'hidden'} />
            <div className={'placement-dock-header'}>
              <svg
                width={'16'}
                height={'16'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'#60a5fa'}
                strokeWidth={'2'}
              >
                <path d={'M22 12h-4l-3 9L9 3l-3 9H2'}></path>
              </svg>
              <strong>{'Record Manual Seed Placement Inspection'}</strong>
            </div>
            <div className={'placement-dock-grid'}>
              <div className={'placement-dock-field'}>
                <label htmlFor={'placementStatus'}>{'Observed Folder'}</label>
                <Select id={'placementStatus'}>
                  <option value={'inbox'}>{'Inbox'}</option>
                  <option value={'spam'}>{'Spam / Junk'}</option>
                  <option value={'other'}>{'Other folder'}</option>
                  <option value={'not_found'}>{'Not found'}</option>
                  <option value={'awaiting'}>{'Awaiting arrival'}</option>
                </Select>
              </div>
              <div className={'placement-dock-field evidence-field'}>
                <label htmlFor={'placementEvidence'}>{'Inspection Evidence & Notes'}</label>
                <Input
                  id={'placementEvidence'}
                  required={true}
                  maxLength={500}
                  placeholder={'e.g. Primary inbox verified at 14:35 UTC without spam warning'}
                />
              </div>
              <div className={'placement-dock-actions'}>
                <Button type={'submit'} className={'primary-btn'}>
                  {'Save Placement'}
                </Button>
                <Button
                  type={'button'}
                  className={'secondary'}
                  onClick={() => {
                    const form = document.getElementById('placementForm');
                    if (form) form.hidden = true;
                  }}
                >
                  {'Cancel'}
                </Button>
              </div>
            </div>
          </form>
        </div>

        <div className={'panel seed-studio-panel'} id={'trackingSeedStudio'}>
          <div
            className={'panel-head'}
            style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}
          >
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <span className={'page-eyebrow'} style={{ fontSize: '10px', color: '#60a5fa' }}>
                {'DELIVERABILITY & INBOX PLACEMENT TESTING'}
              </span>
              <h2 className={'panel-title'} style={{ marginTop: '3px' }}>
                <svg
                  width={'18'}
                  height={'18'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <path d={'M22 12h-4l-3 9L9 3l-3 9H2'}></path>
                </svg>
                {'\n                    Controlled Seed Inbox Tests\n                  '}
              </h2>
              <p
                style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}
              >
                {
                  '\n                    Dispatch a real campaign test to verified test mailboxes to test Inbox vs. Spam folder placement before launching high-volume outreach.\n                  '
                }
              </p>
            </div>
            <div id={'seedBadgeContainer'}>
              <span
                className={'status-pill good'}
                id={'seedCountBadge'}
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontWeight: '600',
                  padding: '4px 10px',
                  fontSize: '11.5px',
                }}
              >
                {'\n                    📬 Configured Seeds\n                  '}
              </span>
            </div>
          </div>

          <div id={'seedTargetsGrid'} style={{ marginBottom: '20px' }}>
            <div id={'trackingSeeds'} className={'tracking-note'} style={{ margin: '0' }}></div>
          </div>

          <div className={'seed-studio-grid'}>
            <div className={'seed-config-card'}>
              <div className={'seed-card-header'}>
                <span className={'seed-step-num'}>{'1'}</span>
                <h3 className={'seed-card-heading'}>{'Test Configuration'}</h3>
              </div>
              <form id={'seedPlanForm'} className={'seed-form-stack'}>
                <div className={'form-group'}>
                  <label htmlFor={'seedTestKey'}>{'Unique Test Identifier'}</label>
                  <div className={'input-with-action'}>
                    <Input
                      id={'seedTestKey'}
                      required={true}
                      pattern={'[a-zA-Z0-9_-]{1,80}'}
                      maxLength={80}
                      placeholder={'seed-test-01'}
                      spellCheck={'false'}
                    />
                    <Button
                      type={'button'}
                      className={'secondary'}
                      id={'seedGenKeyBtn'}
                      title={'Generate fresh unique key'}
                    >
                      {'⚡ Auto'}
                    </Button>
                  </div>
                  <span className={'form-hint'}>
                    {'Prevents duplicate tests and correlates folder arrival.'}
                  </span>
                </div>
                <div className={'form-group'}>
                  <label htmlFor={'seedTemplate'}>{'Template Variant to Test'}</label>
                  <Select id={'seedTemplate'}></Select>
                </div>
                <div className={'form-group'}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <label htmlFor={'seedSample'}>{'Content Sample Lead'}</label>
                    <span
                      style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                      id={'sampleCountHint'}
                    ></span>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <Input
                      id={'seedSampleSearch'}
                      type={'search'}
                      placeholder={'🔍 Search leads by company or name…'}
                      style={{ fontSize: '12px', padding: '7px 10px' }}
                    />
                  </div>
                  <Select
                    id={'seedSample'}
                    required={true}
                    size={4}
                    className={'custom-select-list'}
                  ></Select>
                  <span className={'form-hint'}>
                    {'Variables (company, owner, location) will be rendered from this lead.'}
                  </span>
                </div>
                <div className={'seed-action-footer'} style={{ marginTop: '6px' }}>
                  <Button
                    type={'submit'}
                    className={'primary-btn'}
                    id={'seedCreateBtn'}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '11px 16px',
                      fontWeight: '600',
                      fontSize: '13px',
                    }}
                  >
                    <svg
                      width={'15'}
                      height={'15'}
                      viewBox={'0 0 24 24'}
                      fill={'none'}
                      stroke={'currentColor'}
                      strokeWidth={'2'}
                    >
                      <line x1={'22'} y1={'2'} x2={'11'} y2={'13'}></line>
                      <polygon points={'22 2 15 22 11 13 2 9 22 2'}></polygon>
                    </svg>
                    {'\n                        Reserve & Create Seed Plan\n                      '}
                  </Button>
                </div>
              </form>
              <p
                id={'seedPlanResult'}
                role={'status'}
                className={'tracking-note'}
                style={{ marginTop: '12px' }}
              ></p>
            </div>

            <div className={'seed-preview-card'} id={'seedPreviewCard'}>
              <div className={'seed-card-header'} style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className={'seed-step-num'}
                    style={{ background: 'rgba(96, 165, 250, 0.2)', color: '#60a5fa' }}
                  >
                    {'2'}
                  </span>
                  <h3 className={'seed-card-heading'}>{'Live Dynamic Message Preview'}</h3>
                </div>
                <span className={'preview-badge-live'}>{'LIVE RENDER'}</span>
              </div>
              <div className={'seed-preview-window'}>
                <div className={'preview-window-bar'}>
                  <div className={'window-dots'}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div className={'preview-window-title'} id={'seedPreviewMeta'}>
                    {'Draft preview'}
                  </div>
                </div>
                <div className={'preview-window-content'}>
                  <div className={'preview-meta-row'}>
                    <span className={'preview-meta-label'}>{'Subject:'}</span>
                    <span className={'preview-meta-val'} id={'seedPreviewSubject'}>
                      {'Loading subject…'}
                    </span>
                  </div>
                  <div
                    id={'seedPreviewWarnings'}
                    className={'warning-callout'}
                    style={{ margin: '8px 0' }}
                    hidden={true}
                  ></div>
                  <div className={'preview-body-container'} id={'seedPreviewBody'}>
                    {'Loading message body…'}
                  </div>
                </div>
              </div>
              <div className={'seed-preview-instructions'}>
                <div className={'inst-icon'}>{'💡'}</div>
                <div className={'inst-text'}>
                  <strong>{'How seed testing works:'}</strong>
                  {' Once created, click '}
                  <strong>{'Send seed'}</strong>
                  {
                    ' in the Tracking table above. When the message arrives at your test address, check whether it reached the '
                  }
                  <strong>{'Inbox'}</strong>
                  {' or '}
                  <strong>{'Spam'}</strong>
                  {' folder, then click '}
                  <strong>{'Details'}</strong>
                  {' to record your placement result.\n                    '}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={'panel domain-health-panel'} id={'trackingDomainHealth'}>
          <div
            className={'panel-head'}
            style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}
          >
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <span className={'page-eyebrow'} style={{ fontSize: '10px', color: '#a78bfa' }}>
                {'SENDER REPUTATION & AUTHENTICATION'}
              </span>
              <h2 className={'panel-title'} style={{ marginTop: '3px' }}>
                <svg
                  width={'18'}
                  height={'18'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <path d={'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}></path>
                </svg>
                {
                  '\n                    Domain Health & DNS Authentication Inspector\n                  '
                }
              </h2>
              <p
                style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}
              >
                {
                  '\n                    Verify SPF, DKIM, and DMARC alignment required by Gmail, Yahoo, and Outlook to ensure cold outreach bypasses spam filters.\n                  '
                }
              </p>
            </div>
            <div id={'domainScoreBadge'}>
              <span
                className={'status-pill'}
                style={{
                  background: 'rgba(167, 139, 250, 0.15)',
                  color: '#c4b5fd',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  fontWeight: '600',
                  padding: '4px 10px',
                  fontSize: '11.5px',
                }}
              >
                {'\n                    🛡️ Authentication Auditor\n                  '}
              </span>
            </div>
          </div>

          <div
            className={'domain-preset-bar'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '16px',
            }}
          >
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600' }}>
              {'Provider Presets:'}
            </span>
            <Button
              type={'button'}
              className={'preset-pill active'}
              id={'presetPrivateEmail'}
              title={'Autofill for Namecheap PrivateEmail'}
            >
              {'Namecheap PrivateEmail'}
            </Button>
            <Button
              type={'button'}
              className={'preset-pill'}
              id={'presetGoogle'}
              title={'Autofill for Google Workspace'}
            >
              {'Google Workspace'}
            </Button>
            <Button
              type={'button'}
              className={'preset-pill'}
              id={'presetM365'}
              title={'Autofill for Microsoft 365'}
            >
              {'Microsoft 365'}
            </Button>
          </div>
          <form id={'domainForm'} className={'domain-check-form'}>
            <div
              className={'form-grid-row'}
              style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}
            >
              <div style={{ flex: '1 1 200px' }}>
                <label
                  htmlFor={'healthDomain'}
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#cbd5e1',
                    marginBottom: '6px',
                  }}
                >
                  {'Sending Domain'}
                </label>
                <Input
                  id={'healthDomain'}
                  required={true}
                  placeholder={'fclogistics.us'}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: '1 1 240px' }}>
                <label
                  htmlFor={'healthSelectors'}
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#cbd5e1',
                    marginBottom: '6px',
                  }}
                >
                  {'DKIM Selectors (comma-separated)'}
                </label>
                <Input
                  id={'healthSelectors'}
                  placeholder={'privateemail, default'}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <Button
                  type={'submit'}
                  id={'domainSubmitBtn'}
                  className={'primary-btn'}
                  style={{
                    padding: '10px 18px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: '600',
                    fontSize: '13px',
                  }}
                >
                  <svg
                    width={'15'}
                    height={'15'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2'}
                  >
                    <circle cx={'11'} cy={'11'} r={'8'}></circle>
                    <line x1={'21'} y1={'21'} x2={'16.65'} y2={'16.65'}></line>
                  </svg>
                  {'\n                      Inspect DNS Records\n                    '}
                </Button>
              </div>
            </div>
          </form>

          <div id={'domainHealthReport'} style={{ marginTop: '20px', display: 'none' }}></div>

          <details id={'domainRawDetails'} style={{ marginTop: '16px' }} hidden={true}>
            <summary
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              {'View raw DNS response JSON'}
            </summary>
            <pre
              id={'domainResult'}
              className={'tracking-output'}
              aria-live={'polite'}
              style={{ marginTop: '8px' }}
            ></pre>
          </details>
        </div>

        <div className={'panel daemon-monitor-panel'}>
          <div className={'panel-head'}>
            <div>
              <h2 className={'panel-title'}>
                <svg
                  width={'18'}
                  height={'18'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <rect x={'2'} y={'3'} width={'20'} height={'14'} rx={'2'} ry={'2'}></rect>
                  <line x1={'8'} y1={'21'} x2={'16'} y2={'21'}></line>
                  <line x1={'12'} y1={'17'} x2={'12'} y2={'21'}></line>
                </svg>
                {'\n                    IMAP Monitor Daemon & Bounce Review\n                  '}
              </h2>
              <p className={'panel-subtitle'}>
                {
                  'Background mailbox watcher telemetry and unmatched bounce notifications requiring operator review.'
                }
              </p>
            </div>
            <div className={'daemon-status-chip'}>
              <span className={'status-dot-pulse'}></span>
              <span>{'IMAP Telemetry'}</span>
            </div>
          </div>
          <div className={'daemon-config-box'}>
            <svg
              width={'16'}
              height={'16'}
              viewBox={'0 0 24 24'}
              fill={'none'}
              stroke={'#60a5fa'}
              strokeWidth={'2'}
            >
              <circle cx={'12'} cy={'12'} r={'10'}></circle>
              <line x1={'12'} y1={'16'} x2={'12'} y2={'12'}></line>
              <line x1={'12'} y1={'8'} x2={'12.01'} y2={'8'}></line>
            </svg>
            <p id={'trackingConfig'} className={'tracking-note'} style={{ margin: '0' }}></p>
          </div>
          <div className={'daemon-terminal-window'}>
            <div className={'daemon-terminal-bar'}>
              <div className={'window-dots'}>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className={'terminal-title'}>{'imap_daemon_worker.json'}</span>
            </div>
            <pre id={'trackingWorker'} className={'tracking-output'}></pre>
          </div>
          <details className={'review-queue-details'}>
            <summary>
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
              {'\n                  Notifications needing manual review\n                '}
            </summary>
            <pre
              id={'trackingReview'}
              className={'tracking-output'}
              style={{ marginTop: '10px' }}
            ></pre>
          </details>
        </div>
      </section>
    </>
  );
}
