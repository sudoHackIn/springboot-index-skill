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

## 2) Поля default-вывода

Типичная структура:
- `question`: исходный вопрос.
- `query`: чем искали кандидатов.
- `verdict`: финальный ответ для текущего фокуса вопроса.
- `overall_verdict`: общий ответ по всем найденным кандидатам.
- `focused_verdict`: ответ по “фокусной” группе кандидатов (если фокус определен).
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

- Не передан `config-dir`, поэтому properties не подхватились.
- Профиль считался активным, но не попал в resolved `active_profiles`.
- Сравнение шло не по тому bean/type regex.
- Вопрос фокусируется на override, а общий `overall_verdict` положительный за счет fallback-конфига.
- Нужна runtime-проверка через Spring `ConditionEvaluationReport`.
