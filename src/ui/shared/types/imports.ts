import type { Dictionary } from './utilities';
export type ImportMapping = Dictionary<Dictionary<string>>;
export interface ImportSummary {
  rows: number;
  flaggedRows: number;
  missingStatusSheets: number;
  invalidEmailRows: number;
  duplicateEmailRows: number;
  [key: string]: number;
}
export interface ImportSheet {
  name: string;
  rows: number;
  flaggedRows: number;
  missingStatus: boolean;
  emailColumn: string;
  statusColumn: string;
  hidden: boolean;
  headers: Dictionary<string>;
  review: {
    emailColumns: Dictionary<number>;
    unusedStatusColumn: string;
    samples: Array<{ row: number; issue: string; cells: Dictionary<string> }>;
  };
}
export interface ImportReport {
  mode: string;
  previewId: string;
  campaignId: string;
  mapping: ImportMapping;
  summary: ImportSummary;
  basis: string;
  sheets: ImportSheet[];
  identitySummary: {
    sourceDotCarriers: number;
    provisionalRows: number;
    conflictRows: number;
    layoutRows: number;
  };
}
export interface ImportRevision {
  id: string;
  createdAt: string;
  at: string;
  summary: ImportSummary;
  source: string;
  version: number;
  revisionId: string;
  importedAt: string;
  sourceLabel: string;
  mapping: ImportMapping;
  addStatusColumns: Dictionary<string>;
  acquiredAt: string;
  permission: string;
}
export interface ImportRow {
  id: string;
  email: string;
  company: string;
  sheet: string;
  row: number;
  status: string;
  fields: Dictionary<string>;
  issues: string[];
  provenance: Dictionary<string>;
  identity: { dot: string; mc: string; kind: string; conflicts: string[] };
  [key: string]: unknown;
  protection: string[];
}
export interface ImportWorkspace {
  activeRevision: string;
  activationToken: string;
  total: number;
  rows: ImportRow[];
  revisions: ImportRevision[];
  activations: Array<{ kind: string; at: string }>;
  campaignId: string;
  source: string;
  recovery: string;
  [key: string]: unknown;
  identitySummary: {
    carriers: number;
    sourceDotCarriers: number;
    provisionalRows: number;
    conflictRows: number;
    layoutRows: number;
    protectedRows: number;
  };
  records: ImportRow[];
  offset: number;
}
