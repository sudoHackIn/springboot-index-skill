# Diagnose Output Guide (RU)

Этот документ объясняет, как человеку читать вывод:
- `scripts/diagnose-autoconfig.mjs`

## 1) Режимы вывода

Команда по умолчанию:
```bash
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs ...
```

Детальный режим:
```bash
node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs --debug ...
```

Разница:
- default: компактный ответ для обычной диагностики.
- `--debug`: полный технический дамп (кандидаты, условия, порядок, контендеры).

Перед запуском в production-кейсе обычно передают:
- `--project-config-dir ./src/main/resources`
- один или несколько `--config-dir ./config...`
- при необходимости `--app-name <spring.application.name>`

## 2) Поля default-вывода

Типичная структура:
- `question`: исходный вопрос.
- `query`: чем искали кандидатов.
- `verdict`: финальный ответ для текущего фокуса вопроса (evaluation — создастся ли бин под текущим runtime).
- `overall_verdict`: общий ответ по всем найденным кандидатам.
- `focused_verdict`: ответ по “фокусной” группе кандидатов (если фокус определен).
- `discovery_verdict`: `likely_yes`, если хоть один matched candidate найден (discovery — есть ли источник, вне зависимости от гейтов).
- `discovery_candidates`: компактный список `[{fqcn, status}]` по всем matched кандидатам (любой `status`).
- `focus`: какие кандидаты признаны фокусными и почему.
- `winner_summary`: краткий итог “какой автоконфиг победил” по каждому bean.
- `trace`: короткий пошаговый след.
- `runtime_source`: откуда взяты runtime properties.
- `active_profiles`: какие профили реально активны после resolve.

## 3) Поля debug-вывода

Дополнительно появляются:
- `candidates`: полный список найденных автоконфигураций-кандидатов.
- `ordering`: вычисленный порядок между кандидатами.
- `predicted_sources`: полный список контендеров и победителей по bean.

Это основной режим для разбора “почему именно так”.

## 4) Как интерпретировать verdict

- `likely_yes`: есть как минимум один проходящий кандидат для целевого фокуса.
- `likely_no`: кандидаты не найдены или фокусные кандидаты заблокированы.
- `insufficient_data`: данных недостаточно для уверенного прогноза.

Важно:
- `overall_verdict` может быть `likely_yes`, а `focused_verdict` — `likely_no`.
- В таком случае `verdict` ориентируется на фокус вопроса (например, вопрос был именно про override-конфиг).
- `verdict` / `focused_verdict` отвечают на **evaluation**-вопрос: «создастся ли бин под текущим runtime?».
- `discovery_verdict` отвечает на **discovery**-вопрос: «есть ли автоконфиг, способный дать этот бин?» — возвращает `likely_yes`, даже если matched candidate `blocked`. Используй его, когда вопрос формата «из какой АК ждать X?» и runtime-контекста нет.

## 5) Как диагностировать “почему не сработало”

1. Сначала default-режим:
- проверить `verdict`, `focus`, `winner_summary`, `trace`.

2. Затем `--debug`:
- открыть `candidates[]`.
- для каждого проблемного кандидата смотреть:
  - `status` (`pass`/`blocked`)
  - `class_conditions.blocking`
  - `bean_conditions[].result.blocking`

3. Проверить свойства:
- если блокировка по `OnProperty`, сверить:
  - значение в `detail` (например, `expected true`)
  - `runtime_source`
  - `active_profiles`

4. Проверить конкуренцию конфигов:
- `predicted_sources[].contenders`
- `ordering.ordered`

5. Если противоречит реальному запуску приложения:
- поднять `ConditionEvaluationReport` (`--debug` у Spring Boot)
- считать runtime-отчет источником истины.

## 6) Быстрые паттерны чтения

### “Будет ли бин создан?”
- смотри `verdict` + `winner_summary`.

### “Почему бин не поднялся?”
- смотри `candidates[].*.blocking` в `--debug`.

### “Из какой автоконфигурации ждать бин?”
- смотри `winner_summary` (или `predicted_sources` в `--debug`).

### “Какой профиль/группа сработали?”
- смотри `active_profiles` + `runtime_source`.

## 7) Частые причины ложных ожиданий

- Не передан `project-config-dir` (или путь неверный), поэтому не определился `spring.application.name`.
- Не передан `config-dir`, поэтому внешние properties не подхватились.
- Профиль считался активным, но не попал в resolved `active_profiles`.
- Сравнение шло не по тому bean/type regex.
- Вопрос фокусируется на override, а общий `overall_verdict` положительный за счет fallback-конфига.
- Нужна runtime-проверка через Spring `ConditionEvaluationReport`.
