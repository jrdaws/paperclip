import {
  appendDeadLetter,
  createTokenBucketRateLimiter,
  readConnectorDashboardTelemetry,
  readInstanceState,
  verifySlackRequest,
  withRetry,
  writeInstanceState,
} from "@paperclipai/plugin-connector-core";
import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginWebhookInput,
  type PluginWebhookResponseOverride,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";

type SlackBridgeConfig = {
  signingSecretRef?: string;
  botTokenSecretRef?: string;
  webhookUrlSecretRef?: string;
  defaultChannel?: string;
  maxMessagesPerMinute?: number;
};

const DEFAULT_CONFIG: SlackBridgeConfig = {
  signingSecretRef: "",
  botTokenSecretRef: "",
  webhookUrlSecretRef: "",
  defaultChannel: "#general",
  maxMessagesPerMinute: 60,
};

let currentCtx: PluginContext | null = null;
let limiter = createTokenBucketRateLimiter({ capacity: 60, refillPerSecond: 1 });

async function getConfig(ctx: PluginContext): Promise<SlackBridgeConfig> {
  const raw = await ctx.config.get();
  return { ...DEFAULT_CONFIG, ...(raw as SlackBridgeConfig) };
}

async function resolveSecret(ctx: PluginContext, ref?: string): Promise<string> {
  if (!ref) return "";
  return await ctx.secrets.resolve(ref);
}

async function incrementCounter(ctx: PluginContext, key: string): Promise<void> {
  const current = await readInstanceState<number>(ctx, key, 0);
  await writeInstanceState(ctx, key, current + 1);
}

async function sendSlackMessage(
  ctx: PluginContext,
  text: string,
  channel: string,
): Promise<{ transport: "chat.postMessage" | "incoming-webhook"; ok: boolean }> {
  const config = await getConfig(ctx);
  const botToken = await resolveSecret(ctx, config.botTokenSecretRef);
  const webhookUrl = await resolveSecret(ctx, config.webhookUrlSecretRef);

  if (!botToken && !webhookUrl) {
    throw new Error("No Slack delivery transport configured (bot token or webhook URL secret ref required).");
  }

  if (!limiter.take(1)) {
    throw new Error("Slack rate limit exceeded for plugin instance.");
  }

  const run = async () => {
    if (botToken) {
      const response = await ctx.http.fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${botToken}`,
        },
        body: JSON.stringify({ channel, text }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(`Slack chat.postMessage failed: ${payload.error ?? response.status}`);
      }
      return { transport: "chat.postMessage" as const, ok: true };
    }

    const response = await ctx.http.fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      throw new Error(`Slack incoming webhook failed: ${response.status}`);
    }
    return { transport: "incoming-webhook" as const, ok: true };
  };

  return await withRetry(run, {
    retries: 2,
    baseDelayMs: 200,
    onRetry: async () => {
      await incrementCounter(ctx, "slack.retry-count");
    },
  });
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentCtx = ctx;
    const cfg = await getConfig(ctx);
    const capacity = Math.max(1, Math.floor(cfg.maxMessagesPerMinute ?? 60));
    limiter = createTokenBucketRateLimiter({
      capacity,
      refillPerSecond: capacity / 60,
    });

    ctx.data.register("status", async () => {
      const lastWebhook = await readInstanceState<Record<string, unknown> | null>(
        ctx,
        "slack.last-webhook",
        null,
      );
      const lastSend = await readInstanceState<Record<string, unknown> | null>(
        ctx,
        "slack.last-send",
        null,
      );
      return {
        lastWebhook,
        lastSend,
        rateLimitRemaining: limiter.remaining(),
      };
    });

    ctx.data.register("dashboard", async () => {
      const telemetry = await readConnectorDashboardTelemetry(ctx, {
        namespace: "slack",
      });
      return {
        ...telemetry,
        rateLimitRemaining: limiter.remaining(),
      };
    });

    ctx.actions.register("send-test-message", async (params) => {
      const cfg2 = await getConfig(ctx);
      const input = params as { text?: string; channel?: string };
      const text = input.text ?? "Slack bridge test message";
      const channel = input.channel ?? cfg2.defaultChannel ?? "#general";
      const result = await sendSlackMessage(ctx, text, channel);
      await writeInstanceState(ctx, "slack.last-send", {
        at: new Date().toISOString(),
        channel,
        transport: result.transport,
        source: "dashboard-action",
      });
      return { ok: true, channel, transport: result.transport };
    });

    ctx.actions.register("clear-dlq", async () => {
      await writeInstanceState(ctx, "slack.dead-letter", []);
      return { ok: true };
    });

    ctx.tools.register(
      "slack-send-message",
      {
        displayName: "Slack Send Message",
        description: "Send a message to Slack with retries and rate limiting.",
        parametersSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            channel: { type: "string" },
          },
          required: ["text"],
        },
      },
      async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
        const input = params as { text?: string; channel?: string };
        if (!input.text) return { error: "text is required" };
        const cfg2 = await getConfig(ctx);
        const channel = input.channel ?? cfg2.defaultChannel ?? "#general";

        try {
          const result = await sendSlackMessage(ctx, input.text, channel);
          await writeInstanceState(ctx, "slack.last-send", {
            at: new Date().toISOString(),
            channel,
            transport: result.transport,
            agentId: runCtx.agentId,
          });
          await ctx.metrics.write("slack.send.success", 1, { transport: result.transport });
          await ctx.activity.log({
            companyId: runCtx.companyId,
            entityType: "agent",
            entityId: runCtx.agentId,
            message: `Sent Slack message to ${channel}`,
            metadata: { transport: result.transport, runId: runCtx.runId },
          });
          return { content: `Sent Slack message to ${channel}`, data: result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await ctx.metrics.write("slack.send.error", 1, {});
          await appendDeadLetter(ctx, "slack", {
            type: "send-message",
            error: message,
            channel,
            textPreview: input.text.slice(0, 300),
          });
          return { error: message };
        }
      },
    );

    ctx.jobs.register("slack-connector-heartbeat", async () => {
      await writeInstanceState(ctx, "slack.last-heartbeat", { at: new Date().toISOString() });
      await ctx.metrics.write("slack.heartbeat", 1, {});
    });
  },

  async onWebhook(
    input: PluginWebhookInput,
  ): Promise<void | PluginWebhookResponseOverride> {
    const ctx = currentCtx;
    if (!ctx) throw new Error("Slack bridge worker context unavailable.");
    if (input.endpointKey !== "slack-events") {
      throw new Error(`Unsupported webhook endpoint: ${input.endpointKey}`);
    }

    const cfg = await getConfig(ctx);
    const signingSecret = await resolveSecret(ctx, cfg.signingSecretRef);
    if (!signingSecret) {
      throw new Error("Slack signing secret is not configured.");
    }

    const signatureHeader = input.headers["x-slack-signature"] ?? input.headers["X-Slack-Signature"];
    const timestampHeader =
      input.headers["x-slack-request-timestamp"] ?? input.headers["X-Slack-Request-Timestamp"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const ts = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

    const verified = verifySlackRequest({
      signingSecret,
      rawBody: input.rawBody ?? "",
      signatureHeader: signature,
      timestampHeader: ts,
    });
    if (!verified.ok) {
      await appendDeadLetter(ctx, "slack", {
        type: "webhook-signature",
        reason: verified.reason ?? "unknown",
        requestId: input.requestId,
      });
      throw new Error(verified.reason ?? "Slack signature validation failed");
    }

    const parsed = (input.parsedBody as { type?: string; challenge?: string } | undefined) ?? {};
    await writeInstanceState(ctx, "slack.last-webhook", {
      at: new Date().toISOString(),
      requestId: input.requestId,
      eventType: parsed.type ?? "unknown",
    });
    await ctx.metrics.write("slack.webhook.accepted", 1, {});

    // Slack URL verification handshake expects the challenge echoed back.
    if (parsed.type === "url_verification" && typeof parsed.challenge === "string") {
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { challenge: parsed.challenge },
      };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
