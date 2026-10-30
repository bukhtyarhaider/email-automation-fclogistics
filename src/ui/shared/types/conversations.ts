import type { Dictionary } from './utilities';
export interface ConversationSelection {
  id: string;
  type: string;
}
export interface ReplyTemplate {
  id: string;
  name: string;
  category: string;
  body: string;
  version: number;
  active: boolean;
  previousVersions?: ReplyTemplate[];
}
export interface ReplyDraft {
  id: string;
  body: string;
  status: string;
  version: number;
  templateId: string;
  createdAt: string;
  approvalNote: string;
  reportNote: string;
  previousVersions?: ReplyDraft[];
}
export interface LocalReplyDraft {
  body: string;
  id: string | null;
  version?: number;
  contextVersion?: string;
  templateId: string;
  requestId: string;
  dirty: boolean;
}
export interface ReplyLibrary {
  templates: ReplyTemplate[];
  preferences: { followUpDays: number; maxFollowUps: number };
  variables: string[];
}
export interface WordingPreview {
  rootId: string;
  contextVersion: string;
  templateId: string;
  templateVersion: number;
  name: string;
  body: string;
}
export interface CarrierCandidate {
  value: string;
  messageId: string;
  confidence: string;
  excerpt: string;
  from: string;
}
export interface CarrierField {
  confirmed?: { value: string; confirmedAt: string };
  conflict: boolean;
  staleConfirmation: boolean;
  candidates: CarrierCandidate[];
}
export interface AssistantContext {
  version: string;
  account: string;
  replyTo: string;
  subject: string;
  intent: { intent: string; sentiment: string; reason: string; confidence: string };
  fields: Dictionary<CarrierField>;
  draft: ReplyDraft;
  draftCurrent: boolean;
  hold: string;
  pendingReviewCount: number;
  needsReply: boolean;
  noReply: boolean;
  followUpReady: boolean;
  dueAt: string;
  unread: boolean;
  sentCopyMatches: unknown[];
  draftHistory: ReplyDraft[];
  latestInboundId: string;
  lastMessageId: string;
  mailboxUrl: string;
}
export interface ReplyMessage {
  id: string;
  direction: string;
  senderName: string;
  from: string[];
  to: string[];
  date: string;
  capturedAt: string;
  category: string;
  classificationSource: string;
  match: string;
  bodyUnavailable: boolean;
  text: string;
  account: string;
  messageId: string;
  references: string[];
  source: { type: string; folder?: string; uid: number };
  kind: string;
  subject: string;
  reviewVersion: string;
  rootId: string;
  reviewNote: string;
  matchReason: string;
  ignored: boolean;
  reason: string;
  suggestion: { reason: string };
  textTruncated: boolean;
}
export interface ConversationRoot {
  id: string;
  account: string;
  recipient: string;
  company: string;
  subject: string;
  sentAt: string;
  body: string;
  bodyUnavailable: boolean;
  source: string;
  carrierId: string;
  demo: boolean;
  campaignName: string;
  bodyTruncated: boolean;
}
export interface CarrierHistory {
  carrierInboxId: string;
  messages: ReplyMessage[];
  roots: ConversationRoot[];
  latestInboundId: string;
  unread: boolean;
  carrierStatus: string;
  recipient: string;
  newSinceStatus: boolean;
  reviewRequired: boolean;
  followUpAt: string;
  note: string;
  statusVersion: string;
  latestHistoryId: string;
}
export interface ConversationDetail {
  root: ConversationRoot;
  assistant: AssistantContext;
  messages: ReplyMessage[];
  templates: ReplyTemplate[];
  carrierHistory: CarrierHistory;
  candidates: ConversationRoot[];
  type: string;
  mode: string;
}
export interface CaptureMailbox {
  id: string;
  email?: string;
  host?: string;
  user?: string;
  port?: number;
  inboxFolder?: string;
  sentFolder?: string;
  passwordEnv?: string;
  accessTokenEnv?: string;
  provider?: string;
  authMode?: string;
}
export interface SetupCandidate extends CaptureMailbox {
  name: string;
  email: string;
  credentialsConfigured: boolean;
}
export interface CaptureConfiguration {
  enabled: boolean;
  auto: boolean;
  since: string;
  batch: number;
  pages: number;
  allHistory: boolean;
  allFolders: boolean;
  mailboxes: CaptureMailbox[];
}
export interface CaptureStatus {
  enabled: boolean;
  running: boolean;
  auto: boolean;
  canScan: boolean;
  note: string;
  configurationSource: string;
  protectionHealth: string;
  configurationError: string;
  captureError?: { message: string };
  since: string;
  allFolders: boolean;
  scan: CaptureScan;
  historyScan: CaptureScan;
  progress: { at: string };
  setupCandidates: SetupCandidate[];
  configuration: CaptureConfiguration;
  sharedProtection: { enabled: boolean; pending: number };
  mailboxes: CaptureMailboxStatus[];
  monitor: Dictionary<CaptureMonitor>;
  coverage: string;
  [key: string]: unknown;
}
export interface CaptureMonitor {
  status: string;
  message: string;
  error: string;
  checkedAt: string;
  folders: Array<{
    folder: string;
    status: string;
    fetched: number;
    examined: number;
    cursor: string;
    error: string;
    complete: boolean;
  }>;
  [key: string]: unknown;
}
export interface ConversationRow extends ConversationSelection {
  recipient: string;
  contactName: string;
  company: string;
  lastReplyAt: string;
  at: string;
  subject: string;
  excerpt: string;
  needsReply: boolean;
  noReply: boolean;
  unread: boolean;
  intent: { intent: string };
  carrierStatus: string;
  followUpAt: string;
  account: string;
  category: string;
  mode: string;
  replyCount: number;
  latestInboundId: string;
  statusVersion: string;
  carrierInboxId: string;
  draftStatus: string;
  sentAt: string;
  match: string;
  repliedElsewhere: boolean;
  classificationSource: string;
  responded: boolean;
  firstReplyAt: string;
  reason: string;
  paused: boolean;
  count: number;
  latestHistoryId: string;
  sourceMessageId: string;
}
export interface ConversationReport {
  rows: ConversationRow[];
  summary: Dictionary<number>;
  group: string;
  total: number;
  capture: CaptureStatus;
  mailboxes: Array<{ id: string; email: string; account: string; name: string }>;
  protection: { active: number; pending: number; [key: string]: unknown };
  mode: string;
  coverage: { rootsWithMessageIds: number; roots: number };
  options: { mailboxes: string[] };
  offset: number;
  accounts: Array<{ email: string; demo: boolean }>;
  note: string;
  protectionNote: string;
}
export interface CarrierStatusDraft {
  expectedVersion: string;
  stage: string;
  note: string;
  followUpAt: string;
}
export interface ReviewDraft {
  category: string;
  note: string;
  rootId: string;
  confirm: boolean;
  version?: string;
}
export interface DashboardReport {
  summary: Dictionary<number>;
  highlights: ConversationRow[];
  rows: ConversationRow[];
  capture: CaptureStatus;
  [key: string]: unknown;
}
export type ReplyTemplateForm = Pick<ReplyTemplate, 'name' | 'body' | 'category' | 'active'> &
  Partial<Pick<ReplyTemplate, 'id' | 'version'>>;
export interface CaptureFolderStatus {
  folder: string;
  processed: number;
  error: string;
  more: boolean;
  lastUid: number;
}
export interface CaptureMailboxStatus extends CaptureMailbox {
  status: string;
  credentialsConfigured: boolean;
  checkedAt: string;
  nextAt: string;
  message: string;
  folders: CaptureFolderStatus[];
}
export interface CaptureScan {
  status: string;
  currentFolder: string;
  currentMailbox: string;
  scanned: number;
  at: string;
}
