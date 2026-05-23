import {
  appendDeadLetter,
  getCursor,
  readConnectorDashboardTelemetry,
  readInstanceState,
  setCursor,
  verifyGitHubRequest,
  withRetry,
  writeInstanceState,
} from "@paperclipai/plugin-connector-core";
import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginWebhookInput,
} from "@paperclipai/plugin-sdk";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";

type GithubSyncConfig = {
  webhookSecretRef?: string;
  apiTokenSecretRef?: string;
  owner?: string;
  repo?: string;
  projectId?: string;
  maxBackfillPages?: number;
  conflictPolicy?: "inbound_wins" | "outbound_wins" | "newest_wins";
  titleFieldPath?: string;
  descriptionFieldPath?: string;
  statusFieldPath?: string;
};

type GitHubIssuePayload = {
  number: number;
  title: string;
  body?: string | null;
  state: "open" | "closed";
  updated_at?: string;
};

let currentCtx: PluginContext | null = null;

async function getConfig(ctx: PluginContext): Promise<GithubSyncConfig> {
  const raw = await ctx.config.get();
  return {
    webhookSecretRef: "",
    apiTokenSecretRef: "",
    owner: "",
    repo: "",
    projectId: "",
    maxBackfillPages: 5,
    conflictPolicy: "newest_wins",
    titleFieldPath: "title",
    descriptionFieldPath: "body",
    statusFieldPath: "state",
    ...(raw as GithubSyncConfig),
  };
}

async function resolveSecret(ctx: PluginContext, ref?: string): Promise<string> {
  if (!ref) return "";
  return await ctx.secrets.resolve(ref);
}

function mapIssueStatus(state: "open" | "closed") {
  // Keep open issues unassigned-friendly to avoid server validation failures.
  return state === "closed" ? "done" : "todo";
}

function readField(input: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = input;
  for (const seg of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

async function getMappedIssueId(ctx: PluginContext, number: number): Promise<string | null> {
  return await ctx.state.get({
    scopeKind: "instance",
    stateKey: `github.issue-map.${number}`,
  }) as string | null;
}

async function setMappedIssueId(ctx: PluginContext, number: number, issueId: string): Promise<void> {
  await ctx.state.set({
    scopeKind: "instance",
    stateKey: `github.issue-map.${number}`,
  }, issueId);
}

async function incrementCounter(ctx: PluginContext, key: string): Promise<void> {
  const current = await readInstanceState<number>(ctx, key, 0);
  await writeInstanceState(ctx, key, current + 1);
}

async function isDeliverySeen(ctx: PluginContext, namespace: string, deliveryId: string): Promise<boolean> {
  const seen = await readInstanceState<string[]>(ctx, `${namespace}.delivery-ids`, []);
  return seen.includes(deliveryId);
}

async function markDeliveryProcessed(
  ctx: PluginContext,
  namespace: string,
  deliveryId: string,
  maxEntries = 2000,
): Promise<void> {
  const key = `${namespace}.delivery-ids`;
  const seen = await readInstanceState<string[]>(ctx, key, []);
  if (seen.includes(deliveryId)) return;
  await writeInstanceState(ctx, key, [deliveryId, ...seen].slice(0, maxEntries));
}

type MappingMeta = {
  lastInboundUpdatedAt?: string | null;
  lastAppliedAt?: string;
};

async function getMappingMeta(ctx: PluginContext, number: number): Promise<MappingMeta> {
  return (await ctx.state.get({
    scopeKind: "instance",
    stateKey: `github.issue-meta.${number}`,
  }) as MappingMeta | null) ?? {};
}

async function setMappingMeta(ctx: PluginContext, number: number, meta: MappingMeta): Promise<void> {
  await ctx.state.set({
    scopeKind: "instance",
    stateKey: `github.issue-meta.${number}`,
  }, meta);
}

function shouldApplyInbound(
  policy: NonNullable<GithubSyncConfig["conflictPolicy"]>,
  incomingUpdatedAt: string | null,
  currentMeta: MappingMeta,
): boolean {
  if (policy === "inbound_wins") return true;
  if (policy === "outbound_wins") return false;
  if (!incomingUpdatedAt) return true;
  if (!currentMeta.lastInboundUpdatedAt) return true;
  return incomingUpdatedAt >= currentMeta.lastInboundUpdatedAt;
}

async function upsertIssueFromGitHub(
  ctx: PluginContext,
  companyId: string,
  input: GitHubIssuePayload,
  cfg: GithubSyncConfig,
): Promise<void> {
  const mapped = await getMappedIssueId(ctx, input.number);
  const raw = input as unknown as Record<string, unknown>;
  const mappedTitle = String(readField(raw, cfg.titleFieldPath ?? "title") ?? input.title ?? "");
  const mappedBody = String(readField(raw, cfg.descriptionFieldPath ?? "body") ?? input.body ?? "");
  const mappedState = String(readField(raw, cfg.statusFieldPath ?? "state") ?? input.state ?? "open");
  const description = `${mappedBody}\n\n[GitHub #${input.number}]`;
  const issueStatus = mapIssueStatus(mappedState === "closed" ? "closed" : "open");
  const meta = await getMappingMeta(ctx, input.number);

  if (!mapped) {
    const created = await ctx.issues.create({
      companyId,
      projectId: cfg.projectId && cfg.projectId.length > 0 ? cfg.projectId : undefined,
      title: mappedTitle,
      description,
    });
    await setMappedIssueId(ctx, input.number, created.id);
    await setMappingMeta(ctx, input.number, {
      lastInboundUpdatedAt: input.updated_at ?? null,
      lastAppliedAt: new Date().toISOString(),
    });
    await ctx.activity.log({
      companyId,
      entityType: "issue",
      entityId: created.id,
      message: `Created Paperclip issue from GitHub #${input.number}`,
      metadata: { githubIssueNumber: input.number },
    });
    return;
  }

  const shouldApply = shouldApplyInbound(
    cfg.conflictPolicy ?? "newest_wins",
    input.updated_at ?? null,
    meta,
  );
  if (!shouldApply) return;

  await ctx.issues.update(
    mapped,
    {
      title: mappedTitle,
      description,
      status: issueStatus,
    },
    companyId,
  );
  await setMappingMeta(ctx, input.number, {
    lastInboundUpdatedAt: input.updated_at ?? null,
    lastAppliedAt: new Date().toISOString(),
  });
}

async function fetchGithubIssues(ctx: PluginContext, cfg: GithubSyncConfig, since?: string): Promise<GitHubIssuePayload[]> {
  const token = await resolveSecret(ctx, cfg.apiTokenSecretRef);
  if (!token || !cfg.owner || !cfg.repo) return [];

  const pages = Math.max(1, Math.floor(cfg.maxBackfillPages ?? 5));
  const results: GitHubIssuePayload[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/issues`);
    url.searchParams.set("state", "all");
    url.searchParams.set("sort", "updated");
    url.searchParams.set("direction", "asc");
    url.searchParams.set("per_page", "50");
    url.searchParams.set("page", String(page));
    if (since) url.searchParams.set("since", since);

    const batch = await withRetry(async () => {
      const response = await ctx.http.fetch(url.toString(), {
        method: "GET",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!response.ok) {
        throw new Error(`GitHub issues list failed: ${response.status}`);
      }
      return await response.json() as Array<GitHubIssuePayload & { pull_request?: unknown }>;
    }, {
      retries: 2,
      onRetry: async () => {
        await incrementCounter(ctx, "github.retry-count");
      },
    });

    const onlyIssues = batch.filter((entry) => !entry.pull_request);
    if (onlyIssues.length === 0) break;
    results.push(...onlyIssues.map(({ number, title, body, state, updated_at }) => ({
      number, title, body, state, updated_at,
    })));
  }
  return results;
}

async function reconcileRange(
  ctx: PluginContext,
  cfg: GithubSyncConfig,
  since: string,
  dryRun: boolean,
  limit: number,
): Promise<{ processed: number; createdOrUpdated: number; dryRun: boolean }> {
  const companies = await ctx.companies.list({ limit: 1, offset: 0 });
  const companyId = companies[0]?.id;
  if (!companyId) return { processed: 0, createdOrUpdated: 0, dryRun };

  const issues = await fetchGithubIssues(ctx, cfg, since);
  let processed = 0;
  let changed = 0;
  for (const issue of issues.slice(0, Math.max(1, limit))) {
    processed += 1;
    if (!dryRun) {
      await upsertIssueFromGitHub(ctx, companyId, issue, cfg);
    }
    changed += 1;
  }
  return { processed, createdOrUpdated: changed, dryRun };
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentCtx = ctx;

    ctx.data.register("status", async () => {
      const cursor = await getCursor(ctx, "github");
      return { cursor };
    });

    ctx.data.register("dashboard", async () => {
      const telemetry = await readConnectorDashboardTelemetry(ctx, {
        namespace: "github",
        lagSourceStateKey: "github.cursor",
      });
      return {
        ...telemetry,
      };
    });

    ctx.jobs.register("github-backfill-sync", async () => {
      const cfg = await getConfig(ctx);
      const cursor = await getCursor(ctx, "github");
      const issues = await fetchGithubIssues(ctx, cfg, cursor ?? undefined);
      let latestUpdatedAt = cursor ?? null;
      const companies = await ctx.companies.list({ limit: 1, offset: 0 });
      const companyId = companies[0]?.id;
      if (!companyId) return;

      for (const issue of issues) {
        await upsertIssueFromGitHub(ctx, companyId, issue, cfg);
        if (issue.updated_at && (!latestUpdatedAt || issue.updated_at > latestUpdatedAt)) {
          latestUpdatedAt = issue.updated_at;
        }
      }

      if (latestUpdatedAt) {
        await setCursor(ctx, "github", latestUpdatedAt);
      }
      await ctx.metrics.write("github.sync.backfill.count", issues.length, {});
    });

    ctx.tools.register(
      "github-reconcile-range",
      {
        displayName: "GitHub Reconcile Range",
        description: "Replay synchronization for GitHub issues updated since a given timestamp.",
        parametersSchema: {
          type: "object",
          properties: {
            since: { type: "string" },
            dryRun: { type: "boolean" },
            limit: { type: "number" },
          },
          required: ["since"],
        },
      },
      async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
        const input = params as { since?: string; dryRun?: boolean; limit?: number };
        if (!input.since) return { error: "since is required" };
        const cfg = await getConfig(ctx);
        const result = await reconcileRange(
          ctx,
          cfg,
          input.since,
          input.dryRun === true,
          Math.max(1, Math.floor(input.limit ?? 100)),
        );
        await ctx.activity.log({
          companyId: runCtx.companyId,
          entityType: "agent",
          entityId: runCtx.agentId,
          message: `Ran GitHub reconciliation since ${input.since}`,
          metadata: result,
        });
        return {
          content: `Reconciliation processed ${result.processed} issues (dryRun=${result.dryRun}).`,
          data: result,
        };
      },
    );

    ctx.actions.register("reconcile-now", async (params) => {
      const cfg = await getConfig(ctx);
      const cursor = await getCursor(ctx, "github");
      const sinceInput = typeof params.since === "string" ? params.since : null;
      const since = sinceInput ?? cursor ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const dryRun = params.dryRun === true;
      const limit = Math.max(1, Math.floor(Number(params.limit ?? 100)));
      return await reconcileRange(ctx, cfg, since, dryRun, limit);
    });
  },

  async onWebhook(input: PluginWebhookInput) {
    const ctx = currentCtx;
    if (!ctx) throw new Error("GitHub sync worker context unavailable.");
    if (input.endpointKey !== "github-events") {
      throw new Error(`Unsupported webhook endpoint: ${input.endpointKey}`);
    }

    const cfg = await getConfig(ctx);
    const secret = await resolveSecret(ctx, cfg.webhookSecretRef);
    if (!secret) throw new Error("GitHub webhook secret is not configured.");

    const signatureHeader = input.headers["x-hub-signature-256"] ?? input.headers["X-Hub-Signature-256"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const verify = verifyGitHubRequest({
      webhookSecret: secret,
      rawBody: input.rawBody ?? "",
      signatureHeader: signature,
    });
    if (!verify.ok) {
      await appendDeadLetter(ctx, "github", {
        type: "webhook-signature",
        reason: verify.reason ?? "unknown",
        requestId: input.requestId,
      });
      throw new Error(verify.reason ?? "GitHub signature invalid");
    }

    const deliveryHeader = input.headers["x-github-delivery"] ?? input.headers["X-GitHub-Delivery"];
    const deliveryId = Array.isArray(deliveryHeader) ? deliveryHeader[0] : (deliveryHeader ?? input.requestId);
    const alreadySeen = await isDeliverySeen(ctx, "github", deliveryId);
    if (alreadySeen) return;

    const eventHeader = input.headers["x-github-event"] ?? input.headers["X-GitHub-Event"];
    const eventName = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader;
    const body = input.parsedBody as {
      action?: string;
      issue?: GitHubIssuePayload;
      comment?: { body?: string };
      repository?: { full_name?: string };
    };

    const companies = await ctx.companies.list({ limit: 1, offset: 0 });
    const companyId = companies[0]?.id;
    if (!companyId) return;

    try {
      if (eventName === "issues" && body.issue) {
        await upsertIssueFromGitHub(ctx, companyId, body.issue, cfg);
      }

      if (eventName === "issue_comment" && body.issue && body.comment?.body) {
        const mapped = await getMappedIssueId(ctx, body.issue.number);
        if (mapped) {
          await ctx.issues.createComment(
            mapped,
            `[GitHub comment] ${body.comment.body}`,
            companyId,
          );
        }
      }

      if (body.issue?.updated_at) {
        await setCursor(ctx, "github", body.issue.updated_at);
      }
      await markDeliveryProcessed(ctx, "github", deliveryId);
      await writeInstanceState(ctx, "github.last-webhook", {
        at: new Date().toISOString(),
        eventName,
        action: body.action ?? null,
        deliveryId,
      });
      await ctx.metrics.write("github.webhook.accepted", 1, { eventName: String(eventName ?? "unknown") });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await incrementCounter(ctx, "github.retry-count");
      await appendDeadLetter(ctx, "github", {
        type: "webhook-processing",
        eventName,
        deliveryId,
        error: message,
      });
      throw error;
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
