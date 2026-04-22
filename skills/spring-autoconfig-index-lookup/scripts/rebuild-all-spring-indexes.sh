#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORCE_ARG="${1:-}"

AUTOCONFIG_SCRIPT="$SCRIPT_DIR/rebuild-autoconfig-index.sh"
PROPS_SCRIPT="$SCRIPT_DIR/rebuild-props-index.sh"

echo "[spring-index] step 1/2: autoconfig index"
"$AUTOCONFIG_SCRIPT" "$FORCE_ARG"

echo "[spring-index] step 2/2: properties index"
PROPS_FOUND="false"
if [[ -x "$PROPS_SCRIPT" ]]; then
  PROPS_FOUND="true"
  "$PROPS_SCRIPT" "$FORCE_ARG"
elif [[ -f "$PROPS_SCRIPT" ]]; then
  PROPS_FOUND="true"
  bash "$PROPS_SCRIPT" "$FORCE_ARG"
fi

if [[ "$PROPS_FOUND" != "true" ]]; then
  echo "[spring-index] props index script not found; skipped"
fi

echo "[spring-index] done"
