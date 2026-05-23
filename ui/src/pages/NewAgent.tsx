import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { agentsApi } from "../api/agents";
import { companySkillsApi } from "../api/companySkills";
import { queryKeys } from "../lib/queryKeys";
import { AGENT_ROLES } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Shield } from "lucide-react";
import { cn, agentUrl } from "../lib/utils";
import { roleLabels } from "../components/agent-config-primitives";
import { AgentConfigForm, type CreateConfigValues } from "../components/AgentConfigForm";
import {
  defaultCreateValues,
  openclawGatewayCreatePreset,
} from "../components/agent-config-defaults";
import { getUIAdapter } from "../adapters";
import { ReportsToPicker } from "../components/ReportsToPicker";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";

const SUPPORTED_ADVANCED_ADAPTER_TYPES = new Set<CreateConfigValues["adapterType"]>([
  "claude_local",
  "codex_local",
  "gemini_local",
  "opencode_local",
  "pi_local",
  "cursor",
  "hermes_local",
  "openclaw_gateway",
  "http",
]);

export interface AgentTemplate {
  id: string;
  name: string;
  title: string;
  role: string;
  adapterType: CreateConfigValues["adapterType"];
  description: string;
  configOverrides?: Partial<CreateConfigValues>;
  suggestedSkillPatterns?: string[];
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "cursor-engineer",
    name: "Forge",
    title: "Full-Stack Engineer",
    role: "engineer",
    adapterType: "cursor",
    description: "Cursor IDE agent with full file access, shell, git, and 48 skills",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 300,
      dangerouslySkipPermissions: true,
      maxTurnsPerRun: 300,
    },
    suggestedSkillPatterns: ["audit", "verify", "react", "optimize"],
  },
  {
    id: "claude-engineer",
    name: "Forge-CLI",
    title: "CLI Engineer",
    role: "engineer",
    adapterType: "claude_local",
    description: "Claude Code CLI agent with shell, file access, and workspace skills",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 300,
      dangerouslySkipPermissions: true,
      maxTurnsPerRun: 300,
    },
    suggestedSkillPatterns: ["audit", "verify", "finishing"],
  },
  {
    id: "cursor-researcher",
    name: "Scout",
    title: "Research Analyst",
    role: "researcher",
    adapterType: "cursor",
    description: "Cursor agent optimized for deep research with web search and browser",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 600,
      dangerouslySkipPermissions: true,
    },
    suggestedSkillPatterns: ["research", "scraper", "content"],
  },
  {
    id: "cursor-qa",
    name: "Sentinel",
    title: "QA Reviewer",
    role: "qa",
    adapterType: "cursor",
    description: "Code review, testing, and audit specialist with lint and type-check access",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 300,
      dangerouslySkipPermissions: true,
      maxTurnsPerRun: 200,
    },
    suggestedSkillPatterns: ["audit", "verify", "review", "normalize"],
  },
  {
    id: "claude-ops",
    name: "Atlas",
    title: "Operations Manager",
    role: "pm",
    adapterType: "claude_local",
    description: "Claude CLI agent for task coordination, triage, and operational oversight",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 180,
      dangerouslySkipPermissions: true,
    },
    suggestedSkillPatterns: ["audit", "verify", "self-improvement"],
  },
  {
    id: "crewai-strategist",
    name: "Strategist",
    title: "Strategy Agent",
    role: "general",
    adapterType: "http",
    description: "CrewAI agent with tiered LLM routing for structured strategic analysis",
    configOverrides: {
      httpRuntimeProfile: "http+crewai",
      httpRuntimeHeader: "CrewAI",
      url: "http://127.0.0.1:8000/webhook",
      heartbeatEnabled: true,
      intervalSec: 300,
    },
  },
  {
    id: "langgraph-pipeline",
    name: "Pipeline",
    title: "Pipeline Runner",
    role: "general",
    adapterType: "http",
    description: "LangGraph agent with durable checkpoints for long-running workflows",
    configOverrides: {
      httpRuntimeProfile: "http+langgraph",
      httpRuntimeHeader: "LangGraph",
      url: "http://127.0.0.1:8001/webhook",
      heartbeatEnabled: true,
      intervalSec: 600,
    },
  },
  {
    id: "codex-builder",
    name: "Spark",
    title: "Speed Builder",
    role: "engineer",
    adapterType: "codex_local",
    description: "Codex agent — fast, sandboxed execution optimized for bulk and cost-sensitive tasks",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 300,
    },
    suggestedSkillPatterns: ["audit", "verify"],
  },
  {
    id: "openclaw-relay",
    name: "Relay",
    title: "Gateway Agent",
    role: "general",
    adapterType: "openclaw_gateway",
    description: "OpenClaw Gateway agent dispatched by Paperclip via WebSocket protocol",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 300,
    },
    suggestedSkillPatterns: ["audit", "self-improvement"],
  },
  {
    id: "cursor-ceo",
    name: "Chief",
    title: "Chief Executive Officer",
    role: "ceo",
    adapterType: "cursor",
    description: "CEO agent with hiring authority, template catalog access, and strategic coordination skills",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 180,
      dangerouslySkipPermissions: true,
      maxTurnsPerRun: 300,
    },
    suggestedSkillPatterns: ["hiring", "audit", "self-improvement", "status"],
  },
  {
    id: "openclaw-ceo",
    name: "Chief",
    title: "Chief Executive Officer",
    role: "ceo",
    adapterType: "openclaw_gateway",
    description:
      "CEO via OpenClaw Gateway — wakes your OpenClaw agent (Codex in payload). Paste gateway token after create.",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 180,
      maxTurnsPerRun: 300,
      dangerouslySkipPermissions: true,
    },
    suggestedSkillPatterns: ["hiring", "audit", "self-improvement", "status"],
  },
];

export function createValuesForAdapterType(
  adapterType: CreateConfigValues["adapterType"],
): CreateConfigValues {
  const { adapterType: _discard, ...defaults } = defaultCreateValues;
  const nextValues: CreateConfigValues = { ...defaults, adapterType };
  if (adapterType === "codex_local") {
    nextValues.model = DEFAULT_CODEX_LOCAL_MODEL;
    nextValues.dangerouslyBypassSandbox =
      DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
  } else if (adapterType === "gemini_local") {
    nextValues.model = DEFAULT_GEMINI_LOCAL_MODEL;
  } else if (adapterType === "cursor") {
    nextValues.model = DEFAULT_CURSOR_LOCAL_MODEL;
    nextValues.heartbeatEnabled = true;
    nextValues.intervalSec = 300;
    nextValues.dangerouslySkipPermissions = true;
  } else if (adapterType === "claude_local") {
    nextValues.heartbeatEnabled = true;
    nextValues.intervalSec = 300;
    nextValues.dangerouslySkipPermissions = true;
  } else if (adapterType === "opencode_local") {
    nextValues.model = "";
  } else if (adapterType === "http") {
    nextValues.httpRuntimeProfile = "http+crewai";
    nextValues.httpRuntimeHeader = "CrewAI";
    nextValues.url = "http://127.0.0.1:8000/webhook";
    nextValues.heartbeatEnabled = true;
    nextValues.intervalSec = 300;
  } else if (adapterType === "openclaw_gateway") {
    Object.assign(nextValues, openclawGatewayCreatePreset());
  }
  return nextValues;
}

export function createValuesForTemplate(template: AgentTemplate): CreateConfigValues {
  const base = createValuesForAdapterType(template.adapterType);
  if (template.configOverrides) {
    return { ...base, ...template.configOverrides, adapterType: template.adapterType };
  }
  return base;
}

export function NewAgent() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetAdapterType = searchParams.get("adapterType");
  const presetWebhookUrl = searchParams.get("webhookUrl");
  const presetRuntimeProfile = searchParams.get("runtimeProfile");
  const presetTemplateId = searchParams.get("template");
  const matchedTemplate = presetTemplateId
    ? AGENT_TEMPLATES.find((t) => t.id === presetTemplateId)
    : undefined;

  const [name, setName] = useState(matchedTemplate?.name ?? "");
  const [title, setTitle] = useState(matchedTemplate?.title ?? "");
  const [role, setRole] = useState(matchedTemplate?.role ?? "general");
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<CreateConfigValues>(
    matchedTemplate ? createValuesForTemplate(matchedTemplate) : defaultCreateValues,
  );
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<string[]>([]);
  const [skillsAutoSelected, setSkillsAutoSelected] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching,
  } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.agents.adapterModels(selectedCompanyId, configValues.adapterType)
      : ["agents", "none", "adapter-models", configValues.adapterType],
    queryFn: () => agentsApi.adapterModels(selectedCompanyId!, configValues.adapterType),
    enabled: Boolean(selectedCompanyId),
  });

  const { data: companySkills } = useQuery({
    queryKey: queryKeys.companySkills.list(selectedCompanyId ?? ""),
    queryFn: () => companySkillsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const isFirstAgent = !agents || agents.length === 0;
  const effectiveRole = isFirstAgent ? "ceo" : role;

  useEffect(() => {
    setBreadcrumbs([
      { label: "Agents", href: "/agents" },
      { label: "New Agent" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (isFirstAgent) {
      if (!name) setName("CEO");
      if (!title) setTitle("CEO");
    }
  }, [isFirstAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (skillsAutoSelected || !matchedTemplate?.suggestedSkillPatterns?.length || !companySkills?.length) return;
    const patterns = matchedTemplate.suggestedSkillPatterns;
    const matched = companySkills
      .filter((skill) => !skill.key.startsWith("paperclipai/paperclip/"))
      .filter((skill) =>
        patterns.some((p) => {
          const lower = p.toLowerCase();
          return skill.key.toLowerCase().includes(lower) || skill.name.toLowerCase().includes(lower);
        }),
      )
      .map((skill) => skill.key);
    if (matched.length > 0) {
      setSelectedSkillKeys(matched);
      setSkillsAutoSelected(true);
    }
  }, [matchedTemplate, companySkills, skillsAutoSelected]);

  useEffect(() => {
    const requested = presetAdapterType;
    if (!requested) return;
    if (!SUPPORTED_ADVANCED_ADAPTER_TYPES.has(requested as CreateConfigValues["adapterType"])) {
      return;
    }
    setConfigValues((prev) => {
      if (prev.adapterType === requested) {
        return prev;
      }
      const seeded = createValuesForAdapterType(requested as CreateConfigValues["adapterType"]);
      if (requested === "http") {
        return {
          ...seeded,
          ...(presetWebhookUrl ? { url: presetWebhookUrl } : {}),
          ...(presetRuntimeProfile === "http+langgraph"
            ? { httpRuntimeProfile: "http+langgraph", httpRuntimeHeader: "LangGraph" }
            : {}),
        };
      }
      return seeded;
    });
  }, [presetAdapterType, presetRuntimeProfile, presetWebhookUrl]);

  const createAgent = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      agentsApi.hire(selectedCompanyId!, data),
    onSuccess: (result) => {
      if (matchedTemplate) {
        fetch(`/api/agent-templates/${matchedTemplate.id}/use`, { method: "POST" }).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(agentUrl(result.agent));
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Failed to create agent");
    },
  });

  function buildAdapterConfig() {
    const adapter = getUIAdapter(configValues.adapterType);
    return adapter.buildAdapterConfig(configValues);
  }

  function handleSubmit() {
    if (!selectedCompanyId || !name.trim()) return;
    setFormError(null);
    if (configValues.adapterType === "opencode_local") {
      const selectedModel = configValues.model.trim();
      if (!selectedModel) {
        setFormError("OpenCode requires an explicit model in provider/model format.");
        return;
      }
      if (adapterModelsError) {
        setFormError(
          adapterModelsError instanceof Error
            ? adapterModelsError.message
            : "Failed to load OpenCode models.",
        );
        return;
      }
      if (adapterModelsLoading || adapterModelsFetching) {
        setFormError("OpenCode models are still loading. Please wait and try again.");
        return;
      }
      const discovered = adapterModels ?? [];
      if (!discovered.some((entry) => entry.id === selectedModel)) {
        setFormError(
          discovered.length === 0
            ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
            : `Configured OpenCode model is unavailable: ${selectedModel}`,
        );
        return;
      }
    }
    createAgent.mutate({
      name: name.trim(),
      role: effectiveRole,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(reportsTo ? { reportsTo } : {}),
      ...(selectedSkillKeys.length > 0 ? { desiredSkills: selectedSkillKeys } : {}),
      adapterType: configValues.adapterType,
      adapterConfig: buildAdapterConfig(),
      runtimeConfig: {
        heartbeat: {
          enabled: configValues.heartbeatEnabled,
          intervalSec: configValues.intervalSec,
          wakeOnDemand: true,
          cooldownSec: 10,
          maxConcurrentRuns: 1,
        },
      },
      budgetMonthlyCents: 0,
    });
  }

  const availableSkills = (companySkills ?? []).filter((skill) => !skill.key.startsWith("paperclipai/paperclip/"));

  function toggleSkill(key: string, checked: boolean) {
    setSelectedSkillKeys((prev) => {
      if (checked) {
        return prev.includes(key) ? prev : [...prev, key];
      }
      return prev.filter((value) => value !== key);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">New Agent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Advanced agent configuration
        </p>
      </div>

      <div className="border border-border">
        {/* Name */}
        <div className="px-4 pt-4 pb-2">
          <input
            className="w-full text-lg font-semibold bg-transparent outline-none placeholder:text-muted-foreground/50"
            placeholder="Agent name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Title */}
        <div className="px-4 pb-2">
          <input
            className="w-full bg-transparent outline-none text-sm text-muted-foreground placeholder:text-muted-foreground/40"
            placeholder="Title (e.g. VP of Engineering)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Property chips: Role + Reports To */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border flex-wrap">
          <Popover open={roleOpen} onOpenChange={setRoleOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors",
                  isFirstAgent && "opacity-60 cursor-not-allowed"
                )}
                disabled={isFirstAgent}
              >
                <Shield className="h-3 w-3 text-muted-foreground" />
                {roleLabels[effectiveRole] ?? effectiveRole}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-36 p-1" align="start">
              {AGENT_ROLES.map((r) => (
                <button
                  key={r}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                    r === role && "bg-accent"
                  )}
                  onClick={() => { setRole(r); setRoleOpen(false); }}
                >
                  {roleLabels[r] ?? r}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <ReportsToPicker
            agents={agents ?? []}
            value={reportsTo}
            onChange={setReportsTo}
            disabled={isFirstAgent}
          />
        </div>

        {/* Shared config form */}
        <AgentConfigForm
          mode="create"
          values={configValues}
          onChange={(patch) => setConfigValues((prev) => ({ ...prev, ...patch }))}
          adapterModels={adapterModels}
        />

        <div className="border-t border-border px-4 py-4">
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">Company skills</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional skills from the company library. Built-in Paperclip runtime skills are added automatically.
              </p>
            </div>
            {availableSkills.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No optional company skills installed yet.
              </p>
            ) : (
              <div className="space-y-3">
                {availableSkills.map((skill) => {
                  const inputId = `skill-${skill.id}`;
                  const checked = selectedSkillKeys.includes(skill.key);
                  return (
                    <div key={skill.id} className="flex items-start gap-3">
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={(next) => toggleSkill(skill.key, next === true)}
                      />
                      <label htmlFor={inputId} className="grid gap-1 leading-none">
                        <span className="text-sm font-medium">{skill.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {skill.description ?? skill.key}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3">
          {isFirstAgent && (
            <p className="text-xs text-muted-foreground mb-2">This will be the CEO</p>
          )}
          {formError && (
            <p className="text-xs text-destructive mb-2">{formError}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/agents")}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!name.trim() || createAgent.isPending}
              onClick={handleSubmit}
            >
              {createAgent.isPending ? "Creating…" : "Create agent"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
