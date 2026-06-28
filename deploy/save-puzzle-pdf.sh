#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo "usage: ${0##*/} series/{identifier,latest,random} [output.pdf]" >&2
  exit 1
fi

puzzle="$1"
out="${2:-${puzzle//\//-}.pdf}"

google-chrome-stable \
  --headless --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=5000 \
  --print-to-pdf="$out" \
  "http://localhost:3000/print/$puzzle"

echo "wrote $out"
