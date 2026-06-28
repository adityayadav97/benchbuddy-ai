#!/usr/bin/env bash
# One-command bootstrap for BenchBuddy AI.
#   ./run.sh         -> start the dev server at http://127.0.0.1:8765
#   ./run.sh test    -> run the test suite
set -euo pipefail

cd "$(dirname "$0")"

PYTHON_BIN="${PYTHON_BIN:-python3.13}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN=python3
fi

if [ ! -d .venv ]; then
  echo "[bench-buddy] creating virtualenv with $PYTHON_BIN"
  "$PYTHON_BIN" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip -q
pip install -q -r requirements.txt
pip install -q pytest

case "${1:-serve}" in
  test)
    python -m pytest tests/ -v
    ;;
  serve|*)
    echo
    echo "▶ BenchBuddy AI is starting at  http://127.0.0.1:8765/"
    echo "  Open it in your browser. Press Ctrl-C to stop."
    echo
    uvicorn backend.main:app --host 127.0.0.1 --port 8765
    ;;
esac
