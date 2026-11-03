import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { testEnvironment } from '#local-test-environment';

const environment=testEnvironment();
const configuration=JSON.parse(execFileSync('docker',['compose','config','--format','json'],{env:environment,encoding:'utf8'}));
const origin=configuration.services.todo.environment.APP_ORIGIN;
const appURL=`${origin}${configuration.services.todo.environment.APP_BASE_PATH}/`;
const appBase=configuration.services.todo.environment.APP_BASE_PATH;
const address=new URL(origin);
if(address.protocol!=='http:'||!['localhost','127.0.0.1'].includes(address.hostname))throw new Error('The sample requires the local HTTP demonstration configuration.');
if(new URL(configuration.services.todo.environment.DATABASE_URL).hostname!=='database')throw new Error('The sample requires the database of its own Compose project.');
const provider=configuration.services.todo.environment.OIDC_ISSUER;
const projectName=`${configuration.name}-demo`;
await mkdir('artifacts',{recursive:true});
let runtime;
try{runtime=JSON.parse(await readFile('artifacts/demo-runtime.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
let previous;
try{previous=JSON.parse(await readFile('artifacts/demo.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(runtime&&(runtime.project!==projectName||path.dirname(runtime.directory)!==os.tmpdir()||!path.basename(runtime.directory).startsWith('todo-demo-')))throw new Error('The saved demo configuration does not match this local Compose project.');
if(process.argv.includes('--stop')){
  if(runtime){execFileSync('docker',['compose','--project-directory',runtime.directory,'-f',path.join(runtime.directory,'compose.json'),'-p',projectName,'down'],{env:environment,stdio:'inherit'});console.log('The demo is stopped. Its data volumes are retained.');}
  else console.log('No local demo has been started.');
  process.exit(0);
}
if(!runtime)runtime={project:projectName,directory:await mkdtemp(path.join(os.tmpdir(),'todo-demo-'))};
await mkdir(runtime.directory,{recursive:true});
const imageNames={};
for(const [name,service]of Object.entries(configuration.services)){if(service.build){service.image??=`${configuration.name}-${name}`;imageNames[name]=service.image;delete service.build;}}
configuration.name=projectName;
for(const group of ['volumes','networks'])for(const [name,resource]of Object.entries(configuration[group]??{})){if(resource.external)throw new Error('The local demo requires its own networks and data volumes.');resource.name=`${projectName}_${name}`;}
const composeFile=path.join(runtime.directory,'compose.json');
try{
  const installed=JSON.parse(await readFile(composeFile,'utf8'));
  const identity=installed.services.todo.environment;
  configuration.services.todo.environment.OIDC_IDENTITY_ISSUER=identity.OIDC_IDENTITY_ISSUER||identity.OIDC_ISSUER;
}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(composeFile,JSON.stringify(configuration,null,2).replaceAll('$','$$'),{mode:0o600});
await writeFile('artifacts/demo-runtime.json',JSON.stringify(runtime,null,2),{mode:0o600});
console.log(`Starting the local sample at ${appURL} (${projectName})`);
if(process.argv.includes('--archive'))execFileSync(process.execPath,['scripts/image.mjs','--load'],{env:environment,stdio:'inherit'});
for(const name of ['proxy','todo','authentik','authentik-worker']){
  try{execFileSync('docker',['image','inspect',imageNames[name]],{stdio:'ignore'});}
  catch{execFileSync('docker',['compose','build',name],{env:environment,stdio:'inherit'});}
}
execFileSync('docker',['compose','--project-directory',runtime.directory,'-f',composeFile,'-p',projectName,'up','-d','--no-build','--pull','never','--remove-orphans'],{env:environment,stdio:'inherit'});
const container=execFileSync('docker',['compose','--project-directory',runtime.directory,'-f',composeFile,'-p',projectName,'ps','-q','todo'],{env:environment,encoding:'utf8'}).trim();
const imageId=execFileSync('docker',['inspect','--format','{{.Image}}',container],{encoding:'utf8'}).trim();
if(process.argv.includes('--archive')&&imageId!==JSON.parse(await readFile('artifacts/image.json','utf8')).id)throw new Error('The running sample differs from the verified image archive.');

async function ready(url){
  const deadline=Date.now()+300000;
  while(Date.now()<deadline){try{const response=await fetch(url,{signal:AbortSignal.timeout(5000)});if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
  throw new Error(`The local service did not become ready: ${url}`);
}
await ready(`${appURL}health`);
await ready(`${provider}.well-known/openid-configuration`);
for(const name of ['todo-admin','todo-editor','todo-reader']){
  const deadline=Date.now()+300000;
  while(true){
    const response=await fetch(`${origin}/auth/api/v3/core/groups/?name=${name}`,{headers:{Authorization:`Bearer ${configuration.services.authentik.environment.AUTHENTIK_BOOTSTRAP_TOKEN}`},signal:AbortSignal.timeout(5000)});
    const group=response.ok?(await response.json()).results?.find(group=>group.name===name):undefined;
    if(group&&group.is_superuser===false)break;
    if(Date.now()>=deadline)throw new Error(`The Authentik deployment did not install ${name}.`);
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
}
const {chromium,expect}=await import('@playwright/test');
const browser=await chromium.launch();
let page;
const browserErrors=[];
try{
  const context=await browser.newContext({baseURL:appURL,viewport:{width:2400,height:1200}});
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>browserErrors.push(error.message));
  page.on('requestfailed',request=>browserErrors.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  await page.goto(appURL);await page.getByRole('link',{name:'Sign in with Authentik'}).click();
  await page.locator('input[name="uidField"]').fill('akadmin');await page.getByRole('button',{name:/Log in|Continue|Next/}).click();
  const passwordStage=page.locator('ak-stage-password');
  await passwordStage.locator('input[type="password"]').fill(configuration.services.authentik.environment.AUTHENTIK_BOOTSTRAP_PASSWORD);await passwordStage.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('button',{name:'New project',exact:true})).toBeVisible({timeout:30000});
  const me=await(await page.request.get(`${appBase}/api/me`)).json();
  const identityIssuer=configuration.services.todo.environment.OIDC_IDENTITY_ISSUER||provider;
  const expectedIdentity=createHash('sha256').update(`${identityIssuer}\0${me.identity.subject}`).digest('base64url');
  if(me.user.id!==expectedIdentity)throw new Error('The sample identity changed when its public identity-provider address moved.');
  const headers={origin,'x-csrf-token':me.csrf_token};
  const name=process.env.DEMO_PROJECT_NAME??'Demo';
  const projects=await(await page.request.get(`${appBase}/api/projects`)).json();
  let project=(!process.env.DEMO_PROJECT_NAME&&previous?.compose_project===projectName&&new URL(previous.url).origin===origin?projects.find(item=>item.id===previous.project):undefined)??projects.find(item=>item.name===name);
  if(!project){
    await page.getByRole('button',{name:'New project',exact:true}).click();await page.getByLabel('Project name').fill(name);await page.getByRole('button',{name:'Create project',exact:true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();const id=new URL(page.url()).searchParams.get('project');project={id,name};
  }else await page.getByRole('combobox',{name:'Project',exact:true}).selectOption(project.id);
  const base=`${appBase}/api/projects/${project.id}`;
  const snapshot=async()=>await(await page.request.get(base)).json();
  let current=await snapshot();
  function day(offset,compact=false){const date=new Date();date.setDate(date.getDate()+offset);return[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join(compact?'':'-');}
  if(!current.tasks.length){
    const source=[
      `- ⏳H7 ${day(7,true)} Release - Prepare the Next Product Release [${me.user.username}] #demo-release ^`,
      `  - ⏳H4 API - Deliver the Task Service [${me.user.username}] #demo-api`,
      '    - ✅M2 Authentication - Verify Authentik Sign-In #demo-auth',
      '    - ⏳H3 History - Preserve Every Saved Revision #demo-history',
      '    - 📄M2 Live Updates - Synchronise Open Browser Tabs #demo-live',
      '  - 📄M4 Interface - Review Bubbles and Boards #demo-interface',
      '    - ✅M1 Boards - Navigate Task Hierarchies #demo-board',
      `    - ⬜H2 ${day(3,true)} Mobile Layout - Review the Narrow Screen #demo-mobile`,
      '  - ⏸M3 Review - Await Acceptance Feedback #demo-review',
      '  - ❌L1 Legacy Experiment - Retain the Dropped Work #demo-dropped',
      '- ⬜M5 Backlog - Organise Future Work #demo-backlog',
      '  - ⬜M3 Trello Import - Evaluate a Later Integration #demo-trello',
      '- 🔀M2 Operations - Prepare a Local Deployment #demo-operations',
      '  - ✅M1 Container - Build the Headless Service #demo-container',
      '  - 📄L2 Documentation - Review the Local Setup #demo-docs',
      '', '# demo-api API', '', '## Acceptance', '', '- OIDC sign-in', '- Live updates', '- Complete edit history', '',
      '# demo-history History', '', '## Saved Revisions', '', 'The first saved details remain available in task history.',
    ].join('\n');
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'Load',exact:true}).click()]);
    const imported=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`${appBase}/api/load`);
    await chooser.setFiles({name:'TODO.md',mimeType:'text/markdown',buffer:Buffer.from(`# ${current.name}\n\n${source}`)});const response=await imported;if(!response.ok())throw new Error(`Sample tasks could not import: ${await response.text()}`);await expect(page.getByRole('button',{name:'Load',exact:true})).toBeEnabled();current=await snapshot();
  }
  async function post(path,data){const response=await page.request.post(path,{headers,data});if(!response.ok())throw new Error(`Sample data could not be saved (${response.status()}): ${await response.text()}`);return await response.json();}
  let sprint=current.sprints.find(item=>item.title==='Demo Sprint');
  if(current.tasks.some(task=>task.reference==='demo-release')&&!sprint){sprint=await post(`${base}/sprints`,{sprint:{id:crypto.randomUUID(),title:'Demo Sprint',goal:'Review the Task Views and Saved Revisions',start_date:day(0),end_date:day(13),status:current.sprints.some(item=>item.status==='active')?'planned':'active'},expected_sequence:current.sequence});current=await snapshot();}
  const save=(task,patch)=>post(`${base}/tasks/${task.id}`,{task:{...task,...patch},expected_version:task.version});
  const release=current.tasks.find(task=>task.reference==='demo-release');if(release?.version===1&&sprint)await save(release,{sprint_id:sprint.id});
  const authentication=current.tasks.find(task=>task.reference==='demo-auth');const mobile=current.tasks.find(task=>task.reference==='demo-mobile');if(mobile?.version===1&&authentication)await save(mobile,{depends_on:[authentication.id],sprint_id:sprint?.id??null});
  let history=current.tasks.find(task=>task.reference==='demo-history');
  if(history?.version===1)history=await save(history,{description:'Inspect the Earlier Description',details:'## Saved Revisions\n\nA second saved version demonstrates the revision list.'});
  if(history?.version===2&&history.description==='Inspect the Earlier Description')await save(history,{description:'Compare Saved Versions and Restore Selected Fields',details:'## Saved Revisions\n\nChoose **Task history** to inspect earlier descriptions and details. Restore individual fields or the complete task.'});
  const review=current.tasks.find(task=>task.reference==='demo-review');if(review?.version===1&&history)await save(review,{depends_on:[history.id]});
  await page.goto(`${appURL}?project=${project.id}`);await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeEnabled();
  current=await snapshot();await expect(page.locator('.project-picker option:checked')).toHaveText(current.name);await expect(page.locator('nav.breadcrumbs button').first()).toHaveText(current.name);await expect(page).toHaveTitle(current.name);const diagram=page.locator('.task-tree-host');await expect(diagram.locator('#svg circle').first()).toBeVisible({timeout:60000});await expect(diagram.locator('#svg text').first()).toBeVisible();if(current.tasks.some(task=>task.reference==='demo-release'&&!task.archived))await expect(diagram.getByRole('button',{name:'Bubble Release',exact:true})).toBeVisible();
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/demo.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  async function mobileView(name){const menu=page.getByRole('button',{name:'Expand sidebar',exact:true});if(await menu.isVisible())await menu.click();await page.getByRole('tab',{name,exact:true}).click();}
  async function mobileCapture(name){
    const frame=page.locator('.task-tree-host');if(await frame.count())await diagram.locator('#svg').evaluate(async svg=>{
      await svg.ownerDocument.fonts.ready;let previous='',stable=0;const deadline=performance.now()+15000;
      while(stable<3&&performance.now()<deadline){await new Promise(requestAnimationFrame);const current=svg.getAttribute('viewBox');stable=current===previous?stable+1:0;previous=current;}
      if(stable<3)throw new Error('The task diagram did not settle before its mobile preview.');
    });
    const overflow=await page.evaluate(()=>{
      const documents=[document,...[...document.querySelectorAll('task-tree-view')].map(host=>host.shadowRoot).filter(Boolean)];
      return documents.flatMap(doc=>[...doc.querySelectorAll('*')].filter(element=>element instanceof HTMLElement&&element.clientWidth&&element.getClientRects().length&&!element.matches('input,select,option')&&getComputedStyle(element).opacity!=='0'&&!(getComputedStyle(element).textOverflow==='ellipsis'&&getComputedStyle(element).overflowX==='hidden')&&element.scrollWidth>element.clientWidth+1).map(element=>({tag:element.tagName,classes:element.className,width:element.clientWidth,scroll:element.scrollWidth})));
    });
    if(overflow.length)throw new Error(`Mobile content requires horizontal scrolling: ${JSON.stringify(overflow)}`);
    await page.screenshot({path:`artifacts/demo-mobile-${name}.png`,fullPage:true});
  }
  await mobileCapture('bubbles');await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();await mobileCapture('sidebar');await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();const firstBranch=diagram.locator('circle[data-parent="0"]').first();const reference=(await firstBranch.getAttribute('data-reference')).replace(/^#/,'');await firstBranch.press('Enter');await expect(page.getByRole('combobox',{name:'Task level',exact:true})).not.toHaveValue('');await expect(page.getByRole('button',{name:'Edit current task',exact:true,includeHidden:true})).toHaveCount(0);await expect(page.locator('.task-tree-host')).toHaveAttribute('data-host-reference',reference);await diagram.locator('main').click({position:{x:1,y:1}});await expect(page.getByRole('combobox',{name:'Task level',exact:true})).toHaveValue('');await expect(page.locator('.task-tree-host')).toHaveAttribute('data-host-reference','');const legend=diagram.locator('details.tree-legend');await legend.getByText('Legend',{exact:true}).click();await mobileCapture('legend');await legend.getByText('Legend',{exact:true}).click();
  await mobileView('Board');await mobileCapture('board');const firstCard=page.getByTestId('task-card').first();if(await firstCard.isVisible()){
    await firstCard.locator('.card-title').click();await expect(page.locator('.milkdown .ProseMirror')).toBeVisible();
    const fields=await page.locator('.task-fields').boundingBox();const content=await page.locator('.editor-content').boundingBox();if(content.y<fields.y+fields.height)throw new Error('Mobile task fields overlap the details editor.');
    await mobileCapture('editor');await page.locator('.editor-content').scrollIntoViewIfNeeded();await mobileCapture('editor-details');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  await mobileView('List');await mobileCapture('list');await page.setViewportSize({width:2400,height:1200});await page.screenshot({path:'artifacts/demo-list.png',fullPage:true});const row=page.locator('.list-row').first();await row.locator('.list-title').click();await expect(row).toHaveAttribute('data-selected','true');await page.mouse.move(1,1);await page.screenshot({path:'artifacts/demo-list-selected.png',fullPage:true});await mobileView('Board');await page.screenshot({path:'artifacts/demo-board.png',fullPage:true});await mobileView('Bubbles');
  await mobileView('Board');const desktopCard=page.getByTestId('task-card').first();if(await desktopCard.isVisible()){await desktopCard.locator('.card-title').click();await expect(page.locator('.milkdown-top-bar')).toBeVisible();await page.screenshot({path:'artifacts/demo-editor.png',fullPage:true});await page.getByRole('button',{name:'Show dependencies',exact:true}).click();await page.screenshot({path:'artifacts/demo-dependencies.png',fullPage:true});await page.getByRole('combobox',{name:'Dependencies',exact:true}).press('Escape');await page.getByRole('button',{name:'Cancel',exact:true}).click();}await mobileView('Bubbles');
  const result={url:page.url(),identity_url:`${origin}/auth/if/admin/`,user_id:me.user.id,project:project.id,name:current.name,tasks:current.tasks.length,sprints:current.sprints.length,compose_project:projectName,image_id:imageId,at:new Date().toISOString()};await writeFile('artifacts/demo.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}catch(error){
  if(page){await page.screenshot({path:'artifacts/demo-failure.png',fullPage:true});await writeFile('artifacts/demo-failure.txt',`${page.url()}\n${await page.locator('body').innerText()}\n${JSON.stringify(browserErrors)}`);}
  throw error;
}finally{await browser.close();}
