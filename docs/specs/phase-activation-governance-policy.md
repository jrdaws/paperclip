# Phase Activation Governance Policy

## Purpose

Define unambiguous, measurable activation triggers for:

- **Phase 2**: LangGraph adoption
- **Phase 3**: Temporal adoption

This policy is the single source of truth for when to activate each phase.

## Scope

Applies to contract-first execution using `v1alpha` artifacts and Phase 1 simulation gating.

## Phase 1 Local CrewAI Wiring (Operational)

For local operator validation of a live HTTP bridge to CrewAI, run:

1. Start CrewAI webhook bridge at `http://127.0.0.1:8000/webhook`.
2. Execute:
   - `CREWAI_WEBHOOK_URL="http://127.0.0.1:8000/webhook" pnpm -C server phase1:crewai-smoke`

This check is additive and does not replace the canonical `T1-T6` simulation gate.

## Phase 1 Runtime Matrix (Architectural)

To validate interoperability across HTTP-backed runtimes under the same adapter contract, run:

- `pnpm -C server phase1:runtime-matrix`

Current matrix targets:

- `crewai`
- `langgraph`
- `custom-http`

## Baseline Requirement (Before Any Phase Activation)

Both of the following must be true:

1. Latest simulation gate passes with exact output:
   - `TOTAL: 6/6 PASS` from `server/scripts/simulate-http-adapter-v1alpha.ts`
2. No open `CRITICAL` issues in current release gate report.

If either baseline fails, Phase 2 and Phase 3 activation is blocked.

## Definitions

- **Workflow**: One end-to-end execution chain tied to a single `task_id`/`run_id`.
- **Long-running workflow**: Workflow duration `> 15 minutes`.
- **Manual babysitting incident**: A run requiring human intervention to recover execution because retry logic or resume semantics were insufficient.
- **Cost variance**: Absolute month-over-month delta:
  - `abs(this_month_cost - last_month_cost) / last_month_cost`

## Data Sources

Use the latest 30-day window unless stated otherwise:

- Adapter simulation logs: `server/scripts/simulate-http-adapter-v1alpha.ts`
- CrewAI webhook smoke logs (optional local gate): `server/scripts/phase1-crewai-webhook-smoke.ts`
- Runtime matrix smoke logs: `server/scripts/phase1-runtime-matrix-smoke.ts`
- Execution traces and durations: runtime telemetry (`run_id`, `duration_ms`)
- Cost telemetry: company/agent cost summaries
- Incident records: blocked/retry/escalation entries

## Phase 2 (LangGraph) Activation Trigger

Activate Phase 2 when **any 2 of 4** conditions are met in the same 30-day window:

1. **Scale threshold**: Active agent count `>= 10` for at least 7 consecutive days.
2. **Reliability pressure**: `>= 5` manual babysitting incidents.
3. **Long-run pressure**: `>= 20%` of workflows are long-running (`> 15 minutes`).
4. **Coordination pressure**: `>= 3` repeated blocked/retry loops for the same workflow family.

### Phase 2 Entry Gate Checklist

- [ ] Baseline requirement satisfied.
- [ ] At least 2 trigger conditions met with evidence.
- [ ] LangGraph target workflows identified and listed.
- [ ] Rollback plan documented (return path to Phase 1 adapters).

### Phase 2 Exit Validation

After rollout to target workflows, pass all:

- [ ] 14-day error-rate reduction of at least `20%` vs pre-Phase-2 baseline.
- [ ] No increase in `CRITICAL` incidents.
- [ ] `v1alpha` contract compatibility preserved for all migrated workflows.

## Phase 3 (Temporal) Activation Trigger

Activate Phase 3 when **any 2 of 4** conditions are met in the same 30-day window:

1. **Durability gap**: `>= 10` restart/resume recoveries fail to restore in-flight workflows correctly.
2. **Latency/retry pressure**: P95 workflow duration grows by `>= 30%` for 2 consecutive weeks.
3. **Long-run saturation**: `>= 35%` of workflows exceed `15 minutes`.
4. **Cost volatility**: Month-over-month cost variance `> 25%` for 2 consecutive months.

### Phase 3 Entry Gate Checklist

- [ ] Baseline requirement satisfied.
- [ ] At least 2 trigger conditions met with evidence.
- [ ] Temporal candidate workflows and state boundaries documented.
- [ ] Idempotency keys and replay strategy documented for migrated flows.
- [ ] Rollback plan documented (degrade to Phase 2/Phase 1 path).

### Phase 3 Exit Validation

After rollout to target workflows, pass all:

- [ ] 30-day successful recovery rate `>= 99%` for targeted workflows.
- [ ] P95 duration improvement of at least `15%` on migrated flows.
- [ ] No regression in contract conformance (`v1alpha` interop still valid).

## Measurement Cadence

- Weekly: trigger metric snapshot (rolling 30 days)
- Monthly: formal phase activation review
- On-demand: immediate review after any `CRITICAL` incident spike

## Decision Authority

- Activation proposal: engineering owner for adapter/runtime governance
- Approval: control-plane governance owner
- Final sign-off: board/operator authority

## Output Artifact (Required)

Every activation decision must produce a report containing:

1. Trigger condition values (with timestamps)
2. Baseline gate status
3. Decision (`ACTIVATE` or `DEFER`)
4. Rollout scope
5. Rollback steps

Save reports under:

- `workspace/research/phase-activation-review-<phase>-<date>.md`
