import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface AgentMigrationDetail {
  agent_id: string;
  last_version: string;
  last_seen: string;
  v1alpha_count: number;
  v1beta_count: number;
  migrated: boolean;
}

interface ContractStatusData {
  contract_versions: {
    current_latest: string;
    accepted: string[];
  };
  version_distribution: {
    v1alpha: number;
    v1beta: number;
    total_events: number;
    v1beta_percentage: number;
  };
  sunset: {
    status: "not_configured" | "scheduled" | "imminent" | "enforcing";
    deadline: string | null;
    days_remaining: number | null;
    v1alpha_behavior: "warn" | "reject";
  };
  agents: {
    total: number;
    migrated: number;
    migration_percentage: number;
    details: AgentMigrationDetail[];
  };
  persistence?: string;
}

function SunsetBadge({ status }: { status: ContractStatusData["sunset"]["status"] }) {
  const styles: Record<string, string> = {
    not_configured: "bg-muted text-muted-foreground",
    scheduled: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    imminent: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    enforcing: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };
  const labels: Record<string, string> = {
    not_configured: "No deadline",
    scheduled: "Scheduled",
    imminent: "Imminent",
    enforcing: "Enforcing",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${styles[status] ?? styles.not_configured}`}>
      {labels[status] ?? status}
    </span>
  );
}

function MigrationBar({ percentage }: { percentage: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all bg-emerald-500 dark:bg-emerald-400"
          style={{ width: `${Math.max(percentage, 2)}%` }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums text-muted-foreground w-10 text-right">
        {percentage}%
      </span>
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentMigrationDetail }) {
  const total = agent.v1alpha_count + agent.v1beta_count;
  const betaPct = total > 0 ? Math.round((agent.v1beta_count / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between py-1.5 px-2 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${agent.migrated ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        <span className="font-mono text-xs truncate max-w-[140px]">{agent.agent_id}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {agent.v1beta_count}v1b / {agent.v1alpha_count}v1a
        </span>
        <span className="text-xs font-mono tabular-nums text-muted-foreground w-8 text-right">
          {betaPct}%
        </span>
        <span className="text-[10px] text-muted-foreground">
          {agent.last_version}
        </span>
      </div>
    </div>
  );
}

export function ContractStatusCard({ bridgeUrl }: { bridgeUrl?: string }) {
  const [expanded, setExpanded] = useState(false);

  const baseUrl = bridgeUrl || "/api/bridge";
  const { data, isLoading, error } = useQuery<ContractStatusData>({
    queryKey: ["contract-status", baseUrl],
    queryFn: async () => {
      const resp = await fetch(`${baseUrl}/contract-status`);
      if (!resp.ok) throw new Error(`Contract status: ${resp.status}`);
      return resp.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground animate-pulse">Loading contract status...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">
          Contract status unavailable (bridge offline)
        </div>
      </div>
    );
  }

  const { version_distribution: dist, sunset, agents } = data;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Contract Migration</h3>
          <SunsetBadge status={sunset.status} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xl font-semibold tabular-nums">{dist.v1beta}</div>
            <div className="text-[10px] text-muted-foreground">v1beta events</div>
          </div>
          <div>
            <div className="text-xl font-semibold tabular-nums">{dist.v1alpha}</div>
            <div className="text-[10px] text-muted-foreground">v1alpha events</div>
          </div>
          <div>
            <div className="text-xl font-semibold tabular-nums">
              {sunset.days_remaining != null ? sunset.days_remaining : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {sunset.days_remaining != null ? "days to deadline" : "no deadline"}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">v1beta adoption</span>
            <span className="text-[10px] text-muted-foreground">
              {agents.migrated}/{agents.total} agents migrated
            </span>
          </div>
          <MigrationBar percentage={dist.v1beta_percentage} />
        </div>

        {agents.total > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            {expanded ? "▾ Hide agent details" : "▸ Show agent details"}
          </button>
        )}

        {expanded && agents.details.length > 0 && (
          <div className="rounded border border-border divide-y divide-border">
            {agents.details.map((a) => (
              <AgentRow key={a.agent_id} agent={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
