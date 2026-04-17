# Usage Examples

## Example 1: DataSource diagnosis

```bash
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?" \
  --bean-regex "dataSource|datasource" \
  --return-type-regex "DataSource" \
  --property-name "spring.datasource.enabled" \
  --config-dir ./src/main/resources
```

## Example 2: Redis diagnosis with active profile

```bash
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Почему redisClient не поднялся?" \
  --bean-regex "redisClient" \
  --property-name "acme.redis.enabled" \
  --config-dir ./src/main/resources \
  --active-profile prod
```

## Example 3: Fallback to ConditionEvaluationReport

```bash
./gradlew bootRun --args='--debug' 2>&1 | tee /tmp/boot-condition-report.log
rg -n "DataSourceAutoConfiguration|did not match|matched" /tmp/boot-condition-report.log
```

Use this when index output is `insufficient_data` or contradicts runtime behavior.
