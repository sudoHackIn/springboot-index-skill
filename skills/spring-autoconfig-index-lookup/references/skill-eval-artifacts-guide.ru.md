# Skill Eval Artifacts Guide (RU)

Документ описывает артефакты, которые генерирует запуск eval через:
- `/Users/vladislav/projects/springboot-index-skill/tmp/run_skill_eval_full.sh`
- `/Users/vladislav/projects/springboot-index-skill/tmp/rerun_failed_eval_cases.sh`

## 1. Где лежат артефакты

Базовый путь:

`/Users/vladislav/projects/springboot-index-skill/skills/spring-autoconfig-index-lookup/.eval/runs/<date>/<model>/<run_id>/`

Пример:

`/Users/vladislav/projects/springboot-index-skill/skills/spring-autoconfig-index-lookup/.eval/runs/2026-04-17/gpt-5.4/full-1__skill_eval_fixture_index__all-cases__221312/`

## 2. Структура run и назначение файлов

### Файлы верхнего уровня run

- `run.log`
  - Что это: хронологический журнал выполнения.
  - Для чего: быстрый технический timeline (старт/стоп кейса, exit code, итоги).
  - Кому полезно: человеку при отладке падений и агенту для построения причинно-следственной цепочки.

- `meta.json`
  - Что это: машинно-читаемая сводка всего прогона.
  - Для чего: автоматический парсинг CI/дашбордами и агентами.
  - Содержит: `overall` (total/passed/failed/pass_rate), `case_files` (сводка по scenario-файлам), служебные поля (`date`, `model`, `run_id`, `index`, `run_dir`), в rerun-режиме также `mode` и `source_run`.

- `report.md`
  - Что это: краткий human-readable отчет.
  - Для чего: быстро посмотреть, "что сломалось" без jq.
  - Содержит: overall, per-case-file breakdown, список failed cases с notes.

- `.summary_cases.jsonl`
  - Что это: промежуточный line-based агрегат "одна строка = один кейс".
  - Для чего: источник для сборки `meta.json`/`report.md` в этом run.
  - Примечание: технический файл; обычно не нужен как конечный артефакт.

- `.run_dir_path.txt`
  - Что это: путь к текущей run-директории.
  - Для чего: удобный "якорь" для скриптов/копипаста.

### Каталог `cases/<case-id>/`

Для каждого кейса создаются:

- `prompt.txt`
  - Что это: реальный промпт, отправленный сабагенту.
  - Для чего: воспроизводимость и аудит того, с каким контекстом запускался кейс.

- `output.md`
  - Что это: markdown-ответ сабагента.
  - Для чего: ручной анализ reasoning.

- `output.json`
  - Что это: выделенный из `output.md` финальный JSON-блок (если валиден).
  - Для чего: надежный машинный вход для оценки (verdict/autoconfigs/commands/reasoning_summary).

- `events.jsonl`
  - Что это: полный event stream `codex exec --json`.
  - Для чего: глубокая отладка хода агента (сообщения, команды, статусы, ошибки).

- `commands.log`
  - Что это: команды shell, извлеченные из `events.jsonl`.
  - Для чего: быстрая проверка "агент действительно что-то запускал".

- `stderr.log`
  - Что это: stderr сабагента/раннера.
  - Для чего: первичный источник при `subagent_exit_nonzero`.

- `assessment.json`
  - Что это: итог оценки кейса.
  - Для чего: single-case truth для pass/fail и причин.
  - Содержит: `checks` (correctness/completeness/hallucination), `notes`, `expected`, `actual`, ссылки на evidence.

## 3. Что дублируется, а что нет

Ниже указано осознанное дублирование:

- `report.md` и `meta.json`
  - Дублируют high-level summary.
  - Разница: `report.md` для человека, `meta.json` для машин.

- `.summary_cases.jsonl` и `assessment.json`
  - Дублируют часть данных на уровне кейса (`id`, pass, expected/actual verdict).
  - Разница: `assessment.json` богаче (checks, notes, evidence), `.summary_cases.jsonl` удобен для быстрой агрегации.

- `output.md`, `output.json`, `events.jsonl`
  - Частично пересекаются по смыслу, но не взаимозаменяемы:
  - `output.md` = финальный текст ответа.
  - `output.json` = нормализованный машиночитаемый итог.
  - `events.jsonl` = полный процесс выполнения.

- `commands.log` и `output.json.commands`
  - Могут содержать похожий список команд.
  - Разница: `commands.log` собирается из фактических событий исполнения; `output.json.commands` сообщает сам агент в финальном JSON.

### Практический вывод по дублированию

Дублирование здесь в основном "представленческое", а не лишнее:
- одна и та же сущность представлена в разных форматах под разные потребности (человек/агент/CI/форензика);
- для глубокой диагностики нужны оба источника: нормализованный (`assessment.json`) и сырые следы (`events.jsonl`, `stderr.log`).

## 4. Single Source of Truth по задачам

- "Прошел ли кейс? почему упал?"
  - Источник: `cases/<id>/assessment.json`

- "Общий процент и разбивка по сценариям?"
  - Источник: `meta.json`

- "Что быстро показать команде?"
  - Источник: `report.md`

- "Что именно запускал агент?"
  - Источник: `commands.log` (быстро), `events.jsonl` (точно и полно)

- "Почему агент упал технически?"
  - Источник: `stderr.log` + `run.log` + `events.jsonl`

- "Как воспроизвести конкретный кейс?"
  - Источник: `prompt.txt` + `output.md/output.json` + `assessment.json`

## 5. Как использовать человеку

Рекомендуемый поток анализа:

1. Открыть `report.md` и понять масштаб проблем.
2. Проверить `meta.json` для точных чисел и разреза по scenario-файлам.
3. По fail-кейсам открыть `assessment.json` и `notes`.
4. Если причина неочевидна, открыть `stderr.log` и `events.jsonl`.
5. Для предметного качества ответа агента смотреть `output.md` и `output.json`.

## 6. Как использовать другому агенту

Рекомендуемый агентный pipeline:

1. Считать `meta.json` и выбрать target-сегменты (например, сценарии с низким pass rate).
2. Пройти по `cases/*/assessment.json` и сгруппировать типы падений по `notes`.
3. Для `subagent_exit_nonzero` автоматически читать `stderr.log` и первые/последние события из `events.jsonl`.
4. Для `verdict_mismatch` сверять `output.json` против `expected` из `assessment.json`.
5. Генерировать remediation plan отдельно по категориям: infra/runtime errors vs logic mismatches.

## 7. Классы сценариев (что именно они валидируют)

Сценарии в `.eval/scenarios/cases/*.json` используют одинаковый механизм артефактов, но разный контекст:

- `skill_eval_cases.json`: базовые sanity-кейсы.
- `skill_eval_cases_config_tree_10.json`: внешний config-tree и merge.
- `skill_eval_cases_config_tree_appname_10.json`: приоритеты project config vs external config + app-specific файлы.
- `skill_eval_cases_external_10.json`: профили (`active_profiles`) + внешние конфиги.
- `skill_eval_cases_extra_10.json`: runtime overrides (`runtime_properties`) как высокий приоритет.
- `skill_eval_cases_profile_groups_10.json`: группы профилей (`spring.profiles.group`).

## 8. Минимальный набор, если нужно "облегчить" артефакты

Если когда-то понадобится урезать объем без потери управляемости:

- Оставить обязательно:
  - `meta.json`
  - `report.md`
  - `cases/*/assessment.json`
  - `cases/*/stderr.log`
  - `cases/*/events.jsonl`

- Условно опционально:
  - `.summary_cases.jsonl` (только техническая промежуточка)
  - `.run_dir_path.txt`
  - `cases/*/commands.log` (если всегда есть надежный парсинг из `events.jsonl`)

Сейчас структура скорее оптимизирована под дебаг и воспроизводимость, чем под минимальный размер.
