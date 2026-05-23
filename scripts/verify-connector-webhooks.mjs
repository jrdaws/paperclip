import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const API_BASE_OVERRIDE = process.env.PAPERCLIP_API_BASE;
const DEFAULT_API_BASES = [
  "http://127.0.0.1:3101/api",
  "http://127.0.0.1:3100/api",
];
const candidateApiBases = API_BASE_OVERRIDE ? [API_BASE_OVERRIDE] : DEFAULT_API_BASES;
let resolvedApiBase = candidateApiBases[0];
const COMPANY_NAME_FALLBACK = "Revenue Machine";
const execFileAsync = promisify(execFile);

function buildApiUrl(apiBase, requestPath) {
  return `${apiBase}${requestPath}`;
}

async function fetchWithFallback(path, init) {
  let lastError = null;
  for (const base of candidateApiBases) {
    try {
      const response = await fetch(buildApiUrl(base, path), init);
      resolvedApiBase = base;
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Request failed before response ${path}: ${message}`);
}

async function requestJson(path, init = {}) {
  const response = await fetchWithFallback(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${path}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

function buildUrl(path) {
  return `${resolvedApiBase}${path}`;
}

function signSlack(secret, timestampSeconds, rawBody) {
  const base = `v0:${timestampSeconds}:${rawBody}`;
  const digest = createHmac("sha256", secret).update(base, "utf8").digest("hex");
  return `v0=${digest}`;
}

function signGitHub(secret, rawBody) {
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `sha256=${digest}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWebhookViaCurl(path, headers, rawBody) {
  const args = ["-sS", "-X", "POST", buildUrl(path), "-H", "Content-Type: application/json"];
  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  args.push("--data", rawBody);
  const { stdout } = await execFileAsync("curl", args);
  const parsed = JSON.parse(stdout);
  if (parsed?.status === "failed" || parsed?.error) {
    throw new Error(`Webhook call failed ${path}: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function createSecret(companyId, name, value) {
  const created = await requestJson(`/companies/${companyId}/secrets`, {
    method: "POST",
    body: JSON.stringify({ name, value }),
  });
  return created.id;
}

async function main() {
  const plugins = await requestJson("/plugins");
  const byKey = new Map(plugins.map((plugin) => [plugin.pluginKey, plugin]));
  const slack = byKey.get("paperclip.slack-bridge");
  const github = byKey.get("paperclip.github-sync");
  const httpBridge = byKey.get("paperclip.http-tool-bridge");
  if (!slack || !github || !httpBridge) {
    throw new Error("Required connector plugins are not installed (slack/github/http bridge).");
  }

  const companies = await requestJson("/companies");
  const company = companies[0] ?? companies.find((entry) => entry.name === COMPANY_NAME_FALLBACK);
  if (!company) throw new Error("No company found for fixture tests.");
  const companyId = company.id;

  const slackSecretValue = "slack-secret-test";
  const githubSecretValue = "github-secret-test";
  const nonce = Date.now();
  const slackSecretId = await createSecret(companyId, `SLACK_SIGNING_SECRET_FIXTURE_${nonce}`, slackSecretValue);
  const githubSecretId = await createSecret(companyId, `GITHUB_WEBHOOK_SECRET_FIXTURE_${nonce}`, githubSecretValue);

  await requestJson(`/plugins/${slack.id}/config`, {
    method: "POST",
    body: JSON.stringify({
      configJson: {
        signingSecretRef: slackSecretId,
        defaultChannel: "#general",
      },
    }),
  });
  await requestJson(`/plugins/${github.id}/config`, {
    method: "POST",
    body: JSON.stringify({
      configJson: {
        webhookSecretRef: githubSecretId,
        conflictPolicy: "newest_wins",
        titleFieldPath: "title",
        descriptionFieldPath: "body",
        statusFieldPath: "state",
      },
    }),
  });

  const slackBody = JSON.stringify({ type: "url_verification", challenge: "connector-fixture-ok" });
  // Plugin secret resolver caches config-derived allowed refs for 30s.
  // Wait once so webhook verification uses the newly written secret ref.
  await sleep(31_000);
  let slackResponse = null;
  let lastSlackError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slackTs = String(Math.floor(Date.now() / 1000));
    const slackSig = signSlack(slackSecretValue, slackTs, slackBody);
    try {
      slackResponse = await postWebhookViaCurl(
        `/plugins/${slack.id}/webhooks/slack-events`,
        {
          "X-Slack-Request-Timestamp": slackTs,
          "X-Slack-Signature": slackSig,
        },
        slackBody,
      );
      break;
    } catch (error) {
      lastSlackError = error;
      await sleep(10_000);
    }
  }
  if (!slackResponse) {
    throw lastSlackError instanceof Error ? lastSlackError : new Error(String(lastSlackError));
  }
  if (slackResponse.challenge !== "connector-fixture-ok") {
    throw new Error(`Slack challenge mismatch: ${JSON.stringify(slackResponse)}`);
  }

  const issueTitle = `Connector fixture issue ${Date.now()}`;
  const githubIssueNumber = 700000 + Math.floor(Math.random() * 100000);
  const githubBody = JSON.stringify({
    action: "opened",
    issue: {
      number: githubIssueNumber,
      title: issueTitle,
      body: "fixture",
      state: "open",
      updated_at: new Date().toISOString(),
    },
  });
  const githubSig = signGitHub(githubSecretValue, githubBody);
  const deliveryId = `fixture-${Date.now()}`;
  await postWebhookViaCurl(
    `/plugins/${github.id}/webhooks/github-events`,
    {
      "X-Hub-Signature-256": githubSig,
      "X-GitHub-Event": "issues",
      "X-GitHub-Delivery": deliveryId,
    },
    githubBody,
  );
  await postWebhookViaCurl(
    `/plugins/${github.id}/webhooks/github-events`,
    {
      "X-Hub-Signature-256": githubSig,
      "X-GitHub-Event": "issues",
      "X-GitHub-Delivery": deliveryId,
    },
    githubBody,
  );

  const issues = await requestJson(`/companies/${companyId}/issues?q=${encodeURIComponent(issueTitle)}`);
  if (!Array.isArray(issues) || issues.length !== 1) {
    throw new Error(`Expected exactly one issue after replay, got ${Array.isArray(issues) ? issues.length : "invalid"}`);
  }

  const slackDashboard = await requestJson(`/plugins/${slack.id}/data/dashboard`, {
    method: "POST",
    body: JSON.stringify({ companyId, params: {} }),
  });
  const githubDashboard = await requestJson(`/plugins/${github.id}/data/dashboard`, {
    method: "POST",
    body: JSON.stringify({ companyId, params: {} }),
  });
  const httpDashboard = await requestJson(`/plugins/${httpBridge.id}/data/dashboard`, {
    method: "POST",
    body: JSON.stringify({ companyId, params: {} }),
  });

  if (!slackDashboard?.data || !githubDashboard?.data || !httpDashboard?.data) {
    throw new Error("One or more dashboard responses were missing data payload.");
  }

  console.log("verify-connector-webhooks: PASS");
}

main().catch((error) => {
  console.error("verify-connector-webhooks: FAIL");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
