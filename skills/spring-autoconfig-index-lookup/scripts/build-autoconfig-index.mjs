#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const analyzerEntry = resolve(scriptDir, "../analyzer/src/build-autoconfig-index.mjs");

const result = spawnSync(process.execPath, [analyzerEntry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(`[autoconfig-index] failed to start analyzer: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
