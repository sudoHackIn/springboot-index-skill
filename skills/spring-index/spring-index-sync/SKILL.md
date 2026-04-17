---
name: spring-index-sync
description: "Используй этот скилл, когда нужно одним запуском синхронизировать оба индекса: properties и autoconfig."
---

# Синхронизация Индексов Spring

## Команда
```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-all-spring-indexes.sh
```

Принудительно:
```bash
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-all-spring-indexes.sh --force
```

## Ожидаемый Результат
- `.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json` актуален.
- `.qwen/spring-properties-index/spring_properties_index.json` актуален (если script доступен).
