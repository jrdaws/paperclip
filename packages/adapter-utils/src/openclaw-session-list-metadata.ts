/**
 * Optional metadata for OpenClaw (or other) session-picker UIs.
 * Session routing continues to use the stable `sessionKey`; display fields are presentation-only.
 *
 * @see workspace/projects/paperclip/doc/plans/2026-04-20-openclaw-session-list-display-metadata.md
 */
export type OpenClawSessionListSource =
  | "paperclip_issue"
  | "paperclip_agent"
  | "openclaw_web"
  | "subagent"
  | "unknown";

export interface OpenClawSessionListMetadata {
  /** Stable routing key (e.g. paperclip:issue:…, paperclip:agent:…). */
  sessionKey: string;
  /** Primary list label; must not be required for correctness. */
  displayLabel?: string | null;
  /** Secondary line (e.g. agent name, company, truncated id). */
  displaySubtitle?: string | null;
  /** Last user/assistant text preview, truncated by producer. */
  preview?: string | null;
  /** ISO 8601 last activity on the session. */
  lastActivityAt?: string | null;
  source?: OpenClawSessionListSource;
  issueId?: string | null;
  issueTitle?: string | null;
  agentId?: string | null;
  paperclipCompanyId?: string | null;
}
