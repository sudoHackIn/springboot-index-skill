# Skill Evaluation Guide (Manual/Subagent-Driven)

This folder is developer-only.

## Goal

Оценивать именно поведение скилла (а не только внутренний eval-скрипт):
- насколько корректно агент по `SKILL.md` определяет, какие автоконфигурации/бины ожидаются,
- умеет ли объяснить причину `match/no-match`,
- какие команды и проверки он реально выполнял.

Подход повторяет идею `skill-creator`: realistic prompts, запуск скилла, review результата, итеративные улучшения.

## Scenario Layout
- `.eval/scenarios/indexes/`
- `.eval/scenarios/cases/`
- `.eval/scenarios/configs/`

## Run Outputs
- `.eval/runs/<date>/<model>/<run-id>/meta.json`
- `.eval/runs/<date>/<model>/<run-id>/report.md`
- `.eval/runs/<date>/<model>/<run-id>/cases/<case-id>/prompt.txt`
- `.eval/runs/<date>/<model>/<run-id>/cases/<case-id>/output.md`
- `.eval/runs/<date>/<model>/<run-id>/cases/<case-id>/commands.log`
- `.eval/runs/<date>/<model>/<run-id>/cases/<case-id>/assessment.json`

## How to Run (Required Process)

1. Выбрать index JSON.
2. Найти и запустить **все** файлы сценариев из `.eval/scenarios/cases/*.json` (а не один выбранный файл).
3. Для каждого файла сценариев и для каждого case из его массива:
   - запускать **сабагента** с тестируемым скиллом,
   - передавать ему вопрос и контекст кейса (regex, property_name, project_config_dir, config_dir, app_name, active_profiles, runtime_properties),
   - просить выполнить диагностику и вернуть итог.
4. Сохранять для каждого case:
   - prompt,
   - итоговый ответ,
   - список команд (observable trace),
   - оценку по ожиданиям (`expected_verdict`, `expected_autoconfig_regex`).
5. Собирать общий `report.md` + `meta.json`:
   - сводка по каждому файлу сценариев,
   - общий `overall` по всем сценариям.

## Important Notes

- Не использовать synthetic eval, который не запускает поведение скилла.
- Оценивать end-to-end workflow скилла.
- Приоритет: correctness > completeness > speed.
- Сохранять только external trace (команды/проверки/наблюдения).
- Не сохранять hidden chain-of-thought.

## Minimal Per-Case Assessment Schema

```json
{
  "id": "case-id",
  "pass": true,
  "score": 1.0,
  "checks": {
    "correctness": "pass|fail",
    "completeness": "pass|fail",
    "hallucination": "pass|fail"
  },
  "notes": ["short findings"],
  "evidence": {
    "commands_log": "./cases/case-id/commands.log",
    "output": "./cases/case-id/output.md"
  }
}
```

## Iteration Loop

1. Run cases with current skill.
2. Review failures and weak spots.
3. Improve SKILL/references/scripts.
4. Re-run same cases in a new run directory.
5. Compare pass rate and output quality.

## Standard Scripts

Run from repository root:

- Universal full eval runner:
```bash
./scripts/run-skill-eval-universal.sh \
  --skill-root ./skills/spring-index/spring-autoconfig-index-lookup \
  --workdir . \
  --agent-extra-args="--sandbox workspace-write"
```

- Re-run only failed cases from an existing run:
```bash
./scripts/run-skill-eval-universal.sh \
  --skill-root ./skills/spring-index/spring-autoconfig-index-lookup \
  --workdir . \
  --rerun-failed-from ./skills/spring-index/spring-autoconfig-index-lookup/.eval/runs/<date>/<model>/<run-id> \
  --agent-extra-args="--sandbox workspace-write"
```

- Optional explicit run id:
```bash
--run-id my-run-id
```

## Run Metadata (Required for Traceability)

`meta.json` must include:

- `skill_metadata.skill_md_sha256`
- `skill_metadata.declared_skill_version`
- `index_sha256`
- `repo.branch`
- `repo.commit`
- `repo.dirty`

This allows answering: "on which skill/index/repo state did this run pass?"

## Skill Version Convention

- Keep `skill_version` in `SKILL.md` body (not required in front-matter).
- Current parsers read both plain form and inline-code form, e.g.:
  - `skill_version: 0.1.0`
  - `` `skill_version: 0.1.0` ``

## Find Matching Runs

To find runs corresponding to current skill metadata:

```bash
./scripts/find-skill-eval-runs.sh \
  --skill-root ./skills/spring-index/spring-autoconfig-index-lookup \
  --mode exact
```

Modes:

- `exact`: skill hash + index hash match
- `hash`: only skill hash match
- `version`: declared version match
- `all`: print all runs with match flags

## Artifact Cleanup (History-Minimal Retention)

After analysis, optional cleanup of temporary artifacts:

```bash
./scripts/cleanup-skill-eval-run.sh \
  --run-dir ./skills/spring-index/spring-autoconfig-index-lookup/.eval/runs/<date>/<model>/<run-id> \
  --dry-run
```

Then execute without `--dry-run` to apply.

Default retained files (history minimum):

- `meta.json`
- `report.md`
- `run.log`
- `cases/*/assessment.json`

Default removable files:

- `cases/*/prompt.txt`
- `cases/*/events.jsonl`
- `cases/*/stderr.log`
- `cases/*/commands.log`
- `cases/*/output.md`
- `cases/*/output.json`
- `.summary_cases*.jsonl`
