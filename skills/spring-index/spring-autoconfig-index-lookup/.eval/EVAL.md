# Skill Evaluation Guide

This folder is developer-only.

## Scenario Layout
- `.eval/scenarios/indexes/`
- `.eval/scenarios/cases/`
- `.eval/scenarios/configs/`

## Run Outputs
- `.eval/runs/<date>/<model>/<run-id>/report.md`
- `.eval/runs/<date>/<model>/<run-id>/meta.json`

## Run Command
```bash
node skills/spring-index/spring-autoconfig-index-lookup/.eval/eval-autoconfig-skill.mjs \
  --model gpt-5.4 \
  --skill skills/spring-index/spring-autoconfig-index-lookup/SKILL.md \
  --index skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/indexes/skill_eval_fixture_index.json \
  --cases skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/cases/skill_eval_cases_profile_groups_10.json
```
