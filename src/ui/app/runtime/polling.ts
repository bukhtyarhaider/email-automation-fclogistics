import { uiScope } from '../../shared/lifecycle';
import { session } from '../../shared/session';
import { navigate } from '../navigation';
import { refresh } from './refresh';
import { loadLeads } from '../../features/leads/controller';
import { loadHistory } from '../../features/history/controller';
import { loadCatalog } from '../../features/catalog/controller';
import { loadTracking } from '../../features/tracking/controller';
import { notice } from '../../shared/runtime';

export async function mountBoot() {
  // Initial boot
  navigate(location.hash.replace('#', ''));
  await refresh();
  await loadLeads();
  await loadHistory();
  if (location.hash === '#catalog') await loadCatalog();
  if (location.hash === '#tracking') await loadTracking();
  // Background polling loop
  uiScope.interval(async () => {
    try {
      const previous = session.state.job.current;
      const previousAttempts = session.state.attemptCount;
      await refresh();
      if (session.state.job.current !== previous) await loadLeads();
      if (
        session.state.attemptCount !== previousAttempts ||
        (location.hash === '#activity' && Date.now() - session.lastHistoryRefresh > 15000)
      )
        await loadHistory();
    } catch (e) {
      notice('Connection to the local tool was lost. Restart it to continue.');
    }
  }, 1500);
}
