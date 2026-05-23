import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip.http-tool-bridge",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "HTTP Tool Bridge",
  description: "Generic connector template that maps Paperclip tools to external HTTP endpoints.",
  author: "Paperclip",
  categories: ["connector", "automation", "ui"],
  capabilities: [
    "agent.tools.register",
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "metrics.write",
    "activity.log.write",
    "ui.dashboardWidget.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      baseUrl: {
        type: "string",
        title: "Base URL",
        default: "http://localhost:3000"
      },
      authTokenSecretRef: {
        type: "string",
        title: "Auth Token Secret Ref",
        format: "secret-ref",
        default: ""
      },
      toolPrefix: {
        type: "string",
        title: "Tool Prefix",
        default: "bridge"
      },
      maxRequestsPerMinute: {
        type: "number",
        title: "Max Requests Per Minute",
        default: 120
      },
      tools: {
        type: "array",
        title: "Tool Definitions",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            displayName: { type: "string" },
            description: { type: "string" },
            method: { type: "string" },
            path: { type: "string" }
          },
          required: ["name", "displayName", "path"]
        },
        default: []
      }
    }
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "http-bridge-status",
        displayName: "HTTP Bridge",
        exportName: "HttpBridgeWidget"
      }
    ]
  }
};

export default manifest;
