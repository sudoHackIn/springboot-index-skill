#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const cwd = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...rest] = a.split('=');
  return [k.replace(/^--/, ''), rest.join('=') || 'true'];
}));

const artifactsPath = path.resolve(cwd, args.artifacts ?? '.qwen/spring-properties-index/cache/resolved-artifacts.json');
const outputPath = path.resolve(cwd, args.output ?? '.qwen/spring-properties-index/spring_properties_index.json');
const schemaPath = path.resolve(cwd, args.schema ?? '.qwen/spring-properties-index/spring_properties_index.schema.json');
const includeObserved = args['include-observed'] !== 'false';

function sh(cmd, argv, fallback = null) {
  try {
    return execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (fallback) return fallback();
    throw e;
  }
}

function listJarEntries(jarPath) {
  const out = sh('unzip', ['-Z1', jarPath], () => '');
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

function readJarEntry(jarPath, entry) {
  try {
    return sh('unzip', ['-p', jarPath, entry]);
  } catch {
    return null;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeDeprecation(d) {
  if (!d) return null;
  return {
    level: d.level ?? null,
    reason: d.reason ?? null,
    replacement: d.replacement ?? null,
    since: d.since ?? null,
  };
}

function ensureProp(map, name) {
  if (!map.has(name)) {
    map.set(name, {
      name,
      segments: name.split('.'),
      type: null,
      description: null,
      default_value: null,
      deprecation: null,
      source_types: [],
      source_artifacts: [],
      origins: [],
      examples: [],
    });
  }
  return map.get(name);
}

function pushUniq(arr, value, keyFn = (x) => x) {
  const key = keyFn(value);
  if (!arr.some(v => keyFn(v) === key)) arr.push(value);
}

function parsePropertiesFile(content, filePath) {
  const found = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const m = line.match(/^([A-Za-z0-9_.\-\[\]]+)\s*[:=]/);
    if (!m) continue;
    const key = m[1].replace(/\[\d+\]/g, '[]');
    if (!key.includes('.')) continue;
    found.push({ key, line: i + 1, raw: lines[i], file: filePath });
  }
  return found;
}

function parseYamlFile(content, filePath) {
  const found = [];
  const lines = content.split('\n');
  const stack = [];

  const indentOf = (s) => (s.match(/^\s*/) || [''])[0].length;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\t/g, '    ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('- ')) continue;

    const idx = line.indexOf(':');
    if (idx <= 0) continue;

    const keyPart = line.slice(0, idx).trim();
    if (!/^[A-Za-z0-9_.\-]+$/.test(keyPart)) continue;

    const indent = indentOf(line);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

    const valuePart = line.slice(idx + 1).trim();
    if (valuePart === '' || valuePart === '|' || valuePart === '>') {
      stack.push({ key: keyPart, indent });
      continue;
    }

    const pathSegs = [...stack.map(x => x.key), keyPart];
    const key = pathSegs.join('.');
    if (!key.includes('.')) continue;
    found.push({ key, line: i + 1, raw, file: filePath });
  }

  return found;
}

function findObservedProperties(projectRoot) {
  const files = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'build' || e.name === '.gradle' || e.name === '.idea') continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(abs);
      } else if (/application.*\.(ya?ml|properties)$/i.test(e.name)) {
        files.push(abs);
      }
    }
  }

  walk(projectRoot);

  const observed = [];
  for (const file of files) {
    const rel = path.relative(projectRoot, file);
    const content = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.properties')) {
      observed.push(...parsePropertiesFile(content, rel));
    } else {
      observed.push(...parseYamlFile(content, rel));
    }
  }

  return observed;
}

function buildTree(propertyNames) {
  const root = { name: '', children: {}, is_leaf: false };
  for (const name of propertyNames) {
    const segs = name.split('.');
    let node = root;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (!node.children[seg]) node.children[seg] = { name: seg, children: {}, is_leaf: false };
      node = node.children[seg];
      if (i === segs.length - 1) node.is_leaf = true;
    }
  }

  function toArray(node, prefix = '') {
    const keys = Object.keys(node.children).sort();
    return keys.map((k) => {
      const child = node.children[k];
      const full = prefix ? `${prefix}.${k}` : k;
      return {
        name: k,
        full_name: full,
        is_leaf: child.is_leaf,
        children: toArray(child, full),
      };
    });
  }

  return toArray(root);
}

function buildPrefixIndex(propertyNames) {
  const map = new Map();
  for (const name of propertyNames) {
    const segs = name.split('.');
    for (let i = 0; i < segs.length; i++) {
      const prefix = segs.slice(0, i + 1).join('.');
      const child = segs[i + 1] ?? null;
      if (!map.has(prefix)) {
        map.set(prefix, { prefix, children: new Set(), leaf_count: 0 });
      }
      const item = map.get(prefix);
      if (child) item.children.add(child);
      if (i === segs.length - 1) item.leaf_count += 1;
    }
  }

  return [...map.values()]
    .map((x) => ({
      prefix: x.prefix,
      children: [...x.children].sort(),
      leaf_count: x.leaf_count,
    }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix));
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

if (!fs.existsSync(artifactsPath)) {
  console.error(`Artifacts JSON not found: ${artifactsPath}`);
  process.exit(2);
}

const artifactsPayload = safeJson(fs.readFileSync(artifactsPath, 'utf8'));
if (!artifactsPayload || !Array.isArray(artifactsPayload.artifacts)) {
  console.error('Invalid artifacts JSON format');
  process.exit(2);
}

const propMap = new Map();
const groupsMap = new Map();
let scannedJars = 0;
let metadataFiles = 0;

for (const art of artifactsPayload.artifacts) {
  const jarPath = art.file;
  if (!jarPath || !fs.existsSync(jarPath)) continue;

  scannedJars += 1;
  const entries = listJarEntries(jarPath);
  const mdEntries = entries.filter((e) =>
    e === 'META-INF/spring-configuration-metadata.json' ||
    e === 'META-INF/additional-spring-configuration-metadata.json'
  );

  for (const entry of mdEntries) {
    const text = readJarEntry(jarPath, entry);
    if (!text) continue;
    const md = safeJson(text);
    if (!md) continue;
    metadataFiles += 1;

    for (const g of md.groups ?? []) {
      if (!g?.name) continue;
      if (!groupsMap.has(g.name)) {
        groupsMap.set(g.name, {
          name: g.name,
          type: g.type ?? null,
          description: g.description ?? null,
          source_types: [],
          source_artifacts: [],
          origins: [],
        });
      }
      const gg = groupsMap.get(g.name);
      if (g.type && !gg.type) gg.type = g.type;
      if (g.description && !gg.description) gg.description = g.description;
      if (g.sourceType) pushUniq(gg.source_types, g.sourceType);
      pushUniq(gg.source_artifacts, art.gav ?? jarPath);
      pushUniq(gg.origins, entry);
    }

    for (const p of md.properties ?? []) {
      if (!p?.name) continue;
      const rec = ensureProp(propMap, p.name);
      rec.type = rec.type ?? p.type ?? null;
      rec.description = rec.description ?? p.description ?? null;
      rec.default_value = rec.default_value ?? (p.defaultValue ?? null);
      rec.deprecation = rec.deprecation ?? normalizeDeprecation(p.deprecation);
      if (p.sourceType) pushUniq(rec.source_types, p.sourceType);
      pushUniq(rec.source_artifacts, art.gav ?? jarPath);
      pushUniq(rec.origins, entry);
    }
  }
}

if (includeObserved) {
  const observed = findObservedProperties(cwd);
  for (const o of observed) {
    const rec = ensureProp(propMap, o.key);
    pushUniq(rec.origins, 'observed');
    pushUniq(rec.examples, {
      file: o.file,
      line: o.line,
      raw: o.raw,
    }, (x) => `${x.file}:${x.line}:${x.raw}`);
  }
}

const properties = [...propMap.values()].sort((a, b) => a.name.localeCompare(b.name));
const groups = [...groupsMap.values()].sort((a, b) => a.name.localeCompare(b.name));
const names = properties.map((p) => p.name);

const payload = {
  generated_at: new Date().toISOString(),
  generator: {
    tool: 'scripts/build-props-index.mjs',
    artifacts_input: path.relative(cwd, artifactsPath),
    include_observed: includeObserved,
  },
  stats: {
    artifacts_total: artifactsPayload.artifacts?.length ?? 0,
    artifacts_scanned: scannedJars,
    metadata_files_read: metadataFiles,
    properties_total: properties.length,
    groups_total: groups.length,
  },
  properties,
  groups,
  prefix_index: buildPrefixIndex(names),
  tree: buildTree(names),
  checksum: {
    properties_sha256: sha256(JSON.stringify(properties)),
  },
};

fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'spring_properties_index.schema.json',
  title: 'Spring Properties Index',
  type: 'object',
  required: ['generated_at', 'stats', 'properties', 'groups', 'prefix_index', 'tree'],
  properties: {
    generated_at: { type: 'string' },
    generator: { type: 'object' },
    stats: { type: 'object' },
    properties: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'segments', 'source_artifacts', 'origins', 'examples'],
        properties: {
          name: { type: 'string' },
          segments: { type: 'array', items: { type: 'string' } },
          type: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
          default_value: {},
          deprecation: { type: ['object', 'null'] },
          source_types: { type: 'array', items: { type: 'string' } },
          source_artifacts: { type: 'array', items: { type: 'string' } },
          origins: { type: 'array', items: { type: 'string' } },
          examples: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                line: { type: 'integer' },
                raw: { type: 'string' },
              },
            },
          },
        },
      },
    },
    groups: { type: 'array', items: { type: 'object' } },
    prefix_index: { type: 'array', items: { type: 'object' } },
    tree: { type: 'array', items: { type: 'object' } },
  },
};

fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + '\n', 'utf8');
console.log(`Properties index written: ${path.relative(cwd, outputPath)} (properties=${properties.length})`);
