# Spring Boot AutoConfig Index: Usage (RU)

## 0) Подготовка анализатора (tree-sitter)

```bash
cd skills/spring-index/spring-autoconfig-index-lookup/analyzer
npm install
cd -
```

## 1) Один раз: базовый индекс Boot

```bash
# 1. Скачать spring-boot исходники
./skills/spring-index/spring-autoconfig-index-lookup/scripts/clone-sources.sh "$HOME/work/spring-sources"

# 2. Сгенерировать индекс только по spring-boot
BOOT_REPO="$HOME/work/spring-sources/spring-boot" \
SPRING_BOOT_VERSION="3.4.4" \
OUT_PATH="$(pwd)/skills/spring-index/spring-autoconfig-index-lookup/assets/spring_boot_autoconfig_index.base.json" \
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh
```

## 2) На каждый ваш проект: достроить карту своими библиотеками

```bash
BOOT_REPO="$HOME/work/spring-sources/spring-boot" \
SPRING_BOOT_VERSION="3.4.4" \
BASE_INDEX="$(pwd)/skills/spring-index/spring-autoconfig-index-lookup/assets/spring_boot_autoconfig_index.base.json" \
EXTRA_ROOTS="/abs/path/to/your-lib-a,/abs/path/to/your-lib-b" \
OUT_PATH="$(pwd)/generated/spring_boot_autoconfig_index.json" \
./skills/spring-index/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh
```

`EXTRA_ROOTS` может быть и одним путем.

## 3) Прямой запуск Node-скрипта

```bash
node skills/spring-index/spring-autoconfig-index-lookup/scripts/build-autoconfig-index.mjs \
  --boot-repo /abs/path/to/spring-boot \
  --project-root /abs/path/to/current-project \
  --extra-root /abs/path/to/your-lib-a \
  --extra-root /abs/path/to/your-lib-b \
  --base-index ./skills/spring-index/spring-autoconfig-index-lookup/assets/spring_boot_autoconfig_index.base.json \
  --version 3.4.4 \
  --out ./generated/spring_boot_autoconfig_index.json
```

## 4) Быстрые jq-рецепты

```bash
# Все автоконфиги
jq -r '.autoconfigurations[].fqcn' generated/spring_boot_autoconfig_index.json

# Где есть ConditionalOnProperty
jq -r '.autoconfigurations[] | select(.class_conditions[]?.kind == "OnProperty") | .fqcn' generated/spring_boot_autoconfig_index.json

# Поиск конкретного property
jq -r '.autoconfigurations[] | select(any(.linked_properties[]?; .name == "spring.datasource.url")) | .fqcn' generated/spring_boot_autoconfig_index.json

# Бины конкретной автоконфигурации
jq -r '.autoconfigurations[] | select(.fqcn == "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration") | .bean_methods[].bean_name' generated/spring_boot_autoconfig_index.json
```
