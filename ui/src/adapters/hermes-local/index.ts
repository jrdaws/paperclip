import type { UIAdapterModule, CreateConfigValues, TranscriptEntry } from "../types";
import { HermesLocalConfigFields } from "./config-fields";

function parseHermesStdoutLine(line: string, ts: string): TranscriptEntry[] {
  return [{ kind: "assistant", ts, text: line }];
}

function buildHermesConfig(values: CreateConfigValues): Record<string, unknown> {
  return {
    model: values.model || "anthropic/claude-sonnet-4",
    timeoutSec: 300,
    persistSession: true,
    ...(values.cwd ? { cwd: values.cwd } : {}),
    ...(values.instructionsFilePath ? { instructionsFilePath: values.instructionsFilePath } : {}),
  };
}

export const hermesLocalUIAdapter: UIAdapterModule = {
  type: "hermes_local",
  label: "Hermes Agent",
  parseStdoutLine: parseHermesStdoutLine,
  ConfigFields: HermesLocalConfigFields,
  buildAdapterConfig: buildHermesConfig,
};
