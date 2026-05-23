import test from "node:test";
import assert from "node:assert/strict";
import {
  hmacSha256Hex,
  verifyGitHubRequest,
  verifySlackRequest,
  withRetry,
  markDeliverySeen,
  appendDeadLetter,
} from "./index.js";

test("withRetry calls onRetry and eventually succeeds", async () => {
  let attempts = 0;
  const retryDelays: number[] = [];
  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("transient");
      return "ok";
    },
    {
      retries: 3,
      baseDelayMs: 1,
      jitterMs: 0,
      onRetry: async ({ nextDelayMs }) => {
        retryDelays.push(nextDelayMs);
      },
    },
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.equal(retryDelays.length, 2);
});

test("Slack signature verifier accepts valid signature", () => {
  const rawBody = JSON.stringify({ type: "url_verification", challenge: "x" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signingSecret = "slack-secret";
  const expected = `v0=${hmacSha256Hex(signingSecret, `v0:${timestamp}:${rawBody}`)}`;
  const result = verifySlackRequest({
    signingSecret,
    rawBody,
    signatureHeader: expected,
    timestampHeader: timestamp,
    nowMs: Number(timestamp) * 1000,
  });
  assert.equal(result.ok, true);
});

test("GitHub signature verifier rejects invalid signature", () => {
  const result = verifyGitHubRequest({
    webhookSecret: "github-secret",
    rawBody: "{\"hello\":\"world\"}",
    signatureHeader: "sha256=deadbeef",
  });
  assert.equal(result.ok, false);
});

test("state helpers enforce delivery idempotency and DLQ append", async () => {
  const store = new Map<string, unknown>();
  const ctx = {
    state: {
      async get(input: { stateKey: string }) {
        return store.get(input.stateKey) ?? null;
      },
      async set(input: { stateKey: string }, value: unknown) {
        store.set(input.stateKey, value);
      },
    },
  } as any;

  const first = await markDeliverySeen(ctx, "contract", "delivery-1");
  const second = await markDeliverySeen(ctx, "contract", "delivery-1");
  assert.equal(first, false);
  assert.equal(second, true);

  await appendDeadLetter(ctx, "contract", { kind: "failure" });
  const deadLetters = store.get("contract.dead-letter") as Array<Record<string, unknown>>;
  assert.equal(Array.isArray(deadLetters), true);
  assert.equal(deadLetters.length, 1);
});
