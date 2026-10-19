import {spawnSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
for(const dir of ['lib','public','scripts','tests'])for(const file of await readdir(dir))if(/\.(js|mjs)$/.test(file)){const p=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(p.status)process.exit(p.status);}
const p=spawnSync(process.execPath,['--check','server.mjs'],{stdio:'inherit'});if(p.status)process.exit(p.status);console.log('JavaScript 구문 검사 통과');
