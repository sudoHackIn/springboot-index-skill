# diagnose-autoconfig.mjs — CLI Reference

Полный справочник по флагам и шаблонам запуска.

## Запуск

```bash
node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs [flags]
```

Обязателен хотя бы один селектор (`--bean-regex` / `--return-type-regex` / `--question`).

## Флаги

### Селекторы кандидатов (минимум один обязателен)
- `--bean-regex <regex>` — поиск по имени бина (`bean_methods[].bean_name`).
- `--return-type-regex <regex>` — поиск по return type (`bean_methods[].return_type`).
- `--question <text>` — если regex не заданы, скрипт попытается вывести bean-pattern из текста вопроса. Работает как эвристика; для надёжности лучше явно задавать regex.

### Runtime-контекст
- `--project-config-dir <dir>` — root конфигов основного проекта (низкий приоритет, repeatable). Если не задан, используется `./src/main/resources`.
- `--config-dir <dir>` — root внешнего config-tree (более высокий приоритет, repeatable).
- `--config-tree-dir <dir>` — алиас `--config-dir`, можно повторять для нескольких независимых roots.
- `--app-name <name>` — имя приложения для app-specific файлов (`<app-name>.yaml`, `<app-name>-prod.yaml`). Если не задано, пытается взять из `spring.application.name` в project config.
- `--active-profile <profile>` — принудительно активный профиль (можно повторять).
- `--runtime-prop <k=v>` — инлайн override runtime-properties (можно повторять).

### Прочее
- `--property-name <name>` — property-фокус для трассировки и фокусного verdict (например, `acme.datasource.override.enabled`).
- `--index <path>` — путь к JSON-индексу (по умолчанию `.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json`).
- `--debug` — подробный JSON-вывод (кандидаты, условия, ordering) для отладки.
- `-h`, `--help` — справка.

## Приоритет источников properties

1. `project-config` (основной проект, `--project-config-dir`, default: `./src/main/resources`) — низкий.
2. `external config-tree` (`--config-dir` / `--config-tree-dir`) — выше.
3. `--runtime-prop` — самый высокий.

`ENV` пока не обрабатывается внутри скрипта.

## Шаблоны

### Минимальный (только question, эвристический inference)
```bash
node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?"
```

### Надёжный (рекомендуется)
```bash
node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?" \
  --bean-regex "dataSource|datasource" \
  --property-name "spring.datasource.enabled" \
  --project-config-dir ./src/main/resources \
  --config-dir ./config
```

### Несколько внешних config-tree roots
```bash
node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?" \
  --bean-regex "dataSource|datasource" \
  --project-config-dir ./src/main/resources \
  --app-name "billing-service" \
  --config-tree-dir ./config \
  --config-tree-dir ./config/common/datasource
```

### Из списка в переменной (Bash)
```bash
IFS=',' read -r -a _roots <<< "$EXTERNAL_CONFIG_ROOTS"
CMD=(node skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \
  --question "Ожидается ли DataSource?" \
  --bean-regex "dataSource|datasource" \
  --project-config-dir ./src/main/resources)
for r in "${_roots[@]}"; do
  rr="$(echo "$r" | xargs)"
  [[ -n "$rr" ]] && CMD+=(--config-tree-dir "$rr")
done
"${CMD[@]}"
```

## Что писать в `--question`

Обычный пользовательский вопрос на естественном языке. Примеры:
- `"Ожидается ли DataSource?"`
- `"Почему redisClient может не создаться?"`
- `"Из какой автоконфигурации придет transactionManager?"`

`question` помогает фокусировать ответ и используется для inference, но для надёжности лучше явно задавать `--bean-regex` и/или `--return-type-regex`.

## Режимы вывода

- По умолчанию скрипт возвращает компактный JSON (удобно для обычной диагностики).
- `--debug` — полный технический дамп (кандидаты, условия, порядок, контендеры). См. [diagnose-output-guide.ru.md](diagnose-output-guide.ru.md).
