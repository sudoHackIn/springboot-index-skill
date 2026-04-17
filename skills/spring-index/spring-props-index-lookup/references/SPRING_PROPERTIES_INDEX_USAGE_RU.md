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

### Join по `full_name` (для узлов из `tree`)

```bash
jq -r --arg key "server.ssl.client-auth" '
  (first(.properties[] | select(.name == $key)) // first(.groups[] | select(.name == $key)))
  | {name, kind: (if has("default_value") then "property" else "group" end), type, description, default_value, deprecation, source_artifacts, source_types, origins}
' "$INDEX"
```

Для ветки (`server.ssl`) запись обычно в `groups`, для leaf (`server.ssl.client-auth`) — в `properties`.

### Обогатить поддерево `tree` метаданными

```bash
jq -r '
  INDEX(.properties[]; .name) as $props
  | INDEX(.groups[]; .name) as $groups
  | def enrich:
      . as $n
      | ($props[$n.full_name] // $groups[$n.full_name] // {}) as $m
      | $n + {
          kind: (if $props[$n.full_name] then "property" elif $groups[$n.full_name] then "group" else null end),
          type: ($m.type // null),
          description: ($m.description // null),
          default_value: ($m.default_value // null),
          deprecation: ($m.deprecation // null),
          children: ($n.children | map(enrich))
        };
  .tree[]
  | select(.full_name == "server")
  | enrich
' "$INDEX"
```

### Ключи, наблюдавшиеся в `src/main/resources/*`

```bash
jq -r '.properties[]
  | select(any(.examples[]?; ((.file // "") | startswith("src/main/resources/"))))
  | .name' "$INDEX" | sort -u
```
