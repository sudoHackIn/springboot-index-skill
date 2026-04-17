---
name: spring-autoconfig-index-lookup
description: "Используй этот скилл, когда нужно диагностировать Spring Boot автоконфигурацию по индексу и runtime-конфигам: определить, ожидается ли бин, почему не сработала автоконфигурация, какие условия блокируют создание, и какие property влияют на итог."
---

# Spring AutoConfig Diagnosis

## Skill Version
- `skill_version: 0.3.3`

## Helper CLI Quick Guide

Script:
```bash
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs [flags]
```

Обязателен хотя бы один селектор:
- `--bean-regex <regex>`: искать кандидаты по имени бина (`bean_methods[].bean_name`).
- `--return-type-regex <regex>`: искать кандидаты по return type (`bean_methods[].return_type`).
- `--question <text>`: если regex не заданы, скрипт попытается вывести bean-pattern из текста вопроса.

Необязательные параметры:
- `--property-name <name>`: property-фокус для трассировки и фокусного verdict (например, `acme.datasource.override.enabled`).
- `--config-dir <dir>`: корень config-tree; скрипт рекурсивно ищет `*application*.properties|yaml|yml` (включая `my-application.yaml`) и мерджит активные документы.
- `--config-tree-dir <dir>`: алиас `--config-dir`, можно повторять для нескольких независимых roots.
- `--active-profile <profile>`: принудительно активный профиль (можно повторять флаг).
- `--runtime-prop <k=v>`: инлайн override runtime-properties (можно повторять флаг).
- `--index <path>`: путь к JSON-индексу (по умолчанию `.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json`).
- `--debug`: включить подробный JSON-вывод (кандидаты/условия/ordering) для отладки.

Режимы вывода:
- По умолчанию скрипт возвращает компактный JSON (удобно для обычной диагностики).
- Для детального разбора причин (`why not`, конфликты, порядок) запускать с `--debug`.

Что писать в `--question`:
- Обычный пользовательский вопрос на естественном языке.
- Примеры:
  - `"Ожидается ли DataSource?"`
  - `"Почему redisClient может не создаться?"`
  - `"Из какой автоконфигурации придет transactionManager?"`
- `question` помогает фокусировать ответ и используется для inference, но для надежности лучше явно задавать `--bean-regex` и/или `--return-type-regex`.

Минимальные шаблоны:
```bash
# только question (эвристический inference)
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?"

# надежный режим (рекомендуется)
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?" \
  --bean-regex "dataSource|datasource" \
  --property-name "spring.datasource.enabled" \
  --config-dir ./src/main/resources

# несколько внешних config-tree roots
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?" \
  --bean-regex "dataSource|datasource" \
  --config-tree-dir ./config \
  --config-tree-dir ./config/common/datasource
```

## Runtime Workflow

1. Проверить наличие индекса:
```bash
test -f .qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json && echo "index: ok" || echo "index: missing"
```

2. Убедиться, что подпроект анализатора установлен (один раз на машину):
```bash
cd skills/spring-index/spring-autoconfig-index-lookup/analyzer && npm install
```

3. Если индекса нет или он устарел, пересобрать:
```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh
```

Как понять, что индекс устарел:
- Самый простой и правильный способ: всегда запускать команду выше.  
  Скрипт сам считает fingerprint и:
  - если все актуально, пишет `fingerprint unchanged; index is up-to-date` и завершает без пересборки;
  - если есть изменения, пересобирает индекс.
- Fingerprint учитывает:
  - `resolved-artifacts.json` (resolved зависимости Gradle, включая транзитивные),
  - `build.gradle*`, `settings.gradle*`, `gradle.properties`, `libs.versions.toml`, `pom.xml`,
  - ресурсы автоконфига (`AutoConfiguration.imports`, `spring-autoconfigure-metadata.properties`, `spring-configuration-metadata.json`),
  - версию/базовый индекс/скрипты анализатора.
- Принудительная пересборка:
```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh --force
```

Если хотите, чтобы изменения production config-tree тоже влияли на stale-check индекса:
```bash
RUNTIME_CONFIG_ROOTS=\"./config,./config/common/datasource\" \
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh
```

4. Запустить helper-диагностику (для сбора фактов: кандидаты, property-гейты, профильный merge, порядок):
```bash
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?" \
  --bean-regex "dataSource|datasource" \
  --property-name "spring.datasource.enabled" \
  --config-dir ./src/main/resources
```

5. Проверить и дополнить вывод helper-а вручную по индексу (`jq`):
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

6. Если уверенность низкая или индекс противоречит наблюдаемому поведению, запустить `ConditionEvaluationReport` и объединить факты:
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

Примеры:

```bash
INDEX=.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json
jq -r '.autoconfigurations[] | .fqcn as $cfg | .bean_methods[]? | select(.bean_name == "dataSource") | {autoconfig: $cfg, bean: .bean_name, return_type: .return_type}' "$INDEX"
```

```bash
INDEX=.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json
jq -r '.autoconfigurations[] | select(any(.class_conditions[]?; .kind == "OnProperty")) | {fqcn, class_conditions}' "$INDEX"
```

## References
- Практические примеры: [references/examples.md](references/examples.md)
- Формат ручной диагностики по индексу: [references/reference.md](references/reference.md)
- Гайд по полям вывода и диагностике: [references/diagnose-output-guide.ru.md](references/diagnose-output-guide.ru.md)
- Техдок по внутренней логике скрипта: [references/diagnose-autoconfig-architecture.ru.md](references/diagnose-autoconfig-architecture.ru.md)
- Анализатор tree-sitter: [analyzer/README.md](analyzer/README.md)
