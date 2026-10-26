// Live System Activity Logic
function classifyEvent(e) {
  const msg = String(e?.message || "");
  const k = String(e?.kind || "").toLowerCase();
  if (k === "error" || /fail|error|uncertain|needs attention|blocked/i.test(msg)) return "error";
  if (k === "pause" || /pause|rest|seconds|waiting for leads|team pacing|interval|allowance pause/i.test(msg)) return "pause";
  if (k === "sent" || k === "start" || /sent to|sending to|started .* outreach|dispatched/i.test(msg)) return "send";
  if (k === "system" || k === "template" || /saved|imported|connected|disconnected|reloaded|deleted|profile|template|settings|workbook|suppress|reviewed|cleared/i.test(msg)) return "system";
  return "system";
}

function renderLiveActivityView() {
  if (!state) return;

  // 1. Accumulate events into liveEventsList without duplicates
  if (Array.isArray(state.events)) {
    const existingKeys = new Set(liveEventsList.map((e) => `${e.at}_${e.message}`));
    for (const e of state.events) {
      const key = `${e.at}_${e.message}`;
      if (!existingKeys.has(key)) {
        liveEventsList.push(e);
        existingKeys.add(key);
      }
    }
  }

  // 2. Telemetry Card 1: Runner Engine
  const runnerBadge = $("liveRunnerBadge");
  const runnerState = $("liveRunnerStateText");
  const runnerMsg = $("liveRunnerMsgText");
  const countdownWrap = $("liveCountdownWrapper");
  const countdownTimer = $("liveCountdownTimer");
  const countdownLabel = $("liveCountdownLabel");

  const job = state.job || {};
  const isRunning = !!(state.automation && state.automation.enabled);
  const runnerStatus = job.status || (isRunning ? "Running" : "Stopped");

  if (runnerBadge) {
    runnerBadge.textContent = runnerStatus;
    runnerBadge.className = `status-badge ${isRunning ? "active" : ""}`;
  }
  if (runnerState) {
    runnerState.textContent = isRunning ? (job.status || "Running") : "Idle / Stopped";
  }
  if (runnerMsg) {
    runnerMsg.textContent = job.message || "Queue is stopped. Start continuous outreach to resume.";
  }

  if (job.nextAt && Date.parse(job.nextAt) > Date.now()) {
    if (countdownWrap) countdownWrap.hidden = false;
    const diffMs = Date.parse(job.nextAt) - Date.now();
    const totalSec = Math.max(0, Math.ceil(diffMs / 1000));
    if (countdownTimer) countdownTimer.textContent = waitClock(totalSec);
    if (countdownLabel) countdownLabel.textContent = job.status ? `${job.status}:` : "Next send scheduled in:";
  } else {
    if (countdownWrap) countdownWrap.hidden = true;
  }

  // 3. Telemetry Card 2: Mailbox Session
  const mailboxPill = $("liveMailboxPill");
  const mailboxStatus = $("liveMailboxStatusText");
  const mailboxAccount = $("liveMailboxAccountText");
  const coordStatus = $("liveCoordinatorStatusText");

  const p = state.profiles ? state.profiles.find((p) => p.id === state.activeProfile) : null;
  const currentEmail = p?.email || state.settings?.account?.email || "No account";

  if (mailboxPill) {
    mailboxPill.className = `connection-pill ${state.connected ? "good" : ""}`;
  }
  if (mailboxStatus) {
    mailboxStatus.textContent = state.connected ? "Connected" : "Disconnected";
  }
  if (mailboxAccount) {
    mailboxAccount.textContent = currentEmail;
    mailboxAccount.title = currentEmail;
  }
  if (coordStatus) {
    if (state.settings?.team?.enabled) {
      coordStatus.textContent = state.teamConnected
        ? `Coordinator: Connected (${escape(state.settings.team.workerName || "worker")})`
        : "Coordinator: Connecting / Waiting";
    } else {
      coordStatus.textContent = "Coordinator: Standalone";
    }
  }

  // 4. Telemetry Card 3: Pacing Quotas
  const hourVal = $("liveHourQuotaText");
  const hourFill = $("liveHourQuotaFill");
  const dayVal = $("liveDayQuotaText");
  const dayFill = $("liveDayQuotaFill");
  const pacing = state.settings?.pacing || { hourlyCap: 20, dailyCap: 100 };

  const hourRemaining = state.remaining ?? pacing.hourlyCap;
  const dayRemaining = state.dayRemaining ?? pacing.dailyCap;
  const hourPct = Math.min(100, Math.max(0, (hourRemaining / (pacing.hourlyCap || 1)) * 100));
  const dayPct = Math.min(100, Math.max(0, (dayRemaining / (pacing.dailyCap || 1)) * 100));

  if (hourVal) hourVal.textContent = `${hourRemaining} / ${pacing.hourlyCap} left`;
  if (hourFill) {
    hourFill.style.width = `${hourPct}%`;
    hourFill.style.background = hourPct < 20 ? "#ef4444" : hourPct < 50 ? "#f59e0b" : "#8b5cf6";
  }
  if (dayVal) dayVal.textContent = `${dayRemaining} / ${pacing.dailyCap} left`;
  if (dayFill) {
    dayFill.style.width = `${dayPct}%`;
    dayFill.style.background = dayPct < 20 ? "#ef4444" : dayPct < 50 ? "#f59e0b" : "#3b82f6";
  }

  // 5. Telemetry Card 4: Metrics Breakdown
  let countSent = 0, countPacing = 0, countSystem = 0, countError = 0;
  for (const e of liveEventsList) {
    const cls = classifyEvent(e);
    if (cls === "send") countSent++;
    else if (cls === "pause") countPacing++;
    else if (cls === "system") countSystem++;
    else if (cls === "error") countError++;
  }

  if ($("liveTotalCountBadge")) $("liveTotalCountBadge").textContent = `${liveEventsList.length} events`;
  if ($("liveStreamCounter")) $("liveStreamCounter").textContent = `${liveEventsList.length} total`;
  if ($("liveMetricSent")) $("liveMetricSent").textContent = String(countSent);
  if ($("liveMetricPacing")) $("liveMetricPacing").textContent = String(countPacing);
  if ($("liveMetricSystem")) $("liveMetricSystem").textContent = String(countSystem);
  if ($("liveMetricError")) $("liveMetricError").textContent = String(countError);

  if ($("tabChipAll")) $("tabChipAll").textContent = String(liveEventsList.length);
  if ($("tabChipSend")) $("tabChipSend").textContent = String(countSent);
  if ($("tabChipPause")) $("tabChipPause").textContent = String(countPacing);
  if ($("tabChipSystem")) $("tabChipSystem").textContent = String(countSystem);
  if ($("tabChipError")) $("tabChipError").textContent = String(countError);

  // 6. Live Stream status badge
  const streamBadge = $("liveStreamStatusBadge");
  const streamText = $("liveStreamStatusText");
  if (livePaused) {
    if (streamBadge) streamBadge.className = "live-stream-badge paused";
    if (streamText) streamText.textContent = "FEED PAUSED";
    return;
  } else {
    if (streamBadge) streamBadge.className = "live-stream-badge";
    if (streamText) streamText.textContent = "STREAMING LIVE";
  }

  // 7. Filter & Search
  const query = liveSearchQuery.trim().toLowerCase();
  const filtered = liveEventsList.filter((e) => {
    const cls = classifyEvent(e);
    if (liveFilterKind !== "all" && cls !== liveFilterKind) return false;
    if (query) {
      const text = `${e.message} ${e.kind || ""} ${cls}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  if ($("liveFilteredCountText")) {
    $("liveFilteredCountText").textContent =
      liveFilterKind === "all" && !query
        ? `Showing all ${filtered.length} events`
        : `Showing ${filtered.length} of ${liveEventsList.length} events (filtered)`;
  }

  // 8. Render Visual Feed
  const visualList = $("liveVisualEventsList");
  const emptyState = $("liveVisualEmptyState");
  if (visualList) {
    if (filtered.length === 0) {
      visualList.innerHTML = "";
      if (emptyState) emptyState.hidden = false;
    } else {
      if (emptyState) emptyState.hidden = true;
      visualList.innerHTML = filtered
        .slice()
        .reverse()
        .map((e) => {
          const cls = classifyEvent(e);
          const time = new Date(e.at).toLocaleTimeString();
          const badgeText = cls.toUpperCase();
          const metaTags = [];
          if (e.seconds) metaTags.push(`${e.seconds}s delay`);
          if (e.company) metaTags.push(escape(e.company));
          if (e.email) metaTags.push(escape(e.email));
          if (e.kind && e.kind !== cls) metaTags.push(escape(e.kind));

          return `
            <li class="live-event-card event-${cls}">
              <span class="event-type-badge">${badgeText}</span>
              <time class="event-time" title="${escape(e.at)}">${escape(time)}</time>
              <div class="event-body">
                <span>${escape(e.message)}</span>
                ${metaTags.map((t) => `<span class="event-meta-tag">${t}</span>`).join("")}
              </div>
            </li>
          `;
        })
        .join("");
    }
  }

  // 9. Render Terminal Feed
  const termOutput = $("liveTerminalOutput");
  if (termOutput && liveViewMode === "terminal") {
    if (filtered.length === 0) {
      termOutput.textContent = "# [fc-telemetry] No events matching current criteria.";
    } else {
      const termLines = filtered
        .map((e) => {
          const cls = classifyEvent(e).toUpperCase().padEnd(6);
          const time = new Date(e.at).toLocaleTimeString();
          return `[${time}] [${cls}] ${e.message}`;
        })
        .join("\n");
      termOutput.textContent = termLines;
    }
  }

  // 10. Auto-scroll
  if (liveAutoScroll) {
    const feedWrap = $("liveVisualFeedContainer");
    if (feedWrap && liveViewMode === "visual") {
      feedWrap.scrollTop = 0;
    }
    const termWrap = $("liveTerminalContainer");
    if (termWrap && liveViewMode === "terminal") {
      const termPre = $("liveTerminalOutput");
      if (termPre) termPre.scrollTop = termPre.scrollHeight;
    }
  }
}

// Live Countdown Ticker Loop (500ms for smooth ticking)
setInterval(() => {
  if (state?.job?.nextAt) {
    const diffMs = Date.parse(state.job.nextAt) - Date.now();
    const wrap = $("liveCountdownWrapper");
    if (diffMs > 0) {
      if (wrap) wrap.hidden = false;
      const totalSec = Math.ceil(diffMs / 1000);
      const timerEl = $("liveCountdownTimer");
      if (timerEl) timerEl.textContent = waitClock(totalSec);
      const barEl = $("liveCountdownBar");
      if (barEl) {
        if (!liveCountdownTotal || totalSec > liveCountdownTotal) {
          liveCountdownTotal = totalSec;
        }
        const pct = Math.max(0, Math.min(100, ((liveCountdownTotal - totalSec) / liveCountdownTotal) * 100));
        barEl.style.width = `${pct}%`;
      }
    } else {
      liveCountdownTotal = null;
      if (wrap) wrap.hidden = true;
    }
  } else {
    liveCountdownTotal = null;
    const wrap = $("liveCountdownWrapper");
    if (wrap) wrap.hidden = true;
  }
}, 500);

// Live System Activity setup listeners
if ($("liveCategoryTabs")) {
  $("liveCategoryTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".cat-tab");
    if (!tab) return;
    document.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    liveFilterKind = tab.dataset.kind || "all";
    renderLiveActivityView();
  });
}

if ($("liveSearchInput")) {
  $("liveSearchInput").addEventListener("input", (e) => {
    liveSearchQuery = e.target.value;
    renderLiveActivityView();
  });
}

if ($("liveAutoScrollCheck")) {
  $("liveAutoScrollCheck").addEventListener("change", (e) => {
    liveAutoScroll = !!e.target.checked;
  });
}

if ($("livePauseToggleBtn")) {
  $("livePauseToggleBtn").addEventListener("click", () => {
    livePaused = !livePaused;
    const btnText = $("livePauseBtnText");
    if (btnText) btnText.textContent = livePaused ? "Resume Feed" : "Pause Feed";
    $("livePauseToggleBtn").classList.toggle("danger", livePaused);
    $("livePauseToggleBtn").classList.toggle("secondary", !livePaused);
    renderLiveActivityView();
  });
}

if ($("liveClearEventsBtn")) {
  $("liveClearEventsBtn").addEventListener("click", async () => {
    liveEventsList = [];
    if (window.confirm("Clear server activity event history as well? Click OK to reset server log, or Cancel to clear current screen view only.")) {
      try {
        await api("/api/clear-events", {});
        notice("Server activity log cleared.");
      } catch (err) {
        notice(`Failed to clear server log: ${err.message}`);
      }
    } else {
      notice("Screen event view cleared.");
    }
    renderLiveActivityView();
  });
}

if ($("btnModeVisual")) {
  $("btnModeVisual").addEventListener("click", () => {
    liveViewMode = "visual";
    $("btnModeVisual").classList.add("active");
    $("btnModeTerminal").classList.remove("active");
    if ($("liveVisualFeedContainer")) $("liveVisualFeedContainer").hidden = false;
    if ($("liveTerminalContainer")) $("liveTerminalContainer").hidden = true;
    renderLiveActivityView();
  });
}

if ($("btnModeTerminal")) {
  $("btnModeTerminal").addEventListener("click", () => {
    liveViewMode = "terminal";
    $("btnModeTerminal").classList.add("active");
    $("btnModeVisual").classList.remove("active");
    if ($("liveVisualFeedContainer")) $("liveVisualFeedContainer").hidden = true;
    if ($("liveTerminalContainer")) $("liveTerminalContainer").hidden = false;
    renderLiveActivityView();
  });
}

if ($("liveTerminalCopyBtn")) {
  $("liveTerminalCopyBtn").addEventListener("click", async () => {
    const text = $("liveTerminalOutput")?.textContent || "";
    if (text) {
      const ok = await copyToClipboard(text);
      if (ok) {
        const btn = $("liveTerminalCopyBtn");
        const orig = btn.textContent;
        btn.textContent = "✓ Copied!";
        setTimeout(() => { btn.textContent = orig; }, 1800);
        notice("Terminal console log copied to clipboard.");
      }
    } else {
      notice("No log content to copy.");
    }
  });
}


if ($("reload"))
  $("reload").onclick = () => action($("reload"), () => api("/api/reload", {}));


if ($("batch"))
  $("batch").onclick = () =>
    action($("batch"), async () => {
      await api("/api/batch", {
        ids: [...selected],
        key: $("template").value,
        randomTemplates: $("randomTemplates").checked,
      });
      selected.clear();
      notice("Batch dispatch initiated.");
    });

if ($("start"))
  $("start").onclick = () =>
    action($("start"), async () => {
      await api("/api/start", {
        key: $("template").value,
        randomTemplates: $("randomTemplates").checked,
      });
      notice("Continuous outreach started.");
    });

if ($("stop"))
  $("stop").onclick = async () => {
    try {
      await api("/api/stop", {});
      await refresh();
      notice("Outreach stop requested.");
    } catch (e) {
      notice(e.message);
    }
  };
