# Spring Autoconfig Skill Evaluation Report

- Index: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/skill_eval_fixture_index.json
- Cases: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/skill_eval_cases_extra_10.json
- Report: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/skill_eval_report_extra_10.md
- Passed: 10/10

## Per-case results

### extra-01-datasource-enabled
- question: Будет ли создан DataSource, если spring.datasource.enabled=true?
- expected_verdict: likely_yes
- actual_verdict: likely_yes
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
- candidate_beans: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource:javax.sql.DataSource, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource:javax.sql.DataSource
- linked_properties: spring.datasource.enabled, spring.datasource.url
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 2 candidate bean methods.
  - Distinct candidate autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
  - Property check 'spring.datasource.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 2.
- blocking_signals:
  - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource: OnMissingBean
  - com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource: OnMissingBean

### extra-02-datasource-disabled-by-prop
- question: Будет ли создан DataSource, если spring.datasource.enabled=false?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
- candidate_beans: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource:javax.sql.DataSource, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource:javax.sql.DataSource
- linked_properties: spring.datasource.enabled, spring.datasource.url
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 2 candidate bean methods.
  - Distinct candidate autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
  - Property check 'spring.datasource.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 2.
  - Runtime property mismatch: spring.datasource.enabled=false, expected true.
- blocking_signals:
  - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource: OnMissingBean
  - com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource: OnMissingBean

### extra-03-custom-datasource-override-on
- question: Если включить acme.datasource.override.enabled=true, ожидаем DataSource из внешней либы?
- expected_verdict: likely_yes
- actual_verdict: likely_yes
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
- candidate_beans: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource:javax.sql.DataSource, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource:javax.sql.DataSource
- linked_properties: acme.datasource.override.enabled
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 2 candidate bean methods.
  - Distinct candidate autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
  - Property check 'acme.datasource.override.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 2.
- blocking_signals:
  - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource: OnMissingBean
  - com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource: OnMissingBean

### extra-04-custom-datasource-override-off
- question: Если acme.datasource.override.enabled=false, внешний override выключен?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
- candidate_beans: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource:javax.sql.DataSource, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource:javax.sql.DataSource
- linked_properties: acme.datasource.override.enabled
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 2 candidate bean methods.
  - Distinct candidate autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
  - Property check 'acme.datasource.override.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 2.
  - Runtime property mismatch: acme.datasource.override.enabled=false, expected true.
- blocking_signals:
  - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource: OnMissingBean
  - com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource: OnMissingBean

### extra-05-redis-enabled
- question: Создастся ли redisClient при acme.redis.enabled=true?
- expected_verdict: likely_yes
- actual_verdict: likely_yes
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: com.acme.autoconfigure.RedisClientAutoConfiguration
- candidate_beans: com.acme.autoconfigure.RedisClientAutoConfiguration#redisClient:com.acme.redis.RedisClient
- linked_properties: acme.redis.enabled
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.RedisClientAutoConfiguration
  - Property check 'acme.redis.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 1.
- blocking_signals:
  - com.acme.autoconfigure.RedisClientAutoConfiguration#redisClient: OnMissingBean

### extra-06-redis-disabled
- question: Создастся ли redisClient при acme.redis.enabled=false?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: com.acme.autoconfigure.RedisClientAutoConfiguration
- candidate_beans: com.acme.autoconfigure.RedisClientAutoConfiguration#redisClient:com.acme.redis.RedisClient
- linked_properties: acme.redis.enabled
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.RedisClientAutoConfiguration
  - Property check 'acme.redis.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 1.
  - Runtime property mismatch: acme.redis.enabled=false, expected true.
- blocking_signals:
  - com.acme.autoconfigure.RedisClientAutoConfiguration#redisClient: OnMissingBean

### extra-07-kafka-enabled
- question: Из какой автоконфигурации ждать kafkaProducer при acme.kafka.enabled=true?
- expected_verdict: likely_yes
- actual_verdict: likely_yes
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: com.acme.autoconfigure.KafkaProducerAutoConfiguration
- candidate_beans: com.acme.autoconfigure.KafkaProducerAutoConfiguration#kafkaProducer:com.acme.kafka.KafkaProducer
- linked_properties: acme.kafka.enabled
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.KafkaProducerAutoConfiguration
  - Property check 'acme.kafka.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 1.
- blocking_signals:
  - com.acme.autoconfigure.KafkaProducerAutoConfiguration#kafkaProducer: OnMissingBean

### extra-08-transaction-manager-enabled
- question: Поднимется ли transactionManager при spring.jpa.enabled=true?
- expected_verdict: likely_yes
- actual_verdict: likely_yes
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: com.acme.autoconfigure.JpaTxAutoConfiguration
- candidate_beans: com.acme.autoconfigure.JpaTxAutoConfiguration#transactionManager:org.springframework.transaction.PlatformTransactionManager
- linked_properties: spring.jpa.enabled
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.JpaTxAutoConfiguration
  - Property check 'spring.jpa.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 1.
- blocking_signals:
  - com.acme.autoconfigure.JpaTxAutoConfiguration#transactionManager: OnMissingBean

### extra-09-transaction-manager-disabled
- question: Поднимется ли transactionManager при spring.jpa.enabled=false?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: com.acme.autoconfigure.JpaTxAutoConfiguration
- candidate_beans: com.acme.autoconfigure.JpaTxAutoConfiguration#transactionManager:org.springframework.transaction.PlatformTransactionManager
- linked_properties: spring.jpa.enabled
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.JpaTxAutoConfiguration
  - Property check 'spring.jpa.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 1.
  - Runtime property mismatch: spring.jpa.enabled=false, expected true.
- blocking_signals:
  - com.acme.autoconfigure.JpaTxAutoConfiguration#transactionManager: OnMissingBean

### extra-10-mail-disabled-by-prop
- question: Будет ли mailSender при acme.mail.enabled=false?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: com.acme.autoconfigure.MailSenderAutoConfiguration
- candidate_beans: com.acme.autoconfigure.MailSenderAutoConfiguration#mailSender:org.springframework.mail.javamail.JavaMailSender
- linked_properties: acme.mail.enabled
- trace:
  - Loaded index with 6 autoconfigurations.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.MailSenderAutoConfiguration
  - Property check 'acme.mail.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 1.
  - Runtime property mismatch: acme.mail.enabled=false, expected true.
- blocking_signals:
  - com.acme.autoconfigure.MailSenderAutoConfiguration#mailSender: OnMissingBean

## Notes
- This report includes external diagnostic trace only (queries, matches, rule outcomes).
- It does not include hidden internal reasoning.

