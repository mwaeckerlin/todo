import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
const record=JSON.parse(await readFile('artifacts/image.json','utf8'));
const script=path.resolve('scripts/image.mjs');
function image(){const result=spawnSync('docker',['image','inspect','--format','{{.Id}}',record.image],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();}
const before=image();assert.equal(before,record.id);
const directory=await mkdtemp(path.resolve('artifacts/archive-rejection-'));
try{
  await mkdir(path.join(directory,'artifacts'));
  await writeFile(path.join(directory,'artifacts','image.json'),JSON.stringify(record));
  await writeFile(path.join(directory,'artifacts','todo-image.tar'),'An incomplete image archive.');
  const rejected=spawnSync(process.execPath,[script,'--load'],{cwd:directory,encoding:'utf8'});
  assert.notEqual(rejected.status,0);
  assert.match(rejected.stderr,/saved image archive does not match its recorded identity and SHA-256/);
  assert.equal(image(),before,'Rejecting an altered archive must retain the installed image.');
  console.log('An altered archive is rejected before Docker import; the installed image is retained.');
}finally{await rm(directory,{recursive:true,force:true});}
