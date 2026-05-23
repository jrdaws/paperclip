import { z } from "zod";

export const CONTRACT_VERSIONS = ["v1alpha", "v1beta"] as const;
export const CONTRACT_VERSION = "v1alpha" as const;
export const CONTRACT_VERSION_LATEST = "v1beta" as const;

export const contractVersionSchema = z.enum(CONTRACT_VERSIONS);
export type ContractVersion = z.infer<typeof contractVersionSchema>;

export const prioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Priority = z.infer<typeof prioritySchema>;

export const wakeReasonSchema = z.enum([
  "schedule",
  "assignment",
  "mention",
  "manual",
  "approval_resolution",
]);
export type WakeReason = z.infer<typeof wakeReasonSchema>;

export const traceContextSchema = z
  .object({
    run_id: z.string().min(1),
    correlation_id: z.string().min(1),
    parent_span_id: z.string().min(1).nullish(),
  })
  .strict();
export type TraceContext = z.infer<typeof traceContextSchema>;

export const riskSchema = z.enum(["low", "medium", "high"]);
export type Risk = z.infer<typeof riskSchema>;

export const constraintsSchema = z.object({
  budget_cap_usd: z.number().nullish(),
  deadline_seconds: z.number().int().nullish(),
  allowed_tools: z.array(z.string()).nullish(),
  risk: riskSchema.nullish(),
}).passthrough();
export type Constraints = z.infer<typeof constraintsSchema>;

export const approvalPolicySchema = z.object({
  required_approvers: z.array(z.string()).nullish(),
  auto_approve_below_usd: z.number().nullish(),
}).passthrough();
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;

export const taskSpecSchema = z
  .object({
    contract_version: contractVersionSchema,
    task_id: z.string().min(1),
    goal_id: z.string().min(1),
    company_id: z.string().min(1),
    assignee_agent_id: z.string().min(1),
    title: z.string().min(1),
    instructions: z.string().min(1),
    priority: prioritySchema,
    trace_context: traceContextSchema,
    input_artifacts: z.array(z.string()).nullish(),
    constraints: constraintsSchema.nullish(),
    approval_policy: approvalPolicySchema.nullish(),
    wake_reason: wakeReasonSchema.nullish(),
    deadline_at: z.string().datetime().nullish(),
    // v1beta additions (optional, backward-compatible)
    idempotency_key: z.string().min(1).nullish(),
    retry_count: z.number().int().nonnegative().nullish(),
    tags: z.array(z.string()).nullish(),
  })
  .strict();
export type TaskSpec = z.infer<typeof taskSpecSchema>;
