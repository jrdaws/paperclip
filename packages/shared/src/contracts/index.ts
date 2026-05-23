export {
  CONTRACT_VERSION,
  CONTRACT_VERSION_LATEST,
  CONTRACT_VERSIONS,
  contractVersionSchema,
  prioritySchema,
  wakeReasonSchema,
  traceContextSchema,
  constraintsSchema,
  approvalPolicySchema,
  taskSpecSchema,
  type ContractVersion,
  type Priority,
  type WakeReason,
  type TraceContext,
  type Constraints,
  riskSchema,
  type Risk,
  type ApprovalPolicy,
  type TaskSpec,
} from "./taskspec.js";

export {
  statusSchema,
  failureCodeSchema,
  severitySchema,
  nextActionSchema,
  timingSchema,
  costSchema,
  failureInfoSchema,
  executionResultSchema,
  type Status,
  type FailureCode,
  type Severity,
  type NextAction,
  type Timing,
  type Cost,
  type FailureInfo,
  type ExecutionResult,
} from "./execution-result.js";

export {
  runtimeSchema,
  costMetricSchema,
  costEventSchema,
  type Runtime,
  type CostMetric,
  type CostEvent,
} from "./cost-event.js";

// ---------------------------------------------------------------------------
// v1alpha sunset schedule
// ---------------------------------------------------------------------------

const _DEPRECATION_DEADLINE_RAW =
  typeof process !== "undefined" && process.env
    ? (process.env.CONTRACT_DEPRECATION_DEADLINE ?? "")
    : "";
let _deprecationDeadline: Date | null = null;
if (_DEPRECATION_DEADLINE_RAW) {
  const parsed = new Date(_DEPRECATION_DEADLINE_RAW);
  if (!isNaN(parsed.getTime())) {
    _deprecationDeadline = parsed;
  }
}

export interface SunsetCheckResult {
  rejected: boolean;
  message: string;
}

export function checkV1AlphaSunset(contractVersion: string): SunsetCheckResult {
  if (contractVersion !== "v1alpha") {
    return { rejected: false, message: "" };
  }
  if (!_deprecationDeadline) {
    return { rejected: false, message: "v1alpha accepted (no deadline configured)" };
  }
  if (new Date() >= _deprecationDeadline) {
    return {
      rejected: true,
      message: `v1alpha was deprecated on ${_deprecationDeadline.toISOString().slice(0, 10)}. Please upgrade to v1beta.`,
    };
  }
  return { rejected: false, message: "v1alpha accepted (before deadline)" };
}
