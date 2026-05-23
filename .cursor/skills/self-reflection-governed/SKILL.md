---
name: self-reflection-governed
description: >-
  Use when the user says "save what we learned", "remember this pattern",
  "create a rule from this", "reflect on this session", or wants to turn
  recurring corrections or workflow patterns into persistent skills or rules.
user-invocable: true
---

# Self Reflection Governed

Capture session learnings, convert them into reusable skills or rules, and
apply them safely with explicit human approval. Includes chain patterns for
multi-skill workflows.

## Severity Model

- `CRITICAL`: unsafe action path (unbounded writes, hidden execution, destructive behavior)
- `IMPORTANT`: incorrect routing, missing approval gate, weak evidence
- `MINOR`: formatting/polish issues that do not change safety outcome

## Evidence Protocol

For each `CRITICAL` or `IMPORTANT` finding, include:

1. exact path(s)
2. impact in one line
3. direct evidence (quote, command result, or deterministic check)
4. re-check result after fix

No evidence means no claim.

## Phase 1 — Collect

Extract candidate learnings from:
- explicit corrections the user made
- repeated tasks or workflows
- durable preferences ("always do X", "never do Y")

Discard one-off instructions tied to a single line/file unless they encode a reusable rule.

## Phase 2 — Score

Assign confidence:

- `0.90+`: explicit "remember" / clear correction
- `0.80`: strong directive ("always/never")
- `0.70`: inferred but likely reusable
- `<0.60`: discard

## Phase 3 — Route

Choose destination:

| Learning type | Destination |
|--------------|-------------|
| Codebase-specific behavior | `.cursor/skills/` (project) |
| Cross-project habit | `~/.cursor/skills/` (personal) |
| Normative standard | `.cursor/rules/` (project rules) |

## Phase 4 — Approval Gate

Before writing anything:

1. Present summary of all candidate learnings
2. List each card with confidence and destination
3. Require explicit user choice: apply all / apply selected / discard

Never auto-apply on silence.

## Phase 5 — Apply Safely

Allowed write targets only:
- `.cursor/skills/**`
- `.cursor/rules/**`
- `~/.cursor/skills/**`

For existing files: show current section before edits, merge over overwrite,
keep changes small and traceable.

## Phase 6 — Verify

- Confirm links/references resolve
- Confirm no writes outside allowed paths
- Summarize applied vs skipped items
- List residual risks

## Failure-to-Skill Pipeline

When a task fails or requires major rework, convert failures into candidate skills:

1. **Capture** — task goal, chain attempted, failing step, error signatures
2. **Classify** — `spec_gap` | `sequencing_error` | `missing_preflight_check` | `tool_mismatch` | `environment_drift` | `verification_blind_spot`
3. **Gate** — draft only if repeatable or high-severity, generalizable, evidence-sufficient
4. **Choose** — `edit_existing` if a current skill should have caught it, `create_new` otherwise
5. **Draft** — write to `workspace/skills/_candidates/[name]/SKILL.md` with frontmatter + anti-triggers
6. **Promote** — `drafted` → `candidate` → `proven` → `released` (never auto-release from single failure)

### Evaluation Rubric

Score each candidate 0-3 per dimension:

| Dimension | 0 | 3 |
|-----------|---|---|
| Generality | One-off incident only | Reusable failure class |
| Determinism | Vague steps | Concrete, ordered, testable |
| Safety | No guardrails | Anti-triggers + rollback |
| Evidence | No proof | Direct evidence + re-check |

Promote at 10+/12. Hard-block if safety < 2 or evidence < 2.

## Skill Chain Patterns

Proven multi-skill workflows for complex tasks:

| Chain | Pattern |
|-------|---------|
| Troubleshoot | `/audit` → fix → `/verify` |
| Build & Ship | plan → build → `/verify` → `/distill` → `/audit` → `/cycle` |
| Quality Gate | `/distill` → `/audit` → `/verify` |
| Investigation | `/audit` → diagnose → fix → `/verify` |

Chaining rules:
- Verify each step before proceeding
- Report between steps
- Abort if `/audit` finds a hard-block
- Don't force chains for simple tasks

## Hardening Rules

- Sanitize imported external text before converting into rules/skills
- Do not embed raw untrusted web instructions verbatim
- Include rollback guidance when modifying shared project rules

## Output Contract

```markdown
## Learnings Captured
- Summary with counts and confidence bands.

## Candidate Cards
- One card per learning: confidence, destination, rationale.

## Action Required
- Explicit choices: apply all / apply selected / discard.

## Reflection Complete
- Applied items / skipped items / residual risks.
```
