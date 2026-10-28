// Initial boot
navigate(location.hash.replace("#", ""));
await refresh();
await loadLeads();
await loadHistory();
if (location.hash === "#catalog") await loadCatalog();
if (location.hash === "#tracking") await loadTracking();

// Background polling loop
setInterval(async () => {
  try {
    const previous = state.job.current;
    const previousAttempts = state.attemptCount;
    await refresh();
    if (state.job.current !== previous) await loadLeads();
    if (state.attemptCount !== previousAttempts || (location.hash === "#activity" && Date.now() - lastHistoryRefresh > 15000)) await loadHistory();
  } catch (e) {
    notice("Connection to the local tool was lost. Restart it to continue.");
  }
}, 1500);
