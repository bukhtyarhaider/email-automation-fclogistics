import type { Dictionary, JsonValue } from './utilities';
export interface Business {
  company: string;
  senderName: string;
  legalName: string;
  address: string;
  services: string;
}
export interface Profile {
  id: string;
  name: string;
  email: string;
  url: string;
  provider: string;
  browserChannel: string;
  connectionMode: string;
  cdpEndpoint: string;
  autoReconnect: boolean;
  business: Business;
}
export interface Workbook {
  name: string;
  path?: string;
}
export interface Sheet {
  name: string;
  hidden: boolean;
  headers: Dictionary<string>;
  count?: number;
}
export interface Campaign {
  id: string;
  name: string;
  enabled: boolean;
  sheets: string[];
  mapping: Dictionary<JsonValue>;
  workbook?: Workbook;
  templateKeys?: string[];
}
export interface Template {
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
  weight: number;
  required?: string[];
  requiredFields: string[];
}
export interface Pacing {
  minSeconds: number;
  maxSeconds: number;
  hourlyCap: number;
  dailyCap: number;
  pauseEveryMin: number;
  pauseEveryMax: number;
  pauseMinSeconds: number;
  pauseMaxSeconds: number;
  pollSeconds: number;
}
export interface Settings {
  pacing: Pacing;
  eligibility: {
    requireActive: boolean;
    requireNoOutOfService: boolean;
    allowHidden: boolean;
    readyStatuses: string[];
    sentStatus: string;
  };
  account?: { email: string };
  business: Business;
  team: { enabled: boolean; url: string; workerName: string };
  templateChecks: { enabled: boolean; promotionalClaims: string; messageLength: string };
  tracking: { pcId: string; publicUrl: string; syncMode: string; firebaseBackend: string };
}
export interface Job {
  enabled: boolean;
  status: string;
  message: string;
  current: number;
  total: number;
  nextAt: string;
  sincePause: number;
  pauseAfter: number;
}
export interface ActivityEvent {
  at: string;
  kind: string;
  message: string;
  seconds?: number;
  company?: string;
  email?: string;
}
export interface Message {
  to: string;
  subject: string;
  body: string;
  key?: string;
}
export interface Lead {
  id: string;
  email: string;
  company: string;
  sheet: string;
  row: number;
  status: string;
  blocked: string;
  fields: Dictionary<string>;
  reason?: string;
  reasons?: string[];
  hidden?: boolean;
  emailCell: string;
  statusCell: string;
  lastAttempt?: {
    status: string;
    at: string;
    accountEmail: string;
    subject: string;
    evidence: string;
    error: string;
  };
  carrier?: {
    id: string;
    dot: string;
    mc: string;
    identityStatus: string;
    reasons: string[];
    carrierId: string;
    provenance: {
      sheet: string;
      row: number;
      sourceLabel: string;
      acquiredAt: string;
      permission: string;
    };
  };
}
export interface Attempt {
  status: string;
  syncNeeded?: boolean;
  teamSyncNeeded?: boolean;
  at?: string;
}
import type { FirebaseDiagnostics } from './firebase';
export interface AppState {
  version: number;
  appVersion: string;
  previewMode: boolean;
  workbook?: Workbook;
  sheets: Sheet[];
  counts: Dictionary<number>;
  templates: Dictionary<Template>;
  settings: Settings;
  profiles: Profile[];
  activeProfile: string;
  campaigns: Campaign[];
  activeCampaign: string;
  workerId: string;
  firebaseSync: FirebaseDiagnostics;
  connected: boolean;
  signInOpen: boolean;
  busy: boolean;
  job: Job;
  automation?: { enabled: boolean };
  prepared: { message: Message; signature: string } | null;
  suppression: Dictionary<string>;
  attemptCount: number;
  attempts: Dictionary<Attempt>;
  events: ActivityEvent[];
  remaining: number;
  dayRemaining: number;
  teamConnected: boolean;
  browserSession?: { message: string };
  browserGuide: BrowserGuide;
  browserGuides: Dictionary<BrowserGuide>;
}
export interface BrowserGuide {
  message: string;
  command: string;
}
export interface FollowUp {
  status: string;
  note: string;
  reviewedAt: string;
}
export interface HistoryRecord {
  to: string;
  at: string;
  confirmedAt: string;
  accountEmail: string;
  campaignName: string;
  templateName: string;
  subject: string;
  body: string;
  signature: string;
  status: string;
  confirmedSent: boolean;
  replyStatus: string;
  trackingId: string;
  sendStatus: string;
  evidence: string;
  firstOpenAt: string;
  lastOpenAt: string;
  opensCount: number;
  trackingEnabled: boolean;
  firstSeenDelayMs: number | null;
  timingExcluded: boolean;
  bounceStatus: string;
  bounceReason: string;
  opens: Array<{ at: string }>;
  followUp: FollowUp;
}
export interface HistorySummary {
  attempts: number;
  sent: number;
  uncertain: number;
  sentSeen: number;
  noSignal: number;
  seenRate: number | null;
  averageFirstSeenMs: number | null;
  medianFirstSeenMs: number | null;
  fastestFirstSeenMs: number | null;
  timingSamples: number;
  fastestRecipient: string;
  trackedSent: number;
  untrackedSent: number;
  trackedSeenRate: number | null;
  replied: number;
  noReply: number;
  unreviewed: number;
  timingExcluded: number;
  bounced: number;
}
export interface CatalogEntry {
  id: string;
  kind: string;
  version: string;
  date: string;
  title: string;
  changes: string[];
  evidence?: string;
}
export interface Catalog {
  installedVersion: string;
  packageVersions: number;
  milestones: number;
  notes: CatalogEntry[];
  releases: CatalogEntry[];
  upgradeSteps: string[];
}
export interface TrackingRecord {
  id: string;
  recipient: string;
  subject: string;
  campaignId: string;
  sendStatus: string;
  deliveryStatus: string;
  bounceStatus: string;
  bounceReason: string;
  attemptedAt: string;
  createdAt: string;
  confirmedAt: string;
  firstOpenAt: string;
  lastOpenAt: string;
  opensCount: number;
  opens: Array<{ at: string }>;
  placement: { status: string; evidence?: string; checkedAt?: string };
  [key: string]: unknown;
  events: Array<{
    type: string;
    at: string;
    detail: string;
    status: string;
    messageId: string;
    signal: string;
    diagnostic: string;
    evidence: string;
  }>;
  bounceEvidence: Array<{ at: string; reason: string; source: string }>;
  sentEvidence: Array<{ at: string; messageId: string; folder: string }>;
  messageIds: string[];
  seedId: string;
  seedKey: string;
  placementCheckedAt: string;
  sender: string;
  opensEnabled: boolean;
}
