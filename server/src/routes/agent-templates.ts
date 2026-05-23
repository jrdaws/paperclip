import { Router } from "express";
import * as fs from "node:fs";
import * as path from "node:path";

interface AgentTemplateDefinition {
  id: string;
  name: string;
  title: string;
  role: string;
  adapterType: string;
  description: string;
  configOverrides: Record<string, unknown>;
  suggestedSkillPatterns: string[];
}

const USAGE_FILE = path.resolve(
  import.meta.dirname ?? process.cwd(),
  "../../data/template-usage.json",
);

function loadUsageCounts(): Record<string, number> {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      return JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveUsageCounts(counts: Record<string, number>) {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(counts, null, 2));
  } catch {}
}

let usageCounts = loadUsageCounts();

const TEMPLATES: AgentTemplateDefinition[] = [
  {
    id: "cursor-engineer",
    name: "Forge",
    title: "Full-Stack Engineer",
    role: "engineer",
    adapterType: "cursor",
    description: "Cursor IDE agent with full file access, shell, git, and 48 skills",
    configOverrides: { heartbeatEnabled: true, intervalSec: 300, dangerouslySkipPermissions: true, maxTurnsPerRun: 300 },
    suggestedSkillPatterns: ["audit", "verify", "react", "optimize"],
  },
  {
    id: "claude-engineer",
    name: "Forge-CLI",
    title: "CLI Engineer",
    role: "engineer",
    adapterType: "claude_local",
    description: "Claude Code CLI agent with shell, file access, and workspace skills",
    configOverrides: { heartbeatEnabled: true, intervalSec: 300, dangerouslySkipPermissions: true, maxTurnsPerRun: 300 },
    suggestedSkillPatterns: ["audit", "verify", "finishing"],
  },
  {
    id: "cursor-researcher",
    name: "Scout",
    title: "Research Analyst",
    role: "researcher",
    adapterType: "cursor",
    description: "Cursor agent optimized for deep research with web search and browser",
    configOverrides: { heartbeatEnabled: true, intervalSec: 600, dangerouslySkipPermissions: true },
    suggestedSkillPatterns: ["research", "scraper", "content"],
  },
  {
    id: "cursor-qa",
    name: "Sentinel",
    title: "QA Reviewer",
    role: "qa",
    adapterType: "cursor",
    description: "Code review, testing, and audit specialist with lint and type-check access",
    configOverrides: { heartbeatEnabled: true, intervalSec: 300, dangerouslySkipPermissions: true, maxTurnsPerRun: 200 },
    suggestedSkillPatterns: ["audit", "verify", "review", "normalize"],
  },
  {
    id: "claude-ops",
    name: "Atlas",
    title: "Operations Manager",
    role: "pm",
    adapterType: "claude_local",
    description: "Claude CLI agent for task coordination, triage, and operational oversight",
    configOverrides: { heartbeatEnabled: true, intervalSec: 180, dangerouslySkipPermissions: true },
    suggestedSkillPatterns: ["audit", "verify", "self-improvement"],
  },
  {
    id: "crewai-strategist",
    name: "Strategist",
    title: "Strategy Agent",
    role: "general",
    adapterType: "http",
    description: "CrewAI agent with tiered LLM routing for structured strategic analysis",
    configOverrides: { httpRuntimeProfile: "http+crewai", httpRuntimeHeader: "CrewAI", url: "http://127.0.0.1:8000/webhook", heartbeatEnabled: true, intervalSec: 300 },
    suggestedSkillPatterns: [],
  },
  {
    id: "langgraph-pipeline",
    name: "Pipeline",
    title: "Pipeline Runner",
    role: "general",
    adapterType: "http",
    description: "LangGraph agent with durable checkpoints for long-running workflows",
    configOverrides: { httpRuntimeProfile: "http+langgraph", httpRuntimeHeader: "LangGraph", url: "http://127.0.0.1:8001/webhook", heartbeatEnabled: true, intervalSec: 600 },
    suggestedSkillPatterns: [],
  },
  {
    id: "codex-builder",
    name: "Spark",
    title: "Speed Builder",
    role: "engineer",
    adapterType: "codex_local",
    description: "Codex agent — fast, sandboxed execution optimized for bulk and cost-sensitive tasks",
    configOverrides: { heartbeatEnabled: true, intervalSec: 300 },
    suggestedSkillPatterns: ["audit", "verify"],
  },
  {
    id: "openclaw-relay",
    name: "Relay",
    title: "Gateway Agent",
    role: "general",
    adapterType: "openclaw_gateway",
    description: "OpenClaw Gateway agent dispatched by Paperclip via WebSocket protocol",
    configOverrides: { heartbeatEnabled: true, intervalSec: 300 },
    suggestedSkillPatterns: ["audit", "self-improvement"],
  },
  {
    id: "cursor-ceo",
    name: "Chief",
    title: "Chief Executive Officer",
    role: "ceo",
    adapterType: "cursor",
    description: "CEO agent with hiring authority, template catalog access, and strategic coordination skills",
    configOverrides: { heartbeatEnabled: true, intervalSec: 180, dangerouslySkipPermissions: true, maxTurnsPerRun: 300 },
    suggestedSkillPatterns: ["hiring", "audit", "self-improvement", "status"],
  },
  {
    id: "openclaw-ceo",
    name: "Chief",
    title: "Chief Executive Officer",
    role: "ceo",
    adapterType: "openclaw_gateway",
    description:
      "CEO via OpenClaw Gateway — Paperclip wakes your OpenClaw agent (Codex model in payload template). Paste gateway token after create.",
    configOverrides: {
      heartbeatEnabled: true,
      intervalSec: 180,
      maxTurnsPerRun: 300,
      dangerouslySkipPermissions: true,
    },
    suggestedSkillPatterns: ["hiring", "audit", "self-improvement", "status"],
  },
];

export function agentTemplateRoutes() {
  const router = Router();

  router.get("/agent-templates", (_req, res) => {
    const role = typeof _req.query.role === "string" ? _req.query.role : undefined;
    const adapterType = typeof _req.query.adapterType === "string" ? _req.query.adapterType : undefined;
    const sortByUsage = _req.query.sort === "usage";

    let filtered = TEMPLATES;
    if (role) filtered = filtered.filter((t) => t.role === role);
    if (adapterType) filtered = filtered.filter((t) => t.adapterType === adapterType);

    const withUsage = filtered.map((t) => ({
      ...t,
      usageCount: usageCounts[t.id] ?? 0,
    }));

    if (sortByUsage) {
      withUsage.sort((a, b) => b.usageCount - a.usageCount);
    }

    res.json({
      templates: withUsage,
      total: withUsage.length,
    });
  });

  router.get("/agent-templates/:templateId", (req, res) => {
    const template = TEMPLATES.find((t) => t.id === req.params.templateId);
    if (!template) {
      res.status(404).json({ error: `Template not found: ${req.params.templateId}` });
      return;
    }
    res.json({
      ...template,
      usageCount: usageCounts[template.id] ?? 0,
    });
  });

  router.post("/agent-templates/:templateId/use", (req, res) => {
    const template = TEMPLATES.find((t) => t.id === req.params.templateId);
    if (!template) {
      res.status(404).json({ error: `Template not found: ${req.params.templateId}` });
      return;
    }
    usageCounts[template.id] = (usageCounts[template.id] ?? 0) + 1;
    saveUsageCounts(usageCounts);
    res.json({
      templateId: template.id,
      usageCount: usageCounts[template.id],
    });
  });

  router.get("/agent-templates-analytics", (_req, res) => {
    const analytics = TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      usageCount: usageCounts[t.id] ?? 0,
    })).sort((a, b) => b.usageCount - a.usageCount);

    res.json({
      analytics,
      totalUses: analytics.reduce((sum, a) => sum + a.usageCount, 0),
    });
  });

  return router;
}
