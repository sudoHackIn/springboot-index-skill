# Skill Evaluation Guide (Manual/Subagent-Driven)

This folder is developer-only.

## Goal

Оценивать именно поведение скилла (а не только jq-фильтры):
- может ли агент по `SKILL.md` корректно решить пользовательский вопрос,
- какие команды он запускал,
- насколько вывод полный/точный,
- где есть расхождения с ожидаемым результатом.

Подход повторяет идею из `skill-creator`: realistic test prompts, запуск скилла, review результатов, итеративные улучшения.

## Scenario Layout
- `.eval/scenarios/indexes/`
- `.eval/scenarios/cases/`

## Run Outputs
- `.eval/runs/<date>/<model>/<run-id>/meta.json`
- `.eval/runs/<date>/<model>/<run-id>/report.md`
- `.eval/runs/<date>/<model>/<run-id>/cases/<case-id>/prompt.txt`
- `.eval/runs/<date>/<model>/<run-id>/cases/<case-id>/output.md`
- `.eval/runs/<date>/<model>/<run-id>/cases/<case-id>/commands.log`
- `.eval/runs/<date>/<model>/<run-id>/cases/<case-id>/assessment.json`

Обязательно фиксировать версию скилла (`skill_version` из `SKILL.md`) в артефактах прогона:
- в `meta.json` (как минимум в `skill_metadata.declared_skill_version`),
- в `report.md` (читаемым полем `skill_declared_version`).

## How to Run (Required Process)

1. Выбрать индекс JSON.
2. Найти и прогнать **все** файлы сценариев из `.eval/scenarios/cases/*.json`.
3. Для каждого файла сценариев и каждого элемента массива в `cases`:
   - запускать **сабагента** с подключенным тестируемым скиллом,
   - передавать ему входные данные кейса как пользовательский prompt,
   - просить выполнить задачу по `SKILL.md` и вернуть результат.
4. Сохранять для каждого кейса:
   - входной prompt,
   - финальный ответ сабагента,
   - список выполненных команд (observable tool/command trace),
   - краткую внешнюю диагностическую трассу (почему выбран такой путь).
5. Выполнить оценку кейса по ожиданиям (`expected_*`) и записать verdict в `assessment.json`.
6. Собрать общий `report.md` и `meta.json`:
   - сводка по каждому файлу сценариев,
   - общий `overall` по всем сценариям.
   - зафиксированная версия скилла из `SKILL.md` (`skill_version`).

## Important Notes

- Не использовать synthetic проверки, которые не запускают скилл.
- Оценивать именно end-to-end поведение агента с этим скиллом.
- Приоритет: correctness > completeness > speed.
- Для reasoning сохранять только **external trace** (шаги/команды/проверки).
- Не сохранять скрытые внутренние chain-of-thought.

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
3. Improve `SKILL.md` / references / scripts.
4. Re-run same cases in a new run directory.
5. Compare pass rate and qualitative quality.
