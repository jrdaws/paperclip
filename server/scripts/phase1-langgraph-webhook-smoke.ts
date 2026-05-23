import { execute } from "../src/adapters/http/execute.js";
import type { AdapterExecutionContext } from "../src/adapters/types.js";

function assertRuntimeContract(payload: Record<string, unknown>) {
  const runtime =
    payload.runtime && typeof payload.runtime === "object"
      ? (payload.runtime as Record<string, unknown>)
      : null;
  if (!runtime) throw new Error("LangGraph smoke failed: response.runtime missing");
  if (runtime.framework !== "LangGraph") {
    throw new Error(`LangGraph smoke failed: runtime.framework expected LangGraph, got ${String(runtime.framework)}`);
  }
  if (runtime.installed !== true) {
    throw new Error(`LangGraph smoke failed: runtime.installed expected true, got ${String(runtime.installed)}`);
  }
  if (typeof runtime.version !== "string" || runtime.version.trim().length === 0) {
    throw new Error("LangGraph smoke failed: runtime.version missing or empty");
  }
}

async function main() {
  const webhookUrl = process.env.LANGGRAPH_WEBHOOK_URL ?? "http://127.0.0.1:8001/webhook";
  const liveLogs: string[] = [];

  let healthOk = false;
  try {
    const parsed = new URL(webhookUrl);
    const healthUrl = `${parsed.protocol}//${parsed.host}/health`;
    const res = await fetch(healthUrl);
    healthOk = res.ok;
    liveLogs.push(`[preflight] health ${healthUrl} status=${res.status}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    liveLogs.push(`[preflight] health check skipped/error=${msg}`);
  }

  const validTaskSpec = {
    contract_version: "v1alpha",
    task_id: "TASK-LANGGRAPH-001",
    goal_id: "GOAL-LANGGRAPH-BRIDGE",
    company_id: "COMPANY-ALPHA",
    assignee_agent_id: "AGENT-42",
    title: "LangGraph webhook smoke",
    instructions: "Acknowledge Paperclip webhook payload.",
    priority: "high",
    trace_context: { run_id: "RUN-LANGGRAPH-1001", correlation_id: "CORR-langgraph-bridge" },
  };

  const baseCtx: Omit<AdapterExecutionContext, "config" | "context" | "runId"> = {
    agent: {
      id: "AGENT-42",
      companyId: "COMPANY-ALPHA",
      name: "phase1-langgraph-smoke",
      adapterType: "http",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    onLog: async (stream, chunk) => {
      liveLogs.push(`[adapter:${stream}] ${chunk.trim()}`);
    },
  };

  const result = await execute({
    ...baseCtx,
    runId: "RUN-LANGGRAPH-SMOKE",
    config: { url: webhookUrl, method: "POST", payloadTemplate: { fixtureId: "LANGGRAPH_PHASE1_SMOKE" } },
    context: { taskSpec: validTaskSpec },
  });

  const responsePayload =
    result.resultJson && typeof result.resultJson === "object"
      ? (result.resultJson as Record<string, unknown>)
      : null;
  if (!responsePayload) {
    throw new Error("LangGraph smoke failed: HTTP adapter response JSON missing");
  }
  assertRuntimeContract(responsePayload);

  console.log(`LANGGRAPH_WEBHOOK_URL=${webhookUrl}`);
  console.log(`HEALTH=${healthOk ? "PASS" : "SOFT-BLOCK"}`);
  console.log("TOTAL: 1/1 PASS");
  console.log("LIVE_ADAPTER_LOGS_START");
  for (const line of liveLogs) console.log(line);
  console.log("LIVE_ADAPTER_LOGS_END");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
