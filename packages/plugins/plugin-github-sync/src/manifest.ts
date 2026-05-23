import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip.github-sync",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "GitHub Issue Sync",
  description: "Bi-directional GitHub issue synchronization scaffold with idempotency and cursor recovery.",
  author: "Paperclip",
  categories: ["connector", "automation", "ui"],
  capabilities: [
    "webhooks.receive",
    "http.outbound",
    "secrets.read-ref",
    "jobs.schedule",
    "events.subscribe",
    "issues.create",
    "issues.update",
    "issue.comments.create",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "metrics.write",
    "agent.tools.register",
    "companies.read",
    "ui.dashboardWidget.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      webhookSecretRef: {
        type: "string",
        title: "GitHub Webhook Secret Ref",
        format: "secret-ref",
        default: ""
      },
      apiTokenSecretRef: {
        type: "string",
        title: "GitHub API Token Secret Ref",
        format: "secret-ref",
        default: ""
      },
      owner: {
        type: "string",
        title: "GitHub Owner",
        default: ""
      },
      repo: {
        type: "string",
        title: "GitHub Repository",
        default: ""
      },
      projectId: {
        type: "string",
        title: "Default Paperclip Project ID",
        default: ""
      },
      maxBackfillPages: {
        type: "number",
        title: "Max Backfill Pages",
        default: 5
      },
      conflictPolicy: {
        type: "string",
        title: "Conflict Policy",
        enum: ["inbound_wins", "outbound_wins", "newest_wins"],
        default: "newest_wins"
      },
      titleFieldPath: {
        type: "string",
        title: "GitHub Field Path: Title",
        default: "title"
      },
      descriptionFieldPath: {
        type: "string",
        title: "GitHub Field Path: Description",
        default: "body"
      },
      statusFieldPath: {
        type: "string",
        title: "GitHub Field Path: Status",
        default: "state"
      }
    }
  },
  tools: [
    {
      name: "github-reconcile-range",
      displayName: "GitHub Reconcile Range",
      description: "Replay GitHub issue synchronization for a time range.",
      parametersSchema: {
        type: "object",
        properties: {
          since: { type: "string", description: "ISO timestamp lower bound" },
          dryRun: { type: "boolean", default: false },
          limit: { type: "number", default: 100 }
        },
        required: ["since"]
      }
    }
  ],
  jobs: [
    {
      jobKey: "github-backfill-sync",
      displayName: "GitHub Backfill Sync",
      description: "Periodic sync of updated GitHub issues using cursor state.",
      schedule: "*/20 * * * *"
    }
  ],
  webhooks: [
    {
      endpointKey: "github-events",
      displayName: "GitHub Events",
      description: "Inbound GitHub webhook endpoint."
    }
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "github-sync-status",
        displayName: "GitHub Sync",
        exportName: "GitHubSyncWidget"
      }
    ]
  }
};

export default manifest;
