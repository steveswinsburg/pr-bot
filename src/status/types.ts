export type CheckDisplay = "ok" | "fail" | "pending" | "neutral";

export interface CheckItem {
  name: string;
  display: CheckDisplay;
}

export interface StatusSnapshot {
  pullNumber: number;
  draft: boolean;
  mergeable: boolean | null;
  /** REST `mergeable_state` when present. */
  mergeState: string | null;
  baseRef: string;
  behindBy: number | null;
  checks: CheckItem[];
  approvingReviewCount: number;
  changesRequested: boolean;
}
