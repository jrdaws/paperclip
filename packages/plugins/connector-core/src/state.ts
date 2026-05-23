import type { PluginContext } from "@paperclipai/plugin-sdk";

const DEFAULT_SCOPE = { scopeKind: "instance" as const };

export async function readInstanceState<T>(
  ctx: PluginContext,
  stateKey: string,
  defaultValue: T,
): Promise<T> {
  const value = await ctx.state.get({ ...DEFAULT_SCOPE, stateKey });
  return (value as T | null) ?? defaultValue;
}

export async function writeInstanceState(
  ctx: PluginContext,
  stateKey: string,
  value: unknown,
): Promise<void> {
  await ctx.state.set({ ...DEFAULT_SCOPE, stateKey }, value);
}

export async function markDeliverySeen(
  ctx: PluginContext,
  namespace: string,
  deliveryId: string,
  maxEntries = 2000,
): Promise<boolean> {
  const key = `${namespace}.delivery-ids`;
  const seen = await readInstanceState<string[]>(ctx, key, []);
  if (seen.includes(deliveryId)) return true;
  const next = [deliveryId, ...seen].slice(0, maxEntries);
  await writeInstanceState(ctx, key, next);
  return false;
}

export async function appendDeadLetter(
  ctx: PluginContext,
  namespace: string,
  payload: Record<string, unknown>,
  maxEntries = 200,
): Promise<void> {
  const key = `${namespace}.dead-letter`;
  const current = await readInstanceState<Record<string, unknown>[]>(ctx, key, []);
  const next = [{ at: new Date().toISOString(), ...payload }, ...current].slice(0, maxEntries);
  await writeInstanceState(ctx, key, next);
}

export async function getCursor(
  ctx: PluginContext,
  namespace: string,
): Promise<string | null> {
  return await readInstanceState<string | null>(ctx, `${namespace}.cursor`, null);
}

export async function setCursor(
  ctx: PluginContext,
  namespace: string,
  cursor: string,
): Promise<void> {
  await writeInstanceState(ctx, `${namespace}.cursor`, cursor);
}
