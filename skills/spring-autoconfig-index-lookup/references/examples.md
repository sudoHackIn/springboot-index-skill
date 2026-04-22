# Usage Examples

## Example 0: Helper diagnosis (structured facts)

```bash
node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource в этом окружении?" \
  --bean-regex "dataSource|datasource" \
  --property-name "spring.datasource.enabled" \
  --project-config-dir ./src/main/resources \
  --config-dir ./config \
  --app-name "billing-service"
```

Для подробного вывода добавить `--debug`.

## Example 0.1: Question-only mode (heuristic inference)

```bash
node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли transaction manager?" \
  --index .qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json
```

## Example 0.2: External config tree (nested dirs + app-name files)

```bash
node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource в этом окружении?" \
  --bean-regex "dataSource" \
  --property-name "spring.datasource.enabled" \
  --project-config-dir ./src/main/resources \
  --app-name "billing-service" \
  --config-tree-dir ./config \
  --config-tree-dir ./config/common/datasource
```

## Example 0.3: Priority check (project < external < runtime-prop)

```bash
node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли mailSender?" \
  --bean-regex "mailSender" \
  --property-name "acme.mail.enabled" \
  --project-config-dir ./src/main/resources \
  --config-dir ./config \
  --runtime-prop acme.mail.enabled=true
```

## Example 1: DataSource discovery in index

```bash
INDEX=.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json
jq -r '
  .autoconfigurations[]
  | .fqcn as $cfg
  | .bean_methods[]?
  | select((.bean_name // "" | test("datasource|dataSource"; "i"))
        or (.return_type // "" | test("DataSource"; "i")))
  | {autoconfig: $cfg, bean_name: .bean_name, return_type: .return_type}
' "$INDEX"
```

## Example 2: Inspect OnProperty gates

```bash
INDEX=.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json
jq -r '
  .autoconfigurations[]
  | select(any(.class_conditions[]?; .kind == "OnProperty"))
  | {fqcn, class_conditions}
' "$INDEX"
```

## Example 3: Fallback to ConditionEvaluationReport

```bash
./gradlew bootRun --args='--debug' 2>&1 | tee /tmp/boot-condition-report.log
rg -n "DataSourceAutoConfiguration|did not match|matched" /tmp/boot-condition-report.log
```

Use this when index output is `insufficient_data` or contradicts runtime behavior.
