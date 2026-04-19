#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Cleanup eval run artifacts while keeping audit-critical files.

Required:
  --run-dir PATH               Run directory under .eval/runs/.../<run-id>

Optional:
  --remove-commands            Also remove cases/*/commands.log
  --remove-prompt              Also remove cases/*/prompt.txt
  --remove-output-json         Also remove cases/*/output.json
  --dry-run                    Print what would be removed
  -h, --help                   Show help

Default keeps:
  meta.json
  report.md
  cases/*/assessment.json      (scores, track quality trends)
  cases/*/output.json          (agent answer, for regression audit)
  cases/*/prompt.txt           (what was asked)
  cases/*/commands.log         (how the agent worked; feeds skill cost-reduction analysis)

Default removes (bulky / regeneratable / noise):
  cases/*/events.jsonl         (~72% of case dir size, replayable)
  cases/*/output.md            (rendered dup of output.json)
  cases/*/stderr.log           (noise)
  run.log                      (raw session log)
  raw_subagent_result.json     (sum'd by output.json)
  .summary_cases*.jsonl
  .run_dir_path.txt
  .DS_Store (anywhere under the run)
USAGE
}

RUN_DIR=""
REMOVE_COMMANDS=false
REMOVE_PROMPT=false
REMOVE_OUTPUT_JSON=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-dir) RUN_DIR="$2"; shift 2 ;;
    --remove-commands) REMOVE_COMMANDS=true; shift ;;
    --remove-prompt) REMOVE_PROMPT=true; shift ;;
    --remove-output-json) REMOVE_OUTPUT_JSON=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$RUN_DIR" ]] || { echo "--run-dir is required" >&2; exit 2; }
[[ -d "$RUN_DIR" ]] || { echo "run dir does not exist: $RUN_DIR" >&2; exit 2; }
[[ -d "$RUN_DIR/cases" ]] || { echo "missing cases dir under run: $RUN_DIR/cases" >&2; exit 2; }

remove_file() {
  local path="$1"
  [[ -f "$path" ]] || return 0
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "would_remove $path"
  else
    rm -f "$path"
    echo "removed $path"
  fi
}

remove_pattern() {
  local pattern="$1"
  shopt -s nullglob
  local files=( $pattern )
  shopt -u nullglob
  for f in "${files[@]}"; do
    remove_file "$f"
  done
}

# Run-level transient files
remove_file "$RUN_DIR/run.log"
remove_file "$RUN_DIR/raw_subagent_result.json"
remove_pattern "$RUN_DIR/.summary_cases*.jsonl"
remove_file "$RUN_DIR/.run_dir_path.txt"

# .DS_Store anywhere under run dir
while IFS= read -r -d '' f; do
  remove_file "$f"
done < <(find "$RUN_DIR" -name ".DS_Store" -type f -print0)

# Case-level transient files
for case_dir in "$RUN_DIR"/cases/*; do
  [[ -d "$case_dir" ]] || continue
  remove_file "$case_dir/events.jsonl"
  remove_file "$case_dir/stderr.log"
  remove_file "$case_dir/output.md"

  if [[ "$REMOVE_COMMANDS" == "true" ]]; then
    remove_file "$case_dir/commands.log"
  fi
  if [[ "$REMOVE_PROMPT" == "true" ]]; then
    remove_file "$case_dir/prompt.txt"
  fi
  if [[ "$REMOVE_OUTPUT_JSON" == "true" ]]; then
    remove_file "$case_dir/output.json"
  fi

  if [[ ! -f "$case_dir/assessment.json" ]]; then
    echo "warning missing $case_dir/assessment.json"
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    rmdir "$case_dir" 2>/dev/null || true
  fi
done

echo "done run_dir=$RUN_DIR dry_run=$DRY_RUN"
