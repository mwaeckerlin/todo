import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
function docker(args) { const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw new Error(r.stderr);return r.stdout; }
const image=JSON.parse(docker(['image','inspect','mwaeckerlin/todo']))[0];
assert.ok(image.Config.User&&!['root','0','0:0'].includes(image.Config.User));
const id=docker(['create','mwaeckerlin/todo']).trim();
const temporary=await mkdtemp(path.join(os.tmpdir(),'todo-image-'));
try {
  docker(['export','-o',path.join(temporary,'image.tar'),id]);
  const listing=spawnSync('tar',['-tf',path.join(temporary,'image.tar')],{encoding:'utf8'});
  assert.equal(listing.status,0);const files=listing.stdout.split('\n');
  assert.ok(files.includes('usr/bin/todo'));
  for(const f of ['bin/sh','bin/bash','bin/busybox','usr/bin/node','usr/bin/cargo','usr/bin/npm'])assert.ok(!files.includes(f),`${f} must not enter the runtime`);
  const spec=docker(['run','--rm','--pull=never','mwaeckerlin/todo','--openapi']);
  assert.ok(JSON.parse(spec).paths['/api/projects/{project}/tasks/{task}/revert']);
  const probe="print(__import__('json').dumps((lambda result: {'code':result.returncode,'font':result.stdout,'error':result.stderr,'raqm':__import__('PIL.features',fromlist=['check']).check('raqm'),'source_sha256':__import__('hashlib').sha256(__import__('pathlib').Path('renderer/task-tree.py').read_bytes()).hexdigest()})(__import__('subprocess').run(['fc-match','-f','%{file}','Montserrat:weight=medium'],capture_output=True,text=True))))";
  const fonts=JSON.parse(docker(['run','--rm','--pull=never','-e','FONTCONFIG_FILE=/app/renderer/fonts.conf','--entrypoint','/usr/bin/python3','mwaeckerlin/todo','-c',probe]));
  assert.equal(fonts.code,0,JSON.stringify(fonts));assert.ok(fonts.font.endsWith('/renderer/fonts/NotoSans-Regular.ttf'),JSON.stringify(fonts));assert.equal(fonts.error,'',JSON.stringify(fonts));
  assert.equal(fonts.raqm,true,'The original font shaping engine must be present');
  assert.equal(fonts.source_sha256,createHash('sha256').update(await readFile('renderer/task-tree.py')).digest('hex'),'The image must contain the identical original source');
  const input=JSON.stringify({today:'2026-11-01',worked:[],tasks:[{id:'headless',parent_id:null,reference:'headless',title:'Headless Renderer',description:'Render with the original code',status:'open',priority:'M',complexity:2,due_date:null,next_week:false,order:0}]});
  const reference=spawnSync('python3',['renderer/render.py'],{input,encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,FONTCONFIG_FILE:path.resolve('renderer/fonts.conf'),PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(reference.status,0,reference.stderr);
  const rendering=spawnSync('docker',['run','--rm','--pull=never','-i','-e','FONTCONFIG_FILE=renderer/fonts.conf','--entrypoint','/usr/bin/python3','mwaeckerlin/todo','renderer/render.py'],{input,encoding:'utf8',maxBuffer:16*1024*1024});
  assert.equal(rendering.status,0,rendering.stderr);assert.equal(rendering.stderr,'');
  function compare(actual,expected,formats=['svg','html']){for(const format of formats){
    const digest=value=>createHash('sha256').update(value).digest('hex');
    const index=[...actual[format]].findIndex((character,index)=>character!==expected[format][index]);
    assert.equal(digest(actual[format]),digest(expected[format]),`Original ${format} output differs near ${index}: ${JSON.stringify(actual[format].slice(Math.max(0,index-60),index+100))} versus ${JSON.stringify(expected[format].slice(Math.max(0,index-60),index+100))}`);
  }}
  const originalProgram=await readFile('tests/original-renderer.py','utf8');
  function original(source,today){
    const result=spawnSync('docker',['run','--rm','--pull=never','--read-only','--tmpfs','/tmp:rw,mode=1777','-e','FONTCONFIG_FILE=/app/renderer/fonts.conf','-i','--entrypoint','/usr/bin/python3','mwaeckerlin/todo','-c',originalProgram],{input:JSON.stringify({source,today}),encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
    assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');return JSON.parse(result.stdout);
  }
  compare(JSON.parse(rendering.stdout),JSON.parse(reference.stdout),['svg']);
  compare(JSON.parse(rendering.stdout),original('- ⬜M2 Headless Renderer - Render with the original code #headless\n','2026-11-01'));
  let file;
  try{file=JSON.parse(await readFile('artifacts/renderer-reference.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(file){
    assert.equal(file.source_sha256,createHash('sha256').update(await readFile('renderer/task-tree.py')).digest('hex'),'The original file reference must match the current renderer');
    const result=spawnSync('docker',['run','--rm','--pull=never','-i','--entrypoint','/usr/bin/python3','mwaeckerlin/todo','renderer/render.py'],{input:JSON.stringify(file.input),encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
    assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');compare(JSON.parse(result.stdout),file.output,['svg']);compare(JSON.parse(result.stdout),original(file.source,file.input.today));
  }
  console.log('F9 headless non-root image and generated OpenAPI passed');
} finally { docker(['rm',id]);await rm(temporary,{recursive:true,force:true}); }
