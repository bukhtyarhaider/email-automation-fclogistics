function openPreviewDrawer() {
  const drawer = $("leadPreviewDrawer");
  if (drawer) drawer.classList.add("open");
}

function closePreviewDrawer() {
  const drawer = $("leadPreviewDrawer");
  if (drawer) drawer.classList.remove("open");
}

function switchDrawerTab(tabName) {
  const tabDetails = $("tabLeadDetails");
  const tabEmail = $("tabEmailDraft");
  const sectionDetails = $("leadDetailsSection");
  const sectionEmail = $("emailDraftSection");

  if (tabName === "email") {
    if (tabEmail) tabEmail.classList.add("active");
    if (tabDetails) tabDetails.classList.remove("active");
    if (sectionEmail) sectionEmail.style.display = "block";
    if (sectionDetails) sectionDetails.style.display = "none";
  } else {
    if (tabDetails) tabDetails.classList.add("active");
    if (tabEmail) tabEmail.classList.remove("active");
    if (sectionDetails) sectionDetails.style.display = "block";
    if (sectionEmail) sectionEmail.style.display = "none";
  }
}

function openTrackingDrawer(r) {
  const drawer = $("trackingDrawer");
  if (drawer) drawer.classList.add("open");
  if (r) renderTrackingDetail(r);
}

function closeTrackingDrawer() {
  const drawer = $("trackingDrawer");
  if (drawer) drawer.classList.remove("open");
}

function switchTrackingDrawerTab(tabName) {
  const tabOverview = $("tabTrackingOverview");
  const tabSpecs = $("tabTrackingSpecs");
  const tabRaw = $("tabTrackingRaw");
  const secOverview = $("trackingSecOverview");
  const secSpecs = $("trackingSecSpecs");
  const secRaw = $("trackingSecRaw");

  if (tabOverview) tabOverview.classList.toggle("active", tabName === "overview");
  if (tabSpecs) tabSpecs.classList.toggle("active", tabName === "specs");
  if (tabRaw) tabRaw.classList.toggle("active", tabName === "raw");

  if (secOverview) secOverview.style.display = tabName === "overview" ? "block" : "none";
  if (secSpecs) secSpecs.style.display = tabName === "specs" ? "block" : "none";
  if (secRaw) secRaw.style.display = tabName === "raw" ? "block" : "none";
}


function renderLeadDetails(lead, message, warnings) {
  const container = $("leadDetailsContainer");
  if (!container) return;
  if (!lead) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 24px;">No lead details available.</p>';
    return;
  }

  const f = lead.fields || {};
  const contactName = f["owner / principal"] || f["contact"] || f["contact name"] || f["name"] || "";
  const contactTitle = f["owner title"] || f["title"] || "";
  const phone = f["phone"] || f["telephone"] || f["cell"] || f["phone number"] || "";
  const address = f["physical address"] || f["address"] || f["street"] || "";
  const city = f["city"] || "";
  const state = f["state"] || "";
  const zip = f["zip code"] || f["zip"] || f["postal code"] || "";
  const locationStr = [city, state, zip].filter(Boolean).join(", ");
  const usdot = f["usdot #"] || f["usdot"] || f["dot"] || "";
  const mc = f["mc docket #"] || f["mc"] || f["mc/ff/mx number"] || "";
  const authorityAge = f["authority age"] || "";
  const operatingStatus = f["operating status"] || "";
  const vettingTier = f["vetting tier"] || "";
  const drivers = f["drivers"] || "";
  const powerUnits = f["power units"] || "";
  const historicalNotes = f["historical notes"] || "";

  const sortedKeys = Object.keys(f).sort();

  const statusPill = lead.blocked
    ? `<span class="status-pill blocked">Excluded: ${escape(lead.blocked)}</span>`
    : `<span class="status-pill ready">Ready for outreach</span>`;

  const sheetStatusTag = lead.status
    ? `<span class="tag-badge">Workbook status: ${escape(lead.status)}</span>`
    : "";

  let lastAttemptHtml = '<span style="color: var(--text-muted); font-size: 12px;">No past outreach attempts recorded</span>';
  if (lead.lastAttempt) {
    const atStr = lead.lastAttempt.at ? new Date(lead.lastAttempt.at).toLocaleString() : "Recorded";
    lastAttemptHtml = `<div style="font-size: 12px; color: #93c5fd; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px; padding: 8px 12px;"><strong>${escape(lead.lastAttempt.status || "Attempted")}</strong> via ${escape(lead.lastAttempt.accountEmail || "mailbox")} on ${atStr}${lead.lastAttempt.subject ? `<div style="color: var(--text-secondary); margin-top: 2px;">Subject: "${escape(lead.lastAttempt.subject)}"</div>` : ""}</div>`;
  }

  let warningsHtml = "";
  if (warnings && warnings.length) {
    warningsHtml = `<div class="warning-callout" style="margin-bottom: 14px;"><strong>Note:</strong> ${warnings.map(escape).join(" ")}</div>`;
  }

  let historicalNotesHtml = "";
  if (historicalNotes && historicalNotes.trim()) {
    historicalNotesHtml = `
      <div class="lead-details-card" style="border-left: 3px solid #f59e0b;">
        <h4 class="lead-details-title" style="color: #fbbf24;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Historical Notes / Remarks
        </h4>
        <div style="font-size: 12.5px; color: #e5e7eb; line-height: 1.5; white-space: pre-wrap;">${escape(historicalNotes)}</div>
      </div>
    `;
  }

  const fieldsTableRows = sortedKeys.length
    ? sortedKeys.map(k => {
        const val = f[k];
        return `<tr><td class="field-key">${escape(k)}</td><td class="field-val">${val ? escape(val) : '<span style="color: var(--text-muted);">—</span>'}</td></tr>`;
      }).join("")
    : '<tr><td colspan="2" style="color: var(--text-muted); text-align: center; padding: 10px;">No attributes found</td></tr>';

  container.innerHTML = `
    <!-- Top Hero Card -->
    <div class="lead-details-hero">
      <h2 class="lead-hero-company">${escape(lead.company || "Unnamed Lead")}</h2>
      <div class="lead-hero-subtitle">
        ${contactName ? `<span><strong>${escape(contactName)}</strong>${contactTitle ? ` (${escape(contactTitle)})` : ""}</span>` : ""}
        ${locationStr ? `<span>• ${escape(locationStr)}</span>` : ""}
      </div>
      <div class="lead-badges-row">
        ${statusPill}
        ${sheetStatusTag}
      </div>
    </div>

    ${warningsHtml}

    <!-- Core Contact Information Card -->
    <div class="lead-details-card">
      <h4 class="lead-details-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
        Contact Information
      </h4>
      <div class="lead-details-grid">
        <div class="lead-detail-item">
          <span class="lead-detail-label">Email Address</span>
          <span class="lead-detail-value">
            ${lead.email ? `<a href="mailto:${escape(lead.email)}">${escape(lead.email)}</a><button type="button" class="copy-mini-btn" data-copy="${escape(lead.email)}" title="Copy email"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : "—"}
          </span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Phone</span>
          <span class="lead-detail-value">
            ${phone ? `<a href="tel:${escape(phone)}">${escape(phone)}</a><button type="button" class="copy-mini-btn" data-copy="${escape(phone)}" title="Copy phone"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : "—"}
          </span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Contact / Owner</span>
          <span class="lead-detail-value">${escape(contactName || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Title / Role</span>
          <span class="lead-detail-value">${escape(contactTitle || "—")}</span>
        </div>
        <div class="lead-detail-item full-width">
          <span class="lead-detail-label">Physical Address</span>
          <span class="lead-detail-value">${escape(address || locationStr || "—")}</span>
        </div>
      </div>
    </div>

    <!-- Carrier & Regulatory Credentials -->
    ${(usdot || mc || authorityAge || operatingStatus || vettingTier || drivers || powerUnits) ? `
    <div class="lead-details-card">
      <h4 class="lead-details-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
        Carrier & Regulatory Credentials
      </h4>
      <div class="lead-details-grid">
        <div class="lead-detail-item">
          <span class="lead-detail-label">USDOT #</span>
          <span class="lead-detail-value">${escape(usdot || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">MC Docket #</span>
          <span class="lead-detail-value">${escape(mc || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Operating Status</span>
          <span class="lead-detail-value">${escape(operatingStatus || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Authority Age</span>
          <span class="lead-detail-value">${escape(authorityAge || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Vetting Tier</span>
          <span class="lead-detail-value">${escape(vettingTier || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Fleet Size / Drivers</span>
          <span class="lead-detail-value">${escape(drivers ? `${drivers} drivers` : (powerUnits ? `${powerUnits} units` : "—"))}</span>
        </div>
      </div>
    </div>
    ` : ""}

    <!-- Source Workbook Origin Card -->
    <div class="lead-details-card">
      <h4 class="lead-details-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        Workbook Origin & Status
      </h4>
      <div class="lead-details-grid">
        <div class="lead-detail-item">
          <span class="lead-detail-label">Worksheet Tab</span>
          <span class="lead-detail-value">${escape(lead.sheet || "Default")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Row & Cell Address</span>
          <span class="lead-detail-value">Row ${lead.row}${lead.emailCell ? ` (Email: ${lead.emailCell})` : ""}${lead.statusCell ? ` (Status: ${lead.statusCell})` : ""}</span>
        </div>
        <div class="lead-detail-item full-width">
          <span class="lead-detail-label">Past Outreach History</span>
          <div style="margin-top: 4px;">${lastAttemptHtml}</div>
        </div>
      </div>
    </div>

    ${historicalNotesHtml}

    <!-- Complete Spreadsheet Columns Inspection Table -->
    <div class="lead-details-card">
      <h4 class="lead-details-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><line x1="1" y1="3" x2="23" y2="3"></line><polygon points="10 8 14 8 14 12 10 12"></polygon></svg>
        All Spreadsheet Columns (${sortedKeys.length})
      </h4>
      <div style="max-height: 280px; overflow-y: auto; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: var(--radius-sm); background: #111318;">
        <table class="lead-fields-table">
          <tbody>
            ${fieldsTableRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Switch to Email Preview Callout -->
    <div class="lead-action-cta">
      <div>
        <div style="font-size: 12px; font-weight: 600; color: #fff;">Personalized Email Preview</div>
        <div style="font-size: 11px; color: var(--text-secondary);">${message ? escape(message.subject) : "Click to view the drafted message for this lead"}</div>
      </div>
      <button type="button" class="secondary" id="btnSwitchToEmailDraft" style="font-size: 11px; padding: 5px 10px; white-space: nowrap;">
        View Email Draft →
      </button>
    </div>
  `;

  const ctaBtn = $("btnSwitchToEmailDraft");
  if (ctaBtn) {
    ctaBtn.onclick = () => switchDrawerTab("email");
  }

  container.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      const ok = await copyToClipboard(text);
      if (ok) {
        const originalHtml = btn.innerHTML;
        btn.classList.add("copied");
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.innerHTML = originalHtml;
        }, 1500);
        notice(`Copied to clipboard: ${text}`);
      }
    };
  });
}


if ($("prepare"))
  $("prepare").onclick = () =>
    action($("prepare"), async () => {
      const r = await api("/api/prepare", {
        id: previewId,
        key: $("template").value,
        randomTemplates: $("randomTemplates").checked,
      });
      if ($("signatureText")) $("signatureText").textContent = r.signature || "No signature configured in this mailbox.";
      if ($("previewTitle")) $("previewTitle").textContent = r.message.subject;
      if ($("previewBody")) $("previewBody").textContent = r.message.body;
      if ($("warnings")) {
        $("warnings").hidden = !r.warnings?.length;
        $("warnings").textContent = (r.warnings || []).join(" ");
      }
      notice(`Compose filled in your browser. Review it before sending.${r.warnings?.length ? " Review note: " + r.warnings.join(" ") : ""}`);
    });

if ($("release"))
  $("release").onclick = () =>
    action($("release"), () => {
      closePreviewDrawer();
      return api("/api/release", {});
    });

if ($("sendOne"))
  $("sendOne").onclick = () =>
    action($("sendOne"), async () => {
      await api("/api/send", {});
      selected.delete(previewId);
      closePreviewDrawer();
      notice("Send confirmed. Workbook status updated.");
    });


// Drawer tab switching listeners
if ($("tabLeadDetails")) {
  $("tabLeadDetails").onclick = () => switchDrawerTab("details");
}
if ($("tabEmailDraft")) {
  $("tabEmailDraft").onclick = () => switchDrawerTab("email");
}
if ($("closeDrawerBtn")) {
  $("closeDrawerBtn").onclick = closePreviewDrawer;
}

// Close drawer listeners
if ($("closePreviewDrawer")) {
  $("closePreviewDrawer").onclick = closePreviewDrawer;
}
if ($("leadPreviewDrawer")) {
  $("leadPreviewDrawer").onclick = (e) => {
    if (e.target === $("leadPreviewDrawer")) closePreviewDrawer();
  };
}
if ($("tabTrackingOverview")) {
  $("tabTrackingOverview").onclick = () => switchTrackingDrawerTab("overview");
}
if ($("tabTrackingSpecs")) {
  $("tabTrackingSpecs").onclick = () => switchTrackingDrawerTab("specs");
}
if ($("tabTrackingRaw")) {
  $("tabTrackingRaw").onclick = () => switchTrackingDrawerTab("raw");
}
if ($("closeTrackingDrawerBtn")) {
  $("closeTrackingDrawerBtn").onclick = closeTrackingDrawer;
}
if ($("closeTrackingDrawer")) {
  $("closeTrackingDrawer").onclick = closeTrackingDrawer;
}
if ($("trackingDrawer")) {
  $("trackingDrawer").onclick = (e) => {
    if (e.target === $("trackingDrawer")) closeTrackingDrawer();
  };
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePreviewDrawer();
    closeTrackingDrawer();
  }
});
