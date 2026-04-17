#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const indexPath = path.resolve(args.index ?? ".qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json");
  const configDir = args.configDir ? path.resolve(args.configDir) : null;

  if (!args.beanRegex && !args.returnTypeRegex) {
    throw new Error("Provide --bean-regex and/or --return-type-regex");
  }

  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  const runtime = await loadRuntimeProperties(configDir, args.activeProfiles ?? []);

  const result = diagnose({
    index,
    question: args.question ?? "",
    beanRegex: safeRegex(args.beanRegex),
    returnTypeRegex: safeRegex(args.returnTypeRegex),
    runtimeProps: runtime.properties,
    propertyName: args.propertyName
  });

  result.runtime_source = runtime.loadedFrom;
  result.active_profiles = runtime.activeProfilesResolved;

  console.log(JSON.stringify(result, null, 2));
}

function diagnose({ index, question, beanRegex, returnTypeRegex, runtimeProps, propertyName }) {
  const allConfigs = index.autoconfigurations ?? [];
  const trace = [];

  trace.push(`Loaded index with ${allConfigs.length} autoconfigurations.`);
  trace.push(`Runtime properties available: ${Object.keys(runtimeProps).length}.`);

  const methodCandidates = [];
  for (const cfg of allConfigs) {
    for (const bean of cfg.bean_methods ?? []) {
      const beanMatch = beanRegex ? beanRegex.test(bean.bean_name ?? "") : false;
      const typeMatch = returnTypeRegex ? returnTypeRegex.test(bean.return_type ?? "") : false;
      if (beanMatch || typeMatch) {
        methodCandidates.push({ cfg, bean });
      }
    }
  }

  const distinctConfigs = dedupBy(methodCandidates.map((m) => m.cfg), (cfg) => cfg.fqcn);
  trace.push(`Discovery by bean/type found ${methodCandidates.length} candidate bean methods.`);

  const propertyStates = [];
  for (const cfg of distinctConfigs) {
    const onProps = (cfg.class_conditions ?? []).filter((c) => c.kind === "OnProperty");
    if (onProps.length === 0) {
      propertyStates.push({ fqcn: cfg.fqcn, status: "pass", details: [] });
      continue;
    }

    let blocked = false;
    const details = [];
    for (const cond of onProps) {
      const evalResult = evaluateOnPropertyCondition(cond.inputs ?? {}, runtimeProps);
      details.push(evalResult.detail);
      if (!evalResult.pass) blocked = true;
    }

    propertyStates.push({ fqcn: cfg.fqcn, status: blocked ? "blocked" : "pass", details });
  }

  const passCandidates = propertyStates.filter((x) => x.status === "pass").map((x) => x.fqcn);

  let verdict = "insufficient_data";
  if (methodCandidates.length === 0) {
    verdict = "likely_no";
  } else if (propertyStates.length > 0 && passCandidates.length === 0) {
    verdict = "likely_no";
  } else {
    verdict = "likely_yes";
  }

  return {
    question,
    verdict,
    candidate_autoconfigurations: distinctConfigs.map((c) => c.fqcn),
    candidate_beans: methodCandidates.map((m) => `${m.cfg.fqcn}#${m.bean.bean_name}:${m.bean.return_type}`),
    property_name: propertyName ?? null,
    property_gate_status: propertyStates,
    trace
  };
}

async function loadRuntimeProperties(configDir, explicitProfiles) {
  if (!configDir) {
    return { properties: {}, loadedFrom: null, activeProfilesResolved: explicitProfiles };
  }

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
  for (const name of candidates) {
    const abs = path.join(configDir, name);
    const profileFromName = extractProfileFromFilename(name);
    const text = await fs.readFile(abs, "utf8");

    if (name.endsWith(".properties")) {
      allDocs.push({ source: name, requiredProfiles: profileFromName ? [profileFromName] : [], props: parsePropertiesText(text) });
      continue;
    }

    for (const doc of splitYamlDocs(text)) {
      const props = parseSimpleYamlDoc(doc);
      allDocs.push({ source: name, requiredProfiles: profileFromName ? [profileFromName] : extractDocProfiles(props), props });
    }
  }

  const baseProps = {};
  for (const doc of allDocs) {
    if (doc.requiredProfiles.length === 0) mergeProps(baseProps, doc.props);
  }

  const inferredActive = parseProfilesValue(baseProps["spring.profiles.active"]);
  const initialActive = explicitProfiles.length > 0 ? explicitProfiles : inferredActive;
  const groupMap = buildProfileGroupMap(baseProps);
  const activeProfilesResolved = expandProfiles(initialActive, groupMap);
  const activeSet = new Set(activeProfilesResolved);

  const merged = {};
  const loaded = [];
  for (const doc of allDocs) {
    if (doc.requiredProfiles.length > 0 && !doc.requiredProfiles.some((p) => activeSet.has(p))) continue;
    mergeProps(merged, doc.props);
    loaded.push(doc.source);
  }

  return {
    properties: merged,
    loadedFrom: `${configDir} [${dedupBy(loaded, (x) => x).join(", ")}]`,
    activeProfilesResolved
  };
}

function evaluateOnPropertyCondition(inputs, runtimeProps) {
  const names = toArray(inputs.name ?? inputs.value ?? []);
  if (names.length === 0) return { pass: true, detail: "no property names in condition" };

  const havingValueRaw = Object.hasOwn(inputs, "havingValue") ? `${inputs.havingValue}` : null;
  const matchIfMissing = parseBoolean(inputs.matchIfMissing, false);

  for (const name of names) {
    if (!Object.hasOwn(runtimeProps, name)) {
      if (matchIfMissing) continue;
      return { pass: false, detail: `${name} missing and matchIfMissing=false` };
    }

    const actual = `${runtimeProps[name]}`;
    if (havingValueRaw !== null) {
      if (actual !== havingValueRaw) {
        return { pass: false, detail: `${name}=${actual}, expected ${havingValueRaw}` };
      }
      continue;
    }

    if (actual.toLowerCase() === "false") {
      return { pass: false, detail: `${name}=false (default OnProperty semantics)` };
    }
  }

  return { pass: true, detail: `matched ${names.join(",")}` };
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
    out[line.slice(0, idx).trim()] = stripQuotes(line.slice(idx + 1).trim());
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
        if (!Array.isArray(out[parent.fullKey])) out[parent.fullKey] = [];
        out[parent.fullKey].push(item);
      }
      continue;
    }

    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const valueRaw = trimmed.slice(idx + 1).trim();

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();

    const fullKey = [...stack.map((s) => s.key), key].join(".");
    if (!valueRaw) {
      stack.push({ key, indent, fullKey });
      continue;
    }

    if (valueRaw.startsWith("[") && valueRaw.endsWith("]")) {
      out[fullKey] = valueRaw.slice(1, -1).split(",").map((s) => stripQuotes(s.trim())).filter(Boolean);
    } else {
      out[fullKey] = stripQuotes(valueRaw);
    }
  }
  return out;
}

function extractDocProfiles(props) {
  for (const key of ["spring.config.activate.on-profile", "spring.profiles"]) {
    if (Object.hasOwn(props, key)) return parseProfilesValue(props[key]);
  }
  return [];
}

function parseProfilesValue(value) {
  if (Array.isArray(value)) return value.map((v) => `${v}`.trim()).filter(Boolean);
  if (value === null || typeof value === "undefined") return [];
  return `${value}`.split(",").map((s) => s.trim()).filter(Boolean);
}

function buildProfileGroupMap(props) {
  const map = {};
  for (const [key, value] of Object.entries(props)) {
    if (!key.startsWith("spring.profiles.group.")) continue;
    const group = key.slice("spring.profiles.group.".length);
    const members = parseProfilesValue(value);
    if (members.length > 0) map[group] = members;
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
    for (const m of groupMap[profile] ?? []) if (!resolved.has(m)) queue.push(m);
  }
  return [...resolved];
}

function mergeProps(target, source) {
  for (const [k, v] of Object.entries(source)) target[k] = v;
}

function extractProfileFromFilename(name) {
  const m = name.match(/^application-([A-Za-z0-9_-]+)\.(?:properties|ya?ml)$/i);
  return m ? m[1] : null;
}

function stripQuotes(value) {
  const v = `${value}`.trim();
  if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function parseBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((v) => `${v}`);
  if (value === null || typeof value === "undefined") return [];
  return [`${value}`];
}

function dedupBy(items, keyFn) {
  const m = new Map();
  for (const item of items) m.set(keyFn(item), item);
  return [...m.values()];
}

function safeRegex(raw) {
  if (!raw) return null;
  try { return new RegExp(raw, "i"); } catch { return null; }
}

function parseArgs(argv) {
  const args = { activeProfiles: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === "--index") { args.index = n; i += 1; }
    else if (a === "--question") { args.question = n; i += 1; }
    else if (a === "--bean-regex") { args.beanRegex = n; i += 1; }
    else if (a === "--return-type-regex") { args.returnTypeRegex = n; i += 1; }
    else if (a === "--property-name") { args.propertyName = n; i += 1; }
    else if (a === "--config-dir") { args.configDir = n; i += 1; }
    else if (a === "--active-profile") { args.activeProfiles.push(n); i += 1; }
  }
  return args;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
