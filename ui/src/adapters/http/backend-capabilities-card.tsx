import { useEffect, useState } from "react";

interface BackendCapabilities {
  label: string;
  framework: string;
  reachable: boolean;
  capabilities: {
    features?: Record<string, boolean>;
    checkpoint_backend?: string;
    checkpoint_durable?: boolean;
    version?: string;
    [key: string]: unknown;
  } | null;
}

interface CapabilitiesResponse {
  backends: Record<string, BackendCapabilities>;
  feature_matrix: Record<string, Record<string, boolean>>;
  routing_signals: {
    streaming_backend: string;
    hitl_backend: string;
    default_backend: string;
  };
}

const FEATURE_LABELS: Record<string, string> = {
  webhook: "Webhook",
  streaming: "SSE Streaming",
  hitl_interrupt: "HITL Interrupt",
  hitl_resume: "HITL Resume",
  checkpointer: "Checkpointer",
  dynamic_graphs: "Dynamic Graphs",
  dynamic_crews: "Dynamic Crews",
  model_routing: "Model Routing",
  async_execution: "Async Execution",
  template_substitution: "Template Vars",
  tool_registry: "Tool Registry",
  mc_integration: "MC Integration",
  contract_validation: "Contract Validation",
  paperclip_budget: "Budget Integration",
  cost_event_reporting: "Cost Events",
};

function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BackendCapabilitiesCard({
  orchestratorUrl,
}: {
  orchestratorUrl?: string;
}) {
  const [data, setData] = useState<CapabilitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orchestratorUrl) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = orchestratorUrl.replace(/\/webhook\/?$/, "/capabilities");
    fetch(url, { signal: AbortSignal.timeout(5000) })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [orchestratorUrl]);

  if (!orchestratorUrl) return null;
  if (loading) {
    return (
      <div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground animate-pulse">
        Loading backend capabilities...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        Capabilities unavailable: {error}
      </div>
    );
  }
  if (!data) return null;

  const allFeatures = new Set<string>();
  for (const feats of Object.values(data.feature_matrix)) {
    for (const key of Object.keys(feats)) allFeatures.add(key);
  }
  const sortedFeatures = [...allFeatures].sort();
  const backends = Object.keys(data.backends);

  return (
    <div className="rounded-md border border-border bg-card px-3 py-3 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground text-sm">Backend Capabilities</span>
        <span className="text-muted-foreground">
          {backends.filter((b) => data.backends[b].reachable).length}/{backends.length} reachable
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="py-1 pr-3 font-medium text-muted-foreground">Feature</th>
              {backends.map((b) => (
                <th key={b} className="py-1 px-2 font-medium text-center">
                  <span className={data.backends[b].reachable ? "text-foreground" : "text-muted-foreground line-through"}>
                    {data.backends[b].framework}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedFeatures.map((feat) => (
              <tr key={feat} className="border-b border-border/50">
                <td className="py-1 pr-3 text-muted-foreground">{featureLabel(feat)}</td>
                {backends.map((b) => {
                  const val = data.feature_matrix[b]?.[feat];
                  return (
                    <td key={b} className="py-1 px-2 text-center">
                      {val === true ? (
                        <span className="text-emerald-500">Yes</span>
                      ) : val === false ? (
                        <span className="text-muted-foreground/50">-</span>
                      ) : (
                        <span className="text-muted-foreground/30">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 text-muted-foreground pt-1">
        <span>Default: <strong className="text-foreground">{data.routing_signals.default_backend}</strong></span>
        <span>Streaming: <strong className="text-foreground">{data.routing_signals.streaming_backend}</strong></span>
        <span>HITL: <strong className="text-foreground">{data.routing_signals.hitl_backend}</strong></span>
      </div>
    </div>
  );
}
