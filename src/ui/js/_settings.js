function renderProfilesTable() {
  const tbody = $("profilesTableBody");
  if (!tbody || !state?.profiles) return;
  const countBadge = $("profilesCountBadge");
  if (countBadge) {
    countBadge.textContent = `${state.profiles.length} Profile${state.profiles.length === 1 ? "" : "s"}`;
  }
  tbody.innerHTML = state.profiles.length
    ? state.profiles
        .map((p) => {
          const isActive = p.id === state.activeProfile;
          const channelName = p.browserChannel === "msedge" ? "Edge" : "Chrome";
          return `<tr>
            <td><strong>${escape(p.name || "Untitled")}</strong></td>
            <td>${escape(p.email)}</td>
            <td><span class="tag-badge">${escape(channelName)}</span><small style="color:var(--text-muted);">${escape(p.provider || "webmail")}</small></td>
            <td style="text-align: center;">
              <span class="status-pill ${isActive ? "ready" : "blocked"}">${isActive ? "Active" : "Inactive"}</span>
            </td>
            <td style="text-align: right;">
              <div class="row-actions">
                ${!isActive ? `<button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-select-profile="${escape(p.id)}" title="Switch active mailbox">Activate</button>` : ""}
                <button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-edit-profile="${escape(p.id)}" title="Edit profile in form">Edit</button>
                <button class="secondary danger-hover" style="font-size: 11px; padding: 4px 8px;" data-delete-profile="${escape(p.id)}" ${state.profiles.length <= 1 ? "disabled" : ""} title="Delete this mailbox profile">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </td>
          </tr>`;
        })
        .join("")
    : '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">No profiles configured.</td></tr>';
}


if ($("connect"))
  $("connect").onclick = () =>
    action($("connect"), async () => {
      const password = $("password").value;
      $("password").value = "";
      const result = await api("/api/connect", { password });
      notice(result.message || (result.connected ? "Mailbox connected successfully." : "Complete sign-in in the browser."));
    });

if ($("disconnect"))
  $("disconnect").onclick = () =>
    action($("disconnect"), () => api("/api/disconnect", {}));

if ($("resume"))
  $("resume").onclick = () => action($("resume"), async () => {
    const result = await api("/api/resume", {});
    notice(result.message || "Mailbox connected.");
  });

function fillBrowserMethod() {
  if ($("cdpSettings")) $("cdpSettings").hidden = $("connectionMode")?.value !== "cdp";
  const guide = state?.browserGuides?.[$("browserChannel")?.value] || state?.browserGuide;
  if ($("browserGuideMessage")) $("browserGuideMessage").textContent = guide?.message || "";
  if ($("browserDebugCommand")) $("browserDebugCommand").textContent = guide?.command || "";
}
if ($("connectionMode")) $("connectionMode").onchange = fillBrowserMethod;
if ($("browserChannel")) $("browserChannel").onchange = fillBrowserMethod;
if ($("discoverBrowsers")) $("discoverBrowsers").onclick = () => action($("discoverBrowsers"), async () => {
  const result = await api("/api/browser-discover", { endpoint: $("cdpEndpoint").value });
  $("availableBrowsers").innerHTML = '<option value="">Select a debugging browser</option>' + result.browsers.map((b) =>
    `<option value="${escape(b.endpoint)}">${escape(b.browser)} — ${escape(b.endpoint)}</option>`).join("");
  notice(result.browsers.length ? "Select a browser, then save the mailbox profile." : "No debugging browser found. Start one using the command below, or use Saved Browser Profile.");
});
if ($("availableBrowsers")) $("availableBrowsers").onchange = () => {
  if ($("availableBrowsers").value) $("cdpEndpoint").value = $("availableBrowsers").value;
};



const pacingFields = [
  "minSeconds",
  "maxSeconds",
  "hourlyCap",
  "dailyCap",
  "pauseEveryMin",
  "pauseEveryMax",
  "pauseMinSeconds",
  "pauseMaxSeconds",
  "pollSeconds",
];

const PACING_PRESETS = {
  warmup: {
    name: "New Mailbox Warmup",
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
    name: "Balanced Human Pace",
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
    name: "Aged / Established Domain",
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
    name: "Stealth Background",
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

function highlightPacingPreset(presetKey) {
  document.querySelectorAll(".pacing-preset-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.preset === presetKey);
  });
}

function detectActivePreset() {
  for (const [key, preset] of Object.entries(PACING_PRESETS)) {
    let matches = true;
    for (const [field, val] of Object.entries(preset)) {
      if (field !== "name") {
        const inputVal = Number($(field)?.value);
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

function applyPacingPreset(presetKey, showNotice = true) {
  const preset = PACING_PRESETS[presetKey];
  if (!preset) return;

  for (const [key, val] of Object.entries(preset)) {
    if (key !== "name" && $(key)) {
      $(key).value = val;
    }
  }

  highlightPacingPreset(presetKey);

  if (showNotice) {
    notice(`Applied "${preset.name}" preset. Click "Save sending settings" to persist.`);
  }
}

function readBusiness() {
  return {
    company: $("businessName")?.value || "",
    senderName: $("senderName")?.value || "",
    legalName: $("legalName")?.value || "",
    address: $("address")?.value || "",
    services: $("services")?.value || "",
  };
}

function fillProfile(explicitProfile) {
  const p =
    explicitProfile ||
    state.profiles.find((p) => p.id === (profileEditId || state.activeProfile));
  profileEditId = p?.id || null;
  if ($("accountName")) $("accountName").value = p?.name || "";
  if ($("accountEmail")) $("accountEmail").value = p?.email || "";
  if ($("accountUrl"))
    $("accountUrl").value =
      p?.url || "https://privateemail.com/spm/mail/INBOX/";
  if ($("provider")) $("provider").value = p?.provider || "privateemail";
  if ($("browserChannel"))
    $("browserChannel").value = p?.browserChannel || "chrome";
  if ($("connectionMode")) $("connectionMode").value = p?.connectionMode || "saved";
  if ($("cdpEndpoint")) $("cdpEndpoint").value = p?.cdpEndpoint || "http://127.0.0.1:9222";
  if ($("autoReconnect")) $("autoReconnect").checked = p?.autoReconnect !== false;
  fillBrowserMethod();

  const b = p?.business || state.settings.business;
  for (const [id, key] of Object.entries({
    businessName: "company",
    senderName: "senderName",
    legalName: "legalName",
    address: "address",
    services: "services",
  })) {
    if ($(id)) $(id).value = b[key] || "";
  }
  updateTemplateLivePreview();
  updateControls();
}

function updateTemplateCheckControls() {
  $("templateCheckOptions").disabled = !$("templateChecksEnabled").checked;
}
if ($("templateChecksEnabled"))
  $("templateChecksEnabled").onchange = updateTemplateCheckControls;

function fillSettings() {
  const s = state.settings;
  const checks = s.templateChecks || {};
  $("templateChecksEnabled").checked = checks.enabled !== false;
  $("promotionalClaimsCheck").value = checks.promotionalClaims || "warn";
  $("messageLengthCheck").value = checks.messageLength || "warn";
  updateTemplateCheckControls();
  for (const key of pacingFields) {
    if ($(key)) $(key).value = s.pacing[key];
  }
  for (const key of ["requireActive", "requireNoOutOfService", "allowHidden"]) {
    if ($(key)) $(key).checked = s.eligibility[key];
  }
  if ($("readyStatuses")) {
    $("readyStatuses").value = s.eligibility.readyStatuses
      .map((v) => v || "blank")
      .join(", ");
  }
  if ($("sentStatus")) $("sentStatus").value = s.eligibility.sentStatus;
  if ($("teamEnabled")) $("teamEnabled").checked = s.team.enabled;
  if ($("teamUrl")) $("teamUrl").value = s.team.url;
  if ($("workerName")) $("workerName").value = s.team.workerName;
  if ($("firebaseSyncMode")) {
    $("firebaseSyncMode").value = s.tracking?.syncMode || "auto";
  }
  detectActivePreset();
}


if ($("saveProfile"))
  $("saveProfile").onclick = () =>
    action($("saveProfile"), async () => {
      await api("/api/profile", {
        id: profileEditId,
        name: $("accountName").value,
        email: $("accountEmail").value,
        url: $("accountUrl").value,
        provider: $("provider").value,
        browserChannel: $("browserChannel").value,
        connectionMode: $("connectionMode").value,
        cdpEndpoint: $("cdpEndpoint").value,
        autoReconnect: $("autoReconnect").checked,
        business: readBusiness(),
      });
      await refresh();
      fillProfile();
      notice("Profile saved.");
    });

if ($("newProfile"))
  $("newProfile").onclick = () => {
    profileEditId = null;
    if ($("accountName")) {
      $("accountName").value = "";
      $("accountName").focus();
    }
    if ($("accountEmail")) $("accountEmail").value = "";
    if ($("password")) $("password").value = "";
    if ($("senderName")) $("senderName").value = "";
    updateControls();
    notice("Enter the new profile details, then save.");
  };

if ($("newProfileBtn"))
  $("newProfileBtn").onclick = () => {
    if ($("newProfile")) $("newProfile").click();
    $("profileSetupTitle")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  };

if ($("deleteCurrentProfile"))
  $("deleteCurrentProfile").onclick = () => {
    if (!profileEditId) return;
    const p = state.profiles.find((p) => p.id === profileEditId);
    if (
      !confirm(
        `Are you sure you want to delete mailbox profile "${p?.name || p?.email}"?`,
      )
    )
      return;
    action($("deleteCurrentProfile"), async () => {
      await api("/api/delete-profile", { id: profileEditId });
      profileEditId = null;
      await refresh();
      fillProfile();
      notice("Mailbox profile deleted.");
    });
  };

if ($("profilesTableBody")) {
  $("profilesTableBody").onclick = (e) => {
    const selBtn = e.target.closest("[data-select-profile]");
    if (selBtn) {
      action(selBtn, async () => {
        await api("/api/select-profile", { id: selBtn.dataset.selectProfile });
        await refresh();
        fillProfile();
        notice("Mailbox profile activated.");
      });
      return;
    }
    const editBtn = e.target.closest("[data-edit-profile]");
    if (editBtn) {
      const p = state.profiles.find((x) => x.id === editBtn.dataset.editProfile);
      if (p) {
        fillProfile(p);
        $("profileSetupTitle")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
        $("accountName")?.focus();
      }
      return;
    }
    const delBtn = e.target.closest("[data-delete-profile]");
    if (delBtn) {
      const p = state.profiles.find(
        (x) => x.id === delBtn.dataset.deleteProfile,
      );
      if (
        !confirm(
          `Are you sure you want to delete mailbox profile "${p?.name || p?.email}"?`,
        )
      )
        return;
      action(delBtn, async () => {
        await api("/api/delete-profile", { id: delBtn.dataset.deleteProfile });
        if (profileEditId === delBtn.dataset.deleteProfile) profileEditId = null;
        await refresh();
        fillProfile();
        notice("Mailbox profile deleted.");
      });
      return;
    }
  };
}

if ($("profileSelect"))
  $("profileSelect").onchange = () =>
    action($("connect"), async () => {
      await api("/api/select-profile", { id: $("profileSelect").value });
      await refresh();
      fillProfile();
      if ($("password")) $("password").value = "";
    });


if ($("saveSettings"))
  $("saveSettings").onclick = () =>
    action($("saveSettings"), async () => {
      const s = structuredClone(state.settings);
      s.templateChecks = {
        enabled: $("templateChecksEnabled").checked,
        promotionalClaims: $("promotionalClaimsCheck").value,
        messageLength: $("messageLengthCheck").value,
      };
      s.business = readBusiness();
      for (const key of pacingFields) s.pacing[key] = Number($(key).value);
      for (const key of [
        "requireActive",
        "requireNoOutOfService",
        "allowHidden",
      ])
        s.eligibility[key] = $(key).checked;
      s.eligibility.readyStatuses = $("readyStatuses")
        .value.split(",")
        .map((v) => (v.trim() === "blank" ? "" : v.trim()));
      s.eligibility.sentStatus = $("sentStatus").value;
      s.team = {
        enabled: $("teamEnabled").checked,
        url: $("teamUrl").value,
        workerName: $("workerName").value,
      };
      s.tracking = {
        syncMode: $("firebaseSyncMode")?.value || "auto",
      };
      const token = $("teamToken").value;
      $("teamToken").value = "";
      await api("/api/settings", { settings: s, teamToken: token });
      notice("Sending settings saved.");
    });

if ($("resetWait"))
  $("resetWait").onclick = () =>
    action($("resetWait"), async () => {
      const result = await api("/api/reset-wait", {});
      liveCountdownTotal = null;
      await refresh();
      notice(result.job.nextAt
        ? `${result.message} Next check: ${new Date(result.job.nextAt).toLocaleString()}.`
        : result.message);
    });

if ($("settingsFirebaseSyncBtn"))
  $("settingsFirebaseSyncBtn").onclick = () =>
    action($("settingsFirebaseSyncBtn"), async () => {
      try {
        const res = await api("/api/tracking/sync-firebase", {});
        if (res.synced > 0) {
          notice(`Firebase: Synced ${res.synced} new open signal(s)!`, "success");
        } else if (res.ok) {
          notice("Firebase: Open signals are up to date.", "info");
        } else {
          notice(`Firebase: ${res.message || res.error || "Not configured"}`, "warn");
        }
      } catch (err) {
        notice(`Firebase sync failed: ${err.message}`, "error");
      }
      await refresh();
    });

if ($("firebaseSyncMode"))
  $("firebaseSyncMode").onchange = () => {
    const isManual = $("firebaseSyncMode").value === "manual";
    if ($("firebaseSyncModeHint")) {
      $("firebaseSyncModeHint").textContent = isManual
        ? "In manual mode, background polling is paused. You can sync opens anytime by clicking 'Sync Firebase'."
        : "In automatic mode, open signals from recipients are fetched seamlessly in the background while the app is running.";
    }
  };

// Pacing presets click and input listeners
const presetsGrid = $("pacingPresetsGrid");
if (presetsGrid) {
  presetsGrid.onclick = (e) => {
    const card = e.target.closest(".pacing-preset-card");
    if (card && card.dataset.preset) {
      applyPacingPreset(card.dataset.preset, true);
    }
  };
}

for (const key of pacingFields) {
  if ($(key)) {
    $(key).addEventListener("input", detectActivePreset);
  }
}
