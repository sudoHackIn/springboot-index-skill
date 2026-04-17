---
name: spring-props-index-lookup
description: Используй этот скилл, когда нужно получить актуальный индекс Spring/библиотечных пропертей в `.qwen/spring-properties-index/`, при необходимости пересобрать его и быстро искать ключи/ветки/депрекации/источники через `jq`.
---

# Поиск По Индексу Spring Properties

## Назначение
Этот скилл дает единый режим работы с индексом пропертей:
1. Проверить, есть ли индекс в корне проекта.
2. При необходимости пересобрать индекс.
3. Найти нужные ключи и структуру дерева через `jq`.

Оптимизация под Qwen:
- сначала проверка артефактов и только потом поиск;
- короткие, детерминированные шаги;
- сначала точный матч, потом префиксный поиск.

## Где Ожидаются Файлы
В директории `.qwen/spring-properties-index/`:
- `.qwen/spring-properties-index/spring_properties_index.json`
- `.qwen/spring-properties-index/spring_properties_index.schema.json`
- `skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-props-index.sh`

## Обязательный Алгоритм

### 1) Проверка индекса
```bash
test -f .qwen/spring-properties-index/spring_properties_index.json && echo "index: ok" || echo "index: missing"
```

### 2) Если индекса нет или он устарел — пересобрать
```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-props-index.sh
```

Принудительно:
```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-props-index.sh --force
```

### 3) Проверка, что индекс валиден по структуре
```bash
jq -r '{generated_at, stats}' .qwen/spring-properties-index/spring_properties_index.json
```

## Базовые Переменные
```bash
INDEX=.qwen/spring-properties-index/spring_properties_index.json
```

## jq-Рецепты Поиска

### 1. Найти точный ключ
```bash
jq -r '.properties[] | select(.name == "spring.datasource.url")' "$INDEX"
```

### 2. Найти ключи по префиксу
```bash
jq -r '.properties[] | select(.name | startswith("spring.datasource.")) | .name' "$INDEX"
```

### 3. Первый уровень после `spring`
```bash
jq -r '.prefix_index[] | select(.prefix == "spring") | .children[]' "$INDEX"
```

### 4. Второй уровень после `spring.datasource`
```bash
jq -r '.prefix_index[] | select(.prefix == "spring.datasource") | .children[]' "$INDEX"
```

### 5. Карточка ключа: тип, default, deprecation, источники
```bash
jq -r '.properties[]
  | select(.name == "spring.datasource.url")
  | {name, type, description, default_value, deprecation, source_artifacts, source_types, origins}' "$INDEX"
```

### 6. Только deprecated ключи
```bash
jq -r '.properties[]
  | select(.deprecation != null)
  | {name, deprecation}' "$INDEX"
```

### 7. Deprecated с replacement
```bash
jq -r '.properties[]
  | select(.deprecation != null and (.deprecation.replacement // "") != "")
  | {name, replacement: .deprecation.replacement, reason: .deprecation.reason}' "$INDEX"
```

### 8. Найти ключи по части описания
```bash
jq -r '.properties[]
  | select((.description // "") | test("connection|datasource|pool"; "i"))
  | {name, description}' "$INDEX"
```

### 9. Найти ключи из конкретного артефакта
```bash
jq -r '.properties[]
  | select(any(.source_artifacts[]; test("spring-boot-autoconfigure")))
  | .name' "$INDEX"
```

### 10. Где ключ наблюдался в `application*.yml/properties`
```bash
jq -r '.properties[]
  | select(.name == "spring.datasource.url")
  | {name, examples}' "$INDEX"
```

### 10.1 Ключи, наблюдавшиеся в `src/main/resources/*`
```bash
jq -r '.properties[]
  | select(any(.examples[]?; ((.file // "") | startswith("src/main/resources/"))))
  | .name' "$INDEX" | sort -u
```

### 11. Листья конкретной ветки
```bash
jq -r '.properties[]
  | select(.name | startswith("spring.jpa."))
  | .name' "$INDEX"
```

### 12. Группы (`groups`) по префиксу
```bash
jq -r '.groups[] | select(.name | startswith("spring.datasource"))' "$INDEX"
```

### 13. Топ веток первого уровня по количеству листьев
```bash
jq -r '.prefix_index[]
  | select(.prefix | test("^[^.]+$"))
  | {prefix, leaf_count}
  | @json' "$INDEX"
```

### 14. Найти ключ, если известен только хвост (`.url`, `.enabled`)
```bash
jq -r '.properties[] | select(.name | endswith(".enabled")) | .name' "$INDEX"
```

### 15. Поиск по регулярке имени
```bash
jq -r '.properties[] | select(.name | test("spring\\.(datasource|jpa)\\."; "i")) | .name' "$INDEX"
```

## Формат Ответа Агенту
Возвращай минимум:
1. `index_status` (`ok` / `rebuilt`)
2. `generated_at`
3. `query`
4. `matches_count`
5. `matches` (краткий список ключей)
6. `details` (если запрошены: type/default/deprecation/sources/examples)

## Ограничения
- Источник истины по ключам: `properties[]` в индексе.
- `examples` — это observed usage, а не гарантия поддерживаемости.
- Если ключ не найден, сначала проверь более короткий префикс и deprecated/replacement.
