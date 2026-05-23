import { createHmac, timingSafeEqual } from "node:crypto";

function toBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function safeEqualText(left: string, right: string): boolean {
  const leftBuf = toBuffer(left);
  const rightBuf = toBuffer(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

export function verifySlackRequest(input: {
  signingSecret: string;
  rawBody: string;
  signatureHeader?: string;
  timestampHeader?: string;
  nowMs?: number;
  maxAgeSeconds?: number;
}): { ok: boolean; reason?: string } {
  const signature = input.signatureHeader ?? "";
  const timestamp = input.timestampHeader ?? "";
  if (!signature || !timestamp) {
    return { ok: false, reason: "Missing Slack signature or timestamp headers" };
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "Invalid Slack timestamp header" };
  }
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeSeconds = input.maxAgeSeconds ?? 300;
  if (Math.abs(nowMs - ts * 1000) > maxAgeSeconds * 1000) {
    return { ok: false, reason: "Slack timestamp outside replay window" };
  }
  const base = `v0:${timestamp}:${input.rawBody}`;
  const expected = `v0=${hmacSha256Hex(input.signingSecret, base)}`;
  if (!safeEqualText(expected, signature)) {
    return { ok: false, reason: "Slack signature mismatch" };
  }
  return { ok: true };
}

export function verifyGitHubRequest(input: {
  webhookSecret: string;
  rawBody: string;
  signatureHeader?: string;
}): { ok: boolean; reason?: string } {
  const received = input.signatureHeader ?? "";
  if (!received.startsWith("sha256=")) {
    return { ok: false, reason: "Missing or invalid GitHub signature header" };
  }
  const expected = `sha256=${hmacSha256Hex(input.webhookSecret, input.rawBody)}`;
  if (!safeEqualText(expected, received)) {
    return { ok: false, reason: "GitHub signature mismatch" };
  }
  return { ok: true };
}
