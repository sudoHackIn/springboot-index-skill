#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${PROJECT_ROOT:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || pwd)}"
ANALYZER_DIR="$SCRIPT_DIR/../analyzer"
ANALYZER_ENTRY="$ANALYZER_DIR/src/build-autoconfig-index.mjs"
BASE_DIR="$ROOT_DIR/.qwen/spring-autoconfig-index"
CACHE_DIR="$BASE_DIR/cache"
STATE_JSON="$CACHE_DIR/state.json"
ARTIFACTS_JSON="$CACHE_DIR/resolved-artifacts.json"
INIT_SCRIPT="$SCRIPT_DIR/export-resolved-artifacts.init.gradle"

BOOT_REPO="${BOOT_REPO:-$HOME/work/spring-boot}"
PROJECT_ROOT="${PROJECT_ROOT:-$ROOT_DIR}"
EXTRA_ROOTS_RAW="${EXTRA_ROOTS:-}"
RUNTIME_CONFIG_ROOTS_RAW="${RUNTIME_CONFIG_ROOTS:-}"
SPRING_BOOT_VERSION="${SPRING_BOOT_VERSION:-unknown}"
BASE_INDEX="${BASE_INDEX:-$SCRIPT_DIR/../assets/spring_boot_autoconfig_index.base.json}"
OUT_PATH="${OUT_PATH:-$BASE_DIR/spring_boot_autoconfig_index.json}"

FORCE="false"
if [[ "${1:-}" == "--force" ]]; then
  FORCE="true"
fi

mkdir -p "$CACHE_DIR"

if [[ ! -f "$ANALYZER_ENTRY" ]]; then
  echo "[autoconfig-index] analyzer entry not found: $ANALYZER_ENTRY" >&2
  exit 1
fi

if [[ ! -d "$ANALYZER_DIR/node_modules/tree-sitter" && ! -d "$ROOT_DIR/node_modules/tree-sitter" ]]; then
  echo "[autoconfig-index] tree-sitter dependencies are missing." >&2
  echo "[autoconfig-index] run: (cd skills/spring-index/spring-autoconfig-index-lookup/analyzer && npm install)" >&2
  exit 1
fi

export_resolved_artifacts_if_possible() {
  if [[ ! -f "$INIT_SCRIPT" ]]; then
    echo "[autoconfig-index] gradle init script not found: $INIT_SCRIPT" >&2
    return 1
  fi

  local runner=()
  if [[ -x "$ROOT_DIR/gradlew" ]]; then
    runner=("$ROOT_DIR/gradlew")
  elif command -v gradle >/dev/null 2>&1; then
    runner=("gradle")
  else
    echo "[autoconfig-index] gradle not found; skipping resolved-artifacts snapshot"
    return 0
  fi

  if [[ ! -f "$ROOT_DIR/settings.gradle" && ! -f "$ROOT_DIR/settings.gradle.kts" && ! -f "$ROOT_DIR/build.gradle" && ! -f "$ROOT_DIR/build.gradle.kts" ]]; then
    echo "[autoconfig-index] no Gradle root files found; skipping resolved-artifacts snapshot"
    return 0
  fi

  echo "[autoconfig-index] exporting resolved artifacts snapshot..."
  (
    cd "$ROOT_DIR"
    "${runner[@]}" -q -I "$INIT_SCRIPT" exportResolvedArtifacts -PautoconfigIndexOutput="$ARTIFACTS_JSON"
  )
}

join_extra_roots() {
  if [[ -z "$EXTRA_ROOTS_RAW" ]]; then
    return
  fi

  IFS=',' read -r -a roots <<< "$EXTRA_ROOTS_RAW"
  for item in "${roots[@]}"; do
    local trimmed
    trimmed="$(echo "$item" | xargs)"
    [[ -n "$trimmed" ]] && printf '%s\n' "$trimmed"
  done
}

join_runtime_config_roots() {
  if [[ -z "$RUNTIME_CONFIG_ROOTS_RAW" ]]; then
    return
  fi

  IFS=',' read -r -a roots <<< "$RUNTIME_CONFIG_ROOTS_RAW"
  for item in "${roots[@]}"; do
    local trimmed
    trimmed="$(echo "$item" | xargs)"
    [[ -n "$trimmed" ]] && printf '%s\n' "$trimmed"
  done
}

hash_file_if_exists() {
  local file="$1"
  if [[ -f "$file" ]]; then
    printf 'FILE:%s\n' "$file"
    cat "$file"
    printf '\n'
  fi
}

hash_tree_matches() {
  local base="$1"
  shift
  if [[ ! -d "$base" ]]; then
    return
  fi

  find "$base" -type f "$@" -not -path '*/.git/*' -not -path '*/build/*' -not -path '*/target/*' | sort | while read -r f; do
    printf 'TREE:%s\n' "$f"
    cat "$f"
    printf '\n'
  done
}

compute_fingerprint() {
  {
    printf 'SPRING_BOOT_VERSION=%s\n' "$SPRING_BOOT_VERSION"
    printf 'BOOT_REPO=%s\n' "$BOOT_REPO"
    printf 'PROJECT_ROOT=%s\n' "$PROJECT_ROOT"
    printf 'BASE_INDEX=%s\n' "$BASE_INDEX"
    printf 'NODE_WRAPPER=%s\n' "$SCRIPT_DIR/build-autoconfig-index.mjs"
    printf 'NODE_ANALYZER=%s\n' "$ANALYZER_ENTRY"
    printf 'NODE_ANALYZER_PACKAGE=%s\n' "$ANALYZER_DIR/package.json"
    printf 'RESOLVED_ARTIFACTS=%s\n' "$ARTIFACTS_JSON"

    hash_file_if_exists "$SCRIPT_DIR/build-autoconfig-index.mjs"
    hash_file_if_exists "$ANALYZER_ENTRY"
    hash_file_if_exists "$ANALYZER_DIR/package.json"
    hash_file_if_exists "$ARTIFACTS_JSON"
    hash_file_if_exists "$BASE_INDEX"

    hash_tree_matches "$PROJECT_ROOT" \
      \( -name 'settings.gradle' -o -name 'settings.gradle.kts' -o -name 'build.gradle' -o -name 'build.gradle.kts' -o -name 'gradle.properties' -o -name 'libs.versions.toml' -o -name 'pom.xml' \)

    hash_tree_matches "$PROJECT_ROOT" \
      \( -name 'org.springframework.boot.autoconfigure.AutoConfiguration.imports' -o -name 'spring-autoconfigure-metadata.properties' -o -name 'spring-configuration-metadata.json' \)

    while read -r extra; do
      [[ -z "$extra" ]] && continue
      printf 'EXTRA_ROOT=%s\n' "$extra"
      hash_tree_matches "$extra" \
        \( -name 'org.springframework.boot.autoconfigure.AutoConfiguration.imports' -o -name 'spring-autoconfigure-metadata.properties' -o -name 'spring-configuration-metadata.json' \)
    done < <(join_extra_roots)

    while read -r cfg; do
      [[ -z "$cfg" ]] && continue
      printf 'RUNTIME_CONFIG_ROOT=%s\n' "$cfg"
      hash_tree_matches "$cfg" \
        \( -name '*application*.properties' -o -name '*application*.yaml' -o -name '*application*.yml' \)
    done < <(join_runtime_config_roots)
  } | shasum -a 256 | awk '{print $1}'
}

export_resolved_artifacts_if_possible

CURRENT_HASH="$(compute_fingerprint)"
PREV_HASH=""
if [[ -f "$STATE_JSON" ]]; then
  PREV_HASH="$(jq -r '.fingerprint // empty' "$STATE_JSON" 2>/dev/null || true)"
fi

if [[ "$FORCE" != "true" && "$CURRENT_HASH" == "$PREV_HASH" && -f "$OUT_PATH" ]]; then
  echo "[autoconfig-index] fingerprint unchanged; index is up-to-date: $OUT_PATH"
  exit 0
fi

EXTRA_ARGS=()
while read -r extra; do
  [[ -z "$extra" ]] && continue
  EXTRA_ARGS+=(--extra-root "$extra")
done < <(join_extra_roots)

BASE_INDEX_ARGS=()
if [[ -f "$BASE_INDEX" ]]; then
  BASE_INDEX_ARGS=(--base-index "$BASE_INDEX")
fi

echo "[autoconfig-index] rebuilding..."
node "$SCRIPT_DIR/build-autoconfig-index.mjs" \
  --boot-repo "$BOOT_REPO" \
  --project-root "$PROJECT_ROOT" \
  --resolved-artifacts "$ARTIFACTS_JSON" \
  --version "$SPRING_BOOT_VERSION" \
  --out "$OUT_PATH" \
  "${BASE_INDEX_ARGS[@]}" \
  "${EXTRA_ARGS[@]}"

cat > "$STATE_JSON" <<JSON
{
  "fingerprint": "$CURRENT_HASH",
  "updated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "spring_boot_version": "$SPRING_BOOT_VERSION",
  "boot_repo": "$BOOT_REPO",
  "project_root": "$PROJECT_ROOT",
  "base_index": "$BASE_INDEX",
  "resolved_artifacts": "$ARTIFACTS_JSON",
  "runtime_config_roots": "$RUNTIME_CONFIG_ROOTS_RAW",
  "output": "$OUT_PATH"
}
JSON

echo "[autoconfig-index] done: $OUT_PATH"
