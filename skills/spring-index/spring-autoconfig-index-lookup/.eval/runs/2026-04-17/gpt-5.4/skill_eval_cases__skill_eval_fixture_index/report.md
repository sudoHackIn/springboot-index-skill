# Spring Autoconfig Skill Evaluation Report

- Model: gpt-5.4
- Skill: /Users/vladislav/projects/springboot-index-skill/skills/spring-index/spring-autoconfig-index-lookup/SKILL.md
- Skill version: 0.2.0
- Run date: 2026-04-17
- Run id: skill_eval_cases__skill_eval_fixture_index
- Index: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/scenarios/indexes/skill_eval_fixture_index.json
- Cases: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/scenarios/cases/skill_eval_cases.json
- Report: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/runs/2026-04-17/gpt-5.4/skill_eval_cases__skill_eval_fixture_index/report.md
- Metadata: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/runs/2026-04-17/gpt-5.4/skill_eval_cases__skill_eval_fixture_index/meta.json
- Passed: 3/4

## Per-case results

### case-01-datasource-discovery
- question: Поднимется ли DataSource в этом окружении?
- expected_verdict: likely_yes
- actual_verdict: likely_yes
- expected_autoconfig_found: true
- pass: yes
- runtime_source: (none)
- active_profiles: (none)
- runtime_properties_count: 0
- candidate_autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
- candidate_beans: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource:javax.sql.DataSource, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource:javax.sql.DataSource
- linked_properties: (none)
- property_gate_status:
  - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration: pass (matched spring.datasource.enabled)
  - com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration: blocked (acme.datasource.override.enabled missing and matchIfMissing=false)
- trace:
  - Loaded index with 6 autoconfigurations.
  - Runtime properties available: 0.
  - Discovery by bean/type found 2 candidate bean methods.
  - Distinct candidate autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration, com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration
  - Blocking/override signals found: 2.
  - Property gate blocked com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration: acme.datasource.override.enabled missing and matchIfMissing=false
- blocking_signals:
  - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource: OnMissingBean
  - com.acme.autoconfigure.CustomDataSourceOverrideAutoConfiguration#dataSource: OnMissingBean

### case-02-redis-disabled-by-prop
- question: Почему redisClient не поднялся?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: yes
- runtime_source: (none)
- active_profiles: (none)
- runtime_properties_count: 1
- candidate_autoconfigurations: com.acme.autoconfigure.RedisClientAutoConfiguration
- candidate_beans: com.acme.autoconfigure.RedisClientAutoConfiguration#redisClient:com.acme.redis.RedisClient
- linked_properties: acme.redis.enabled
- property_gate_status:
  - com.acme.autoconfigure.RedisClientAutoConfiguration: blocked (acme.redis.enabled=false, expected true)
- trace:
  - Loaded index with 6 autoconfigurations.
  - Runtime properties available: 1.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.RedisClientAutoConfiguration
  - Property check 'acme.redis.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 1.
  - Property gate blocked com.acme.autoconfigure.RedisClientAutoConfiguration: acme.redis.enabled=false, expected true
- blocking_signals:
  - com.acme.autoconfigure.RedisClientAutoConfiguration#redisClient: OnMissingBean

### case-03-kafka-from-which-autoconfig
- question: Из какой автоконфигурации ждать kafkaProducer?
- expected_verdict: likely_yes
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: no
- runtime_source: (none)
- active_profiles: (none)
- runtime_properties_count: 0
- candidate_autoconfigurations: com.acme.autoconfigure.KafkaProducerAutoConfiguration
- candidate_beans: com.acme.autoconfigure.KafkaProducerAutoConfiguration#kafkaProducer:com.acme.kafka.KafkaProducer
- linked_properties: (none)
- property_gate_status:
  - com.acme.autoconfigure.KafkaProducerAutoConfiguration: blocked (acme.kafka.enabled missing and matchIfMissing=false)
- trace:
  - Loaded index with 6 autoconfigurations.
  - Runtime properties available: 0.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.KafkaProducerAutoConfiguration
  - Blocking/override signals found: 1.
  - Property gate blocked com.acme.autoconfigure.KafkaProducerAutoConfiguration: acme.kafka.enabled missing and matchIfMissing=false
- blocking_signals:
  - com.acme.autoconfigure.KafkaProducerAutoConfiguration#kafkaProducer: OnMissingBean

### case-04-no-candidate
- question: Ожидается ли mailSender из автоконфигурации?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: yes
- runtime_source: (none)
- active_profiles: (none)
- runtime_properties_count: 0
- candidate_autoconfigurations: com.acme.autoconfigure.MailSenderAutoConfiguration
- candidate_beans: com.acme.autoconfigure.MailSenderAutoConfiguration#mailSender:org.springframework.mail.javamail.JavaMailSender
- linked_properties: (none)
- property_gate_status:
  - com.acme.autoconfigure.MailSenderAutoConfiguration: blocked (acme.mail.enabled missing and matchIfMissing=false)
- trace:
  - Loaded index with 6 autoconfigurations.
  - Runtime properties available: 0.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.MailSenderAutoConfiguration
  - Blocking/override signals found: 1.
  - Property gate blocked com.acme.autoconfigure.MailSenderAutoConfiguration: acme.mail.enabled missing and matchIfMissing=false
- blocking_signals:
  - com.acme.autoconfigure.MailSenderAutoConfiguration#mailSender: OnMissingBean

## Notes
- This report includes external diagnostic trace only (queries, matches, rule outcomes).
- It does not include hidden internal reasoning.

