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
   - передавать ему вопрос и контекст кейса (regex, property_name, config_dir, active_profiles),
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
