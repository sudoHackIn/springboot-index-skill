# Spring AutoConfig Analyzer (tree-sitter)

Этот подпроект содержит Java-анализатор на tree-sitter для генерации индекса автоконфигурации.

## Структура

- `src/build-autoconfig-index.mjs` — основной анализатор.
- `package.json` — зависимости и команды подпроекта.

## Подготовка

```bash
cd skills/spring-autoconfig-index-lookup/analyzer
npm install
```

## Запуск анализатора напрямую

```bash
cd skills/spring-autoconfig-index-lookup/analyzer
npm run build:index -- \
  --boot-repo /abs/path/to/spring-boot \
  --project-root /abs/path/to/current-project \
  --version 3.4.4 \
  --out /abs/path/to/generated/spring_boot_autoconfig_index.json
```

## Запуск через обертку скилла

Из корня проекта:

```bash
node skills/spring-autoconfig-index-lookup/scripts/build-autoconfig-index.mjs ...
```

или

```bash
./skills/spring-autoconfig-index-lookup/scripts/rebuild-autoconfig-index.sh
```
