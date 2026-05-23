import {
  appendDeadLetter,
  createTokenBucketRateLimiter,
  readConnectorDashboardTelemetry,
  readInstanceState,
  withRetry,
  writeInstanceState,
} from "@paperclipai/plugin-connector-core";
import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { isIP } from "node:net";

type ToolDefinition = {
  name: string;
  displayName: string;
  description?: string;
  method?: string;
  path: string;
};

type BridgeConfig = {
  baseUrl?: string;
  authTokenSecretRef?: string;
  toolPrefix?: string;
  maxRequestsPerMinute?: number;
  tools?: ToolDefinition[];
};

const DEFAULT_CONFIG: BridgeConfig = {
  baseUrl: "http://localhost:3000",
  authTokenSecretRef: "",
  toolPrefix: "bridge",
  maxRequestsPerMinute: 120,
  tools: [],
};

let currentCtx: PluginContext | null = null;
let limiter = createTokenBucketRateLimiter({ capacity: 120, refillPerSecond: 2 });

async function incrementCounter(ctx: PluginContext, key: string): Promise<void> {
  const current = await readInstanceState<number>(ctx, key, 0);
  await writeInstanceState(ctx, key, current + 1);
}

async function getConfig(ctx: PluginContext): Promise<BridgeConfig> {
  const raw = await ctx.config.get();
  return { ...DEFAULT_CONFIG, ...(raw as BridgeConfig) };
}

function normalizePath(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function isPrivateOrLocalAddress(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost") return true;
  if (lower === "::1" || lower === "[::1]") return true;
  if (lower === "169.254.169.254") return true;

  const ipVersion = isIP(lower);
  if (ipVersion === 4) {
    const octets = lower.split(".").map((value) => Number(value));
    if (octets[0] === 127) return true;
    if (octets[0] === 10) return true;
    if (octets[0] === 192 && octets[1] === 168) return true;
    if (octets[0] === 169 && octets[1] === 254) return true;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  }
  if (ipVersion === 6) {
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
  }
  return false;
}

function resolveBridgeUrl(baseUrl: string | undefined, toolPath: string): string {
  const normalized = normalizePath(toolPath);
  if (normalized.includes("..")) {
    throw new Error("Bridge path cannot include parent directory traversal segments.");
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    const url = new URL(normalized);
    if (isPrivateOrLocalAddress(url.hostname)) {
      throw new Error(`Bridge target host is blocked: ${url.hostname}`);
    }
    return url.toString();
  }

  const resolvedBase = new URL(baseUrl ?? "http://localhost:3000");
  if (!["http:", "https:"].includes(resolvedBase.protocol)) {
    throw new Error(`Unsupported bridge baseUrl protocol: ${resolvedBase.protocol}`);
  }
  return new URL(normalized, resolvedBase).toString();
}

async function runBridgeCall(
  ctx: PluginContext,
  def: ToolDefinition,
  params: unknown,
): Promise<unknown> {
  const cfg = await getConfig(ctx);
  if (!limiter.take(1)) {
    throw new Error("HTTP bridge rate limit exceeded.");
  }

  const token = cfg.authTokenSecretRef
    ? await ctx.secrets.resolve(cfg.authTokenSecretRef)
    : "";
  const url = resolveBridgeUrl(cfg.baseUrl, def.path);

  return await withRetry(async () => {
    const response = await ctx.http.fetch(url, {
      method: def.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(params ?? {}),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Bridge endpoint failed (${response.status}): ${body.slice(0, 400)}`);
    }
    const bodyText = await response.text();
    if (bodyText.length === 0) return null;
    try {
      return JSON.parse(bodyText);
    } catch {
      return bodyText;
    }
  }, {
    retries: 2,
    baseDelayMs: 150,
    onRetry: async () => {
      await incrementCounter(ctx, "http-bridge.retry-count");
    },
  });
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentCtx = ctx;
    const cfg = await getConfig(ctx);
    const capacity = Math.max(1, Math.floor(cfg.maxRequestsPerMinute ?? 120));
    limiter = createTokenBucketRateLimiter({
      capacity,
      refillPerSecond: capacity / 60,
    });

    ctx.data.register("status", async () => ({
      rateLimitRemaining: limiter.remaining(),
      configuredTools: (await getConfig(ctx)).tools?.length ?? 0,
    }));

    ctx.data.register("dashboard", async () => {
      const telemetry = await readConnectorDashboardTelemetry(ctx, {
        namespace: "http-bridge",
        lagSourceStateKey: "http-bridge.last-call-at",
      });
      return {
        ...telemetry,
        rateLimitRemaining: limiter.remaining(),
        configuredTools: (await getConfig(ctx)).tools?.length ?? 0,
      };
    });

    const toolDefs = (cfg.tools ?? []).filter((entry) =>
      entry.name && entry.displayName && entry.path);

    const toolNameToDefinition = new Map<string, ToolDefinition>();
    for (const def of toolDefs) {
      const fullName = `${cfg.toolPrefix ?? "bridge"}:${def.name}`;
      toolNameToDefinition.set(fullName, def);
    }

    for (const def of toolDefs) {
      const toolName = `${cfg.toolPrefix ?? "bridge"}:${def.name}`;
      ctx.tools.register(
        toolName,
        {
          displayName: def.displayName,
          description: def.description ?? `Proxy request to ${def.path}`,
          parametersSchema: {
            type: "object",
            additionalProperties: true,
          },
        },
        async (params: unknown, runCtx: ToolRunContext) => {
          try {
            const data = await runBridgeCall(ctx, def, params);
            await ctx.metrics.write("bridge.tool.success", 1, { toolName });
            await ctx.activity.log({
              companyId: runCtx.companyId,
              entityType: "agent",
              entityId: runCtx.agentId,
              message: `Ran bridged tool ${toolName}`,
              metadata: { runId: runCtx.runId, path: def.path },
            });
            await writeInstanceState(ctx, "http-bridge.last-call-at", new Date().toISOString());
            return {
              content: typeof data === "string" ? data : JSON.stringify(data, null, 2),
              data,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await ctx.metrics.write("bridge.tool.error", 1, { toolName });
            await incrementCounter(ctx, "http-bridge.retry-count");
            await writeInstanceState(ctx, "http-bridge.last-failure", {
              at: new Date().toISOString(),
              toolName,
              params,
              error: message,
            });
            await appendDeadLetter(ctx, "http-bridge", {
              type: "tool-error",
              toolName,
              error: message,
              path: def.path,
            });
            return { error: message };
          }
        },
      );
    }

    ctx.actions.register("replay-last-failure", async () => {
      const lastFailure = await readInstanceState<{
        toolName?: string;
        params?: unknown;
      } | null>(ctx, "http-bridge.last-failure", null);
      if (!lastFailure?.toolName) {
        return { ok: false, message: "No failed bridge call to replay." };
      }
      const definition = toolNameToDefinition.get(lastFailure.toolName);
      if (!definition) {
        return { ok: false, message: `Tool no longer configured: ${lastFailure.toolName}` };
      }
      const data = await runBridgeCall(ctx, definition, lastFailure.params ?? {});
      await writeInstanceState(ctx, "http-bridge.last-call-at", new Date().toISOString());
      return { ok: true, toolName: lastFailure.toolName, data };
    });
  },

  async onHealth() {
    const cfg = currentCtx ? await getConfig(currentCtx) : DEFAULT_CONFIG;
    const configuredTools = cfg.tools?.length ?? 0;
    return {
      status: "ok" as const,
      message: `HTTP bridge ready with ${configuredTools} configured tools`,
      details: {
        configuredTools,
        rateLimitRemaining: limiter.remaining(),
      },
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
