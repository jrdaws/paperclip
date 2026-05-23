import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { useState } from "react";

type StatusPayload = {
  syncLagSeconds: number | null;
  deadLetterDepth: number;
  retryCount: number;
  rateLimitRemaining: number;
};

export function SlackBridgeWidget(_props: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<StatusPayload>("dashboard");
  const sendTestMessage = usePluginAction("send-test-message");
  const clearDlq = usePluginAction("clear-dlq");
  const [busy, setBusy] = useState<null | "send" | "clear">(null);
  const [resultText, setResultText] = useState<string | null>(null);
  if (loading) return <div>Loading Slack bridge status...</div>;
  if (error) return <div>Slack bridge error: {error.message}</div>;

  async function onSendTestMessage() {
    setBusy("send");
    setResultText(null);
    try {
      const result = await sendTestMessage({});
      const payload = result as { channel?: string };
      setResultText(`Test message sent${payload.channel ? ` to ${payload.channel}` : ""}.`);
    } catch (nextError) {
      setResultText(`Send failed: ${nextError instanceof Error ? nextError.message : String(nextError)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onClearDlq() {
    setBusy("clear");
    setResultText(null);
    try {
      await clearDlq({});
      setResultText("DLQ cleared.");
    } catch (nextError) {
      setResultText(`Clear failed: ${nextError instanceof Error ? nextError.message : String(nextError)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <strong>Slack Bridge</strong>
      <div>Sync lag (seconds): {data?.syncLagSeconds ?? "n/a"}</div>
      <div>DLQ depth: {data?.deadLetterDepth ?? 0}</div>
      <div>Retry count: {data?.retryCount ?? 0}</div>
      <div>Rate-limit remaining: {data?.rateLimitRemaining ?? 0}</div>
      <button type="button" onClick={onSendTestMessage} disabled={busy !== null}>
        {busy === "send" ? "Sending..." : "Send Test Message"}
      </button>
      <button type="button" onClick={onClearDlq} disabled={busy !== null}>
        {busy === "clear" ? "Clearing..." : "Clear DLQ"}
      </button>
      {resultText ? <div>{resultText}</div> : null}
    </section>
  );
}
