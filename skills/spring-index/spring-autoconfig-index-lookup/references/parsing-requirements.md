# Spring AutoConfig Parser Requirements

Last updated: 2026-04-17

## Status Legend

- `[x]` Implemented
- `[ ]` Not implemented yet
- `[~]` Partial

## Core Discovery

- `[x]` Discover auto-config classes from `AutoConfiguration.imports` in sources.
- `[x]` Discover auto-config classes from dependency jars listed in `resolved-artifacts.json`.
- `[x]` Read `spring-autoconfigure-metadata.properties` from sources and jars.
- `[x]` Read `spring-configuration-metadata.json` from sources and jars.

## Java Parsing (tree-sitter + fallback)

- `[x]` Parse class-level conditional annotations (`@ConditionalOn...`).
- `[x]` Parse `@Bean` methods and their conditional annotations.
- `[x]` Support package-private `@Bean` methods.
- `[x]` Parse class annotations even when `method_declaration/class_declaration` has no `modifiers` field.

## Imports and Nested Configurations

- `[x]` Parse top-level `@Import(...)` entries.
- `[x]` Parse nested class annotations and collect nested conditions.
- `[x]` Parse nested class `@Import(...)` entries and include them in `imports`.
- `[x]` Store nested details in `nested_configurations`.
- `[~]` Resolve imported refs to FQCN across all modules/jars.
- `[~]` Build recursive import graph (`recursive_imports`) when refs are resolvable.

## Ordering

- `[x]` Parse `@AutoConfigureBefore` into `order.before`.
- `[x]` Parse `@AutoConfigureAfter` into `order.after`.
- `[x]` Parse `@AutoConfigureOrder` into `order.auto_configure_order`.
- `[x]` Parse `@AutoConfiguration(before/after/beforeName/afterName)` into `order.before/order.after`.
- `[ ]` Compute global effective topological order for all auto-configurations.

## Properties and Gates

- `[x]` Capture `OnProperty` from parsed annotations.
- `[x]` Capture nested `OnProperty` and surface with `scope=nested-class`.
- `[~]` Link `@EnableConfigurationProperties` source types to properties reliably in all cases (short name vs FQCN mismatch remains).
- `[ ]` Evaluate property gates against merged runtime config inside index build phase.

## Runtime Diagnosis Support

- `[x]` Index contains `class_conditions`, `bean_methods`, `imports`, `order`.
- `[x]` Runtime script can use index + app config files to answer activation questions.
- `[ ]` Full Spring condition emulation parity with `ConditionEvaluationReport`.

## Known Gaps (Priority)

1. Improve import reference resolution (short/simple names and nested class targets) to populate `recursive_imports` better.
2. Improve `EnableConfigurationProperties` mapping to fill `linked_properties` consistently.
3. Add optional global ordering calculation for deterministic startup sequence explanation.
4. Add parity tests against real Spring Boot condition outcomes.
