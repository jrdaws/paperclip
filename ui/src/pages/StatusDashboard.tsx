import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ContractStatusCard } from "../components/ContractStatusCard";

interface ServiceHealth {
  id: string;
  name: string;
  url: string | null;
  status: "active" | "inactive" | "unknown";
  healthy: boolean;
  layer: string;
  responseTimeMs: number | null;
}

interface RuntimeBadge {
  id: string;
  badge: string;
  runtime: string;
  status: "active" | "inactive" | "unknown";
  healthy: boolean;
  capabilities: string;
  skills: number;
  tools: number;
  layer: string;
  lastChecked: string | null;
}

interface RuntimeSummary {
  total: number;
  active: number;
  primaries?: string[];
  secondaries?: string[];
  suffixes?: string[];
}

interface TemplateInfo {
  id: string;
  name: string;
  title: string;
  role: string;
  adapterType: string;
  usageCount: number;
}

interface TemplateAnalytics {
  analytics: { id: string; name: string; usageCount: number }[];
  totalUses: number;
}

interface RoutineInfo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  concurrencyPolicy: string;
  assigneeAgentId: string | null;
  triggers: {
    id: string;
    kind: string;
    label: string | null;
    enabled: boolean;
    nextRunAt: string | null;
    lastFiredAt: string | null;
  }[];
  lastRun?: {
    id: string;
    status: string;
    source: string;
    triggeredAt: string;
  } | null;
}

interface StatusData {
  timestamp: string;
  services: ServiceHealth[];
  summary: { total: number; active: number; inactive: number };
  runtimeBadges: RuntimeBadge[] | null;
  runtimeSummary: RuntimeSummary | null;
  templates: TemplateInfo[] | null;
  templateAnalytics: TemplateAnalytics | null;
  routines: RoutineInfo[] | null;
}

function StatusIndicator({ healthy }: { healthy: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${healthy ? "bg-emerald-500" : "bg-red-500"}`}
    />
  );
}

function ServiceCard({ service }: { service: ServiceHealth }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2.5">
        <StatusIndicator healthy={service.healthy} />
        <div>
          <div className="text-sm font-medium">{service.name}</div>
          <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
            {service.url ?? "no url"}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div
          className={`text-xs font-medium ${service.healthy ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
        >
          {service.status}
        </div>
        {service.responseTimeMs != null && (
          <div className="text-[10px] text-muted-foreground">
            {service.responseTimeMs}ms
          </div>
        )}
      </div>
    </div>
  );
}

function RuntimeBadgeRow({ badge }: { badge: RuntimeBadge }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 text-sm">
      <div className="flex items-center gap-2">
        <StatusIndicator healthy={badge.healthy} />
        <span className="font-mono text-xs text-muted-foreground w-16">{badge.badge}</span>
        <span className="font-medium">{badge.runtime}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{badge.capabilities}</span>
        <div className="flex items-center gap-1.5">
          {badge.skills > 0 && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
              {badge.skills} skills
            </span>
          )}
          {badge.tools > 0 && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
              {badge.tools} tools
            </span>
          )}
        </div>
        <span
          className={`text-xs font-medium ${badge.healthy ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
        >
          {badge.status}
        </span>
      </div>
    </div>
  );
}

function TemplateRow({ template }: { template: TemplateInfo }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{template.name}</span>
        <span className="text-xs text-muted-foreground">{template.title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {template.adapterType}
        </span>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {template.usageCount} uses
        </span>
      </div>
    </div>
  );
}

function RoutineRow({ routine }: { routine: RoutineInfo }) {
  const activeTriggers = routine.triggers.filter((t) => t.enabled);
  const nextRun = activeTriggers
    .map((t) => t.nextRunAt)
    .filter(Boolean)
    .sort()[0];

  return (
    <div className="flex items-center justify-between py-2 px-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <StatusIndicator healthy={routine.status === "active"} />
        <div className="min-w-0">
          <div className="font-medium truncate">{routine.title}</div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-2">
            {activeTriggers.length > 0 && (
              <span>{activeTriggers[0].label ?? activeTriggers[0].kind}</span>
            )}
            {activeTriggers.length === 0 && <span>no triggers</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {routine.lastRun && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
            last: {routine.lastRun.status}
          </span>
        )}
        {nextRun && (
          <span className="text-[10px] text-muted-foreground">
            next: {new Date(nextRun).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <span
          className={`text-xs font-medium ${routine.status === "active" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}
        >
          {routine.status}
        </span>
      </div>
    </div>
  );
}

export function StatusDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<StatusData>({
    queryKey: ["status-dashboard"],
    queryFn: async () => {
      const resp = await fetch("/api/status");
      if (!resp.ok) throw new Error(`Status API: ${resp.status}`);
      return resp.json();
    },
    refetchInterval: autoRefresh ? 10_000 : false,
    staleTime: 5_000,
  });

  useEffect(() => {
    document.title = "System Status — Paperclip";
    return () => { document.title = "Paperclip"; };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading system status...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load system status.{" "}
          <button className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const updatedAgo = dataUpdatedAt
    ? `${Math.round((Date.now() - dataUpdatedAt) / 1000)}s ago`
    : "";

  const activeBadges = data.runtimeBadges?.filter((b) => b.healthy) ?? [];
  const inactiveBadges = data.runtimeBadges?.filter((b) => !b.healthy) ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">System Status</h1>
          <p className="text-xs text-muted-foreground">
            {data.summary.active}/{data.summary.total} core services
            {data.runtimeSummary && (
              <> · {data.runtimeSummary.active}/{data.runtimeSummary.total} runtimes</>
            )}
            {data.routines && data.routines.length > 0 && (
              <> · {data.routines.filter((r) => r.status === "active").length} routines</>
            )}
            {updatedAgo && ` · updated ${updatedAgo}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-border"
            />
            Auto-refresh
          </label>
          <button
            onClick={() => refetch()}
            className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors"
          >
            Refresh now
          </button>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wider">
          Core Services
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.services.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      </section>

      {data.runtimeBadges && data.runtimeBadges.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wider">
            Runtime Badges ({activeBadges.length}/{data.runtimeBadges.length} active)
          </h2>
          <div className="rounded-lg border border-border divide-y divide-border bg-card">
            {activeBadges.map((b) => (
              <RuntimeBadgeRow key={b.id} badge={b} />
            ))}
            {inactiveBadges.length > 0 && activeBadges.length > 0 && (
              <div className="px-2 py-1 bg-muted/30">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Inactive
                </span>
              </div>
            )}
            {inactiveBadges.map((b) => (
              <RuntimeBadgeRow key={b.id} badge={b} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wider">
          Contract Status
        </h2>
        <ContractStatusCard />
      </section>

      {data.routines && data.routines.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wider">
            Routines ({data.routines.filter((r) => r.status === "active").length}/{data.routines.length} active)
          </h2>
          <div className="rounded-lg border border-border divide-y divide-border bg-card">
            {data.routines.map((r) => (
              <RoutineRow key={r.id} routine={r} />
            ))}
          </div>
        </section>
      )}

      {data.templates && (
        <section>
          <h2 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wider">
            Agent Templates ({data.templates.length})
          </h2>
          <div className="rounded-lg border border-border divide-y divide-border bg-card">
            {data.templates.map((t) => (
              <TemplateRow key={t.id} template={t} />
            ))}
          </div>
        </section>
      )}

      {data.templateAnalytics && data.templateAnalytics.totalUses > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wider">
            Template Usage
          </h2>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-2">
              Total template uses: {data.templateAnalytics.totalUses}
            </div>
            <div className="space-y-1.5">
              {data.templateAnalytics.analytics
                .filter((a) => a.usageCount > 0)
                .map((a) => {
                  const pct = Math.round(
                    (a.usageCount / data.templateAnalytics!.totalUses) * 100,
                  );
                  return (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <span className="w-20 text-right font-medium">{a.name}</span>
                      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full transition-all"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                        {a.usageCount}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      <div className="text-[10px] text-muted-foreground text-center pt-4">
        Last probe: {new Date(data.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}
