import { useState, useCallback } from "react";
import {
  Field,
  DraftInput,
  CollapsibleSection,
  HintIcon,
} from "../../components/agent-config-primitives";
import { Plus, Trash2, Users, ListTodo, Settings } from "lucide-react";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const smallInputClass =
  "w-full rounded-md border border-border px-2 py-1 bg-transparent outline-none text-xs font-mono placeholder:text-muted-foreground/40";
const btnClass =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors";
const deleteBtnClass =
  "inline-flex items-center rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors";

interface AgentEntry {
  id: string;
  role: string;
  goal: string;
  backstory: string;
  llm_tier: string;
  tools: string[];
  allow_delegation: boolean;
  verbose: boolean;
}

interface TaskEntry {
  id: string;
  description: string;
  expected_output: string;
  agent_id: string;
  context_task_ids: string[];
}

interface CrewConfig {
  process: "sequential" | "hierarchical";
  verbose: boolean;
  memory: boolean;
  manager_llm_tier: string;
}

interface CrewBuilderState {
  agents: AgentEntry[];
  tasks: TaskEntry[];
  crew: CrewConfig;
}

function emptyAgent(index: number): AgentEntry {
  return {
    id: `agent-${index + 1}`,
    role: "",
    goal: "",
    backstory: "",
    llm_tier: "T3",
    tools: [],
    allow_delegation: false,
    verbose: true,
  };
}

function emptyTask(index: number, agentId: string): TaskEntry {
  return {
    id: `task-${index + 1}`,
    description: "",
    expected_output: "",
    agent_id: agentId,
    context_task_ids: [],
  };
}

function parseState(json: string): CrewBuilderState | null {
  if (!json.trim()) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed?.agents && Array.isArray(parsed.agents)) return parsed as CrewBuilderState;
  } catch { /* invalid JSON */ }
  return null;
}

function serializeState(state: CrewBuilderState): string {
  const clean = {
    agents: state.agents.map((a) => {
      const out: Record<string, unknown> = { id: a.id, role: a.role, goal: a.goal };
      if (a.backstory) out.backstory = a.backstory;
      if (a.llm_tier !== "T3") out.llm_tier = a.llm_tier;
      if (a.tools.length > 0) out.tools = a.tools;
      if (a.allow_delegation) out.allow_delegation = true;
      if (a.verbose) out.verbose = true;
      return out;
    }),
    tasks: state.tasks.map((t) => {
      const out: Record<string, unknown> = { id: t.id, description: t.description, agent_id: t.agent_id };
      if (t.expected_output) out.expected_output = t.expected_output;
      if (t.context_task_ids.length > 0) out.context_task_ids = t.context_task_ids;
      return out;
    }),
    crew: {
      process: state.crew.process,
      ...(state.crew.verbose ? { verbose: true } : {}),
      ...(state.crew.memory ? { memory: true } : {}),
      ...(state.crew.process === "hierarchical" ? { manager_llm_tier: state.crew.manager_llm_tier } : {}),
    },
  };
  return JSON.stringify(clean, null, 2);
}

const defaultCrewConfig: CrewConfig = {
  process: "sequential",
  verbose: true,
  memory: false,
  manager_llm_tier: "T2",
};

export function CrewBuilderFields({
  payloadJson,
  onPayloadChange,
}: {
  payloadJson: string;
  onPayloadChange: (json: string) => void;
}) {
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [tasksOpen, setTasksOpen] = useState(true);
  const [crewOpen, setCrewOpen] = useState(false);
  const [rawMode, setRawMode] = useState(false);

  const existing = parseState(payloadJson);
  const [state, setState] = useState<CrewBuilderState>(
    existing ?? {
      agents: [emptyAgent(0)],
      tasks: [emptyTask(0, "agent-1")],
      crew: { ...defaultCrewConfig },
    },
  );

  const commit = useCallback(
    (next: CrewBuilderState) => {
      setState(next);
      const hasContent = next.agents.some((a) => a.role.trim());
      onPayloadChange(hasContent ? serializeState(next) : "");
    },
    [onPayloadChange],
  );

  const updateAgent = (idx: number, patch: Partial<AgentEntry>) => {
    const next = { ...state, agents: state.agents.map((a, i) => (i === idx ? { ...a, ...patch } : a)) };
    commit(next);
  };

  const addAgent = () => {
    const next = { ...state, agents: [...state.agents, emptyAgent(state.agents.length)] };
    commit(next);
  };

  const removeAgent = (idx: number) => {
    const removedId = state.agents[idx].id;
    const agents = state.agents.filter((_, i) => i !== idx);
    const tasks = state.tasks.map((t) => ({
      ...t,
      agent_id: t.agent_id === removedId ? (agents[0]?.id ?? "") : t.agent_id,
      context_task_ids: t.context_task_ids.filter((id) => id !== removedId),
    }));
    commit({ ...state, agents, tasks });
  };

  const updateTask = (idx: number, patch: Partial<TaskEntry>) => {
    const next = { ...state, tasks: state.tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t)) };
    commit(next);
  };

  const addTask = () => {
    const next = {
      ...state,
      tasks: [...state.tasks, emptyTask(state.tasks.length, state.agents[0]?.id ?? "")],
    };
    commit(next);
  };

  const removeTask = (idx: number) => {
    const removedId = state.tasks[idx].id;
    const tasks = state.tasks
      .filter((_, i) => i !== idx)
      .map((t) => ({ ...t, context_task_ids: t.context_task_ids.filter((id) => id !== removedId) }));
    commit({ ...state, tasks });
  };

  const updateCrew = (patch: Partial<CrewConfig>) => {
    commit({ ...state, crew: { ...state.crew, ...patch } });
  };

  if (rawMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Crew JSON (raw)</span>
          <button className={btnClass} onClick={() => setRawMode(false)}>
            Visual editor
          </button>
        </div>
        <textarea
          className={`${inputClass} min-h-[200px]`}
          value={payloadJson}
          onChange={(e) => {
            onPayloadChange(e.target.value);
            const parsed = parseState(e.target.value);
            if (parsed) setState(parsed);
          }}
          placeholder='{"agents": [...], "tasks": [...], "crew": {...}}'
        />
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium">Crew Builder</span>
        <button className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors" onClick={() => setRawMode(true)}>
          raw JSON
        </button>
      </div>

      <CollapsibleSection
        title={`Agents (${state.agents.length})`}
        icon={<Users className="h-3 w-3" />}
        open={agentsOpen}
        onToggle={() => setAgentsOpen(!agentsOpen)}
      >
        <div className="space-y-3">
          {state.agents.map((agent, idx) => (
            <div key={idx} className="rounded-md border border-border/50 p-2.5 space-y-2 bg-background/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground/60">{agent.id}</span>
                {state.agents.length > 1 && (
                  <button className={deleteBtnClass} onClick={() => removeAgent(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">ID</label>
                  <input
                    className={smallInputClass}
                    value={agent.id}
                    onChange={(e) => updateAgent(idx, { id: e.target.value.replace(/\s/g, "-") })}
                    placeholder="researcher"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">LLM Tier</label>
                  <select className={smallInputClass} value={agent.llm_tier} onChange={(e) => updateAgent(idx, { llm_tier: e.target.value })}>
                    <option value="T1">T1 — Premium (Claude Opus)</option>
                    <option value="T2">T2 — Balanced (GPT-4o)</option>
                    <option value="T3">T3 — Economy (GPT-4o-mini)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Role</label>
                <input className={smallInputClass} value={agent.role} onChange={(e) => updateAgent(idx, { role: e.target.value })} placeholder="Market Researcher" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">
                  Goal <HintIcon text="Supports {variable} placeholders resolved from context" />
                </label>
                <input className={smallInputClass} value={agent.goal} onChange={(e) => updateAgent(idx, { goal: e.target.value })} placeholder="Find comprehensive data on {topic}" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Backstory (optional)</label>
                <textarea
                  className={`${smallInputClass} min-h-[40px] resize-y`}
                  value={agent.backstory}
                  onChange={(e) => updateAgent(idx, { backstory: e.target.value })}
                  placeholder="20 years of market research experience..."
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">
                  Tools <HintIcon text="Comma-separated tool names from the bridge registry (see /capabilities)" />
                </label>
                <input
                  className={smallInputClass}
                  value={agent.tools.join(", ")}
                  onChange={(e) =>
                    updateAgent(idx, {
                      tools: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="web_search, exa_search"
                />
              </div>
              <div className="flex items-center gap-4 text-[10px]">
                <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={agent.allow_delegation} onChange={(e) => updateAgent(idx, { allow_delegation: e.target.checked })} className="rounded" />
                  Delegation
                </label>
                <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={agent.verbose} onChange={(e) => updateAgent(idx, { verbose: e.target.checked })} className="rounded" />
                  Verbose
                </label>
              </div>
            </div>
          ))}
          {state.agents.length < 10 && (
            <button className={btnClass} onClick={addAgent}>
              <Plus className="h-3 w-3" /> Add agent
            </button>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={`Tasks (${state.tasks.length})`}
        icon={<ListTodo className="h-3 w-3" />}
        open={tasksOpen}
        onToggle={() => setTasksOpen(!tasksOpen)}
      >
        <div className="space-y-3">
          {state.tasks.map((task, idx) => (
            <div key={idx} className="rounded-md border border-border/50 p-2.5 space-y-2 bg-background/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground/60">{task.id}</span>
                {state.tasks.length > 1 && (
                  <button className={deleteBtnClass} onClick={() => removeTask(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">ID</label>
                  <input
                    className={smallInputClass}
                    value={task.id}
                    onChange={(e) => updateTask(idx, { id: e.target.value.replace(/\s/g, "-") })}
                    placeholder="research-task"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Assigned agent</label>
                  <select className={smallInputClass} value={task.agent_id} onChange={(e) => updateTask(idx, { agent_id: e.target.value })}>
                    {state.agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id}{a.role ? ` — ${a.role}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Description</label>
                <textarea
                  className={`${smallInputClass} min-h-[40px] resize-y`}
                  value={task.description}
                  onChange={(e) => updateTask(idx, { description: e.target.value })}
                  placeholder="Research {topic} market landscape thoroughly"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Expected output (optional)</label>
                <input
                  className={smallInputClass}
                  value={task.expected_output}
                  onChange={(e) => updateTask(idx, { expected_output: e.target.value })}
                  placeholder="Comprehensive market report with data points"
                />
              </div>
              {state.tasks.length > 1 && (
                <div>
                  <label className="text-[10px] text-muted-foreground">
                    Depends on tasks <HintIcon text="Select tasks whose output is needed as context for this task" />
                  </label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {state.tasks
                      .filter((_, i) => i !== idx)
                      .map((t) => {
                        const selected = task.context_task_ids.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            className={`rounded px-1.5 py-0.5 text-[10px] border transition-colors ${
                              selected
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground/60 hover:border-muted-foreground/40"
                            }`}
                            onClick={() =>
                              updateTask(idx, {
                                context_task_ids: selected
                                  ? task.context_task_ids.filter((id) => id !== t.id)
                                  : [...task.context_task_ids, t.id],
                              })
                            }
                          >
                            {t.id}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ))}
          {state.tasks.length < 20 && (
            <button className={btnClass} onClick={addTask}>
              <Plus className="h-3 w-3" /> Add task
            </button>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Crew settings"
        icon={<Settings className="h-3 w-3" />}
        open={crewOpen}
        onToggle={() => setCrewOpen(!crewOpen)}
      >
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Process type</label>
            <select className={smallInputClass} value={state.crew.process} onChange={(e) => updateCrew({ process: e.target.value as "sequential" | "hierarchical" })}>
              <option value="sequential">Sequential — tasks run in order</option>
              <option value="hierarchical">Hierarchical — manager delegates to agents</option>
            </select>
          </div>
          {state.crew.process === "hierarchical" && (
            <div>
              <label className="text-[10px] text-muted-foreground">Manager LLM tier</label>
              <select className={smallInputClass} value={state.crew.manager_llm_tier} onChange={(e) => updateCrew({ manager_llm_tier: e.target.value })}>
                <option value="T1">T1 — Premium</option>
                <option value="T2">T2 — Balanced</option>
                <option value="T3">T3 — Economy</option>
              </select>
            </div>
          )}
          <div className="flex items-center gap-4 text-[10px]">
            <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={state.crew.verbose} onChange={(e) => updateCrew({ verbose: e.target.checked })} className="rounded" />
              Verbose logging
            </label>
            <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={state.crew.memory} onChange={(e) => updateCrew({ memory: e.target.checked })} className="rounded" />
              Crew memory
            </label>
          </div>
        </div>
      </CollapsibleSection>

      <div className="px-3 py-2 text-[10px] text-muted-foreground/60 bg-muted/20">
        {state.agents.filter((a) => a.role.trim()).length} agent{state.agents.filter((a) => a.role.trim()).length !== 1 ? "s" : ""},{" "}
        {state.tasks.filter((t) => t.description.trim()).length} task{state.tasks.filter((t) => t.description.trim()).length !== 1 ? "s" : ""},{" "}
        {state.crew.process} process
        {" · "}Use {"{"}<span className="font-mono">variable</span>{"}"} in text fields — resolved from context at runtime
      </div>
    </div>
  );
}
