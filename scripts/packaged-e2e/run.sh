#!/usr/bin/env bash
# Entry: run Layer A (integration) then Layer B (UI) packaged acceptance.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/scripts/packaged-e2e/run-integration.sh"
bash "$ROOT/scripts/packaged-e2e/run-ui.sh"
