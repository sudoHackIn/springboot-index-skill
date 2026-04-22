# Skill Eval Report

- date: 2026-04-17
- model: gpt-5.4
- run_id: full-1__skill_eval_fixture_index__all-cases__221312
- index: /Users/vladislav/projects/springboot-index-skill/skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/indexes/skill_eval_fixture_index.json
- run_dir: /Users/vladislav/projects/springboot-index-skill/skills/spring-index/spring-autoconfig-index-lookup/.eval/runs/2026-04-17/gpt-5.4/full-1__skill_eval_fixture_index__all-cases__221312

## Overall
- total: 54
- passed: 26
- failed: 28
- pass_rate: 48.15%

## Per Case File
- skill_eval_cases.json: total=4, passed=4, failed=0
- skill_eval_cases_config_tree_10.json: total=10, passed=10, failed=0
- skill_eval_cases_config_tree_appname_10.json: total=10, passed=10, failed=0
- skill_eval_cases_external_10.json: total=10, passed=2, failed=8
- skill_eval_cases_extra_10.json: total=10, passed=0, failed=10
- skill_eval_cases_profile_groups_10.json: total=10, passed=0, failed=10

## Failed Cases
- grp-08-custom-ds-off-group-overrides-base (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- ext-05-kafka-yaml-group-on (skill_eval_cases_external_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-07-kafka-enabled (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- grp-04-kafka-off-via-group (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-10-mail-disabled-by-prop (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- grp-02-ds-off-via-group (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-01-datasource-enabled (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- ext-07-custom-ds-team-profile-on (skill_eval_cases_external_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- ext-03-redis-dev-profile-on (skill_eval_cases_external_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-06-redis-disabled (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- grp-06-redis-off-no-group-target (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-09-transaction-manager-disabled (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- grp-07-custom-ds-on-via-group (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- grp-05-redis-on-via-group (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- ext-04-redis-prod-profile-off (skill_eval_cases_external_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- ext-08-custom-ds-prod-profile-off (skill_eval_cases_external_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-04-custom-datasource-override-off (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- grp-10-mail-off-via-group (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- ext-09-tx-dev-profile-on (skill_eval_cases_external_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-05-redis-enabled (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- grp-01-ds-on-via-group (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- ext-06-kafka-missing-property-off (skill_eval_cases_external_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- ext-10-mail-staging-profile-off (skill_eval_cases_external_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- grp-09-jpa-on-via-group (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-08-transaction-manager-enabled (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-02-datasource-disabled-by-prop (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- grp-03-kafka-on-via-group (skill_eval_cases_profile_groups_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
- extra-03-custom-datasource-override-on (skill_eval_cases_extra_10.json) :: subagent_exit_nonzero:1; no_valid_output_json
