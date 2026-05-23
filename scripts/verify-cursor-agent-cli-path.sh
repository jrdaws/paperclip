#!/usr/bin/env bash
# Tactical check: does `agent` resolve when PATH is built like Paperclip dev:login-path?
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if path="$(./scripts/run-dev-with-login-path.sh exec which agent 2>/dev/null)" && [[ -n "${path}" ]]; then
  echo "OK: ${path}"
  exit 0
fi
echo "FAIL: Cursor Agent CLI (agent) not found after login-path merge. Install it or set adapter Command to an absolute path. See workspace/docs/runbooks/paperclip-cursor-agent-env-path.md" >&2
exit 1
