# Diagnosis Reference

## Helper Script
- `scripts/diagnose-autoconfig.mjs`
- Purpose: build structured evidence for agent reasoning (candidates, property-gates, profile resolution, predicted source by order).
- Not a final source of truth; agent should verify critical points via index (`jq`) and runtime report when needed.

## Input Sources
- AutoConfig index JSON: `.qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json`
- `*application*.properties` / `*application*.yaml|yml` из одного или нескольких config roots (рекурсивно, включая `my-application.yaml`)
- Optional runtime source of truth: `ConditionEvaluationReport` from app startup with `--debug`

## Supported Profile Semantics
- `spring.profiles.active`
- `spring.profiles.group.*`
- `spring.config.activate.on-profile`
- `application-<profile>.*`

## Output Fields
- `question`: echoed input question
- `query`: resolved selectors (`bean_regex`, `return_type_regex`, `inferred`)
- `verdict`: final verdict for the asked focus
- `overall_verdict`: overall yes/no by all discovered contenders
- `focused_verdict`: yes/no for focused subset (if focus detected)
- `focus`: chosen focused candidates and scoring reasons
- `winner_summary`: compact winner list per bean (default mode)
- `candidates`: full candidate autoconfig objects with evaluated conditions (`--debug`)
- `predicted_sources`: full contenders/winners per bean (`--debug`)
- `ordering`: computed ordering among candidate configs
- `trace`: short execution trace
- `runtime_source`: where runtime properties were loaded from
- `active_profiles`: resolved active profile list

## Manual Query Strategy
- Discovery: искать кандидатов по `bean_methods[].bean_name` и `bean_methods[].return_type`.
- Conditions: проверять `class_conditions` и `bean_methods[].conditions`.
- Ordering/imports: учитывать `imports`, `order`, `effective_order_index`.
- Properties: сверять `OnProperty`-условия с фактическими значениями из config/runtime.

## Escalation Rule
- If static index evidence is insufficient or likely wrong, run app with `--debug`, read `ConditionEvaluationReport`, and merge it with index findings.
- Runtime report has higher priority than static prediction.

## Human Guide
- Output semantics and troubleshooting playbook:
  - `references/diagnose-output-guide.ru.md`
- Internal algorithm and architecture:
  - `references/diagnose-autoconfig-architecture.ru.md`
