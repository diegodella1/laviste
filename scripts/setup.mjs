import {mkdirSync,existsSync,writeFileSync,chmodSync,copyFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';

const secrets=resolve('secrets');
mkdirSync(secrets,{recursive:true,mode:0o700});
mkdirSync('backups',{recursive:true,mode:0o700});
for(const [file,value] of [['master.key',randomBytes(32).toString('hex')],['app-password',randomBytes(24).toString('base64url')]]){
  const path=resolve(secrets,file);
  if(!existsSync(path))writeFileSync(path,value+'\n',{mode:0o600,flag:'wx'});
  chmodSync(path,0o600);
}
console.log('Secretos listos. La contraseña está en secrets/app-password. No se imprime ni se sube a Git.');

mkdirSync('backups/recovery',{recursive:true,mode:0o700});
for(const file of ['master.key','app-password']){
  const destination=resolve('backups/recovery',file);
  if(!existsSync(destination))copyFileSync(resolve(secrets,file),destination);
  chmodSync(destination,0o600);
}
