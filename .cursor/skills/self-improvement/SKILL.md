---
name: self-improvement
description: |
  Skill-aware self-improvement loop for agents. Discovers available tools and skills,
  chains them into multi-step workflows, logs outcomes, and promotes successful patterns.
  Use when an agent needs to understand its capabilities, recommend skills to the user,
  troubleshoot complex problems using multiple skills, or improve its own performance
  over time. Trigger on: "what can you do", "what tools do you have", "help me improve",
  "self-improve", "get smarter", or when a task clearly maps to an available skill.
allowed-tools:
  - Read
  - Write
  - Glob
  - Shell
  - Grep
  - memory-core
  - model-usage-analytics
user-invocable: true
---

# Self-Improvement Loop — Skill-Aware Agent

You are an agent that knows its own capabilities and gets smarter over time. This skill has five modes:

1. **Discover** — Find and understand all available tools and skills
2. **Recommend** — Suggest the right skill(s) for the user's problem
3. **Chain** — Execute multi-skill workflows for complex tasks
4. **Learn** — Record outcomes and promote successful patterns
5. **Reflect** — Capture corrections from the current session and route them to skills/rules

## Mode 1: Discover — Know Your Arsenal

Before you can recommend or chain skills, you need to know what exists.

### Tools (callable functions)

Query the running services to discover available tools:

```bash
# Mission Control tools (if MC is running on :3000)
curl -s http://localhost:3000/api/tools 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    tools = d.get('tools', d if isinstance(d, list) else [])
    print(f'Mission Control: {len(tools)} tools')
    for t in tools:
        print(f'  - {t.get(\"id\",\"?\")}')
except: print('MC unavailable')
"

# Paperclip tools (if Paperclip is running on :3100)
curl -s http://localhost:3100/api/plugins/tools 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    tools = d if isinstance(d, list) else d.get('tools', d.get('data', []))
    print(f'Paperclip: {len(tools)} tools')
    for t in tools[:10]:
        print(f'  - {t.get(\"name\", t.get(\"id\",\"?\"))}')
    if len(tools) > 10: print(f'  ... and {len(tools)-10} more')
except: print('Paperclip unavailable')
"
```

### Skills (instructional documents)

Find all SKILL.md files in known locations:

```bash
echo "=== Workspace Skills ==="
for d in workspace/skills/*/SKILL.md; do
  [ -f "$d" ] && echo "  - $(basename $(dirname $d))"
done 2>/dev/null

echo "=== Global Skills ==="
for d in ~/.cursor/skills/*/SKILL.md; do
  [ -f "$d" ] && echo "  - $(basename $(dirname $d))"
done 2>/dev/null
```

Read each skill's frontmatter to understand trigger phrases and capabilities.

## Mode 2: Recommend — Match Problems to Skills

When the user describes a problem, match it to available skills using trigger phrases:

| User intent | Recommended skill | Why |
|------------|-------------------|-----|
| "check for issues", "what's broken", "audit" | `/audit` (deep-audit) | Comprehensive 8-phase system audit |
| "prove it works", "test this", "verify" | `/verify` | 12-phase functional verification with predicted outputs |
| "optimize", "simplify", "clean up" | `/distill` | 5-phase complexity reduction |
| "deploy", "release", "ship it" | `/cycle` | Full deployment cycle with verification |
| "check the site", "review the layout" | `/webcheck` | Visual website audit |
| "generate an image", "logo", "mockup" | `image-lab` | AI image generation |
| "what can you do", "capabilities" | This skill | Self-discovery and recommendation |

### Recommendation Rules

- **Always explain why** you're recommending a skill — don't just name it
- **Ask before executing** destructive skills (cycle, deploy-checklist)
- **Chain when appropriate** — if the user says "fix this and prove it works", recommend audit → fix → verify
- **Don't over-recommend** — if the task is simple, don't suggest a 12-phase verification

## Mode 3: Chain — Multi-Skill Workflows

Complex problems often require multiple skills in sequence. Here are proven chains:

### Troubleshoot Chain
```
Problem detected
  → /audit    (identify all issues, classify severity)
  → Fix       (apply fixes for critical/high findings)
  → /verify   (prove fixes work with actual outputs)
```

### Build & Ship Chain
```
Feature requested
  → Plan      (design the solution)
  → Build     (implement it)
  → /verify   (prove it works)
  → /distill  (optimize and simplify)
  → /audit    (security and quality check)
  → /cycle    (deploy to production)
```

### Quality Gate Chain
```
Code complete
  → /distill  (simplify first)
  → /audit    (then check for issues)
  → /verify   (then prove everything works)
```

### Investigation Chain
```
"Why isn't X working?"
  → /audit    (systematic scan for root cause)
  → Diagnose  (trace the specific failure)
  → Fix       (apply targeted fix)
  → /verify   (prove the fix works)
```

### Chaining Rules

- **Verify each step** before proceeding to the next — don't chain blindly
- **Report between steps** — tell the user what each skill found before moving on
- **Abort if blocked** — if /audit finds a HARD-BLOCK, stop and fix it before continuing
- **Don't force chains** — if the user only wants one skill, run just that one

## Mode 4: Learn — Get Smarter Over Time

After completing a task, record what worked and what didn't.

### Post-Task Review

After every non-trivial task:

1. **What skills were used?** List each skill invoked and in what order
2. **What worked?** Which skill produced the most value?
3. **What failed?** Which step needed rework or produced false results?
4. **What would you do differently?** Better skill order? Missing skill?
5. **Reusable pattern?** Is this a combo that would work for similar future tasks?

### Outcome Logging

Append findings to the learnings file:

```bash
# Append to the shared learnings file
cat >> workspace/docs/agent-learnings.md << 'ENTRY'

### [DATE] — [Task Summary]
- **Skills used:** /audit → fix → /verify
- **Outcome:** Success — found 3 issues, all fixed and verified
- **Pattern:** "Troubleshoot Chain" worked well for integration bugs
- **Lesson:** Always run /verify Phase 0 (Pre-Flight) first — caught a stale build
ENTRY
```

### Failure-to-Skill Pipeline (EvoSkill-Inspired)

When a task fails or requires major rework, do not stop at a lesson. Convert failures into candidate skills using this deterministic pipeline:

1. **Capture failure event**
   - Record task goal, attempted chain, failing step, error signatures, and environment state.
   - Save a compact failure fingerprint: `context + failing action + observed error + impact`.
2. **Classify root cause**
   - Use one primary class:
     - `spec_gap`
     - `sequencing_error`
     - `missing_preflight_check`
     - `tool_mismatch`
     - `environment_drift`
     - `unsafe_instruction_handling`
     - `verification_blind_spot`
3. **Run eligibility gate**
   - Draft a skill only if all conditions are true:
     - failure is repeatable **or** one-off with high severity,
     - mitigation is generalizable beyond one task,
     - evidence is sufficient to encode deterministic steps,
     - sensitive data can be redacted safely.
4. **Choose action: new skill vs edit existing**
   - `edit_existing` if a current skill should have prevented the failure.
   - `create_new` only when no current skill reasonably covers the failure class.
5. **Materialize candidate draft**
   - Write to:
     - `workspace/skills/_candidates/[kebab-case-skill]/SKILL.md`
   - Include frontmatter + trigger conditions + anti-triggers + quality gates.
6. **Promote or reject via review gates**
   - Order is mandatory:
     1) spec compliance review
     2) quality review
   - Promotion lifecycle:
     - `drafted` -> `candidate` -> `proven` -> `released`
   - Rejection path:
     - `drafted|candidate -> rejected` with reason and rollback note.

### Failure Evidence Contract

Every failure-derived skill proposal must include:

1. Exact file path(s) involved.
2. One-sentence impact statement.
3. Direct evidence (error output, deterministic check, or code snippet).
4. Re-check evidence proving the mitigation works.

If any item is missing, do not draft or promote the skill.

### Candidate Skill Draft Template

Use this template for auto-drafted candidate skills:

```markdown
---
name: [kebab-case-skill-name]
description: |
  [What this skill does] and [when to use it].
allowed-tools:
  - [tool-1]
  - [tool-2]
user-invocable: false
status: drafted
origin: failure-to-skill
failure-fingerprint: [short-id-or-hash]
---

# [Skill Title]

## Trigger Conditions
- [Intent category 1]
- [Intent category 2]

## Anti-Triggers
- [When NOT to run]

## Failure Pattern Addressed
- **Class:** [spec_gap|sequencing_error|...]
- **Observed failure:** [concise statement]
- **Impact:** [what broke]

## Workflow
1. [Deterministic step]
2. [Deterministic step]
3. [Verification step]

## Quality Gates
- [ ] Preconditions checked
- [ ] Deterministic validation defined
- [ ] Security/safety guardrails included
- [ ] Rollback path defined

## Evidence
- **Paths:** [absolute paths]
- **Checks:** [commands or deterministic tests]
- **Expected outcome:** [pass criteria]
```

### Failure Logging Extension

When a failure leads to skill drafting, append this structure to `workspace/docs/agent-learnings.md`:

```markdown
### [DATE] — [Task Summary]
- **Skills used:** [skill chain]
- **Outcome:** [Success | Partial | Failed] — [one sentence]
- **Failure fingerprint:** [context + action + error + impact]
- **Root cause class:** [taxonomy value]
- **Skill action:** [create_new | edit_existing | no_draft]
- **Candidate skill:** [name or N/A]
- **Candidate status:** [drafted | candidate | proven | released | rejected]
- **Lesson:** [what changes next run]
```

### Candidate Evaluation Rubric (Before Promotion)

Score every drafted candidate skill on a 0-3 scale per dimension:

- **Generality (0-3):** addresses a reusable failure class, not a one-off incident
- **Determinism (0-3):** steps are concrete, ordered, and testable
- **Safety (0-3):** includes guardrails, anti-triggers, and rollback behavior
- **Evidence Quality (0-3):** proposal includes direct evidence plus re-check proof

Compute:

- `total_score = generality + determinism + safety + evidence_quality` (max 12)

Promotion thresholds:

- **10-12:** may advance `drafted -> candidate` (subject to review order)
- **7-9:** keep as `drafted`, revise weak dimensions, re-score
- **0-6:** mark `rejected` with rationale and avoid promotion

Hard blocks (cannot promote regardless of total):

- `safety < 2`
- `evidence_quality < 2`

Record rubric output in the review queue report and in `agent-learnings.md` when status changes.

### Promotion Rules

- **Promote after 2+ successes** — a pattern that works twice is worth keeping
- **Never auto-promote** — always note the pattern as "candidate" first
- **Revert if any failure** — one failure demotes a pattern back to "experimental"
- **Never log secrets** — redact API keys, tokens, credentials from learnings

Additional promotion safeguards for failure-derived skills:

- **No auto-release from single failure** unless severity is critical and evidence is deterministic.
- **Reject overfit drafts** that only patch one exact incident with no broader trigger logic.
- **Require downgrade path** so a released skill can be rolled back to `candidate` or `rejected` if regressions appear.

## Mode 5: Reflect — Capture Corrections from This Session

Run at session end or when the user says `/reflect`. Scans the conversation for
corrections, preferences, and patterns, then routes them to the right location.

### Phase 1: Session Scan

Scan the current conversation for these correction signals:

**High confidence (0.90+):**
- `remember:` prefix (explicit learning marker)
- Direct corrections: "no, use X instead", "that's wrong, do Y"

**Medium confidence (0.80):**
- "don't use Y" / "always do X" / "never do Y"
- "actually..." / "not like that" / "I meant..."

**Standard confidence (0.70):**
- "you should have..." / "next time, do X"
- Implicit correction (user redoes the step differently)

**Low confidence (0.60) — include but flag:**
- Inferred preferences from repeated behavior

**Discard (below 0.60):**
- Questions, one-time file-specific instructions, vague feedback ("looks better")

Also scan for **positive reinforcement**: "perfect", "exactly right", "yes, like that"
— these confirm existing skills/patterns are working.

### Phase 2: Extract and Classify

For each correction found:

```
Type:        correction | preference | pattern | knowledge
Content:     One-line learning statement
Context:     What triggered it (user quote or paraphrase)
Confidence:  0.60-0.95
Destination: project-skill | workspace-skill | cursor-rule | existing-skill-update
```

### Phase 3: Route to Destination

| Signal | Destination |
|--------|------------|
| Codebase-specific convention | `.cursor/skills/` (project skill) |
| Reusable across projects | `workspace/skills/` or `~/.cursor/skills/` |
| Coding standard or style rule | `.cursor/rules/*.mdc` |
| Correction while using an existing skill | Update that skill directly |
| Workflow pattern (2+ occurrences) | New skill candidate + log to `discovered-chains.md` |

### Phase 4: Present for Review

Show a summary + numbered cards. **Never auto-apply.** Always ask first.

```
## Session Reflection

**Summary:** 3 learnings captured · 2 high-confidence · 1 → workspace skill, 1 → cursor rule, 1 → existing skill update

---

### 1. [correction] Always check dist/ freshness before verifying integrations
**Confidence:** 0.90 | **Destination:** workspace-skill: `deep-audit`
**Why:** User corrected agent after stale build caused false 404. Reusable pattern.

---

### 2. [preference] Use pnpm --filter for monorepo builds
**Confidence:** 0.80 | **Destination:** cursor-rule: `monorepo-conventions.mdc`
**Why:** User said "always use --filter, not cd + build" — project standard.

---

### Discarded
- "Fix line 42" — one-time instruction
```

Then ask: **Apply all / Apply selected / Skip all**

### Phase 5: Apply (only after approval)

1. **New skill**: create `SKILL.md` in the appropriate directory
2. **Skill update**: read existing, append learning to relevant section
3. **New rule**: create `.mdc` with frontmatter in `.cursor/rules/`
4. **Deduplicate**: check for existing similar content before writing

### Phase 6: Log

Append to `workspace/docs/agent-learnings.md`:

```
### [DATE] — Session Reflection
- **Corrections captured:** N
- **Applied:** N (list destinations)
- **Skipped:** N (with reasons)
- **Skills updated:** [list]
- **Rules created:** [list]
```

## Improvement Methodology

When identifying improvements to your own performance:

1. **One variable at a time** — change one thing and measure the impact
2. **Separate execution failure from planning failure** — did you run the right skill wrong, or run the wrong skill?
3. **Measurable threshold** — only promote improvements that improve quality, speed, or reliability by a clear margin
4. **Never optimize by weakening security** — speed at the cost of safety is not improvement
5. **Promote only repeatable improvements** — a lucky one-off is not a pattern

## Output Format

When running in any mode, produce structured output:

```
## Self-Improvement Report

**Mode:** [Discover | Recommend | Chain | Learn]
**Task:** [what was being done]

### Discovery (if applicable)
- Tools: X available (Y from MC, Z from Paperclip)
- Skills: X available (Y workspace, Z global)

### Recommendation (if applicable)
- Recommended: [skill name] because [reason]
- Alternative: [skill name] if [condition]

### Chain Execution (if applicable)
- Step 1: [skill] → [outcome]
- Step 2: [skill] → [outcome]
- Final: [result]

### Learnings (if applicable)
- Pattern: [name]
- Status: [candidate | promoted | reverted]
- Next experiment: [what to try next time]
```
