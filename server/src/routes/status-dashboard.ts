import { Router } from "express";

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
  healthCheckUrl: string | null;
  capabilities: string;
  skills: number;
  tools: number;
  layer: string;
  lastChecked: string | null;
}

interface RuntimeBadgesResponse {
  badges: RuntimeBadge[];
  summary: {
    total: number;
    active: number;
    primaries?: string[];
    secondaries?: string[];
    suffixes?: string[];
    healthyServices?: { id: string; url: string }[];
  };
  checkedAt: string;
}

const MC_URL = process.env.MISSION_CONTROL_URL ?? "http://127.0.0.1:3000";

async function probeService(id: string, name: string, url: string | null, layer: string): Promise<ServiceHealth> {
  if (!url) {
    return { id, name, url, status: "unknown", healthy: false, layer, responseTimeMs: null };
  }
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;
    return {
      id,
      name,
      url,
      status: response.ok ? "active" : "inactive",
      healthy: response.ok,
      layer,
      responseTimeMs,
    };
  } catch {
    return { id, name, url, status: "inactive", healthy: false, layer, responseTimeMs: Date.now() - start };
  }
}

async function fetchRuntimeBadges(): Promise<RuntimeBadgesResponse | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${MC_URL}/api/runtime-badges`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    return await resp.json() as RuntimeBadgesResponse;
  } catch {
    return null;
  }
}

const CORE_SERVICES = [
  { id: "paperclip", name: "Paperclip", url: "http://127.0.0.1:3100/api/health", layer: "primary" },
  { id: "crewai", name: "CrewAI Bridge", url: "http://127.0.0.1:8000/health", layer: "primary" },
  { id: "langgraph", name: "LangGraph Bridge", url: "http://127.0.0.1:8001/health", layer: "primary" },
];

export function statusDashboardRoutes() {
  const router = Router();

  router.get("/status", async (_req, res) => {
    const [coreProbes, mcBadges] = await Promise.all([
      Promise.all(CORE_SERVICES.map((s) => probeService(s.id, s.name, s.url, s.layer))),
      fetchRuntimeBadges(),
    ]);

    const paperclipSelf = coreProbes.find((s) => s.id === "paperclip");
    if (paperclipSelf) {
      paperclipSelf.status = "active";
      paperclipSelf.healthy = true;
      paperclipSelf.responseTimeMs = 0;
    }

    const mcService: ServiceHealth = {
      id: "mc",
      name: "Mission Control",
      url: `${MC_URL}/api/runtime-badges`,
      status: mcBadges ? "active" : "inactive",
      healthy: mcBadges !== null,
      layer: "suffix",
      responseTimeMs: null,
    };

    const services = [...coreProbes, mcService];

    let templates = null;
    try {
      const tplResp = await fetch("http://127.0.0.1:3100/api/agent-templates");
      if (tplResp.ok) templates = await tplResp.json();
    } catch {}

    let analytics = null;
    try {
      const anlResp = await fetch("http://127.0.0.1:3100/api/agent-templates-analytics");
      if (anlResp.ok) analytics = await anlResp.json();
    } catch {}

    let routines: unknown[] = [];
    try {
      const companiesResp = await fetch("http://127.0.0.1:3100/api/companies");
      if (companiesResp.ok) {
        const companies = (await companiesResp.json()) as { id: string }[];
        const routineResults = await Promise.all(
          companies.map(async (c) => {
            try {
              const r = await fetch(`http://127.0.0.1:3100/api/companies/${c.id}/routines`);
              return r.ok ? await r.json() : [];
            } catch { return []; }
          }),
        );
        routines = routineResults.flat();
      }
    } catch {}

    const activeCount = services.filter((s) => s.healthy).length;

    res.json({
      timestamp: new Date().toISOString(),
      services,
      summary: {
        total: services.length,
        active: activeCount,
        inactive: services.length - activeCount,
      },
      runtimeBadges: mcBadges?.badges ?? null,
      runtimeSummary: mcBadges?.summary ?? null,
      templates: templates?.templates ?? null,
      templateAnalytics: analytics,
      routines,
    });
  });

  return router;
}
