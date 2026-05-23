# Paperclip PR Checklist

Run through this checklist before pushing a feature branch to a PR.

## Pre-Staging

- [ ] `git fetch origin master` — ensure you have the latest upstream
- [ ] `git rebase origin/master` — rebase onto current master to avoid merge-base drift
- [ ] Review `git status` — understand what's modified vs untracked vs staged

## Staging

- [ ] Stage files **explicitly** — never use `git add -A` or `git add .`
- [ ] Verify `git diff --cached --name-only` contains ONLY files for this feature
- [ ] Confirm NO `pnpm-lock.yaml` in staged files
- [ ] Confirm NO `package.json` export map changes (`./src/` → `./dist/`)

## Barrel Exports (index.ts files)

- [ ] Every `export { Foo } from "./module.js"` in modified barrel files references a module that is either:
  - Unchanged from upstream master, OR
  - Included in this PR's staged files
- [ ] No cross-feature type exports (e.g., routine types in a runtime-profile PR)

## CI Workflow Files

If `.github/workflows/*.yml` is modified:

- [ ] No `pnpm -C <workspace>` syntax (use `cd <workspace> && pnpm ...`)
- [ ] Simulation/smoke scripts run AFTER `pnpm build` step
- [ ] New jobs include `pnpm install` and proper Node.js/pnpm setup steps
- [ ] Job `needs` dependencies are correct

## Function Signatures

- [ ] No unrelated function signature changes (e.g., adding params to upstream functions)
- [ ] If a function call adds a new argument, the function definition is also in the PR

## Validation

- [ ] Run `./scripts/pre-push-check.sh` — all 7 checks pass
- [ ] Run `pnpm -r typecheck` locally — no errors
- [ ] Run relevant test files locally — all pass
- [ ] `git diff --name-only origin/master..HEAD` — final review of all files

## Post-Push

- [ ] Monitor CI checks via `gh pr checks <number> --repo <org>/<repo>`
- [ ] If CI fails, read the specific step logs before making changes
- [ ] Fix forward (amend + force-push) rather than creating new commits during review
