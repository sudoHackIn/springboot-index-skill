---
name: spring-autoconfig-index-lookup
description: "Используй этот скилл, когда нужно диагностировать Spring Boot автоконфигурацию по индексу и runtime-конфигам: определить, ожидается ли бин, почему не сработала автоконфигурация, какие условия блокируют создание, и какие property влияют на итог."
---

# Spring AutoConfig Diagnosis

## Skill Version
- `skill_version: 0.3.2`

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

4. Запустить runtime-диагностику:
```bash
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?" \
  --bean-regex "dataSource|datasource" \
  --return-type-regex "DataSource" \
  --property-name "spring.datasource.enabled" \
  --config-dir ./src/main/resources
```

5. Сформулировать ответ по полям JSON:
- `verdict`
- `candidate_autoconfigurations`
- `candidate_beans`
- `property_gate_status`
- `trace`

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

Использовать `jq` только как резервный путь для ручного дебага, если runtime script недоступен или нужен быстрый точечный просмотр.

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
- Формат и семантика runtime-диагностики: [references/reference.md](references/reference.md)
- Анализатор tree-sitter: [analyzer/README.md](analyzer/README.md)
