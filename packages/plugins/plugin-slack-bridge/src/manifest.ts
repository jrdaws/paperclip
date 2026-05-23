import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip.slack-bridge",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Slack Bridge",
  description: "Production scaffold for Slack inbound webhook verification and outbound notifications.",
  author: "Paperclip",
  categories: ["connector", "automation", "ui"],
  capabilities: [
    "webhooks.receive",
    "http.outbound",
    "secrets.read-ref",
    "jobs.schedule",
    "agent.tools.register",
    "activity.log.write",
    "metrics.write",
    "plugin.state.read",
    "plugin.state.write",
    "ui.dashboardWidget.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      signingSecretRef: {
        type: "string",
        title: "Slack Signing Secret Ref",
        format: "secret-ref",
        default: ""
      },
      botTokenSecretRef: {
        type: "string",
        title: "Slack Bot Token Secret Ref",
        format: "secret-ref",
        default: ""
      },
      webhookUrlSecretRef: {
        type: "string",
        title: "Slack Webhook URL Secret Ref",
        format: "secret-ref",
        default: ""
      },
      defaultChannel: {
        type: "string",
        title: "Default Channel",
        default: "#general"
      },
      maxMessagesPerMinute: {
        type: "number",
        title: "Max Outbound Messages Per Minute",
        default: 60
      }
    }
  },
  tools: [
    {
      name: "slack-send-message",
      displayName: "Slack Send Message",
      description: "Send a message to Slack with retries and rate limits.",
      parametersSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          channel: { type: "string" }
        },
        required: ["text"]
      }
    }
  ],
  jobs: [
    {
      jobKey: "slack-connector-heartbeat",
      displayName: "Slack Connector Heartbeat",
      description: "Writes heartbeat metric/state for operational visibility.",
      schedule: "*/15 * * * *"
    }
  ],
  webhooks: [
    {
      endpointKey: "slack-events",
      displayName: "Slack Events",
      description: "Inbound Slack signed webhook endpoint."
    }
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "slack-bridge-status",
        displayName: "Slack Bridge",
        exportName: "SlackBridgeWidget"
      }
    ]
  }
};

export default manifest;
