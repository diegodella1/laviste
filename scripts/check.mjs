import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=['server.mjs',...['lib','public','scripts','test'].flatMap(dir=>readdirSync(dir).filter(file=>/\.m?js$/.test(file)).map(file=>dir+'/'+file))];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status)process.exit(result.status);}
console.log(`Syntax OK: ${files.length} files`);
