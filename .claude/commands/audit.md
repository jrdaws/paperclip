# /audit — Deep Audit

Audit all files touched in the current session, or the scope specified: $ARGUMENTS

## Workflow

1. **Identify scope** — Gather every file created or modified in this session. If a path or project is specified, scope to that instead.

2. **Read every file** — No skimming, no assumptions. Read the full contents of each file.

3. **Audit pass** — Check each file for:
   - Bugs, logic errors, off-by-one mistakes, race conditions
   - Linter errors (run linter where available)
   - Type errors, missing imports, broken references
   - Security issues (hardcoded secrets, injection vectors, missing validation)
   - Consistency (naming, patterns, style matching the rest of the codebase)
   - Dead code, unused variables, redundant logic
   - Missing error handling, silent failures
   - Broken links between files (imports, routes, data references)

4. **Test** — Run existing tests if available (`npm test`, `pytest`, etc.). If no tests exist, do manual verification (build, lint, type-check).

5. **Fix** — Fix every issue found. Don't just report — actually fix the code.

6. **Re-audit** — Read the fixed files again. Repeat steps 3-5 until all files pass clean with zero issues.

7. **Report** — Summarize what was found, what was fixed, and confirm clean status.
