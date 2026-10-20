#!/usr/bin/env node
/**
 * Reset a user's password from the Pi, or mint a one-time link.
 *
 *   node scripts/reset-password.mjs --email someone@example.test
 *   node scripts/reset-password.mjs --email someone@example.test --link
 *   node scripts/reset-password.mjs --email someone@example.test --stdin
 *
 * Never prints the password or the hash. --password is not accepted.
 */
import {stdin} from 'node:process';
import {resolve} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {
  createAuth, formatResetExpiry, PASSWORD_MAX, PASSWORD_MIN, resetLinkOrigin,
} from '../lib/auth.mjs';
import {normalizeEmail} from '../lib/migrations/multiuser.mjs';
import {readPasswordTwice, readSecret} from '../lib/cli-secret.mjs';

const HELP = `Usage:
  node scripts/reset-password.mjs --email <email>
  node scripts/reset-password.mjs --email <email> --link
  node scripts/reset-password.mjs --email <email> --stdin

Sets a new password (TTY, no echo) or prints a one-time 24h link.
Never prints the password or the hash. --password is not accepted.

Environment: DATA_DIR (default ./data), APP_ORIGIN.
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(HELP);
  process.exit(0);
}

if (process.argv.includes('--password')) {
  process.stderr.write('No se acepta --password. Escribí la contraseña en stdin.\n');
  process.exit(1);
}

function flagValue(name) {
  const i = process.argv.indexOf(name);
  if (i < 0) return '';
  return String(process.argv[i + 1] || '').trim();
}

const email = normalizeEmail(flagValue('--email'));
if (!email || !email.includes('@')) {
  process.stderr.write('Indicá --email con un correo válido.\n');
  process.exit(1);
}

const wantLink = process.argv.includes('--link');
const wantStdin = process.argv.includes('--stdin');
const dataDir = resolve(process.env.DATA_DIR || 'data');
const store = createStore(dataDir);
const auth = createAuth(store);

function exit(code, message) {
  if (message) process.stderr.write(`${message}\n`);
  store.close();
  process.exit(code);
}

try {
  const user = auth.userByEmail(email);
  if (!user) exit(2, 'No hay una cuenta con ese correo.');
  if (user.status === 'suspended') exit(4, 'La cuenta está suspendida.');

  if (wantLink) {
    const origin = resetLinkOrigin(
      {headers: {host: '127.0.0.1'}},
      {origin: process.env.APP_ORIGIN || '', secure: process.env.COOKIE_SECURE === 'true'},
    );
    const result = auth.createResetLink(user.id, {origin, source: 'cli'});
    const when = formatResetExpiry(result.expiresAt);
    process.stdout.write(`${result.link}\nVence: ${when.fecha} ${when.hora} (Argentina).\n`);
    exit(0);
  }

  if (!stdin.isTTY && !wantStdin) {
    exit(1, 'Sin TTY. Usá --stdin o ejecutalo en un terminal.');
  }

  let next;
  try {
    if (wantStdin && !stdin.isTTY) next = await readSecret('');
    else next = await readPasswordTwice({minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX});
  } catch (error) {
    exit(3, error.message);
  }
  try {
    const result = auth.resetPasswordCli(user.id, next);
    process.stdout.write(
      `Listo. Contraseña actualizada para ${result.email}. Se cerraron ${result.revoked} sesiones.\n`,
    );
    exit(0);
  } catch (error) {
    exit(3, error.message);
  }
} finally {
  store.close();
}
