# Runtime Diagnosis Reference

## Script
- `scripts/diagnose-autoconfig.mjs`

## Input Sources
- AutoConfig index JSON (`--index`), default `.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json`
- `application*.properties`
- `application*.yaml|yml`
- Optional runtime source of truth: `ConditionEvaluationReport` from app startup with `--debug`

## Supported Profile Semantics
- `spring.profiles.active`
- `spring.profiles.group.*`
- `spring.config.activate.on-profile`
- `application-<profile>.*`

## Output Fields
- `verdict`: `likely_yes | likely_no | insufficient_data`
- `candidate_autoconfigurations`
- `candidate_beans`
- `property_gate_status`
- `trace`

## Escalation Rule
- If static index evidence is insufficient or likely wrong, run app with `--debug`, read `ConditionEvaluationReport`, and merge it with index findings.
- Runtime report has higher priority than static prediction.
