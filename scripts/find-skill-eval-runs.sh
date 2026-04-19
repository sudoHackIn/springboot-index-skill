#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Find eval runs matching current skill metadata.

Required:
  --skill-root PATH            Skill root directory (contains SKILL.md)

Optional:
  --eval-dir PATH              Eval dir (default: <skill-root>/.eval)
  --index PATH                 Index json (default: first in <eval-dir>/scenarios/indexes/*.json)
  --runs-root PATH             Runs root (default: <eval-dir>/runs)
  --mode MODE                  one of: all|exact|version|hash (default: all)
  --limit N                    Max runs to print (default: 200)
  --json                       Output JSON array
  -h, --help                   Show help

Matching logic:
  exact   : skill_md_sha256 + index_sha256 both match current
  version : declared_skill_version matches current (if present)
  hash    : skill_md_sha256 matches current
  all     : print everything with match flags
USAGE
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing required command: $1" >&2; exit 1; }
}

sha256_of_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo ""
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  else
    echo ""
  fi
}

SKILL_ROOT=""
EVAL_DIR=""
INDEX_PATH=""
RUNS_ROOT=""
MODE="all"
LIMIT=200
AS_JSON=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill-root) SKILL_ROOT="$2"; shift 2 ;;
    --eval-dir) EVAL_DIR="$2"; shift 2 ;;
    --index) INDEX_PATH="$2"; shift 2 ;;
    --runs-root) RUNS_ROOT="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --json) AS_JSON=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

require_cmd jq

[[ -n "$SKILL_ROOT" ]] || { echo "--skill-root is required" >&2; exit 2; }
[[ -f "$SKILL_ROOT/SKILL.md" ]] || { echo "SKILL.md not found: $SKILL_ROOT/SKILL.md" >&2; exit 2; }

if [[ -z "$EVAL_DIR" ]]; then
  EVAL_DIR="$SKILL_ROOT/.eval"
fi
if [[ -z "$INDEX_PATH" ]]; then
  INDEX_PATH=$(find "$EVAL_DIR/scenarios/indexes" -maxdepth 1 -type f -name '*.json' | sort | head -n 1 || true)
fi
if [[ -z "$RUNS_ROOT" ]]; then
  RUNS_ROOT="$EVAL_DIR/runs"
fi

[[ -d "$RUNS_ROOT" ]] || { echo "runs root not found: $RUNS_ROOT" >&2; exit 2; }

case "$MODE" in
  all|exact|version|hash) ;;
  *) echo "invalid --mode: $MODE" >&2; exit 2 ;;
esac

current_skill_sha=$(sha256_of_file "$SKILL_ROOT/SKILL.md")
current_index_sha=$(sha256_of_file "$INDEX_PATH")
current_version="$(
  perl -ne '
    if (/skill_version:\s*([A-Za-z0-9._-]+)/) { print $1; exit 0 }
    if (/`skill_version:\s*([A-Za-z0-9._-]+)`/) { print $1; exit 0 }
  ' "$SKILL_ROOT/SKILL.md" 2>/dev/null || true
)"

mapfile -t meta_files < <(find "$RUNS_ROOT" -type f -name meta.json | sort)

if (( ${#meta_files[@]} == 0 )); then
  echo "no meta.json found under $RUNS_ROOT" >&2
  exit 0
fi

tmp_jsonl=$(mktemp)
: > "$tmp_jsonl"

for mf in "${meta_files[@]}"; do
  run_dir=$(dirname "$mf")

  run_id=$(jq -r '.run_id // empty' "$mf")
  date_v=$(jq -r '.date // empty' "$mf")
  model=$(jq -r '.model // empty' "$mf")
  total=$(jq -r '.overall.total // 0' "$mf")
  passed=$(jq -r '.overall.passed // 0' "$mf")
  failed=$(jq -r '.overall.failed // 0' "$mf")
  pass_rate=$(jq -r '.overall.pass_rate // empty' "$mf")

  skill_sha=$(jq -r '.skill_metadata.skill_md_sha256 // empty' "$mf")
  skill_ver=$(jq -r '.skill_metadata.declared_skill_version // empty' "$mf")
  index_sha=$(jq -r '.index_sha256 // empty' "$mf")
  mode_v=$(jq -r '.mode // "unknown"' "$mf")

  hash_match=false
  exact_match=false
  version_match=false

  [[ -n "$current_skill_sha" && -n "$skill_sha" && "$current_skill_sha" == "$skill_sha" ]] && hash_match=true
  [[ -n "$current_version" && -n "$skill_ver" && "$current_version" == "$skill_ver" ]] && version_match=true
  if [[ "$hash_match" == true && -n "$current_index_sha" && -n "$index_sha" && "$current_index_sha" == "$index_sha" ]]; then
    exact_match=true
  fi

  jq -n \
    --arg meta_file "$mf" \
    --arg run_dir "$run_dir" \
    --arg run_id "$run_id" \
    --arg date "$date_v" \
    --arg model "$model" \
    --arg mode "$mode_v" \
    --argjson total "$total" \
    --argjson passed "$passed" \
    --argjson failed "$failed" \
    --arg pass_rate "$pass_rate" \
    --arg skill_sha "$skill_sha" \
    --arg skill_ver "$skill_ver" \
    --arg index_sha "$index_sha" \
    --argjson hash_match "$hash_match" \
    --argjson version_match "$version_match" \
    --argjson exact_match "$exact_match" \
    '{meta_file:$meta_file,run_dir:$run_dir,run_id:$run_id,date:$date,model:$model,mode:$mode,overall:{total:$total,passed:$passed,failed:$failed,pass_rate:$pass_rate},skill_metadata:{skill_md_sha256:$skill_sha,declared_skill_version:$skill_ver,index_sha256:$index_sha},matches:{hash:$hash_match,version:$version_match,exact:$exact_match}}' \
    >> "$tmp_jsonl"
done

filtered=$(jq -s --arg mode "$MODE" '
  if $mode=="exact" then map(select(.matches.exact==true))
  elif $mode=="version" then map(select(.matches.version==true))
  elif $mode=="hash" then map(select(.matches.hash==true))
  else . end
  | sort_by(.date, .run_id)
  | reverse
' "$tmp_jsonl")

if [[ "$AS_JSON" == true ]]; then
  jq --argjson limit "$LIMIT" '.[0:$limit]' <<< "$filtered"
  exit 0
fi

count=$(jq 'length' <<< "$filtered")
echo "current_skill_sha256=$current_skill_sha"
echo "current_skill_version=${current_version:-}"
echo "current_index_sha256=${current_index_sha:-}"
echo "mode=$MODE total_matches=$count"

echo "run_id | date | model | mode | pass/total | hash | version | exact"
jq -r --argjson limit "$LIMIT" '.[:$limit][] | [.run_id, .date, .model, .mode, ((.overall.passed|tostring)+"/"+(.overall.total|tostring)), (.matches.hash|tostring), (.matches.version|tostring), (.matches.exact|tostring)] | join(" | ")' <<< "$filtered"
