import { resolveView, isTrackingSection } from './routes';
import { uiScope } from '../shared/lifecycle';
import { errorMessage } from '../shared/utils';
import { session } from '../shared/session';
import { loadCatalog } from '../features/catalog/controller';
import { notice } from '../shared/runtime';
import { loadHistory } from '../features/history/controller';
import { loadTracking } from '../features/tracking/controller';
import { renderLiveActivityView } from '../features/live-activity/controller';
/** Hash anchors within Tracking are sections of that workspace, not unknown pages. */
export function revealTrackingSection(value: string) {
  if (isTrackingSection(value) && location.hash === `#${value}`) {
    document.getElementById(value)?.scrollIntoView({ block: 'start' });
  }
}

// Navigation View Routing
export function navigate(viewName: string) {
  const target = resolveView(viewName);

  document.body.classList.toggle('mailroom-active', target === 'conversations');
  document.querySelectorAll<HTMLElement>('.view-page').forEach((el) => {
    el.classList.toggle('active', el.id === `view-${target}`);
  });
  document.querySelectorAll<HTMLElement>('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === target);
  });
  if (target === 'imports' && session.state)
    window.dispatchEvent(
      new CustomEvent('fc-import-view', { detail: session.state.activeCampaign }),
    );
  if (target === 'conversations' && session.state)
    window.dispatchEvent(new Event('fc-conversation-view'));
  if (target === 'catalog' && session.state)
    void loadCatalog().catch((e) => notice(errorMessage(e)));
  if (target === 'activity' && session.state)
    void loadHistory().catch((e) => notice(errorMessage(e)));
  if (target === 'tracking' && session.state)
    void loadTracking()
      .then(() => revealTrackingSection(viewName))
      .catch((e) => notice(errorMessage(e)));
  revealTrackingSection(viewName);
  if (target === 'live-activity') {
    renderLiveActivityView();
  }
}

export function mountNavigation() {
  uiScope.listen(window, 'hashchange', () => {
    navigate(location.hash.replace('#', ''));
  });
  // Ensure mouse click removes focus ring
  document.querySelectorAll<HTMLElement>('.nav-link').forEach((link) => {
    if (!link.getAttribute('aria-label')) link.setAttribute('aria-label', link.textContent.trim());
    link.title = link.getAttribute('aria-label') || '';
    uiScope.listen(link, 'click', () => {
      link.blur();
    });
  });
}
