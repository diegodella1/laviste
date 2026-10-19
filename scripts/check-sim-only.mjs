#!/usr/bin/env node
/**
 * CI guard: Automático is simulated money only. Fails if a path could write
 * simulated=0 to the ledger or talk to a real broker from the auto module.
 *
 * Usage: node scripts/check-sim-only.mjs
 */
import {readdirSync, readFileSync, statSync, existsSync} from 'node:fs';
import {join, relative} from 'node:path';

const AUTO_FORBIDDEN_IMPORTS = [
  /(?:^|[/'"])openai\.mjs/,
  /(?:^|[/'"])iol\.mjs/,
  /(?:^|[/'"])roxom\.mjs/,
  /(?:^|[/'"])feeds\.mjs/,
  /^node:https?$/,
  /^node:net$/,
  /^node:tls$/,
];

const FETCH_RE = /\bfetch\s*\(/;
const SIM_ZERO_RE = /\bsimulated\s*(?:=|:)\s*(?:0|false)\b/;
const IMPORT_RE = /(?:from|import)\s+['\"]([^'\"]+)['\"]|require\(\s*['\"]([^'\"]+)['\"]\s*\)/g;
const BROKER_IMPORT_RE = /(^|[/'"])(iol|roxom)\.mjs/;
const NON_GET_METHOD_RE = /method\s*:\s*['\"](POST|PUT|PATCH|DELETE)['\"]/gi;
const ORDER_SEND_RE = /\b(placeOrder|crearOrden|enviarOrden|operar)\b|\/(?:api\/v\d+\/)?orders\b/i;
const LEDGER_SIM0_RE = /INSERT\s+INTO\s+(ops|orders|auto_policies|auto_signals|auto_trades)\b[\s\S]{0,500}\bsimulated\b[\s\S]{0,80}\b(?:0|false)\b/i;

function listJs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...listJs(path));
    else if (/\.m?js$/.test(name)) out.push(path);
  }
  return out;
}

function rel(root, path) {
  return relative(root, path).split('\\').join('/');
}

function importedSpecifiers(text) {
  const found = [];
  IMPORT_RE.lastIndex = 0;
  let match;
  while ((match = IMPORT_RE.exec(text))) found.push(match[1] || match[2]);
  return found;
}

function isExemptSimZero(relPath) {
  return relPath === 'lib/iol.mjs';
}

function scanAutoFile(relPath, text, errors) {
  for (const spec of importedSpecifiers(text)) {
    if (AUTO_FORBIDDEN_IMPORTS.some(re => re.test(spec))) {
      errors.push(`${relPath}: lib/auto must not import ${spec}`);
    }
  }
  if (FETCH_RE.test(text)) errors.push(`${relPath}: lib/auto must not call fetch(`);
  if (SIM_ZERO_RE.test(text)) errors.push(`${relPath}: lib/auto must not write simulated=0`);
}

function withoutRollbackProbe(relPath, text) {
  if (relPath !== 'lib/migrations/multiuser.mjs') return text;
  return text.replace(/function probeSimulatedCheckEnforced[\s\S]*?\nfunction rebuildLedgerWithSimulatedCheck/, 'function rebuildLedgerWithSimulatedCheck');
}

function scanLedgerFile(relPath, text, errors) {
  if (isExemptSimZero(relPath)) return;
  const body = withoutRollbackProbe(relPath, text);
  if (SIM_ZERO_RE.test(body)) errors.push(`${relPath}: must not assign simulated=0/false`);
  if (LEDGER_SIM0_RE.test(body)) errors.push(`${relPath}: insert path writes simulated=0`);
}

function scanBrokerImport(relPath, text, errors) {
  if (relPath === 'server.mjs' || relPath.startsWith('test/')) return;
  for (const spec of importedSpecifiers(text)) {
    if (BROKER_IMPORT_RE.test(spec)) {
      errors.push(`${relPath}: only server.mjs and tests may import ${spec}`);
    }
  }
}

function scanBrokerModule(relPath, text, errors) {
  NON_GET_METHOD_RE.lastIndex = 0;
  let match;
  while ((match = NON_GET_METHOD_RE.exec(text))) {
    const around = text.slice(Math.max(0, match.index - 160), match.index + 160);
    const method = match[1].toUpperCase();
    if (method === 'POST' && /\/token/.test(around)) continue;
    errors.push(`${relPath}: non-GET broker method ${method}`);
  }
  if (ORDER_SEND_RE.test(text)) {
    errors.push(`${relPath}: broker order-sending term`);
  }
}

export function checkSimOnly(root = process.cwd()) {
  const errors = [];
  const files = [
    join(root, 'server.mjs'),
    ...listJs(join(root, 'lib')),
    ...listJs(join(root, 'public')),
    ...listJs(join(root, 'scripts')),
  ].filter(path => existsSync(path) && !path.endsWith('check-sim-only.mjs'));

  for (const path of files) {
    const relPath = rel(root, path);
    const text = readFileSync(path, 'utf8');
    if (relPath.startsWith('lib/auto/')) scanAutoFile(relPath, text, errors);
    if (relPath.startsWith('lib/')) scanLedgerFile(relPath, text, errors);
    scanBrokerImport(relPath, text, errors);
    if (relPath === 'lib/iol.mjs' || relPath === 'lib/roxom.mjs') scanBrokerModule(relPath, text, errors);
  }

  return {ok: errors.length === 0, errors, files: files.length};
}

const isMain = process.argv[1] && process.argv[1].endsWith('check-sim-only.mjs');
if (isMain) {
  const report = checkSimOnly();
  if (!report.ok) {
    process.stderr.write(report.errors.map(line => `check-sim-only: ${line}`).join('\n') + '\n');
    process.exit(1);
  }
  process.stdout.write(`Sim-only OK: ${report.files} files\n`);
}
