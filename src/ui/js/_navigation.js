// Navigation View Routing
function navigate(viewName) {
  const validViews = [
    "dashboard",
    "leads",
    "campaigns",
    "imports",
    "conversations",
    "templates",
    "live-activity",
    "activity",
    "catalog",
    "tracking",
    "suppression",
    "settings",
  ];
  const target = validViews.includes(viewName) ? viewName : "dashboard";

  document.querySelectorAll(".view-page").forEach((el) => {
    el.classList.toggle("active", el.id === `view-${target}`);
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === target);
  });

  if (target === "imports" && state) window.dispatchEvent(new CustomEvent("fc-import-view", { detail: state.activeCampaign }));
  if (target === "conversations" && state) window.dispatchEvent(new Event("fc-conversation-view"));
  if (target === "catalog" && state) void loadCatalog().catch((e) => notice(e.message));
  if (target === "activity" && state) void loadHistory().catch((e) => notice(e.message));
  if (target === "tracking" && state) void loadTracking().catch((e) => notice(e.message));
  if (target === "live-activity") {
    renderLiveActivityView();
  }
}

window.addEventListener("hashchange", () => {
  navigate(location.hash.replace("#", ""));
});

// Ensure mouse click removes focus ring
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    link.blur();
  });
});
