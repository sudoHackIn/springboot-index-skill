# Evaluation (Developer-only)

Evaluation assets are intentionally placed under hidden folder:
- `.eval/`

Run example:
```bash
node skills/spring-index/spring-autoconfig-index-lookup/.eval/eval-autoconfig-skill.mjs \
  --model gpt-5.4 \
  --skill skills/spring-index/spring-autoconfig-index-lookup/SKILL.md \
  --index skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/indexes/skill_eval_fixture_index.json \
  --cases skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/cases/skill_eval_cases_profile_groups_10.json
```
