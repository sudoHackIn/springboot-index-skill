#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const indexPath = path.resolve(args.index ?? "skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/indexes/skill_eval_fixture_index.json");
  const casesPath = path.resolve(args.cases ?? "skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/cases/skill_eval_cases.json");

  const model = args.model ?? "unknown-model";
  const runDate = args.runDate ?? new Date().toISOString().slice(0, 10);
  const runId = args.runId ?? buildRunId(indexPath, casesPath);
  const skillPath = path.resolve(args.skill ?? "skills/spring-index/spring-autoconfig-index-lookup/SKILL.md");
  const skillVersion = await readSkillVersion(skillPath);

  const defaultRunDir = path.resolve(`skills/spring-index/spring-autoconfig-index-lookup/.eval/runs/${runDate}/${sanitizeSegment(model)}/${sanitizeSegment(runId)}`);
  const runDir = path.resolve(args.runDir ?? defaultRunDir);

  const outPath = path.resolve(args.out ?? path.join(runDir, "report.md"));
  const metadataPath = path.resolve(args.metaOut ?? path.join(runDir, "meta.json"));

  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  const cases = JSON.parse(await fs.readFile(casesPath, "utf8"));

  const results = [];
  for (const testCase of cases) {
    results.push(await evaluateCase(index, testCase, path.dirname(casesPath)));
  }

  const passed = results.filter((r) => r.pass).length;

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const report = renderReport({ indexPath, casesPath, outPath, results, passed, total: results.length, model, runDate, runId, metadataPath, skillPath, skillVersion });
  await fs.writeFile(outPath, report, "utf8");

  const metadata = {
    generated_at: new Date().toISOString(),
    model,
    skill_path: skillPath,
    skill_version: skillVersion,
    run_date: runDate,
    run_id: runId,
    index_path: indexPath,
    cases_path: casesPath,
    report_path: outPath,
    total: results.length,
    passed,
    failed: results.length - passed
  };
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");

  console.log(`Evaluation complete: ${outPath}`);
  console.log(`metadata: ${metadataPath}`);
  console.log(`passed=${passed}`);
  console.log(`total=${results.length}`);
}

async function evaluateCase(index, testCase, casesDir) {
  const trace = [];
  const allConfigs = index.autoconfigurations ?? [];

  trace.push(`Loaded index with ${allConfigs.length} autoconfigurations.`);

  const beanRegex = safeRegex(testCase.bean_name_regex);
  const returnTypeRegex = safeRegex(testCase.return_type_regex);
  const expectedCfgRegex = safeRegex(testCase.expected_autoconfig_regex);

  const runtimeLoad = await loadRuntimeProperties(testCase, casesDir);
  const runtimeProps = { ...(runtimeLoad.properties || {}), ...(testCase.runtime_properties ?? {}) };
  if (runtimeLoad.loadedFrom) {
    trace.push(`Loaded runtime properties from ${runtimeLoad.loadedFrom}.`);
  }
  if ((runtimeLoad.activeProfilesResolved ?? []).length > 0) {
    trace.push(`Active profiles (resolved): ${runtimeLoad.activeProfilesResolved.join(", ")}.`);
  }
  trace.push(`Runtime properties available: ${Object.keys(runtimeProps).length}.`);

  const methodCandidates = [];
  for (const cfg of allConfigs) {
    for (const bean of cfg.bean_methods ?? []) {
      const beanMatch = beanRegex ? beanRegex.test(bean.bean_name ?? "") : false;
      const typeMatch = returnTypeRegex ? returnTypeRegex.test(bean.return_type ?? "") : false;
      if (!beanRegex && !returnTypeRegex) {
        continue;
      }
      if (beanMatch || typeMatch) {
        methodCandidates.push({ cfg, bean, beanMatch, typeMatch });
      }
    }
  }

  trace.push(`Discovery by bean/type found ${methodCandidates.length} candidate bean methods.`);

  const distinctConfigs = dedupBy(methodCandidates.map((m) => m.cfg), (cfg) => cfg.fqcn);
  if (distinctConfigs.length > 0) {
    trace.push(`Distinct candidate autoconfigurations: ${distinctConfigs.map((c) => c.fqcn).join(", ")}`);
  }

  const propertyName = testCase.property_name;
  let propertyRelatedConfigs = [];
  if (propertyName) {
    propertyRelatedConfigs = allConfigs.filter((cfg) =>
      (cfg.linked_properties ?? []).some((p) => p.name === propertyName)
      || (cfg.class_conditions ?? []).some((c) => c.kind === "OnProperty" && containsProperty(c.inputs, propertyName))
    );
    trace.push(`Property check '${propertyName}' matched ${propertyRelatedConfigs.length} autoconfigurations.`);
  }

  const blockingSignals = [];
  for (const candidate of methodCandidates) {
    const negated = (candidate.bean.conditions ?? []).filter((c) => c.negated);
    if (negated.length > 0) {
      blockingSignals.push({
        fqcn: candidate.cfg.fqcn,
        bean: candidate.bean.bean_name,
        conditions: negated.map((c) => c.kind)
      });
    }
  }
  trace.push(`Blocking/override signals found: ${blockingSignals.length}.`);

  const candidatePropertyState = [];
  for (const cfg of distinctConfigs) {
    const onProps = (cfg.class_conditions ?? []).filter((c) => c.kind === "OnProperty");
    if (onProps.length === 0) {
      candidatePropertyState.push({ fqcn: cfg.fqcn, status: "pass", details: [] });
      continue;
    }

    const details = [];
    let blocked = false;
    for (const cond of onProps) {
      const evalResult = evaluateOnPropertyCondition(cond.inputs ?? {}, runtimeProps);
      details.push(evalResult.detail);
      if (!evalResult.pass) {
        blocked = true;
      }
    }

    candidatePropertyState.push({
      fqcn: cfg.fqcn,
      status: blocked ? "blocked" : "pass",
      details
    });
  }

  for (const state of candidatePropertyState) {
    if (state.status === "blocked") {
      trace.push(`Property gate blocked ${state.fqcn}: ${state.details.join("; ")}`);
    }
  }

  const passCandidates = candidatePropertyState
    .filter((s) => s.status === "pass")
    .map((s) => s.fqcn);

  let verdict = "insufficient_data";
  if (methodCandidates.length === 0) {
    verdict = "likely_no";
  } else if (candidatePropertyState.length > 0 && passCandidates.length === 0) {
    verdict = "likely_no";
  } else {
    verdict = "likely_yes";
  }

  const expectedVerdict = testCase.expected_verdict;
  const expectedCfgHit = expectedCfgRegex
    ? distinctConfigs.some((cfg) => expectedCfgRegex.test(cfg.fqcn))
    : true;

  const pass = verdict === expectedVerdict && expectedCfgHit;

  return {
    id: testCase.id,
    question: testCase.question,
    expected_verdict: expectedVerdict,
    actual_verdict: verdict,
    expected_autoconfig_regex: testCase.expected_autoconfig_regex ?? null,
    expected_autoconfig_found: expectedCfgHit,
    runtime_source: runtimeLoad.loadedFrom ?? null,
    runtime_properties_count: Object.keys(runtimeProps).length,
    active_profiles: runtimeLoad.activeProfilesResolved ?? testCase.active_profiles ?? [],
    candidate_autoconfigurations: distinctConfigs.map((cfg) => cfg.fqcn),
    candidate_beans: methodCandidates.map((m) => `${m.cfg.fqcn}#${m.bean.bean_name}:${m.bean.return_type}`),
    linked_properties: propertyName
      ? dedupBy(
        propertyRelatedConfigs.flatMap((cfg) => (cfg.linked_properties ?? []).map((p) => p.name)),
        (p) => p
      )
      : [],
    blocking_signals: blockingSignals,
    property_gate_status: candidatePropertyState,
    trace,
    pass
  };
}

function evaluateOnPropertyCondition(inputs, runtimeProps) {
  const names = toArray(inputs.name ?? inputs.value ?? []);
  if (names.length === 0) {
    return { pass: true, detail: "no property names in condition" };
  }

  const havingValueRaw = Object.hasOwn(inputs, "havingValue") ? `${inputs.havingValue}` : null;
  const matchIfMissing = parseBoolean(inputs.matchIfMissing, false);

  for (const name of names) {
    if (!Object.hasOwn(runtimeProps, name)) {
      if (matchIfMissing) {
        continue;
      }
      return {
        pass: false,
        detail: `${name} missing and matchIfMissing=false`
      };
    }

    const actual = `${runtimeProps[name]}`;
    if (havingValueRaw !== null) {
      if (actual !== havingValueRaw) {
        return {
          pass: false,
          detail: `${name}=${actual}, expected ${havingValueRaw}`
        };
      }
      continue;
    }

    if (actual.toLowerCase() === "false") {
      return {
        pass: false,
        detail: `${name}=false (default OnProperty semantics)`
      };
    }
  }

  return { pass: true, detail: `matched ${names.join(",")}` };
}

async function loadRuntimeProperties(testCase, casesDir) {
  if (!testCase.config_dir) {
    return { properties: {}, loadedFrom: null, activeProfilesResolved: [] };
  }

  const directConfigDir = path.resolve(casesDir, testCase.config_dir);
  const siblingConfigDir = path.resolve(path.dirname(casesDir), testCase.config_dir);
  const configDir = await pathExists(directConfigDir) ? directConfigDir : siblingConfigDir;
  const explicitActiveProfiles = (testCase.active_profiles ?? []).map((p) => `${p}`.trim()).filter(Boolean);

  const files = await fs.readdir(configDir, { withFileTypes: true });
  const candidates = files
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => /^application(?:-[A-Za-z0-9_-]+)?\.(properties|ya?ml)$/i.test(name))
    .sort((a, b) => {
      const pa = extractProfileFromFilename(a) ? 1 : 0;
      const pb = extractProfileFromFilename(b) ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });

  const allDocs = [];
  const loadedFiles = [];

  for (const name of candidates) {
    const abs = path.join(configDir, name);
    const profileFromName = extractProfileFromFilename(name);
    const text = await fs.readFile(abs, "utf8");

    if (name.endsWith(".properties")) {
      const props = parsePropertiesText(text);
      allDocs.push({
        source: name,
        requiredProfiles: profileFromName ? [profileFromName] : [],
        props
      });
      loadedFiles.push(name);
      continue;
    }

    const docs = splitYamlDocs(text);
    for (const doc of docs) {
      const props = parseSimpleYamlDoc(doc);
      const docProfiles = extractDocProfiles(props);
      allDocs.push({
        source: name,
        requiredProfiles: profileFromName ? [profileFromName] : docProfiles,
        props
      });
    }
    loadedFiles.push(name);
  }

  const baseProps = {};
  for (const doc of allDocs) {
    if (doc.requiredProfiles.length === 0) {
      mergeProps(baseProps, doc.props);
    }
  }

  const inferredActiveFromProps = parseProfilesValue(baseProps["spring.profiles.active"]);
  const initialActive = explicitActiveProfiles.length > 0 ? explicitActiveProfiles : inferredActiveFromProps;
  const groupMap = buildProfileGroupMap(baseProps);
  const resolvedActiveProfiles = expandProfiles(initialActive, groupMap);
  const activeSet = new Set(resolvedActiveProfiles);

  const merged = {};
  const loaded = [];
  for (const doc of allDocs) {
    if (doc.requiredProfiles.length > 0 && !doc.requiredProfiles.some((p) => activeSet.has(p))) {
      continue;
    }
    mergeProps(merged, doc.props);
    loaded.push(doc.source);
  }

  return {
    properties: merged,
    loadedFrom: `${configDir} [${dedupBy(loaded, (x) => x).join(", ")}]`,
    activeProfilesResolved: resolvedActiveProfiles
  };
}

function parsePropertiesText(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const idxEq = line.indexOf("=");
    const idxColon = line.indexOf(":");
    const idx = idxEq >= 0 && idxColon >= 0 ? Math.min(idxEq, idxColon) : Math.max(idxEq, idxColon);
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = stripQuotes(value);
  }
  return out;
}

function splitYamlDocs(text) {
  return text.split(/^---\s*$/m).map((d) => d.trim()).filter(Boolean);
}

function parseSimpleYamlDoc(docText) {
  const out = {};
  const stack = [];

  for (const rawLine of docText.split(/\r?\n/)) {
    const noComment = rawLine.replace(/\s+#.*$/, "");
    if (!noComment.trim()) continue;
    const indent = noComment.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = noComment.trim();
    if (trimmed.startsWith("- ")) {
      const item = stripQuotes(trimmed.slice(2).trim());
      const parent = stack[stack.length - 1];
      if (parent?.fullKey) {
        if (!Array.isArray(out[parent.fullKey])) {
          out[parent.fullKey] = [];
        }
        out[parent.fullKey].push(item);
      }
      continue;
    }

    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    const valueRaw = trimmed.slice(idx + 1).trim();

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const pathSegs = [...stack.map((s) => s.key), key];
    const fullKey = pathSegs.join(".");

    if (!valueRaw) {
      stack.push({ key, indent, fullKey });
      continue;
    }

    if (valueRaw.startsWith("[") && valueRaw.endsWith("]")) {
      out[fullKey] = valueRaw
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
    } else {
      out[fullKey] = stripQuotes(valueRaw);
    }
  }

  return out;
}

function extractDocProfiles(props) {
  const keys = [
    "spring.config.activate.on-profile",
    "spring.profiles"
  ];

  for (const key of keys) {
    if (!Object.hasOwn(props, key)) continue;
    return parseProfilesValue(props[key]);
  }

  return [];
}

function parseProfilesValue(value) {
  if (Array.isArray(value)) {
    return value.map((v) => `${v}`.trim()).filter(Boolean);
  }
  if (value === null || typeof value === "undefined") {
    return [];
  }
  return `${value}`
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildProfileGroupMap(props) {
  const map = {};
  for (const [key, value] of Object.entries(props)) {
    if (!key.startsWith("spring.profiles.group.")) continue;
    const group = key.slice("spring.profiles.group.".length);
    const members = parseProfilesValue(value);
    if (members.length > 0) {
      map[group] = members;
    }
  }
  return map;
}

function expandProfiles(initial, groupMap) {
  const resolved = new Set();
  const queue = [...initial];
  while (queue.length > 0) {
    const profile = queue.shift();
    if (!profile || resolved.has(profile)) continue;
    resolved.add(profile);
    for (const member of groupMap[profile] ?? []) {
      if (!resolved.has(member)) {
        queue.push(member);
      }
    }
  }
  return [...resolved];
}

function mergeProps(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = value;
  }
}

function extractProfileFromFilename(name) {
  const m = name.match(/^application-([A-Za-z0-9_-]+)\.(?:properties|ya?ml)$/i);
  return m ? m[1] : null;
}

function stripQuotes(value) {
  const v = `${value}`.trim();
  if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function renderReport({ indexPath, casesPath, outPath, results, passed, total, model, runDate, runId, metadataPath, skillPath, skillVersion }) {
  const lines = [];
  lines.push("# Spring Autoconfig Skill Evaluation Report");
  lines.push("");
  lines.push(`- Model: ${model}`);
  lines.push(`- Skill: ${skillPath}`);
  lines.push(`- Skill version: ${skillVersion}`);
  lines.push(`- Run date: ${runDate}`);
  lines.push(`- Run id: ${runId}`);
  lines.push(`- Index: ${indexPath}`);
  lines.push(`- Cases: ${casesPath}`);
  lines.push(`- Report: ${outPath}`);
  lines.push(`- Metadata: ${metadataPath}`);
  lines.push(`- Passed: ${passed}/${total}`);
  lines.push("");
  lines.push("## Per-case results");
  lines.push("");

  for (const r of results) {
    lines.push(`### ${r.id}`);
    lines.push(`- question: ${r.question}`);
    lines.push(`- expected_verdict: ${r.expected_verdict}`);
    lines.push(`- actual_verdict: ${r.actual_verdict}`);
    lines.push(`- expected_autoconfig_found: ${r.expected_autoconfig_found}`);
    lines.push(`- pass: ${r.pass ? "yes" : "no"}`);
    lines.push(`- runtime_source: ${r.runtime_source ?? "(none)"}`);
    lines.push(`- active_profiles: ${r.active_profiles.length ? r.active_profiles.join(", ") : "(none)"}`);
    lines.push(`- runtime_properties_count: ${r.runtime_properties_count}`);
    lines.push(`- candidate_autoconfigurations: ${r.candidate_autoconfigurations.length ? r.candidate_autoconfigurations.join(", ") : "(none)"}`);
    lines.push(`- candidate_beans: ${r.candidate_beans.length ? r.candidate_beans.join(", ") : "(none)"}`);
    lines.push(`- linked_properties: ${r.linked_properties.length ? r.linked_properties.join(", ") : "(none)"}`);
    if (r.property_gate_status.length > 0) {
      lines.push("- property_gate_status:");
      for (const p of r.property_gate_status) {
        lines.push(`  - ${p.fqcn}: ${p.status} (${p.details.join("; ")})`);
      }
    }
    lines.push("- trace:");
    for (const step of r.trace) {
      lines.push(`  - ${step}`);
    }
    if (r.blocking_signals.length > 0) {
      lines.push("- blocking_signals:");
      for (const b of r.blocking_signals) {
        lines.push(`  - ${b.fqcn}#${b.bean}: ${b.conditions.join(", ")}`);
      }
    }
    lines.push("");
  }

  lines.push("## Notes");
  lines.push("- This report includes external diagnostic trace only (queries, matches, rule outcomes).");
  lines.push("- It does not include hidden internal reasoning.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function buildRunId(indexPath, casesPath) {
  const i = path.basename(indexPath).replace(/\.[^.]+$/, "");
  const c = path.basename(casesPath).replace(/\.[^.]+$/, "");
  return `${c}__${i}`;
}

function sanitizeSegment(value) {
  return `${value}`.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

function containsProperty(inputs, propertyName) {
  for (const value of Object.values(inputs ?? {})) {
    if (typeof value === "string" && value === propertyName) {
      return true;
    }
    if (Array.isArray(value) && value.some((v) => `${v}` === propertyName)) {
      return true;
    }
  }
  return false;
}

function parseBoolean(value, defaultValue) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return defaultValue;
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((v) => `${v}`);
  if (value === null || typeof value === "undefined") return [];
  return [`${value}`];
}

function dedupBy(items, keyFn) {
  const m = new Map();
  for (const item of items) {
    m.set(keyFn(item), item);
  }
  return [...m.values()];
}

function safeRegex(raw) {
  if (!raw) return null;
  try {
    return new RegExp(raw, "i");
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === "--index") {
      args.index = n;
      i += 1;
    } else if (a === "--cases") {
      args.cases = n;
      i += 1;
    } else if (a === "--out") {
      args.out = n;
      i += 1;
    } else if (a === "--model") {
      args.model = n;
      i += 1;
    } else if (a === "--run-date") {
      args.runDate = n;
      i += 1;
    } else if (a === "--run-id") {
      args.runId = n;
      i += 1;
    } else if (a === "--run-dir") {
      args.runDir = n;
      i += 1;
    } else if (a === "--meta-out") {
      args.metaOut = n;
      i += 1;
    } else if (a === "--skill") {
      args.skill = n;
      i += 1;
    }
  }
  return args;
}

async function readSkillVersion(skillPath) {
  if (!(await pathExists(skillPath))) {
    return "unknown";
  }
  const text = await fs.readFile(skillPath, "utf8");
  const m = text.match(/\bskill_version:\s*([0-9A-Za-z._-]+)/i);
  return m ? m[1] : "unknown";
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
