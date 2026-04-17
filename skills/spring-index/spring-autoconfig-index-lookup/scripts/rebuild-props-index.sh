#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${PROJECT_ROOT:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || pwd)}"
BASE_DIR="$ROOT_DIR/.qwen/spring-properties-index"
CACHE_DIR="$BASE_DIR/cache"
ARTIFACTS_JSON="$CACHE_DIR/resolved-artifacts.json"
STATE_JSON="$CACHE_DIR/state.json"
INDEX_JSON="$BASE_DIR/spring_properties_index.json"
SCHEMA_JSON="$BASE_DIR/spring_properties_index.schema.json"
INIT_SCRIPT="$SCRIPT_DIR/export-resolved-artifacts.init.gradle"
NODE_SCRIPT="$SCRIPT_DIR/build-props-index.mjs"

FORCE="false"
if [[ "${1:-}" == "--force" ]]; then
  FORCE="true"
fi

mkdir -p "$CACHE_DIR"

hash_files() {
  (
    cd "$ROOT_DIR"
    {
      find . -type f \( -name 'settings.gradle' -o -name 'settings.gradle.kts' -o -name 'build.gradle' -o -name 'build.gradle.kts' -o -name 'gradle.properties' -o -name 'libs.versions.toml' \) \
        -not -path './.gradle/*' -not -path './**/build/*' | sort | while read -r f; do
          printf '%s\n' "$f"
          cat "$f"
          printf '\n'
        done
      printf '\nJAVA_HOME=%s\n' "${JAVA_HOME:-}"
    } | shasum -a 256 | awk '{print $1}'
  )
}

CURRENT_HASH="$(hash_files)"
PREV_HASH=""
if [[ -f "$STATE_JSON" ]]; then
  PREV_HASH="$(jq -r '.fingerprint // empty' "$STATE_JSON" 2>/dev/null || true)"
fi

if [[ "$FORCE" != "true" && "$CURRENT_HASH" == "$PREV_HASH" && -f "$INDEX_JSON" ]]; then
  echo "[props-index] fingerprint unchanged; index is up-to-date: $(basename "$INDEX_JSON")"
  exit 0
fi

echo "[props-index] exporting resolved artifacts..."
(
  cd "$ROOT_DIR"
  ./gradlew -q -I "$INIT_SCRIPT" exportResolvedArtifacts -PpropsIndexOutput="$ARTIFACTS_JSON"
)

echo "[props-index] building properties index..."
(
  cd "$ROOT_DIR"
  node "$NODE_SCRIPT" \
    --artifacts="$ARTIFACTS_JSON" \
    --output="$INDEX_JSON" \
    --schema="$SCHEMA_JSON" \
    --include-observed=true
)

cat > "$STATE_JSON" <<JSON
{
  "fingerprint": "$CURRENT_HASH",
  "updated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "artifacts_json": "${ARTIFACTS_JSON#$ROOT_DIR/}",
  "index_json": "${INDEX_JSON#$ROOT_DIR/}"
}
JSON

echo "[props-index] done: $(basename "$INDEX_JSON")"
