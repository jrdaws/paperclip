import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { useState } from "react";

type DashboardPayload = {
  syncLagSeconds: number | null;
  deadLetterDepth: number;
  retryCount: number;
  configuredTools: number;
  rateLimitRemaining: number;
};

export function HttpBridgeWidget(_props: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<DashboardPayload>("dashboard");
  const replayLastFailure = usePluginAction("replay-last-failure");
  const [running, setRunning] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  if (loading) return <div>Loading HTTP bridge status...</div>;
  if (error) return <div>HTTP bridge error: {error.message}</div>;

  async function onReplayLastFailure() {
    setRunning(true);
    setResultText(null);
    try {
      const result = await replayLastFailure({});
      const payload = result as { ok?: boolean; message?: string; toolName?: string };
      if (!payload.ok) {
        setResultText(payload.message ?? "No replay performed.");
      } else {
        setResultText(`Replayed ${payload.toolName ?? "last tool"} successfully.`);
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setResultText(`Replay failed: ${message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <strong>HTTP Bridge</strong>
      <div>Configured tools: {data?.configuredTools ?? 0}</div>
      <div>Sync lag (seconds): {data?.syncLagSeconds ?? "n/a"}</div>
      <div>DLQ depth: {data?.deadLetterDepth ?? 0}</div>
      <div>Retry count: {data?.retryCount ?? 0}</div>
      <div>Rate-limit remaining: {data?.rateLimitRemaining ?? 0}</div>
      <button type="button" onClick={onReplayLastFailure} disabled={running}>
        {running ? "Replaying..." : "Replay Last Failure"}
      </button>
      {resultText ? <div>{resultText}</div> : null}
    </section>
  );
}
