# Индекс Spring Properties: Быстрый Старт

## Пересборка индекса

```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-props-index.sh
```

Принудительно (игнорировать fingerprint):

```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-props-index.sh --force
```

## Что создается

- `.qwen/spring-properties-index/spring_properties_index.json` — основной индекс.
- `.qwen/spring-properties-index/spring_properties_index.schema.json` — JSON Schema индекса.
- `.qwen/spring-properties-index/cache/resolved-artifacts.json` — resolved jar-артефакты Gradle.
- `.qwen/spring-properties-index/cache/state.json` — состояние fingerprint.

```bash
INDEX=.qwen/spring-properties-index/spring_properties_index.json
```

## Поиск

### Найти точный ключ

```bash
jq -r '.properties[] | select(.name == "spring.datasource.url")' "$INDEX"
```

### Найти все ключи по префиксу

```bash
jq -r '.properties[] | select(.name | startswith("spring.datasource.")) | .name' "$INDEX"
```

### Первый уровень после `spring`

```bash
jq -r '.prefix_index[] | select(.prefix == "spring") | .children[]' "$INDEX"
```

### Второй уровень после `spring.datasource`

```bash
jq -r '.prefix_index[] | select(.prefix == "spring.datasource") | .children[]' "$INDEX"
```

### Посмотреть источники конкретного ключа

```bash
jq -r '.properties[]
  | select(.name == "spring.datasource.url")
  | {name, type, description, default_value, deprecation, source_artifacts, source_types, examples}' "$INDEX"
```

### Ключи, наблюдавшиеся в `src/main/resources/*`

```bash
jq -r '.properties[]
  | select(any(.examples[]?; ((.file // "") | startswith("src/main/resources/"))))
  | .name' "$INDEX" | sort -u
```
