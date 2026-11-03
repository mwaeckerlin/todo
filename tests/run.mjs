import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testEnvironment } from './environment.mjs';
const root=process.cwd();
process.chdir(root);
const project=`todo-validation-${process.pid}`;
const failures=[];
const visual=process.argv.includes('--visual');
const runtimeProof=process.argv.includes('--runtime-proof');
const workspaceProof=process.argv.includes('--workspace-proof');
const sidebarProof=process.argv.includes('--sidebar-proof');
const environment=testEnvironment();
const legacyProxy={command:['traefik','--configFile=/etc/traefik/legacy.yml']};
function browserEnvironment(negative){return {TODO_TEST_BASE_PATH:negative?'':'/todo',TODO_TEST_URL:negative?new URL(environment.TODO_TEST_URL).origin:environment.TODO_TEST_URL};}
delete environment.NO_COLOR;
async function command(name,executable,args,extra={}) {
  console.log(`\n==> ${name}`);
  const code=await new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd:root,env:{...environment,...extra},stdio:'inherit'});child.on('error',reject);child.on('exit',code=>resolve(code??1));});
  return code;
}
async function checked(name,executable,args,extra={}){const code=await command(name,executable,args,extra);if(code!==0)failures.push(`${name}: ${code}`);return code===0;}
async function freePort(){return new Promise((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(String(port)));});});}
environment.TODO_PORT=await freePort();environment.TODO_TEST_URL=`http://localhost:${environment.TODO_PORT}/todo`;
environment.TODO_IDENTITY_URL=`http://localhost:${environment.TODO_PORT}/auth`;
environment.OIDC_IDENTITY_ISSUER='https://previous-identity.invalid/application/o/todo/';
const compose=['compose','-p',project,'-f','docker-compose.yml','-f','tests/databases.compose.yml'];
async function dc(...args){return command(`compose ${args.join(' ')}`,'docker',[...compose,...args]);}
process.on('SIGINT',()=>{void dc('down','--volumes','--remove-orphans').finally(()=>process.exit(130));});
process.on('SIGTERM',()=>{void dc('down','--volumes','--remove-orphans').finally(()=>process.exit(143));});
async function waitFor(url,validate,headers){
  const deadline=Date.now()+300000;let last='not ready';
  while(Date.now()<deadline){try{const response=await fetch(url,{headers,signal:AbortSignal.timeout(5000)});if(response.ok&&(!validate||await validate(response)))return;last=`HTTP ${response.status}`;}catch(e){last=e.message;}await new Promise(resolve=>setTimeout(resolve,1000));}
  throw new Error(`Readiness deadline exceeded for ${url}: ${last}`);
}
async function browsers(label,negative=false,reported=false,workspace=false){
  const report=path.join(root,'artifacts',`${label}.json`);
  const code=await command(label,'npx',['playwright','test','--reporter=list,json','--output',path.join(root,'artifacts',`${label}-results`),...(workspace?['--grep','searchable selections retain|list dates follow the browser locale|due date clearing supports|opened parents retain overdue|logout, revocation, invalid cookies|single formatted hover popup|Load selects document titles|empty columns retain half width|cards edit on one click|direct original renderer survives|collapsible task rows align|selected leaf tasks appear|parent and identifier controls persist moves|nested Markdown list moves complete subtrees|narrow screens retain every view|compact workspace, sidebar|project name equals the document title|project title editing validates|direct file opening, merging|live updates retain the current element|viewport editor, persistent formatting']:reported?['--grep','F3 selected TODO files|F4 imported task files|F2 F6 F8 two tabs']:[])],{...browserEnvironment(negative),PLAYWRIGHT_JSON_OUTPUT_FILE:report});
  let stats;try{stats=JSON.parse(await readFile(report,'utf8')).stats;}catch{throw new Error(`No browser report for ${label}`);}
  if(negative){if(code===0||stats.expected!==0||stats.unexpected===0||stats.skipped!==0)throw new Error(`The negative proof did not fail every executed case: ${JSON.stringify(stats)}`);}
  else if(code!==0||stats.unexpected!==0||stats.skipped!==0||stats.expected===0){failures.push(`${label}: ${JSON.stringify(stats)}`);return false;}
  console.log(`${label}: ${JSON.stringify(stats)}`);return true;
}
async function identities(){
  const url=environment.TODO_IDENTITY_URL;
  const headers={Authorization:'Bearer local-test-bootstrap-token','content-type':'application/json'};
  for(const name of ['todo-admin','todo-editor','todo-reader']){
    await waitFor(`${url}/api/v3/core/groups/?name=${name}`,async response=>{
      const groups=await response.json();return groups.results?.length===1&&groups.results[0].name===name&&groups.results[0].is_superuser===false;
    },headers);
  }
  for(const [username,group] of [['editor','todo-editor'],['reader','todo-reader'],['unmapped','unmapped']]){
    const groups=await(await fetch(`${url}/api/v3/core/groups/?name=${group}`,{headers})).json();
    let record=groups.results?.[0];
    if(!record&&group!=='unmapped')throw new Error(`The deployed Authentik blueprint did not create ${group}.`);
    if(!record){const r=await fetch(`${url}/api/v3/core/groups/`,{method:'POST',headers,body:JSON.stringify({name:group})});if(!r.ok)throw new Error(`Cannot create test group: ${await r.text()}`);record=await r.json();}
    const response=await fetch(`${url}/api/v3/core/users/`,{method:'POST',headers,body:JSON.stringify({username,name:username,is_active:true,groups:[record.pk],path:'users'})});
    if(!response.ok)throw new Error(`Cannot create test user: ${await response.text()}`);
    const user=await response.json();const password=await fetch(`${url}/api/v3/core/users/${user.pk}/set_password/`,{method:'POST',headers,body:JSON.stringify({password:'local-test-password'})});
    if(!password.ok)throw new Error(`Cannot set local test password: ${await password.text()}`);
  }
}
async function providerReady(){
  const start=await fetch(`${environment.TODO_TEST_URL}/auth/login`,{redirect:'manual',signal:AbortSignal.timeout(25000)});
  if(start.status!==303||!start.headers.get('location'))throw new Error('The OIDC sign-in request could not start.');
  const authorize=await fetch(start.headers.get('location'),{redirect:'manual',signal:AbortSignal.timeout(25000)});
  const destination=authorize.headers.get('location');
  if(authorize.status>=400||(destination&&new URL(destination,environment.TODO_TEST_URL).searchParams.has('error')))throw new Error(`The configured identity provider rejected authorization: ${destination??authorize.status}`);
}
let started=false;
try{
  await mkdir('artifacts',{recursive:true});
  if(visual){
    if(!await checked('Restore diagnostic image','docker',['load','--input','artifacts/runtime-baseline-image.tar']))throw new Error('The preserved diagnostic image could not load.');
    await checked('Container termination before correction','node',['tests/lifecycle.mjs','mwaeckerlin/todo','diagnostic']);
  }else{
  await checked('Architecture diagrams','npm',['run','build:docs']);
  await checked('Documentation contracts','npm',['run','test:docs']);
  await checked('Shared design definitions','npm',['run','test:styles']);
  await checked('Original renderer provenance and output parity','npm',['run','test:renderer']);
  if(!await checked('Browser test discovery','npm',['run','test:inventory']))throw new Error('Browser tests could not be loaded.');
  await checked('Compose syntax','npm',['run','test:compose']);
  await checked('JavaScript dependency audit','npm',['run','test:audit']);
  await checked('Rust dependency audit','npm',['run','test:audit:rust']);
  await checked('Python renderer dependency audit','npm',['run','test:audit:python']);
  const built=await checked('Frontend and Rust build','npm',['run','build:app']);
  if(built)await checked('Rust tests','npm',['run','test:backend']);
  const image=await checked('Docker deliverable build','npm',['run','build']);
  if(image)await checked('Image contract','npm',['run','test:image']);
  if(image)await checked('Docker image archive','npm',['run','image:save']);
  if(image)await checked('Verified image archive restore','npm',['run','image:load']);
  if(image)await checked('Altered image archive rejection','npm',['run','test:archive']);
  if(!built||!image)throw new Error('The delivered application could not be built; dependent browser runs cannot start.');
  }
  if(await dc('up','-d','--wait','database','identity-database','authentik','authentik-worker','todo','proxy')!==0)throw new Error('The isolated Compose environment could not start. Read the preceding Compose build output and artifacts/compose-failure.log.');
  started=true;
  await waitFor(`${environment.TODO_TEST_URL}/health`);
  await waitFor(`${environment.TODO_IDENTITY_URL}/application/o/todo/.well-known/openid-configuration`,async response=>(await response.json()).issuer===`${environment.TODO_IDENTITY_URL}/application/o/todo/`);
  await identities();await providerReady();
  if(visual){
    if(!await checked('Visual fixture','npx',['playwright','test','--project=chromium','--grep','runtime print fixture','--output','artifacts/diagnostic-fixture']))throw new Error('The diagnostic visual fixture could not be created.');
    await checked('Printed task titles and history before correction','node',['tests/print.mjs','diagnostic']);
    await checked('Responsive design diagnostic','node',['tests/scanner.mjs','diagnostic']);
  }else{
  if(sidebarProof){
    const previous=JSON.parse(await readFile('artifacts/sidebar-baseline-image.json','utf8')).id;
    const corrected=JSON.parse(await readFile('artifacts/image.json','utf8')).id;
    if(previous===corrected)throw new Error('Sidebar proof requires the reported image and a distinct correction.');
    if(await command('Load reported sidebar image','docker',['load','--input','artifacts/sidebar-baseline-image.tar'])!==0)throw new Error('Cannot load the reported sidebar image.');
    await writeFile('artifacts/sidebar-baseline.compose.json',JSON.stringify({services:{todo:{image:previous},proxy:legacyProxy}}));
    if(await command('Restore current deliverable tag','docker',['image','tag',corrected,'mwaeckerlin/todo'])!==0)throw new Error('Cannot restore the current deliverable tag.');
    for(let round=1;round<=2;round++)for(const negative of [true,false]){
      const label=`sidebar-${negative?'negative':'positive'}-${round}`;
      const args=negative?[...compose,'-f','artifacts/sidebar-baseline.compose.json','up','-d','--no-build','--force-recreate','todo','proxy']:[...compose,'up','-d','--no-build','--force-recreate','todo','proxy'];
      if(await command(label+' application','docker',args)!==0)throw new Error('Cannot start the sidebar proof application.');
      await waitFor(`${environment.TODO_TEST_URL}/health`);
      const report=path.join(root,'artifacts',`${label}.json`);
      const code=await command(label,'npx',['playwright','test','--grep','sidebar retains complete controls','--reporter=list,json','--output',path.join(root,'artifacts',`${label}-results`)],{...browserEnvironment(negative),PLAYWRIGHT_JSON_OUTPUT_FILE:report});
      const result=JSON.parse(await readFile(report,'utf8'));
      if(negative){
        if(code===0||result.stats.expected!==0||result.stats.unexpected!==2||result.stats.skipped!==0)throw new Error(`The reported sidebar clipping was not reproduced in both browsers: ${JSON.stringify(result.stats)}`);
        const errors=JSON.stringify(result.suites);
        if(!errors.includes('clip')||!errors.includes('toBeLessThanOrEqual'))throw new Error('The reported sidebar proof failed outside the clipping measurement.');
      }else if(code!==0||result.stats.expected!==2||result.stats.unexpected!==0||result.stats.skipped!==0)failures.push(`${label}: ${JSON.stringify(result.stats)}`);
    }
  }
  if(runtimeProof||workspaceProof){
    const corrected=JSON.parse(await readFile('artifacts/image.json','utf8')).id;
    const previous=JSON.parse(await readFile('artifacts/runtime-baseline-image.json','utf8')).id;
    if(!/^sha256:[a-f0-9]{64}$/.test(corrected)||!/^sha256:[a-f0-9]{64}$/.test(previous)||corrected===previous)throw new Error('Runtime proof requires two distinct saved image identities.');
    if(await command('Load runtime baseline','docker',['load','--input','artifacts/runtime-baseline-image.tar'])!==0)throw new Error('Cannot load runtime baseline.');
    const baseline=`todo-runtime-baseline:${previous.slice(7,23)}`;
    if(await command('Tag runtime baseline','docker',['image','tag',previous,baseline])!==0||await command('Restore deliverable tag','docker',['image','tag',corrected,'mwaeckerlin/todo'])!==0)throw new Error('Cannot establish runtime proof image tags.');
    await writeFile('artifacts/runtime-baseline.compose.json',JSON.stringify({services:{todo:{image:baseline},proxy:legacyProxy}}));
    for(let round=1;round<=2;round++)for(const negative of [true,false]){
      const label=`runtime-${negative?'negative':'positive'}-${round}`;
      if(workspaceProof){
        const args=negative?[...compose,'-f','artifacts/runtime-baseline.compose.json','up','-d','--no-build','--force-recreate','todo','proxy']:[...compose,'up','-d','--no-build','--force-recreate','todo','proxy'];
        if(await command(label+' workspace application','docker',args)!==0)throw new Error('Cannot start workspace proof application.');
        await waitFor(`${environment.TODO_TEST_URL}/health`);await browsers(`workspace-${negative?'negative':'positive'}-${round}`,negative,false,true);
      }
      if(!runtimeProof)continue;
      const code=await command(label+' termination','node',['tests/lifecycle.mjs',negative?baseline:'mwaeckerlin/todo',label]);
      const stop=JSON.parse(await readFile(`artifacts/${label}-lifecycle.json`,'utf8'));
      if(stop.image_id!==(negative?previous:corrected)||!stop.ready||stop.oom_killed||stop.stop_signal!=='SIGTERM'||(negative?(code===0||stop.exit_code!==137):(code!==0||stop.exit_code!==0)))throw new Error(`Unexpected termination proof: ${JSON.stringify(stop)}`);
      const args=negative?[...compose,'-f','artifacts/runtime-baseline.compose.json','up','-d','--no-build','--force-recreate','todo','proxy']:[...compose,'up','-d','--no-build','--force-recreate','todo','proxy'];
      if(await command(label+' application','docker',args)!==0)throw new Error('Cannot start runtime proof application.');
      await waitFor(`${environment.TODO_TEST_URL}/health`);
      if(!await checked(label+' fixture','npx',['playwright','test','--project=chromium','--grep','runtime print fixture','--output',`artifacts/${label}-fixture`],browserEnvironment(negative)))throw new Error('Cannot create the runtime print fixture.');
      const content=await command(label+' printed content','node',['tests/print.mjs',label]);
      const printed=JSON.parse(await readFile(`artifacts/${label}/print-results.json`,'utf8'));
      if(negative){if(content===0||printed.measurements.board!==false||printed.measurements.history!==false)throw new Error(`The negative printed-content proof did not reproduce hidden titles and revisions: ${JSON.stringify(printed)}`);}
      else if(content!==0||printed.failures.length)failures.push(`${label} printed content: ${JSON.stringify(printed)}`);
      const scan=await command(label+' print','node',['tests/scanner.mjs',label,'--print-only']);
      const report=JSON.parse(await readFile(`artifacts/${label}/scanner-results.json`,'utf8'));
      if(negative){if(scan===0||!report.failures.length||report.failures.some(message=>!message.includes('expected one complete bubble diagram page')))throw new Error(`The negative print proof failed outside pagination: ${JSON.stringify(report)}`);}
      else if(scan!==0||report.failures.length)failures.push(`${label} print: ${JSON.stringify(report)}`);
    }
  }
  if(process.argv.includes('--proof')){
    let baseline;
    try{baseline=(await readFile('artifacts/baseline-image.txt','utf8')).trim();}catch(error){if(error.code!=='ENOENT')throw error;}
    if(baseline){
      if(!/^todo-proof-baseline:[a-f0-9]{16}$/.test(baseline))throw new Error('The saved baseline image name is invalid.');
      const present=spawnSync('docker',['image','inspect',baseline],{stdio:'ignore'});
      if(present.status!==0&&await command('Restore preserved baseline','docker',['load','--input','artifacts/baseline-image.tar'])!==0)throw new Error('The preserved baseline image could not be restored.');
      await writeFile('artifacts/baseline.compose.json',JSON.stringify({services:{todo:{image:baseline},proxy:legacyProxy}}));
      for(let round=1;round<=2;round++){
        if(await command('Original application baseline','docker',[...compose,'-f','artifacts/baseline.compose.json','up','-d','--no-build','--force-recreate','todo','proxy'])!==0)throw new Error('The baseline application could not start.');
        await waitFor(`${environment.TODO_TEST_URL}/health`);await browsers(`reported-negative-${round}`,true,true);
        if(await dc('up','-d','--no-build','--force-recreate','todo','proxy')!==0)throw new Error('The corrected application could not start.');
        await waitFor(`${environment.TODO_TEST_URL}/health`);await browsers(`reported-positive-${round}`,false,true);
      }
    }
    for(let round=1;round<=2;round++){
      await dc('stop','todo');await browsers(`negative-${round}`,true);await dc('up','-d','todo');await waitFor(`${environment.TODO_TEST_URL}/health`);await browsers(`positive-${round}`);
    }
  }else await browsers('postgres');
  await checked('Container termination','node',['tests/lifecycle.mjs']);
  await dc('restart','todo','database');await waitFor(`${environment.TODO_TEST_URL}/health`);await checked('PostgreSQL persistence after restart','node',['tests/persistence.mjs']);
  for(const driver of ['mysql','mariadb']){
    await dc('up','-d','--wait',driver);environment.TODO_DATABASE_URL=`mysql://todo:local-test-database@${driver}/todo?ssl-mode=required`;
    if(await dc('up','-d','--force-recreate','todo')!==0){failures.push(`${driver} start failed`);continue;}
    await waitFor(`${environment.TODO_TEST_URL}/health`);await browsers(driver);
    await dc('restart','todo',driver);await waitFor(`${environment.TODO_TEST_URL}/health`);await checked(`${driver} persistence after restart`,'node',['tests/persistence.mjs']);
  }
  await checked('Responsive design scanner','node',['tests/scanner.mjs']);
  await checked('Printed task titles and history','node',['tests/print.mjs']);
  }
}catch(e){failures.push(e.message);const logs=spawnSync('docker',[...compose,'logs','--no-color'],{cwd:root,env:environment,encoding:'utf8',maxBuffer:32*1024*1024});await writeFile('artifacts/compose-failure.log',(logs.stdout??'')+(logs.stderr??''));}
finally{try{await writeFile('artifacts/results.json',JSON.stringify({failures,at:new Date().toISOString()},null,2));}finally{if(started||failures.length)await dc('down','--volumes','--remove-orphans');}}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('All task-service checks passed');
