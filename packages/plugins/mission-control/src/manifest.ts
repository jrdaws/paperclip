import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { MC_TOOLS } from "./tools/registry.js";

export const PLUGIN_ID = "mission-control";
export const PLUGIN_VERSION = "1.0.0";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Mission Control Tools",
  description:
    "Bridges all 28 Mission Control built-in tools (stock analysis, web research, content scoring, LLM gateway, memory, SEO, and more) into Paperclip so any agent can use them during heartbeat runs.",
  author: "OpenClaw",
  categories: ["connector", "automation"],
  capabilities: [
    "agent.tools.register",
    "http.outbound",
    "secrets.read-ref",
    "activity.log.write",
    "metrics.write",
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "jobs.schedule",
    "companies.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      mcBaseUrl: {
        type: "string",
        title: "Mission Control Base URL",
        default: "http://localhost:3000",
        description: "Base URL where Mission Control is running",
      },
      mcApiSecret: {
        type: "string",
        title: "MC API Secret Reference",
        default: "",
        description: "Secret reference for Mission Control API authentication (optional)",
      },
      enableCostSync: {
        type: "boolean",
        title: "Enable Cost Sync",
        default: true,
        description: "Sync Mission Control usage data into Paperclip metrics",
      },
      governanceEscalation: {
        type: "boolean",
        title: "Governance Escalation",
        default: true,
        description: "Auto-escalate P0 governance violations to activity log for human review",
      },
    },
  },
  tools: MC_TOOLS.map((tool) => ({
    name: tool.id,
    displayName: tool.displayName,
    description: tool.description,
    parametersSchema: tool.parametersSchema,
  })),
  jobs: [
    {
      jobKey: "sync-mc-costs",
      displayName: "Sync MC Usage Costs",
      description: "Periodically syncs Mission Control token usage and costs into Paperclip metrics.",
      schedule: "0 * * * *",
    },
    {
      jobKey: "sync-governed-skills",
      displayName: "Sync Governed Skills Registry",
      description: "Discovers governed skills from Mission Control and caches metadata for agent activation.",
      schedule: "0 */6 * * *",
    },
    {
      jobKey: "sync-skill-manifest",
      displayName: "Sync Skill Manifest",
      description: "Reads the skill-manifest.json index and syncs all 186+ skills into each company's skill inventory.",
      schedule: "0 */12 * * *",
    },
  ],
};

export default manifest;
