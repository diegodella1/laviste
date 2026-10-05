import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createStore} from '../lib/store.mjs';
import {createVault} from '../lib/vault.mjs';
import {createTake,templates} from '../lib/engine.mjs';

test('backup script produces a consistent restore including encrypted credentials and versions',()=>{
  const dir=mkdtempSync(join(tmpdir(),'laviste-backup-'));
  let original,restored;
  try{
    const master=join(dir,'master.key');writeFileSync(master,'cd'.repeat(32));
    original=createStore(join(dir,'source'));
    const take=createTake(templates[0]);original.putTake(take);original.version(take);
    createVault(original,master).set('openai',{apiKey:'test-restorable-secret'});
    const result=spawnSync(process.execPath,[resolve('scripts/backup.mjs')],{env:{...process.env,DATA_DIR:join(dir,'source'),BACKUP_DIR:join(dir,'backups')},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const files=readdirSync(join(dir,'backups'));assert.equal(files.length,1);
    mkdirSync(join(dir,'restored'));copyFileSync(join(dir,'backups',files[0]),join(dir,'restored','tesis.sqlite'));
    restored=createStore(join(dir,'restored'));
    assert.equal(restored.take(take.id).thesis,take.thesis);assert.equal(restored.versions(take.id).length,1);
    assert.equal(createVault(restored,master).get('openai').apiKey,'test-restorable-secret');
    assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{restored?.close();original?.close();rmSync(dir,{recursive:true,force:true});}
});
