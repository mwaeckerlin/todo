import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const image=process.argv[2]??'mwaeckerlin/todo';
const label=process.argv[3]??'image';
assert.match(image,/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/);
assert.match(label,/^[a-z0-9][a-z0-9-]*$/);
function docker(args){const result=spawnSync('docker',args,{encoding:'utf8',maxBuffer:4*1024*1024});if(result.status!==0)throw new Error(result.stderr||result.stdout);return result.stdout;}
let id='';
function cleanup(){if(id){docker(['rm','-f',id]);id='';}}
process.once('SIGINT',()=>{cleanup();process.exit(130);});
process.once('SIGTERM',()=>{cleanup();process.exit(143);});
try{
  id=docker(['create','--name',`todo-lifecycle-${process.pid}`,'--pull=never','--read-only','--tmpfs','/tmp:rw,mode=1777','--cap-drop=ALL','--security-opt','no-new-privileges:true','--publish','127.0.0.1::8080','-e','DATABASE_URL=sqlite:///tmp/lifecycle.db?mode=rwc','-e','APP_ORIGIN=http://localhost:8080','-e','OIDC_ISSUER=http://identity.invalid/','-e','OIDC_CLIENT_SECRET=local-test-lifecycle','-e','ALLOW_INSECURE_HTTP=true',image]).trim();
  console.log(`F9 lifecycle container: ${id}`);
  docker(['start',id]);
  const running=JSON.parse(docker(['inspect',id]))[0];
  const port=running.NetworkSettings.Ports['8080/tcp'][0].HostPort;
  const url=`http://127.0.0.1:${port}/health`;
  let ready=false;let last='not ready';const deadline=Date.now()+20000;
  while(Date.now()<deadline){
    try{const response=await fetch(url,{signal:AbortSignal.timeout(1000)});if(response.ok&&(await response.json()).status==='ready'){ready=true;break;}last=`HTTP ${response.status}`;}catch(error){last=error.message;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,`The lifecycle test service did not become ready: ${last}`);
  const start=performance.now();docker(['stop','-t','5',id]);const duration=performance.now()-start;
  const stopped=JSON.parse(docker(['inspect',id]))[0];
  const report={image,image_id:stopped.Image,ready,stop_signal:stopped.Config.StopSignal||'SIGTERM',exit_code:stopped.State.ExitCode,oom_killed:stopped.State.OOMKilled,stop_duration_ms:duration,passed:stopped.State.ExitCode===0&&!stopped.State.OOMKilled,at:new Date().toISOString()};
  await mkdir('artifacts',{recursive:true});await writeFile(`artifacts/${label}-lifecycle.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  assert.equal(report.oom_killed,false,'The lifecycle test service was terminated by the OOM killer.');
  assert.equal(report.exit_code,0,'The ready service must stop gracefully on Docker termination.');
}finally{cleanup();}
