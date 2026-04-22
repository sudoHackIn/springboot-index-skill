# diagnose-autoconfig.mjs: как это работает (технический разбор)

Файл:
- `skills/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs`

Цель:
- По индексу автоконфигураций и runtime-контексту построить объяснимый прогноз:
  - ожидается ли бин,
  - из какого автоконфига,
  - какие условия блокируют включение.

Приоритет sources (в текущей реализации):
1. project config (`--project-config-dir`, default `./src/main/resources`)
2. external config-tree (`--config-dir` / `--config-tree-dir`)
3. inline runtime overrides (`--runtime-prop`)

## 1) Пайплайн верхнего уровня

В `main()` выполняются этапы:
1. `parseArgs(...)` — разбор CLI-флагов.
2. Чтение index JSON (`--index` или дефолтный путь).
3. Проверка входа: нужен хотя бы один из `--bean-regex`, `--return-type-regex`, `--question`.
4. `loadRuntimeProperties(...)` — сбор runtime properties:
   - из project `application*.properties/yaml`,
   - из external `application*` и `<app-name>*`,
   - из профилей и profile groups,
   - из `--runtime-prop`.
5. `resolveQuery(...)` — финальные селекторы поиска (явные regex или inference из `question`).
6. `diagnose(...)` — основная диагностика.
7. Выбор режима вывода:
   - default: `compactResult(...)`,
   - debug: полный `result`.

## 2) Разбор входа (CLI)

Ключевые параметры:
- селекторы поиска:
  - `--bean-regex`
  - `--return-type-regex`
  - `--question` (для inference)
- runtime-контекст:
  - `--project-config-dir`
  - `--config-dir`
  - `--config-tree-dir`
  - `--app-name`
  - `--active-profile` (можно много раз)
  - `--runtime-prop key=value` (можно много раз)
- прочее:
  - `--property-name` (фокус/trace)
  - `--index`
  - `--debug`

## 3) Сбор runtime properties

`loadRuntimeProperties(...)`:
1. Читает project roots:
   - `application*.properties|yaml|yml`.
2. Определяет `appName`:
   - из `--app-name`, либо
   - из `spring.application.name` project-config.
3. Читает external roots:
   - `application*.properties|yaml|yml`,
   - `<appName>*.properties|yaml|yml`.
4. Выделяет profile-зависимые документы:
   - `application-<profile>.*`,
   - `spring.config.activate.on-profile`,
   - `spring.profiles`.
5. Собирает base props (без required profiles).
6. Определяет активные профили:
   - сначала `--active-profile`, если переданы;
   - иначе `spring.profiles.active`.
7. Раскрывает `spring.profiles.group.*` через `expandProfiles(...)`.
8. Мержит только документы, подходящие под resolved profiles.
9. Применяет приоритет: project -> external.
10. Накладывает `--runtime-prop` последним слоем (override).

Особенность:
- если контекст не задан (нет external config-dir, профилей, runtime-prop), режим более “мягкий” для missing properties.

## 4) Разрешение query

`resolveQuery(...)`:
- если regex переданы явно, использует их как есть;
- иначе пытается вывести `bean_regex` из текста вопроса:
  - собирает все bean names из индекса (`collectBeanNames`),
  - скорит совпадения (`scoreNameMatch`),
  - берет top-3 и строит regex.

## 5) Discovery кандидатов

В `diagnose(...)`:
1. Берутся все `autoconfigurations` из индекса.
2. Для каждого конфига перебираются `bean_methods`.
3. Кандидатом считается bean-method, если:
   - совпал `bean_name` по `bean_regex`, или
   - совпал `return_type` по `return_type_regex`.
4. Если у конфига нет совпавших bean-method, конфиг исключается из кандидатов.

## 6) Оценка условий

`evaluateConditions(...)`:
- `OnProperty` — вычисляется статически (`evaluateOnPropertyCondition`).
- `OnMissingBean` — помечается как runtime-dependent, не блокирует статически.
- `OnClass` — помечается как runtime-dependent, не блокирует статически.
- остальные виды условий — “not statically evaluated”.

`evaluateOnPropertyCondition(...)`:
- учитывает `name/value`, `havingValue`, `matchIfMissing`.
- при отсутствии property:
  - если `matchIfMissing=true` -> pass;
  - если контекст явно задан (`strictPropertyMissing=true`) -> fail;
  - если контекст не задан -> не блокирует (treated as unknown).

Статус кандидата:
- `pass`, если нет blocking причин;
- `blocked`, если есть blocking в class- или bean-conditions.

## 7) Порядок автоконфигов

`computeEffectiveOrder(...)`:
- строит граф зависимостей из:
  - `order.after` (dependency -> current),
  - `order.before` (current -> dependency).
- применяет топологическую сортировку.
- tie-break:
  - `auto_configure_order` (меньше = раньше),
  - затем `fqcn` лексикографически.

Результат:
- `ordering.ordered`
- `ordering.cyclic_nodes`

## 8) Прогноз победителя бина

`predictWinners(...)`:
1. Группирует кандидатов по имени бина.
2. Сортирует контендеров по рассчитанному order index.
3. Победитель — первый `pass` контендер.

В debug-режиме возвращается полный `predicted_sources` с контендерами.
В default-режиме остается только `winner_summary`.

## 9) Фокус вопроса

`buildFocus(...)` пытается выделить “целевые” кандидаты:
- сигналы из вопроса:
  - `override`,
  - `standard/стандарт`,
  - `without override/без override`,
  - `external/внешн`.
- совпадение по `property_name` через `hasPropertyReference(...)`.

Считается score, выбираются кандидаты с максимальным score:
- `focus.focused_candidates`

## 10) Итоговые verdict

Скрипт различает **evaluation** (создастся ли бин под текущим runtime) и **discovery** (есть ли автоконфиг, способный его дать). Для этого возвращается четыре вердикта:

- `overall_verdict` (evaluation):
  - `likely_no`, если кандидатов нет или нет winner (нет `pass` в `predicted_sources`);
  - `likely_yes`, если есть winner.
- `focused_verdict` (evaluation, узкий):
  - если есть focused candidates:
    - `likely_yes`, если среди них есть `pass`,
    - иначе `likely_no`;
  - `null`, если focus пустой.
- `verdict` (evaluation, финальный):
  - `focused_verdict`, если он есть;
  - иначе `overall_verdict`.
- `discovery_verdict`:
  - `likely_yes`, если `candidateEntries.length > 0` — т.е. хоть один matched candidate найден по `bean_regex` / `return_type_regex` **вне зависимости от `status`** (даже `blocked`);
  - `likely_no`, если кандидатов нет.

Ключевая разница: matched candidate может быть `blocked` из-за `OnProperty` с `matchIfMissing=false` и отсутствующего runtime-контекста. Для discovery-вопроса («из какой АК ждать X?») это не значит «нет источника» — автоконфиг существует и в другом окружении сработает. `discovery_verdict` отражает именно это.

Сопутствующее поле:
- `discovery_candidates`: компактный `[{fqcn, status}]` по всем matched кандидатам — позволяет агенту сразу получить список источников вместе с их текущим статусом.

## 11) Формат вывода

Default:
- `question`, `query`,
- `verdict`, `overall_verdict`, `focused_verdict`, `discovery_verdict`,
- `discovery_candidates`,
- `focus`, `winner_summary`, `trace`,
- `runtime_source`, `active_profiles`.

Debug (`--debug`):
- все из default +
- `candidates`, `ordering`, `predicted_sources`.

## 12) Ограничения текущей реализации

1. Полноценно статически считается только `OnProperty`.
2. `OnClass` / `OnMissingBean` не верифицируются без runtime.
3. YAML parser упрощенный (достаточен для типичных application-конфигов, но не для всех edge-cases YAML).
4. Query inference из `question` эвристический.
5. Порядок считается внутри найденных кандидатов, не всего universe автоконфигов.

## 13) Когда эскалировать к runtime

Переходить к `ConditionEvaluationReport`, если:
- verdict не совпадает с фактическим поведением приложения,
- есть спорные/непокрытые статикой условия,
- требуется точное объяснение почему Spring “did not match”.

Runtime-отчет считается источником истины выше статического прогноза.
