import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assert} from './engine.mjs';

export function createVault(store, keyPath) {
  const key = keyPath ? Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'hex') : null;
  assert(!key || key.length === 32, 'Clave maestra inválida.');
  return {
    available: !!key,
    get(name) {
      const saved = store.setting('secret:' + name);
      if (!saved) return null;
      assert(key, 'Falta la clave maestra del servidor.', 503);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(saved.iv, 'hex'));
      decipher.setAAD(Buffer.from(name));
      decipher.setAuthTag(Buffer.from(saved.tag, 'hex'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data, 'hex')), decipher.final()]).toString('utf8'));
    },
    set(name, value) {
      assert(key, 'Falta instalar la clave maestra del servidor.', 503);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(name));
      const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      store.setSetting('secret:' + name, {iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex')});
    },
    remove(name) { store.deleteSetting('secret:' + name); },
  };
}
