# Spring Autoconfig Skill Evaluation Report

- Index: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/skill_eval_fixture_index.json
- Cases: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/skill_eval_cases.json
- Report: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/skill_eval_report.md
- Passed: 4/4

## Per-case results

### case-01-datasource-discovery
- question: Будет ли создан DataSource из автоконфигурации?
- expected_verdict: likely_yes
- actual_verdict: likely_yes
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
- candidate_beans: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource:javax.sql.DataSource
- linked_properties: (none)
- trace:
  - Loaded index with 3 autoconfigurations.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
  - Blocking/override signals found: 1.
- blocking_signals:
  - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration#dataSource: OnMissingBean

### case-02-redis-disabled-by-prop
- question: Почему redisClient не поднялся, если acme.redis.enabled=false?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: com.acme.autoconfigure.RedisClientAutoConfiguration
- candidate_beans: com.acme.autoconfigure.RedisClientAutoConfiguration#redisClient:com.acme.redis.RedisClient
- linked_properties: acme.redis.enabled
- trace:
  - Loaded index with 3 autoconfigurations.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.RedisClientAutoConfiguration
  - Property check 'acme.redis.enabled' matched 1 autoconfigurations.
  - Blocking/override signals found: 1.
  - Runtime property mismatch: acme.redis.enabled=false, expected true.
- blocking_signals:
  - com.acme.autoconfigure.RedisClientAutoConfiguration#redisClient: OnMissingBean

### case-03-kafka-from-which-autoconfig
- question: Из какой автоконфигурации ожидать kafkaProducer?
- expected_verdict: likely_yes
- actual_verdict: likely_yes
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: com.acme.autoconfigure.KafkaProducerAutoConfiguration
- candidate_beans: com.acme.autoconfigure.KafkaProducerAutoConfiguration#kafkaProducer:com.acme.kafka.KafkaProducer
- linked_properties: (none)
- trace:
  - Loaded index with 3 autoconfigurations.
  - Discovery by bean/type found 1 candidate bean methods.
  - Distinct candidate autoconfigurations: com.acme.autoconfigure.KafkaProducerAutoConfiguration
  - Blocking/override signals found: 1.
- blocking_signals:
  - com.acme.autoconfigure.KafkaProducerAutoConfiguration#kafkaProducer: OnMissingBean

### case-04-no-candidate
- question: Будет ли создан bean mailSender?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: true
- pass: yes
- candidate_autoconfigurations: (none)
- candidate_beans: (none)
- linked_properties: (none)
- trace:
  - Loaded index with 3 autoconfigurations.
  - Discovery by bean/type found 0 candidate bean methods.
  - Blocking/override signals found: 0.

## Notes
- This report includes external diagnostic trace only (queries, matches, rule outcomes).
- It does not include hidden internal reasoning.

