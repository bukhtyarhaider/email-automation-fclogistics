let trackingOffset = 0, trackingRecords = [], trackingBusy = false;
let trackingSearchDebounce = null;
const trackingLabels = {
  recipients: "Recipients",
  attempts: "Attempts",
  webmail_sent: "Webmail confirmed",
  send_failed: "Send failed",
  hard_bounced: "Hard bounces",
  soft_bounced: "Soft bounces",
  open_detected: "Open signals",
  delivery_unknown: "Delivery unknown",
  inbox: "Seed Inbox",
  spam: "Seed Spam",
  other: "Seed Other",
  not_found: "Seed not found",
  awaiting: "Seeds awaiting",
};

async function loadTracking() {
  if (trackingBusy || !$('trackingRows') || !state) return;
  trackingBusy = true;
  try {
    const campaign = $('trackingCampaign');
    if (campaign) {
      const previous = campaign.value;
      campaign.innerHTML =
        '<option value="">All campaigns</option>' +
        state.campaigns.map((c) => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
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

    const data = await api('/api/tracking?' + params);
    trackingRecords = data.records || [];
    const summary = data.summary || {};
    const total = data.total || 0;

    // Calculate core deliverability KPIs
    const attempts = summary.attempts || 0;
    const sent = summary.webmail_sent || 0;
    const deliveryRate = attempts ? Math.round((sent / attempts) * 100) : (total ? 100 : 0);
    const opens = summary.open_detected || 0;
    const openRate = attempts ? Math.round((opens / attempts) * 100) : 0;
    const hardBounced = summary.hard_bounced || 0;
    const softBounced = summary.soft_bounced || 0;
    const bounced = hardBounced + softBounced;
    const bounceRate = attempts ? ((100 * bounced) / attempts).toFixed(1) + '%' : '0.0%';

    const seedsTotal = (summary.inbox || 0) + (summary.spam || 0) + (summary.other || 0) + (summary.not_found || 0);
    const inboxRate = seedsTotal ? Math.round(((summary.inbox || 0) / seedsTotal) * 100) : (summary.inbox ? 100 : 0);

    // Update active records badge
    if ($('trackingRecordCountBadge')) {
      $('trackingRecordCountBadge').textContent = `${total} recorded message${total === 1 ? '' : 's'}`;
    }

    // Render High-Impact Deliverability Telemetry Deck into #trackingMetrics
    if ($('trackingMetrics')) {
      $('trackingMetrics').innerHTML = `
        <!-- Tier 1: 4 Executive Cyber KPI Cards -->
        <div class="tracking-kpi-grid">
          <!-- Card 1: Dispatched / Confirmed -->
          <div class="tracking-kpi-card kpi-sent">
            <div class="kpi-top">
              <span class="kpi-title">Dispatched (Sent)</span>
              <div class="kpi-icon-wrap icon-emerald">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            </div>
            <div class="kpi-val-row">
              <span class="kpi-value">${sent}</span>
              <span class="kpi-rate-badge badge-green">${deliveryRate}%</span>
            </div>
            <div class="kpi-progress-bar">
              <div class="kpi-progress-fill fill-green" style="width: ${Math.min(100, deliveryRate)}%;"></div>
            </div>
            <div class="kpi-subtext">of ${attempts} attempted sends confirmed by webmail</div>
          </div>

          <!-- Card 2: Open Signals Telemetry -->
          <div class="tracking-kpi-card kpi-opens">
            <div class="kpi-top">
              <span class="kpi-title">Open Signals</span>
              <div class="kpi-icon-wrap icon-blue">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </div>
            </div>
            <div class="kpi-val-row">
              <span class="kpi-value">${opens}</span>
              <span class="kpi-rate-badge badge-blue">${openRate}%</span>
            </div>
            <div class="kpi-progress-bar">
              <div class="kpi-progress-fill fill-blue" style="width: ${Math.min(100, openRate)}%;"></div>
            </div>
            <div class="kpi-subtext">1×1 pixel requests captured by proxy</div>
          </div>

          <!-- Card 3: Seed Inbox Placement -->
          <div class="tracking-kpi-card kpi-seeds">
            <div class="kpi-top">
              <span class="kpi-title">Seed Inbox Rate</span>
              <div class="kpi-icon-wrap icon-purple">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              </div>
            </div>
            <div class="kpi-val-row">
              <span class="kpi-value">${seedsTotal ? `${inboxRate}%` : (summary.inbox ? '100%' : '—')}</span>
              <span class="kpi-rate-badge badge-purple">${summary.inbox || 0} Inbox</span>
            </div>
            <div class="kpi-progress-bar">
              <div class="kpi-progress-fill fill-purple" style="width: ${Math.min(100, inboxRate)}%;"></div>
            </div>
            <div class="kpi-subtext">${summary.spam || 0} landed in spam · ${summary.awaiting || 0} awaiting</div>
          </div>

          <!-- Card 4: DSN Health & Bounce Rate -->
          <div class="tracking-kpi-card ${bounced > 0 ? 'kpi-warn' : 'kpi-clean'}">
            <div class="kpi-top">
              <span class="kpi-title">Deliverability Health</span>
              <div class="kpi-icon-wrap ${bounced > 0 ? 'icon-amber' : 'icon-emerald'}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              </div>
            </div>
            <div class="kpi-val-row">
              <span class="kpi-value">${bounced === 0 ? 'Clean' : bounceRate}</span>
              <span class="kpi-rate-badge ${bounced > 0 ? 'badge-amber' : 'badge-green'}">${bounced === 0 ? '0 DSN' : `${bounced} Bounces`}</span>
            </div>
            <div class="kpi-progress-bar">
              <div class="kpi-progress-fill ${bounced > 0 ? 'fill-amber' : 'fill-green'}" style="width: ${bounced === 0 ? '100' : Math.max(10, 100 - parseFloat(bounceRate))}%;"></div>
            </div>
            <div class="kpi-subtext">${hardBounced} hard bounces · ${softBounced} soft bounces</div>
          </div>
        </div>

        <!-- Tier 2: Telemetry Data-Chip Ribbon -->
        <div class="tracking-chips-ribbon">
          <div class="telemetry-chip">
            <span class="chip-label">Total Outreaches</span>
            <strong class="chip-val">${total}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Unique Recipients</span>
            <strong class="chip-val">${summary.recipients || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Send Attempts</span>
            <strong class="chip-val">${attempts}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Confirmed Dispatched</span>
            <strong class="chip-val" style="color: #34d399;">${sent}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Failed Submissions</span>
            <strong class="chip-val" style="color: ${summary.send_failed ? '#f87171' : 'inherit'};">${summary.send_failed || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Hard Bounces</span>
            <strong class="chip-val" style="color: ${hardBounced ? '#f87171' : 'inherit'};">${hardBounced}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Soft Bounces</span>
            <strong class="chip-val" style="color: ${softBounced ? '#fbbf24' : 'inherit'};">${softBounced}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Open Signals</span>
            <strong class="chip-val" style="color: #60a5fa;">${opens}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Seed Inbox</span>
            <strong class="chip-val" style="color: #34d399;">${summary.inbox || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Seed Spam</span>
            <strong class="chip-val" style="color: ${summary.spam ? '#f87171' : 'inherit'};">${summary.spam || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Seed Awaiting</span>
            <strong class="chip-val">${summary.awaiting || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Delivery Unknown</span>
            <strong class="chip-val">${summary.delivery_unknown || 0}</strong>
          </div>
        </div>
      `;
    }

    // Render Deliverability Guidance Note
    if ($('trackingRate')) {
      $('trackingRate').innerHTML = `
        <div class="rate-callout-card">
          <div class="rate-callout-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          </div>
          <div class="rate-callout-content">
            <div class="rate-callout-title">
              <span>Observed DSN Bounce Rate: <strong>${attempts ? (100 * bounced / attempts).toFixed(1) + '%' : 'No attempts'}</strong></span>
              <span class="rate-status-tag ${bounced === 0 ? 'good' : 'warn'}">${bounced === 0 ? '✓ Healthy Sender Score' : '⚠️ Failure Monitored'}</span>
            </div>
            <div class="rate-callout-desc">
              Formula: Unique messages with an IMAP DSN failure (${bounced}) divided by attempted messages (${attempts}) in this filtered view. Incomplete mailbox monitoring or delayed remote mail exchangers can undercount failures.
            </div>
          </div>
        </div>
      `;
    }

    // Render Data Table Rows
    if ($('trackingRows')) {
      $('trackingRows').innerHTML = trackingRecords.length
        ? trackingRecords.map((r, i) => {
            const sendStatusBadge =
              r.sendStatus === 'webmail_sent'
                ? `<span class="status-pill good"><span class="badge-dot dot-green"></span>✓ Delivered</span>`
                : r.sendStatus === 'send_failed'
                  ? `<span class="status-pill blocked"><span class="badge-dot dot-red"></span>✕ Failed</span>`
                  : r.sendStatus === 'send_attempted'
                    ? `<span class="status-pill sent"><span class="badge-dot dot-blue"></span>⏳ Sending...</span>`
                    : `<span class="status-pill"><span class="badge-dot dot-muted"></span>${escape(r.sendStatus || 'pending')}</span>`;

            // Required for unit tests: Must include '(hard_bounced)' or '(soft_bounced)'
            const bounceBadge =
              r.bounceStatus === 'hard_bounced'
                ? `<div class="bounce-status-block"><span class="status-pill blocked"><span class="badge-dot dot-red"></span>⛔ Hard Bounce <small class="test-token">(hard_bounced)</small></span></div>`
                : r.bounceStatus === 'soft_bounced'
                  ? `<div class="bounce-status-block"><span class="status-pill warn"><span class="badge-dot dot-amber"></span>⚠️ Soft Bounce <small class="test-token">(soft_bounced)</small></span></div>`
                  : `<div class="clean-delivery-chip"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> <span>✓ Clean Delivery</span></div>`;

            const seenBadge = r.firstOpenAt
              ? `<div class="seen-indicator-stack">
                   <span class="status-pill good seen-pill">
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                     Seen${r.opens?.length > 1 ? ` (${r.opens.length}x)` : ''}
                   </span>
                   <small class="seen-time-hint">Opened ${new Date(r.firstOpenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                 </div>`
              : `<span class="status-pill unopened-pill">
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                   Unopened
                 </span>`;

            let placementStatusHtml = '';
            if (r.seedId) {
              if (r.placement?.status === 'inbox') {
                placementStatusHtml = `<div class="placement-result-tag"><span class="status-pill good" style="font-weight: 700; padding: 2px 8px; font-size: 11px;">📥 Inbox</span></div>`;
              } else if (r.placement?.status === 'spam') {
                placementStatusHtml = `<div class="placement-result-tag"><span class="status-pill blocked" style="font-weight: 700; padding: 2px 8px; font-size: 11px;">🚫 Spam</span></div>`;
              } else if (r.placement?.status && r.placement?.status !== 'awaiting') {
                placementStatusHtml = `<div class="placement-result-tag"><span class="status-pill" style="font-size: 11px;">📁 ${escape(r.placement.status)}</span></div>`;
              } else if (r.attemptedAt) {
                placementStatusHtml = `
                  <div class="quick-placement-actions">
                    <button type="button" class="quick-place-btn inbox" data-seed-place="${escape(r.id)}" data-place-status="inbox" title="Confirm email reached Inbox">📥 Inbox</button>
                    <button type="button" class="quick-place-btn spam" data-seed-place="${escape(r.id)}" data-place-status="spam" title="Email landed in Spam folder">🚫 Spam</button>
                  </div>
                `;
              } else {
                placementStatusHtml = `<small class="awaiting-seed-note">Awaiting dispatch</small>`;
              }
            }

            const sendTimeStr = new Date(r.attemptedAt || r.createdAt).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return `
              <tr class="tracking-table-row">
                <td>
                  <div class="recipient-cell-content">
                    <div class="recipient-meta-line">
                      <strong class="recipient-address" title="${escape(r.recipient)}">${escape(r.recipient)}</strong>
                      ${r.seedId ? `<span class="badge-seed-tag">🌱 Seed</span>` : ''}
                      ${r.campaignId ? `<span class="badge-campaign-tag">${escape(r.campaignId)}</span>` : ''}
                    </div>
                    <div class="recipient-subject-line" title="${escape(r.subject || '')}">
                      ${escape(r.subject || '(No subject)')}
                    </div>
                  </div>
                </td>
                <td>
                  <div class="send-status-cell">
                    ${sendStatusBadge}
                    <small class="timestamp-sub">${escape(sendTimeStr)}</small>
                  </div>
                </td>
                <td>
                  <div class="bounce-cell-content">
                    ${bounceBadge}
                    ${r.bounceReason ? `<small class="bounce-reason-text" title="${escape(r.bounceReason)}">${escape(r.bounceReason)}</small>` : ''}
                  </div>
                </td>
                <td>
                  <div class="engagement-cell-content">
                    ${seenBadge}
                    ${placementStatusHtml}
                  </div>
                </td>
                <td style="text-align: right;">
                  <div class="row-actions-group">
                    <button class="secondary action-inspect-btn" data-track="${i}" title="Inspect complete delivery timeline & technical specs">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      Details
                    </button>
                    ${r.seedId && r.sendStatus === 'pending' && !r.preparationStartedAt
                      ? `<button class="primary-btn seed-dispatch-btn" data-seed-send="${escape(r.id)}" title="Send seed test email">
                           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                           Send seed
                         </button>`
                      : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('')
        : '<tr><td colspan="5" class="empty-table-state"><div class="empty-message">No tracking records match your current filters.</div></td></tr>';
    }

    if ($('trackingPageInfo')) {
      $('trackingPageInfo').textContent = total
        ? `${trackingOffset + 1}–${Math.min(trackingOffset + 50, total)} of ${total} records`
        : 'No messages recorded';
    }
    if ($('trackingPrev')) $('trackingPrev').disabled = trackingOffset === 0;
    if ($('trackingNext')) $('trackingNext').disabled = trackingOffset + 50 >= total;

    if ($('trackingConfig')) {
      $('trackingConfig').textContent = `IMAP monitor: ${data.monitorEnabled ? 'enabled' : 'disabled (set FC_MONITOR_ENABLED=1)'}. Open tracking: ${data.opensEnabled ? 'enabled by configuration' : 'disabled'}. Keep the app running for monitoring.`;
    }
    if ($('trackingWorker')) {
      $('trackingWorker').textContent = Object.keys(data.worker || {}).length
        ? JSON.stringify(data.worker, null, 2)
        : 'No mailbox checks recorded.';
    }
    if ($('trackingReview')) {
      $('trackingReview').textContent = data.review && data.review.length
        ? JSON.stringify(data.review, null, 2)
        : 'No unmatched notifications.';
    }

    if ($('trackingSeeds')) {
      if (data.seeds && data.seeds.length) {
        $('trackingSeeds').innerHTML = `
          <div class="seed-targets-deck">
            ${data.seeds.map((s) => `
              <div class="seed-target-tile">
                <div class="seed-target-badge-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                </div>
                <div>
                  <div class="seed-target-address"><strong>${escape(s.email)}</strong> <span class="seed-id-tag">${escape(s.id)}</span></div>
                  <div class="seed-target-sub"><span class="status-dot-pulse"></span> ${s.automated ? 'Automated IMAP Active' : 'Manual Placement Inspection'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
        if ($('seedCountBadge')) {
          $('seedCountBadge').textContent = `📬 ${data.seeds.length} Active Test Mailbox${data.seeds.length > 1 ? 'es' : ''}`;
        }
      } else {
        $('trackingSeeds').innerHTML = `<div class="seed-empty-alert">⚠️ No seed recipients configured. Configure <code>FC_SEEDS</code> in <code>.env</code> to enable controlled inbox testing.</div>`;
      }
    }

    if ($('seedTestKey') && !$('seedTestKey').value) $('seedTestKey').value = generateSeedKey();
    loadSeedTemplates();
    await loadSeedSamples($('seedSampleSearch')?.value || '');

    if (!$('healthDomain').value) {
      $('healthDomain').value =
        state.profiles.find((p) => p.id === state.activeProfile)?.email.split('@')[1] || '';
    }
    if ($('healthSelectors') && !$('healthSelectors').value) $('healthSelectors').value = 'privateemail';
  } finally {
    trackingBusy = false;
  }
}

function generateSeedKey() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `seed-${dateStr}-${rand}`;
}

async function loadSeedSamples(query = '') {
  const sampleEl = $('seedSample');
  if (!sampleEl) return;
  const previous = sampleEl.value;
  try {
    const params = new URLSearchParams({ q: query, filter: 'ready', offset: '0' });
    let result = await api(`/api/leads?${params}`);
    let leads = result.leads || [];
    if (!leads.length && !query) {
      const allResult = await api('/api/leads?offset=0');
      leads = allResult.leads || [];
    }
    if (leads.length) {
      if ($('sampleCountHint')) $('sampleCountHint').textContent = `${leads.length} lead${leads.length > 1 ? 's' : ''}`;
      sampleEl.innerHTML = leads
        .map((l) => {
          const desc = [l.company, l.fields?.['owner / principal'], l.email].filter(Boolean).join(' · ');
          return `<option value="${escape(l.id)}">${escape(desc)}</option>`;
        })
        .join('');
      if (leads.some((l) => l.id === previous)) {
        sampleEl.value = previous;
      } else if (leads.some((l) => l.id === previewId)) {
        sampleEl.value = previewId;
      } else if (leads.length > 0) {
        sampleEl.selectedIndex = 0;
      }
    } else {
      if ($('sampleCountHint')) $('sampleCountHint').textContent = '0 leads';
      sampleEl.innerHTML = '<option value="">No campaign leads match</option>';
    }
    updateSeedPreview();
  } catch (err) {
    console.error('Failed to load dynamic seed samples:', err);
  }
}

function loadSeedTemplates() {
  const tmplEl = $('seedTemplate');
  if (!tmplEl || !state?.templates) return;
  const activeKey = $('template')?.value || Object.keys(state.templates)[0];
  const keys = Object.keys(state.templates);
  tmplEl.innerHTML = keys.map((k) => `<option value="${escape(k)}">${escape(k)}</option>`).join('');
  if (keys.includes(activeKey)) tmplEl.value = activeKey;
}

async function updateSeedPreview() {
  const leadId = $('seedSample')?.value;
  const templateKey = $('seedTemplate')?.value || $('template')?.value;
  const subjEl = $('seedPreviewSubject');
  const bodyEl = $('seedPreviewBody');
  const metaEl = $('seedPreviewMeta');
  const warnEl = $('seedPreviewWarnings');

  if (!leadId || !templateKey) {
    if (subjEl) subjEl.textContent = 'Select a lead to preview';
    if (bodyEl) bodyEl.textContent = 'Click any lead on the left under "Content Sample Lead" to render dynamic template variables (company name, owner, city).';
    if (metaEl) metaEl.textContent = 'Awaiting selection';
    if (warnEl) warnEl.hidden = true;
    return;
  }

  try {
    const preview = await api(`/api/preview?id=${encodeURIComponent(leadId)}&key=${encodeURIComponent(templateKey)}`);
    if (!preview || !preview.message) {
      if (subjEl) subjEl.textContent = '(Template could not render preview)';
      if (bodyEl) bodyEl.textContent = 'Unable to evaluate template tokens for this lead.';
      if (metaEl) metaEl.textContent = 'Render error';
      if (warnEl) warnEl.hidden = true;
      return;
    }

    if (subjEl) subjEl.textContent = `${preview.message.subject} [FC seed <id>]`;
    if (bodyEl) bodyEl.textContent = preview.message.body;
    if (metaEl) metaEl.textContent = `${preview.lead.company} · ${preview.lead.email || 'sample lead'}`;

    if (warnEl) {
      if (preview.warnings && preview.warnings.length) {
        warnEl.innerHTML = `<strong>Note:</strong> ${preview.warnings.map(escape).join(' ')}`;
        warnEl.hidden = false;
      } else {
        warnEl.hidden = true;
      }
    }
  } catch (err) {
    if (subjEl) subjEl.textContent = 'Unable to load preview';
    if (bodyEl) bodyEl.textContent = err.message || 'Error communicating with local preview endpoint.';
  }
}

// Refresh Button Action
if ($('trackingRefresh')) {
  $('trackingRefresh').onclick = (e) => action(e.currentTarget, loadTracking);
}

// Wire Change & Input Listeners
for (const id of ['trackingCampaign', 'trackingStatus', 'trackingFrom', 'trackingUntil']) {
  if ($(id)) {
    $(id).onchange = () => {
      trackingOffset = 0;
      loadTracking().catch((e) => notice(e.message));
    };
  }
}

if ($('trackingSearch')) {
  $('trackingSearch').oninput = () => {
    clearTimeout(trackingSearchDebounce);
    trackingSearchDebounce = setTimeout(() => {
      trackingOffset = 0;
      loadTracking().catch((e) => notice(e.message));
    }, 280);
  };
  $('trackingSearch').onchange = () => {
    trackingOffset = 0;
    loadTracking().catch((e) => notice(e.message));
  };
}

// Quick Filter Segmented Pills
if ($('trackingQuickPills')) {
  $('trackingQuickPills').querySelectorAll('[data-pill-status]').forEach((pill) => {
    pill.onclick = () => {
      $('trackingQuickPills').querySelectorAll('[data-pill-status]').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const targetStatus = pill.dataset.pillStatus;

      if (targetStatus === 'seeds') {
        if ($('trackingStatus')) $('trackingStatus').value = '';
        if ($('trackingSearch')) $('trackingSearch').value = 'seed';
      } else {
        if ($('trackingStatus')) $('trackingStatus').value = targetStatus;
      }

      trackingOffset = 0;
      loadTracking().catch((e) => notice(e.message));
    };
  });
}

// Reset Filters Action Button
if ($('trackingResetFilters')) {
  $('trackingResetFilters').onclick = () => {
    if ($('trackingSearch')) $('trackingSearch').value = '';
    if ($('trackingCampaign')) $('trackingCampaign').value = '';
    if ($('trackingStatus')) $('trackingStatus').value = '';
    if ($('trackingFrom')) $('trackingFrom').value = '';
    if ($('trackingUntil')) $('trackingUntil').value = '';
    if ($('trackingQuickPills')) {
      $('trackingQuickPills').querySelectorAll('[data-pill-status]').forEach((p, idx) => {
        p.classList.toggle('active', idx === 0);
      });
    }
    trackingOffset = 0;
    loadTracking().catch((e) => notice(e.message));
    notice('All tracking filters reset.');
  };
}

if ($('trackingPrev')) {
  $('trackingPrev').onclick = () => {
    trackingOffset = Math.max(0, trackingOffset - 50);
    loadTracking().catch((e) => notice(e.message));
  };
}
if ($('trackingNext')) {
  $('trackingNext').onclick = () => {
    trackingOffset += 50;
    loadTracking().catch((e) => notice(e.message));
  };
}

function renderTrackingDetail(r) {
  const panel = $('trackingDetail');
  if (!panel) return;

  if ($('trackingDrawerTitle')) {
    $('trackingDrawerTitle').textContent = r.recipient ? `Tracking: ${r.recipient}` : 'Tracking Details';
  }

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
  const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  // Badges matching lead details system
  const sendBadge =
    r.sendStatus === 'webmail_sent'
      ? `<span class="status-pill good"><span class="badge-dot dot-green"></span>✓ Dispatched</span>`
      : r.sendStatus === 'send_failed'
        ? `<span class="status-pill blocked"><span class="badge-dot dot-red"></span>✕ Failed</span>`
        : r.sendStatus === 'send_attempted'
          ? `<span class="status-pill sent"><span class="badge-dot dot-blue"></span>⏳ Sending...</span>`
          : `<span class="status-pill"><span class="badge-dot dot-muted"></span>${escape(r.sendStatus || 'Pending')}</span>`;

  const seenBadge = r.firstOpenAt
    ? `<span class="status-pill good">👁️ Seen${r.opens?.length > 1 ? ` (${r.opens.length}x)` : ''}</span>`
    : `<span class="status-pill unopened-pill">✉️ Unopened</span>`;

  const bounceBadge =
    r.bounceStatus === 'hard_bounced'
      ? `<span class="status-pill blocked">⛔ Hard Bounce</span>`
      : r.bounceStatus === 'soft_bounced'
        ? `<span class="status-pill warn">⚠️ Soft Bounce</span>`
        : `<span class="status-pill good">✓ Clean Delivery</span>`;

  // Relative timing calculation
  let openRelative = '';
  if (r.attemptedAt && r.firstOpenAt) {
    const diffSec = Math.round((new Date(r.firstOpenAt) - new Date(r.attemptedAt)) / 1000);
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
          desc: `Mail server assigned identifier: <code>${escape(ev.messageId)}</code>`,
          color: 'blue',
          icon: '🆔',
        });
      } else if (ev.type === 'open_detected') {
        timelineEvents.push({
          time: ev.at,
          title: 'Recipient Opened Email (Open Signal)',
          desc: `${escape(ev.signal || 'Remote 1x1 image request received from mail client.')} ${openRelative ? `<strong style="color:#10b981;">(${openRelative})</strong>` : ''}`,
          color: 'emerald',
          icon: '👁️',
        });
      } else if (ev.type === 'hard_bounced') {
        timelineEvents.push({
          time: ev.at,
          title: 'Hard Bounce Reported (Permanent DSN)',
          desc: `${escape(ev.diagnostic || ev.status || r.bounceReason || 'Mailbox unavailable.')}`,
          color: 'red',
          icon: '⛔',
        });
      } else if (ev.type === 'soft_bounced') {
        timelineEvents.push({
          time: ev.at,
          title: 'Soft Bounce Reported (Temporary Delay)',
          desc: `${escape(ev.diagnostic || ev.status || r.bounceReason || 'Temporary delivery delay.')}`,
          color: 'amber',
          icon: '⚠️',
        });
      } else if (ev.type === 'seed_placement') {
        timelineEvents.push({
          time: ev.at,
          title: 'Seed Placement Verified',
          desc: `Folder: <strong>${escape(ev.status || '')}</strong> · Evidence: ${escape(ev.evidence || '')}`,
          color: 'green',
          icon: '🎯',
        });
      } else {
        timelineEvents.push({
          time: ev.at,
          title: escape(ev.type),
          desc: escape(JSON.stringify(ev)),
          color: 'blue',
          icon: '•',
        });
      }
    }
  } else {
    if (r.createdAt) timelineEvents.push({ time: r.createdAt, title: 'Message Initialized', desc: 'Added to tracking index.', color: 'blue', icon: '⏱️' });
    if (r.attemptedAt) timelineEvents.push({ time: r.attemptedAt, title: 'Send Attempted', desc: 'Webmail compose window prepared.', color: 'blue', icon: '🚀' });
    if (r.confirmedAt) timelineEvents.push({ time: r.confirmedAt, title: 'Webmail Send Confirmed', desc: 'Message sent successfully.', color: 'green', icon: '✓' });
    if (r.firstOpenAt) timelineEvents.push({ time: r.firstOpenAt, title: 'Recipient Opened Email', desc: 'Tracking pixel loaded.', color: 'emerald', icon: '👁️' });
    if (r.bounceStatus) timelineEvents.push({ time: r.lastEventAt || r.confirmedAt, title: `${r.bounceStatus} Notification`, desc: r.bounceReason || 'Delivery failure notice.', color: 'red', icon: '⛔' });
  }

  const timelineHtml = timelineEvents
    .map(
      (ev) => `
      <div class="timeline-item">
        <div class="timeline-node node-${ev.color}">${ev.icon}</div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-title">${ev.title}</span>
            <span class="timeline-time">${fmt(ev.time)}</span>
          </div>
          <div class="timeline-desc">${ev.desc}</div>
        </div>
      </div>`,
    )
    .join('');

  panel.innerHTML = `
    <!-- Top Hero Card (Consistent with Lead Details Inspector) -->
    <div class="lead-details-hero">
      <h2 class="lead-hero-company" style="font-size: 17px; word-break: break-all;">${escape(r.recipient)}</h2>
      <div class="lead-hero-subtitle">
        <span><strong>${escape(r.subject || '(No Subject)')}</strong></span>
        ${r.sender ? `<span>• From: ${escape(r.sender)}</span>` : ''}
      </div>
      <div class="lead-badges-row">
        ${sendBadge}
        ${seenBadge}
        ${bounceBadge}
      </div>
    </div>

    <!-- SECTION 1: OVERVIEW & TIMELINE -->
    <div id="trackingSecOverview" class="drawer-tab-pane active">
      <!-- Delivery & Engagement Metrics Card -->
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Delivery &amp; Engagement Metrics
        </h4>
        <div class="lead-details-grid">
          <div class="lead-detail-item">
            <span class="lead-detail-label">Send Status</span>
            <span class="lead-detail-value">${r.sendStatus === 'webmail_sent' ? 'Confirmed' : escape(r.sendStatus || 'Pending')} <small style="color:var(--text-muted);font-weight:normal;">(${r.confirmedAt ? fmtTime(r.confirmedAt) : (r.attemptedAt ? fmtTime(r.attemptedAt) : '—')})</small></span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Read Engagement</span>
            <span class="lead-detail-value" style="color: ${r.firstOpenAt ? '#10b981' : 'var(--text-muted)'};">${r.firstOpenAt ? `Seen (${r.opens?.length || 1}x)` : 'Unopened'} <small style="font-weight:normal;">(${r.firstOpenAt ? (openRelative || fmtTime(r.firstOpenAt)) : 'No read detected'})</small></span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Deliverability Health</span>
            <span class="lead-detail-value" style="color: ${r.bounceStatus ? '#ef4444' : '#10b981'};">${r.bounceStatus ? `${escape(r.bounceStatus)}` : 'Clean (No DSN)'}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Sender Account</span>
            <span class="lead-detail-value">${escape(r.sender || 'Not recorded')}</span>
          </div>
        </div>
      </div>

      <!-- Bounce Diagnostic Card (Shown when failure / bounce detected) -->
      ${r.bounceReason || r.bounceStatus ? `
      <div class="lead-details-card" style="border-left: 3px solid #ef4444;">
        <h4 class="lead-details-title" style="color: #f87171;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          Delivery Failure Diagnostic (${escape(r.bounceStatus || 'bounced')})
        </h4>
        <div style="font-size: 13px; font-weight: 600; color: #fca5a5; font-family: ui-monospace, SFMono-Regular, monospace; margin-bottom: 6px; word-break: break-all;">${escape(r.bounceReason || 'smtp; 550 mailbox unavailable')}</div>
        <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">Recipient reported a permanent delivery failure via IMAP DSN notification. This recipient has been automatically excluded from future outreach.</div>
      </div>` : ''}

      <!-- Lifecycle Event Timeline Card -->
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Lifecycle Event Timeline
        </h4>
        <div class="tracking-timeline">
          ${timelineHtml || '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">No timeline events recorded.</div>'}
        </div>
      </div>
    </div>

    <!-- SECTION 2: TECHNICAL SPECS -->
    <div id="trackingSecSpecs" class="drawer-tab-pane" style="display: none;">
      <!-- Identifiers & Routing Card -->
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Message Identifiers &amp; Routing
        </h4>
        <div class="lead-details-grid">
          <div class="lead-detail-item">
            <span class="lead-detail-label">Recipient</span>
            <span class="lead-detail-value"><a href="mailto:${escape(r.recipient)}">${escape(r.recipient)}</a><button type="button" class="copy-mini-btn" data-copy="${escape(r.recipient)}" title="Copy recipient"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Sender Account</span>
            <span class="lead-detail-value">${escape(r.sender || 'Not recorded')}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Campaign ID</span>
            <span class="lead-detail-value">${escape(r.campaignId || 'Direct Outreach')}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Tracking UUID</span>
            <span class="lead-detail-value"><code>${escape(r.id)}</code><button type="button" class="copy-mini-btn" data-copy="${escape(r.id)}" title="Copy UUID"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></span>
          </div>
          ${r.messageIds?.length ? `
          <div class="lead-detail-item full-width">
            <span class="lead-detail-label">Recorded Message-ID</span>
            <span class="lead-detail-value"><code>${escape(r.messageIds[0])}</code><button type="button" class="copy-mini-btn" data-copy="${escape(r.messageIds[0])}" title="Copy Message-ID"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></span>
          </div>` : ''}
        </div>
      </div>

      <!-- Transmission & Interaction Timestamps Card -->
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          Transmission &amp; Interaction Timestamps
        </h4>
        <div class="lead-details-grid">
          <div class="lead-detail-item">
            <span class="lead-detail-label">Created At</span>
            <span class="lead-detail-value">${fmt(r.createdAt)}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Webmail Confirmed At</span>
            <span class="lead-detail-value">${fmt(r.confirmedAt || r.attemptedAt)}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">First Read Detected</span>
            <span class="lead-detail-value">${r.firstOpenAt ? `<span style="color:#10b981;font-weight:600;">${fmt(r.firstOpenAt)} ${openRelative ? `<small>(${openRelative})</small>` : ''}</span>` : '<span style="color:var(--text-muted);">Unopened</span>'}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Total Read Sessions</span>
            <span class="lead-detail-value"><strong>${r.opens?.length || (r.firstOpenAt ? 1 : 0)} recorded interaction(s)</strong></span>
          </div>
        </div>
      </div>

      <!-- Seed Placement Card (if applicable) -->
      ${r.seedId ? `
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
          Seed Inbox Placement Verification
        </h4>
        <div class="lead-details-grid">
          <div class="lead-detail-item">
            <span class="lead-detail-label">Seed ID</span>
            <span class="lead-detail-value">${escape(r.seedId)}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Folder Placement</span>
            <span class="lead-detail-value">
              <strong style="color: ${r.placement?.status === 'inbox' ? '#10b981' : r.placement?.status === 'spam' ? '#ef4444' : '#fff'};">
                ${r.placement?.status === 'inbox' ? '📥 Inbox (Verified)' : r.placement?.status === 'spam' ? '🚫 Spam / Junk Folder' : escape(r.placement?.status || 'Awaiting verification')}
              </strong>
            </span>
          </div>
          <div class="lead-detail-item full-width">
            <span class="lead-detail-label">Verification Evidence / Note</span>
            <span class="lead-detail-value">${escape(r.placement?.evidence || (r.attemptedAt ? 'Not yet verified. Select folder below:' : 'Awaiting dispatch'))}</span>
          </div>
          ${r.attemptedAt ? `
          <div class="lead-detail-item full-width" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-subtle);">
            <span class="lead-detail-label">Record Placement Result</span>
            <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
              <button type="button" class="btn-placement-inbox" data-drawer-place="${escape(r.id)}" data-drawer-status="inbox">📥 Mark as Inbox</button>
              <button type="button" class="btn-placement-spam" data-drawer-place="${escape(r.id)}" data-drawer-status="spam">🚫 Mark as Spam</button>
              <button type="button" class="secondary" data-drawer-place="${escape(r.id)}" data-drawer-status="other" style="font-size:11.5px;padding:6px 12px;">📁 Other Folder</button>
            </div>
          </div>` : ''}
        </div>
      </div>` : ''}
    </div>

    <!-- SECTION 3: RAW JSON -->
    <div id="trackingSecRaw" class="drawer-tab-pane" style="display: none;">
      <div class="lead-details-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h4 class="lead-details-title" style="margin:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            Complete Tracking Record (JSON)
          </h4>
          <button type="button" class="secondary" data-copy-json style="font-size:11px;padding:4px 10px;">Copy JSON</button>
        </div>
        <pre class="message-preview-box" style="max-height: 440px; overflow: auto; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11.5px; line-height: 1.5; color: #cbd5e1; background: var(--bg-surface-elevated, #1a1e26); border-radius: var(--radius-sm); padding: 12px; margin: 0;">${escape(JSON.stringify(r, null, 2))}</pre>
      </div>
    </div>
  `;

  panel.hidden = false;
  switchTrackingDrawerTab('overview');

  // Wire footer Copy Summary button
  const copySummaryBtn = $('trackingCopyBtn');
  if (copySummaryBtn) {
    copySummaryBtn.onclick = async () => {
      const summaryText = `Recipient: ${r.recipient}\nSubject: ${r.subject || '(No Subject)'}\nSend Status: ${r.sendStatus}\nDelivery: ${r.confirmedAt ? 'Confirmed' : 'Pending'}\nFirst Open: ${r.firstOpenAt || 'Unopened'}\nDeliverability: ${r.bounceStatus || 'Clean'}\nTracking ID: ${r.id}`;
      const ok = await copyToClipboard(summaryText);
      if (ok) {
        const orig = copySummaryBtn.innerHTML;
        copySummaryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
        setTimeout(() => { copySummaryBtn.innerHTML = orig; }, 1500);
        notice('Summary copied to clipboard.');
      }
    };
  }

  // Wire mini copy buttons
  panel.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.onclick = async () => {
      const text = btn.dataset.copy;
      const ok = await copyToClipboard(text);
      if (ok) {
        const orig = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = orig;
        }, 1500);
        notice(`Copied: ${text}`);
      }
    };
  });

  // Wire drawer placement buttons
  panel.querySelectorAll('[data-drawer-place]').forEach((btn) => {
    btn.onclick = () => action(btn, async () => {
      const trackingId = btn.dataset.drawerPlace;
      const status = btn.dataset.drawerStatus;
      await api('/api/tracking/manual-placement', {
        trackingId,
        status,
        evidence: `Manual verification: marked ${status} in Tracking Details Drawer`
      });
      await loadTracking();
      const updated = trackingRecords.find((rec) => rec.id === trackingId);
      if (updated) renderTrackingDetail(updated);
    });
  });

  // Wire copy JSON button
  const copyJsonBtn = panel.querySelector('[data-copy-json]');
  if (copyJsonBtn) {
    copyJsonBtn.onclick = async () => {
      const ok = await copyToClipboard(JSON.stringify(r, null, 2));
      if (ok) {
        const orig = copyJsonBtn.textContent;
        copyJsonBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyJsonBtn.textContent = orig; }, 1500);
        notice('Raw JSON copied to clipboard.');
      }
    };
  }
}

// Table click delegation
if ($('trackingRows')) {
  $('trackingRows').onclick = (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.seedSend) return action(button, async () => {
      await api('/api/tracking/seed-send', { trackingId: button.dataset.seedSend });
      await loadTracking();
    });
    if (button.dataset.seedPlace) return action(button, async () => {
      const trackingId = button.dataset.seedPlace;
      const status = button.dataset.placeStatus;
      await api('/api/tracking/manual-placement', {
        trackingId,
        status,
        evidence: `Manual verification: marked ${status} directly from Tracking dashboard`
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
  };
}

if ($('placementForm')) {
  $('placementForm').onsubmit = (e) => {
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
  };
}

if ($('seedGenKeyBtn')) {
  $('seedGenKeyBtn').onclick = () => { $('seedTestKey').value = generateSeedKey(); };
}
if ($('seedSample')) {
  $('seedSample').onchange = () => updateSeedPreview();
}
if ($('seedTemplate')) {
  $('seedTemplate').onchange = () => updateSeedPreview();
}
if ($('seedSampleSearch')) {
  let searchTimer = null;
  $('seedSampleSearch').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadSeedSamples($('seedSampleSearch').value);
    }, 250);
  };
}

if ($('seedPlanForm')) {
  $('seedPlanForm').onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      const templateKey = $('seedTemplate')?.value || $('template')?.value;
      const result = await api('/api/tracking/seed-plan', { testKey: $('seedTestKey').value, leadId: $('seedSample').value, key: templateKey });
      $('seedPlanResult').innerHTML = `<div class="seed-plan-success-box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <div><strong>Plan ${escape(result.testKey)}:</strong> ${result.ids.length} dedicated test recipient(s) reserved. Use <strong>"Send seed"</strong> in the tracking table above to dispatch; the same test key reuses this plan.</div></div>`;
      $('seedTestKey').value = generateSeedKey();
      trackingOffset = 0;
      await loadTracking();
    });
  };
}

function setDomainPreset(selectors, btn) {
  if ($('healthSelectors')) $('healthSelectors').value = selectors;
  document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

$('presetPrivateEmail')?.addEventListener('click', () => {
  setDomainPreset('privateemail', $('presetPrivateEmail'));
});
$('presetGoogle')?.addEventListener('click', () => {
  setDomainPreset('google', $('presetGoogle'));
});
$('presetM365')?.addEventListener('click', () => {
  setDomainPreset('selector1, selector2', $('presetM365'));
});

function renderDomainReport(result) {
  const reportEl = $('domainHealthReport');
  if (!reportEl) return;
  reportEl.style.display = 'block';
  if ($('domainRawDetails')) $('domainRawDetails').hidden = false;

  const domain = escape(result.domain || '');
  const spfFound = result.spf?.state === 'found' && (result.spf.records || []).length === 1;
  const dkimFound = Array.isArray(result.dkim) && result.dkim.some(d => d.state === 'found' && (d.records || []).length > 0);
  const dmarcFound = result.dmarc?.state === 'found' && (result.dmarc.records || []).length >= 1;

  let passedChecks = 0;
  if (spfFound) passedChecks++;
  if (dkimFound) passedChecks++;
  if (dmarcFound) passedChecks++;

  let bannerClass = 'good';
  let bannerTitle = 'All Authentication Records Active';
  let bannerDesc = `Domain <strong>${domain}</strong> meets all modern deliverability standards (SPF, DKIM, and DMARC aligned). Outreach emails will reach primary inboxes.`;

  if (passedChecks === 2) {
    bannerClass = 'warn';
    bannerTitle = '2 of 3 Checks Passing — DMARC Action Required';
    bannerDesc = `SPF and DKIM are validated, but <strong>DMARC is missing</strong>. Google and Yahoo spam filters heavily deprioritize domains without published DMARC policies.`;
  } else if (passedChecks < 2) {
    bannerClass = 'bad';
    bannerTitle = `${passedChecks} of 3 Checks Passing — Deliverability Risk`;
    bannerDesc = `Key email authentication records are missing or unverified. Emails sent from <strong>${domain}</strong> have high risk of landing in spam or being rejected.`;
  }

  if ($('domainScoreBadge')) {
    if (passedChecks === 3) {
      $('domainScoreBadge').innerHTML = `<span class="status-pill" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 600; padding: 4px 10px; font-size: 11.5px;">✅ 100% Authenticated (3/3)</span>`;
    } else if (passedChecks === 2) {
      $('domainScoreBadge').innerHTML = `<span class="status-pill" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 600; padding: 4px 10px; font-size: 11.5px;">⚠️ 67% Healthy (DMARC Missing)</span>`;
    } else {
      $('domainScoreBadge').innerHTML = `<span class="status-pill" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600; padding: 4px 10px; font-size: 11.5px;">❌ ${passedChecks}/3 Checks Passing</span>`;
    }
  }

  const activeProfileEmail = state.profiles.find((p) => p.id === state.activeProfile)?.email || `markanthony@${result.domain || 'fclogistics.us'}`;
  const recommendedDmarcVal = `v=DMARC1; p=none; sp=none; rua=mailto:${activeProfileEmail}`;

  const spfCard = `
    <div class="domain-health-card ${spfFound ? 'status-pass' : 'status-fail'}">
      <div>
        <div class="domain-card-head">
          <div class="domain-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${spfFound ? '#10b981' : '#ef4444'}" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle>${spfFound ? '<polyline points="16 9 10 15 7 12"></polyline>' : '<line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'}</svg>
            SPF Record
          </div>
          <span class="status-pill" style="background: ${spfFound ? 'rgba(16, 185, 129, 0.12); color: #34d399;' : 'rgba(239, 68, 68, 0.12); color: #f87171;'} font-weight: 700; font-size: 11px;">
            ${spfFound ? 'PASS' : 'FAIL'}
          </span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0 10px 0;">Specifies mail servers authorized to send on behalf of <code>${domain}</code>.</p>
        <div class="domain-record-box">
          ${(result.spf?.records && result.spf.records.length > 0) ? escape(result.spf.records.join('\n')) : '<span style="color: #ef4444;">No valid SPF TXT record detected.</span>'}
        </div>
      </div>
      <div style="font-size: 11.5px; color: ${spfFound ? '#34d399' : '#f87171'}; display: flex; align-items: center; gap: 6px;">
        ${spfFound ? '✓ PrivateEmail mail server authorized' : '⚠ Outreach may bounce or fail authentication'}
      </div>
    </div>
  `;

  const dkimResults = result.dkim || [];
  const dkimCard = `
    <div class="domain-health-card ${dkimFound ? 'status-pass' : 'status-fail'}">
      <div>
        <div class="domain-card-head">
          <div class="domain-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${dkimFound ? '#10b981' : '#ef4444'}" stroke-width="2.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
            DKIM Signatures
          </div>
          <span class="status-pill" style="background: ${dkimFound ? 'rgba(16, 185, 129, 0.12); color: #34d399;' : 'rgba(239, 68, 68, 0.12); color: #f87171;'} font-weight: 700; font-size: 11px;">
            ${dkimFound ? 'PASS' : 'FAIL'}
          </span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0 10px 0;">Cryptographic signature verifying mail has not been tampered in transit.</p>
        <div class="domain-record-box">
          ${dkimResults.length > 0 ? dkimResults.map(d => `<strong>Selector:</strong> <code>${escape(d.selector)}</code> — ${d.state === 'found' ? '<span style="color: #34d399;">Valid RSA Key</span><br>' + escape(d.records.join('\n')) : '<span style="color: #f87171;">Key missing</span>'}`).join('<hr style="border:0;border-top:1px solid #1f2533;margin:6px 0;">') : '<span style="color: #94a3b8;">No DKIM selectors queried.</span>'}
        </div>
      </div>
      <div style="font-size: 11.5px; color: ${dkimFound ? '#34d399' : '#f87171'}; display: flex; align-items: center; gap: 6px;">
        ${dkimFound ? '✓ Valid DKIM key found on selector: ' + escape(dkimResults.filter(d=>d.state==='found').map(d=>d.selector).join(', ')) : '⚠ No valid DKIM keys located'}
      </div>
    </div>
  `;

  const dmarcCard = `
    <div class="domain-health-card ${dmarcFound ? 'status-pass' : 'status-fail'}">
      <div>
        <div class="domain-card-head">
          <div class="domain-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${dmarcFound ? '#10b981' : '#f59e0b'}" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            DMARC Policy
          </div>
          <span class="status-pill" style="background: ${dmarcFound ? 'rgba(16, 185, 129, 0.12); color: #34d399;' : 'rgba(245, 158, 11, 0.15); color: #fbbf24;'} font-weight: 700; font-size: 11px;">
            ${dmarcFound ? 'PASS' : 'MISSING'}
          </span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0 10px 0;">Instructs Gmail & Outlook how to handle messages failing SPF/DKIM.</p>
        <div class="domain-record-box">
          ${(result.dmarc?.records && result.dmarc.records.length > 0) ? escape(result.dmarc.records.join('\n')) : '<span style="color: #fbbf24;">No record at <code>_dmarc.' + domain + '</code>.</span>'}
        </div>
      </div>
      <div style="font-size: 11.5px; color: ${dmarcFound ? '#34d399' : '#fbbf24'}; display: flex; align-items: center; gap: 6px;">
        ${dmarcFound ? '✓ DMARC policy active' : '⚠ Required by 2024+ Gmail & Yahoo sender rules'}
      </div>
    </div>
  `;

  let dmarcGuide = '';
  if (!dmarcFound) {
    dmarcGuide = `
      <div class="dmarc-alert-box">
        <div style="font-size: 24px; line-height: 1;">🛡️</div>
        <div style="flex: 1;">
          <div style="font-size: 13.5px; font-weight: 700; color: #fde68a;">
            Action Required: Add Recommended DMARC TXT Record to Namecheap DNS
          </div>
          <p style="font-size: 12.5px; color: #e2e8f0; margin: 6px 0 10px 0; line-height: 1.5;">
            Without DMARC, Gmail and Yahoo mark outreach emails as unauthenticated or throttle delivery to Spam. Add this single TXT record in your <strong>Namecheap Advanced DNS</strong> management console:
          </p>
          <div style="background: #0f1219; border: 1px solid #283044; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            <table class="dmarc-rec-table">
              <tr><td>Type:</td><td><strong style="color: #38bdf8;">TXT Record</strong></td></tr>
              <tr><td>Host:</td><td><code>_dmarc</code></td></tr>
              <tr><td>Value / Target:</td><td><code id="dmarcRecordText" style="color: #a7f3d0; word-break: break-all;">${escape(recommendedDmarcVal)}</code></td></tr>
              <tr><td>TTL:</td><td><code>Automatic</code> (or <code>30 min</code>)</td></tr>
            </table>
          </div>
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <button type="button" class="copy-btn-action" id="copyDmarcBtn" style="padding: 7px 14px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; border-radius: 6px; cursor: pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy DMARC TXT Record Value
            </button>
            <span style="font-size: 11.5px; color: var(--text-muted);">
              Policy <code>p=none</code> is safe monitoring mode (no legitimate mail will ever be dropped).
            </span>
          </div>
        </div>
      </div>
    `;
  }

  reportEl.innerHTML = `
    <div class="domain-score-banner ${bannerClass}">
      <div style="display: flex; align-items: center; gap: 14px;">
        <div style="width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${passedChecks === 3 ? 'rgba(16, 185, 129, 0.2)' : passedChecks === 2 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; font-size: 20px;">
          ${passedChecks === 3 ? '🛡️' : passedChecks === 2 ? '⚠️' : '🚨'}
        </div>
        <div>
          <div style="font-size: 15px; font-weight: 700; color: #fff;">${bannerTitle}</div>
          <div style="font-size: 12.5px; color: #cbd5e1; margin-top: 2px;">${bannerDesc}</div>
        </div>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); text-align: right;">
        Audited at: <code>${new Date(result.checkedAt).toLocaleTimeString()}</code>
      </div>
    </div>
    <div class="domain-cards-grid">
      ${spfCard}
      ${dkimCard}
      ${dmarcCard}
    </div>
    ${dmarcGuide}
  `;

  const copyBtn = $('copyDmarcBtn');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const ok = await copyToClipboard(recommendedDmarcVal);
      if (ok) {
        notice('Copied recommended DMARC record to clipboard!');
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy DMARC TXT Record Value`;
        }, 2000);
      }
    };
  }
}

if ($('domainForm')) {
  $('domainForm').onsubmit = (e) => {
    e.preventDefault();
    $('domainResult').textContent = 'Checking public DNS records…';
    action(e.submitter, async () => {
      const result = await api('/api/tracking/domain?' + new URLSearchParams({ domain: $('healthDomain').value, selectors: $('healthSelectors').value }));
      $('domainResult').textContent = JSON.stringify(result, null, 2);
      renderDomainReport(result);
    });
  };
}

setInterval(() => {
  if (!pending && location.hash === '#tracking') loadTracking().catch((e) => notice(e.message));
}, 10000);
