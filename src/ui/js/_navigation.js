// Navigation View Routing
function navigate(viewName) {
  const validViews = [
    "dashboard",
    "leads",
    "campaigns",
    "templates",
    "live-activity",
    "activity",
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

  if (target === "tracking" && state) void loadTracking().catch((e) => notice(e.message));
  if (target === "live-activity") {
    renderLiveActivityView();
  }
}

window.addEventListener("hashchange", () => {
  navigate(location.hash.replace("#", ""));
});
