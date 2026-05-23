#!/usr/bin/env bash
# Local preflight: PATH merge + optional Cursor Agent CLI check, then Paperclip dev.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "== verify:cursor-agent-path (non-fatal if CLI not installed) =="
if ./scripts/verify-cursor-agent-cli-path.sh; then
  :
else
  echo "WARN: agent not on merged PATH — install Cursor Agent CLI or set adapter Command. Continuing dev." >&2
fi
echo "== dev:login-path =="
exec ./scripts/run-dev-with-login-path.sh
