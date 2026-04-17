# Boot AutoConfig Atlas: Идея, Формат И План (RU)

## Назначение
Собрать AI-совместимую документацию и индекс для `spring-boot-autoconfigure` и `Configuration Properties`, чтобы быстро отвечать на вопросы:
- почему автоконфигурация не сработала;
- почему создался/не создался бин;
- какими ключами управляется поведение;
- где безопасные точки override.

Документ описывает MVP-идею и пошаговый план внедрения.

## Почему Это Нужно
Для команд, которые часто делают свои автоконфигурации, классические проблемы повторяются:
- "почему не подключилось";
- "какой ключ реально влияет";
- "как переопределить без побочных эффектов";
- "что изменилось при апгрейде Boot".

Статическая карта закрывает большую часть таких задач без доступа к runtime-среде.

## Scope MVP
Включаем:
- `spring-boot-autoconfigure` (правила активации и создаваемые бины);
- `spring-configuration-metadata.json` (ключи, типы, default, deprecation);
- связи `autoconfig -> beans -> properties`.

Не включаем в MVP:
- полный индекс всех публичных API Spring Framework;
- глубинный runtime-трассинг через Java agent;
- автоматическую поддержку всех сторонних стартеров из экосистемы.

## Целевые Артефакты
1. `spring_boot_autoconfig_index.json`  
Машинный индекс для поиска, RAG и точечного объяснения причин.

2. `spring_boot_autoconfig_doc_ru.md`  
Человекочитаемая документация: индексы, карточки автоконфигов, диагностические подсказки.

3. `spring_boot_autoconfig_examples_ru.md`  
Сценарии "как включить/выключить/переопределить", плюс типовые anti-pattern примеры.

4. (Опционально, этап 2) `spring_boot_runtime_snapshot.json`  
Нормализованный runtime-срез из Actuator (`conditions/configprops/beans/env`) для конкретного сервиса.

## Формат `spring_boot_autoconfig_index.json` (v1)
```json
{
  "generated_at": "2026-04-17T00:00:00Z",
  "spring_boot_version": "3.x.x",
  "sources": {
    "artifacts": [],
    "metadata_files": []
  },
  "stats": {
    "autoconfigurations_total": 0,
    "bean_definitions_total": 0,
    "conditions_total": 0,
    "properties_linked_total": 0
  },
  "autoconfigurations": [
    {
      "id": "org.example.MyAutoConfiguration",
      "fqcn": "org.example.MyAutoConfiguration",
      "artifact": "group:artifact:version",
      "imports": [],
      "order": {
        "before": [],
        "after": [],
        "auto_configure_order": null
      },
      "class_conditions": [],
      "bean_methods": [
        {
          "bean_name": "myBean",
          "factory_method": "myBean",
          "return_type": "org.example.MyType",
          "conditions": [],
          "override_points": {
            "conditional_on_missing_bean": true,
            "recommended_override_strategy": "user-bean"
          },
          "targets": {
            "reference": "#autoconfig-org-example-myautoconfiguration",
            "examples": "#example-org-example-myautoconfiguration-mybean"
          }
        }
      ],
      "linked_properties": [
        {
          "name": "my.feature.enabled",
          "type": "java.lang.Boolean",
          "default_value": true,
          "deprecated": null,
          "source_type": "org.example.MyProperties"
        }
      ],
      "activation_hints": [
        "Добавьте зависимость X",
        "Установите my.feature.enabled=true"
      ]
    }
  ]
}
```

## Нормализация Условий (Condition DSL)
Для каждого условия храним:
- `kind`: `OnClass`, `OnBean`, `OnMissingBean`, `OnProperty`, `OnResource`, `OnWebApplication`, `OnExpression`;
- `scope`: `class` или `bean-method`;
- `inputs`: значения условия (классы, bean types, property names, havingValue, matchIfMissing);
- `negated`: признак отрицания (если применимо);
- `explain_hint`: короткий текст "что проверить в проекте".

Пример:
```json
{
  "kind": "OnProperty",
  "scope": "bean-method",
  "inputs": {
    "name": ["my.feature.enabled"],
    "havingValue": "true",
    "matchIfMissing": false
  },
  "negated": false,
  "explain_hint": "Проверьте, что my.feature.enabled=true"
}
```

## Как Использовать Уже Существующий Индекс Пропертей
В проекте уже есть `spring_properties_index.json`.  
MVP строится поверх него:
- не дублируем extractor метаданных пропертей;
- добавляем join-слой: `autoconfig/sourceType -> properties`;
- в doc показываем единый граф причинности.

Итог: переиспользование текущего скрипта, меньше риска и быстрее time-to-value.

## Пайплайн Генерации (MVP)
1. Resolver артефактов через Gradle (уже есть).
2. Извлечение configuration properties метаданных (уже есть).
3. Новый extractor автоконфигов:
- `AutoConfiguration.imports`;
- `spring-autoconfigure-metadata.properties`;
- аннотации/`@Bean` сигнатуры и условия.
4. Join:
- автоконфиги + бины + условия + проперти.
5. Генерация:
- JSON-индекс;
- Markdown reference + examples.
6. Валидация:
- schema check;
- уникальность id;
- отсутствие "пустых" диагностических подсказок.

## Что Эта Карта Решает Без Runtime
1. Какие автоконфиги и бины вообще существуют.
2. Какие условия должны выполниться.
3. Какие проперти влияют на конкретный бин.
4. Где корректно override через пользовательский `@Bean`.
5. Какие ключи deprecated и чем заменены.
6. Что теоретически сломается при upgrade версии Boot.

## Что Требует Runtime-Слоя
1. Почему условие не прошло в конкретном окружении прямо сейчас.
2. Какие значения реально попали из `env`/profiles/secrets.
3. Почему в одном сервисе сработало, а в другом нет.

Это закрывается этапом 2 через `spring_boot_runtime_snapshot.json`.

## План Внедрения

### Этап 0: Проектирование Схемы (1-2 дня)
Результат:
- утвержденная JSON schema v1;
- фиксированный список condition kinds;
- соглашение по `id` и `targets`.

Критерий готовности:
- schema проходит валидацию на тестовом fixture.

### Этап 1: MVP Статика (3-5 дней)
Результат:
- `build-autoconfig-index` скрипт;
- `spring_boot_autoconfig_index.json`;
- `spring_boot_autoconfig_doc_ru.md`;
- базовые `jq`-рецепты поиска причин.

Критерий готовности:
- можно объяснить минимум 80% типовых кейсов "почему не включилось" без runtime.

### Этап 2: Runtime Коннектор (3-4 дня)
Результат:
- сбор `conditions/configprops/beans/env` из Actuator;
- normalized snapshot;
- merge с статическим индексом.

Критерий готовности:
- по snapshot формируется конкретный ответ "что не сработало и как исправить".

### Этап 3: Version Diff И Миграции (2-3 дня)
Результат:
- diff между версиями Boot по:
  - условиям;
  - linked properties;
  - deprecated/replacement ключам.

Критерий готовности:
- есть отчет "breaking-risk" для апгрейда версии.

## DoD Для MVP
1. Индекс детерминированный (повторный запуск = тот же результат при тех же входах).
2. Есть покрытие:
- `autoconfigurations_total`;
- `conditions_total`;
- `bean_definitions_total`;
- `properties_linked_total`.
3. Есть справочные команды поиска (`jq`) для ежедневной диагностики.
4. Нет служебных заглушек вида `No ... found` в итоговых markdown-доках.
5. Есть минимум 10 примеров "диагностика -> действие".

## Риски И Как Снижать
1. Риск: неполное извлечение условий из аннотаций.  
Снижение: fallback на `spring-autoconfigure-metadata.properties` + тестовый набор известных автоконфигов.

2. Риск: ложные связи `bean -> property`.  
Снижение: хранить уровень уверенности (`confidence`) и явный источник связи.

3. Риск: шум от внутренних/технических классов.  
Снижение: строгий Scope фильтр только для Boot autoconfig surface.

4. Риск: быстрое устаревание по версии Boot.  
Снижение: версионирование индекса и автоматический diff.

## Первые Практические Задачи (Backlog)
1. Создать `skills/spring-index/spring-autoconfig-index-lookup/scripts/build-autoconfig-index.mjs`.
2. Добавить schema файл `spring_boot_autoconfig_index.schema.json`.
3. Добавить `skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh`.
4. Сгенерировать первый fixture для `spring-boot-autoconfigure`.
5. Подготовить `SPRING_AUTOCONFIG_INDEX_USAGE_RU.md` с `jq`-рецептами.

## Решение По Старту
Рекомендуемый старт:
1. Сначала Этап 1 (статический MVP).
2. После стабилизации формата подключать runtime-коннектор.

Так вы быстро получите пользу в ежедневной разработке автоконфигураций и не заблокируетесь на инфраструктурных доступах к окружениям.
