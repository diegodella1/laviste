import {readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

function listJs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listJs(path));
    else if (/\.m?js$/.test(name)) out.push(path);
  }
  return out;
}

const files = ['server.mjs', ...['lib', 'public', 'scripts', 'test'].flatMap(listJs)];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (result.status) process.exit(result.status);
}
console.log(`Syntax OK: ${files.length} files`);

const sim = spawnSync(process.execPath, ['scripts/check-sim-only.mjs'], {stdio: 'inherit'});
if (sim.status) process.exit(sim.status);
