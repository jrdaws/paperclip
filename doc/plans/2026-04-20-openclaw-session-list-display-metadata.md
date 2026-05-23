# Plan: OpenClaw session list — display metadata (no raw keys as primary label)

**Status:** draft spec (Paperclip + OpenClaw)  
**Date:** 2026-04-20

## Problem

OpenClaw’s session picker shows **raw `sessionKey` strings**. With Paperclip **`sessionKeyStrategy: issue`**, keys look like `paperclip:issue:<uuid>` and are indistinguishable. Operators cannot quickly pick the thread for follow-ups.

## Product direction

1. **Stable key unchanged** — `sessionKey` remains the source of truth for routing, compaction, and Paperclip adapter `resolveSessionKey`.
2. **Presentation layer** — Each row in the session list uses:
   - **Primary:** `displayLabel` (human title).
   - **Secondary:** `displaySubtitle` (agent, company, or short id).
   - **Tertiary:** `preview` (last message snippet), `lastActivityAt` (relative time).
3. **Resolution rules (Paperclip-backed keys):**
   - Prefix `paperclip:issue:` → resolve issue id via Paperclip API → use **issue title** as `displayLabel`; set `source: paperclip_issue`.
   - Prefix `paperclip:agent:` → use **agent display name** from Paperclip when `agentId` matches suffix; else show shortened key; `source: paperclip_agent`.
4. **Search / filter** — Client-side or gateway index over `displayLabel`, `issueTitle`, `sessionKey` suffix.

## Contract

TypeScript: `@paperclipai/adapter-utils` exports `OpenClawSessionListMetadata` (`openclaw-session-list-metadata.ts`). Gateway or session-store API may embed the same shape under `metadata` on list endpoints.

## OpenClaw implementation sketch (out of repo)

- Extend session list RPC / REST to return `metadata?: OpenClawSessionListMetadata` per row.
- Populate `displayLabel` at **session touch** (first message, issue-bound wake) or **lazy-resolve** on list (with short TTL cache).
- Web UI: render `displayLabel` bold; show `sessionKey` in tooltip or “details” only.

## Paperclip implementation sketch

- Optional internal route: `GET /internal/openclaw/session-labels?keys=…` (board/service auth) returning map `sessionKey → metadata` for batch resolution.
- Adapter wake path already includes issue id in env; gateway can pass `issueTitle` into OpenClaw when starting a run if OpenClaw accepts extra params (future).

## Success metrics

- Operators find the correct thread in **under two scans** without copying UUIDs from Paperclip.
- No duplicate “official” titles: Paperclip issue title remains canonical for `paperclip:issue:*`.

## References

- `packages/adapters/openclaw-gateway/src/server/execute.ts` — `resolveSessionKey`
- `server/src/routes/agents.ts` — `seedPerAgentOpenClawGatewaySessionKey` (per-agent fixed keys)
- `workspace/prompts/paperclip-openclaw-session-routing-and-ui-contracts.md` — execution prompt
