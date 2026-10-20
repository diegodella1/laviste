#!/usr/bin/env node
/**
 * Create an invited user. Superadmin is never allowed.
 *
 *   node scripts/create-user.mjs --email someone@example.test
 *   node scripts/create-user.mjs --email someone@example.test --with-password
 *
 * Default: active user with no password (Google can link on first sign-in).
 * Prints only the new id and email. Never prints the password or the hash.
 */
import {resolve} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createAuth, PASSWORD_MAX, PASSWORD_MIN, validateNewPassword} from '../lib/auth.mjs';
import {normalizeEmail} from '../lib/migrations/multiuser.mjs';
import {hashPassword} from '../lib/password.mjs';
import {readPasswordTwice} from '../lib/cli-secret.mjs';

const HELP = `Usage: node scripts/create-user.mjs --email <email> [--role user] [--with-password]

Creates an active user. Superadmin is not allowed. Without --with-password
the account has no password so a verified Google login can link on first sign-in.

Environment: DATA_DIR (default ./data).
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(HELP);
  process.exit(0);
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

const role = flagValue('--role') || 'user';
if (role === 'superadmin') {
  process.stderr.write('No se puede crear un superadmin.\n');
  process.exit(1);
}
if (role !== 'user') {
  process.stderr.write('Solo se puede crear el rol user.\n');
  process.exit(1);
}

const withPassword = process.argv.includes('--with-password');
const dataDir = resolve(process.env.DATA_DIR || 'data');
const store = createStore(dataDir);
const auth = createAuth(store);

try {
  if (auth.userByEmail(email)) {
    process.stderr.write('Ya existe una cuenta con ese correo.\n');
    process.exit(1);
  }
  const fields = {email, role: 'user', status: 'active'};
  if (withPassword) {
    let next;
    try {
      next = await readPasswordTwice({minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX});
      validateNewPassword(next, {email});
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    fields.passwordHash = hashPassword(next);
  }
  let id;
  try {
    id = store.createUser(fields);
  } catch (error) {
    if (/UNIQUE/i.test(error.message || '')) {
      process.stderr.write('Ya existe una cuenta con ese correo.\n');
      process.exit(1);
    }
    throw error;
  }
  store.writeAudit({
    action: 'user.create_cli',
    target: id,
    actorUserId: null,
    meta: {hasPassword: withPassword},
  });
  process.stdout.write(`${id} ${email}\n`);
} finally {
  store.close();
}
