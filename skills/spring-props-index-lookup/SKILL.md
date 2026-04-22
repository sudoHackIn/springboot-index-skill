---
name: spring-props-index-lookup
description: Используй этот скилл для поиска Spring/библиотечных properties — ключей, их типов, значений по умолчанию, описаний, deprecated-замен и наблюдаемого использования в `application*.yml/properties`. Поддерживает точный матч, префиксный и регулярный поиск, фильтрацию по артефакту/описанию, обход дерева ключей. Индекс в `.qwen/spring-properties-index/` подхватывается или пересобирается автоматически.
---

# Поиск По Индексу Spring Properties

## Skill Version
- `skill_version: 0.4.0`

## Назначение
Этот скилл дает единый режим работы с индексом пропертей:
1. Проверить, есть ли индекс в корне проекта.
2. При необходимости пересобрать индекс.
3. Найти нужные ключи и структуру дерева через `jq`.

Оптимизация:
- сначала проверка артефактов и только потом поиск;
- короткие, детерминированные шаги;
- сначала точный матч, потом префиксный поиск.

## Где Ожидаются Файлы
В директории `.qwen/spring-properties-index/`:
- `spring_properties_index.json` — основной индекс.
- `spring_properties_index.schema.json` — JSON Schema индекса.
- `cache/resolved-artifacts.json` — resolved jar-артефакты Gradle.
- `cache/state.json` — состояние fingerprint.

## Инициализация (раз на сессию)

Выполняется один раз в начале работы, не перед каждым запросом.

```bash
INDEX=.qwen/spring-properties-index/spring_properties_index.json
test -f "$INDEX" || ./skills/spring-props-index-lookup/scripts/rebuild-props-index.sh
```

Принудительная пересборка (если подозрение на устаревший индекс):
```bash
./skills/spring-props-index-lookup/scripts/rebuild-props-index.sh --force
```

Отдельная `{generated_at, stats}`-проверка не нужна — `generated_at` уже приходит в one-shot рецептах ниже.

## Поля ключа

Объект `properties[]` — единственный источник истины для leaf-ключей. Все поля возвращаются рецептом 1 одной командой:

| Поле | Что содержит |
|---|---|
| `.name` | Полное имя ключа (`spring.datasource.url`) |
| `.type` | Java-тип значения (`java.lang.String`, `java.time.Duration`, …) |
| `.description` | Человеческое описание из `spring-configuration-metadata.json` |
| `.default_value` | Значение по умолчанию (`null`, если не задано) |
| `.deprecation` | `null` или `{level, replacement, since, reason}` |
| `.source_artifacts[]` | Артефакты, из которых пришёл ключ (`spring-boot-jdbc:4.0.3`) |
| `.source_types[]` | `@ConfigurationProperties`-классы, объявляющие ключ |
| `.origins[]` | Откуда ключ попал в индекс (`META-INF/spring-configuration-metadata.json`, `observed`) |
| `.examples[]` | Observed usage: `{file, line, raw}` из `application*.yml/properties` |

## One-Shot Рецепт: всё про ключ X

Один `jq` — сразу вся структура, которую требует «Формат ответа агенту» (`generated_at`, `matches_count`, `matches`, `details`). Используй как дефолт.

```bash
jq --arg name "spring.datasource.url" '{
  generated_at,
  query: {exact_name: $name},
  matches_count: ([.properties[] | select(.name == $name)] | length),
  matches:       [.properties[] | select(.name == $name) | .name],
  details:       [.properties[] | select(.name == $name)]
}' "$INDEX"
```

Полный вывод:
```json
{
  "generated_at": "2026-04-17T...",
  "query": { "exact_name": "spring.datasource.url" },
  "matches_count": 1,
  "matches": ["spring.datasource.url"],
  "details": [
    {
      "name": "spring.datasource.url",
      "type": "java.lang.String",
      "description": "JDBC URL of the database.",
      "default_value": null,
      "deprecation": null,
      "source_types": ["org.springframework.boot.jdbc.autoconfigure.DataSourceProperties"],
      "source_artifacts": ["org.springframework.boot:spring-boot-jdbc:4.0.3"],
      "origins": ["META-INF/spring-configuration-metadata.json", "observed"],
      "examples": [
        { "file": "src/main/resources/application-mysql.properties", "line": 3, "raw": "spring.datasource.url=${MYSQL_URL:jdbc:mysql://localhost/petclinic}" }
      ]
    }
  ]
}
```

Если `matches_count == 0` — ключа нет в `properties[]`. Это либо ветка (ищи в `groups[]`, см. [advanced/groups-by-prefix](references/jq-recipes-advanced.md#группы-по-префиксу)), либо опечатка (проверь рецептом 2 по префиксу).

## One-Shot Рецепт: ключ + его ветка

Один `jq` вместо двух — сразу карточка ключа и список соседей по ветке:

```bash
jq --arg key "server.servlet.session.timeout" --arg prefix "server.servlet.session." '{
  generated_at,
  key:      (.properties[] | select(.name == $key)),
  siblings: [.properties[] | select(.name | startswith($prefix)) | .name]
}' "$INDEX"
```

## One-Shot Рецепт: поиск списком (prefix / regex / artifact / …)

Любой массовый поиск (рецепты 2, 3, 5, 7, 8 ниже и advanced-фильтры) заворачивается в ту же форму `{generated_at, query, matches_count, matches}` — чтобы не парсить индекс повторно ради `length`:

```bash
# пример для prefix — аналогично для regex, endswith, description, artifact
jq --arg prefix "spring.datasource." '{
  generated_at,
  query: {name_prefix: $prefix},
  matches_count: ([.properties[] | select(.name | startswith($prefix))] | length),
  matches:       [.properties[] | select(.name | startswith($prefix)) | .name]
}' "$INDEX"
```

## Базовые jq-Рецепты (сырой поиск)

Ниже — «голые» селекторы без обёртки в `{generated_at, matches_count, ...}`. Используй, когда нужен быстрый ad-hoc просмотр. Для ответа агенту предпочитай one-shot рецепты выше.

> Продвинутые рецепты (join с `tree`, обогащение поддерева, фильтры по артефакту/описанию/`src/main`, топ веток) — в [references/jq-recipes-advanced.md](references/jq-recipes-advanced.md).

### 1. Точный матч ключа (полный объект)
```bash
jq '.properties[] | select(.name == "spring.datasource.url")' "$INDEX"
```
Полный вывод полей — см. one-shot рецепт выше. Для ответа агенту бери one-shot.

### 2. Ключи по префиксу
```bash
jq -r '.properties[] | select(.name | startswith("spring.datasource.")) | .name' "$INDEX"
```
Вывод (фрагмент):
```
spring.datasource.continue-on-error
spring.datasource.data
spring.datasource.data-password
spring.datasource.dbcp2.abandoned-usage-tracking
...
```

### 3. Первый уровень после префикса
```bash
jq -r '.prefix_index[] | select(.prefix == "spring") | .children[]' "$INDEX"
```
Вывод (фрагмент):
```
aop
application
autoconfigure
cache
data
datasource
...
```
Для глубже — поменяй `.prefix` (`"spring.datasource"` → дети второго уровня).

### 4. Проекция полей (компактный ответ)

Когда в ответе агенту нужна часть полей, а не весь объект — проецируем:
```bash
jq '.properties[]
  | select(.name == "spring.datasource.url")
  | {name, type, description, default_value, source_artifacts}' "$INDEX"
```
Вывод:
```json
{
  "name": "spring.datasource.url",
  "type": "java.lang.String",
  "description": "JDBC URL of the database.",
  "default_value": null,
  "source_artifacts": ["org.springframework.boot:spring-boot-jdbc:4.0.3"]
}
```
Важно: сам индекс уже полный (рецепт 1), эта проекция только УРЕЗАЕТ вывод. Поля `examples`, `origins`, `deprecation` в этом варианте скрыты — добавляй в `{...}` по необходимости.

### 5. Deprecated-ключи
```bash
jq -r '.properties[] | select(.deprecation != null) | {name, deprecation}' "$INDEX"
```
Вывод (фрагмент):
```json
{
  "name": "logging.file",
  "deprecation": {
    "level": "error",
    "replacement": "logging.file.name",
    "since": "2.2.0",
    "reason": null
  }
}
```
Для варианта с гарантированным `replacement` см. [advanced/deprecated-with-replacement](references/jq-recipes-advanced.md#deprecated-with-replacement).

### 6. Где ключ наблюдался в `application*.yml/properties`
```bash
jq '.properties[]
  | select(.name == "spring.datasource.url")
  | {name, examples}' "$INDEX"
```
Вывод (фрагмент):
```json
{
  "name": "spring.datasource.url",
  "examples": [
    { "file": "src/main/resources/application-mysql.properties", "line": 3, "raw": "spring.datasource.url=${MYSQL_URL:jdbc:mysql://localhost/petclinic}" },
    { "file": "src/main/resources/application-postgres.properties", "line": 3, "raw": "spring.datasource.url=${POSTGRES_URL:jdbc:postgresql://localhost/petclinic}" }
  ]
}
```
`examples[]` — это observed usage, не гарантия поддерживаемости.

### 7. Поиск по хвосту (endswith)
```bash
jq -r '.properties[] | select(.name | endswith(".enabled")) | .name' "$INDEX"
```
Вывод (фрагмент):
```
acme.datasource.override.enabled
acme.kafka.enabled
acme.mail.enabled
acme.redis.enabled
app.metrics.enabled
...
```

### 8. Регулярка по имени
```bash
jq -r '.properties[] | select(.name | test("spring\\.(datasource|jpa)\\."; "i")) | .name' "$INDEX"
```
Вывод (фрагмент):
```
spring.datasource.continue-on-error
spring.datasource.data
spring.datasource.dbcp2.abandoned-usage-tracking
spring.jpa.database
spring.jpa.hibernate.ddl-auto
...
```

## Формат Ответа Агенту

Возвращай минимум:
1. `index_status` (`ok` / `rebuilt`) — берётся из инициализации.
2. `generated_at`, `query`, `matches_count`, `matches` — приходят готовыми из one-shot рецептов.
3. `details` — добавлять, если явно нужны type/default/deprecation/sources/examples (one-shot «всё про ключ X» уже включает).

Идеал: **один `jq`-вызов на запрос** → готовый JSON → обёрнуть `index_status` и вернуть.

## Ограничения
- Источник истины для leaf-ключей: `properties[]`.
- Источник истины для веток/префиксов: `groups[]` и `tree[]`.
- Для запросов по `tree.full_name` всегда делай join с `properties/groups` (см. advanced).
- `examples` — это observed usage, а не гарантия поддерживаемости.
- Если ключ не найден, сначала проверь более короткий префикс и deprecated/replacement.

## References
- Продвинутые jq-рецепты (join, enrich, фильтры): [references/jq-recipes-advanced.md](references/jq-recipes-advanced.md)
