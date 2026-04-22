#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Parser from "tree-sitter";
import Java from "tree-sitter-java";

const CONDITION_ANNOTATIONS = new Set([
  "ConditionalOnClass",
  "ConditionalOnMissingClass",
  "ConditionalOnBean",
  "ConditionalOnMissingBean",
  "ConditionalOnSingleCandidate",
  "ConditionalOnProperty",
  "ConditionalOnResource",
  "ConditionalOnWebApplication",
  "ConditionalOnNotWebApplication",
  "ConditionalOnExpression",
  "ConditionalOnJava",
  "ConditionalOnJndi",
  "ConditionalOnCloudPlatform",
  "ConditionalOnWarDeployment"
]);

const JAVA_PARSER = createJavaParser();
let UNZIP_AVAILABLE = null;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const projectRoot = path.resolve(args.projectRoot || cwd);
  const outputPath = path.resolve(args.out || path.join(projectRoot, "generated", "spring_boot_autoconfig_index.json"));
  const springBootVersion = args.version || "unknown";

  const roots = unique([
    args.bootRepo ? path.resolve(args.bootRepo) : null,
    projectRoot,
    ...(args.extraRoot || []).map((it) => path.resolve(it))
  ].filter(Boolean));

  const sourceModuleDescriptors = await collectModuleDescriptors(roots);
  const jarModuleDescriptors = await collectJarDescriptorsFromResolvedArtifacts(
    args.resolvedArtifacts ? path.resolve(args.resolvedArtifacts) : null
  );
  const moduleDescriptors = [...sourceModuleDescriptors, ...jarModuleDescriptors];
  if (moduleDescriptors.length === 0) {
    throw new Error("Не найдены источники AutoConfiguration.imports. Добавьте --boot-repo/--extra-root или --resolved-artifacts.");
  }

  const javaIndex = await buildJavaIndex(moduleDescriptors);
  const propertiesBySourceType = await loadPropertiesMetadata(
    roots,
    jarModuleDescriptors
      .map((moduleDesc) => moduleDesc.configurationMetadataJson)
      .filter(Boolean)
  );

  const importsEntries = [];
  const metadataByClass = new Map();

  for (const moduleDesc of moduleDescriptors) {
    const classes = await readImportsEntries(moduleDesc);
    for (const fqcn of classes) {
      importsEntries.push({ fqcn, moduleDesc });
    }

    const metadataForModule = await readAutoconfigureMetadataForDescriptor(moduleDesc);
    for (const [className, conditionMap] of metadataForModule.entries()) {
      metadataByClass.set(className, { ...(metadataByClass.get(className) || {}), ...conditionMap });
    }
  }

  const uniqueImports = [];
  const seen = new Set();
  for (const entry of importsEntries) {
    if (!seen.has(entry.fqcn)) {
      seen.add(entry.fqcn);
      uniqueImports.push(entry);
    }
  }

  let beanDefinitionsTotal = 0;
  let conditionsTotal = 0;
  let propertiesLinkedTotal = 0;

  const autoconfigurations = [];

  for (const { fqcn, moduleDesc } of uniqueImports) {
    const autoConfig = {
      id: fqcn,
      fqcn,
      artifact: moduleDesc.artifact,
      imports: [],
      recursive_imports: [],
      order: {
        before: [],
        after: [],
        auto_configure_order: null
      },
      class_conditions: [],
      bean_methods: [],
      nested_configurations: [],
      linked_properties: [],
      activation_hints: []
    };

    const sourcePath = javaIndex.get(fqcn);
    if (sourcePath) {
      const source = await fs.readFile(sourcePath, "utf8");
      const parsed = parseJavaAutoConfigurationSource(source, fqcn);

      autoConfig.imports.push(...parsed.imports);
      autoConfig.order.before.push(...parsed.order.before);
      autoConfig.order.after.push(...parsed.order.after);
      autoConfig.order.auto_configure_order = parsed.order.auto_configure_order;
      autoConfig.class_conditions.push(...parsed.class_conditions);
      autoConfig.bean_methods.push(...parsed.bean_methods);
      autoConfig.nested_configurations.push(...parsed.nested_configurations);

      conditionsTotal += parsed.class_conditions.length;
      beanDefinitionsTotal += parsed.bean_methods.length;
      conditionsTotal += parsed.bean_methods.reduce((sum, bean) => sum + bean.conditions.length, 0);

      for (const sourceType of parsed.enableConfigurationProperties) {
        const props = propertiesBySourceType.get(sourceType) || [];
        for (const prop of props) {
          if (!autoConfig.linked_properties.some((p) => p.name === prop.name)) {
            autoConfig.linked_properties.push(prop);
          }
        }
      }
    }

    const metadata = metadataByClass.get(fqcn) || {};
    mergeMetadataHints(autoConfig, metadata);

    propertiesLinkedTotal += autoConfig.linked_properties.length;
    autoconfigurations.push(autoConfig);
  }

  const output = {
    generated_at: new Date().toISOString(),
    spring_boot_version: springBootVersion,
    sources: {
      artifacts: unique(moduleDescriptors.map((m) => m.artifact)),
      metadata_files: unique(moduleDescriptors.flatMap((m) => [m.importsFile, m.metadataFile].filter(Boolean)))
    },
    stats: {
      autoconfigurations_total: autoconfigurations.length,
      bean_definitions_total: beanDefinitionsTotal,
      conditions_total: conditionsTotal,
      properties_linked_total: propertiesLinkedTotal
    },
    autoconfigurations
  };

  if (args.baseIndex) {
    await mergeWithBaseIndex(output, path.resolve(args.baseIndex));
  }

  enrichRecursiveImportGraph(output.autoconfigurations);
  calculateEffectiveOrdering(output);
  ({ beanDefinitionsTotal, conditionsTotal, propertiesLinkedTotal } = recalculateStats(output.autoconfigurations));
  output.stats = {
    autoconfigurations_total: output.autoconfigurations.length,
    bean_definitions_total: beanDefinitionsTotal,
    conditions_total: conditionsTotal,
    properties_linked_total: propertiesLinkedTotal
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`Index generated: ${outputPath}`);
  console.log(`autoconfigurations_total=${output.stats.autoconfigurations_total}`);
  console.log(`bean_definitions_total=${output.stats.bean_definitions_total}`);
  console.log(`conditions_total=${output.stats.conditions_total}`);
  console.log(`properties_linked_total=${output.stats.properties_linked_total}`);
}

async function mergeWithBaseIndex(currentOutput, baseIndexPath) {
  if (!(await pathExists(baseIndexPath))) {
    throw new Error(`base index not found: ${baseIndexPath}`);
  }

  const baseOutput = JSON.parse(await fs.readFile(baseIndexPath, "utf8"));
  const mergedByFqcn = new Map();

  for (const item of baseOutput.autoconfigurations || []) {
    if (item && item.fqcn) {
      mergedByFqcn.set(item.fqcn, item);
    }
  }
  for (const item of currentOutput.autoconfigurations || []) {
    if (item && item.fqcn) {
      mergedByFqcn.set(item.fqcn, item);
    }
  }

  const mergedAutoconfigurations = [...mergedByFqcn.values()];
  const beanDefinitionsTotal = mergedAutoconfigurations.reduce((sum, cfg) => sum + (cfg.bean_methods?.length || 0), 0);
  const conditionsTotal = mergedAutoconfigurations.reduce((sum, cfg) => {
    const classCount = cfg.class_conditions?.length || 0;
    const methodCount = (cfg.bean_methods || []).reduce((s, b) => s + (b.conditions?.length || 0), 0);
    return sum + classCount + methodCount;
  }, 0);
  const propertiesLinkedTotal = mergedAutoconfigurations.reduce((sum, cfg) => sum + (cfg.linked_properties?.length || 0), 0);

  currentOutput.autoconfigurations = mergedAutoconfigurations;
  currentOutput.stats = {
    autoconfigurations_total: mergedAutoconfigurations.length,
    bean_definitions_total: beanDefinitionsTotal,
    conditions_total: conditionsTotal,
    properties_linked_total: propertiesLinkedTotal
  };

  currentOutput.sources.artifacts = unique([
    ...(baseOutput.sources?.artifacts || []),
    ...(currentOutput.sources?.artifacts || [])
  ]);
  currentOutput.sources.metadata_files = unique([
    ...(baseOutput.sources?.metadata_files || []),
    ...(currentOutput.sources?.metadata_files || [])
  ]);
}

function enrichRecursiveImportGraph(autoconfigurations) {
  const byFqcn = new Map();
  for (const cfg of autoconfigurations) {
    if (cfg?.fqcn) {
      byFqcn.set(cfg.fqcn, cfg);
    }
  }

  for (const cfg of autoconfigurations) {
    const visited = new Set();
    const unresolved = new Set();
    const queue = [...(cfg.imports || [])];
    const importedConditions = [];

    while (queue.length > 0) {
      const importRef = queue.shift();
      const resolution = resolveAutoconfigRef(importRef, byFqcn);
      if (!resolution.cfg) {
        unresolved.add(importRef);
        continue;
      }
      const resolved = resolution.cfg;
      if (resolved.fqcn === cfg.fqcn || visited.has(resolved.fqcn)) {
        continue;
      }

      visited.add(resolved.fqcn);
      for (const imp of resolved.imports || []) {
        queue.push(imp);
      }
      for (const cond of resolved.class_conditions || []) {
        importedConditions.push({
          ...cond,
          scope: "imported-class",
          imported_from: resolved.fqcn
        });
      }
    }

    cfg.recursive_imports = [...visited].sort();
    cfg.unresolved_imports = [...unresolved].sort();
    cfg.class_conditions = uniqueConditions([
      ...(cfg.class_conditions || []),
      ...importedConditions
    ]);
  }
}

function calculateEffectiveOrdering(output) {
  const configs = output.autoconfigurations || [];
  const byFqcn = new Map(configs.map((cfg) => [cfg.fqcn, cfg]));
  const edges = new Map();
  const indegree = new Map();
  const unresolved = [];

  for (const cfg of configs) {
    edges.set(cfg.fqcn, new Set());
    indegree.set(cfg.fqcn, 0);
  }

  const addEdge = (from, to) => {
    if (from === to) {
      return;
    }
    const adj = edges.get(from);
    if (!adj || adj.has(to)) {
      return;
    }
    adj.add(to);
    indegree.set(to, (indegree.get(to) || 0) + 1);
  };

  for (const cfg of configs) {
    const beforeRefs = cfg.order?.before || [];
    const afterRefs = cfg.order?.after || [];

    for (const ref of beforeRefs) {
      const resolution = resolveAutoconfigRef(ref, byFqcn);
      if (!resolution.cfg) {
        unresolved.push({
          source: cfg.fqcn,
          kind: "before",
          reference: ref,
          reason: resolution.reason
        });
        continue;
      }
      addEdge(cfg.fqcn, resolution.cfg.fqcn);
    }

    for (const ref of afterRefs) {
      const resolution = resolveAutoconfigRef(ref, byFqcn);
      if (!resolution.cfg) {
        unresolved.push({
          source: cfg.fqcn,
          kind: "after",
          reference: ref,
          reason: resolution.reason
        });
        continue;
      }
      addEdge(resolution.cfg.fqcn, cfg.fqcn);
    }
  }

  const orderWeight = (cfg) => {
    const raw = cfg.order?.auto_configure_order;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) {
      return Number.parseInt(raw.trim(), 10);
    }
    return 0;
  };

  const zeroQueue = [];
  for (const cfg of configs) {
    if ((indegree.get(cfg.fqcn) || 0) === 0) {
      zeroQueue.push(cfg.fqcn);
    }
  }

  const sortQueue = () => {
    zeroQueue.sort((a, b) => {
      const wa = orderWeight(byFqcn.get(a));
      const wb = orderWeight(byFqcn.get(b));
      if (wa !== wb) {
        return wa - wb;
      }
      return a.localeCompare(b);
    });
  };

  sortQueue();
  const sorted = [];
  while (zeroQueue.length > 0) {
    const current = zeroQueue.shift();
    sorted.push(current);
    for (const next of edges.get(current) || []) {
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if ((indegree.get(next) || 0) === 0) {
        zeroQueue.push(next);
      }
    }
    sortQueue();
  }

  const cyclicNodes = configs
    .map((cfg) => cfg.fqcn)
    .filter((fqcn) => (indegree.get(fqcn) || 0) > 0)
    .sort();

  const effective = [...sorted, ...cyclicNodes];
  for (let i = 0; i < effective.length; i += 1) {
    const fqcn = effective[i];
    const cfg = byFqcn.get(fqcn);
    if (!cfg) {
      continue;
    }
    cfg.effective_order_index = i;
    cfg.effective_order_cyclic = cyclicNodes.includes(fqcn);
  }

  output.ordering = {
    effective_order: effective,
    unresolved_order_references: unresolved,
    cyclic_nodes: cyclicNodes,
    total: effective.length
  };
}

function resolveAutoconfigRef(ref, byFqcn) {
  if (!ref || typeof ref !== "string") {
    return { cfg: null, reason: "invalid-reference" };
  }
  if (byFqcn.has(ref)) {
    return { cfg: byFqcn.get(ref), reason: null };
  }

  const matches = [];
  for (const [fqcn, cfg] of byFqcn.entries()) {
    if (fqcn === ref || fqcn.endsWith(`.${ref}`)) {
      matches.push(cfg);
    }
  }
  if (matches.length === 1) {
    return { cfg: matches[0], reason: null };
  }
  if (matches.length > 1) {
    return { cfg: null, reason: "ambiguous-reference" };
  }
  return { cfg: null, reason: "not-found" };
}

function uniqueConditions(conditions) {
  const map = new Map();
  for (const cond of conditions || []) {
    const key = JSON.stringify({
      kind: cond.kind,
      scope: cond.scope,
      inputs: cond.inputs || {},
      negated: !!cond.negated,
      nested_path: cond.nested_path || null,
      imported_from: cond.imported_from || null
    });
    if (!map.has(key)) {
      map.set(key, cond);
    }
  }
  return [...map.values()];
}

function recalculateStats(configs) {
  const beanDefinitionsTotal = configs.reduce((sum, cfg) => sum + (cfg.bean_methods?.length || 0), 0);
  const conditionsTotal = configs.reduce((sum, cfg) => {
    const classCount = cfg.class_conditions?.length || 0;
    const methodCount = (cfg.bean_methods || []).reduce((s, b) => s + (b.conditions?.length || 0), 0);
    return sum + classCount + methodCount;
  }, 0);
  const propertiesLinkedTotal = configs.reduce((sum, cfg) => sum + (cfg.linked_properties?.length || 0), 0);
  return { beanDefinitionsTotal, conditionsTotal, propertiesLinkedTotal };
}

function parseJavaAutoConfigurationSource(source, fqcn) {
  const astClassAnnotationModels = JAVA_PARSER
    ? extractClassAnnotationsWithTreeSitter(source, fqcn)
    : [];
  const regexClassAnnotationModels = parseAnnotations(extractClassAnnotationBlock(source));
  const classAnnotationModels = astClassAnnotationModels.length > 0
    ? astClassAnnotationModels
    : regexClassAnnotationModels;

  const classConditions = classAnnotationModels
    .filter((a) => CONDITION_ANNOTATIONS.has(a.name))
    .map((a) => makeCondition(a, "class", null));

  const imports = [];
  const order = { before: [], after: [], auto_configure_order: null };
  const enableConfigurationProperties = [];

  for (const annotation of classAnnotationModels) {
    if (annotation.name === "Import") {
      imports.push(...extractAnnotationValues(annotation));
    }
    if (annotation.name === "AutoConfiguration") {
      const autoCfgOrder = extractAutoConfigurationOrder(annotation);
      order.before.push(...autoCfgOrder.before);
      order.after.push(...autoCfgOrder.after);
    }
    if (annotation.name === "AutoConfigureBefore") {
      order.before.push(...extractAnnotationValues(annotation));
    }
    if (annotation.name === "AutoConfigureAfter") {
      order.after.push(...extractAnnotationValues(annotation));
    }
    if (annotation.name === "AutoConfigureOrder") {
      const values = extractAnnotationValues(annotation);
      if (values[0]) {
        order.auto_configure_order = values[0];
      }
    }
    if (annotation.name === "EnableConfigurationProperties") {
      enableConfigurationProperties.push(...extractAnnotationValues(annotation));
    }
  }

  const nestedConfigurations = JAVA_PARSER
    ? extractNestedConfigurationBitsWithTreeSitter(source, fqcn)
    : [];
  for (const nested of nestedConfigurations) {
    imports.push(...nested.imports);
    for (const condition of nested.conditions) {
      classConditions.push({
        ...condition,
        scope: "nested-class",
        nested_path: nested.path
      });
    }
  }

  const astBeanMethods = JAVA_PARSER
    ? extractBeanMethodsWithTreeSitter(source, fqcn)
    : [];
  const regexBeanMethods = extractMethods(source).map((method) => ({
      name: method.name,
      returnType: method.returnType,
      annotations: parseAnnotations(method.annotationBlock)
    }));
  const parsedBeanMethods = astBeanMethods.length > 0 ? astBeanMethods : regexBeanMethods;

  const beanMethods = [];
  for (const method of parsedBeanMethods) {
    const hasBean = method.annotations.some((a) => a.name === "Bean");
    if (!hasBean) {
      continue;
    }

    const methodConditions = method.annotations
      .filter((a) => CONDITION_ANNOTATIONS.has(a.name))
      .map((a) => makeCondition(a, "bean-method", method.name));

    const conditionalOnMissingBean = method.annotations.some((a) => a.name === "ConditionalOnMissingBean");

    beanMethods.push({
      bean_name: method.name,
      factory_method: method.name,
      return_type: method.returnType,
      conditions: methodConditions,
      override_points: {
        conditional_on_missing_bean: conditionalOnMissingBean,
        recommended_override_strategy: conditionalOnMissingBean ? "user-bean" : "customizer-or-property"
      },
      targets: {
        reference: `#autoconfig-${fqcn.toLowerCase().replaceAll(".", "-")}`,
        examples: `#example-${fqcn.toLowerCase().replaceAll(".", "-")}-${method.name.toLowerCase()}`
      }
    });
  }

  return {
    class_conditions: classConditions,
    bean_methods: beanMethods,
    nested_configurations: nestedConfigurations,
    order,
    imports: unique(imports),
    enableConfigurationProperties: unique(enableConfigurationProperties)
  };
}

function extractClassAnnotationsWithTreeSitter(source, fqcn) {
  const tree = JAVA_PARSER.parse(source);
  const className = fqcn.split(".").pop();
  const classNode = findClassNode(tree.rootNode, className, source);
  if (!classNode) {
    return [];
  }
  const nameNode = classNode.childForFieldName("name");
  const annotationTexts = extractDeclarationAnnotations(classNode, source, nameNode?.startIndex);
  return annotationTexts.map(parseAnnotationText).filter(Boolean);
}

function extractBeanMethodsWithTreeSitter(source, fqcn) {
  const tree = JAVA_PARSER.parse(source);
  const className = fqcn.split(".").pop();
  const classNode = findClassNode(tree.rootNode, className, source);
  if (!classNode) {
    return [];
  }

  const methods = [];
  walkTree(classNode, (node) => {
    if (node.type !== "method_declaration") {
      return;
    }

    // Only include methods declared in this class hierarchy (top class + nested classes),
    // not methods from unrelated sibling declarations.
    if (!isDescendantOf(node, classNode)) {
      return;
    }

    const nameNode = node.childForFieldName("name");
    const typeNode = node.childForFieldName("type");
    if (!nameNode || !typeNode) {
      return;
    }

    const annotationTexts = extractDeclarationAnnotations(node, source, nameNode.startIndex);

    methods.push({
      name: nodeText(nameNode, source),
      returnType: normalizeReturnType(nodeText(typeNode, source)),
      annotations: annotationTexts.map(parseAnnotationText).filter(Boolean)
    });
  });

  return methods;
}

function extractNestedConfigurationBitsWithTreeSitter(source, fqcn) {
  const tree = JAVA_PARSER.parse(source);
  const className = fqcn.split(".").pop();
  const rootClassNode = findClassNode(tree.rootNode, className, source);
  if (!rootClassNode) {
    return [];
  }

  const nested = [];
  walkTree(rootClassNode, (node) => {
    if (node.type !== "class_declaration" || node.id === rootClassNode.id) {
      return;
    }

    const nameNode = node.childForFieldName("name");
    if (!nameNode) {
      return;
    }

    const annotations = extractDeclarationAnnotations(node, source, nameNode.startIndex)
      .map(parseAnnotationText)
      .filter(Boolean);
    if (annotations.length === 0) {
      return;
    }

    const imports = [];
    const conditions = [];
    for (const annotation of annotations) {
      if (annotation.name === "Import" || annotation.name === "AutoConfiguration") {
        imports.push(...extractAnnotationValues(annotation));
      }
      if (CONDITION_ANNOTATIONS.has(annotation.name)) {
        conditions.push(makeCondition(annotation, "class", null));
      }
    }

    if (imports.length === 0 && conditions.length === 0) {
      return;
    }

    nested.push({
      name: nodeText(nameNode, source),
      path: classNodePath(node, source),
      imports: unique(imports),
      conditions
    });
  });

  return nested;
}

function isDescendantOf(node, ancestor) {
  let current = node;
  while (current) {
    if (current.id === ancestor.id) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function findClassNode(rootNode, expectedClassName, source) {
  let found = null;
  walkTree(rootNode, (node) => {
    if (found || node.type !== "class_declaration") {
      return;
    }
    const nameNode = node.childForFieldName("name");
    if (!nameNode) {
      return;
    }
    if (nodeText(nameNode, source) === expectedClassName) {
      found = node;
    }
  });
  return found;
}

function classNodePath(node, source) {
  const names = [];
  let current = node;
  while (current) {
    if (current.type === "class_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        names.push(nodeText(nameNode, source));
      }
    }
    current = current.parent;
  }
  return names.reverse().join(".");
}

function extractAnnotationsFromModifiers(modifiersNode, source) {
  if (!modifiersNode) {
    return [];
  }
  const result = [];
  walkTree(modifiersNode, (node) => {
    if (node.type.includes("annotation")) {
      result.push(nodeText(node, source).trim());
    }
  });
  return unique(result);
}

function extractDeclarationAnnotations(declarationNode, source, boundaryStartIndex = Number.MAX_SAFE_INTEGER) {
  const result = [];

  const modifiers = declarationNode.childForFieldName("modifiers");
  result.push(...extractAnnotationsFromModifiers(modifiers, source));

  const namedChildren = declarationNode.namedChildren || [];
  for (const child of namedChildren) {
    if (child.startIndex >= boundaryStartIndex) {
      continue;
    }

    if (child.type === "modifiers") {
      result.push(...extractAnnotationsFromModifiers(child, source));
      continue;
    }

    if (child.type.includes("annotation")) {
      result.push(nodeText(child, source).trim());
    }
  }

  return unique(result);
}

function nodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

function walkTree(rootNode, fn) {
  const stack = [rootNode];
  while (stack.length > 0) {
    const node = stack.pop();
    fn(node);
    if (node.namedChildren && node.namedChildren.length > 0) {
      for (let i = node.namedChildren.length - 1; i >= 0; i -= 1) {
        stack.push(node.namedChildren[i]);
      }
    }
  }
}

function createJavaParser() {
  try {
    const parser = new Parser();
    parser.setLanguage(Java);
    return parser;
  } catch {
    return null;
  }
}

function parseAnnotationText(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^@([\w.$]+)(?:\(([\s\S]*)\))?$/);
  if (!match) {
    return null;
  }
  return {
    name: simpleName(match[1]),
    args: parseAnnotationArgs(match[2] || "")
  };
}

function makeCondition(annotation, scope, methodName) {
  const inputs = annotation.args;
  return {
    kind: toConditionKind(annotation.name),
    scope,
    inputs,
    negated: ["ConditionalOnMissingBean", "ConditionalOnMissingClass", "ConditionalOnNotWebApplication"].includes(annotation.name),
    explain_hint: buildExplainHint(annotation.name, scope, methodName)
  };
}

function buildExplainHint(annotationName, scope, methodName) {
  const prefix = scope === "bean-method"
    ? `Проверьте условия для @Bean метода ${methodName}: `
    : "Проверьте классовые условия автоконфигурации: ";

  switch (annotationName) {
    case "ConditionalOnClass":
      return prefix + "классы должны быть в classpath";
    case "ConditionalOnMissingClass":
      return prefix + "указанные классы не должны присутствовать";
    case "ConditionalOnBean":
      return prefix + "требуемые бины должны существовать";
    case "ConditionalOnMissingBean":
      return prefix + "бин должен отсутствовать для активации";
    case "ConditionalOnProperty":
      return prefix + "проверьте значения configuration properties";
    case "ConditionalOnWebApplication":
      return prefix + "должен совпадать web-тип приложения";
    case "ConditionalOnNotWebApplication":
      return prefix + "приложение не должно быть web";
    case "ConditionalOnExpression":
      return prefix + "SpEL выражение должно вернуть true";
    default:
      return prefix + `проверьте значения аннотации ${annotationName}`;
  }
}

function toConditionKind(name) {
  const mapping = {
    ConditionalOnClass: "OnClass",
    ConditionalOnMissingClass: "OnMissingClass",
    ConditionalOnBean: "OnBean",
    ConditionalOnMissingBean: "OnMissingBean",
    ConditionalOnSingleCandidate: "OnSingleCandidate",
    ConditionalOnProperty: "OnProperty",
    ConditionalOnResource: "OnResource",
    ConditionalOnWebApplication: "OnWebApplication",
    ConditionalOnNotWebApplication: "OnNotWebApplication",
    ConditionalOnExpression: "OnExpression",
    ConditionalOnJava: "OnJava",
    ConditionalOnJndi: "OnJndi",
    ConditionalOnCloudPlatform: "OnCloudPlatform",
    ConditionalOnWarDeployment: "OnWarDeployment"
  };
  return mapping[name] || name;
}

function extractMethods(source) {
  const regex = /((?:^[ \t]*@[\w.$]+(?:\([^)]*\))?[ \t]*\n)*)^[ \t]*(?:(?:public|protected|private)\s+)?(?:(?:static|final|synchronized|abstract|native|strictfp)\s+)*(?:<[^>\n]+>\s+)?([\w$<>.?,\[\]\s]+?)\s+(\w+)\s*\([^;\n]*\)\s*(?:throws[^{\n]+)?\{/gm;
  const methods = [];
  for (const match of source.matchAll(regex)) {
    methods.push({
      annotationBlock: match[1] || "",
      returnType: normalizeReturnType(match[2]),
      name: match[3]
    });
  }
  return methods;
}

function normalizeReturnType(raw) {
  return raw.replace(/\s+/g, " ").trim();
}

function extractClassAnnotationBlock(source) {
  const classRegex = /^(?:[ \t]*@[\w.$]+(?:\([^\n]*\))?[ \t]*\n)*[ \t]*(?:public\s+|protected\s+|private\s+)?(?:abstract\s+|final\s+)?class\s+\w+/m;
  const m = source.match(classRegex);
  if (!m) {
    return "";
  }

  const block = m[0];
  const lines = block.split(/\r?\n/);
  return lines.filter((line) => line.trim().startsWith("@")).join("\n");
}

function parseAnnotations(annotationBlock) {
  if (!annotationBlock || !annotationBlock.trim()) {
    return [];
  }

  const lines = annotationBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("@"));

  return lines.map((line) => {
    const m = line.match(/^@([\w.$]+)(?:\((.*)\))?$/);
    if (!m) {
      return { name: "", args: {} };
    }
    return {
      name: simpleName(m[1]),
      args: parseAnnotationArgs(m[2] || "")
    };
  }).filter((a) => a.name);
}

function parseAnnotationArgs(raw) {
  if (!raw || !raw.trim()) {
    return {};
  }

  const args = {};
  const parts = splitTopLevel(raw, ",");

  const hasKeyValue = parts.some((part) => part.includes("="));
  if (!hasKeyValue) {
    args.value = normalizeValue(raw);
    return args;
  }

  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    args[key] = normalizeValue(value);
  }

  return args;
}

function normalizeValue(value) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inside = trimmed.slice(1, -1);
    return splitTopLevel(inside, ",").map((it) => normalizeValue(it));
  }

  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.endsWith(".class")) {
    return trimmed.slice(0, -".class".length).trim();
  }

  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }

  return trimmed;
}

function splitTopLevel(input, delimiter) {
  const result = [];
  let current = "";
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inQuotes = false;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      current += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      current += ch;
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes) {
      if (ch === "(") depthParen += 1;
      if (ch === ")") depthParen -= 1;
      if (ch === "{") depthBrace += 1;
      if (ch === "}") depthBrace -= 1;
      if (ch === "[") depthBracket += 1;
      if (ch === "]") depthBracket -= 1;

      if (ch === delimiter && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
        if (current.trim()) {
          result.push(current.trim());
        }
        current = "";
        continue;
      }
    }

    current += ch;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function mergeMetadataHints(autoConfig, metadata) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return;
  }

  addMetadataCondition(autoConfig, metadata, "ConditionalOnClass", "OnClass", "Проверьте наличие классов в classpath");
  addMetadataCondition(autoConfig, metadata, "ConditionalOnBean", "OnBean", "Проверьте наличие требуемых бинов");
  addMetadataCondition(autoConfig, metadata, "ConditionalOnSingleCandidate", "OnSingleCandidate", "Проверьте наличие единственного кандидата");
  addMetadataCondition(autoConfig, metadata, "ConditionalOnWebApplication", "OnWebApplication", "Проверьте тип веб-приложения");

  if (metadata.ConditionalOnProperty) {
    autoConfig.class_conditions.push({
      kind: "OnProperty",
      scope: "class",
      inputs: { raw: metadata.ConditionalOnProperty },
      negated: false,
      explain_hint: "Проверьте значения property из spring-autoconfigure-metadata.properties"
    });
  }

  if (metadata.ConditionalOnClass) {
    autoConfig.activation_hints.push(`Добавьте зависимость с требуемыми классами: ${metadata.ConditionalOnClass}`);
  }
  if (metadata.ConditionalOnBean) {
    autoConfig.activation_hints.push(`Убедитесь, что бин(ы) присутствуют: ${metadata.ConditionalOnBean}`);
  }
  if (metadata.ConditionalOnWebApplication) {
    autoConfig.activation_hints.push(`Проверьте web-режим: ${metadata.ConditionalOnWebApplication}`);
  }
}

function addMetadataCondition(autoConfig, metadata, key, kind, hint) {
  const raw = metadata[key];
  if (!raw) {
    return;
  }

  autoConfig.class_conditions.push({
    kind,
    scope: "class",
    inputs: {
      value: raw.split(",").map((s) => s.trim()).filter(Boolean)
    },
    negated: false,
    explain_hint: hint
  });
}

function extractAnnotationValues(annotation) {
  if (!annotation || !annotation.args) {
    return [];
  }

  const value = annotation.args.value;
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value !== "undefined") {
    return [String(value)];
  }

  const classes = annotation.args.classes || annotation.args.name;
  if (Array.isArray(classes)) {
    return classes.map(String);
  }
  if (typeof classes !== "undefined") {
    return [String(classes)];
  }

  return [];
}

function extractAutoConfigurationOrder(annotation) {
  const before = [];
  const after = [];
  if (!annotation?.args) {
    return { before, after };
  }

  before.push(...toStringArray(annotation.args.before));
  before.push(...toStringArray(annotation.args.beforeName));
  after.push(...toStringArray(annotation.args.after));
  after.push(...toStringArray(annotation.args.afterName));

  return {
    before: unique(before),
    after: unique(after)
  };
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (typeof value === "undefined" || value === null || value === "") {
    return [];
  }
  return [String(value)];
}

async function collectModuleDescriptors(roots) {
  const modules = [];

  for (const root of roots) {
    const importsFiles = await findFilesByName(root, "org.springframework.boot.autoconfigure.AutoConfiguration.imports");
    for (const importsFile of importsFiles) {
      if (!importsFile.includes(`${path.sep}src${path.sep}main${path.sep}resources${path.sep}META-INF${path.sep}spring${path.sep}`)) {
        continue;
      }
      const moduleRoot = inferModuleRootFromImportsFile(importsFile);
      const javaSourceRoot = path.join(moduleRoot, "src/main/java");
      const metadataFile = path.join(moduleRoot, "src/main/resources/META-INF/spring-autoconfigure-metadata.properties");

      modules.push({
        kind: "source",
        root,
        moduleRoot,
        importsFile,
        metadataFile,
        javaSourceRoot,
        artifact: inferArtifact(moduleRoot)
      });
    }
  }

  const dedup = new Map();
  for (const module of modules) {
    dedup.set(module.importsFile, module);
  }

  return [...dedup.values()];
}

async function collectJarDescriptorsFromResolvedArtifacts(resolvedArtifactsPath) {
  if (!resolvedArtifactsPath || !(await pathExists(resolvedArtifactsPath))) {
    return [];
  }
  if (!hasUnzipBinary()) {
    throw new Error("unzip command is required to scan dependency jars for AutoConfiguration resources");
  }

  let payload;
  try {
    payload = JSON.parse(await fs.readFile(resolvedArtifactsPath, "utf8"));
  } catch {
    return [];
  }

  const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
  const jars = unique(
    artifacts
      .map((item) => item?.file)
      .filter((file) => typeof file === "string" && file.endsWith(".jar"))
  );

  const modules = [];
  for (const jarFile of jars) {
    if (!(await pathExists(jarFile))) {
      continue;
    }

    const importsContent = readJarEntryText(
      jarFile,
      "META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports"
    );
    if (!importsContent) {
      continue;
    }

    const metadataContent = readJarEntryText(jarFile, "META-INF/spring-autoconfigure-metadata.properties");
    const configMetadataContent = readJarEntryText(jarFile, "META-INF/spring-configuration-metadata.json");
    const importsEntries = parseImportsContent(importsContent);
    if (importsEntries.length === 0) {
      continue;
    }

    const artifactInfo = artifacts.find((item) => item?.file === jarFile);
    const artifact = artifactInfo?.gav || `jar:${path.basename(jarFile)}`;

    modules.push({
      kind: "jar",
      artifact,
      jarFile,
      importsEntries,
      importsFile: `jar:${jarFile}!META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`,
      metadataEntries: parseAutoconfigureMetadataContent(metadataContent || ""),
      metadataFile: metadataContent
        ? `jar:${jarFile}!META-INF/spring-autoconfigure-metadata.properties`
        : null,
      configurationMetadataJson: parseConfigurationMetadataContent(configMetadataContent || "")
    });
  }

  return modules;
}

function inferArtifact(moduleRoot) {
  const moduleName = path.basename(moduleRoot);
  return `local:${moduleName}:workspace`;
}

function inferModuleRootFromImportsFile(importsFile) {
  const marker = `${path.sep}src${path.sep}main${path.sep}resources${path.sep}META-INF${path.sep}spring${path.sep}`;
  const idx = importsFile.indexOf(marker);
  if (idx === -1) {
    return path.dirname(path.dirname(path.dirname(importsFile)));
  }
  return importsFile.slice(0, idx);
}

async function buildJavaIndex(moduleDescriptors) {
  const index = new Map();
  for (const module of moduleDescriptors) {
    const root = module.javaSourceRoot;
    if (!root) {
      continue;
    }
    if (!(await pathExists(root))) {
      continue;
    }

    const files = await findFilesByExtension(root, ".java");
    for (const file of files) {
      const src = await fs.readFile(file, "utf8");
      const packageMatch = src.match(/\bpackage\s+([\w.]+)\s*;/);
      const classMatch = src.match(/\bclass\s+(\w+)/);
      if (!classMatch) {
        continue;
      }
      const fqcn = packageMatch ? `${packageMatch[1]}.${classMatch[1]}` : classMatch[1];
      if (!index.has(fqcn)) {
        index.set(fqcn, file);
      }
    }
  }
  return index;
}

async function readImportsFile(importsFile) {
  const raw = await fs.readFile(importsFile, "utf8");
  return parseImportsContent(raw);
}

async function readImportsEntries(moduleDesc) {
  if (Array.isArray(moduleDesc.importsEntries)) {
    return moduleDesc.importsEntries;
  }
  if (moduleDesc.importsFile) {
    return readImportsFile(moduleDesc.importsFile);
  }
  return [];
}

async function readAutoconfigureMetadata(metadataFile) {
  if (!(await pathExists(metadataFile))) {
    return new Map();
  }

  return parseAutoconfigureMetadataContent(await fs.readFile(metadataFile, "utf8"));
}

async function readAutoconfigureMetadataForDescriptor(moduleDesc) {
  if (moduleDesc.metadataEntries instanceof Map) {
    return moduleDesc.metadataEntries;
  }
  if (!moduleDesc.metadataFile) {
    return new Map();
  }
  return readAutoconfigureMetadata(moduleDesc.metadataFile);
}

function parseImportsContent(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function parseAutoconfigureMetadataContent(content) {
  const props = parseProperties(content || "");
  const byClass = new Map();

  for (const [key, value] of Object.entries(props)) {
    const idx = key.indexOf(".");
    if (idx <= 0 || idx >= key.length - 1) {
      continue;
    }

    const className = key.slice(0, idx);
    const conditionKey = key.slice(idx + 1);
    const prev = byClass.get(className) || {};
    prev[conditionKey] = value;
    byClass.set(className, prev);
  }

  return byClass;
}

function parseConfigurationMetadataContent(content) {
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function readJarEntryText(jarPath, entryPath) {
  const result = spawnSync("unzip", ["-p", jarPath, entryPath], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout || null;
}

function hasUnzipBinary() {
  if (UNZIP_AVAILABLE !== null) {
    return UNZIP_AVAILABLE;
  }
  const probe = spawnSync("unzip", ["-v"], { stdio: "ignore" });
  UNZIP_AVAILABLE = !probe.error && probe.status === 0;
  return UNZIP_AVAILABLE;
}

function parseProperties(content) {
  const result = {};
  const lines = content.split(/\r?\n/);

  let current = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
      continue;
    }

    if (trimmed.endsWith("\\")) {
      current += trimmed.slice(0, -1);
      continue;
    }

    current += trimmed;
    const split = current.match(/^([^:=\s]+)\s*[:=]\s*(.*)$/);
    if (split) {
      result[split[1]] = split[2];
    }
    current = "";
  }

  return result;
}

async function loadPropertiesMetadata(roots, extraMetadataDocs = []) {
  const files = [];
  for (const root of roots) {
    files.push(...await findFilesByName(root, "spring-configuration-metadata.json"));
  }

  const bySourceType = new Map();

  const metadataDocs = [];
  for (const file of unique(files).sort()) {
    try {
      metadataDocs.push(JSON.parse(await fs.readFile(file, "utf8")));
    } catch {
      // skip invalid metadata files
    }
  }
  for (const doc of extraMetadataDocs) {
    if (doc && typeof doc === "object") {
      metadataDocs.push(doc);
    }
  }

  for (const json of metadataDocs) {
    const properties = Array.isArray(json.properties) ? json.properties : [];
    for (const property of properties) {
      if (!property || !property.sourceType || !property.name) {
        continue;
      }

      const normalized = {
        name: property.name,
        type: property.type || "java.lang.String",
        default_value: Object.prototype.hasOwnProperty.call(property, "defaultValue") ? property.defaultValue : null,
        deprecated: property.deprecation || null,
        source_type: property.sourceType
      };

      const list = bySourceType.get(property.sourceType) || [];
      if (!list.some((p) => p.name === normalized.name)) {
        list.push(normalized);
      }
      bySourceType.set(property.sourceType, list);
    }
  }

  return bySourceType;
}

async function findFilesByName(root, filename) {
  if (!(await pathExists(root))) {
    return [];
  }

  const result = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "build" || entry.name === "target") {
        continue;
      }
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(abs);
      } else if (entry.isFile() && entry.name === filename) {
        result.push(abs);
      }
    }
  }

  return result;
}

async function findFilesByExtension(root, extension) {
  const result = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(abs);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        result.push(abs);
      }
    }
  }

  return result;
}

function simpleName(qualifiedName) {
  const idx = qualifiedName.lastIndexOf(".");
  return idx >= 0 ? qualifiedName.slice(idx + 1) : qualifiedName;
}

function unique(items) {
  return [...new Set(items)];
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const args = { extraRoot: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];

    if (a === "--boot-repo") {
      args.bootRepo = next;
      i += 1;
      continue;
    }
    if (a === "--project-root") {
      args.projectRoot = next;
      i += 1;
      continue;
    }
    if (a === "--extra-root") {
      args.extraRoot.push(next);
      i += 1;
      continue;
    }
    if (a === "--out") {
      args.out = next;
      i += 1;
      continue;
    }
    if (a === "--version") {
      args.version = next;
      i += 1;
      continue;
    }
    if (a === "--base-index") {
      args.baseIndex = next;
      i += 1;
      continue;
    }
    if (a === "--resolved-artifacts") {
      args.resolvedArtifacts = next;
      i += 1;
      continue;
    }
    if (a === "-h" || a === "--help") {
      printHelpAndExit();
    }
  }

  return args;
}

function printHelpAndExit() {
  console.log(`Usage:
  node skills/spring-autoconfig-index-lookup/scripts/build-autoconfig-index.mjs \\
    --boot-repo /path/to/spring-boot \\
    --project-root /path/to/current-project \\
    --extra-root /path/to/your-lib-1 \\
    --extra-root /path/to/your-lib-2 \\
    --resolved-artifacts ./.qwen/spring-autoconfig-index/cache/resolved-artifacts.json \\
    --base-index ./skills/spring-autoconfig-index-lookup/assets/spring_boot_autoconfig_index.base.json \\
    --version 3.4.4 \\
    --out ./generated/spring_boot_autoconfig_index.json

Notes:
  - --project-root defaults to current working directory
  - --extra-root can be repeated
  - --resolved-artifacts allows scanning auto-config resources inside dependency jars
  - --base-index merges prebuilt Boot map with local libraries map
  - scanner looks for AutoConfiguration.imports and spring-configuration-metadata.json
`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
