import type { PluginContext } from "@paperclipai/plugin-sdk";
import { readInstanceState } from "./state.js";

export type ConnectorDashboardTelemetry = {
  syncLagSeconds: number | null;
  deadLetterDepth: number;
  retryCount: number;
};

export async function readConnectorDashboardTelemetry(
  ctx: PluginContext,
  input: {
    namespace: string;
    lagSourceStateKey?: string;
    lagTimestampField?: string;
  },
): Promise<ConnectorDashboardTelemetry> {
  const deadLetter = await readInstanceState<Array<Record<string, unknown>>>(
    ctx,
    `${input.namespace}.dead-letter`,
    [],
  );
  const retryCount = await readInstanceState<number>(ctx, `${input.namespace}.retry-count`, 0);

  const lagSourceStateKey = input.lagSourceStateKey ?? `${input.namespace}.last-webhook`;
  const lagTimestampField = input.lagTimestampField ?? "at";
  const lagSource = await readInstanceState<Record<string, unknown> | string | null>(
    ctx,
    lagSourceStateKey,
    null,
  );

  const timestampValue = typeof lagSource === "string"
    ? lagSource
    : typeof lagSource?.[lagTimestampField] === "string"
      ? String(lagSource[lagTimestampField])
      : null;

  const syncLagSeconds = timestampValue
    ? Math.max(0, Math.floor((Date.now() - new Date(timestampValue).getTime()) / 1000))
    : null;

  return {
    syncLagSeconds,
    deadLetterDepth: deadLetter.length,
    retryCount,
  };
}
