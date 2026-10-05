import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,readdirSync,rmSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';

const dataDir=resolve(process.env.DATA_DIR||'data');
const backupDir=resolve(process.env.BACKUP_DIR||'backups');
export async function snapshot(){
  mkdirSync(backupDir,{recursive:true,mode:0o700});
  const db=new DatabaseSync(join(dataDir,'tesis.sqlite'),{readOnly:true});
  const path=join(backupDir,'laviste-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
  try{await backup(db,path);chmodSync(path,0o600);}finally{db.close();}
  const files=readdirSync(backupDir).filter(file=>/^laviste-.*\.sqlite$/.test(file)).sort().reverse();
  for(const file of files.slice(7))rmSync(join(backupDir,file));
  console.log(JSON.stringify({event:'backup_complete',at:new Date().toISOString()}));
}
async function run(){try{await snapshot();}catch(error){console.error(JSON.stringify({event:'backup_failed',type:error.code||error.name}));if(!process.argv.includes('--loop'))process.exitCode=1;}}
await run();
if(process.argv.includes('--loop'))setInterval(run,24*60*60*1000);
