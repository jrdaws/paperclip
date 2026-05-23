import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginHealthDiagnostics,
  type PluginJobContext,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { MC_TOOLS } from "./tools/registry.js";
import { PLUGIN_ID } from "./manifest.js";

interface McPluginConfig {
  mcBaseUrl?: string;
  mcApiSecret?: string;
  enableCostSync?: boolean;
  governanceEscalation?: boolean;
}

const DEFAULT_CONFIG: McPluginConfig = {
  mcBaseUrl: "http://localhost:3000",
  mcApiSecret: "",
  enableCostSync: true,
  governanceEscalation: true,
};

let currentCtx: PluginContext | null = null;
let toolCallCount = 0;
let lastHealthCheck: string | null = null;

interface GovernanceMetadata {
  governed: boolean;
  skill: string | null;
  guardrails: string[];
  severityLevels: string[];
  mode: string;
}

interface GovernanceWarning {
  rule: string;
  severity: string;
}

interface GovernanceViolationRecord {
  timestamp: string;
  toolId: string;
  agentId: string;
  skill: string | null;
  violations: GovernanceWarning[];
  mode: string;
  action: "blocked" | "warned" | "escalated";
}

async function getConfig(ctx: PluginContext): Promise<McPluginConfig> {
  const raw = await ctx.config.get();
  return { ...DEFAULT_CONFIG, ...(raw as McPluginConfig) };
}

async function callMcTool(
  ctx: PluginContext,
  config: McPluginConfig,
  toolId: string,
  input: unknown,
): Promise<unknown> {
  const url = `${config.mcBaseUrl}/api/tools/run`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.mcApiSecret) {
    const secret = await ctx.secrets.resolve(config.mcApiSecret);
    headers["Authorization"] = `Bearer ${secret}`;
  }

  const response = await ctx.http.fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: toolId, input }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MC tool ${toolId} returned ${response.status}: ${errorText.slice(0, 500)}`);
  }

  return await response.json();
}

async function handleGovernanceMetadata(
  ctx: PluginContext,
  config: McPluginConfig,
  toolId: string,
  runCtx: ToolRunContext,
  result: Record<string, unknown>,
): Promise<void> {
  const governance = result.governance as GovernanceMetadata | undefined;
  if (!governance?.governed) return;

  await ctx.metrics.write("mc.governance.tool_call", 1, {
    tool: toolId,
    mode: governance.mode,
    skill: governance.skill ?? "unknown",
  });

  const warnings = result.governanceWarnings as GovernanceWarning[] | undefined;
  if (!warnings || warnings.length === 0) return;

  const hasP0 = warnings.some((w) => w.severity === "P0");
  const hasP1 = warnings.some((w) => w.severity === "P1");

  await ctx.metrics.write("mc.governance.violation", warnings.length, {
    tool: toolId,
    maxSeverity: hasP0 ? "P0" : hasP1 ? "P1" : "P2+",
  });

  const record: GovernanceViolationRecord = {
    timestamp: new Date().toISOString(),
    toolId,
    agentId: runCtx.agentId,
    skill: governance.skill,
    violations: warnings,
    mode: governance.mode,
    action: "warned",
  };

  if (config.governanceEscalation && hasP0) {
    record.action = "escalated";

    await ctx.activity.log({
      companyId: runCtx.companyId,
      entityType: "agent",
      entityId: runCtx.agentId,
      message: `[GOVERNANCE P0] Tool "${toolId}" executed with P0 warning (mode=${governance.mode}): ${warnings[0].rule}`,
      metadata: {
        toolId,
        governedBy: governance.skill,
        severity: "P0",
        violations: warnings,
        requiresReview: true,
      },
    });

    ctx.logger.warn("Governance P0 escalation", {
      toolId,
      agent: runCtx.agentId,
      skill: governance.skill,
      violation: warnings[0].rule,
    });
  }

  await appendGovernanceHistory(ctx, record);
}

async function handleGovernanceBlock(
  ctx: PluginContext,
  config: McPluginConfig,
  toolId: string,
  runCtx: ToolRunContext,
  errorBody: Record<string, unknown>,
): Promise<void> {
  const violations = errorBody.violations as string[] | undefined;
  const skill = errorBody.governedBy as string | undefined;
  const severity = errorBody.severity as string | undefined;

  await ctx.metrics.write("mc.governance.blocked", 1, {
    tool: toolId,
    severity: severity ?? "P0",
    skill: skill ?? "unknown",
  });

  const record: GovernanceViolationRecord = {
    timestamp: new Date().toISOString(),
    toolId,
    agentId: runCtx.agentId,
    skill: skill ?? null,
    violations: (violations ?? []).map((v) => ({ rule: v, severity: severity ?? "P0" })),
    mode: "enforce",
    action: "blocked",
  };

  if (config.governanceEscalation) {
    await ctx.activity.log({
      companyId: runCtx.companyId,
      entityType: "agent",
      entityId: runCtx.agentId,
      message: `[GOVERNANCE BLOCKED] Tool "${toolId}" blocked by governed skill "${skill}": ${violations?.[0] ?? "policy violation"}`,
      metadata: {
        toolId,
        governedBy: skill,
        severity,
        violations,
        blocked: true,
      },
    });
  }

  await appendGovernanceHistory(ctx, record);
}

async function appendGovernanceHistory(
  ctx: PluginContext,
  record: GovernanceViolationRecord,
): Promise<void> {
  try {
    const existing = (await ctx.state.get({
      scopeKind: "instance",
      stateKey: "governance-history",
    })) as { events: GovernanceViolationRecord[] } | null;

    const events = existing?.events ?? [];
    events.unshift(record);
    const trimmed = events.slice(0, 100);

    await ctx.state.set(
      { scopeKind: "instance", stateKey: "governance-history" },
      { events: trimmed, lastUpdated: new Date().toISOString() },
    );
  } catch {
    ctx.logger.warn("Failed to persist governance history");
  }
}

function registerAllTools(ctx: PluginContext): void {
  for (const tool of MC_TOOLS) {
    ctx.tools.register(
      tool.id,
      {
        displayName: tool.displayName,
        description: tool.description,
        parametersSchema: tool.parametersSchema,
      },
      async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
        const config = await getConfig(ctx);
        const startMs = Date.now();

        try {
          const result = await callMcTool(ctx, config, tool.id, params);
          const durationMs = Date.now() - startMs;
          toolCallCount++;

          await ctx.metrics.write("mc.tool.call", 1, {
            tool: tool.id,
            agent: runCtx.agentId,
            status: "success",
          });
          await ctx.metrics.write("mc.tool.latency_ms", durationMs, {
            tool: tool.id,
          });

          await ctx.activity.log({
            companyId: runCtx.companyId,
            entityType: "agent",
            entityId: runCtx.agentId,
            message: `Used MC tool "${tool.displayName}" (${durationMs}ms)`,
            metadata: { toolId: tool.id, runId: runCtx.runId, durationMs },
          });

          if (result && typeof result === "object") {
            await handleGovernanceMetadata(
              ctx, config, tool.id, runCtx,
              result as Record<string, unknown>,
            );
          }

          const content =
            typeof result === "string" ? result : JSON.stringify(result, null, 2);

          return { content, data: result };
        } catch (err) {
          const durationMs = Date.now() - startMs;

          await ctx.metrics.write("mc.tool.call", 1, {
            tool: tool.id,
            agent: runCtx.agentId,
            status: "error",
          });

          const message = err instanceof Error ? err.message : String(err);

          if (message.includes("returned 422")) {
            try {
              const bodyMatch = message.match(/422: (.+)/);
              if (bodyMatch) {
                const errorBody = JSON.parse(bodyMatch[1]);
                if (errorBody.governedBy) {
                  await handleGovernanceBlock(ctx, config, tool.id, runCtx, errorBody);
                }
              }
            } catch {
              /* parse failure is fine — log the raw error */
            }
          }

          ctx.logger.error(`MC tool ${tool.id} failed`, { error: message, durationMs });

          return { error: message };
        }
      },
    );
  }
}

interface GovernedSkillSummary {
  name: string;
  slug: string;
  governsTool: string | null;
  description: string;
  userInvocable: boolean;
  guardrails: string[];
  severityLevels: string[];
  toolRegistered: boolean;
  lineCount: number;
}

interface GovernedRegistryResponse {
  skills: GovernedSkillSummary[];
  summary: {
    total: number;
    toolsCovered: number;
    toolsTotal: number;
    uncoveredTools: string[];
  };
}

async function fetchGovernedSkills(
  ctx: PluginContext,
): Promise<GovernedRegistryResponse | null> {
  const config = await getConfig(ctx);
  const url = `${config.mcBaseUrl}/api/skills/governed`;

  try {
    const headers: Record<string, string> = {};
    if (config.mcApiSecret) {
      const secret = await ctx.secrets.resolve(config.mcApiSecret);
      headers["Authorization"] = `Bearer ${secret}`;
    }

    const response = await ctx.http.fetch(url, { method: "GET", headers });
    if (!response.ok) {
      ctx.logger.warn("Failed to fetch governed skills", { status: response.status });
      return null;
    }

    return (await response.json()) as GovernedRegistryResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("Governed skills fetch failed", { error: message });
    return null;
  }
}

async function syncGovernedSkills(ctx: PluginContext): Promise<void> {
  const registry = await fetchGovernedSkills(ctx);
  if (!registry) return;

  await ctx.state.set(
    { scopeKind: "instance", stateKey: "governed-skills" },
    {
      syncedAt: new Date().toISOString(),
      total: registry.summary.total,
      toolsCovered: registry.summary.toolsCovered,
      toolsTotal: registry.summary.toolsTotal,
      uncoveredTools: registry.summary.uncoveredTools,
      skills: registry.skills.map((s) => ({
        slug: s.slug,
        governsTool: s.governsTool,
        guardrailCount: s.guardrails.length,
        severityLevels: s.severityLevels,
        userInvocable: s.userInvocable,
      })),
    },
  );

  ctx.logger.info("Governed skills sync completed", {
    total: registry.summary.total,
    coverage: `${registry.summary.toolsCovered}/${registry.summary.toolsTotal}`,
  });
}

interface ManifestSyncResult {
  manifestGenerated: string;
  manifestCount: number;
  imported: Array<{ id: string; slug: string }>;
  updated: Array<{ id: string; slug: string }>;
  skipped: Array<{ id: string; location: string; reason: string }>;
  warnings: string[];
}

async function syncSkillManifest(ctx: PluginContext): Promise<void> {
  const config = await getConfig(ctx);

  try {
    const refreshHeaders: Record<string, string> = {};
    if (config.mcApiSecret) {
      const secret = await ctx.secrets.resolve(config.mcApiSecret);
      refreshHeaders["Authorization"] = `Bearer ${secret}`;
    }
    await ctx.http.fetch(`${config.mcBaseUrl}/api/skills/refresh-manifest`, {
      method: "POST",
      headers: refreshHeaders,
    }).catch(() => {
      ctx.logger.info("MC manifest refresh endpoint not available, using existing manifest");
    });
  } catch {
    ctx.logger.info("MC manifest refresh skipped");
  }

  const companiesResponse = await ctx.http.fetch("http://localhost:3100/api/companies", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!companiesResponse.ok) {
    ctx.logger.warn("Failed to list companies for manifest sync", {
      status: companiesResponse.status,
    });
    return;
  }

  const companies = (await companiesResponse.json()) as Array<{ id: string; name: string }>;
  let totalImported = 0;
  let totalUpdated = 0;

  for (const company of companies) {
    try {
      const syncResponse = await ctx.http.fetch(
        `http://localhost:3100/api/companies/${company.id}/skills/sync-manifest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!syncResponse.ok) {
        ctx.logger.warn("Manifest sync failed for company", {
          companyId: company.id,
          status: syncResponse.status,
        });
        continue;
      }

      const result = (await syncResponse.json()) as ManifestSyncResult;
      totalImported += result.imported.length;
      totalUpdated += result.updated.length;

      ctx.logger.info("Manifest sync completed for company", {
        companyId: company.id,
        companyName: company.name,
        imported: result.imported.length,
        updated: result.updated.length,
        skipped: result.skipped.length,
        manifestCount: result.manifestCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.logger.warn("Manifest sync error for company", {
        companyId: company.id,
        error: message,
      });
    }
  }

  await ctx.state.set(
    { scopeKind: "instance", stateKey: "last-manifest-sync" },
    {
      syncedAt: new Date().toISOString(),
      companiesSynced: companies.length,
      totalImported,
      totalUpdated,
    },
  );

  ctx.logger.info("Skill manifest sync completed", {
    companies: companies.length,
    totalImported,
    totalUpdated,
  });
}

async function syncCosts(ctx: PluginContext): Promise<void> {
  const config = await getConfig(ctx);
  if (!config.enableCostSync) return;

  try {
    const response = await ctx.http.fetch(`${config.mcBaseUrl}/api/usage`, {
      method: "GET",
    });

    if (!response.ok) {
      ctx.logger.warn("Failed to fetch MC usage data", { status: response.status });
      return;
    }

    const usage = (await response.json()) as {
      totalCost?: number;
      totalTokens?: number;
      byProvider?: Record<string, { cost: number; tokens: number }>;
    };

    if (usage.totalCost !== undefined) {
      await ctx.metrics.write("mc.usage.total_cost_usd", usage.totalCost, {
        source: "mission-control",
      });
    }
    if (usage.totalTokens !== undefined) {
      await ctx.metrics.write("mc.usage.total_tokens", usage.totalTokens, {
        source: "mission-control",
      });
    }

    if (usage.byProvider) {
      for (const [provider, data] of Object.entries(usage.byProvider)) {
        await ctx.metrics.write("mc.usage.provider_cost_usd", data.cost, {
          provider,
        });
        await ctx.metrics.write("mc.usage.provider_tokens", data.tokens, {
          provider,
        });
      }
    }

    await ctx.state.set(
      { scopeKind: "instance", stateKey: "last-cost-sync" },
      { syncedAt: new Date().toISOString(), totalCost: usage.totalCost },
    );

    ctx.logger.info("MC cost sync completed", { totalCost: usage.totalCost });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("MC cost sync failed", { error: message });
  }
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentCtx = ctx;

    registerAllTools(ctx);
    ctx.logger.info(`Registered ${MC_TOOLS.length} Mission Control tools`);

    ctx.jobs.register("sync-mc-costs", async (_job: PluginJobContext) => {
      await syncCosts(ctx);
    });

    ctx.jobs.register("sync-governed-skills", async (_job: PluginJobContext) => {
      await syncGovernedSkills(ctx);
    });

    ctx.jobs.register("sync-skill-manifest", async (_job: PluginJobContext) => {
      await syncSkillManifest(ctx);
    });

    syncGovernedSkills(ctx).catch((err) => {
      ctx.logger.warn("Initial governed skills sync failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    syncSkillManifest(ctx).catch((err) => {
      ctx.logger.warn("Initial skill manifest sync failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    ctx.events.on("agent.run.finished", async (event) => {
      await ctx.state.set(
        {
          scopeKind: "agent",
          scopeId: event.entityId ?? "unknown",
          stateKey: "last-mc-run",
        },
        { completedAt: event.occurredAt, runId: event.eventId },
      );
    });

    ctx.logger.info("Mission Control plugin initialized", {
      pluginId: PLUGIN_ID,
      toolCount: MC_TOOLS.length,
    });
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    lastHealthCheck = new Date().toISOString();
    const ctx = currentCtx;

    let mcReachable = false;
    if (ctx) {
      try {
        const config = await getConfig(ctx);
        const res = await ctx.http.fetch(`${config.mcBaseUrl}/api/health`, {
          method: "GET",
        });
        mcReachable = res.ok;
      } catch {
        mcReachable = false;
      }
    }

    type GovernedState = { total?: number; toolsCovered?: number; toolsTotal?: number };
    type GovernanceHistoryState = { events?: GovernanceViolationRecord[] };
    type ManifestSyncState = { syncedAt?: string; totalImported?: number; totalUpdated?: number };

    let governedState: GovernedState | null = null;
    let governanceHistory: GovernanceHistoryState | null = null;
    let manifestState: ManifestSyncState | null = null;
    if (ctx) {
      try {
        governedState = (await ctx.state.get({
          scopeKind: "instance",
          stateKey: "governed-skills",
        })) as GovernedState | null;
      } catch { /* not yet synced */ }

      try {
        governanceHistory = (await ctx.state.get({
          scopeKind: "instance",
          stateKey: "governance-history",
        })) as GovernanceHistoryState | null;
      } catch { /* not yet synced */ }

      try {
        manifestState = (await ctx.state.get({
          scopeKind: "instance",
          stateKey: "last-manifest-sync",
        })) as ManifestSyncState | null;
      } catch { /* not yet synced */ }
    }

    const coverageStr = governedState?.toolsCovered != null
      ? `, governed ${governedState.toolsCovered}/${governedState.toolsTotal}`
      : "";

    const recentBlocks = governanceHistory?.events?.filter((e) => e.action === "blocked").length ?? 0;
    const recentEscalations = governanceHistory?.events?.filter((e) => e.action === "escalated").length ?? 0;
    const govStr = recentBlocks > 0 || recentEscalations > 0
      ? `, gov: ${recentBlocks} blocked, ${recentEscalations} escalated`
      : "";

    return {
      status: mcReachable ? "ok" : "degraded",
      message: mcReachable
        ? `${MC_TOOLS.length} tools registered, MC reachable${coverageStr}${govStr}`
        : `${MC_TOOLS.length} tools registered, MC unreachable — tool calls will fail`,
      details: {
        toolsRegistered: MC_TOOLS.length,
        totalToolCalls: toolCallCount,
        mcReachable,
        lastHealthCheck,
        governedSkills: governedState ?? undefined,
        governanceHistory: {
          recentBlocks,
          recentEscalations,
          totalEvents: governanceHistory?.events?.length ?? 0,
        },
        manifestSync: manifestState ?? undefined,
      },
    };
  },

  async onConfigChanged(newConfig) {
    currentCtx?.logger.info("Mission Control plugin config updated", {
      config: newConfig,
    });
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
