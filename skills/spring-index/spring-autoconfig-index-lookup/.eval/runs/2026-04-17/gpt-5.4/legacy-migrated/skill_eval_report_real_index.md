# Spring Autoconfig Skill Evaluation Report

- Index: /Users/vladislav/projects/springboot-index-skill/.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json
- Cases: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/skill_eval_cases.json
- Report: /Users/vladislav/projects/springboot-index-skill/scripts/spring-index/eval/skill_eval_report_real_index.md
- Passed: 1/4

## Per-case results

### case-01-datasource-discovery
- question: Будет ли создан DataSource из автоконфигурации?
- expected_verdict: likely_yes
- actual_verdict: likely_no
- expected_autoconfig_found: false
- pass: no
- candidate_autoconfigurations: (none)
- candidate_beans: (none)
- linked_properties: (none)
- trace:
  - Loaded index with 285 autoconfigurations.
  - Discovery by bean/type found 0 candidate bean methods.
  - Blocking/override signals found: 0.

### case-02-redis-disabled-by-prop
- question: Почему redisClient не поднялся, если acme.redis.enabled=false?
- expected_verdict: likely_no
- actual_verdict: likely_no
- expected_autoconfig_found: false
- pass: no
- candidate_autoconfigurations: (none)
- candidate_beans: (none)
- linked_properties: (none)
- trace:
  - Loaded index with 285 autoconfigurations.
  - Discovery by bean/type found 0 candidate bean methods.
  - Property check 'acme.redis.enabled' matched 0 autoconfigurations.
  - Blocking/override signals found: 0.

### case-03-kafka-from-which-autoconfig
- question: Из какой автоконфигурации ожидать kafkaProducer?
- expected_verdict: likely_yes
- actual_verdict: likely_no
- expected_autoconfig_found: false
- pass: no
- candidate_autoconfigurations: (none)
- candidate_beans: (none)
- linked_properties: (none)
- trace:
  - Loaded index with 285 autoconfigurations.
  - Discovery by bean/type found 0 candidate bean methods.
  - Blocking/override signals found: 0.

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
  - Loaded index with 285 autoconfigurations.
  - Discovery by bean/type found 0 candidate bean methods.
  - Blocking/override signals found: 0.

## Notes
- This report includes external diagnostic trace only (queries, matches, rule outcomes).
- It does not include hidden internal reasoning.

