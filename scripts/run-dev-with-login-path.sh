#!/usr/bin/env bash
#
# Paperclip dev — PATH parity for Cursor local adapter (`agent` CLI)
# --------------------------------------------------------------------
# Tactical:  If env test still fails, run `which agent` in this shell after
#            start, or set adapter **Command** to that absolute path.
# Strategic: See workspace/docs/runbooks/paperclip-cursor-agent-env-path.md
#            (CURSOR_API_KEY in ~/.zprofile / LaunchAgent, or `agent login`.)
# Architectural: GUI-launched parents often lack ~/.local/bin on PATH and skip
#            ~/.zprofile. This script merges a login-shell PATH, prepends the
#            same dirs as cursor-local, sources ~/.cursor/cursor-agent.env and
#            first CURSOR_API_KEY= line from ~/.openclaw/.env (full-file source avoided),
#            then runs pnpm.
#
# Usage (from repo root):
#   ./scripts/run-dev-with-login-path.sh          # same as: pnpm dev
#   ./scripts/run-dev-with-login-path.sh run dev:server
#   ./scripts/run-dev-with-login-path.sh exec which agent   # verify agent visible (not `pnpm exec`)
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

login_path() {
  if [[ -x /bin/zsh ]]; then
    /bin/zsh -lic 'print -rn $PATH' 2>/dev/null && return 0
  fi
  if [[ -x /bin/bash ]]; then
    /bin/bash -lc 'printf %s "$PATH"' 2>/dev/null && return 0
  fi
  return 1
}

EXTRA_PREFIX="${HOME}/.local/bin:${HOME}/.cursor/bin:/opt/homebrew/bin:/usr/local/bin"
LP="$(login_path || true)"
if [[ -n "${LP:-}" ]]; then
  export PATH="${LP}:${PATH:-}"
fi
export PATH="${EXTRA_PREFIX}:${PATH:-}"

# Match ~/.zprofile hook: thin/GUI-started dev servers otherwise miss CURSOR_API_KEY.
if [[ -r "${HOME}/.cursor/cursor-agent.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "${HOME}/.cursor/cursor-agent.env"
  set +a
fi
if [[ -r "${HOME}/.openclaw/.env" ]]; then
  while IFS= read -r __line || [[ -n "${__line}" ]]; do
    __line="${__line#"${__line%%[![:space:]]*}"}"
    [[ -z "${__line}" || "${__line}" == \#* ]] && continue
    if [[ "${__line}" =~ ^export[[:space:]]+CURSOR_API_KEY=(.*)$ ]]; then
      export CURSOR_API_KEY="${BASH_REMATCH[1]}"
      break
    fi
    if [[ "${__line}" =~ ^CURSOR_API_KEY=(.*)$ ]]; then
      export CURSOR_API_KEY="${BASH_REMATCH[1]}"
      break
    fi
  done <"${HOME}/.openclaw/.env"
  if [[ -n "${CURSOR_API_KEY:-}" ]]; then
    __v="${CURSOR_API_KEY}"
    __v="${__v#\"}"
    __v="${__v%\"}"
    __v="${__v#\'}"
    __v="${__v%\'}"
    export CURSOR_API_KEY="${__v}"
  fi
  unset __line __v
fi

if [[ $# -eq 0 ]]; then
  exec pnpm run dev
fi
# `pnpm run dev:login-path exec which agent` passes through here; do not route to `pnpm exec`.
if [[ "${1:-}" == "exec" ]]; then
  shift
  exec "$@"
fi
exec pnpm "$@"
