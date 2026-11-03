import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('artifacts',{recursive:true});
function docker(args){const result=spawnSync('docker',args,{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});if(result.status!==0)throw new Error(`Docker image delivery failed: ${result.stderr}`);return result.stdout;}
if(process.argv.includes('--load')){
  const record=JSON.parse(await readFile('artifacts/image.json','utf8'));
  const sha256=createHash('sha256').update(await readFile('artifacts/todo-image.tar')).digest('hex');
  if(record.image!=='mwaeckerlin/todo'||!/^sha256:[a-f0-9]{64}$/.test(record.id)||sha256!==record.sha256)throw new Error('The saved image archive does not match its recorded identity and SHA-256. Save the verified image again.');
  docker(['load','--input','artifacts/todo-image.tar']);
  if(JSON.parse(docker(['image','inspect',record.image]))[0].Id!==record.id)throw new Error('The loaded image differs from the recorded deliverable.');
  console.log(`Loaded verified image ${record.id}`);
  process.exit(0);
}
const image=JSON.parse(docker(['image','inspect','mwaeckerlin/todo']))[0];
docker(['save','--output','artifacts/todo-image.tar','mwaeckerlin/todo']);
const sha256=createHash('sha256').update(await readFile('artifacts/todo-image.tar')).digest('hex');
const spec=docker(['run','--rm','--pull=never','mwaeckerlin/todo','--openapi']);
await writeFile('artifacts/openapi.json',spec);
await writeFile('artifacts/image.json',JSON.stringify({image:'mwaeckerlin/todo',id:image.Id,sha256,created:image.Created},null,2));
console.log(`Saved artifacts/todo-image.tar with SHA-256 ${sha256}`);
