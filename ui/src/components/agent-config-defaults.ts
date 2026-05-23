import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export const defaultCreateValues: CreateConfigValues = {
  adapterType: "claude_local",
  cwd: "",
  instructionsFilePath: "",
  promptTemplate: "",
  model: "",
  thinkingEffort: "",
  chrome: false,
  dangerouslySkipPermissions: true,
  search: false,
  dangerouslyBypassSandbox: false,
  command: "",
  args: "",
  extraArgs: "",
  envVars: "",
  envBindings: {},
  url: "",
  httpRuntimeProfile: "custom-http",
  httpRuntimeHeader: "",
  bootstrapPrompt: "",
  payloadTemplateJson: "",
  workspaceStrategyType: "project_primary",
  workspaceBaseRef: "",
  workspaceBranchTemplate: "",
  worktreeParentDir: "",
  runtimeServicesJson: "",
  gatewayToken: "",
  paperclipApiUrl: "",
  maxTurnsPerRun: 300,
  heartbeatEnabled: false,
  intervalSec: 300,
};

/** Saved adapterConfig shape when editing an agent (Paperclip DB). */
export const OPENCLAW_GATEWAY_EDIT_DEFAULTS: Record<string, unknown> = {
  url: "ws://127.0.0.1:18789",
  paperclipApiUrl: "http://127.0.0.1:3100",
  timeoutSec: 900,
  waitTimeoutMs: 900_000,
  sessionKeyStrategy: "fixed",
  sessionKey: "paperclip",
  role: "operator",
  scopes: ["operator.admin"],
  payloadTemplate: {
    agentId: "claw",
    model: "openai/gpt-5.3-codex",
  },
};

/** Create-flow form defaults for openclaw_gateway (token added in UI or via API). */
export function openclawGatewayCreatePreset(): Partial<CreateConfigValues> {
  return {
    url: "ws://127.0.0.1:18789",
    paperclipApiUrl: "http://127.0.0.1:3100",
    payloadTemplateJson: JSON.stringify(
      { agentId: "claw", model: "openai/gpt-5.3-codex" },
      null,
      2,
    ),
    gatewayToken: "",
    heartbeatEnabled: true,
    intervalSec: 300,
  };
}
