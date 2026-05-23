import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asString, asNumber, parseObject } from "../utils.js";
import {
  executionResultSchema,
  taskSpecSchema,
  CONTRACT_VERSION_LATEST,
  checkV1AlphaSunset,
} from "@paperclipai/shared";
import { probeCapabilities, deriveRuntimeHint } from "../../services/capabilities-probe.js";

function buildTaskSpecBody(
  ctx: AdapterExecutionContext,
  payloadTemplate: Record<string, unknown>,
): Record<string, unknown> | null {
  const { runId, agent, context, runtime } = ctx;

  const instructions =
    typeof context.task === "string" && context.task
      ? context.task
      : typeof context.wakeReason === "string" && context.wakeReason
        ? context.wakeReason
        : null;
  if (!instructions) return null;

  const priority =
    typeof context.priority === "string" &&
    ["low", "medium", "high", "critical"].includes(context.priority)
      ? context.priority
      : "medium";

  const taskId =
    (typeof runtime.taskKey === "string" && runtime.taskKey) ||
    (typeof context.task_id === "string" && context.task_id) ||
    `task-${runId}`;

  const spec: Record<string, unknown> = {
    contract_version: CONTRACT_VERSION_LATEST,
    task_id: taskId,
    goal_id: typeof context.goal_id === "string" ? context.goal_id : `goal-${taskId}`,
    company_id: agent.companyId,
    assignee_agent_id: agent.id,
    title: typeof context.title === "string" && context.title
      ? context.title
      : instructions.slice(0, 120),
    instructions,
    priority,
    trace_context: {
      run_id: runId,
      correlation_id: typeof context.correlation_id === "string"
        ? context.correlation_id
        : runId,
    },
  };

  if (typeof context.risk === "string") {
    spec.constraints = { risk: context.risk };
  }

  if (typeof context.wake_reason === "string") {
    spec.wake_reason = context.wake_reason;
  }

  const merged = { ...payloadTemplate, ...spec };

  const parsed = taskSpecSchema.safeParse(merged);
  if (!parsed.success) {
    return null;
  }
  return merged;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { config, runId, agent, context, onLog } = ctx;
  const url = asString(config.url, "");
  if (!url) throw new Error("HTTP adapter missing url");

  const method = asString(config.method, "POST");
  const timeoutMs = asNumber(config.timeoutMs, 0);
  const headers = parseObject(config.headers) as Record<string, string>;
  const payloadTemplate = parseObject(config.payloadTemplate);
  let runtimeProfile = asString(config.runtimeProfile, "custom-http");

  if (runtimeProfile === "custom-http") {
    try {
      const caps = await probeCapabilities(url);
      if (caps) {
        const taskSignals = {
          needsHitl: context.interrupt_before != null || context.hitl === true,
          needsStreaming: context.streaming === true,
          needsCheckpoint: context.checkpoint === true || context.durable === true,
        };
        const hint = deriveRuntimeHint(caps, taskSignals);
        if (hint) {
          runtimeProfile = hint.runtimeProfile;
          headers["x-agent-runtime"] = hint.runtimeHeader;
          await onLog("stdout", `[http-adapter] auto-detected runtime: ${hint.runtimeProfile} (${caps.framework} v${caps.version ?? "?"})\n`);
        }
      }
    } catch {
      // Probe failure must never block dispatch
    }
  }

  const isContractProfile =
    runtimeProfile === "http+crewai" || runtimeProfile === "http+langgraph";

  let body: Record<string, unknown>;

  if (isContractProfile) {
    const taskSpecBody = buildTaskSpecBody(ctx, payloadTemplate);
    if (taskSpecBody) {
      body = taskSpecBody;
      await onLog("stdout", `[http-adapter] emitting ${CONTRACT_VERSION_LATEST} TaskSpec for ${runtimeProfile}\n`);
    } else {
      body = { ...payloadTemplate, agentId: agent.id, runId, context };
      await onLog("stdout", `[http-adapter] TaskSpec build failed, falling back to raw payload\n`);
    }
  } else {
    body = { ...payloadTemplate, agentId: agent.id, runId, context };
  }

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    await onLog("stdout", `[http-adapter] invoking ${method} ${url} runId=${runId}\n`);
    const res = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      ...(timer ? { signal: controller.signal } : {}),
    });

    if (!res.ok) {
      await onLog("stderr", `[http-adapter] non-2xx response status=${res.status}\n`);
      throw new Error(`HTTP invoke failed with status ${res.status}`);
    }

    let resultJson: Record<string, unknown> | null = null;
    try {
      const rawBody = await res.json();
      if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
        resultJson = rawBody as Record<string, unknown>;
      }
    } catch {
      resultJson = null;
    }

    const adapterResult: AdapterExecutionResult = {
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: `HTTP ${method} ${url}`,
      resultJson,
    };

    if (resultJson && typeof resultJson.contract_version === "string") {
      const sunsetCheck = checkV1AlphaSunset(resultJson.contract_version as string);
      if (sunsetCheck.rejected) {
        await onLog("stderr", `[http-adapter] ${sunsetCheck.message}\n`);
        adapterResult.exitCode = 1;
        adapterResult.errorCode = "contract_sunset";
        adapterResult.errorMessage = sunsetCheck.message;
        await onLog("stdout", `[http-adapter] success status=${res.status}\n`);
        return adapterResult;
      }

      const parsed = executionResultSchema.safeParse(resultJson);
      if (parsed.success) {
        const cr = parsed.data;
        await onLog("stdout", `[http-adapter] contract ${cr.contract_version} validated | status=${cr.status}\n`);

        adapterResult.summary = cr.summary;
        adapterResult.usage = {
          inputTokens: cr.cost.tokens_input,
          outputTokens: cr.cost.tokens_output,
        };
        if (cr.cost.cost_usd != null) {
          adapterResult.costUsd = cr.cost.cost_usd;
        }
        if (cr.status === "failed" || cr.status === "blocked") {
          adapterResult.exitCode = 1;
          adapterResult.errorCode = cr.failure?.code ?? cr.status;
          adapterResult.errorMessage = cr.failure?.message ?? cr.summary;
        }
      } else {
        const issues = parsed.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`,
        ).join("; ");
        await onLog("stderr", `[http-adapter] contract validation failed: ${issues}\n`);
      }
    }

    await onLog("stdout", `[http-adapter] success status=${res.status}\n`);
    return adapterResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await onLog("stderr", `[http-adapter] error ${message}\n`);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
