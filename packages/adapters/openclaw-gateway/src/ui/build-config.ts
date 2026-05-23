import type { CreateConfigValues } from "@paperclipai/adapter-utils";

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function buildOpenClawGatewayConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.url) ac.url = v.url;
  const token = typeof v.gatewayToken === "string" ? v.gatewayToken.trim() : "";
  if (token) {
    ac.headers = { "x-openclaw-token": token };
  }
  const pcUrl = typeof v.paperclipApiUrl === "string" ? v.paperclipApiUrl.trim() : "";
  if (pcUrl) {
    ac.paperclipApiUrl = pcUrl;
  }
  // Defaults tuned for Next.js-style repos (lint + tsc + test + build); override per agent in Paperclip if shorter runs suffice.
  ac.timeoutSec = 900;
  ac.waitTimeoutMs = 900_000;
  ac.sessionKeyStrategy = "fixed";
  // Placeholder; Paperclip server seeds paperclip:agent:<id> on hire unless overridden.
  ac.sessionKey = "paperclip";
  ac.role = "operator";
  ac.scopes = ["operator.admin"];
  const payloadTemplate = parseJsonObject(v.payloadTemplateJson ?? "");
  if (payloadTemplate) ac.payloadTemplate = payloadTemplate;
  const runtimeServices = parseJsonObject(v.runtimeServicesJson ?? "");
  if (runtimeServices && Array.isArray(runtimeServices.services)) {
    ac.workspaceRuntime = runtimeServices;
  }
  return ac;
}
