import { useEffect, useRef, useState, useCallback } from "react";

export interface RunStatusUpdate {
  type: "run_update";
  run_id: string;
  status: "accepted" | "running" | "completed" | "failed";
  completed_at: string | null;
  has_result: boolean;
  has_error: boolean;
}

export type WsConnectionState = "connecting" | "connected" | "disconnected";

interface UseRunWebSocketOptions {
  orchestratorUrl: string | undefined;
  runId: string | undefined;
  enabled?: boolean;
  onUpdate?: (update: RunStatusUpdate) => void;
}

const MAX_RECONNECT_DELAY_MS = 15_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

function httpToWs(url: string): string {
  return url.replace(/^http/, "ws").replace(/\/webhook\/?$/, "");
}

/**
 * Connect to a CrewAI bridge WebSocket for real-time run status updates.
 *
 * When the run completes or fails, the bridge pushes a status event
 * instantly — no polling needed.
 */
export function useRunWebSocket({
  orchestratorUrl,
  runId,
  enabled = true,
  onUpdate,
}: UseRunWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<WsConnectionState>("disconnected");
  const [lastUpdate, setLastUpdate] = useState<RunStatusUpdate | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const isTerminal = lastUpdate?.status === "completed" || lastUpdate?.status === "failed";

  useEffect(() => {
    if (!orchestratorUrl || !runId || !enabled) return;
    if (isTerminal) return;

    let closed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      reconnectAttempt += 1;
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        BASE_RECONNECT_DELAY_MS * 2 ** Math.min(reconnectAttempt - 1, 4),
      );
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (closed) return;
      setConnectionState("connecting");
      const base = httpToWs(orchestratorUrl);
      const url = `${base}/ws/runs/${encodeURIComponent(runId)}`;

      try {
        socket = new WebSocket(url);
      } catch {
        setConnectionState("disconnected");
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        reconnectAttempt = 0;
        setConnectionState("connected");
      };

      socket.onmessage = (event) => {
        const raw = typeof event.data === "string" ? event.data : "";
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as RunStatusUpdate;
          if (parsed.type === "run_update" && parsed.run_id === runId) {
            setLastUpdate(parsed);
            onUpdateRef.current?.(parsed);
          }
        } catch {
          /* non-JSON payload — ignore */
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        setConnectionState("disconnected");
        if (closed) return;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      closed = true;
      clearReconnect();
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, "hook_cleanup");
      }
      setConnectionState("disconnected");
    };
  }, [orchestratorUrl, runId, enabled, isTerminal]);

  const reset = useCallback(() => {
    setLastUpdate(null);
    setConnectionState("disconnected");
  }, []);

  return {
    connectionState,
    lastUpdate,
    isTerminal,
    reset,
  };
}
