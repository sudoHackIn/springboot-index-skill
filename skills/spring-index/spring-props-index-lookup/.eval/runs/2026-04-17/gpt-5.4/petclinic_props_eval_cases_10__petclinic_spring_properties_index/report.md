# Spring Props Skill Evaluation Report

- Model: gpt-5.4
- Skill: /Users/vladislav/projects/springboot-index-skill/skills/spring-index/spring-props-index-lookup/SKILL.md
- Run date: 2026-04-17
- Run id: petclinic_props_eval_cases_10__petclinic_spring_properties_index
- Index: /Users/vladislav/projects/springboot-index-skill/skills/spring-index/spring-props-index-lookup/.eval/scenarios/indexes/petclinic_spring_properties_index.json
- Cases: /Users/vladislav/projects/springboot-index-skill/skills/spring-index/spring-props-index-lookup/.eval/scenarios/cases/petclinic_props_eval_cases_10.json
- Passed: 10/10

## Per-case results

### props-01-exact-datasource-url
- prompt: Какой ключ отвечает за JDBC URL datasource?
- pass: yes
- score: 1
- output: ./cases/props-01-exact-datasource-url/output.md
- commands: ./cases/props-01-exact-datasource-url/commands.log
- notes: Ожидания exact match выполнены (1 результат).

### props-02-prefix-datasource
- prompt: Покажи все ключи по префиксу spring.datasource.
- pass: yes
- score: 1
- output: ./cases/props-02-prefix-datasource/output.md
- commands: ./cases/props-02-prefix-datasource/commands.log
- notes: Минимум результатов и include/exclude проверки пройдены.

### props-03-regex-jpa-hibernate
- prompt: Какие есть ключи по spring.jpa.hibernate?
- pass: yes
- score: 1
- output: ./cases/props-03-regex-jpa-hibernate/output.md
- commands: ./cases/props-03-regex-jpa-hibernate/commands.log
- notes: Оба ожидаемых ключа найдены.

### props-04-prefix-sql-init
- prompt: Какие свойства у spring.sql.init?
- pass: yes
- score: 1
- output: ./cases/props-04-prefix-sql-init/output.md
- commands: ./cases/props-04-prefix-sql-init/commands.log
- notes: Минимум 5 результатов соблюден.

### props-05-observed-src-main-resources
- prompt: Какие ключи реально наблюдались в src/main/resources?
- pass: yes
- score: 1
- output: ./cases/props-05-observed-src-main-resources/output.md
- commands: ./cases/props-05-observed-src-main-resources/commands.log
- notes: Использован корректный jq-паттерн `any(.examples[]?; ...)`.

### props-06-exact-management-exposure
- prompt: Какой ключ включает web exposure для actuator endpoints?
- pass: yes
- score: 1
- output: ./cases/props-06-exact-management-exposure/output.md
- commands: ./cases/props-06-exact-management-exposure/commands.log
- notes: Exact match и cardinality выполнены.

### props-07-description-jdbc
- prompt: Найди свойства по описанию JDBC/database.
- pass: yes
- score: 1
- output: ./cases/props-07-description-jdbc/output.md
- commands: ./cases/props-07-description-jdbc/commands.log
- notes: Порог `min_results=10` превышен.

### props-08-artifact-spring-boot-jdbc
- prompt: Какие ключи приходят из артефакта spring-boot-jdbc?
- pass: yes
- score: 0.97
- output: ./cases/props-08-artifact-spring-boot-jdbc/output.md
- commands: ./cases/props-08-artifact-spring-boot-jdbc/commands.log
- notes: В индексе используется поле `source_artifacts` (массив), а не `sourceArtifact`.

### props-09-deprecated
- prompt: Покажи deprecated свойства.
- pass: yes
- score: 1
- output: ./cases/props-09-deprecated/output.md
- commands: ./cases/props-09-deprecated/commands.log
- notes: Ожидаемый deprecated ключ найден.

### props-10-group-prefix
- prompt: Какие группы есть у datasource?
- pass: yes
- score: 1
- output: ./cases/props-10-group-prefix/output.md
- commands: ./cases/props-10-group-prefix/commands.log
- notes: Порог `min_group_results=3` выполнен.

## Notes
- Subagent-driven evaluation run (external trace only).
