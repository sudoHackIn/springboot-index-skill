---
name: spring-autoconfig-index-lookup
description: "Используй этот скилл, когда нужно диагностировать Spring Boot автоконфигурацию по индексу и runtime-конфигам: определить, ожидается ли бин, почему не сработала автоконфигурация, какие условия блокируют создание, и какие property влияют на итог."
---

# Spring AutoConfig Diagnosis

## Skill Version
- `skill_version: 0.3.5`

## Prerequisites

1. **Node.js** (для запуска `.mjs`-скриптов).
2. **Анализатор tree-sitter** — устанавливается один раз на машину:
   ```bash
   cd skills/spring-index/spring-autoconfig-index-lookup/analyzer && npm install
   ```
   Без этого `rebuild-autoconfig-index.sh` упадёт на разборе Java-аннотаций. Быстрая проверка:
   ```bash
   test -d skills/spring-index/spring-autoconfig-index-lookup/analyzer/node_modules \
     && echo "analyzer deps: present" || echo "analyzer deps: missing"
   ```
3. **`jq`** — для ручной верификации индекса.
4. **Индекс** в `.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json` (собирается скриптом, см. шаг 3 workflow).

## Helper CLI

Полный справочник по флагам, шаблоны запуска, приоритет properties — в [references/cli.md](references/cli.md).

Типовой вызов:
```bash
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?" \
  --bean-regex "dataSource|datasource" \
  --property-name "spring.datasource.enabled" \
  --project-config-dir ./src/main/resources \
  --config-dir ./config
```

## Output Example

Компактный режим (без `--debug`):

```json
{
  "question": "Ожидается ли DataSource?",
  "query": {
    "bean_regex": "dataSource",
    "return_type_regex": null,
    "inferred": false,
    "inference_notes": []
  },
  "verdict": "likely_yes",
  "overall_verdict": "likely_yes",
  "focused_verdict": "likely_yes",
  "focus": {
    "best_score": 2,
    "focused_candidates": [
      {
        "fqcn": "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration",
        "status": "pass",
        "on_property_checks": ["matched spring.datasource.enabled"]
      },
      {
        "fqcn": "com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration",
        "status": "blocked",
        "on_property_checks": ["acme.datasource.override.enabled missing and matchIfMissing=false"]
      }
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

Error-режим (скрипт всегда возвращает валидный JSON; exit code остаётся `1` при ошибке):

```json
{
  "verdict": "error",
  "error": {
    "kind": "MissingSelector",
    "message": "Provide --bean-regex and/or --return-type-regex or --question"
  }
}
```

Поля подробно, включая `--debug`-режим — см. [references/diagnose-output-guide.ru.md](references/diagnose-output-guide.ru.md).

## Runtime Workflow

0. Спросить у пользователя, где лежат внешние config-tree, и сохранить в переменную:
```bash
# пример: пользователь дал два внешних root
EXTERNAL_CONFIG_ROOTS="./config,./config/common/datasource"
# если внешних конфигов нет:
EXTERNAL_CONFIG_ROOTS=""
```

1. Проверить наличие индекса:
```bash
test -f .qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json && echo "index: ok" || echo "index: missing"
```

2. Убедиться, что установлен анализатор (см. Prerequisites).

3. Если индекса нет или он устарел, пересобрать:
```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh
```

Скрипт сам считает fingerprint и пересобирает только при изменениях. Fingerprint учитывает:
- `resolved-artifacts.json` (resolved зависимости Gradle, включая транзитивные),
- `build.gradle*`, `settings.gradle*`, `gradle.properties`, `libs.versions.toml`, `pom.xml`,
- ресурсы автоконфига (`AutoConfiguration.imports`, `spring-autoconfigure-metadata.properties`, `spring-configuration-metadata.json`),
- версию/базовый индекс/скрипты анализатора.

Принудительная пересборка:
```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh --force
```

Чтобы изменения production config-tree тоже влияли на stale-check индекса:
```bash
RUNTIME_CONFIG_ROOTS="$EXTERNAL_CONFIG_ROOTS" \
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh
```

4. Запустить helper-диагностику (типовой вызов см. выше в разделе Helper CLI; расширенные шаблоны — в [references/cli.md](references/cli.md)).

5. Проверить и дополнить вывод helper-а вручную по индексу (`jq`) — см. раздел Fallback ниже.

6. Если уверенность низкая или индекс противоречит наблюдаемому поведению, запустить `ConditionEvaluationReport`:
```bash
# Gradle
./gradlew bootRun --args='--debug' 2>&1 | tee /tmp/boot-condition-report.log
# Maven
./mvnw spring-boot:run -Dspring-boot.run.arguments=--debug 2>&1 | tee /tmp/boot-condition-report.log
```

7. При объединении источников приоритет такой:
- `ConditionEvaluationReport` (факт runtime) > индекс (статический прогноз) > эвристики.
- Если есть расхождения, явно показывать их в ответе: "индекс ожидал X, runtime показал Y".

## Fallback (jq)

`jq` — обязательный fallback и способ ручной верификации вывода helper-скрипта.

```bash
INDEX=.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json

# Поиск кандидатов по имени бина/типу
jq -r '
  .autoconfigurations[]
  | .fqcn as $cfg
  | .bean_methods[]?
  | select((.bean_name // "" | test("datasource|dataSource"; "i"))
        or (.return_type // "" | test("DataSource"; "i")))
  | {autoconfig: $cfg, bean_name: .bean_name, return_type: .return_type}
' "$INDEX"

# Проверка property-гейтов на уровне class_conditions
jq -r '
  .autoconfigurations[]
  | select(any(.class_conditions[]?; .kind == "OnProperty"))
  | {fqcn, class_conditions}
' "$INDEX"
```

## References
- CLI-флаги, шаблоны, приоритет properties: [references/cli.md](references/cli.md)
- Гайд по полям вывода и диагностике: [references/diagnose-output-guide.ru.md](references/diagnose-output-guide.ru.md)
- Практические примеры: [references/examples.md](references/examples.md)
- Формат ручной диагностики по индексу: [references/reference.md](references/reference.md)
- Техдок по внутренней логике скрипта: [references/diagnose-autoconfig-architecture.ru.md](references/diagnose-autoconfig-architecture.ru.md)
- Анализатор tree-sitter: [analyzer/README.md](analyzer/README.md)
