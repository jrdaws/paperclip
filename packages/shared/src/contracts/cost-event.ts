import { z } from "zod";
import { contractVersionSchema } from "./taskspec.js";

export const runtimeSchema = z.enum(["openclaw", "paperclip", "crewai"]);
export type Runtime = z.infer<typeof runtimeSchema>;

export const costMetricSchema = z.enum([
  "billed_cents",
  "tokens_input",
  "tokens_output",
]);
export type CostMetric = z.infer<typeof costMetricSchema>;

export const costEventSchema = z
  .object({
    contract_version: contractVersionSchema,
    event_id: z.string().min(1),
    agent_id: z.string().min(1),
    run_id: z.string().min(1),
    task_id: z.string().min(1).nullish(),
    company_id: z.string().min(1),
    runtime: runtimeSchema,
    timestamp: z.string().datetime(),
    provider: z.string().min(1),
    model: z.string().min(1),
    tokens_input: z.number().int().nonnegative(),
    tokens_output: z.number().int().nonnegative(),
    cached_input_tokens: z.number().int().nonnegative().default(0),
    cost_cents: z.number().int().nonnegative(),
    cost_usd: z.number().nonnegative().nullish(),
    cumulative_session_cents: z.number().int().nonnegative().nullish(),
    billing_code: z.string().nullish(),
    biller: z.string().default("unknown"),
    billing_type: z.string().default("unknown"),
  })
  .strict();
export type CostEvent = z.infer<typeof costEventSchema>;
