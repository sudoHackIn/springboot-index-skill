#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const indexPath = path.resolve(args.index ?? ".qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json");
  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));

  if (!args.beanRegex && !args.returnTypeRegex && !args.question) {
    throw new Error("Provide --bean-regex and/or --return-type-regex or --question");
  }

  const runtime = await loadRuntimeProperties(
    args.configDir ? path.resolve(args.configDir) : null,
    args.activeProfiles ?? [],
    args.runtimeProps ?? {}
  );

  const resolvedQuery = resolveQuery({
    question: args.question ?? "",
    beanRegex: args.beanRegex,
    returnTypeRegex: args.returnTypeRegex,
    index
  });

  const result = diagnose({
    index,
    query: resolvedQuery,
    question: args.question ?? "",
    runtimeProps: runtime.properties,
    propertyName: args.propertyName ?? null,
    strictPropertyMissing: runtime.hasExplicitContext
  });

  result.runtime_source = runtime.loadedFrom;
  result.active_profiles = runtime.activeProfilesResolved;

  const output = args.debug ? result : compactResult(result);
  console.log(JSON.stringify(output, null, 2));
}

function diagnose({ index, query, question, runtimeProps, propertyName, strictPropertyMissing }) {
  const trace = [];
  const allConfigs = index.autoconfigurations ?? [];

  trace.push(`Loaded index with ${allConfigs.length} autoconfigurations.`);
  trace.push(`Runtime properties available: ${Object.keys(runtimeProps).length}.`);

  const beanRegex = safeRegex(query.bean_regex);
  const returnTypeRegex = safeRegex(query.return_type_regex);

  const candidateEntries = [];
  for (const cfg of allConfigs) {
    const matchedBeans = [];
    for (const bean of cfg.bean_methods ?? []) {
      const beanName = bean.bean_name ?? "";
      const returnType = bean.return_type ?? "";
      const beanMatch = beanRegex ? beanRegex.test(beanName) : false;
      const typeMatch = returnTypeRegex ? returnTypeRegex.test(returnType) : false;
      if (beanMatch || typeMatch) {
        matchedBeans.push({
          bean_name: beanName,
          return_type: returnType,
          matched_by: {
            bean_name_regex: beanMatch,
            return_type_regex: typeMatch
          },
          conditions: bean.conditions ?? []
        });
      }
    }
    if (matchedBeans.length === 0) continue;

    const classEval = evaluateConditions(cfg.class_conditions ?? [], runtimeProps, strictPropertyMissing);
    const beanEval = matchedBeans.map((bean) => ({
      bean_name: bean.bean_name,
      result: evaluateConditions(bean.conditions ?? [], runtimeProps, strictPropertyMissing)
    }));

    const beanBlocked = beanEval.some((b) => b.result.blocking.length > 0);
    const classBlocked = classEval.blocking.length > 0;

    candidateEntries.push({
      fqcn: cfg.fqcn,
      artifact: cfg.artifact ?? null,
      order: cfg.order ?? {},
      effective_order_index: cfg.effective_order_index ?? null,
      imports: cfg.imports ?? [],
      raw_class_conditions: cfg.class_conditions ?? [],
      matched_beans: matchedBeans,
      class_conditions: classEval,
      bean_conditions: beanEval,
      status: classBlocked || beanBlocked ? "blocked" : "pass"
    });
  }

  trace.push(`Discovery found ${candidateEntries.length} candidate autoconfigurations.`);

  const byFqcn = new Map(candidateEntries.map((x) => [x.fqcn, x]));
  const effectiveOrder = computeEffectiveOrder(candidateEntries, byFqcn);
  const orderIndex = new Map(effectiveOrder.ordered.map((fqcn, idx) => [fqcn, idx]));

  const predictedSources = predictWinners(candidateEntries, orderIndex);
  const anyWinner = predictedSources.some((x) => x.winner_autoconfiguration);
  const focus = buildFocus(candidateEntries, question, propertyName);
  const focusedWinner = focus.focused_candidates.some((x) => x.status === "pass");

  let overallVerdict = "insufficient_data";
  if (candidateEntries.length === 0) {
    overallVerdict = "likely_no";
  } else if (anyWinner) {
    overallVerdict = "likely_yes";
  } else {
    overallVerdict = "likely_no";
  }
  const focusedVerdict = focus.focused_candidates.length > 0 ? (focusedWinner ? "likely_yes" : "likely_no") : null;
  const verdict = focusedVerdict ?? overallVerdict;

  if (propertyName) {
    trace.push(`Property of interest: ${propertyName}.`);
    if (Object.hasOwn(runtimeProps, propertyName)) {
      trace.push(`Runtime property ${propertyName}=${runtimeProps[propertyName]}.`);
    } else {
      trace.push(`Runtime property ${propertyName} is not set.`);
    }
  }

  return {
    question,
    query,
    verdict,
    overall_verdict: overallVerdict,
    focused_verdict: focusedVerdict,
    focus,
    candidates: candidateEntries,
    predicted_sources: predictedSources,
    ordering: effectiveOrder,
    trace
  };
}

function evaluateConditions(conditions, runtimeProps, strictPropertyMissing) {
  const checks = [];
  const blocking = [];

  for (const cond of conditions) {
    const kind = cond.kind ?? "Unknown";

    if (kind === "OnProperty") {
      const evalResult = evaluateOnPropertyCondition(cond.inputs ?? {}, runtimeProps, strictPropertyMissing);
      const check = { kind, pass: evalResult.pass, detail: evalResult.detail };
      checks.push(check);
      if (!evalResult.pass) blocking.push(`${kind}: ${evalResult.detail}`);
      continue;
    }

    if (kind === "OnMissingBean") {
      checks.push({
        kind,
        pass: true,
        detail: "requires runtime bean registry; treated as unresolved (not blocking in static mode)"
      });
      continue;
    }

    if (kind === "OnClass") {
      checks.push({
        kind,
        pass: true,
        detail: "requires runtime classpath; treated as unresolved (not blocking in static mode)"
      });
      continue;
    }

    checks.push({
      kind,
      pass: true,
      detail: "condition kind is not statically evaluated"
    });
  }

  return { checks, blocking };
}

function evaluateOnPropertyCondition(inputs, runtimeProps, strictPropertyMissing) {
  const names = toArray(inputs.name ?? inputs.value ?? []);
  if (names.length === 0) return { pass: true, detail: "no property names in condition" };

  const havingValueRaw = Object.hasOwn(inputs, "havingValue") ? `${inputs.havingValue}` : null;
  const matchIfMissing = parseBoolean(inputs.matchIfMissing, false);

  for (const name of names) {
    if (!Object.hasOwn(runtimeProps, name)) {
      if (matchIfMissing) continue;
      if (!strictPropertyMissing) {
        return { pass: true, detail: `${name} missing, static context only (treated as unknown)` };
      }
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

function computeEffectiveOrder(candidates, byFqcn) {
  const nodes = candidates.map((c) => c.fqcn);
  const inDegree = new Map(nodes.map((n) => [n, 0]));
  const out = new Map(nodes.map((n) => [n, new Set()]));

  for (const cfg of candidates) {
    const fqcn = cfg.fqcn;
    const order = cfg.order ?? {};
    for (const dep of order.after ?? []) {
      if (!byFqcn.has(dep) || dep === fqcn) continue;
      if (!out.get(dep).has(fqcn)) {
        out.get(dep).add(fqcn);
        inDegree.set(fqcn, (inDegree.get(fqcn) ?? 0) + 1);
      }
    }
    for (const dep of order.before ?? []) {
      if (!byFqcn.has(dep) || dep === fqcn) continue;
      if (!out.get(fqcn).has(dep)) {
        out.get(fqcn).add(dep);
        inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
      }
    }
  }

  const queue = nodes.filter((n) => (inDegree.get(n) ?? 0) === 0);
  queue.sort((a, b) => compareNodes(byFqcn.get(a), byFqcn.get(b)));

  const ordered = [];
  while (queue.length > 0) {
    const node = queue.shift();
    ordered.push(node);
    for (const next of out.get(node) ?? []) {
      const v = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, v);
      if (v === 0) {
        queue.push(next);
        queue.sort((a, b) => compareNodes(byFqcn.get(a), byFqcn.get(b)));
      }
    }
  }

  const cyclic = nodes.filter((n) => !ordered.includes(n));
  return { ordered, cyclic_nodes: cyclic };
}

function compareNodes(a, b) {
  const ao = a?.order?.auto_configure_order;
  const bo = b?.order?.auto_configure_order;
  const an = ao === null || typeof ao === "undefined" ? Number.POSITIVE_INFINITY : Number(ao);
  const bn = bo === null || typeof bo === "undefined" ? Number.POSITIVE_INFINITY : Number(bo);
  if (an !== bn) return an - bn;
  return `${a?.fqcn ?? ""}`.localeCompare(`${b?.fqcn ?? ""}`);
}

function predictWinners(candidates, orderIndex) {
  const byBean = new Map();
  for (const cfg of candidates) {
    const isPass = cfg.status === "pass";
    for (const bean of cfg.matched_beans ?? []) {
      const name = bean.bean_name || "<unknown>";
      if (!byBean.has(name)) byBean.set(name, []);
      byBean.get(name).push({
        fqcn: cfg.fqcn,
        status: cfg.status,
        pass: isPass,
        order_index: orderIndex.has(cfg.fqcn) ? orderIndex.get(cfg.fqcn) : Number.MAX_SAFE_INTEGER
      });
    }
  }

  const out = [];
  for (const [beanName, contenders] of byBean.entries()) {
    contenders.sort((a, b) => a.order_index - b.order_index || a.fqcn.localeCompare(b.fqcn));
    const winner = contenders.find((c) => c.pass) ?? null;
    out.push({
      bean_name: beanName,
      winner_autoconfiguration: winner ? winner.fqcn : null,
      contenders
    });
  }
  out.sort((a, b) => a.bean_name.localeCompare(b.bean_name));
  return out;
}

function resolveQuery({ question, beanRegex, returnTypeRegex, index }) {
  if (beanRegex || returnTypeRegex) {
    return {
      bean_regex: beanRegex ?? null,
      return_type_regex: returnTypeRegex ?? null,
      inferred: false,
      inference_notes: []
    };
  }

  const q = `${question ?? ""}`.toLowerCase();
  const notes = [];
  const beanNames = collectBeanNames(index);

  const hits = beanNames
    .map((name) => ({ name, score: scoreNameMatch(q, name.toLowerCase()) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  if (hits.length === 0) {
    notes.push("No bean hints inferred from question.");
    return { bean_regex: null, return_type_regex: null, inferred: true, inference_notes: notes };
  }

  const picked = hits.slice(0, 3).map((h) => escapeRegex(h.name)).join("|");
  notes.push(`Inferred bean regex from question: ${picked}`);
  return {
    bean_regex: picked,
    return_type_regex: null,
    inferred: true,
    inference_notes: notes
  };
}

function collectBeanNames(index) {
  const set = new Set();
  for (const cfg of index.autoconfigurations ?? []) {
    for (const bean of cfg.bean_methods ?? []) {
      const name = `${bean.bean_name ?? ""}`.trim();
      if (name) set.add(name);
    }
  }
  return [...set];
}

function scoreNameMatch(questionLower, nameLower) {
  if (!questionLower || !nameLower) return 0;
  if (questionLower.includes(nameLower)) return 100 + nameLower.length;

  const strippedQ = questionLower.replace(/[^a-z0-9]/g, "");
  const strippedN = nameLower.replace(/[^a-z0-9]/g, "");
  if (strippedN && strippedQ.includes(strippedN)) return 80 + strippedN.length;

  const tokens = splitIdentifier(nameLower);
  let score = 0;
  for (const t of tokens) {
    if (t.length < 3) continue;
    if (questionLower.includes(t)) score += 10;
  }
  return score;
}

function splitIdentifier(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

async function loadRuntimeProperties(configDir, explicitProfiles, inlineRuntimeProps) {
  const hasInlineProps = Object.keys(inlineRuntimeProps).length > 0;
  const hasProfileContext = (explicitProfiles ?? []).length > 0;
  if (!configDir) {
    return {
      properties: { ...inlineRuntimeProps },
      loadedFrom: null,
      activeProfilesResolved: explicitProfiles,
      hasExplicitContext: hasInlineProps || hasProfileContext
    };
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
      allDocs.push({
        source: name,
        requiredProfiles: profileFromName ? [profileFromName] : [],
        props: parsePropertiesText(text)
      });
      continue;
    }

    for (const doc of splitYamlDocs(text)) {
      const props = parseSimpleYamlDoc(doc);
      allDocs.push({
        source: name,
        requiredProfiles: profileFromName ? [profileFromName] : extractDocProfiles(props),
        props
      });
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

  mergeProps(merged, inlineRuntimeProps);

  return {
    properties: merged,
    loadedFrom: `${configDir} [${dedupBy(loaded, (x) => x).join(", ")}]`,
    activeProfilesResolved,
    hasExplicitContext: true
  };
}

function buildFocus(candidates, question, propertyName) {
  const q = `${question ?? ""}`.toLowerCase();
  const wantsOverride = q.includes("override");
  const wantsStandard = q.includes("standard") || q.includes("стандарт");
  const wantsWithoutOverride = /без[^\\n]*override|without[^\\n]*override/.test(q);
  const wantsExternal = q.includes("внешн") || q.includes("external");

  const scored = candidates.map((cfg) => {
    const fqcnLower = `${cfg.fqcn}`.toLowerCase();
    let score = 0;
    const reasons = [];

    const onProps = (cfg.class_conditions?.checks ?? [])
      .filter((x) => x.kind === "OnProperty")
      .map((x) => `${x.detail}`);

    if (propertyName && hasPropertyReference(cfg, propertyName)) {
      score += 30;
      reasons.push("matches property_name");
    }
    if (wantsOverride && fqcnLower.includes("override")) {
      score += 25;
      reasons.push("question mentions override");
    }
    if (wantsExternal && !fqcnLower.includes("org.springframework.boot")) {
      score += 12;
      reasons.push("question hints external library");
    }
    if (wantsStandard && fqcnLower.includes("org.springframework.boot")) {
      score += 20;
      reasons.push("question hints standard/boot config");
    }
    if (wantsWithoutOverride) {
      if (fqcnLower.includes("override")) {
        score -= 30;
        reasons.push("question says without override");
      } else {
        score += 20;
        reasons.push("question says without override (prefer non-override)");
      }
    }

    for (const token of splitIdentifier(q).filter((x) => x.length >= 4)) {
      if (fqcnLower.includes(token)) {
        score += 2;
      }
    }

    return {
      fqcn: cfg.fqcn,
      status: cfg.status,
      score,
      reasons,
      on_property_checks: onProps
    };
  });

  const best = scored.reduce((m, x) => Math.max(m, x.score), 0);
  const focused = best > 0 ? scored.filter((x) => x.score === best) : [];
  return {
    best_score: best,
    focused_candidates: focused
  };
}

function hasPropertyReference(cfg, propertyName) {
  for (const cond of cfg.raw_class_conditions ?? []) {
    if ((cond.kind ?? "") !== "OnProperty") continue;
    const names = toArray(cond.inputs?.name ?? cond.inputs?.value ?? []);
    if (names.includes(propertyName)) return true;
  }
  for (const bean of cfg.matched_beans ?? []) {
    for (const cond of bean.conditions ?? []) {
      if ((cond.kind ?? "") !== "OnProperty") continue;
      const names = toArray(cond.inputs?.name ?? cond.inputs?.value ?? []);
      if (names.includes(propertyName)) return true;
    }
  }
  return false;
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
  for (const key of ["spring.config.activate.on-profile", "spring.profiles"]) {
    if (Object.hasOwn(props, key)) return parseProfilesValue(props[key]);
  }
  return [];
}

function parseProfilesValue(value) {
  if (Array.isArray(value)) return value.map((v) => `${v}`.trim()).filter(Boolean);
  if (value === null || typeof value === "undefined") return [];
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
    for (const m of groupMap[profile] ?? []) {
      if (!resolved.has(m)) queue.push(m);
    }
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
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
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
  try {
    return new RegExp(raw, "i");
  } catch {
    return null;
  }
}

function escapeRegex(value) {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const args = { activeProfiles: [], runtimeProps: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === "-h" || a === "--help") {
      args.help = true;
    } else if (a === "--debug") {
      args.debug = true;
    } else if (a === "--index") {
      args.index = n;
      i += 1;
    } else if (a === "--question") {
      args.question = n;
      i += 1;
    } else if (a === "--bean-regex") {
      args.beanRegex = n;
      i += 1;
    } else if (a === "--return-type-regex") {
      args.returnTypeRegex = n;
      i += 1;
    } else if (a === "--property-name") {
      args.propertyName = n;
      i += 1;
    } else if (a === "--config-dir") {
      args.configDir = n;
      i += 1;
    } else if (a === "--active-profile") {
      args.activeProfiles.push(n);
      i += 1;
    } else if (a === "--runtime-prop") {
      const [k, ...rest] = `${n ?? ""}`.split("=");
      if (k) args.runtimeProps[k] = rest.join("=");
      i += 1;
    }
  }
  return args;
}

function printUsage() {
  const usage = [
    "Usage:",
    "  node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs [options]",
    "",
    "Input selectors:",
    "  --bean-regex <regex>           Bean name pattern (case-insensitive)",
    "  --return-type-regex <regex>    Bean return type pattern (case-insensitive)",
    "  --question <text>              Optional question; can be used for bean inference",
    "",
    "Runtime context:",
    "  --config-dir <dir>             Directory with application*.properties|yaml|yml",
    "  --active-profile <profile>     Active profile (repeatable)",
    "  --runtime-prop <k=v>           Inline runtime property override (repeatable)",
    "",
    "Other:",
    "  --property-name <name>         Property of interest for trace",
    "  --index <path>                 Index JSON path",
    "                                 Default: .qwen/spring-autoconfig-index/spring_boot_autoconfig_index.json",
    "  --debug                        Print full detailed JSON (for troubleshooting)",
    "  -h, --help                     Show this help and exit",
    "",
    "Examples:",
    "  node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \\",
    "    --question \"Ожидается ли DataSource?\" \\",
    "    --bean-regex \"dataSource|datasource\" \\",
    "    --property-name \"spring.datasource.enabled\" \\",
    "    --config-dir ./src/main/resources",
    "",
    "  node skills/spring-index/spring-autoconfig-index-lookup/scripts/diagnose-autoconfig.mjs \\",
    "    --question \"Ожидается ли redisClient?\" \\",
    "    --index skills/spring-index/spring-autoconfig-index-lookup/.eval/scenarios/indexes/skill_eval_fixture_index.json \\",
    "    --runtime-prop acme.redis.enabled=true"
  ].join("\n");

  console.log(usage);
}

function compactResult(result) {
  const winner_summary = (result.predicted_sources ?? [])
    .map((x) => ({
      bean_name: x.bean_name,
      winner_autoconfiguration: x.winner_autoconfiguration
    }))
    .filter((x) => x.winner_autoconfiguration);

  return {
    question: result.question,
    query: result.query,
    verdict: result.verdict,
    overall_verdict: result.overall_verdict,
    focused_verdict: result.focused_verdict,
    focus: result.focus,
    winner_summary,
    trace: result.trace,
    runtime_source: result.runtime_source,
    active_profiles: result.active_profiles
  };
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
