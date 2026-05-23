import { useState, useCallback, useEffect, useRef } from "react";
import {
  useRunWebSocket,
  type RunStatusUpdate,
  type WsConnectionState,
} from "../../hooks/useRunWebSocket";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Radio,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  ExternalLink,
} from "lucide-react";

interface CrewRunStatusProps {
  orchestratorUrl: string | undefined;
  runId: string | undefined;
  onComplete?: (update: RunStatusUpdate) => void;
}

type RunStatus = "accepted" | "running" | "completed" | "failed" | "unknown";

const statusConfig: Record<
  RunStatus,
  { icon: typeof CheckCircle2; color: string; bg: string; label: string }
> = {
  accepted: {
    icon: Clock,
    color: "text-blue-500",
    bg: "bg-blue-500/10 border-blue-500/20",
    label: "Queued",
  },
  running: {
    icon: Loader2,
    color: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/20",
    label: "Running",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
    label: "Failed",
  },
  unknown: {
    icon: Clock,
    color: "text-muted-foreground",
    bg: "bg-muted/30 border-border",
    label: "Unknown",
  },
};

const wsStateConfig: Record<
  WsConnectionState,
  { icon: typeof Wifi; color: string; label: string }
> = {
  connecting: { icon: Loader2, color: "text-amber-400", label: "Connecting" },
  connected: { icon: Wifi, color: "text-emerald-400", label: "Live" },
  disconnected: { icon: WifiOff, color: "text-muted-foreground/40", label: "Offline" },
};

function ElapsedTimer({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      setElapsed(Math.floor((Date.now() - since) / 1000));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [since]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
      {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

export function CrewRunStatus({ orchestratorUrl, runId, onComplete }: CrewRunStatusProps) {
  const [startedAt] = useState(() => Date.now());
  const [pollResult, setPollResult] = useState<RunStatus>("accepted");
  const [pollError, setPollError] = useState<string | null>(null);

  const handleUpdate = useCallback(
    (update: RunStatusUpdate) => {
      if (update.status === "completed" || update.status === "failed") {
        onComplete?.(update);
      }
    },
    [onComplete],
  );

  const { connectionState, lastUpdate, isTerminal, reset } = useRunWebSocket({
    orchestratorUrl,
    runId,
    onUpdate: handleUpdate,
  });

  const fetchStatus = useCallback(async () => {
    if (!orchestratorUrl || !runId) return;
    try {
      const base = orchestratorUrl.replace(/\/webhook\/?$/, "");
      const resp = await fetch(`${base}/runs/${encodeURIComponent(runId)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        setPollError(`HTTP ${resp.status}`);
        return;
      }
      const data = await resp.json();
      setPollResult(data.status ?? "unknown");
      setPollError(null);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : "Fetch failed");
    }
  }, [orchestratorUrl, runId]);

  useEffect(() => {
    if (isTerminal || connectionState === "connected") return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus, isTerminal, connectionState]);

  if (!orchestratorUrl || !runId) return null;

  const currentStatus: RunStatus = lastUpdate?.status ?? pollResult;
  const cfg = statusConfig[currentStatus] ?? statusConfig.unknown;
  const wsCfg = wsStateConfig[connectionState];
  const StatusIcon = cfg.icon;
  const WsIcon = wsCfg.icon;

  const bridgeBase = orchestratorUrl.replace(/\/webhook\/?$/, "");
  const pollUrl = `${bridgeBase}/runs/${runId}`;

  return (
    <div className={`rounded-lg border ${cfg.bg} p-3 space-y-2.5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={`h-4 w-4 ${cfg.color} ${currentStatus === "running" ? "animate-spin" : ""}`}
          />
          <span className="text-sm font-medium">{cfg.label}</span>
          {!isTerminal && <ElapsedTimer since={startedAt} />}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1" title={`WebSocket: ${wsCfg.label}`}>
            <WsIcon
              className={`h-3 w-3 ${wsCfg.color} ${connectionState === "connecting" ? "animate-spin" : ""}`}
            />
            <span className={`text-[10px] ${wsCfg.color}`}>{wsCfg.label}</span>
          </div>
          {connectionState !== "connected" && !isTerminal && (
            <button
              onClick={fetchStatus}
              className="p-0.5 rounded hover:bg-accent/50 transition-colors"
              title="Refresh status"
            >
              <RefreshCw className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Radio className="h-2.5 w-2.5" />
          <span className="font-mono truncate">{runId}</span>
        </div>
        {lastUpdate?.completed_at && (
          <div className="text-[10px] text-muted-foreground">
            Finished at{" "}
            {new Date(lastUpdate.completed_at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        )}
        {pollError && (
          <div className="text-[10px] text-destructive">Poll error: {pollError}</div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border/30">
        <div className="flex items-center gap-2">
          {isTerminal && (
            <button
              onClick={reset}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
        <a
          href={pollUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors no-underline"
        >
          API <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}
