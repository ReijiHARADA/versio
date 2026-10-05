#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python_bin="${CAT_PYTHON:-$repo_root/translation-server/.venv/bin/python}"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'USAGE'
Usage: scripts/run-cat-audit.sh

Environment variables accepted by benchmark-cat-translate.py include:
  CAT_INPUT_REPORT, CAT_OUTPUT_REPORT, CAT_MAX_ROWS, CAT_MODEL
  CAT_PROTECT_CITATIONS, CAT_PROTECT_ACRONYMS, CAT_PROMPT_SUFFIX
USAGE
  exit 0
fi

if [[ ! -x "$python_bin" ]]; then
  echo "CAT audit requires a Python environment with torch and transformers: $python_bin" >&2
  echo "Set CAT_PYTHON to an equivalent interpreter if needed." >&2
  exit 2
fi

cd "$repo_root"
exec "$python_bin" scripts/benchmark-cat-translate.py "$@"
