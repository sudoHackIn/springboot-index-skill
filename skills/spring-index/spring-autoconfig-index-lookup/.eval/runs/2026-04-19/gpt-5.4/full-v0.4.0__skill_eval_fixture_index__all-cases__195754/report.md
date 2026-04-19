# Skill Eval Report

- date: 2026-04-19
- model: gpt-5.4
- run_id: full-v0.4.0__skill_eval_fixture_index__all-cases__195754
- skill_declared_version: 0.4.0
- skill_root: skills/spring-index/spring-autoconfig-index-lookup
- eval_dir: skills/spring-index/spring-autoconfig-index-lookup/.eval
- index: skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/indexes/skill_eval_fixture_index.json
- cases_glob: skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/cases/*.json
- mode: full
- run_dir: skills/spring-index/spring-autoconfig-index-lookup/.eval/runs/2026-04-19/gpt-5.4/full-v0.4.0__skill_eval_fixture_index__all-cases__195754

## Overall
- total: 54
- passed: 53
- failed: 1
- pass_rate: 98.15%

## Per Case File
- skill_eval_cases.json: total=4, passed=3, failed=1
- skill_eval_cases_config_tree_10.json: total=10, passed=10, failed=0
- skill_eval_cases_config_tree_appname_10.json: total=10, passed=10, failed=0
- skill_eval_cases_external_10.json: total=10, passed=10, failed=0
- skill_eval_cases_extra_10.json: total=10, passed=10, failed=0
- skill_eval_cases_profile_groups_10.json: total=10, passed=10, failed=0

## Failed Cases
- case-03-kafka-from-which-autoconfig (skill_eval_cases.json) :: verdict_mismatch:expected=likely_yes,actual=likely_no
