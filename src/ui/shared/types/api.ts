import type {
  AppState,
  Lead,
  Message,
  Catalog,
  HistoryRecord,
  HistorySummary,
  FollowUp,
  TrackingRecord,
} from './domain';
import type { Dictionary, Option } from './utilities';
export interface ActionResult {
  ok?: boolean;
  message?: string;
  connected?: boolean;
  error?: string;
  status?: string;
  note?: string;
  count?: number;
  imported?: number;
  ignored?: boolean;
  duplicate?: boolean;
  changed?: boolean;
  reset?: boolean;
}
export interface LeadsResponse {
  leads: Lead[];
  total: number;
  offset: number;
  pageSize: number;
}
export interface PreviewResponse {
  lead: Lead;
  message: Message;
  warnings: string[];
  signature?: string;
}
export interface HistoryResponse {
  records: HistoryRecord[];
  total: number;
  offset: number;
  pageSize: number;
  summary: HistorySummary;
  options: { mailboxes: Option[]; campaigns: Option[]; templates: string[] };
}
export interface TrackingResponse {
  records: TrackingRecord[];
  total: number;
  summary: Dictionary<number>;
  config: Dictionary<unknown>;
  seeds: Array<{ email: string; id: string; automated: boolean }>;
  monitorEnabled: boolean;
  opensEnabled: boolean;
  seedTests: SeedTest[];
  review: Array<{ id: string; reason: string }>;
  worker: Dictionary<unknown>;
}
export interface SeedTest {
  id: string;
  key: string;
  status: string;
  recipients: string[];
  createdAt: string;
}
export interface DomainCheck {
  state: string;
  records: string[];
  message: string;
  selector: string;
}
export interface DomainReport {
  domain: string;
  checkedAt: string;
  spf: DomainCheck;
  dmarc: DomainCheck;
  dkim: DomainCheck[];
  notes: string[];
}
export type { AppState, Catalog };

export interface BrowserDiscoveryResponse {
  browsers: Array<{ endpoint: string; browser: string }>;
}
export interface HistoryReviewResponse {
  review: FollowUp;
}
export interface SeedPlanResponse {
  testKey: string;
  ids: string[];
}
export interface SourceHistoryResponse {
  roots: number;
  withMessageIds: number;
}
export interface StartThreadResponse {
  rootId: string;
}
