import {readFileSync} from 'node:fs';
import {stdin, stderr} from 'node:process';

/**
 * Read a secret from stdin. TTY: no echo. Piped: one line, also without echo.
 * Never logs the value. Prompts go to stderr and only when stdin is a TTY.
 */
export function readSecret(prompt = '') {
  if (!stdin.isTTY) return readPipedLine();
  return readHiddenTty(prompt);
}

export async function readPasswordTwice({
  minLength = 12,
  maxLength = 1024,
  prompt = 'Contraseña nueva: ',
  confirmPrompt = 'Repetí la contraseña nueva: ',
} = {}) {
  const first = await readSecret(prompt);
  const second = await readSecret(confirmPrompt);
  if (first !== second) {
    throw Object.assign(new Error('Las contraseñas no coinciden.'), {code: 'pw_match'});
  }
  if (typeof first !== 'string' || first.length < minLength) {
    throw Object.assign(new Error('Usá al menos 12 caracteres.'), {code: 'pw_short'});
  }
  if (first.length > maxLength) {
    throw Object.assign(new Error(`Es demasiado larga. Usá menos de ${maxLength} caracteres.`), {code: 'pw_long'});
  }
  return first;
}

let pipedQueue = null;

function readPipedLine() {
  if (!pipedQueue) {
    const text = readFileSync(0, 'utf8');
    pipedQueue = text.split(/\r?\n/);
    if (pipedQueue.length && pipedQueue.at(-1) === '') pipedQueue.pop();
  }
  return pipedQueue.shift() ?? '';
}

function readHiddenTty(prompt) {
  return new Promise((resolve, reject) => {
    try {
      if (prompt) stderr.write(prompt);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
    } catch (err) {
      reject(err);
      return;
    }
    let value = '';
    const onData = ch => {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        cleanup();
        stderr.write('\n');
        resolve(value);
        return;
      }
      if (ch === '\u0003') {
        cleanup();
        stderr.write('\n');
        process.exit(130);
      }
      if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1);
        return;
      }
      if (ch && ch >= ' ') value += ch;
    };
    const cleanup = () => {
      stdin.off('data', onData);
      try { stdin.setRawMode(false); } catch { /* already off */ }
      stdin.pause();
      stdin.setEncoding('utf8');
    };
    stdin.on('data', onData);
  });
}
