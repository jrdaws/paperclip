/**
 * capabilities-probe — TTL-cached probe for webhook backend /capabilities
 * endpoints. Used by the dispatch layer to auto-detect framework type
 * (LangGraph, CrewAI, etc.) and available features without blocking the
 * hot path.
 *
 * Design constraints:
 *  - Never throws — every public function returns null on failure.
 *  - 60 s TTL cache keyed by derived capabilities URL.
 *  - Stale cache entries are returned as fallback when a fresh probe fails.
 *  - Uses Node 18+ native fetch with AbortSignal.timeout.
 */

import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedCapabilities {
  framework: string;
  features: Record<string, boolean>;
  checkpointBackend?: string;
  checkpointDurable?: boolean;
  version?: string;
  /** Date.now() timestamp of when this entry was fetched. */
  fetchedAt: number;
}

export interface RuntimeHint {
  runtimeProfile: string;
  runtimeHeader: string;
}

export interface TaskSignals {
  needsHitl?: boolean;
  needsStreaming?: boolean;
  needsCheckpoint?: boolean;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const _cache = new Map<string, CachedCapabilities>();
const TTL_MS = 60_000;
const PROBE_TIMEOUT_MS = 3_000;

const log = logger.child({ service: "capabilities-probe" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the /capabilities URL from a webhook URL.
 *
 * - If the URL ends with `/webhook` (with or without trailing slash),
 *   replace that segment with `/capabilities`.
 * - Otherwise append `/capabilities`.
 */
function deriveCapabilitiesUrl(webhookUrl: string): string {
  const trimmed = webhookUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/webhook")) {
    return trimmed.slice(0, -"/webhook".length) + "/capabilities";
  }
  return trimmed + "/capabilities";
}

function isFresh(entry: CachedCapabilities): boolean {
  return Date.now() - entry.fetchedAt < TTL_MS;
}

// ---------------------------------------------------------------------------
// probeCapabilities
// ---------------------------------------------------------------------------

/**
 * Probe a webhook backend's /capabilities endpoint with TTL caching.
 * Returns null if the probe fails, times out, or returns invalid data.
 * Never throws — safe to call in hot dispatch paths.
 */
export async function probeCapabilities(
  webhookUrl: string,
): Promise<CachedCapabilities | null> {
  const url = deriveCapabilitiesUrl(webhookUrl);

  // Fast path: fresh cache hit
  const cached = _cache.get(url);
  if (cached && isFresh(cached)) return cached;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!res.ok) {
      log.warn({ url, status: res.status }, "capabilities probe returned non-OK status");
      return cached ?? null; // stale fallback
    }

    const body = await res.json();

    if (typeof body?.framework !== "string") {
      log.warn({ url }, "capabilities response missing required `framework` field");
      return cached ?? null;
    }

    const entry: CachedCapabilities = {
      framework: body.framework,
      features: typeof body.features === "object" && body.features !== null
        ? body.features
        : {},
      checkpointBackend: body.checkpoint_backend ?? body.checkpointBackend,
      checkpointDurable: body.checkpoint_durable ?? body.checkpointDurable,
      version: body.version,
      fetchedAt: Date.now(),
    };

    _cache.set(url, entry);
    return entry;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ url, err: message }, "capabilities probe failed");
    return cached ?? null; // stale fallback
  }
}

// ---------------------------------------------------------------------------
// deriveRuntimeHint
// ---------------------------------------------------------------------------

/**
 * Derive the best runtime profile hint from cached capabilities and task
 * context. Returns null if no auto-detection is possible (caller should
 * fall back to its existing config).
 */
export function deriveRuntimeHint(
  caps: CachedCapabilities,
  taskSignals: TaskSignals,
): RuntimeHint | null {
  const fw = caps.framework.toLowerCase();

  if (fw === "langgraph") {
    return { runtimeProfile: "http+langgraph", runtimeHeader: "LangGraph" };
  }

  if (fw === "crewai") {
    return { runtimeProfile: "http+crewai", runtimeHeader: "CrewAI" };
  }

  // Feature-based inference when framework name isn't conclusive
  if (caps.features.hitl_interrupt && taskSignals.needsHitl) {
    return { runtimeProfile: "http+langgraph", runtimeHeader: "LangGraph" };
  }

  if (caps.features.streaming && taskSignals.needsStreaming) {
    return { runtimeProfile: "http+langgraph", runtimeHeader: "LangGraph" };
  }

  if (caps.features.checkpoint_durable && taskSignals.needsCheckpoint) {
    return { runtimeProfile: "http+langgraph", runtimeHeader: "LangGraph" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cache management (test utility)
// ---------------------------------------------------------------------------

/** Clear the entire capability cache. Intended for test teardown. */
export function clearCapabilityCache(): void {
  _cache.clear();
}
