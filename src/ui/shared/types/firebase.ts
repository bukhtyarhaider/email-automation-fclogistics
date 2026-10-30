export interface SyncCounters {
  scanned: number;
  matched: number;
  synced: number;
  alreadyApplied: number;
  acknowledged: number;
  otherPc: number;
  unmatched: number;
  invalid: number;
  pcMismatches: number;
}
export interface SyncBackend extends SyncCounters {
  error: string;
  complete: boolean;
  sweep?: SyncCounters;
}
export interface FirebaseDiagnostics {
  running: boolean;
  status: string;
  warnings: string[];
  message: string;
  pcId: string;
  pcIdSource: string;
  hostname: string;
  platform: string;
  workerId: string;
  dataDirectory: string;
  mode: string;
  pollSeconds: number;
  backend: string;
  projectId: string;
  databaseURL: string;
  databaseUrlSource: string;
  credentialsSource: string;
  configured: boolean;
  collection: string;
  publicUrl: string;
  publicUrlSource: string;
  openTrackingEnabled: boolean;
  consent: boolean;
  localRecords: number;
  localTokens: number;
  lastAttemptAt: string | null;
  lastSyncAt: string | null;
  totalSynced: number;
  pageSize: number;
  maxPages: number;
  lastError: string;
  backends: Record<string, SyncBackend>;
}
