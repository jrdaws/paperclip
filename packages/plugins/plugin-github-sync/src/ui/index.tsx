import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { useState } from "react";

type DashboardPayload = {
  syncLagSeconds: number | null;
  deadLetterDepth: number;
  retryCount: number;
};

export function GitHubSyncWidget(_props: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<DashboardPayload>("dashboard");
  const reconcileNow = usePluginAction("reconcile-now");
  const [running, setRunning] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  if (loading) return <div>Loading GitHub sync status...</div>;
  if (error) return <div>GitHub sync error: {error.message}</div>;

  async function onReconcileNow() {
    setRunning(true);
    setResultText(null);
    try {
      const result = await reconcileNow({ dryRun: false, limit: 100 });
      const payload = result as { processed?: number };
      setResultText(`Reconciled ${payload.processed ?? 0} issues.`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setResultText(`Reconcile failed: ${message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <strong>GitHub Sync</strong>
      <div>Sync lag (seconds): {data?.syncLagSeconds ?? "n/a"}</div>
      <div>DLQ depth: {data?.deadLetterDepth ?? 0}</div>
      <div>Retry count: {data?.retryCount ?? 0}</div>
      <button type="button" onClick={onReconcileNow} disabled={running}>
        {running ? "Reconciling..." : "Reconcile Now"}
      </button>
      {resultText ? <div>{resultText}</div> : null}
    </section>
  );
}
