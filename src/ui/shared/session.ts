import type { AppState, Lead, HistoryRecord, ActivityEvent } from './types/domain';
class UISession {
  reset() {
    Reflect.deleteProperty(this, 'state');
    Object.assign(this, new UISession());
  }
  historyOffset = 0;
  historyRecords: HistoryRecord[] = [];
  state!: AppState;
  rows = [] as Lead[];
  offset = 0;
  total = 0;
  previewId = null as string | null;
  selected = new Set<string>();
  pending = false;
  configLoaded = false;
  profileEditId = null as string | null;
  livePaused = false;
  liveViewMode = 'visual';
  liveFilterKind = 'all';
  liveSearchQuery = '';
  liveAutoScroll = true;
  liveEventsList = [] as ActivityEvent[];
  liveCountdownTotal = null as number | null;
  lastHistoryRefresh = 0;
}
export const session = new UISession();
