---
name: spring-autoconfig-index-lookup
description: "Используй этот скилл, когда нужно диагностировать Spring Boot автоконфигурацию по индексу и runtime-конфигам: определить, ожидается ли бин, почему не сработала автоконфигурация, какие условия блокируют создание, и какие property влияют на итог."
---

# Spring AutoConfig Diagnosis

## Skill Version
- `skill_version: 0.4.2`

## Happy Path (90% случаев)

Один helper-вызов → один JSON → один ответ. Не превьюй `jq`, не читай `application*.yml`, не запускай helper дважды.

```bash
node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "<вопрос пользователя>" \
  --bean-regex "<имя бина или regex>" \
  --property-name "<spring.xxx.enabled>" \
  --project-config-dir ./src/main/resources \
  --config-dir <внешний config-tree, если есть> \
  --active-profile <profile, если задан> \
  --runtime-prop key=value \
  --index <путь к индексу, если не дефолтный>
# флаг именно --runtime-prop (НЕ --runtime-property); передавай путь директории,
# не листай её заранее через find/rg/ls — helper сам обходит рекурсивно.
```

Extract из компактного JSON — см. таблицу маппинга ниже (разделены discovery vs evaluation вопросы).

Дополнительный `--debug` нужен **только если** нужный verdict = `uncertain` / `insufficient_data` или ты не видишь нужного кандидата.

## Маппинг: eval-поля ← helper-вывод

Сначала определи **тип вопроса**:

- **Discovery** («из какой автоконфигурации ждать X?», «какой бин даёт X?», «откуда приходит X?») — спрашивает про источник, **не** про runtime-эффект.
- **Evaluation** («ожидается ли X?», «поднимется ли X?», «почему X не поднялся?», «будет ли X создан?») — спрашивает, создастся ли бин в текущем runtime.

| Требуемое поле        | Discovery                                          | Evaluation                                                                             |
|-----------------------|----------------------------------------------------|----------------------------------------------------------------------------------------|
| `verdict`             | `discovery_verdict`                                | `verdict` (или `focused_verdict`, если есть фокус)                                     |
| `matched_autoconfigs` | `discovery_candidates[].fqcn`                      | `focus.focused_candidates[].fqcn` ∪ `winner_summary[].winner_autoconfiguration`        |
| `reasoning_summary`   | «ждать из <fqcn>» + `discovery_candidates[].status`| `focus.focused_candidates[].on_property_checks` + `active_profiles` + `runtime_source` |
| `commands`            | логи своих вызовов                                 | логи своих вызовов                                                                     |

Ключевое: `discovery_verdict = likely_yes` как только нашёлся хоть один matched candidate (даже `blocked`), потому что discovery-вопрос про наличие источника, а не про текущее состояние гейтов.

Если focus пустой — смотри `winner_summary` и `trace`.

## Anti-Patterns (не делай так)

- ❌ `sed`/`cat` по `application*.yml|properties` — helper уже парсит их по `--project-config-dir` / `--config-dir`.
- ❌ `find`/`rg --files`/`ls -R`/`ls -la` по `config-dir` / `project-config-dir` — helper обходит директории рекурсивно и сам находит `application*`, `<app-name>*`. Передавай путь, не листай.
- ❌ `sed`/`wc -c`/`jq keys` по `*.index.json` — структура описана в [references/reference.md](references/reference.md). Helper выдаёт всё нужное в компактном JSON.
- ❌ `jq` превью кандидатов **перед** helper — helper возвращает тех же кандидатов с условиями и property-гейтами.
- ❌ Запуск helper дважды (с `--debug` и без) — начни без `--debug`; добавляй `--debug` только при `uncertain`.
- ❌ `test -f <index>`, `node --version`, `jq --version` — мусорные пробы. Если индекса нет, helper вернёт `{verdict: "error", error.kind: "IndexNotFound"}` — тогда запусти rebuild.
- ❌ Флаг `--runtime-property` — такого нет. Правильно: `--runtime-prop key=value`.
- ❌ Читать SKILL.md повторно в рамках одного кейса.
- ❌ Делать вывод по `trace`/`runtime_source` без запуска helper — угадывание активного профиля без парсера ведет к ошибкам.

## Workflow (3 шага)

1. **Init.** Не проверяй индекс заранее — просто запусти helper. Если индекса нет, helper вернёт `verdict: "error"` с `error.kind: "IndexNotFound"` — тогда пересобери:
   ```bash
   ./skills/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh
   # --force — принудительно; RUNTIME_CONFIG_ROOTS="$EXTERNAL_CONFIG_ROOTS" — учесть production config-tree в fingerprint.
   ```

2. **Diagnose.** Один вызов helper (см. Happy Path). Шаблоны и флаги — [references/cli.md](references/cli.md).

3. **Verify (опционально).** Только если compact verdict неоднозначный:
   - перезапусти с `--debug` и сверься с `candidates[].class_conditions`/`bean_methods[].conditions`;
   - либо ручной `jq` по индексу (см. Fallback);
   - либо `ConditionEvaluationReport` как runtime-source-of-truth:
     ```bash
     ./gradlew bootRun --args='--debug' 2>&1 | tee /tmp/boot-condition-report.log
     # Maven: ./mvnw spring-boot:run -Dspring-boot.run.arguments=--debug
     ```

Приоритет источников при расхождениях: `ConditionEvaluationReport` > индекс > эвристика. Расхождения показывай явно: «индекс ожидал X, runtime показал Y».

## Prerequisites

Node.js, `jq`, собранный индекс, установленный tree-sitter-анализатор:
```bash
test -d skills/spring-autoconfig-index-lookup/analyzer/node_modules \
  || (cd skills/spring-autoconfig-index-lookup/analyzer && npm install)
```

## Output Example

Компактный режим (без `--debug`):

```json
{
  "question": "Ожидается ли DataSource?",
  "query": { "bean_regex": "dataSource", "return_type_regex": null, "inferred": false, "inference_notes": [] },
  "verdict": "likely_yes",
  "overall_verdict": "likely_yes",
  "focused_verdict": "likely_yes",
  "discovery_verdict": "likely_yes",
  "discovery_candidates": [
    { "fqcn": "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration", "status": "pass" },
    { "fqcn": "com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration", "status": "blocked" }
  ],
  "focus": {
    "best_score": 2,
    "focused_candidates": [
      { "fqcn": "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration", "status": "pass", "on_property_checks": ["matched spring.datasource.enabled"] },
      { "fqcn": "com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration", "status": "blocked", "on_property_checks": ["acme.datasource.override.enabled missing and matchIfMissing=false"] }
    ]
  },
  "winner_summary": [
    { "bean_name": "dataSource", "winner_autoconfiguration": "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration" }
  ],
  "trace": ["Loaded index with 6 autoconfigurations.", "Runtime properties available: 0.", "Discovery found 2 candidate autoconfigurations."],
  "runtime_source": "project_roots=[./src/main/resources] []",
  "active_profiles": []
}
```

Error-режим (скрипт всегда возвращает валидный JSON; exit code `1`):

```json
{ "verdict": "error", "error": { "kind": "MissingSelector", "message": "Provide --bean-regex and/or --return-type-regex or --question" } }
```

Поля подробно, включая `--debug`-режим — [references/diagnose-output-guide.ru.md](references/diagnose-output-guide.ru.md).

## Fallback (jq)

Использовать только когда helper не дал ответа (шаг 3). Не как превью перед helper.

```bash
INDEX=.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json

# Кандидаты по bean_name / return_type
jq -r '.autoconfigurations[]
  | .fqcn as $cfg
  | .bean_methods[]?
  | select((.bean_name // "" | test("dataSource"; "i"))
        or (.return_type // "" | test("DataSource"; "i")))
  | {autoconfig: $cfg, bean_name: .bean_name, return_type: .return_type}' "$INDEX"

# OnProperty-гейты на уровне класса
jq -r '.autoconfigurations[]
  | select(any(.class_conditions[]?; .kind == "OnProperty"))
  | {fqcn, class_conditions}' "$INDEX"
```

## References
- CLI-флаги, шаблоны, приоритет properties: [references/cli.md](references/cli.md)
- Гайд по полям вывода и диагностике: [references/diagnose-output-guide.ru.md](references/diagnose-output-guide.ru.md)
- Практические примеры: [references/examples.md](references/examples.md)
- Формат ручной диагностики по индексу: [references/reference.md](references/reference.md)
- Техдок по внутренней логике скрипта: [references/diagnose-autoconfig-architecture.ru.md](references/diagnose-autoconfig-architecture.ru.md)
- Анализатор tree-sitter: [analyzer/README.md](analyzer/README.md)
