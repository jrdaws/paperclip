import { z } from "zod";
import { contractVersionSchema } from "./taskspec.js";

export const statusSchema = z.enum([
  "success",
  "partial_success",
  "blocked",
  "failed",
  "cancelled",
]);
export type Status = z.infer<typeof statusSchema>;

export const failureCodeSchema = z.enum([
  "policy_violation",
  "dependency_failure",
  "model_failure",
  "workflow_failure",
  "human_blocker",
  "system_failure",
]);
export type FailureCode = z.infer<typeof failureCodeSchema>;

export const severitySchema = z.enum(["CRITICAL", "IMPORTANT", "MINOR"]);
export type Severity = z.infer<typeof severitySchema>;

export const nextActionSchema = z.enum([
  "close",
  "retry",
  "escalate",
  "await_approval",
  "delegate",
]);
export type NextAction = z.infer<typeof nextActionSchema>;

export const timingSchema = z
  .object({
    started_at: z.string().datetime(),
    ended_at: z.string().datetime(),
    duration_ms: z.number().int().nonnegative(),
  })
  .strict();
export type Timing = z.infer<typeof timingSchema>;

export const costSchema = z.object({
  tokens_input: z.number().int().nonnegative(),
  tokens_output: z.number().int().nonnegative(),
  cost_usd: z.number().nullish(),
}).passthrough();
export type Cost = z.infer<typeof costSchema>;

export const failureInfoSchema = z.object({
  code: failureCodeSchema,
  severity: severitySchema.nullish(),
  message: z.string().nullish(),
  root_cause: z.string().nullish(),
  retryable: z.boolean().default(false),
}).passthrough();
export type FailureInfo = z.infer<typeof failureInfoSchema>;

const baseExecutionResultSchema = z
  .object({
    contract_version: contractVersionSchema,
    task_id: z.string().min(1),
    run_id: z.string().min(1),
    status: statusSchema,
    summary: z.string().min(1),
    timing: timingSchema,
    cost: costSchema,
    outputs: z.unknown().nullish(),
    artifacts: z.array(z.string()).nullish(),
    confidence: z.number().min(0).max(1).nullish(),
    failure: failureInfoSchema.nullish(),
    next_action: nextActionSchema.nullish(),
    // v1beta additions (optional, backward-compatible)
    idempotency_key: z.string().min(1).nullish(),
    retry_attempt: z.number().int().nonnegative().nullish(),
    model_id: z.string().nullish(),
    provider: z.string().nullish(),
  })
  .strict();

export const executionResultSchema = baseExecutionResultSchema.superRefine(
  (data, ctx) => {
    const needsFailure = data.status === "blocked" || data.status === "failed";
    if (needsFailure && !data.failure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `failure is required when status is '${data.status}'`,
        path: ["failure"],
      });
    }
    if (data.status === "success" && data.failure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "failure must be absent when status is 'success'",
        path: ["failure"],
      });
    }
  },
);
export type ExecutionResult = z.infer<typeof executionResultSchema>;
