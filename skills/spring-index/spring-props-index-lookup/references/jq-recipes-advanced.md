# Advanced jq Recipes

Рецепты для нестандартных задач поиска по индексу Spring properties. Базовые (exact, prefix, card, deprecated, observed, tail, regex) — в [../SKILL.md](../SKILL.md).

Базовая переменная:
```bash
INDEX=.qwen/spring-properties-index/spring_properties_index.json
```

## Deprecated-with-replacement

Только deprecated-ключи, у которых есть указанный `replacement` — удобно для миграционных скриптов.

```bash
jq -r '.properties[]
  | select(.deprecation != null and (.deprecation.replacement // "") != "")
  | {name, replacement: .deprecation.replacement, reason: .deprecation.reason}' "$INDEX"
```

Вывод (фрагмент):
```json
{ "name": "logging.file", "replacement": "logging.file.name", "reason": null }
{ "name": "logging.file.clean-history-on-start", "replacement": "logging.logback.rollingpolicy.clean-history-on-start", "reason": null }
```

## Поиск по части описания

Полезно, когда не помнишь имя ключа, но помнишь смысл.

```bash
jq '.properties[]
  | select((.description // "") | test("connection|pool"; "i"))
  | {name, description}' "$INDEX"
```

Вывод (фрагмент):
```json
{ "name": "spring.datasource.type", "description": "Fully qualified name of the DataSource implementation to use. By default, a connection pool implementation is auto-detected from the classpath." }
{ "name": "spring.task.execution.pool.allow-core-thread-timeout", "description": "Whether core threads are allowed to time out. ..." }
```

## Фильтр по source-артефакту

Какие ключи приходят из конкретной библиотеки.

```bash
jq -r '.properties[]
  | select(any(.source_artifacts[]; test("spring-boot-jdbc")))
  | .name' "$INDEX"
```

Вывод (фрагмент):
```
management.health.db.enabled
management.health.db.ignore-routing-data-sources
spring.datasource.continue-on-error
spring.datasource.data
...
```

## Ключи, наблюдавшиеся в `src/main/resources/*`

Срез observed-usage только по проектным конфигам (без `.eval/` и внешних roots).

```bash
jq -r '.properties[]
  | select(any(.examples[]?; ((.file // "") | startswith("src/main/resources/"))))
  | .name' "$INDEX" | sort -u
```

Вывод — один ключ на строку.

## Листья конкретной ветки

Версия базового prefix-поиска: показать только ключи-листья под веткой.

```bash
jq -r '.properties[]
  | select(.name | startswith("spring.jpa."))
  | .name' "$INDEX"
```

Отличие от базового рецепта: применяется уже после выбора ветки — остальные префиксы отсечены.

## Группы по префиксу

`groups[]` — это не листья, а ветки с метаданными (type, source).

```bash
jq '.groups[] | select(.name | startswith("spring.datasource"))' "$INDEX"
```

Вывод (фрагмент):
```json
{
  "name": "spring.datasource",
  "type": "org.springframework.boot.jdbc.autoconfigure.DataSourceProperties",
  "description": null,
  "source_types": ["org.springframework.boot.jdbc.autoconfigure.DataSourceProperties"],
  "source_artifacts": ["org.springframework.boot:spring-boot-jdbc:4.0.3"],
  "origins": ["META-INF/spring-configuration-metadata.json"]
}
```

## Join для узла дерева (property vs group)

Когда ключ взят из `tree[].full_name` — непонятно, это лист или ветка. Делаем join с `properties` и `groups`.

```bash
jq --arg key "server.ssl.client-auth" '
  (first(.properties[] | select(.name == $key)) // first(.groups[] | select(.name == $key)))
  | {name, kind: (if has("default_value") then "property" else "group" end), type, description, default_value, deprecation, source_artifacts}
' "$INDEX"
```

Вывод:
```json
{
  "name": "server.ssl.client-auth",
  "kind": "property",
  "type": "org.springframework.boot.web.server.Ssl$ClientAuth",
  "description": "Client authentication mode. Requires a trust store."
}
```

Для ветки (`server.ssl`) запись обычно в `groups[]`, для leaf — в `properties[]`.

## Обогатить поддерево `tree` метаданными

Берем узел `tree[]` и рекурсивно добавляем поля из `properties`/`groups` для каждого уровня.

```bash
jq '
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

Вывод (фрагмент): структура `tree` с добавленными `kind`/`type`/`description`/`default_value`/`deprecation` на каждом узле.

## Топ веток первого уровня по количеству листьев

Полезно для быстрого обзора «где самый толстый namespace».

```bash
jq -r '.prefix_index[]
  | select(.prefix | test("^[^.]+$"))
  | {prefix, leaf_count}
  | @json' "$INDEX"
```

Вывод (фрагмент):
```json
{"prefix":"acme","leaf_count":0}
{"prefix":"debug","leaf_count":1}
{"prefix":"info","leaf_count":1}
{"prefix":"management","leaf_count":...}
{"prefix":"spring","leaf_count":...}
```
Для сортировки по убыванию добавь `| jq -s 'sort_by(-.leaf_count)'`.
