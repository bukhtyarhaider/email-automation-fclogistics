function updateControls() {
  if (!state) return;
  const prep = $("prepare");
  if (prep)
    prep.disabled =
      pending ||
      state.busy ||
      !state.connected ||
      !previewId ||
      !state.templates[$("template").value] ||
      !!state.prepared ||
      state.job.enabled ||
      rows.find((x) => x.id === previewId)?.blocked;

  const sendOneBtn = $("sendOne");
  if (sendOneBtn)
    sendOneBtn.disabled =
      pending ||
      state.busy ||
      !state.prepared ||
      !state.connected ||
      !!state.attempts[state.prepared?.message.to];

  const rel = $("release");
  if (rel) rel.disabled = pending || state.busy || !state.connected;

  const batchBtn = $("batch");
  if (batchBtn)
    batchBtn.disabled =
      pending ||
      state.busy ||
      !state.connected ||
      state.job.enabled ||
      !selected.size ||
      !!state.prepared;

  const stopBtn = $("stop");
  if (stopBtn) stopBtn.hidden = !state.job.enabled;

  const resetWait = $("resetWait");
  if (resetWait)
    resetWait.disabled = pending || state.busy || !!state.prepared ||
      !(state.job.nextAt || state.job.sincePause || state.job.pauseAfter);

  const startBtn = $("start");
  if (startBtn)
    startBtn.disabled =
      pending ||
      state.busy ||
      state.job.enabled ||
      !!state.prepared ||
      !state.campaigns.some((c) => c.enabled);

  const saveProf = $("saveProfile");
  if (saveProf) saveProf.disabled = pending || state.busy || state.job.enabled;

  const newProf = $("newProfile");
  if (newProf) newProf.disabled = pending || state.busy || state.job.enabled;

  const relBtn = $("reload");
  if (relBtn) relBtn.disabled = pending || state.busy || !!state.prepared;

  const connBtn = $("connect");
  if (connBtn) connBtn.disabled = pending || state.busy || state.connected || state.signInOpen || !!state.prepared;

  const resBtn = $("resume");
  if (resBtn) {
    resBtn.hidden = state.connected || !state.signInOpen;
    resBtn.disabled = pending || state.busy;
  }

  const disBtn = $("disconnect");
  if (disBtn) {
    disBtn.disabled = pending || state.busy;
    disBtn.hidden = !state.connected && !state.signInOpen;
  }

  const selCount = $("selectedCount");
  if (selCount) selCount.textContent = `${selected.size} selected`;

  const delSelLeads = $("deleteSelectedLeads");
  if (delSelLeads) {
    delSelLeads.disabled =
      pending || state.busy || state.job.enabled || !selected.size;
    delSelLeads.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete selected${selected.size ? ` (${selected.size})` : ""}`;
  }

  const delWs = $("deleteWorkspace");
  if (delWs) {
    delWs.disabled =
      pending || state.busy || state.job.enabled || !state.activeCampaign;
  }

  const delCamp = $("deleteCampaignBtn");
  if (delCamp) {
    delCamp.disabled =
      pending || state.busy || state.job.enabled || !state.activeCampaign;
  }

  const delCurProf = $("deleteCurrentProfile");
  if (delCurProf) {
    delCurProf.style.display =
      profileEditId && state.profiles.length > 1 ? "inline-flex" : "none";
    delCurProf.disabled = pending || state.busy || state.job.enabled;
  }

  const delTmpl = $("deleteTemplate");
  if (delTmpl) {
    delTmpl.disabled =
      pending || state.busy || !state.templates[$("template")?.value];
  }
}
