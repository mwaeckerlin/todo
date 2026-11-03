import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const createdProjects=new Set<string>();
test('F3 F4 F5 F12 complex public sample retains its hierarchy in every view', async ({page}) => {
  await login(page);await project(page);
  const source=await readFile('tests/fixtures/opensource.md','utf8');
  const count=source.split('\n').filter(line=>/^ *- [⬜📄⏳🔀✅⏸❌]/u.test(line)).length;
  await uploadTaskFile(page,source);
  await page.getByRole('tab',{name:'Bubbles',exact:true}).click();
  await expect(tree(page).locator('#svg circle[data-index]').first()).toBeVisible();
  await expect(tree(page).getByRole('button',{name:'Bubble Container Foundations',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Board',exact:true}).click();
  await expect(page.getByTestId('task-card')).toHaveCount(7);
  const card=page.getByTestId('task-card').filter({has:page.getByText('Container Foundations',{exact:true})});
  await expect(card.getByText('scratch',{exact:true})).toBeVisible();
  await card.getByText('scratch',{exact:true}).click();
  await expect(page.getByTestId('task-card')).toHaveCount(4);
  await expect(page.getByTestId('task-card').filter({has:page.getByText('very-base',{exact:true})})).toBeVisible();
  await page.locator('nav.breadcrumbs button').first().click();
  await page.getByRole('tab',{name:'List',exact:true}).click();
  await expect(page.locator('.list-row')).toHaveCount(count);
  await expect(page.locator('.list-title').filter({hasText:/^webdesign-scanner$/})).toBeVisible();
  const id=new URL(page.url()).searchParams.get('project');
  const saved=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();
  expect(saved.tasks).toHaveLength(count);
  expect(saved.tasks.find(task=>task.reference==='foundations').details).toContain('## Acceptance');
  await page.reload();await expandSidebar(page);
  await page.getByRole('tab',{name:'List',exact:true}).click();
  await expect(page.locator('.list-row')).toHaveCount(count);
});
test.afterEach(async({browser},info)=>{
  if(info.title.includes('runtime print fixture')||info.title.includes('persistence fixture')){createdProjects.clear();return;}
  if(!createdProjects.size)return;
  const context=await browser.newContext();try{const admin=await context.newPage();await login(admin);const me=await(await admin.request.get(`${appURL}/api/me`)).json();const headers={'X-CSRF-Token':me.csrf_token,Origin:appOrigin};
    for(const id of createdProjects){const response=await admin.request.get(`${appURL}/api/projects/${id}`);if(response.status()===404)continue;expect(response.ok(),await response.text()).toBe(true);const current=await response.json();const removed=await admin.request.delete(`${appURL}/api/projects/${id}`,{headers,data:{expected_sequence:current.sequence}});expect(removed.ok(),await removed.text()).toBe(true);}
  }finally{createdProjects.clear();await context.close();}
});
const tree=(page:Page)=>page.locator('.task-tree-host');
async function selectEntry(page:Page,label:string,title:string){const input=page.getByRole('combobox',{name:label,exact:true});await input.fill(title);await page.getByRole('listbox').getByRole('option',{name:title,exact:true}).click();await input.press('Escape');}
async function circlePoint(circle:Locator,region:'circle'|'title'|'body'='circle'){
  await circle.scrollIntoViewIfNeeded();
  return await circle.evaluate(async(element,region)=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';
    const svg=(element as SVGCircleElement).ownerSVGElement!;await element.ownerDocument.fonts.ready;
    let previous='',stable=0;const deadline=performance.now()+15000;
    while(stable<3&&performance.now()<deadline){await new Promise(requestAnimationFrame);const current=svg.getAttribute('viewBox')+':'+JSON.stringify(element.getBoundingClientRect());stable=current===previous?stable+1:0;previous=current;}
    if(stable<3)throw new Error('The circle did not settle before choosing its mouse position.');
    const bounds=element.getBoundingClientRect();const ownerWindow=element.ownerDocument.defaultView!;
    const root=element.getRootNode() as ShadowRoot;const host=root.host;
    const titles=[...svg.querySelectorAll<SVGTextElement>(`text[data-label-for="${(element as SVGCircleElement).dataset.index}"]`)];
    function exposed(localX:number,localY:number){
      const x=localX,y=localY;
      if(x<0||y<0||x>=ownerWindow.innerWidth||y>=ownerWindow.innerHeight)return null;
      if(root.elementFromPoint(x,y)!==element)return null;
      if(element.ownerDocument.elementFromPoint(x,y)!==host)return null;
      return{x,y};
    }
    if(region==='title'){
      for(const title of titles)for(let index=0;index<title.getNumberOfChars();index++){
        const glyph=title.getExtentOfChar(index);if(!glyph.width||!glyph.height)continue;
        const centre=new DOMPoint(glyph.x+glyph.width/2,glyph.y+glyph.height/2).matrixTransform(title.getScreenCTM()!);
        const point=exposed(centre.x,centre.y);if(point)return point;
      }
      throw new Error('The title has no exposed character in the visible browser area.');
    }
    for(const fraction of [.999,.997,.995,.99,.98,.95,.9,.75,.5])for(let angle=0;angle<360;angle+=15){
      const localX=bounds.x+bounds.width/2+Math.cos(angle*Math.PI/180)*bounds.width*fraction/2;
      const localY=bounds.y+bounds.height/2+Math.sin(angle*Math.PI/180)*bounds.height*fraction/2;
      if(region==='body'&&titles.some(title=>{const box=title.getBoundingClientRect();return localX>=box.left&&localX<=box.right&&localY>=box.top&&localY<=box.bottom;}))continue;
      const point=exposed(localX,localY);if(point)return point;
    }
    throw new Error('The circle has no exposed point in the visible browser area.');
  },region);
}
async function clickCircle(circle:Locator){const point=await circlePoint(circle);await circle.page().mouse.click(point.x,point.y);}
async function doubleClickCircle(circle:Locator,region:'title'|'body'){const point=await circlePoint(circle,region);await circle.page().mouse.dblclick(point.x,point.y);}
async function readyTree(page:Page,saved:{id:string;version:number}){
  const reference=await page.locator('nav.breadcrumbs').getAttribute('data-reference');
  await expect.poll(()=>page.locator('.task-tree-host').evaluate((element,saved)=>{
    const host=element as HTMLElement;const source=new URL(host.dataset.source??location.href);
    const index=source.searchParams.get('tasks')?.split(',').indexOf(saved.id)??-1;
    const versions=source.searchParams.get('version')?.split('.')??[];
    return index>=0&&Number(versions[index])===saved.version&&!!element.shadowRoot?.querySelector('#svg');
  },saved)).toBe(true);
  await expect.poll(()=>page.locator('.task-tree-host').evaluate(element=>(element as HTMLElement).dataset.hostReference)).toBe(reference);
}
function taskResponse(page:Page){
  const path=`${appBase}/api/projects/${new URL(page.url()).searchParams.get('project')}/tasks/`;
  return page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.startsWith(path));
}
async function measureLabelPaint(element:HTMLElement|SVGElement){
  const svg=element as SVGSVGElement;await document.fonts.ready;
  let previous='',stable=0;const deadline=performance.now()+15000;
  while(stable<3&&performance.now()<deadline){await new Promise(requestAnimationFrame);const current=svg.getAttribute('viewBox')+':'+svg.getBoundingClientRect().width;stable=current===previous?stable+1:0;previous=current;}
  if(stable<3)throw new Error('The original diagram did not settle before the raster measurement.');
  const texts=[...svg.querySelectorAll<SVGTextElement>('text[data-label-for]')];
  const circles=[...svg.querySelectorAll<SVGCircleElement>('circle[data-index]')];
  const copy=svg.cloneNode(true) as SVGSVGElement;copy.querySelectorAll('circle').forEach(circle=>circle.remove());
  const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=[...document.querySelectorAll('head style'),...(svg.getRootNode() as ShadowRoot).querySelectorAll('style')].map(style=>style.textContent).join('\n');copy.prepend(style);
  copy.style.fontFamily=getComputedStyle(svg).fontFamily;copy.style.maxBlockSize='none';
  const copiedTexts=[...copy.querySelectorAll<SVGTextElement>('text[data-label-for]')];
  copiedTexts.forEach(text=>{text.style.display='none';text.setAttribute('fill','#000000');text.setAttribute('stroke','#000000');});
  const view=svg.viewBox.baseVal;const scale=Math.max(1,svg.getScreenCTM()!.a);const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width*scale);canvas.height=Math.ceil(view.height*scale);
  copy.setAttribute('width',String(canvas.width));copy.setAttribute('height',String(canvas.height));copy.setAttribute('preserveAspectRatio','none');
  const ctx=canvas.getContext('2d')!;
  // Pixel centres represent areas with this half-diagonal in the SVG coordinate system.
  const tolerance=Math.hypot(view.width/canvas.width,view.height/canvas.height)/2;
  const labels=[];const failures=[];
  for(let index=0;index<texts.length;index++){
    const text=texts[index];const circle=circles.find(circle=>circle.dataset.index===text.dataset.labelFor)!;
    const ring=svg.querySelector<SVGCircleElement>(`circle[data-ring="${circle.dataset.index}"]`);
    const x=Number(circle.getAttribute('cx')),y=Number(circle.getAttribute('cy'));
    const inner=Number(circle.getAttribute('r'))-Number(circle.getAttribute('stroke-width'))/2;
    const radius=ring?Math.min(inner,Number(ring.getAttribute('r'))-Number(ring.getAttribute('stroke-width'))/2):inner;
    const children=circles.filter(child=>child.dataset.parent===circle.dataset.index).map(child=>({x:Number(child.getAttribute('cx')),y:Number(child.getAttribute('cy')),radius:Number(child.getAttribute('r'))+Number(child.getAttribute('stroke-width'))/2}));
    // Isolate labels: low-alpha pixels cannot preserve a unique RGB identity after premultiplication.
    copiedTexts[index].style.display='';const source=new XMLSerializer().serializeToString(copy);
    const image=new Image();image.src=`data:image/svg+xml,${encodeURIComponent(source)}`;await image.decode();
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let pixels=0,inside=true,clear=true;const violations=[];
    for(let pixel=0;pixel<canvas.width*canvas.height;pixel++){
      if(!data[pixel*4+3])continue;
      const px=view.x+(pixel%canvas.width+.5)*view.width/canvas.width,py=view.y+(Math.floor(pixel/canvas.width)+.5)*view.height/canvas.height;
      const inParent=Math.hypot(px-x,py-y)<=radius+tolerance;
      const outsideChildren=children.every(child=>Math.hypot(px-child.x,py-child.y)>=child.radius-tolerance);
      pixels++;inside&&=inParent;clear&&=outsideChildren;
      if((!inParent||!outsideChildren)&&violations.length<5)violations.push({x:px,y:py,alpha:data[pixel*4+3],inParent,outsideChildren});
    }
    const result={task:circle.getAttribute('aria-label'),text:text.textContent,pixels,inside,clear,violations};labels.push(result);
    if((!pixels||!inside||!clear)&&!failures.length)failures.push({index,...result,svg:source,png:canvas.toDataURL('image/png')});
    copiedTexts[index].style.display='none';
  }
  return{labels,failures};
}
const password = 'local-test-password';
const appBase=process.env.TODO_TEST_BASE_PATH??'/todo';
const appURL=process.env.TODO_TEST_URL??`http://localhost:8326${appBase}`;
const appOrigin=new URL(appURL).origin;
async function authenticate(page: Page, username: string) {
  await page.goto(appURL);
  await page.getByRole('link', { name: 'Sign in with Authentik' }).click();
  const uid = page.locator('input[name="uidField"]');
  await uid.or(page.getByRole('button',{name:'Sign out',exact:true})).or(page.getByRole('button',{name:'Expand sidebar',exact:true})).first().waitFor({state:'visible'});
  if(!await uid.isVisible())return;
  await uid.waitFor({state:'visible'}); await uid.fill(username); await uid.press('Enter');
  const passwordStage = page.locator('ak-stage-password');
  const pass = passwordStage.locator('input[type="password"]');
  await pass.waitFor({ state: 'visible' }); await pass.fill(password);
  await pass.press('Enter');
}
async function expandSidebar(page:Page){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const button=page.getByRole('button',{name:'Expand sidebar',exact:true});if(await button.isVisible())await button.click();await expect(page.getByRole('complementary',{name:'Project sidebar'})).toBeVisible();}
async function login(page:Page,username='akadmin'){await authenticate(page,username);await expect(page.getByRole('button',{name:'Sign out',exact:true}).or(page.getByRole('button',{name:'Expand sidebar',exact:true})).first()).toBeVisible();await expandSidebar(page);await expect(page.getByRole('combobox',{name:'Project',exact:true})).toBeVisible();}
async function project(page:Page){
  const me=await(await page.request.get(`${appBase}/api/me`)).json();
  if(me.user.role!=='admin'){
    const context=await page.context().browser()!.newContext();const admin=await context.newPage();await login(admin);await project(admin);
    const id=new URL(admin.url()).searchParams.get('project')!;const current=await(await admin.request.get(`${appURL}/api/projects/${id}`)).json();const identity=await(await admin.request.get(`${appURL}/api/me`)).json();
    const granted=await admin.request.post(`${appURL}/api/projects/${id}/members`,{headers:{'X-CSRF-Token':identity.csrf_token,Origin:appOrigin},data:{user_id:me.user.id,role:'member',expected_sequence:current.sequence}});expect(granted.ok(),await granted.text()).toBe(true);await context.close();
    await page.goto(`${appURL}/?project=${id}`);await expandSidebar(page);await expect(page.getByRole('combobox',{name:'Project',exact:true})).toHaveValue(id);return;
  }
  const previous=new URL(page.url()).searchParams.get('project');await page.getByRole('button',{name:'New project',exact:true}).click();await page.getByLabel('Project name').fill(`Tasks ${test.info().project.name} ${Date.now()}`);await page.getByRole('button',{name:'Create project',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeEnabled();await expect.poll(()=>new URL(page.url()).searchParams.get('project')).not.toBe(previous);createdProjects.add(new URL(page.url()).searchParams.get('project')!);
}
async function add(page: Page, title: string, description = 'Initial description') {
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('textbox',{name:'Description',exact:true}).fill(description);
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
async function importSource(){return process.env.TODO_IMPORT_FILE?await readFile(process.env.TODO_IMPORT_FILE,'utf8'):'# Task Tree\n\n| | |\n| --- | --- |\n| Purpose | Task planning |\n\n- ⏳3 Delivery - Coordinate the Work #delivery\n  - ⬜H2 First Task - Preserve the Original Layout #first\n  - 📄M3 Second Task - Retain the Planned Work #second ^\n  - ✅L1 Completed Task - Retain Completed Work #complete\n';}
function visualSource(){return ['- ⏳H7 20261115 Delivery - Complete the Next Delivery #delivery ^',...Array.from({length:6},(_,i)=>`  - 📄M${i+1} Workstream ${i+1} - Coordinate Delivery Work #stream-${i}\n${Array.from({length:4},(_,j)=>`    - ⬜${j%2?'L':'H'}${j+1} Task ${i+1}.${j+1} - Deliver a Verified User Outcome #task-${i}-${j}`).join('\n')}`),'  - 📄5 Shared Structure - Group Related Work #structure','    - ⬜M3 First Component - Deliver First Component #component-one','    - ⬜M3 Second Component - Deliver Second Component #component-two','    - ⬜M3 Third Component - Deliver Third Component #component-three','  - ⬜H9 A Long Task Title With Several Lines And AnUnbrokenIdentifierThatMustFitInsideItsCircle - Verify Full Title Layout #long-title'].join('\n');}
async function uploadTaskFile(page:Page,source:string,_action='Load',name='TODO.md',preserveTitle=false){
  await expandSidebar(page);
  if(!preserveTitle){
    const id=new URL(page.url()).searchParams.get('project');const current=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();
    const heading='# '+current.name.replace(/[\\`*_{}[\]()#+.!<>~-]/g,'\\$&');
    if(source.trimStart().startsWith('{')){const document=JSON.parse(source);document.name=current.name;document.state.preamble=heading;source=JSON.stringify(document);}
    else if(/^# [^\n]+/m.test(source.slice(0,source.search(/^ *- [⬜📄⏳🔀✅⏸❌]/mu))))source=source.replace(/^# [^\n]+/m,heading);
    else source=heading+'\n\n'+source;
  }
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'Load',exact:true}).click()]);
  const response=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`${appBase}/api/load`);
  await chooser.setFiles({name,mimeType:name.endsWith('.json')?'application/json':'text/markdown',buffer:Buffer.from(source)});
  const result=await response;await expect(page.getByRole('button',{name:'Load',exact:true})).toBeEnabled();
  if(result.ok()){const loaded=await result.json();if(loaded.created)createdProjects.add(loaded.project.id);await expect(page.getByRole('combobox',{name:'Project',exact:true})).toHaveValue(loaded.project.id);await expect.poll(()=>new URL(page.url()).searchParams.get('project')).toBe(loaded.project.id);}
  return result;
}
async function legacyImportFile(page:Page,source:string,action='Import',name='TODO.md'){
  const id=new URL(page.url()).searchParams.get('project');const current=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();const me=await(await page.request.get(`${appBase}/api/me`)).json();const json=source.trimStart().startsWith('{');
  const response=await page.request.post(`${appBase}/api/projects/${id}/${json?'import-json':'import'}`,{headers:{'X-CSRF-Token':me.csrf_token,Origin:appOrigin},data:{...(json?{document:JSON.parse(source)}:{markdown:source}),mode:action==='Open'?'replace':'merge',dry_run:false,expected_sequence:current.sequence}});expect(response.ok(),name+': '+await response.text()).toBe(true);return response;
}
async function seedTasks(page:Page,markdown:string){const id=new URL(page.url()).searchParams.get('project');const current=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();const me=await(await page.request.get(`${appBase}/api/me`)).json();const response=await page.request.post(`${appBase}/api/projects/${id}/import`,{headers:{'X-CSRF-Token':me.csrf_token,Origin:appOrigin},data:{markdown,mode:'replace',dry_run:false,expected_sequence:current.sequence}});expect(response.ok(),await response.text()).toBe(true);await expect(tree(page).locator('#svg circle').first()).toBeVisible({timeout:60000});}
async function formattingMode(page:Page){const button=page.getByRole('button',{name:'Markdown source',exact:true});if(await button.getAttribute('aria-pressed')==='true')await button.click();}
async function openFilters(page:Page){await expandSidebar(page);const details=page.locator('.filters details');if(await details.getAttribute('open')===null)await details.locator('summary').click();}
async function openImages(page:Page){await expandSidebar(page);const images=page.locator('details.image-actions');if(await images.getAttribute('open')===null)await images.locator('summary').click();}
async function saveFormat(page:Page,format:string){await expandSidebar(page);if(['SVG','PNG','HTML'].includes(format))await openImages(page);await page.getByRole('button',{name:`Save ${format==='Markdown'?'MD':format}`,exact:true}).click();}
async function editTask(page:Page,title:string){const selected=await page.locator('[role=tab][aria-selected=true]').first().textContent();if(selected==='Board'){await page.getByRole('button',{name:title,exact:true}).click();}else{const circle=tree(page).getByRole('button',{name:`Bubble ${title}`,exact:true});if(!await circle.isVisible())await page.getByRole('navigation',{name:'Task path'}).getByRole('button').first().click();await doubleClickCircle(circle,'body');}await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Title',{exact:true})).toHaveValue(title);}
test('F1 F9 deployed Authentik groups grant TODO administration through the single public port',async({page,browser})=>{
  const provider=process.env.TODO_IDENTITY_URL??`${appOrigin}/auth`;
  const headers={Authorization:'Bearer local-test-bootstrap-token'};
  const discovery=await(await page.request.get(`${provider}/application/o/todo/.well-known/openid-configuration`)).json();
  expect(discovery.issuer).toBe(`${provider}/application/o/todo/`);
  for(const key of ['authorization_endpoint','token_endpoint','jwks_uri']){expect(new URL(discovery[key]).origin).toBe(appOrigin);expect(new URL(discovery[key]).pathname.startsWith('/auth/')).toBe(true);}
  const root=await page.request.get(`${appOrigin}/`,{maxRedirects:0});expect(root.status()).toBe(302);expect(root.headers().location).toBe(`${appOrigin}/todo/`);
  for(const prefix of ['/todo','/auth']){const redirect=await page.request.get(`${appOrigin}${prefix}`,{maxRedirects:0});expect(redirect.status()).toBe(302);expect(redirect.headers().location).toBe(`${appOrigin}${prefix}/`);}
  expect((await page.request.get(`${appOrigin}/api/me`)).status()).toBe(404);
  const groups=new Map<string,string>();
  for(const name of ['todo-admin','todo-editor','todo-reader']){
    const response=await page.request.get(`${provider}/api/v3/core/groups/?name=${name}`,{headers});expect(response.ok()).toBe(true);
    const document=await response.json();expect(document.results).toHaveLength(1);expect(document.results[0]).toMatchObject({name,is_superuser:false});groups.set(name,document.results[0].pk);
  }
  const username=`todo-admin-${test.info().project.name}-${Date.now()}`;
  const response=await page.request.post(`${provider}/api/v3/core/users/`,{headers,data:{username,name:username,is_active:true,groups:[groups.get('todo-admin')],path:'users'}});expect(response.ok(),await response.text()).toBe(true);const user=await response.json();
  try{
    const passwordResponse=await page.request.post(`${provider}/api/v3/core/users/${user.pk}/set_password/`,{headers,data:{password}});expect(passwordResponse.ok()).toBe(true);
    await login(page,username);const identity=await(await page.request.get(`${appBase}/api/me`)).json();expect(identity.user.role).toBe('admin');
    expect(identity.user.id).toBe(createHash('sha256').update(`${process.env.OIDC_IDENTITY_ISSUER||discovery.issuer}\0${identity.identity.subject}`).digest('base64url'));
    await project(page);await expect(page.getByRole('button',{name:'Rename project',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Delete project',exact:true})).toBeVisible();
    const revoked=await page.request.patch(`${provider}/api/v3/core/users/${user.pk}/`,{headers,data:{groups:[]}});expect(revoked.ok()).toBe(true);
    const deniedContext=await browser.newContext();try{const denied=await deniedContext.newPage();const refused=denied.waitForResponse(response=>new URL(response.url()).pathname===`${appBase}/auth/callback`);await authenticate(denied,username);expect((await refused).status()).toBe(403);await expect(denied.getByRole('button',{name:'New project',exact:true})).toHaveCount(0);expect((await denied.request.get(`${appURL}/api/me`)).status()).toBe(401);}finally{await deniedContext.close();}
  }finally{const removed=await page.request.delete(`${provider}/api/v3/core/users/${user.pk}/`,{headers});expect(removed.ok()).toBe(true);}
});
test('F3 selected TODO files open directly and round-trip complete source',async({page})=>{
  await page.setViewportSize({width:1280,height:1200});await login(page);await project(page);
  const source=await importSource();const expected=source.split('\n').filter(line=>/^ *- [⬜📄⏳🔀✅⏸❌]/u.test(line));expect(expected.length).toBeGreaterThan(0);
  const applied=await uploadTaskFile(page,source,'Load','TODO.md',true);expect(applied.ok(),await applied.text()).toBe(true);const result=await applied.json();expect(result.imported).toBeGreaterThan(0);
  const id=new URL(page.url()).searchParams.get('project');const before=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();
  expect(before.tasks.filter((task:{archived:boolean})=>!task.archived)).toHaveLength(result.imported);
  const team=before.tasks.find((task:any)=>task.reference==='team-success');
  if(expected.some(line=>/ #team-success(?: \^)?$/.test(line))){
    const chapter=source.match(/^# team-success ([^\r\n]+)\r?\n([\s\S]*)/m);
    expect(chapter,'The imported Team Success task has its complete details chapter').not.toBeNull();
    const title=chapter![1],details=chapter![2].split(/^# /m)[0].trim();
    expect(team).toMatchObject({title,description:"Show Live Business Results and Each Team Member's Contribution",details});
    await page.getByRole('tab',{name:'List',exact:true}).click();const row=page.locator('.markdown-list [data-reference="team-success"] > .list-row');await row.getByRole('button',{name:title,exact:true}).dblclick();await page.getByRole('button',{name:'Markdown source',exact:true}).click();await expect(page.getByLabel('Details Markdown')).toHaveValue(details);await page.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  const invalid=await uploadTaskFile(page,'- ⬜H2 20260230 Invalid - Keep the Existing Data');expect(invalid.status()).toBe(400);await expect(page.getByRole('alert')).toContainText('invalid due date');
  expect(await(await page.request.get(`${appBase}/api/projects/${id}`)).json()).toEqual(before);
  expect((await uploadTaskFile(page,source)).ok()).toBe(true);await page.reload();await expandSidebar(page);
  const stored=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(stored.tasks.filter((task:{archived:boolean})=>!task.archived)).toHaveLength(result.imported);
  const pending=page.waitForEvent('download');await saveFormat(page,'Markdown');const exported=await readFile((await(await pending).path())!,'utf8');
  const entries=exported.split('\n').filter(line=>/^ *- [⬜📄⏳🔀✅⏸❌]/u.test(line)).map(line=>line.replace(/ #task-[0-9a-f-]+(?= \^$|$)/,''));
  expect(entries).toEqual(expected);expect(exported).toContain(source.slice(0,source.indexOf(expected[0])).trim());
  for(const chapter of source.matchAll(/^# ([^\s]+) ([^\r\n]+)\r?\n([\s\S]*?)(?=^# |$(?![\s\S]))/gm))if(before.tasks.some((task:{reference:string})=>task.reference===chapter[1]))expect(exported).toContain(chapter[0].trim());
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/import-${test.info().project.name}.png`,fullPage:true});
});
test('F4 imported task files use the unchanged original renderer and fonts',async({page})=>{
  await login(page);await project(page);const source=await importSource();
  expect((await uploadTaskFile(page,source,'Load','TODO.md',true)).ok()).toBe(true);
  const diagram=tree(page);await expect(diagram.locator('#svg circle').first()).toBeVisible({timeout:60000});await expect(diagram.locator('#svg text').first()).toBeVisible();await expect(diagram.getByRole('heading',{name:'Status',exact:true})).toBeVisible();
  const id=new URL(page.url()).searchParams.get('project');const stored=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();
  expect(await diagram.locator('#svg circle:not([data-ring])').count()).toBe(stored.tasks.length);
  const controls=diagram.locator('#svg circle[data-reference]');await expect(controls).toHaveCount(stored.tasks.length);
  const rendered=await controls.evaluateAll(circles=>circles.map(circle=>({reference:circle.getAttribute('data-reference'),title:circle.getAttribute('aria-label')?.replace(/^Bubble /,''),status:circle.getAttribute('data-status'),priority:circle.getAttribute('data-priority')})));
  const byReference=(a:{reference:string|null},b:{reference:string|null})=>(a.reference??'').localeCompare(b.reference??'');
  expect(rendered.sort(byReference)).toEqual(stored.tasks.map((task:any)=>({reference:`#${task.reference}`,title:task.title,status:task.status,priority:task.priority})).sort(byReference));
  const svg=await page.request.get(`${appBase}/api/projects/${id}/diagram?format=svg`);expect(svg.ok()).toBe(true);const svgText=await svg.text();expect(svgText).toContain('font-family="PLIMTaskTree, Noto Sans, sans-serif"');
  const parity=await diagram.locator('#svg').evaluate((element,source)=>{
    const reference=new DOMParser().parseFromString(source,'image/svg+xml');
    const read=(root:ParentNode)=>[...root.querySelectorAll('text[data-label-for]')].map(label=>({
      node:label.getAttribute('data-label-for'),text:label.textContent,size:Number(label.getAttribute('font-size')),weight:label.getAttribute('font-weight'),fill:label.getAttribute('fill')
    }));
    return {svg:read(reference),html:read(element)};
  },svgText);
  expect(parity.html).toHaveLength(parity.svg.length);
  for(const label of parity.svg){const actual=parity.html.find(item=>item.node===label.node);expect(actual,label.text??'SVG label').toBeDefined();expect(actual!.text).toBe(label.text);expect(actual!.size).toBeCloseTo(label.size,2);expect(actual!.weight).toBe(label.weight);expect(actual!.fill).toBe(label.fill);}
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/original-renderer-${test.info().project.name}.png`,fullPage:true});
});
test('F1 F3 F8 Load selects document titles, merges existing projects and restricts deletion',async({page,browser})=>{
  await login(page);await project(page);const original=new URL(page.url()).searchParams.get('project');const title=`Loaded ${test.info().project.name} ${Date.now()}`;const source=`# ${title}\n\n- ⬜M1 First - Original Text #first\n- 📄H2 Keep - Preserve Missing Tasks #keep\n\n# first First\n\n## Details\n\nComplete **Markdown** details.`;
  const created=await uploadTaskFile(page,source,'Load','source.json',true);expect(created.ok(),await created.text()).toBe(true);const result=await created.json();expect(result.created).toBe(true);const id=result.project.id;expect(id).not.toBe(original);await expect(page).toHaveTitle(title);
  const merged=await uploadTaskFile(page,`# ${title}\n\n- ⏳H3 Changed - Updated Text #first`,'Load','source.md',true);expect(merged.ok(),await merged.text()).toBe(true);expect((await merged.json()).created).toBe(false);const current=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(current.tasks).toHaveLength(2);expect(current.tasks.find((task:any)=>task.reference==='keep').archived).toBe(false);expect(current.tasks.find((task:any)=>task.reference==='first').title).toBe('Changed');
  const identity=await(await page.request.get(`${appBase}/api/me`)).json();const headers={'X-CSRF-Token':identity.csrf_token,Origin:appOrigin};const stale=await page.request.post(`${appBase}/api/load`,{headers,data:{source,expected_versions:{[id]:current.sequence-1}}});expect(stale.status()).toBe(409);expect(await(await page.request.get(`${appBase}/api/projects/${id}`)).json()).toEqual(current);
  const invalid=await uploadTaskFile(page,'# Invalid Load\n\n- ⬜M1 20260230 Invalid - Preserve Existing Projects','Load','source.md',true);expect(invalid.status()).toBe(400);expect((await(await page.request.get(`${appBase}/api/projects`)).json()).some((project:any)=>project.name==='Invalid Load')).toBe(false);
  const context=await browser.newContext();try{const editor=await context.newPage();await login(editor,'editor');const user=await(await editor.request.get(`${appURL}/api/me`)).json();const granted=await page.request.post(`${appBase}/api/projects/${id}/members`,{headers,data:{user_id:user.user.id,role:'member',expected_sequence:current.sequence}});expect(granted.ok()).toBe(true);await editor.goto(`${appURL}/?project=${id}`);await expandSidebar(editor);
    for(const name of ['New project','Rename project','Delete project'])await expect(editor.getByRole('button',{name,exact:true})).toHaveCount(0);
    const editorHeaders={'X-CSRF-Token':user.csrf_token,Origin:appOrigin};const state=await(await editor.request.get(`${appURL}/api/projects/${id}`)).json();expect((await editor.request.delete(`${appURL}/api/projects/${id}`,{headers:editorHeaders,data:{expected_sequence:state.sequence}})).status()).toBe(403);expect((await editor.request.post(`${appURL}/api/projects/${id}`,{headers:editorHeaders,data:{name:'Forbidden rename',expected_sequence:state.sequence}})).status()).toBe(403);
    expect((await uploadTaskFile(editor,`# ${title}\n\n- ⏳H3 Edited - Editor Text #first`,'Load','edit.md',true)).ok()).toBe(true);expect((await uploadTaskFile(editor,'# Forbidden New Project\n\n- ⬜M1 Work - Work #work','Load','edit.md',true)).status()).toBe(403);
  }finally{await context.close();}
  await page.getByRole('button',{name:'Delete project',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();expect((await page.request.get(`${appBase}/api/projects/${id}`)).ok()).toBe(true);
  const latest=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect((await page.request.delete(`${appBase}/api/projects/${id}`,{data:{expected_sequence:latest.sequence}})).status()).toBe(403);
  await page.getByRole('button',{name:'Delete project',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete project',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect((await page.request.get(`${appBase}/api/projects/${id}`)).status()).toBe(404);expect((await page.request.get(`${appBase}/api/projects/${id}/history`)).status()).toBe(404);await page.reload();await expect(page.getByRole('combobox',{name:'Project',exact:true})).not.toContainText(title);
});

test('F8 imported historical owners require known identities and leave selective text restore available',async({page})=>{
  await login(page);await project(page);await add(page,'Known ownership');
  await tree(page).getByRole('button',{name:'Bubble Known ownership',exact:true}).click({button:'right'});
  await page.getByRole('menuitem',{name:'Assign to me',exact:true}).click();
  const id=new URL(page.url()).searchParams.get('project')!;
  await expect.poll(async()=>(await(await page.request.get(`${appBase}/api/projects/${id}`)).json()).tasks[0].owners.length).toBe(1);
  const document=await(await page.request.get(`${appBase}/api/projects/${id}/export?format=json`)).json();
  const task=document.state.tasks[0];const source=document.history.find((entry:any)=>entry.task_id===task.id);
  document.history.push({...source,id:crypto.randomUUID(),before:null,after:{...task,title:'Earlier imported title',owners:[crypto.randomUUID()]},fields:['title','owners'],action:'task_saved',source_revision_id:null});
  const imported=await uploadTaskFile(page,JSON.stringify(document),'Import','project.json');expect(imported.ok()).toBe(true);expect((await imported.json()).imported).toBe(1);
  await editTask(page,'Known ownership');await page.getByRole('tab',{name:'Task history',exact:true}).click();
  await page.getByRole('button',{name:/Imported history/}).click();await expect(page.getByLabel('Historical title')).toHaveValue('Earlier imported title');
  const before=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();const historyBefore=await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json();
  await page.getByLabel('Restore owners',{exact:true}).check();await page.getByRole('button',{name:'Restore selected fields',exact:true}).click();await expect(page.getByRole('alert')).toContainText('owners who have not signed in');
  expect(await(await page.request.get(`${appBase}/api/projects/${id}`)).json()).toEqual(before);expect(await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json()).toEqual(historyBefore);
  await page.getByLabel('Restore owners',{exact:true}).uncheck();await page.getByLabel('Restore title',{exact:true}).check();await page.getByRole('button',{name:'Restore selected fields',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Earlier imported title');
  const restored=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(restored.tasks[0].owners).toEqual(task.owners);expect(restored.sequence).toBe(before.sequence+1);
});

test('F1 F3 ownership survives an Authentik rename and distinguishes a reused username',async({page,browser})=>{
  await login(page,'editor');
  const provider=process.env.TODO_IDENTITY_URL??`${appOrigin}/auth`;const headers={Authorization:'Bearer local-test-bootstrap-token'};
  const name=`u${Date.now().toString(36)}${test.info().project.name[0]}`;
  const groups=await(await page.request.get(`${provider}/api/v3/core/groups/?name=todo-editor`,{headers})).json();expect(groups.results).toHaveLength(1);
  async function provision(username:string){const response=await page.request.post(`${provider}/api/v3/core/users/`,{headers,data:{username,name:username,is_active:true,groups:[groups.results[0].pk],path:'users'}});expect(response.ok(),await response.text()).toBe(true);const user=await response.json();const set=await page.request.post(`${provider}/api/v3/core/users/${user.pk}/set_password/`,{headers,data:{password}});expect(set.ok(),await set.text()).toBe(true);return user;}
  const original=await provision(name);const firstContext=await browser.newContext();const first=await firstContext.newPage();await login(first,name);await project(first);await add(first,'Stable owner');
  const id=new URL(first.url()).searchParams.get('project')!;const originalIdentity=await(await first.request.get(`${appURL}/api/me`)).json();
  await tree(first).getByRole('button',{name:'Bubble Stable owner',exact:true}).click({button:'right'});await first.getByRole('menuitem',{name:'Assign to me',exact:true}).click();
  await expect.poll(async()=>(await(await first.request.get(`${appURL}/api/projects/${id}`)).json()).tasks[0].owners).toEqual([originalIdentity.user.id]);
  const renamed=await page.request.patch(`${provider}/api/v3/core/users/${original.pk}/`,{headers,data:{username:`${name}-old`}});expect(renamed.ok(),await renamed.text()).toBe(true);
  await provision(name);const secondContext=await browser.newContext();const second=await secondContext.newPage();await login(second,name);const secondIdentity=await(await second.request.get(`${appURL}/api/me`)).json();expect(secondIdentity.user.id).not.toBe(originalIdentity.user.id);expect((await second.request.get(`${appURL}/api/projects/${id}`)).status()).toBe(403);
  await editTask(first,'Stable owner');await first.getByRole('list',{name:'Selected owners',exact:true}).getByRole('button').click();const label=`${secondIdentity.user.id.slice(0,8)} · ${name}`;await selectEntry(first,'Owners',label);await first.getByRole('button',{name:'Save task',exact:true}).click();await expect(first.getByRole('dialog')).not.toBeVisible();
  expect((await second.request.get(`${appURL}/api/projects/${id}`)).status()).toBe(403);await saveFormat(first,'Markdown');await expect(first.getByRole('alert')).toContainText('matches more than one remembered identity');
  const downloaded=first.waitForEvent('download');await saveFormat(first,'JSON');const exported=JSON.parse((await readFile((await(await downloaded).path())!)).toString());expect(exported.state.tasks[0].owners).toEqual([secondIdentity.user.id]);expect(exported.users.filter((user:any)=>user.username===name)).toHaveLength(2);
  const renamedContext=await browser.newContext();const signedIn=await renamedContext.newPage();await login(signedIn,`${name}-old`);const currentIdentity=await(await signedIn.request.get(`${appURL}/api/me`)).json();expect(currentIdentity.user.id).toBe(originalIdentity.user.id);expect(currentIdentity.identity).toEqual(originalIdentity.identity);expect((await signedIn.request.get(`${appURL}/api/projects/${id}`)).status()).toBe(200);
  await signedIn.getByRole('tab',{name:'History',exact:true}).click();await expect(signedIn.getByRole('button',{name:/Task created/})).toContainText(`${originalIdentity.user.id.slice(0,8)} · ${name}`);
  const markdown=signedIn.waitForEvent('download');await saveFormat(signedIn,'Markdown');expect((await readFile((await(await markdown).path())!)).toString()).toContain(`[${name}]`);
  await firstContext.close();await secondContext.close();await renamedContext.close();
});
test('F1 role mapping, first-user privileges and project membership boundaries', async ({ page, browser }) => {
  await login(page,'reader');
  await expect(page.getByRole('button',{name:'New project',exact:true})).toHaveCount(0);
  const adminContext=await browser.newContext();const admin=await adminContext.newPage();
  await login(admin);await project(admin);
  await add(admin,'Reader visible task');await editTask(admin,'Reader visible task');await admin.getByRole('button',{name:'Markdown source',exact:true}).click();await admin.getByLabel('Details Markdown').fill('## Published details\n\nRead **formatted** content.');await admin.getByRole('button',{name:'Save task',exact:true}).click();
  const id=new URL(admin.url()).searchParams.get('project')!;
  expect((await page.request.get(`${appBase}/api/projects/${id}`)).status()).toBe(403);
  const editorContext=await browser.newContext();await login(await editorContext.newPage(),'editor');await editorContext.close();
  await admin.getByRole('tab',{name:'Members',exact:true}).click();
  await expect(admin.getByRole('combobox',{name:'editor',exact:true})).toHaveValue('remove');
  await admin.getByRole('combobox',{name:'reader',exact:true}).selectOption('member');
  await page.reload();await page.getByRole('combobox',{name:'Project',exact:true}).selectOption(id);
  await expect(page.getByRole('combobox',{name:'Project',exact:true})).toHaveValue(id);
  await expect(page.getByRole('button',{name:'Add task',exact:true})).toBeDisabled();
  await editTask(page,'Reader visible task');await expect(page.getByRole('heading',{name:'Published details'})).toBeVisible();await expect(page.getByLabel('Title',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Save task',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  const me=await (await page.request.get(`${appBase}/api/me`)).json();
  const write=await page.request.post(`${appBase}/api/projects/${id}/import`,{headers:{origin:new URL(page.url()).origin,'x-csrf-token':me.csrf_token},data:{markdown:'- ⬜H1 Forbidden - Change #forbidden',mode:'merge',dry_run:true}});
  expect(write.status()).toBe(403);
  const stale=(await(await admin.request.get(`${appURL}/api/projects/${id}`)).json()).sequence;
  await admin.getByRole('combobox',{name:'reader',exact:true}).selectOption('remove');
  await expect.poll(async()=>(await page.request.get(`${appBase}/api/projects/${id}`)).status()).toBe(403);
  const adminMe=await(await admin.request.get(`${appURL}/api/me`)).json();
  const outdated=await admin.request.post(`${appURL}/api/projects/${id}/members`,{headers:{origin:appOrigin,'x-csrf-token':adminMe.csrf_token},data:{user_id:me.user.id,role:'member',expected_sequence:stale}});expect(outdated.status()).toBe(409);expect((await page.request.get(`${appBase}/api/projects/${id}`)).status()).toBe(403);
  await adminContext.close();
});

test('F1 administrators create scoped projects for editors, unmapped users and anonymous sockets are denied, and logout revokes access',async({page,browser})=>{
  await login(page,'editor');await expect(page.getByRole('button',{name:'New project',exact:true})).toHaveCount(0);const identity=await(await page.request.get(`${appBase}/api/me`)).json();expect((await page.request.post(`${appBase}/api/projects`,{headers:{'X-CSRF-Token':identity.csrf_token,Origin:appOrigin},data:{name:'Forbidden editor creation'}})).status()).toBe(403);await project(page);await add(page,'Editor task');
  const id=new URL(page.url()).searchParams.get('project');
  await page.getByRole('tab',{name:'Members',exact:true}).click();await expect(page.getByRole('combobox',{name:'editor',exact:true})).toBeDisabled();
  const outsider=await browser.newContext();const anonymous=await outsider.newPage();await anonymous.goto(appURL);
  expect((await anonymous.request.get(`${appURL}/api/projects/${id}`)).status()).toBe(401);
  const opened=await anonymous.evaluate(project=>new Promise<boolean>(resolve=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';const url=new URL(`${appBase}/api/projects/${project}/events`,location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(url);socket.onopen=()=>{socket.close();resolve(true);};socket.onerror=()=>resolve(false);}),id);expect(opened).toBe(false);
  await authenticate(anonymous,'unmapped');await expect(anonymous.locator('body')).toContainText('No application role is assigned');await outsider.close();
  const loggingOut=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`${appBase}/auth/logout`);await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('link',{name:'Sign in with Authentik'})).toBeVisible();expect((await loggingOut).ok()).toBe(true);expect((await page.request.get(`${appBase}/api/me`)).status()).toBe(401);
});

test('F1 unmapped sign-in retains recovery controls and provider logout permits another account',async({page})=>{
  const provider=process.env.TODO_IDENTITY_URL??`${appOrigin}/auth`;
  const headers={Authorization:'Bearer local-test-bootstrap-token'};
  const name=`unmapped-${Date.now().toString(36)}-${test.info().project.name}`;
  const provisioned=await page.request.post(`${provider}/api/v3/core/users/`,{headers,data:{username:name,name,is_active:true,groups:[],path:'users'}});
  expect(provisioned.ok(),await provisioned.text()).toBe(true);const user=await provisioned.json();
  try{
  const passwordSet=await page.request.post(`${provider}/api/v3/core/users/${user.pk}/set_password/`,{headers,data:{password}});expect(passwordSet.ok()).toBe(true);
  await authenticate(page,name);
  await expect(page.getByRole('alert')).toContainText('No application role is assigned');
  await expect(page.getByRole('link',{name:'Sign in with Authentik',exact:true})).toBeVisible();
  await expect(page.getByRole('complementary',{name:'Project sidebar'})).toHaveCount(0);
  for(const width of [360,768,1280]){
    await page.setViewportSize({width,height:800});
    const logout=page.getByRole('link',{name:'Sign out of Authentik',exact:true});
    await expect(logout).toBeVisible();
    const bounds=await logout.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('link',{name:'Sign out of Authentik',exact:true}).click();
  await page.getByRole('link',{name:'Log out of authentik',exact:true}).click();
  await expect(page.locator('input[name="uidField"]')).toBeVisible();
  await expect.poll(async()=>(await page.request.get(`${provider}/api/v3/core/users/me/`)).status()).toBe(403);
  await page.goto(appURL);await login(page);
  expect((await(await page.request.get(`${appBase}/api/me`)).json()).user.username).toBe('akadmin');
  const response=await page.goto(`${appURL}/auth/callback?error=access_denied`);
  expect(response!.status()).toBe(400);await expect(page.getByRole('alert')).toContainText('Sign-in was declined');
  await expect(page.getByRole('link',{name:'Sign out of Authentik',exact:true})).toBeVisible();
  }finally{const removed=await page.request.delete(`${provider}/api/v3/core/users/${user.pk}/`,{headers});expect(removed.ok()).toBe(true);}
});

test('F2 F7 F8 due date clearing supports cancellation, saved history and restoration',async({page,browser})=>{
  await login(page);await project(page);await page.getByRole('tab',{name:'Board',exact:true}).click();await add(page,'Dated task');await editTask(page,'Dated task');
  const clear=page.getByRole('button',{name:'Clear due date',exact:true});await expect(clear).toBeDisabled();
  await page.getByLabel('Due date',{exact:true}).fill('2030-12-31');await expect(clear).toBeEnabled();await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  const id=new URL(page.url()).searchParams.get('project')!;const before=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();const task=before.tasks.find((task:{title:string})=>task.title==='Dated task');
  const revisionsBefore=await(await page.request.get(`${appBase}/api/projects/${id}/history?task_id=${task.id}`)).json();
  await editTask(page,'Dated task');await clear.click();await expect(page.getByLabel('Due date',{exact:true})).toHaveValue('');await expect(clear).toBeDisabled();
  expect(await(await page.request.get(`${appBase}/api/projects/${id}`)).json()).toEqual(before);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Discard changes',exact:true}).click();
  expect(await(await page.request.get(`${appBase}/api/projects/${id}/history?task_id=${task.id}`)).json()).toEqual(revisionsBefore);
  await editTask(page,'Dated task');await expect(page.getByLabel('Due date',{exact:true})).toHaveValue('2030-12-31');await clear.click();await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();await page.getByRole('tab',{name:'Board',exact:true}).click();await editTask(page,'Dated task');await expect(page.getByLabel('Due date',{exact:true})).toHaveValue('');await expect(clear).toBeDisabled();
  const revisions=await(await page.request.get(`${appBase}/api/projects/${id}/history?task_id=${task.id}`)).json();expect(revisions).toHaveLength(revisionsBefore.length+1);expect(revisions[0]).toMatchObject({action:'task_saved',fields:['due_date'],before:{due_date:'2030-12-31'},after:{due_date:null},actor:{username:'akadmin'}});
  await page.getByRole('tab',{name:'Task history',exact:true}).click();const datedRevision=page.locator('.history-list button').nth(1);await datedRevision.click();await expect(page.locator('.property-changes')).toContainText('2030-12-31');await page.getByRole('checkbox',{name:'Restore due_date',exact:true}).check();await page.getByRole('button',{name:'Restore selected fields',exact:true}).click();await expect(page.getByLabel('Due date',{exact:true})).toHaveValue('2030-12-31');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  const restored=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(restored.tasks.find((value:{id:string})=>value.id===task.id).due_date).toBe('2030-12-31');
  const readerContext=await browser.newContext();try{
    const reader=await readerContext.newPage();await login(reader,'reader');const identity=await(await reader.request.get(`${appURL}/api/me`)).json();const admin=await(await page.request.get(`${appURL}/api/me`)).json();
    const grant=await page.request.post(`${appURL}/api/projects/${id}/members`,{headers:{'X-CSRF-Token':admin.csrf_token,Origin:appOrigin},data:{user_id:identity.user.id,role:'member',expected_sequence:restored.sequence}});expect(grant.ok(),await grant.text()).toBe(true);
    await reader.goto(`${appURL}/?project=${id}`);await expandSidebar(reader);await reader.getByRole('tab',{name:'Board',exact:true}).click();await editTask(reader,'Dated task');await expect(reader.getByLabel('Due date',{exact:true})).toHaveValue('2030-12-31');await expect(reader.getByRole('button',{name:'Clear due date',exact:true})).toBeDisabled();await expect(reader.getByLabel('Due date',{exact:true})).toBeDisabled();
  }finally{await readerContext.close();}
});

test('F1 F2 F5 F7 F8 complete editing, property history and selective text restore', async ({ page }) => {
  await login(page); await project(page); await add(page, 'First task');
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await editTask(page,'First task');
  const dialog = page.getByRole('dialog');
  const labels = await dialog.locator('label[data-field]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-field')));
  expect(labels).toEqual(['Title','Description','Status','Priority','Complexity','Due date','Parent','Identifier','Owners','Sprint','Dependencies','Next week','Archived']);
  await page.getByLabel('Title', { exact: true }).fill('Second title');
  await page.getByRole('textbox',{name:'Description',exact:true}).fill('Second description');
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('in_work');
  await page.getByRole('combobox',{name:'Priority',exact:true}).selectOption('H');
  await page.getByLabel('Complexity', { exact: true }).fill('8');
  await page.getByLabel('Due date', { exact: true }).fill('2027-01-31');
  await page.getByLabel('Next week', { exact: true }).check();
  await page.getByRole('button',{name:'Markdown source',exact:true}).click();
  await page.getByLabel('Details Markdown').fill('## Acceptance\n\nA **saved** version.');
  const saving=await page.getByRole('button',{name:'Save task',exact:true}).evaluate(async(button:HTMLButtonElement)=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';button.click();await Promise.resolve();return{disabled:button.disabled,details:document.querySelector<HTMLElement>('.editor-content')?.inert,close:[...document.querySelectorAll<HTMLButtonElement>('.task-editor footer button')].find(button=>button.textContent==='Cancel')?.disabled};});
  expect(saving).toEqual({disabled:true,details:true,close:true});
  await expect(page.getByTestId('column-in_work').getByText('Second title', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await editTask(page,'Second title');
  await page.getByRole('tab', { name: 'Task history', exact: true }).click();
  await page.getByRole('button', { name: /Task created/ }).click();
  await expect(page.getByLabel('Historical title')).toHaveValue('First task');
  await page.getByLabel('Restore title', { exact: true }).check();
  await page.getByRole('button', { name: 'Restore selected fields', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('First task');
  await expect(page.getByRole('textbox',{name:'Description',exact:true})).toHaveValue('Second description');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(page.getByLabel('Historical title')).toHaveValue('First task');
  await expect(page.getByText('Task restored', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('akadmin', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab',{name:'Board',exact:true}).click();await editTask(page,'First task');await page.getByRole('tab',{name:'Task history',exact:true}).click();
  await page.getByRole('button',{name:/Task created/}).click();await page.getByRole('button',{name:'Select whole task',exact:true}).click();await page.getByRole('button',{name:'Restore selected fields',exact:true}).click();
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('First task');await expect(page.getByRole('textbox',{name:'Description',exact:true})).toHaveValue('Initial description');await expect(page.getByRole('combobox',{name:'Status',exact:true})).toHaveValue('open');await expect(page.getByRole('combobox',{name:'Priority',exact:true})).toHaveValue('M');await expect(page.getByLabel('Due date',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'Markdown source',exact:true}).click();await expect(page.getByLabel('Details Markdown')).toHaveValue('');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  const paged=await page.evaluate(async()=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';
    const project=new URL(location.href).searchParams.get('project');const me=await(await fetch(`${appBase}/api/me`)).json();let task=(await(await fetch(`${appBase}/api/projects/${project}/tasks`)).json())[0];
    for(let index=1;index<=105;index++){
      const response=await fetch(`${appBase}/api/projects/${project}/tasks/${task.id}`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrf_token},body:JSON.stringify({task:{...task,title:`Paged title ${index}`,description:`Saved description ${index}`,details:`## Revision ${index}\n\nSnapshot ${index}.`},expected_version:task.version})});
      if(!response.ok)throw new Error(`Could not save revision ${index}: ${response.status}`);task=await response.json();
    }
    return{project,task:task.id};
  });
  await editTask(page,'Paged title 105');await page.getByRole('tab',{name:'Task history',exact:true}).click();
  const revisions=page.locator('[aria-label="Task edit history"] .history-list button');await expect(revisions).toHaveCount(100);await expect(page.getByLabel('Historical title')).toHaveValue('Paged title 105');
  await page.getByRole('button',{name:'Load older revisions',exact:true}).click();await expect(revisions).toHaveCount(109);await expect(page.getByRole('button',{name:'Load older revisions',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/Task created/}).click();await expect(page.getByLabel('Historical title')).toHaveValue('First task');await expect(page.getByLabel('Historical description')).toHaveValue('Initial description');await expect(page.getByLabel('Historical details')).toHaveValue('');
  await page.getByLabel('Restore description',{exact:true}).check();await page.getByRole('button',{name:'Restore selected fields',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Paged title 105');await expect(page.getByRole('textbox',{name:'Description',exact:true})).toHaveValue('Initial description');
  const exported=await(await page.request.get(`${appBase}/api/projects/${paged.project}/export?format=json`)).json();expect(exported.history.filter((entry:any)=>entry.task_id===paged.task)).toHaveLength(110);
  for(let index=1;index<=105;index++){const revision=exported.history.find((entry:any)=>entry.action==='task_saved'&&entry.after?.title===`Paged title ${index}`);expect(revision.after).toMatchObject({description:`Saved description ${index}`,details:`## Revision ${index}\n\nSnapshot ${index}.`});}
});
test('F3 F4 F5 import, circle gestures, context controls, board navigation and exports', async ({ page }) => {
  await login(page); await project(page);
  const imported=await uploadTaskFile(page,'- ⏳H5 Epic - Parent description #epic ^\n  - ⬜M2 Child - Child description #child\n\n# child Child\n\n## Detail\n\nPersistent text.');expect(imported.ok()).toBe(true);expect((await imported.json()).imported).toBe(2);
  const epic=tree(page).getByRole('button',{name:'Bubble Epic',exact:true});await clickCircle(epic);
  await expect(page.locator('.breadcrumb-buttons').getByText('Epic', { exact: true })).toBeVisible();await expect(page.locator('.breadcrumb-buttons').getByText('Child',{exact:true})).toHaveCount(0);
  await tree(page).getByRole('button',{name:'Bubble Child',exact:true}).hover();await expect(page.getByRole('tooltip')).toContainText('Child description');
  await tree(page).getByRole('button', { name: 'Bubble Child', exact: true }).click({ button: 'right' });
  const assignment=taskResponse(page);
  await page.getByRole('menuitem', { name: 'Assign to me' }).click();
  const response=await assignment;expect(response.ok(),await response.text()).toBe(true);const saved=await response.json();
  expect(saved.reference).toBe('child');expect(saved.owners).toHaveLength(1);
  await readyTree(page,saved);
  await doubleClickCircle(tree(page).getByRole('button',{name:'Bubble Child',exact:true}),'title');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Child');
  await expect(page.getByLabel('Title',{exact:true})).toBeFocused();
  await formattingMode(page);
  await expect(page.locator('.milkdown .ProseMirror')).toContainText('Persistent text.');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await doubleClickCircle(tree(page).getByRole('button',{name:'Bubble Child',exact:true}),'body');
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Child');
  await expect(page.locator('.milkdown .ProseMirror')).toContainText('Persistent text.');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await tree(page).getByRole('button',{name:'Bubble Child',exact:true}).click();await expect(page.locator('.breadcrumb-buttons').getByText('Child',{exact:true})).toBeVisible();await expect(tree(page).getByRole('button',{name:'Bubble Child',exact:true})).toBeVisible();
  await tree(page).locator('#svg').click({position:{x:1,y:1}});await expect(page.locator('.breadcrumb-buttons').getByText('Child',{exact:true})).toHaveCount(0);
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await page.getByLabel('Search tasks').fill('Child');
  await expect(page.getByRole('button', { name:'Child', exact: true })).toBeVisible();
  await page.getByLabel('Search tasks').fill('Absent');
  await expect(page.getByRole('button', { name:'Child', exact: true })).toHaveCount(0);
  await page.getByLabel('Search tasks').fill('');
  const card = page.getByTestId('task-card').filter({ hasText: 'Child' });
  await card.dragTo(page.getByTestId('column-done'));
  await expect(page.getByTestId('column-done').getByText('Child', { exact: true })).toBeVisible();
  for (const format of ['Markdown','JSON','SVG','PNG','HTML']) {

    const download = page.waitForEvent('download');
    await saveFormat(page,format);
    const file=await download;expect(file.suggestedFilename().length).toBeGreaterThan(0);
    const content=await readFile((await file.path())!);
    if(format==='Markdown')expect(content.toString()).toContain('#child');
    if(format==='JSON')expect(JSON.parse(content.toString()).state.tasks).toHaveLength(2);
    if(format==='SVG')expect(content.toString()).toContain('<svg');
    if(format==='PNG'){
      expect([...content.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
      const pixel=await page.evaluate(async source=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';const image=new Image();image.src=source;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);return{width:canvas.width,height:canvas.height,bottom:[...ctx.getImageData(Math.floor(canvas.width*.4),canvas.height-60,1,1).data]};},`data:image/png;base64,${content.toString('base64')}`);
      expect(pixel.width).toBe(2290);expect(pixel.height).toBeGreaterThan(1000);expect(pixel.bottom[3]).toBe(255);expect(pixel.bottom.slice(0,3)).not.toEqual([240,237,238]);
    }
    await mkdir(`artifacts/exports-${test.info().project.name}`,{recursive:true});await file.saveAs(`artifacts/exports-${test.info().project.name}/${file.suggestedFilename()}`);
    if(format==='HTML'){
      const standalone=await page.context().newPage();await standalone.goto(`data:text/html,${encodeURIComponent(content.toString())}`);
      const outer=standalone.locator('#svg circle').first();await clickCircle(outer);await expect(standalone.locator('#path button').last()).toHaveText('Epic');
      await standalone.locator('#svg circle').nth(1).click();await expect(standalone.locator('#path button').last()).toHaveText('Epic');await expect(standalone.locator('#svg circle').nth(1)).toBeVisible();
      await standalone.keyboard.press('Escape');await expect(standalone.locator('#path button').last()).toHaveText('All');await standalone.close();
    }
  }
  await page.getByRole('navigation',{name:'Task path'}).getByRole('button').first().click();await editTask(page,'Epic');await page.getByRole('button',{name:'Markdown source',exact:true}).click();await page.getByLabel('Details Markdown').fill('```rust\nUnfinished example');await page.getByRole('button',{name:'Save task',exact:true}).click();
  await saveFormat(page,'Markdown');await expect(page.getByRole('alert')).toContainText('Complete its Markdown blocks or use JSON export');
  const safeJSON=page.waitForEvent('download');await saveFormat(page,'JSON');const retained=JSON.parse(await readFile((await(await safeJSON).path())!,'utf8'));expect(retained.state.tasks.find((task:{reference:string})=>task.reference==='epic').details).toBe('```rust\nUnfinished example');
  await editTask(page,'Epic');await page.getByRole('button',{name:'Markdown source',exact:true}).click();await page.getByLabel('Details Markdown').fill('```rust\nCompleted example\n```');await page.getByRole('button',{name:'Save task',exact:true}).click();const recovered=page.waitForEvent('download');await saveFormat(page,'Markdown');expect(await readFile((await(await recovered).path())!,'utf8')).toContain('Persistent text.');
});
test('F3 entries without identifiers keep preview identities and merge without duplicates',async({page})=>{
  await login(page);await project(page);let saved:string[]=[];
  for(const description of ['First','Updated']){
    const source=`- ⬜H1 Anonymous parent - Work\n  - ⬜M1 Same - ${description}\n  - ⬜M1 Same - Second`;
    const preview=await page.evaluate(async markdown=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';const project=new URL(location.href).searchParams.get('project');const me=await(await fetch(`${appBase}/api/me`)).json();const response=await fetch(`${appBase}/api/projects/${project}/import`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrf_token},body:JSON.stringify({markdown,mode:'merge',dry_run:true})});return{status:response.status,data:await response.json()};},source);expect(preview.status).toBe(200);
    const applied=await uploadTaskFile(page,source);expect(applied.ok()).toBe(true);expect((await applied.json()).imported).toBe(3);
    const tasks=await page.evaluate(async()=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';const project=new URL(location.href).searchParams.get('project');return(await fetch(`${appBase}/api/projects/${project}/tasks`)).json();});expect(tasks).toHaveLength(3);const ids=tasks.map((task:{id:string})=>task.id).sort();expect(ids).toEqual(preview.data.tasks.map((task:{id:string})=>task.id).sort());if(saved.length)expect(ids).toEqual(saved);saved=ids;expect(tasks.some((task:{description:string})=>task.description===description)).toBe(true);
  }
  await add(page,'20261101 Campaign');const before=await page.evaluate(async()=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';const project=new URL(location.href).searchParams.get('project');return(await(await fetch(`${appBase}/api/projects/${project}/tasks`)).json()).find((task:{title:string})=>task.title==='20261101 Campaign');});
  const pending=page.waitForEvent('download');await saveFormat(page,'Markdown');const markdown=await readFile((await(await pending).path())!,'utf8');const applied=await uploadTaskFile(page,markdown);expect(applied.ok()).toBe(true);expect((await applied.json()).imported).toBe(4);
  const after=await page.evaluate(async()=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';const project=new URL(location.href).searchParams.get('project');return(await fetch(`${appBase}/api/projects/${project}/tasks`)).json();});expect(after).toHaveLength(4);expect(after.find((task:{id:string})=>task.id===before.id)).toMatchObject({title:'20261101 Campaign',due_date:null});
});

test('F2 F6 F8 two tabs, conflicts, persisted history and restored descriptions and details', async ({ page, context }) => {
  await login(page); await project(page); await add(page, 'Shared task');
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  const other = await context.newPage(); await other.goto(page.url());
  await other.getByRole('tab', { name: 'Board', exact: true }).click();
  await editTask(other,'Shared task');
  await other.getByRole('textbox',{name:'Description',exact:true}).fill('Draft retained');
  await editTask(page,'Shared task');
  await page.getByRole('textbox',{name:'Description',exact:true}).fill('Saved by first tab');
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(other.getByText('The task changed elsewhere. Your draft is retained.', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('Another user saved');
  await expect(other.getByRole('textbox',{name:'Description',exact:true})).toHaveValue('Draft retained');
  await other.getByRole('button', { name: 'Reload current version', exact: true }).click();
  await expect(other.getByRole('textbox',{name:'Description',exact:true})).toHaveValue('Saved by first tab');
  await other.getByRole('tab', { name: 'Task history', exact: true }).click();
  await other.getByRole('button', { name: /Task created/ }).click();
  await other.getByLabel('Restore description', { exact: true }).check();
  await other.getByLabel('Restore details', { exact: true }).check();
  await other.getByRole('button', { name: 'Restore selected fields', exact: true }).click();
  await expect(other.getByRole('textbox',{name:'Description',exact:true})).toHaveValue('Initial description');
  await other.getByRole('button',{name:'Cancel',exact:true}).click();
  await context.setOffline(true);await expect.poll(()=>page.evaluate(()=>navigator.onLine)).toBe(false);await expect(page.getByText('Reconnecting',{exact:true})).toBeVisible();
  const me=await(await page.request.get(`${appBase}/api/me`)).json();const id=new URL(page.url()).searchParams.get('project');
  const task=(await(await page.request.get(`${appBase}/api/projects/${id}/tasks`)).json())[0];
  const missed=await page.request.post(`${appBase}/api/projects/${id}/tasks/${task.id}`,{headers:{origin:new URL(page.url()).origin,'x-csrf-token':me.csrf_token},data:{task:{...task,title:'Changed while disconnected'},expected_version:task.version}});expect(missed.status()).toBe(200);
  await context.setOffline(false);await expect.poll(()=>page.evaluate(()=>navigator.onLine)).toBe(true);await expect(other.getByRole('button',{name:'Changed while disconnected',exact:true})).toBeVisible();await expect(page.getByText('Live',{exact:true})).toBeVisible();await expect(other.getByText('Live',{exact:true})).toBeVisible();
});
test('F1 F3 F9 API rejects invalid input and exposes a generated contract', async ({ page }) => {
  await login(page); await project(page);
  const result = await page.evaluate(async () => {const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';
    const me = await (await fetch(`${appBase}/api/me`)).json();
    const projects = await (await fetch(`${appBase}/api/projects`)).json();
    const id = new URL(location.href).searchParams.get('project') ?? projects.at(-1).id;
    const post = (path: string, data: unknown, csrf = me.csrf_token) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(data) });
    const bad = await post(`${appBase}/api/projects/${id}/import`, { markdown: '- ⬜H1 20260230 Bad - Date #bad', mode: 'merge', dry_run: true });
    const forbidden = await post(`${appBase}/api/projects`, { name: 'CSRF attempt' }, 'wrong');
    const deep=await post(`${appBase}/api/projects/${id}/import`,{markdown:Array.from({length:65},(_,i)=>`${'  '.repeat(i)}- ⬜M1 Level ${i} - Work #depth-${i}`).join('\n'),mode:'merge',dry_run:true});
    const heading=await post(`${appBase}/api/projects/${id}/import`,{markdown:'- ⬜M1 Heading - Work #heading\n\n# heading Heading\n\nFirst-level heading\n===',mode:'merge',dry_run:true});
    const spec = await (await fetch(`${appBase}/api/openapi.json`)).json();
    return { bad: bad.status, forbidden: forbidden.status, deep:deep.status,heading:heading.status,spec };
  });
  expect(result.bad).toBe(400);
  expect(result.forbidden).toBe(403);
  expect(result.deep).toBe(400);expect(result.heading).toBe(400);
  expect(result.spec.openapi).toMatch(/^3\./);
  expect(result.spec.paths['/api/projects/{project}/tasks/{task}/revert'].post.requestBody).toBeTruthy();
  expect(result.spec.components.schemas.Snapshot).toBeTruthy();expect(result.spec.servers).toContainEqual({url:`${appBase}/`});
  await page.goto(`${appBase}/api/docs`);await page.getByLabel('Path',{exact:true}).fill('/api/projects');await page.getByRole('button',{name:'Execute',exact:true}).click();await expect(page.locator('#result')).toContainText('Tasks');
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Download OpenAPI',exact:true}).click();
  const contract=JSON.parse(await readFile((await(await pending).path())!,'utf8'));expect(contract).toEqual(result.spec);
  const session=await(await page.request.get(`${appBase}/api/me`)).json();const projects=await(await page.request.get(`${appBase}/api/projects`)).json();
  const crossOrigin=await page.request.post(`${appBase}/api/projects`,{headers:{origin:'https://untrusted.invalid','x-csrf-token':session.csrf_token},data:{name:'Rejected cross-origin project'}});expect(crossOrigin.status()).toBe(403);
  const socketOrigin=await page.request.get(`${appBase}/api/projects/${projects[0].id}/events?after=0`,{headers:{origin:'https://untrusted.invalid',connection:'Upgrade',upgrade:'websocket','sec-websocket-version':'13','sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ=='}});expect(socketOrigin.status()).toBe(403);
  expect(await(await page.request.get(`${appBase}/api/projects`)).json()).toEqual(projects);
  const operation=page.locator('#operations article').filter({has:page.getByText('POST /api/projects',{exact:true})});
  await operation.getByText('Contract',{exact:true}).click();await expect(operation.locator('pre')).toContainText('requestBody');
  await page.getByRole('combobox',{name:'Method',exact:true}).selectOption('POST');
  const name=`API project ${test.info().project.name} ${Date.now()}`;
  await page.getByRole('textbox',{name:'JSON body',exact:true}).fill(JSON.stringify({name}));
  await page.getByRole('button',{name:'Execute',exact:true}).click();await expect(page.locator('#result')).toContainText(name);
  const response=(await page.locator('#result').innerText()).split('\n');expect(response[0]).toBe('200');const created=JSON.parse(response.slice(1).join('\n'));expect(created.name).toBe(name);createdProjects.add(created.id);
  await page.getByRole('textbox',{name:'Path',exact:true}).fill('https://example.invalid/');await page.getByRole('button',{name:'Execute',exact:true}).click();await expect(page.locator('#result')).toHaveText('Choose an API path on this server.');
  await page.getByRole('link',{name:'Back to Tasks',exact:true}).click();await page.getByRole('combobox',{name:'Project',exact:true}).selectOption(created.id);
  await expect(page.getByRole('combobox',{name:'Project',exact:true})).toHaveValue(created.id);await expect(page.getByRole('navigation',{name:'Task path'}).getByRole('button',{name,exact:true})).toBeVisible();
});

test('F3 F8 F10 F11 sprint planning, dependencies and JSON history round trip', async ({ page }) => {
  await login(page); await project(page); await add(page, 'Prerequisite'); await add(page, 'Dependent');
  await page.getByRole('tab', { name:'Sprints', exact:true }).click();
  await page.getByLabel('Sprint title').fill('Iteration one');
  await page.getByLabel('Sprint goal').fill('Deliver both tasks');
  await page.getByRole('button', { name:'Save sprint', exact:true }).click();
  await expect(page.getByRole('button', { name:'Edit sprint Iteration one' })).toBeVisible();
  await page.getByRole('tab', { name:'Board', exact:true }).click();
  await editTask(page,'Dependent');
  await page.getByRole('combobox',{name:'Sprint',exact:true}).selectOption({ label:'Iteration one' });
  await selectEntry(page,'Dependencies','Prerequisite');
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('in_work');
  await page.getByRole('button', { name:'Save task', exact:true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Complete the dependencies');
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('planned');
  await page.getByRole('button', { name:'Save task', exact:true }).click();
  await editTask(page,'Prerequisite');
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('done');
  await page.getByRole('button', { name:'Save task', exact:true }).click();
  await editTask(page,'Dependent');
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('in_work');
  await page.getByRole('button', { name:'Save task', exact:true }).click();
  await expect(page.getByTestId('column-in_work').getByText('Dependent', { exact:true })).toBeVisible();
  await openFilters(page);await page.getByLabel('Sprint filter').selectOption({label:'Iteration one'});await expect(page.getByRole('button',{name:'Prerequisite',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Dependent',exact:true})).toBeVisible();
  await openFilters(page);await page.getByLabel('Sprint filter').selectOption('backlog');await expect(page.getByRole('button',{name:'Prerequisite',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Dependent',exact:true})).toHaveCount(0);await openFilters(page);await page.getByLabel('Sprint filter').selectOption('');
  await page.getByRole('tab',{name:'Sprints',exact:true}).click();await page.getByRole('button',{name:'Edit sprint Iteration one'}).click();await page.getByLabel('Sprint status').selectOption('active');await page.getByRole('button',{name:'Save sprint',exact:true}).click();
  await expect(page.getByText(/active · 0\/1 done/)).toBeVisible();
  await page.getByRole('button',{name:'New sprint',exact:true}).click();await page.getByLabel('Sprint title').fill('Rejected concurrent sprint');await page.getByLabel('Sprint status').selectOption('active');await page.getByRole('button',{name:'Save sprint',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Close the current active sprint');
  await page.getByRole('tab',{name:'Board',exact:true}).click();
  const document = await page.evaluate(async () => {const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??''; const id = new URL(location.href).searchParams.get('project'); return (await fetch(`${appBase}/api/projects/${id}/export?format=json`)).json(); });
  expect(document.history.at(-1).sequence).toBe(document.sequence);
  await project(page);
  expect((await uploadTaskFile(page,JSON.stringify(document),'Import','project.json')).ok()).toBe(true);
  await page.getByRole('tab', { name:'Board', exact:true }).click();
  await expect(page.getByTestId('column-in_work').getByText('Dependent', { exact:true })).toBeVisible();
  await editTask(page,'Dependent');
  await expect(page.getByRole('combobox',{name:'Sprint',exact:true}).locator('option:checked')).toHaveText('Iteration one');
  await page.getByRole('tab', { name:'Task history', exact:true }).click();
  await expect(page.getByRole('button', { name:/Imported history/ }).first()).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  const roundTrip=await page.evaluate(async()=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';
    const id=new URL(location.href).searchParams.get('project');const me=await(await fetch(`${appBase}/api/me`)).json();
    const document=await(await fetch(`${appBase}/api/projects/${id}/export?format=json`)).json();
    const post=(body:unknown)=>fetch(`${appBase}/api/projects/${id}/import-json`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrf_token},body:JSON.stringify(body)});
    const snapshot=await(await fetch(`${appBase}/api/projects/${id}`)).json();
    const before=document.history.filter((e:{source_revision_id?:string})=>e.source_revision_id).map((e:{source_revision_id:string})=>e.source_revision_id);
    const invalid=structuredClone(document);invalid.state.tasks[0].complexity=42;
    const bad=await post({document:invalid,mode:'merge',dry_run:true});
    const active=structuredClone(document);active.state.sprints[0].status='active';active.state.sprints.push({...active.state.sprints[0],id:crypto.randomUUID()});
    const doubleActive=await post({document:active,mode:'merge',dry_run:true});
    const response=await post({document,mode:'merge',dry_run:false,expected_sequence:snapshot.sequence});
    const after=await(await fetch(`${appBase}/api/projects/${id}/export?format=json`)).json();
    return{bad:bad.status,doubleActive:doubleActive.status,status:response.status,before,after:after.history.filter((e:{source_revision_id?:string})=>e.source_revision_id).map((e:{source_revision_id:string})=>e.source_revision_id),projectHistory:document.history.some((e:{action:string})=>e.action==='history_imported:project_created'),sprintHistory:document.history.some((e:{action:string})=>e.action==='history_imported:sprint_saved')};
  });
  expect(roundTrip).toMatchObject({bad:400,doubleActive:400,status:200,projectHistory:true,sprintHistory:true});expect(roundTrip.after).toEqual(roundTrip.before);
});

test('F1 F6 F10 project switches load separate membership, sprint drafts and revision selection',async({page,browser})=>{
  const readerContext=await browser.newContext();await login(await readerContext.newPage(),'reader');await readerContext.close();
  await login(page);await project(page);const first=new URL(page.url()).searchParams.get('project')!;await add(page,'First project task');
  await page.getByRole('tab',{name:'Members',exact:true}).click();await page.getByRole('combobox',{name:'reader',exact:true}).selectOption('member');await expect(page.getByRole('combobox',{name:'reader',exact:true})).toHaveValue('member');
  await page.getByRole('tab',{name:'Sprints',exact:true}).click();await page.getByLabel('Sprint title').fill('First project sprint');await page.getByRole('button',{name:'Save sprint',exact:true}).click();await page.getByRole('button',{name:'Edit sprint First project sprint'}).click();await page.getByLabel('Sprint goal').fill('First project unsaved goal');
  await project(page);const second=new URL(page.url()).searchParams.get('project')!;expect(second).not.toBe(first);await expect(page.getByLabel('Sprint title')).toHaveValue('');await expect(page.getByRole('button',{name:'Edit sprint First project sprint'})).toHaveCount(0);
  await page.getByRole('tab',{name:'Members',exact:true}).click();await expect(page.getByRole('combobox',{name:'reader',exact:true})).toHaveValue('remove');await page.getByRole('combobox',{name:'Project',exact:true}).selectOption(first);await expect(page.getByRole('combobox',{name:'reader',exact:true})).toHaveValue('member');
  await page.getByRole('tab',{name:'History',exact:true}).click();await page.getByRole('button',{name:/Task created/}).click();await expect(page.getByLabel('Historical title')).toHaveValue('First project task');await page.getByRole('combobox',{name:'Project',exact:true}).selectOption(second);await expect(page.getByLabel('Historical title')).toHaveCount(0);await expect(page.getByRole('button',{name:/Task created/})).toHaveCount(0);
});

test('F5 F10 date filters and sprint defaults use the local day across UTC midnight',async({browser})=>{
  const local=await browser.newContext({timezoneId:'Europe/Zurich'});const page=await local.newPage();await login(page);await page.clock.install({time:new Date('2026-10-23T22:30:00Z')});await project(page);await add(page,'Calendar warning task');await editTask(page,'Calendar warning task');await page.getByLabel('Complexity',{exact:true}).fill('0');await page.getByLabel('Due date',{exact:true}).fill('2026-10-31');await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(tree(page).getByRole('button',{name:'Bubble Calendar warning task',exact:true})).toHaveAttribute('fill','#F9D6D4');await page.clock.setSystemTime(new Date('2026-10-31T23:30:00Z'));await add(page,'Local date task');
  await editTask(page,'Local date task');await page.getByLabel('Due date',{exact:true}).fill('2026-11-01');await page.getByRole('button',{name:'Save task',exact:true}).click();await openFilters(page);await page.getByLabel('Due filter').selectOption('overdue');await expect(tree(page).getByRole('button',{name:'Bubble Local date task',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Sprints',exact:true}).click();await expect(page.getByLabel('Sprint start')).toHaveValue('2026-11-01');await expect(page.getByLabel('Sprint end')).toHaveValue('2026-11-15');await local.close();
});

test('F6 F10 concurrent sprint edits retain the draft and require the current version',async({page,context})=>{
  await login(page);await project(page);await page.getByRole('tab',{name:'Sprints',exact:true}).click();
  await page.getByLabel('Sprint title').fill('Shared sprint');
  expect(await page.getByRole('button',{name:'Save sprint',exact:true}).evaluate(async(button:HTMLButtonElement)=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';button.click();await Promise.resolve();return button.closest('fieldset')?.disabled;})).toBe(true);
  await expect(page.getByRole('button',{name:'Edit sprint Shared sprint'})).toBeVisible();
  const other=await context.newPage();await other.goto(page.url());await other.getByRole('tab',{name:'Sprints',exact:true}).click();await other.getByRole('button',{name:'Edit sprint Shared sprint'}).click();await other.getByLabel('Sprint goal').focus();
  const pristine=await other.getByLabel('Sprint goal').evaluate(element=>({value:(element as HTMLTextAreaElement).value,start:(element as HTMLTextAreaElement).selectionStart,end:(element as HTMLTextAreaElement).selectionEnd,scroll:element.scrollTop}));
  await page.getByRole('button',{name:'Edit sprint Shared sprint'}).click();await page.getByLabel('Sprint goal').fill('First intermediate goal');await page.getByRole('button',{name:'Save sprint',exact:true}).click();await expect(other.getByText('The project changed elsewhere. Your sprint draft is retained.')).toBeVisible();await expect(other.getByLabel('Sprint goal')).toBeFocused();expect(await other.getByLabel('Sprint goal').evaluate(element=>({value:(element as HTMLTextAreaElement).value,start:(element as HTMLTextAreaElement).selectionStart,end:(element as HTMLTextAreaElement).selectionEnd,scroll:element.scrollTop}))).toEqual(pristine);await other.getByLabel('Sprint goal').fill('Second draft');
  await page.getByRole('button',{name:'Edit sprint Shared sprint'}).click();await page.getByLabel('Sprint goal').fill('First saved goal');await page.getByRole('button',{name:'Save sprint',exact:true}).click();
  await expect(other.getByText('The project changed elsewhere. Your sprint draft is retained.')).toBeVisible();await other.getByRole('button',{name:'Save sprint',exact:true}).click();await expect(other.getByRole('alert')).toContainText('Another user saved');await expect(other.getByLabel('Sprint goal')).toHaveValue('Second draft');
  await other.getByRole('button',{name:'Reload current sprint'}).click();await expect(other.getByLabel('Sprint goal')).toHaveValue('First saved goal');await other.getByLabel('Sprint goal').fill('Second reconciled goal');await other.getByRole('button',{name:'Save sprint',exact:true}).click();await expect(page.getByText('Second reconciled goal',{exact:true})).toBeVisible();
});

test('F4 F5 context properties, filters and archive restoration share persisted task data',async({page})=>{
  await login(page);await project(page);await add(page,'Quick task');
  const bubble=tree(page).getByRole('button',{name:'Bubble Quick task',exact:true});
  await page.setViewportSize({width:390,height:844});await bubble.click({button:'right'});const smallMenu=await page.getByRole('menu').boundingBox();expect(smallMenu).not.toBeNull();expect(smallMenu!.x).toBeGreaterThanOrEqual(0);expect(smallMenu!.y).toBeGreaterThanOrEqual(0);expect(smallMenu!.x+smallMenu!.width).toBeLessThanOrEqual(390);expect(smallMenu!.y+smallMenu!.height).toBeLessThanOrEqual(844);await page.getByRole('button',{name:'Close menu'}).click();await page.setViewportSize({width:1280,height:720});
  await bubble.click({button:'right'});await page.getByRole('menu').getByRole('combobox',{name:'Status',exact:true}).selectOption('planned');
  await expect(bubble).toHaveAttribute('data-status','planned');
  await bubble.click({button:'right'});await page.getByRole('menu').getByRole('combobox',{name:'Priority',exact:true}).selectOption('H');
  await expect(bubble).toHaveAttribute('data-priority','H');
  await bubble.click({button:'right'});await page.getByRole('menu').getByLabel('Due date',{exact:true}).fill('2026-10-01');
  await expect(bubble).toHaveAttribute('fill','#7A1010');
  await bubble.hover();await expect(page.getByRole('tooltip')).toContainText('2026-10-01');
  await bubble.click({button:'right'});await page.getByRole('menuitem',{name:'Assign to me',exact:true}).click();
  await bubble.click({button:'right'});await page.getByRole('menu').getByRole('checkbox',{name:'reader',exact:true}).click();await openFilters(page);await page.getByRole('combobox',{name:'Owner',exact:true}).selectOption({label:'reader'});await expect(bubble).toBeVisible();await bubble.click({button:'right'});await expect(page.getByRole('menu').getByRole('checkbox',{name:'reader',exact:true})).toBeChecked();await page.getByRole('menu').getByRole('checkbox',{name:'reader',exact:true}).click();await expect(bubble).toHaveCount(0);
  await openFilters(page);await page.getByRole('combobox',{name:'Owner',exact:true}).selectOption({label:'akadmin'});
  await expect(bubble).toBeVisible();
  await bubble.click({button:'right'});await page.getByRole('menuitem',{name:'Remove me',exact:true}).click();await expect(bubble).toHaveCount(0);await openFilters(page);await page.getByRole('combobox',{name:'Owner',exact:true}).selectOption('');await expect(bubble).toBeVisible();await bubble.click({button:'right'});await page.getByRole('menuitem',{name:'Assign to me',exact:true}).click();await openFilters(page);await page.getByRole('combobox',{name:'Owner',exact:true}).selectOption({label:'akadmin'});await expect(bubble).toBeVisible();
  await openFilters(page);await page.getByLabel('Status filter').selectOption('open');await expect(bubble).toHaveCount(0);
  await openFilters(page);await page.getByLabel('Status filter').selectOption('planned');await expect(bubble).toBeVisible();
  await openFilters(page);await page.getByLabel('Priority filter').selectOption('L');await expect(bubble).toHaveCount(0);
  await openFilters(page);await page.getByLabel('Priority filter').selectOption('H');await expect(bubble).toBeVisible();
  await openFilters(page);await page.getByLabel('Due filter').selectOption('overdue');await expect(bubble).toBeVisible();
  await bubble.click({button:'right'});await page.getByRole('menuitem',{name:'Clear due date',exact:true}).click();
  await expect(bubble).toHaveCount(0);await openFilters(page);await page.getByLabel('Due filter').selectOption('');
  await editTask(page,'Quick task');
  await expect(page.getByLabel('Due date',{exact:true})).toHaveValue('');
  await page.getByLabel('Archived',{exact:true}).check();await page.getByRole('button',{name:'Save task',exact:true}).click();
  await expect(bubble).toHaveCount(0);await openFilters(page);await page.getByLabel('Include archived').check();await expect(bubble).toBeVisible();
  await editTask(page,'Quick task');await page.getByLabel('Archived',{exact:true}).uncheck();
  const restoration=taskResponse(page);await page.getByRole('button',{name:'Save task',exact:true}).click();
  const response=await restoration;expect(response.ok(),await response.text()).toBe(true);const saved=await response.json();expect(saved.archived).toBe(false);
  await readyTree(page,saved);await expect(bubble).toBeVisible();
  await openFilters(page);await page.getByLabel('Include archived').uncheck();await expect(bubble).toBeVisible();
});

test('F7 formatted editing saves the final keystrokes and protects unsaved details', async ({page})=>{
  await login(page);await project(page);await add(page,'Formatted task');
  await page.getByRole('tab',{name:'Board',exact:true}).click();
  await editTask(page,'Formatted task');
  const editor=page.locator('.milkdown .ProseMirror');await expect(editor).toBeVisible();
  await page.clock.install();await page.clock.pauseAt(new Date());
  await editor.fill('Final typed details');
  await page.getByRole('button',{name:'Save task',exact:true}).click();
  await page.clock.resume();
  await editTask(page,'Formatted task');
  await page.getByRole('button',{name:'Markdown source',exact:true}).click();
  await expect(page.getByLabel('Details Markdown')).toHaveValue(/Final typed details/);
  await formattingMode(page);await expect(editor).toContainText('Final typed details');
  await page.clock.pauseAt(new Date());await editor.fill('Unsaved formatted details');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByText('Discard unsaved changes to this task?')).toBeVisible();
  await page.clock.resume();await page.getByRole('button',{name:'Keep editing'}).click();
  await page.getByRole('button',{name:'Markdown source',exact:true}).click();
  await expect(page.getByLabel('Details Markdown')).toHaveValue(/Unsaved formatted details/);
  await page.getByRole('button',{name:'Save task',exact:true}).click();
});

test('F2 F8 F11 repeated create requests, cycles and unchanged saves preserve one task and all revisions',async({page})=>{
  await login(page);await project(page);await add(page,'Cycle parent');await add(page,'Cycle child');
  const result=await page.evaluate(async()=>{const appBase=document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';
    const id=new URL(location.href).searchParams.get('project');const me=await(await fetch(`${appBase}/api/me`)).json();
    const call=(path:string,body:unknown)=>fetch(`${appBase}/api/projects/${id}/${path}`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrf_token},body:JSON.stringify(body)});
    const tasks=await(await fetch(`${appBase}/api/projects/${id}/tasks`)).json();const [a,b]=tasks;
    const first=await call(`tasks/${b.id}`,{task:{...b,parent_id:a.id,depends_on:[a.id]},expected_version:b.version});
    const tree=await call(`tasks/${a.id}`,{task:{...a,parent_id:b.id},expected_version:a.version});
    const dependency=await call(`tasks/${a.id}`,{task:{...a,depends_on:[b.id]},expected_version:a.version});
    const saved=await call(`tasks/${a.id}`,{task:a,expected_version:a.version});
    const history=await(await fetch(`${appBase}/api/projects/${id}/history?task_id=${a.id}`)).json();
    const currentA=await saved.json();const currentB=await first.json();
    const complete=await call(`tasks/${a.id}`,{task:{...currentA,status:'done'},expected_version:currentA.version});const completed=await complete.json();
    const start=await call(`tasks/${b.id}`,{task:{...currentB,status:'in_work'},expected_version:currentB.version});const started=await start.json();
    const reopen=await call(`tasks/${a.id}`,{task:{...completed,status:'open'},expected_version:completed.version});
    const text=await call(`tasks/${b.id}`,{task:{...started,description:'Work continues while prerequisite reopens'},expected_version:started.version});const edited=await text.json();
    const blocked=await call(`tasks/${b.id}`,{task:{...edited,status:'done'},expected_version:edited.version});
    const draft={...a,id:crypto.randomUUID(),reference:'retry-create',title:'Retried task',version:0};
    const create=await call('tasks',{task:draft,expected_version:0});const repeat=await call('tasks',{task:draft,expected_version:0});
    const duplicate=await call('tasks',{task:{...draft,title:'Conflicting retry'},expected_version:0});
    const snapshot=await(await fetch(`${appBase}/api/projects/${id}/tasks`)).json();
    return{first:first.status,tree:tree.status,dependency:dependency.status,saved:saved.status,complete:complete.status,start:start.status,reopen:reopen.status,text:text.status,blocked:blocked.status,create:create.status,repeat:repeat.status,duplicate:duplicate.status,count:snapshot.filter((t:{id:string})=>t.id===draft.id).length,history};
  });
  expect(result).toMatchObject({first:200,tree:400,dependency:400,saved:200,complete:200,start:200,reopen:200,text:200,blocked:400,create:200,repeat:200,duplicate:409,count:1});
  expect(result.history).toHaveLength(2);expect(result.history[0].fields).toEqual([]);
});

test('F7 unsafe Markdown remains inert in the editor and historical preview',async({page})=>{
  await login(page);await project(page);await add(page,'Safe details');
  await editTask(page,'Safe details');
  await page.getByRole('button',{name:'Markdown source',exact:true}).click();
  await page.getByLabel('Details Markdown').fill('## Safe heading\n\n<img src=x onerror="window.unsafeMarkdown=true">\n\n[Unsafe link](javascript:window.unsafeMarkdown=true)');
  await page.getByRole('button',{name:'Save task',exact:true}).click();
  await editTask(page,'Safe details');
  await expect(page.locator('.milkdown .ProseMirror')).toBeVisible();
  expect(await page.evaluate(()=>('unsafeMarkdown' in window))).toBe(false);
  expect(await page.locator('.milkdown a').evaluateAll(nodes=>nodes.some(n=>(n.getAttribute('href')??'').trim().toLowerCase().startsWith('javascript:')))).toBe(false);
  await page.getByRole('tab',{name:'Task history',exact:true}).click();await page.getByRole('button',{name:/Task saved/}).click();
  expect(await page.locator('.markdown-preview img').count()).toBe(0);
  expect(await page.locator('.markdown-preview a').evaluateAll(nodes=>nodes.some(n=>(n.getAttribute('href')??'').trim().toLowerCase().startsWith('javascript:')))).toBe(false);
  expect(await page.evaluate(()=>('unsafeMarkdown' in window))).toBe(false);
});

test('F2 F3 F7 parent and identifier controls persist moves and reject duplicate references',async({page})=>{
  await login(page);await project(page);await page.getByRole('tab',{name:'Board',exact:true}).click();
  await add(page,'Parent container');await add(page,'Other root');
  const projectID=new URL(page.url()).searchParams.get('project')!;
  await page.getByRole('button',{name:'Add task',exact:true}).click();
  await expect(page.getByRole('dialog').locator('label[data-field]')).toHaveCount(13);const fields=await page.getByRole('dialog').locator('label[data-field]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-field')));
  expect(fields).toEqual(['Title','Description','Status','Priority','Complexity','Due date','Parent','Identifier','Owners','Sprint','Dependencies','Next week','Archived']);
  await expect(page.getByRole('textbox',{name:'Identifier',exact:true})).not.toHaveValue('');
  await page.getByRole('textbox',{name:'Title',exact:true}).fill('Moved task');
  await page.getByRole('textbox',{name:'Description',exact:true}).fill('Persist every selected property');
  await page.getByRole('combobox',{name:'Parent',exact:true}).selectOption({label:'Parent container'});
  await expect(page.getByRole('textbox',{name:'Identifier',exact:true})).not.toBeEditable();await page.getByRole('button',{name:'Change identifier',exact:true}).click();await expect(page.getByText('Loading an older Markdown file with the previous identifier can create another task.',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Identifier',exact:true}).fill('controlled-reference');
  await page.getByRole('button',{name:'Lock identifier',exact:true}).click();await expect(page.getByRole('textbox',{name:'Identifier',exact:true})).not.toBeEditable();
  await page.getByRole('combobox',{name:'Priority',exact:true}).selectOption('');
  await page.getByRole('spinbutton',{name:'Complexity',exact:true}).fill('0');
  await page.getByLabel('Due date',{exact:true}).fill('2030-02-01');
  await page.getByRole('checkbox',{name:'Next week',exact:true}).check();
  await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  const initial=await(await page.request.get(`${appBase}/api/projects/${projectID}`)).json();
  const parent=initial.tasks.find((task:{title:string})=>task.title==='Parent container');const child=initial.tasks.find((task:{title:string})=>task.title==='Moved task');
  expect(child).toMatchObject({parent_id:parent.id,reference:'controlled-reference',priority:'',complexity:0,due_date:'2030-02-01',next_week:true});
  await page.getByTestId('task-card').filter({has:page.getByRole('button',{name:'Parent container',exact:true})}).getByRole('link',{name:'Open children of Parent container',exact:true}).click();
  await expect(page.getByRole('button',{name:'Moved task',exact:true})).toBeVisible();
  await expandSidebar(page);await expect(page.getByRole('button',{name:'Edit current task',exact:true})).toHaveCount(0);
  await page.locator('.breadcrumb-buttons').getByText('Parent container',{exact:true}).dblclick();
  const parentChoices=await page.getByRole('combobox',{name:'Parent',exact:true}).locator('option').allTextContents();
  expect(parentChoices).toContain('Other root');expect(parentChoices).not.toContain('Moved task');expect(parentChoices).not.toContain('Parent container');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await editTask(page,'Moved task');
  await expect(page.getByRole('textbox',{name:'Identifier',exact:true})).toHaveValue('controlled-reference');
  await expect(page.getByRole('combobox',{name:'Parent',exact:true})).toHaveValue(parent.id);
  await expect(page.getByRole('textbox',{name:'Identifier',exact:true})).not.toBeEditable();await page.getByRole('button',{name:'Change identifier',exact:true}).click();
  await page.getByRole('textbox',{name:'Identifier',exact:true}).fill(parent.reference);
  await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('alert')).toContainText('identifier is already used');
  expect(await(await page.request.get(`${appBase}/api/projects/${projectID}`)).json()).toEqual(initial);
  await page.getByRole('textbox',{name:'Identifier',exact:true}).fill('controlled-reference');
  await page.getByRole('combobox',{name:'Parent',exact:true}).selectOption('');
  await page.getByRole('combobox',{name:'Priority',exact:true}).selectOption('L');
  await page.getByRole('spinbutton',{name:'Complexity',exact:true}).fill('9');
  await page.getByLabel('Due date',{exact:true}).fill('');await page.getByRole('checkbox',{name:'Next week',exact:true}).uncheck();
  await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();await page.getByRole('tab',{name:'Board',exact:true}).click();
  await editTask(page,'Moved task');
  await expect(page.getByRole('textbox',{name:'Identifier',exact:true})).toHaveValue('controlled-reference');
  await expect(page.getByRole('combobox',{name:'Parent',exact:true})).toHaveValue('');
  await expect(page.getByRole('combobox',{name:'Priority',exact:true})).toHaveValue('L');
  await expect(page.getByRole('spinbutton',{name:'Complexity',exact:true})).toHaveValue('9');
  await expect(page.getByLabel('Due date',{exact:true})).toHaveValue('');await expect(page.getByRole('checkbox',{name:'Next week',exact:true})).not.toBeChecked();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  const final=await(await page.request.get(`${appBase}/api/projects/${projectID}`)).json();
  expect(final.tasks.find((task:{id:string})=>task.id===child.id)).toMatchObject({parent_id:null,reference:'controlled-reference',priority:'L',complexity:9,due_date:null,next_week:false});
  const pending=page.waitForEvent('download');await saveFormat(page,'Markdown');
  const markdown=await readFile((await(await pending).path())!,'utf8');expect(markdown).toContain('- ⬜L9 Moved task - Persist every selected property #controlled-reference');
});

test('F3 F5 F10 sprint dates and export scope retain the selected project data',async({page})=>{
  await login(page);await project(page);
  expect((await uploadTaskFile(page,'- ⏳M4 Scope parent - Group the Work #scope-parent\n  - ⬜M2 Scope child - Deliver the Work #scope-child\n- 📄L3 Outside task - Retain Other Work #outside-task')).ok()).toBe(true);
  await page.getByRole('tab',{name:'Sprints',exact:true}).click();
  const inventory=await page.locator('.sprint-planning form label').evaluateAll(nodes=>nodes.map(node=>[...node.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim()));
  expect(inventory).toEqual(['Sprint title','Sprint goal','Sprint start','Sprint end','Sprint status']);
  await page.getByRole('textbox',{name:'Sprint title',exact:true}).fill('Calendar sprint');await page.getByRole('textbox',{name:'Sprint goal',exact:true}).fill('Deliver the scoped work');
  await page.getByLabel('Sprint start').fill('2026-12-10');await page.getByLabel('Sprint end').fill('2026-12-09');
  await page.getByRole('button',{name:'Save sprint',exact:true}).click();await expect(page.getByRole('alert')).toContainText('end on or after its start');
  await expect(page.getByLabel('Sprint start')).toHaveValue('2026-12-10');await expect(page.getByLabel('Sprint end')).toHaveValue('2026-12-09');
  await page.getByLabel('Sprint end').fill('2026-12-24');await page.getByRole('combobox',{name:'Sprint status',exact:true}).selectOption('closed');
  await page.getByRole('button',{name:'Save sprint',exact:true}).click();await page.getByRole('button',{name:'Edit sprint Calendar sprint',exact:true}).click();
  await page.getByLabel('Sprint start').fill('2026-12-11');await page.getByLabel('Sprint end').fill('2026-12-25');await page.getByRole('button',{name:'Save sprint',exact:true}).click();
  await expect(page.getByText('2026-12-11 – 2026-12-25 · closed · 0/0 done',{exact:true})).toBeVisible();
  await page.reload();await page.getByRole('tab',{name:'Sprints',exact:true}).click();await page.getByRole('button',{name:'Edit sprint Calendar sprint',exact:true}).click();
  await expect(page.getByLabel('Sprint start')).toHaveValue('2026-12-11');await expect(page.getByLabel('Sprint end')).toHaveValue('2026-12-25');
  await expect(page.getByRole('textbox',{name:'Sprint goal',exact:true})).toHaveValue('Deliver the scoped work');
  await page.getByRole('tab',{name:'Board',exact:true}).click();await page.getByRole('button',{name:'Scope parent',exact:true}).dblclick();
  await editTask(page,'Scope child');await page.getByLabel('Due date',{exact:true}).fill('2030-12-12');await page.getByRole('combobox',{name:'Sprint',exact:true}).selectOption({label:'Calendar sprint'});await page.getByRole('button',{name:'Save task',exact:true}).click();
  await openFilters(page);await page.getByRole('combobox',{name:'Due filter',exact:true}).selectOption('any');await expect(page.getByRole('button',{name:'Scope child',exact:true})).toBeVisible();await openFilters(page);await page.getByRole('combobox',{name:'Due filter',exact:true}).selectOption('');
  for(const [scope,references]of [['current',['#scope-parent','#scope-child']],['all',['#scope-parent','#scope-child','#outside-task']]] as const){
    await openImages(page);await page.getByRole('combobox',{name:'Export scope',exact:true}).selectOption(scope);
    const pending=page.waitForEvent('download');await saveFormat(page,'SVG');
    const svg=await readFile((await(await pending).path())!,'utf8');const names=await page.evaluate(source=>[...new DOMParser().parseFromString(source,'image/svg+xml').querySelectorAll('circle title')].map(title=>title.textContent!.match(/#[^\s]+/)?.[0]).filter(Boolean),svg);
    expect(names.sort()).toEqual([...references].sort());
    await page.getByRole('tab',{name:'Bubbles',exact:true}).click();
    const printed=page.locator('img.print-diagram');await expect(printed).toHaveCount(1);
    await expect.poll(()=>printed.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
    const printSource=await page.request.get((await printed.getAttribute('src'))!);expect(printSource.ok()).toBe(true);
    const printNames=await page.evaluate(source=>[...new DOMParser().parseFromString(source,'image/svg+xml').querySelectorAll('circle title')].map(title=>title.textContent!.match(/#[^\s]+/)?.[0]).filter(Boolean),await printSource.text());
    expect(printNames.sort()).toEqual([...references].sort());
  }
  const failedDiagrams:string[]=[];page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('/diagram')&&response.status()>=400)failedDiagrams.push(response.url());});
  await openImages(page);await page.getByRole('combobox',{name:'Export scope',exact:true}).selectOption('current');
  await page.getByRole('searchbox',{name:'Search tasks',exact:true}).fill('Outside task');
  await expect(tree(page).getByRole('button',{name:'Bubble Outside task',exact:true})).toBeVisible();
  await expect(page.locator('img.print-diagram')).toHaveCount(0);
  await expect(page.locator('.print-notice')).toHaveText('No tasks in the selected export scope.');
  await expect(page.locator('.print-notice')).not.toBeVisible();expect(failedDiagrams).toEqual([]);
  await page.emulateMedia({media:'print'});await expect(page.locator('.print-notice')).toBeVisible();
});

test('F4 F5 F7 narrow screens retain every view without horizontal scrolling',async({page},info)=>{
  test.setTimeout(180000);await page.setViewportSize({width:390,height:844});await login(page);await project(page);
  const long='UnbrokenIdentifier'.repeat(8);const title=`Mobile Task ${long}`;
  const details=`## Mobile Details\n\n${long}\n\n| First | Second | Third | Fourth | Fifth | Sixth |\n| --- | --- | --- | --- | --- | --- |\n| ${long} | Two | Three | Four | Five | Six |\n\n\`\`\`text\n${long.repeat(2)}\n\`\`\``;
  const source=`# Mobile Project ${long}\n\n- ⏳M3 Parent - Keep Mobile Tasks Together #mobile-parent\n${['⬜','📄','⏳','🔀','✅','⏸','❌'].map((icon,index)=>`  - ${icon}M1 ${index?`Task ${index}`:title} - ${long} #mobile-${index}`).join('\n')}\n\n# mobile-0 ${title}\n\n${details}`;
  await seedTasks(page,source);
  async function noPan(){
    const measure=(root:HTMLElement)=>[...(root.shadowRoot??root.ownerDocument).querySelectorAll<HTMLElement>('*')].filter(element=>{
      if(!(element instanceof HTMLElement)||!element.clientWidth||!element.getClientRects().length||element.matches('input,select,option'))return false;
      const style=root.ownerDocument.defaultView!.getComputedStyle(element);return style.visibility!=='hidden'&&style.opacity!=='0'&&!(style.textOverflow==='ellipsis'&&style.overflowX==='hidden')&&element.scrollWidth>element.clientWidth+1;
    }).map(element=>({tag:element.tagName,classes:element.className,width:element.clientWidth,scroll:element.scrollWidth}));
    expect(await page.locator('html').evaluate(measure)).toEqual([]);
    const iframe=page.locator('.task-tree-host');if(await iframe.isVisible())expect(await page.locator('.task-tree-host').evaluate(measure)).toEqual([]);
  }
  async function tab(name:string){await expandSidebar(page);await page.getByRole('tab',{name,exact:true}).click();}
  for(const width of [320,360,390,480,667,768]){
    await page.setViewportSize({width,height:width===667?375:844});await tab('Bubbles');
    const legend=tree(page).locator('details.tree-legend');await expect(legend).not.toHaveAttribute('open');
    const chart=await tree(page).locator('#chart').boundingBox();const frame=await page.locator('.task-tree-host').boundingBox();expect(chart!.width).toBeGreaterThan(frame!.width-20);expect(chart!.y-frame!.y).toBeLessThan(20);await noPan();
    await legend.getByText('Legend',{exact:true}).click();await expect(tree(page).locator('#status')).toBeVisible();await noPan();await legend.getByText('Legend',{exact:true}).click();
    await tree(page).getByRole('button',{name:'Bubble Parent',exact:true}).press('Enter');await expect(page.locator('.task-tree-host')).toHaveAttribute('data-host-reference','mobile-parent');await circlePoint(tree(page).getByRole('button',{name:`Bubble ${title}`,exact:true}));await tree(page).locator('main').click({position:{x:1,y:1}});await expect(page.getByRole('combobox',{name:'Task level',exact:true})).toHaveValue('');
    await tab('Board');await page.getByRole('button',{name:'Parent',exact:true}).dblclick();await expect(page.getByTestId('task-card')).toHaveCount(7);
    const columns=await page.locator('.board-column').evaluateAll(elements=>elements.map(element=>{const box=element.getBoundingClientRect();return{x:box.x,width:box.width,top:box.top,bottom:box.bottom};}));
    for(let index=1;index<columns.length;index++){expect(Math.abs(columns[index].x-columns[0].x)).toBeLessThan(1);expect(columns[index].top).toBeGreaterThanOrEqual(columns[index-1].bottom);}
    const levels=page.getByRole('combobox',{name:'Task level',exact:true});await expect(levels.locator('option:checked')).toHaveText('Parent');await noPan();
    await levels.selectOption('');await expect(page.getByTestId('task-card')).toHaveCount(1);await page.getByRole('button',{name:'Parent',exact:true}).dblclick();await page.getByRole('button',{name:'Parent level',exact:true}).click();await expect(page.getByTestId('task-card')).toHaveCount(1);
    for(const name of ['History','Sprints','Members']){await tab(name);await noPan();}
    if(width===320||width===390||width===667){
      await tab('Board');await page.getByRole('button',{name:'Parent',exact:true}).dblclick();await page.getByRole('button',{name:title,exact:true}).click();await expect(page.locator('.milkdown .ProseMirror')).toBeVisible();await noPan();
      const fields=await page.locator('.task-fields').boundingBox();const content=await page.locator('.editor-content').boundingBox();expect(content!.y).toBeGreaterThanOrEqual(fields!.y+fields!.height);
      await page.getByRole('button',{name:'Link',exact:true}).click();await expect(page.getByPlaceholder('Paste link...')).toBeVisible();await noPan();await page.getByPlaceholder('Paste link...').press('Escape');
      await page.getByRole('button',{name:'Markdown source',exact:true}).click();await expect(page.getByLabel('Details Markdown')).toHaveValue(details);await noPan();await page.getByRole('tab',{name:'Task history',exact:true}).click();await noPan();
      await page.screenshot({path:info.outputPath(`mobile-editor-${width}.png`),fullPage:true});await page.getByRole('button',{name:'Cancel',exact:true}).click();
    }
    await tab('Bubbles');await page.getByRole('combobox',{name:'Task level',exact:true}).selectOption('');
    await page.screenshot({path:info.outputPath(`mobile-bubbles-${width}.png`),fullPage:true});
    await tab('Board');await page.screenshot({path:info.outputPath(`mobile-board-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});await tab('Board');expect(await page.locator('.board-column').evaluateAll(elements=>elements.every(element=>Math.abs(element.getBoundingClientRect().top-elements[0].getBoundingClientRect().top)<1))).toBe(true);
});
test('F1 F4 F5 F8 compact workspace, sidebar and recorded project title changes',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await login(page);await project(page);
  await seedTasks(page,'# Workspace Document\n\n- ⏳M3 Parent - Keep the Work Visible #parent\n  - ⬜M1 Child - Retain the Child #child');
  const diagram=page.locator('.task-tree-host');await expect(tree(page).getByRole('button',{name:'Bubble Parent',exact:true})).toBeVisible();
  const layout=await page.evaluate(()=>{const main=document.querySelector('main.workspace')!.getBoundingClientRect();const frame=document.querySelector('.task-tree-host')!.getBoundingClientRect();return{main:main.y,top:frame.y,bottom:frame.bottom,height:innerHeight,scroll:document.documentElement.scrollHeight,client:document.documentElement.clientHeight};});
  expect(layout.main).toBe(0);expect(layout.top).toBeLessThanOrEqual(80);expect(layout.bottom).toBeLessThanOrEqual(layout.height+1);expect(layout.scroll).toBeLessThanOrEqual(layout.client+1);
  await expect(page.getByRole('navigation',{name:'Task path'}).getByRole('button').first()).toHaveText('Workspace Document');
  const before=(await diagram.boundingBox())!;await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Project sidebar'})).not.toBeVisible();expect((await diagram.boundingBox())!.width).toBeGreaterThan(before.width);
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();await expect(page.getByLabel('Search tasks')).toBeVisible();
  await page.getByRole('button',{name:'Rename project',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Project name').fill('Renamed Workspace');
  expect(await dialog.locator('footer button').allTextContents()).toEqual(['Save project','Cancel']);await dialog.getByRole('button',{name:'Save project',exact:true}).click();await expect(dialog).not.toBeVisible();
  const id=new URL(page.url()).searchParams.get('project');const stored=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(stored.name).toBe('Renamed Workspace');expect(stored.preamble).toContain('# Renamed Workspace');
  await expect(page.getByRole('navigation',{name:'Task path'}).getByRole('button').first()).toHaveText('Renamed Workspace');
  const history=await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json();expect(history.find((event:{action:string})=>event.action==='project_renamed')).toMatchObject({before:{name:expect.any(String)},after:{name:'Renamed Workspace'},fields:expect.arrayContaining(['name','preamble'])});
  const rejected=await page.request.post(`${appBase}/api/projects/${id}`,{headers:{'X-CSRF-Token':(await(await page.request.get(`${appBase}/api/me`)).json()).csrf_token,Origin:appOrigin},data:{name:'Stale Name',expected_sequence:stored.sequence-1}});expect(rejected.status()).toBe(409);
  expect(await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json()).toEqual(history);
  await page.reload();await expect(page.getByRole('combobox',{name:'Project',exact:true})).toContainText('Renamed Workspace');
  await page.getByRole('tab',{name:'Board',exact:true}).click();const board=await page.locator('.board').boundingBox();expect(board!.y).toBeLessThanOrEqual(80);expect(board!.y+board!.height).toBeLessThanOrEqual(901);
});
test('F1 F3 compact workspace sidebar retains complete controls across screen and font sizes',async({page},info)=>{
  test.setTimeout(900000); // The complete Firefox viewport matrix exceeds ten minutes on the shared runner.
  await login(page);await project(page);
  const desktop=[[1280,960],[1280,720],[1366,768],[1440,900],[1600,1200],[1920,1080],[1920,1200],[2560,1440],[2560,1080],[3440,1440],[3840,2160],[5120,2160]];
  const sizes=[...desktop,...desktop.map(([width,height])=>[Math.round(width/2),height]),...[2560,3440,5120].flatMap(width=>[[Math.round(width/3),1440],[Math.round(width*2/3),1440]]),[320,568],[360,640],[390,844],[430,932],[568,320],[844,390],[768,1024],[1024,768],[767,900],[768,900],[769,900]];
  const measurements=[];
  for(const scale of [100,125,150,200])for(const [width,height]of sizes){
    await page.setViewportSize({width,height});const preference=await page.addStyleTag({content:`html { font-size:${scale}%; }`});
    await expandSidebar(page);
    const sidebar=page.getByRole('complementary',{name:'Project sidebar'});
    for(const selector of ['.filters details','.image-actions']){const details=sidebar.locator(selector);if(await details.getAttribute('open')===null)await details.locator('summary').click();}
    const controls=sidebar.locator('button,input:not([type=file]),select,summary,a');
    const results=await controls.evaluateAll(elements=>elements.filter(element=>element.checkVisibility()).map(element=>{
        element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
        const box=element.getBoundingClientRect();const side=element.closest('aside')!.getBoundingClientRect();
        const clip={left:Math.max(0,side.left),right:Math.min(innerWidth,side.right),top:Math.max(0,side.top),bottom:Math.min(innerHeight,side.bottom)};
        let ancestor=element.parentElement;
        while(ancestor){const style=getComputedStyle(ancestor);const bounds=ancestor.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(style.overflowX)){clip.left=Math.max(clip.left,bounds.left);clip.right=Math.min(clip.right,bounds.right);}if(/auto|scroll|hidden|clip/.test(style.overflowY)){clip.top=Math.max(clip.top,bounds.top);clip.bottom=Math.min(clip.bottom,bounds.bottom);}ancestor=ancestor.parentElement;}
        const texts=[];if(!element.matches('select,input')){const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);while(walker.nextNode()){if(!walker.currentNode.textContent?.trim())continue;const range=document.createRange();range.selectNodeContents(walker.currentNode);texts.push(...[...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom})));}}
        return{name:element.getAttribute('aria-label')??element.textContent?.trim(),box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},clip,texts,overflow:side.width>innerWidth};
      }));
    for(const result of results){
      const message=JSON.stringify({width,height,scale,...result});expect(result.overflow,message).toBe(false);
      for(const rectangle of [result.box,...result.texts]){expect(rectangle.left,message).toBeGreaterThanOrEqual(result.clip.left-1);expect(rectangle.right,message).toBeLessThanOrEqual(result.clip.right+1);expect(rectangle.top,message).toBeGreaterThanOrEqual(result.clip.top-1);expect(rectangle.bottom,message).toBeLessThanOrEqual(result.clip.bottom+1);}
    }
    await sidebar.locator('.sidebar-heading').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`sidebar-${width}-${height}-font-${scale}-top.png`)});
    const scrolling=await sidebar.evaluate(element=>({height:element.clientHeight,total:element.scrollHeight}));
    for(let offset=scrolling.height;offset<scrolling.total-scrolling.height;offset+=scrolling.height){await sidebar.evaluate((element,offset)=>element.scrollTop=offset,offset);await page.screenshot({path:info.outputPath(`sidebar-${width}-${height}-font-${scale}-scroll-${offset}.png`)});}
    await sidebar.locator('.sidebar-footer').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`sidebar-${width}-${height}-font-${scale}-bottom.png`)});
    measurements.push({width,height,scale,controls:results.length});await preference.evaluate(element=>element.remove());
  }
  await writeFile(info.outputPath('sidebar-sizes.json'),JSON.stringify(measurements,null,2));await page.setViewportSize({width:1440,height:900});await expandSidebar(page);
  for(const name of ['New project','Rename project','Delete project']){await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();}
  await page.getByRole('tab',{name:'Board',exact:true}).click();await expect(page.getByRole('region',{name:'Status board'})).toBeVisible();await page.getByRole('tab',{name:'List',exact:true}).click();await expect(page.getByRole('region',{name:'Markdown task list'})).toBeVisible();
});
test('F1 F3 F8 project name equals the document title across imports and saved files',async({page,context})=>{
  await login(page);await project(page);const id=new URL(page.url()).searchParams.get('project');
  const selected=page.locator('.project-picker option:checked');const path=page.getByRole('navigation',{name:'Task path'}).getByRole('button').first();
  const initial=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(initial.preamble).toBe(`# ${initial.name}`);
  await seedTasks(page,'# Imported Document\n\n| | |\n| --- | --- |\n| Purpose | Preserve metadata |\n\n- ⬜M1 Work - Keep the Task #work');
  await expect(selected).toHaveText('Imported Document');await expect(path).toHaveText('Imported Document');await expect(page).toHaveTitle('Imported Document');
  const observer=await context.newPage();try{
    await observer.goto(page.url());await expect(observer.locator('.project-picker option:checked')).toHaveText('Imported Document');
    await page.getByRole('button',{name:'Rename project',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Project name')).toHaveValue('Imported Document');await dialog.getByLabel('Project name').fill('Renamed Document');await dialog.getByRole('button',{name:'Save project',exact:true}).click();await expect(dialog).not.toBeVisible();
    await expect(observer.locator('.project-picker option:checked')).toHaveText('Renamed Document');await expect(observer).toHaveTitle('Renamed Document');
    const saved=await(await page.request.get(`${appBase}/api/projects/${id}/export?format=json`)).json();expect(saved.name).toBe('Renamed Document');expect(saved.state.preamble).toContain('# Renamed Document');expect(saved.state.preamble).toContain('| Purpose | Preserve metadata |');
    saved.name='Obsolete Alias';saved.state.preamble=saved.state.preamble.replace('# Renamed Document','# JSON Document');
    expect((await legacyImportFile(page,JSON.stringify(saved),'Open','saved.md')).ok()).toBe(true);await expect(selected).toHaveText('JSON Document');await expect(path).toHaveText('JSON Document');await expect(observer).toHaveTitle('JSON Document');
    expect((await legacyImportFile(page,'# Merged Document\n\n- ⬜M1 Work - Keep the Task #work','Import')).ok()).toBe(true);await expect(selected).toHaveText('Merged Document');
    expect((await legacyImportFile(page,'- ⬜M1 Work - Keep the Task #work','Open')).ok()).toBe(true);await expect(selected).toHaveText('Merged Document');
    const snapshot=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(snapshot.name).toBe('Merged Document');expect(snapshot.preamble).toBe('# Merged Document');
    const markdown=await(await page.request.get(`${appBase}/api/projects/${id}/export?format=markdown`)).text();expect(markdown.startsWith('# Merged Document\n')).toBe(true);
    const document=await(await page.request.get(`${appBase}/api/projects/${id}/export?format=json`)).json();expect(document.name).toBe('Merged Document');expect(document.state.preamble).toBe('# Merged Document');
    const history=await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json();expect(history).toEqual(expect.arrayContaining([expect.objectContaining({task_id:'',before:expect.objectContaining({name:'Imported Document'}),after:expect.objectContaining({name:'Renamed Document'})}),expect.objectContaining({task_id:'',before:expect.objectContaining({name:'Renamed Document'}),after:expect.objectContaining({name:'JSON Document'}),fields:expect.arrayContaining(['name','preamble'])}),expect.objectContaining({task_id:'',before:expect.objectContaining({name:'JSON Document'}),after:expect.objectContaining({name:'Merged Document'})})]));
    await page.reload();await expect(selected).toHaveText('Merged Document');await expect(path).toHaveText('Merged Document');await expect(page).toHaveTitle('Merged Document');
  }finally{await observer.close();}
});
test('F1 F8 project title editing validates input, retains conflicts and enforces reader access',async({page,browser})=>{
  await login(page);await project(page);const id=new URL(page.url()).searchParams.get('project');const initial=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();const history=await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json();
  await page.getByRole('button',{name:'Rename project',exact:true}).click();const dialog=page.getByRole('dialog');const name=dialog.getByLabel('Project name');await name.fill('');await dialog.getByRole('button',{name:'Save project',exact:true}).click();expect(await name.evaluate(element=>(element as HTMLInputElement).checkValidity())).toBe(false);
  await name.fill('x'.repeat(256));await dialog.getByRole('button',{name:'Save project',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('255 bytes');expect(await(await page.request.get(`${appBase}/api/projects/${id}`)).json()).toEqual(initial);expect(await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json()).toEqual(history);
  await name.fill('Validated Workspace');await dialog.getByRole('button',{name:'Save project',exact:true}).click();await expect(dialog).not.toBeVisible();const first=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(first.name).toBe('Validated Workspace');
  await page.getByRole('button',{name:'Rename project',exact:true}).click();await name.fill('Retained local title');await name.focus();await name.evaluate(element=>(element as HTMLInputElement).setSelectionRange(2,8));
  const me=await(await page.request.get(`${appBase}/api/me`)).json();const headers={'X-CSRF-Token':me.csrf_token,Origin:appOrigin};const remote=await page.request.post(`${appBase}/api/projects/${id}`,{headers,data:{name:'Remote project title',expected_sequence:first.sequence}});expect(remote.ok()).toBe(true);
  await expect(page.locator('.project-picker option:checked')).toHaveText('Remote project title');await expect(name).toHaveValue('Retained local title');expect(await name.evaluate(element=>({start:(element as HTMLInputElement).selectionStart,end:(element as HTMLInputElement).selectionEnd,active:element===document.activeElement}))).toEqual({start:2,end:8,active:true});
  await dialog.getByRole('button',{name:'Save project',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Another user saved');await expect(name).toHaveValue('Retained local title');await dialog.getByRole('button',{name:'Reload project title',exact:true}).click();await expect(name).toHaveValue('Remote project title');await name.fill('Final project title');await dialog.getByRole('button',{name:'Save project',exact:true}).click();await expect(dialog).not.toBeVisible();
  const readerContext=await browser.newContext();try{const reader=await readerContext.newPage();await login(reader,'reader');const identity=await(await reader.request.get(`${appBase}/api/me`)).json();const current=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect((await page.request.post(`${appBase}/api/projects/${id}/members`,{headers,data:{user_id:identity.user.id,role:'member',expected_sequence:current.sequence}})).ok()).toBe(true);await reader.reload();await reader.getByRole('combobox',{name:'Project',exact:true}).selectOption(id!);await expect(reader.getByRole('button',{name:'Rename project',exact:true})).toHaveCount(0);const before=await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json();expect((await reader.request.post(`${appBase}/api/projects/${id}`,{headers:{'X-CSRF-Token':identity.csrf_token,Origin:appOrigin},data:{name:'Reader change',expected_sequence:current.sequence}})).status()).toBe(403);expect(await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json()).toEqual(before);}finally{await readerContext.close();}
});
test('F3 F8 direct file opening, merging, detected formats and complete import history',async({page})=>{
  await login(page);await project(page);const id=new URL(page.url()).searchParams.get('project');
  expect((await uploadTaskFile(page,'# File Workspace\n\n- ⬜M1 First - Initial Text #first\n- ⬜M2 Keep - Retain This Task #keep','Open')).ok()).toBe(true);
  const initial=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();const first=initial.tasks.find((task:{reference:string})=>task.reference==='first');
  expect((await uploadTaskFile(page,'# File Workspace\n\n- 📄H5 20301231 Changed - Revised Text [akadmin] #first')).ok()).toBe(true);
  let stored=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(stored.tasks).toHaveLength(2);expect(stored.tasks.find((task:{id:string})=>task.id===first.id)).toMatchObject({title:'Changed',description:'Revised Text',status:'planned',priority:'H',complexity:5,due_date:'2030-12-31',owners:[expect.any(String)]});
  const events=await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json();const change=events.find((event:{task_id:string;action:string})=>event.task_id===first.id&&event.action==='task_imported');
  expect(change.fields).toEqual(expect.arrayContaining(['title','description','status','priority','complexity','due_date','owners']));expect(change.before.title).toBe('First');expect(change.after.title).toBe('Changed');
  const invalid=await uploadTaskFile(page,'- ⬜M1 20260230 Invalid - Keep Existing Data','Import');expect(invalid.status()).toBe(400);expect(await(await page.request.get(`${appBase}/api/projects/${id}`)).json()).toEqual(stored);await expect(page.getByRole('alert')).toContainText('invalid due date');
  for(const format of ['JSON','MD']){const pending=page.waitForEvent('download');await page.getByRole('button',{name:`Save ${format}`,exact:true}).click();const saved=await pending;const text=await readFile((await saved.path())!,'utf8');if(format==='JSON'){const doc=JSON.parse(text);expect(doc.history).toEqual(expect.arrayContaining([expect.objectContaining({id:change.id})]));expect((await uploadTaskFile(page,text,'Import','detected.md')).ok()).toBe(true);}else expect(text).toContain('Revised Text');}
  expect((await uploadTaskFile(page,'# Replaced Workspace\n\n- ⬜M1 Final - Replace the Visible Tree #final','Open')).ok()).toBe(true);
  stored=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();expect(stored.tasks.filter((task:{archived:boolean})=>!task.archived).map((task:{reference:string})=>task.reference)).toEqual(['first','keep','final']);
  const merged=await(await page.request.get(`${appBase}/api/projects/${id}/history`)).json();expect(merged.some((event:any)=>event.task_id===first.id&&event.after?.archived===true)).toBe(false);expect(merged.some((event:any)=>event.after?.reference==='final')).toBe(true);
});
test('F1 F6 logout, revocation, invalid cookies and expiry remove every open draft and project view',async({page,context})=>{
  async function cleared(target:Page){await expect(target.getByRole('link',{name:'Sign in with Authentik'})).toBeVisible();await expect(target.getByRole('dialog')).toHaveCount(0);await expect(target.locator('.task-tree-host')).toHaveCount(0);await expect(target.locator('body')).not.toContainText('Private draft text');await expect(target.locator('.project-picker')).toHaveCount(0);await expect(target.locator('.context-menu')).toHaveCount(0);await expect(target).toHaveTitle('Tasks');}
  await login(page);await project(page);await add(page,'Private session task');const address=page.url();const other=await context.newPage();await other.goto(address);await editTask(other,'Private session task');await other.getByRole('textbox',{name:'Description',exact:true}).fill('Private draft text');
  const loggingOut=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`${appBase}/auth/logout`);await page.getByRole('button',{name:'Sign out',exact:true}).click();await cleared(page);await cleared(other);expect((await loggingOut).ok()).toBe(true);expect((await page.request.get(`${appBase}/api/me`)).status()).toBe(401);
  await login(page);await page.goto(address);await editTask(page,'Private session task');await page.getByRole('textbox',{name:'Description',exact:true}).fill('Private draft text');const me=await(await page.request.get(`${appBase}/api/me`)).json();expect(me.session_expires_at).toBeGreaterThan(me.server_time);
  const revoked=await page.request.post(`${appBase}/auth/logout`,{headers:{'X-CSRF-Token':me.csrf_token,Origin:appOrigin},data:{}});expect(revoked.ok()).toBe(true);await cleared(page);
  await login(page);await page.goto(address);await editTask(page,'Private session task');await page.getByRole('textbox',{name:'Description',exact:true}).fill('Private draft text');const cookies=await context.cookies();const session=cookies.find(cookie=>cookie.name==='todo_session')!;await context.addCookies([{...session,value:'invalid-session-token'}]);await page.evaluate(async()=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';await fetch(`${appBase}/api/me`).then(response=>{if(response.status===401)window.dispatchEvent(new Event('focus'));});});await cleared(page);
  await login(page);await page.clock.install();await page.goto(address);await editTask(page,'Private session task');await page.getByRole('textbox',{name:'Description',exact:true}).fill('Private draft text');const expiry=await(await page.request.get(`${appBase}/api/me`)).json();await page.clock.fastForward(expiry.session_expires_at-expiry.server_time+1000);await cleared(page);await other.close();
});

test('F4 a single formatted hover popup follows the cursor inside the drawing',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await login(page);await project(page);await seedTasks(page,'# Hover Card\n\n- ⏳H4 20301231 Hover Task - Complete task description #hover ^');
  const circle=tree(page).getByRole('button',{name:'Bubble Hover Task',exact:true});const point=await circlePoint(circle);await page.mouse.move(point.x,point.y);const tooltip=tree(page).getByRole('tooltip');await expect(tooltip).toBeVisible();await expect(tooltip.locator('strong')).toHaveText('Hover Task');await expect(tooltip.locator('p')).toHaveText('Complete task description');await expect(tooltip.locator('dt')).toContainText(['Status','Priority','Complexity','Due date','Planning']);await expect(tooltip.locator('dd')).toContainText(['in work','H','4','2030-12-31']);await expect(tree(page).locator('circle title')).toHaveCount(0);await expect(tooltip).not.toContainText('#hover');
  const popup=(await tooltip.boundingBox())!;const chart=(await tree(page).locator('#chart').boundingBox())!;expect(popup.x).toBeGreaterThanOrEqual(chart.x);expect(popup.y).toBeGreaterThanOrEqual(chart.y);expect(popup.x+popup.width).toBeLessThanOrEqual(chart.x+chart.width);expect(popup.y+popup.height).toBeLessThanOrEqual(chart.y+chart.height);await expect(page.getByRole('tooltip')).toHaveCount(1);
  const id=new URL(page.url()).searchParams.get('project');const state=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();const task=state.tasks.find((item:any)=>item.reference==='hover');const me=await(await page.request.get(`${appBase}/api/me`)).json();
  const changed=await page.request.post(`${appBase}/api/projects/${id}/tasks/${task.id}`,{headers:{'X-CSRF-Token':me.csrf_token,Origin:appOrigin},data:{task:{...task,description:'Updated while the pointer stays still'},expected_version:task.version}});expect(changed.ok()).toBe(true);await expect(tooltip.locator('p')).toHaveText('Updated while the pointer stays still');await expect(tooltip).toBeVisible();
  await page.mouse.move(0,0);await expect(tooltip).toBeHidden();
});

test('F6 live updates retain the current element, viewport, editor and text selection',async({page,context})=>{
  await page.setViewportSize({width:1440,height:900});await login(page);await project(page);
  await seedTasks(page,'- ⏳M4 Parent - Keep the Current View #parent\n  - ⬜M2 Draft - Preserve the Open Editor #draft\n  - ⬜M1 Other - Update Only This Task #other\n  - ⬜M1 Candidate - Retain the Selected Parent #candidate');
  const id=new URL(page.url()).searchParams.get('project');await clickCircle(tree(page).getByRole('button',{name:'Bubble Parent',exact:true}));
  await expect(page.locator('.breadcrumb-buttons').getByText('Parent',{exact:true})).toBeVisible();
  const frame=page.locator('.task-tree-host');await expect(tree(page).getByRole('button',{name:'Bubble Draft',exact:true})).toBeVisible();await circlePoint(tree(page).getByRole('button',{name:'Bubble Draft',exact:true}));
  const marker=await frame.evaluate(element=>{const host=element as HTMLElement;host.dataset.testIdentity=crypto.randomUUID();return{identity:host.dataset.testIdentity,view:host.shadowRoot!.querySelector('#svg')!.getAttribute('viewBox')};});
  const draftLabel=tree(page).locator('text[data-reference="#draft"]');await expect(draftLabel).toBeVisible();const labelIdentity=await draftLabel.evaluate(element=>{(element as SVGElement).dataset.testIdentity=crypto.randomUUID();return(element as SVGElement).dataset.testIdentity;});
  const second=await context.newPage();await second.goto(page.url());await expect(second.getByRole('button',{name:'New project',exact:true})).toBeVisible();
  const current=await(await second.request.get(`${appBase}/api/projects/${id}`)).json();const other=current.tasks.find((task:{reference:string})=>task.reference==='other');const csrf=(await(await second.request.get(`${appBase}/api/me`)).json()).csrf_token;
  const changed=await second.request.post(`${appBase}/api/projects/${id}/tasks/${other.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...other,description:'Changed from the other tab'},expected_version:other.version}});expect(changed.ok()).toBe(true);
  await expect.poll(()=>tree(page).getByRole('button',{name:'Bubble Other',exact:true}).getAttribute('aria-description')).toContain('Changed from the other tab');
  await expect(draftLabel).toHaveAttribute('data-test-identity',labelIdentity!);
  expect(await frame.evaluate(element=>{const host=element as HTMLElement;return{identity:host.dataset.testIdentity,view:host.shadowRoot!.querySelector('#svg')!.getAttribute('viewBox')};})).toEqual(marker);
  const originalCircle=tree(page).getByRole('button',{name:'Bubble Other',exact:true});await originalCircle.focus();const circleIdentity=await originalCircle.evaluate(element=>{(element as SVGElement).dataset.testIdentity=crypto.randomUUID();return(element as SVGElement).dataset.testIdentity;});
  const latestOther=await changed.json();const renamedResponse=await second.request.post(`${appBase}/api/projects/${id}/tasks/${other.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...latestOther,reference:'other-renamed'},expected_version:latestOther.version}});expect(renamedResponse.ok()).toBe(true);await expect(originalCircle).toHaveAttribute('data-reference','#other-renamed');await expect(originalCircle).toBeFocused();await expect(originalCircle).toHaveAttribute('data-test-identity',circleIdentity!);
  expect(await frame.evaluate(element=>{const host=element as HTMLElement;return{identity:host.dataset.testIdentity,view:host.shadowRoot!.querySelector('#svg')!.getAttribute('viewBox')};})).toEqual(marker);
  await openFilters(page);await page.getByRole('combobox',{name:'Status filter',exact:true}).selectOption('open');await clickCircle(originalCircle);await expect(page.locator('.breadcrumb-buttons').getByText('Other',{exact:true})).toBeVisible();await circlePoint(tree(page).getByRole('button',{name:'Bubble Draft',exact:true}));
  const filteredView=await frame.evaluate(element=>element.shadowRoot!.querySelector('#svg')!.getAttribute('viewBox'));const parentCircle=tree(page).locator('circle[data-reference="#parent"]');await expect(parentCircle).toBeVisible();const parentFill=await parentCircle.getAttribute('fill');await expect(parentCircle).toHaveAttribute('pointer-events','none');
  const filteredOther=await renamedResponse.json();const removed=await second.request.post(`${appBase}/api/projects/${id}/tasks/${other.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...filteredOther,status:'planned'},expected_version:filteredOther.version}});expect(removed.ok()).toBe(true);await expect(tree(page).locator('circle[data-reference="#other-renamed"]')).toHaveCount(0);await expect(parentCircle).toBeVisible();await expect(parentCircle).toHaveAttribute('fill',parentFill!);expect(await frame.evaluate(element=>element.shadowRoot!.querySelector('#svg')!.getAttribute('viewBox'))).toBe(filteredView);
  await page.getByRole('combobox',{name:'Status filter',exact:true}).selectOption('');const plannedOther=await removed.json();const restored=await second.request.post(`${appBase}/api/projects/${id}/tasks/${other.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...plannedOther,status:'open'},expected_version:plannedOther.version}});expect(restored.ok()).toBe(true);await readyTree(page,await restored.json());await page.locator('.breadcrumb-buttons').getByText('Parent',{exact:true}).click();await circlePoint(tree(page).getByRole('button',{name:'Bubble Draft',exact:true}));
  await doubleClickCircle(tree(page).getByRole('button',{name:'Bubble Draft',exact:true}),'body');const dialog=page.getByRole('dialog');const input=dialog.getByRole('textbox',{name:'Description',exact:true});
  const candidate=current.tasks.find((task:{reference:string})=>task.reference==='candidate');await dialog.getByRole('combobox',{name:'Parent',exact:true}).selectOption(candidate.id);
  await input.fill('Unsaved description retained at its selection');await input.focus();await input.evaluate(element=>{const input=element as HTMLTextAreaElement;input.setSelectionRange(8,19);input.scrollTop=0;});
  const before=await dialog.evaluate(element=>{const input=document.activeElement as HTMLTextAreaElement;return{active:input.getAttribute('name'),start:input.selectionStart,end:input.selectionEnd,value:input.value,scroll:element.scrollTop,inputScroll:input.scrollTop,body:window.scrollY};});
  const latest=await(await second.request.get(`${appBase}/api/projects/${id}`)).json();const edited=latest.tasks.find((task:{reference:string})=>task.reference==='draft');
  expect((await second.request.post(`${appBase}/api/projects/${id}/tasks/${edited.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...edited,title:'Remote draft title'},expected_version:edited.version}})).ok()).toBe(true);
  await expect(dialog.getByText('The task changed elsewhere. Your draft is retained.',{exact:true})).toBeVisible();
  expect(await dialog.evaluate(element=>{const input=document.activeElement as HTMLTextAreaElement;return{active:input.getAttribute('name'),start:input.selectionStart,end:input.selectionEnd,value:input.value,scroll:element.scrollTop,inputScroll:input.scrollTop,body:window.scrollY};})).toEqual(before);
  await expect(dialog.getByLabel('Title',{exact:true})).toHaveValue('Draft');
  expect((await second.request.post(`${appBase}/api/projects/${id}/tasks/${candidate.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...candidate,archived:true},expected_version:candidate.version}})).ok()).toBe(true);await expect(tree(page).locator('circle[data-reference="#candidate"]')).toHaveCount(0);await expect(dialog.getByRole('combobox',{name:'Parent',exact:true})).toHaveValue(candidate.id);await expect(input).toBeFocused();expect(await input.evaluate(element=>({start:(element as HTMLTextAreaElement).selectionStart,end:(element as HTMLTextAreaElement).selectionEnd}))).toEqual({start:8,end:19});
  const rich=dialog.locator('.milkdown .ProseMirror');await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();await dialog.getByLabel('Details Markdown').fill(Array.from({length:60},(_,index)=>`Retained formatted line ${index}`).join('\n\n'));await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();await expect(rich.locator('p')).toHaveCount(60);await rich.press('ControlOrMeta+Home');for(let index=0;index<8;index++)await rich.press('Shift+ArrowRight');
  await rich.evaluate(element=>{element.scrollTop=Math.min(100,element.scrollHeight-element.clientHeight);(element as HTMLElement).dataset.testIdentity=crypto.randomUUID();});
  const richBefore=await rich.evaluate(element=>{const selection=window.getSelection();return{identity:(element as HTMLElement).dataset.testIdentity,text:element.textContent,active:document.activeElement===element,start:selection?.anchorOffset,end:selection?.focusOffset,anchor:selection?.anchorNode?.textContent,scroll:element.scrollTop,dialog:element.closest('dialog')!.scrollTop,body:window.scrollY};});expect(richBefore.scroll).toBeGreaterThan(0);
  const snapshot=await(await second.request.get(`${appBase}/api/projects/${id}`)).json();const remoteOther=snapshot.tasks.find((task:{id:string})=>task.id===other.id);const updated=await second.request.post(`${appBase}/api/projects/${id}/tasks/${other.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...remoteOther,description:'Changed while editing formatted text'},expected_version:remoteOther.version}});expect(updated.ok()).toBe(true);await readyTree(page,await updated.json());
  expect(await rich.evaluate(element=>{const selection=window.getSelection();return{identity:(element as HTMLElement).dataset.testIdentity,text:element.textContent,active:document.activeElement===element,start:selection?.anchorOffset,end:selection?.focusOffset,anchor:selection?.anchorNode?.textContent,scroll:element.scrollTop,dialog:element.closest('dialog')!.scrollTop,body:window.scrollY};})).toEqual(richBefore);
  await page.screenshot({path:`artifacts/live-editor-${test.info().project.name}.png`});
  await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();const retainedSource=dialog.getByLabel('Details Markdown');await expect(retainedSource).toBeVisible();expect((await retainedSource.inputValue()).match(/Retained formatted line \d+/g)).toEqual(Array.from({length:60},(_,index)=>`Retained formatted line ${index}`));await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();await expect(rich).toHaveText(richBefore.text!);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Discard changes',exact:true}).click();await page.getByRole('tab',{name:'Board',exact:true}).click();
  let row=remoteOther;for(let index=0;index<15;index++){const response=await second.request.post(`${appBase}/api/projects/${id}/tasks`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...remoteOther,id:crypto.randomUUID(),reference:`row-${index}`,title:`Row ${index}`,version:0},expected_version:0}});expect(response.ok()).toBe(true);row=await response.json();}
  for(const status of ['planned','in_work','merged','done','waiting','dropped']){const response=await second.request.post(`${appBase}/api/projects/${id}/tasks`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...remoteOther,id:crypto.randomUUID(),reference:`column-${status}`,title:`Column ${status}`,status,version:0},expected_version:0}});expect(response.ok()).toBe(true);await expect(page.getByTestId(`column-${status}`).getByTestId('task-card')).toHaveCount(1);}
  const lastCard=page.getByTestId('task-card').filter({hasText:'Row 14'});await expect(lastCard).toHaveCount(1);const board=page.locator('.board');const column=page.getByTestId('column-open');await board.evaluate(element=>element.scrollLeft=80);await column.evaluate(element=>element.scrollTop=150);await page.getByLabel('Search tasks').focus();
  const boardBefore=await page.evaluate(()=>({horizontal:document.querySelector('.board')!.scrollLeft,vertical:document.querySelector('[data-testid="column-open"]')!.scrollTop,active:(document.activeElement as HTMLInputElement).type,cursor:(document.activeElement as HTMLInputElement).selectionStart,body:window.scrollY}));expect(boardBefore.horizontal).toBeGreaterThan(0);expect(boardBefore.vertical).toBeGreaterThan(0);
  const rowUpdate=await second.request.post(`${appBase}/api/projects/${id}/tasks/${row.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...row,description:'Changed offscreen row'},expected_version:row.version}});expect(rowUpdate.ok()).toBe(true);row=await rowUpdate.json();await expect(lastCard.locator('p').first()).toHaveText('Changed offscreen row');
  expect(await page.evaluate(()=>({horizontal:document.querySelector('.board')!.scrollLeft,vertical:document.querySelector('[data-testid="column-open"]')!.scrollTop,active:(document.activeElement as HTMLInputElement).type,cursor:(document.activeElement as HTMLInputElement).selectionStart,body:window.scrollY}))).toEqual(boardBefore);
  await page.getByRole('tab',{name:'History',exact:true}).click();await page.locator('.history-list > li > button').filter({hasText:'Task imported'}).filter({hasText:'Draft'}).click();await expect(page.getByLabel('Historical title')).toHaveValue('Draft');await page.locator('.history-list').evaluate(element=>element.scrollTop=150);await page.getByLabel('Historical description').focus();await page.getByLabel('Historical description').evaluate(element=>(element as HTMLTextAreaElement).setSelectionRange(2,8));
  const historyBefore=await page.evaluate(()=>({scroll:document.querySelector('.history-list')!.scrollTop,title:(document.querySelector('.revision input') as HTMLInputElement).value,active:(document.activeElement as HTMLTextAreaElement).value,start:(document.activeElement as HTMLTextAreaElement).selectionStart,end:(document.activeElement as HTMLTextAreaElement).selectionEnd,body:window.scrollY}));expect(historyBefore.scroll).toBeGreaterThan(0);
  expect((await second.request.post(`${appBase}/api/projects/${id}/tasks/${row.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...row,description:'Newest recorded change'},expected_version:row.version}})).ok()).toBe(true);await expect(page.getByRole('button',{name:'Show new revisions',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>({scroll:document.querySelector('.history-list')!.scrollTop,title:(document.querySelector('.revision input') as HTMLInputElement).value,active:(document.activeElement as HTMLTextAreaElement).value,start:(document.activeElement as HTMLTextAreaElement).selectionStart,end:(document.activeElement as HTMLTextAreaElement).selectionEnd,body:window.scrollY}))).toEqual(historyBefore);
  await page.screenshot({path:`artifacts/live-history-${test.info().project.name}.png`});
  await page.getByRole('button',{name:'Show new revisions',exact:true}).click();await expect(page.getByLabel('Historical title')).toHaveValue('Row 14');await expect(page.getByLabel('Historical description')).toHaveValue('Newest recorded change');await second.close();
});
test('F7 F11 searchable selections retain complete task titles and saved assignments',async({page})=>{
  await login(page);await project(page);await page.getByRole('tab',{name:'Board',exact:true}).click();
  const first='Prerequisite with a complete title that extends beyond the field width';const second='Another independently named prerequisite whose complete title extends beyond the field width';
  await add(page,first);await add(page,second);await add(page,'Selected dependencies');await editTask(page,'Selected dependencies');
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Show dependencies',exact:true}).click();const options=page.getByRole('listbox');await expect(options).toBeVisible();await expect(options.getByRole('option',{name:first,exact:true})).toBeVisible();const bounds=await options.evaluate(element=>{const box=element.getBoundingClientRect();return{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,viewport:innerWidth,height:innerHeight,inDialog:!!element.closest('dialog'),scroll:element.scrollWidth,client:element.clientWidth};});expect(bounds.inDialog).toBe(true);expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);expect(bounds.top).toBeGreaterThanOrEqual(0);expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);expect(bounds.width).toBeGreaterThan(Math.min(400,width-48));expect(bounds.scroll).toBeLessThanOrEqual(bounds.client+1);await page.getByRole('combobox',{name:'Dependencies',exact:true}).press('Escape');}
  await page.setViewportSize({width:1440,height:900});
  await selectEntry(page,'Dependencies',first);await selectEntry(page,'Dependencies',second);await selectEntry(page,'Owners','akadmin');
  const selected=page.getByRole('list',{name:'Selected dependencies',exact:true});await expect(selected).toContainText(first);await expect(selected).toContainText(second);
  await selected.getByRole('button',{name:`Remove ${first}`,exact:true}).click();await expect(selected).not.toContainText(first);await expect(selected).toContainText(second);
  const input=page.getByRole('combobox',{name:'Dependencies',exact:true});await input.fill('No matching prerequisite');await expect(page.getByText('No matching entries',{exact:true})).toBeVisible();await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(0);await input.press('Escape');
  await input.fill(first);await input.press('ArrowDown');await input.press('Enter');await input.press('Escape');await expect(selected).toContainText(first);
  await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await page.reload();await page.getByRole('tab',{name:'Board',exact:true}).click();await editTask(page,'Selected dependencies');
  await expect(selected).toContainText(first);await expect(selected).toContainText(second);await expect(page.getByRole('list',{name:'Selected owners',exact:true})).toHaveText(/akadmin/);
  const id=new URL(page.url()).searchParams.get('project');const state=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();const task=state.tasks.find((value:{title:string})=>value.title==='Selected dependencies');expect(task.depends_on.sort()).toEqual(state.tasks.filter((value:{title:string})=>[first,second].includes(value.title)).map((value:{id:string})=>value.id).sort());expect(task.owners).toHaveLength(1);
  await selected.getByRole('button',{name:`Remove ${first}`,exact:true}).click();await selected.getByRole('button',{name:`Remove ${second}`,exact:true}).click();await page.getByRole('list',{name:'Selected owners',exact:true}).getByRole('button',{name:'Remove akadmin',exact:true}).click();await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await page.reload();await page.getByRole('tab',{name:'Board',exact:true}).click();await editTask(page,'Selected dependencies');await expect(selected.locator('li')).toHaveCount(0);await expect(page.getByRole('list',{name:'Selected owners',exact:true}).locator('li')).toHaveCount(0);
});

test('F7 viewport editor, persistent formatting toolbar and primary actions first',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await login(page);await project(page);await add(page,'Editor Task');
  await page.getByRole('tab',{name:'Board',exact:true}).click();await editTask(page,'Editor Task');const dialog=page.getByRole('dialog');
  expect(await dialog.locator('footer button').allTextContents()).toEqual(['Save task','Cancel']);
  const geometry=await dialog.evaluate(element=>{const box=element.getBoundingClientRect();return{width:box.width,height:box.height,viewport:innerWidth,scroll:element.scrollHeight,client:element.clientHeight,footer:element.querySelector('footer')!.getBoundingClientRect().bottom,screen:innerHeight};});
  expect(geometry.width).toBeGreaterThan(geometry.viewport*.95);expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);expect(geometry.footer).toBeLessThanOrEqual(geometry.screen);
  const rootFont=await page.locator('html').evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
  const preferences=await page.addStyleTag({content:'html { font-size:125%; } :root { --palette-blue:rgb(116, 56, 186); }'});
  await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();await dialog.getByLabel('Details Markdown').fill('## Section\n\nParagraph\n\n### Subsection\n\nMore text');await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();
  const type=await dialog.evaluate(element=>{const style=(selector:string)=>getComputedStyle(element.querySelector(selector)!);return{root:parseFloat(getComputedStyle(document.documentElement).fontSize),field:parseFloat(style('input').fontSize),paragraph:parseFloat(style('.ProseMirror p').fontSize),heading:parseFloat(style('.ProseMirror h2').fontSize),subheading:parseFloat(style('.ProseMirror h3').fontSize),before:parseFloat(style('.ProseMirror h2').marginBlockStart),after:parseFloat(style('.ProseMirror h2').marginBlockEnd),line:parseFloat(style('.ProseMirror p').lineHeight),accent:style('button.primary').backgroundColor};});
  expect(type.root).toBeCloseTo(rootFont*1.25);expect(type.field).toBe(type.root);expect(type.paragraph).toBe(type.root);expect(type.subheading).toBe(type.root);expect(type.heading).toBeCloseTo(type.root*1.2);expect(type.before).toBeCloseTo(type.line*3);expect(type.after).toBeCloseTo(type.line/2);expect(type.accent).toBe('rgb(116, 56, 186)');
  await page.setViewportSize({width:3840,height:1200});expect(await dialog.locator('input').first().evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBe(type.field);expect(await dialog.locator('.ProseMirror p').first().evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBe(type.paragraph);await preferences.evaluate(element=>element.remove());await page.setViewportSize({width:1440,height:900});
  const editor=dialog.locator('.milkdown .ProseMirror');await editor.fill('Toolbar text');await editor.press('ControlOrMeta+A');await dialog.getByRole('button',{name:'Bold',exact:true}).press('Enter');await expect(editor.locator('strong')).toHaveText('Toolbar text');
  await dialog.getByRole('button',{name:'Undo',exact:true}).click();await expect(editor.locator('strong')).toHaveCount(0);await dialog.getByRole('button',{name:'Redo',exact:true}).click();await expect(editor.locator('strong')).toHaveText('Toolbar text');
  await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();await expect(dialog.getByLabel('Details Markdown')).toHaveValue(/\*\*Toolbar text\*\*/);await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();await expect(editor.locator('strong')).toHaveText('Toolbar text');
  async function plain(){await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();await dialog.getByLabel('Details Markdown').fill('Toolbar text');await dialog.getByRole('button',{name:'Markdown source',exact:true}).click();await editor.click();await editor.press('ControlOrMeta+A');}
  for(const [button,selector]of [['Italic','em'],['Strikethrough','del'],['Inline code','code'],['Heading 2','h2'],['Heading 3','h3'],['Heading 4','h4'],['Heading 5','h5'],['Heading 6','h6'],['Bullet list','ul li'],['Numbered list','ol li'],['Task list','li:has(.label.unchecked)'],['Quote','blockquote'],['Horizontal rule','hr'],['Code block','.milkdown-code-block .cm-content'],['Table','table']]){
    await plain();if(button.startsWith('Heading'))await dialog.locator('.top-bar-heading-button').click();await dialog.getByRole('button',{name:button,exact:true}).click();
    const output=button==='Table'?editor.getByRole('table'):editor.locator(selector).first();await expect(output).toBeVisible();
    if(button==='Table'){await expect(output.getByRole('row')).toHaveCount(3);await expect(output.getByRole('columnheader')).toHaveCount(3);await expect(output.getByRole('cell')).toHaveCount(6);}
    else if(button!=='Horizontal rule')await expect(output).toContainText('Toolbar text');
  }
  await plain();await dialog.locator('.top-bar-heading-button').click();await dialog.getByRole('button',{name:'Heading 2',exact:true}).click();await expect(editor.locator('h2')).toHaveText('Toolbar text');await dialog.locator('.top-bar-heading-button').click();await dialog.locator('.top-bar-heading-option').filter({hasText:/^Paragraph$/}).click();await expect(editor.locator('p')).toHaveText('Toolbar text');
  await expect(dialog.locator('.milkdown-top-bar')).toBeVisible();await expect(dialog.locator('.milkdown-top-bar .top-bar-item svg')).not.toHaveCount(0);await expect(dialog.locator('.editor-toolbar')).toHaveCount(0);
  await plain();await dialog.getByRole('button',{name:'Link',exact:true}).click();const linkInput=dialog.getByPlaceholder('Paste link...');await linkInput.fill('javascript:alert(1)');await linkInput.press('Enter');expect(await editor.locator('a').evaluateAll(nodes=>nodes.some(node=>(node.getAttribute('href')??'').startsWith('javascript:')))).toBe(false);
  await plain();await dialog.getByRole('button',{name:'Link',exact:true}).click();await linkInput.fill('https://example.org/details');await linkInput.press('Enter');await expect(editor.locator('a')).toHaveAttribute('href','https://example.org/details');await expect(dialog.getByRole('alert')).not.toBeVisible();
  await plain();await dialog.getByRole('button',{name:'Link',exact:true}).click();await linkInput.press('Escape');await expect(linkInput).not.toBeVisible();
  await plain();await dialog.getByRole('button',{name:'Bold',exact:true}).click();
  await dialog.getByRole('button',{name:'Save task',exact:true}).click();await expect(dialog).not.toBeVisible();await editTask(page,'Editor Task');await expect(page.locator('.milkdown .ProseMirror strong')).toHaveText('Toolbar text');await page.getByRole('button',{name:'Cancel',exact:true}).click();
});

test('F4 direct original renderer survives repeated view and task switches without embedded pages',async({page})=>{
  await login(page);await project(page);await seedTasks(page,'# Direct Tree\n\n- ⏳M3 Parent - Parent Work #parent\n  - ⬜H2 Child - Child Work #child\n- 📄M2 Other - Other Work #other\n');
  const endpoint=`${appBase}/api/projects/${new URL(page.url()).searchParams.get('project')}/diagram?format=html`;
  const response=await page.request.get(endpoint);expect(response.ok()).toBe(true);expect(response.headers()['x-frame-options']).toBe('DENY');expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");expect(response.headers()['content-security-policy']).toContain("'sha256-");
  const standalone=await page.context().newPage();await standalone.goto(new URL(endpoint,appURL).href);await expect(standalone.locator('task-tree-view #svg circle')).toHaveCount(3);await expect(standalone.locator('iframe')).toHaveCount(0);await standalone.close();
  await expect(page.locator('iframe')).toHaveCount(0);await expect(tree(page).locator('#svg circle')).toHaveCount(3);
  const host=page.locator('.task-tree-host');const identity=await host.evaluate(element=>{element.setAttribute('data-lifecycle',crypto.randomUUID());return element.getAttribute('data-lifecycle');});
  for(let i=0;i<4;i++){
    await tree(page).getByRole('button',{name:'Bubble Parent',exact:true}).press('Enter');await expect(host).toHaveAttribute('data-host-reference','parent');
    await page.getByRole('tab',{name:'List',exact:true}).click();await expect(page.getByRole('region',{name:'Markdown task list'})).toBeVisible();
    await page.getByRole('tab',{name:'Board',exact:true}).click();await expect(page.getByRole('button',{name:'Child',exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'Bubbles',exact:true}).click();await expect(tree(page).getByRole('button',{name:'Bubble Child',exact:true})).toBeVisible();await expect(host).toHaveAttribute('data-lifecycle',identity!);
    await tree(page).locator('#chart').click({position:{x:1,y:1}});await expect(host).toHaveAttribute('data-host-reference','');await expect(tree(page).getByRole('button',{name:'Bubble Other',exact:true})).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);await expect(page.getByRole('alert')).not.toBeVisible();
  }
});

test('F4 opened parents retain overdue and status fills through navigation and live updates',async({page})=>{
  await login(page);await project(page);await seedTasks(page,'# Parent Colours\n\n- ⏳H3 20200101 Overdue Parent - Preserve the Overdue Fill #overdue\n  - ⬜M1 Child - Child Work #child\n- ⏳M3 Active Parent - Preserve the Status Fill #active\n  - ⬜L1 Other Child - Other Work #other-child');
  const id=new URL(page.url()).searchParams.get('project');
  for(const [reference,title,childTitle]of [['overdue','Overdue Parent','Child'],['active','Active Parent','Other Child']]){
    const circle=tree(page).getByRole('button',{name:`Bubble ${title}`,exact:true});const fill=await circle.getAttribute('fill');expect(fill).not.toBe('none');
    await circle.press('Enter');await expect(tree(page)).toHaveAttribute('data-host-reference',reference);await expect(circle).toBeVisible();await expect(circle).toHaveAttribute('fill',fill!);await expect(tree(page).getByRole('button',{name:`Bubble ${childTitle}`,exact:true})).toBeVisible();
    expect(await circle.evaluate(element=>getComputedStyle(element).pointerEvents)).toBe('none');
    const snapshot=await(await page.request.get(`${appBase}/api/projects/${id}`)).json();const child=snapshot.tasks.find((task:{title:string})=>task.title===childTitle);const me=await(await page.request.get(`${appBase}/api/me`)).json();
    const changed=await page.request.post(`${appBase}/api/projects/${id}/tasks/${child.id}`,{headers:{'X-CSRF-Token':me.csrf_token,Origin:appOrigin},data:{task:{...child,description:'Updated child work'},expected_version:child.version}});expect(changed.ok()).toBe(true);
    await expect(tree(page).getByRole('button',{name:`Bubble ${childTitle}`,exact:true})).toHaveAttribute('aria-description',/Updated child work/);await expect(circle).toBeVisible();await expect(circle).toHaveAttribute('fill',fill!);
    await tree(page).locator('#chart').click({position:{x:1,y:1}});await expect(tree(page)).toHaveAttribute('data-host-reference','');
  }
  const standalone=await page.context().newPage();try{await standalone.goto(`${appURL}/api/projects/${id}/diagram?format=html`);const parent=standalone.locator('circle[aria-label="Bubble Overdue Parent"]');const fill=await parent.getAttribute('fill');const point=await circlePoint(parent);await standalone.mouse.click(point.x,point.y);await expect(standalone.locator('#path button').last()).toHaveText('Overdue Parent');await expect(parent).toBeVisible();await expect(parent).toHaveAttribute('fill',fill!);}finally{await standalone.close();}
});

test('F5 cards edit on one click, show child titles and navigate on double-click or child-list click',async({page})=>{
  await login(page);await project(page);await seedTasks(page,'# Card Gestures\n\n- ⏳3 Parent - Parent Work #parent\n  - ⬜H2 First Child - First Work #first-child\n  - 📄L1 Second Child - Second Work #second-child\n- ⬜M1 Other - Other Work #other');
  await page.getByRole('tab',{name:'Board',exact:true}).click();const parent=page.getByTestId('task-card').filter({has:page.locator('.card-title').filter({hasText:/^Parent$/})});
  await expect(parent.locator('.card-children li')).toHaveText(['First Child','Second Child']);await expect(parent.getByRole('button')).toHaveText(['Parent']);
  await parent.locator('p').first().click();await expect(page.getByRole('dialog').getByLabel('Title',{exact:true})).toHaveValue('Parent');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await parent.locator('.card-title').dblclick();await expect(page.getByTestId('task-card')).toHaveCount(2);await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('.card-title')).toHaveText(['First Child','Second Child']);
  await page.locator('nav.breadcrumbs .breadcrumb-buttons button').first().click();await parent.getByRole('link',{name:'Open children of Parent',exact:true}).click();await expect(page.locator('.card-title')).toHaveText(['First Child','Second Child']);await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.locator('nav.breadcrumbs .breadcrumb-buttons button').first().click();await parent.getByRole('link').focus();await page.keyboard.press('Enter');await expect(page.getByTestId('task-card')).toHaveCount(2);
  await page.getByRole('button',{name:'First Child',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog').getByLabel('Title',{exact:true})).toHaveValue('First Child');await page.getByRole('button',{name:'Cancel',exact:true}).click();
});

test('F5 empty columns retain half width and status drops preserve priority colours',async({page})=>{
  await page.setViewportSize({width:1920,height:1000});await login(page);await project(page);await seedTasks(page,'# Column Widths\n\n- ⏳3 Shared Work - Preserve the Properties #shared\n- ⏳H3 Priority Work - Preserve High Priority #priority');
  await page.getByRole('tab',{name:'Board',exact:true}).click();const occupied=page.getByTestId('column-in_work');const empty=page.getByTestId('column-merged');
  const widths=await page.locator('.board-column').evaluateAll(elements=>elements.map(element=>({empty:element.getAttribute('data-empty')==='true',width:element.getBoundingClientRect().width})));const full=widths.find(column=>!column.empty)!.width;for(const column of widths.filter(column=>column.empty))expect(Math.abs(column.width*2-full)).toBeLessThan(1);
  const shared=page.getByTestId('task-card').filter({has:page.getByRole('button',{name:'Shared Work',exact:true})});const priority=page.getByTestId('task-card').filter({has:page.getByRole('button',{name:'Priority Work',exact:true})});
  const grey=await shared.evaluate(element=>getComputedStyle(element).borderInlineStartColor);const blue=await priority.evaluate(element=>getComputedStyle(element).borderInlineStartColor);expect(blue).not.toBe(grey);
  for(const title of ['Shared Work','Priority Work'])for(const destination of ['merged','in_work']){const card=page.getByTestId('task-card').filter({has:page.getByRole('button',{name:title,exact:true})});await card.dragTo(page.getByTestId(`column-${destination}`));await expect(page.getByTestId(`column-${destination}`).getByRole('button',{name:title,exact:true})).toBeVisible();await expect(card).toHaveAttribute('data-priority',title==='Shared Work'?'':'H');expect(await card.evaluate(element=>getComputedStyle(element).borderInlineStartColor)).toBe(title==='Shared Work'?grey:blue);}
  await expect(occupied.getByTestId('task-card')).toHaveCount(2);await expect(empty).toHaveAttribute('data-empty','true');
  await page.setViewportSize({width:390,height:844});const mobile=await page.locator('.board-column').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().width));expect(new Set(mobile).size).toBe(1);
});

test('F5 selected leaf tasks appear as cards when switching from the nested list',async({page})=>{
  await login(page);await project(page);await seedTasks(page,'# Leaf Selection\n\n- ⏳3 Parent - Parent Work #parent\n  - ⬜H2 Child - Child Work #child\n    - 📄L1 Leaf - Leaf Work #leaf\n');
  await page.getByRole('tab',{name:'List',exact:true}).click();await page.getByRole('region',{name:'Markdown task list'}).getByRole('button',{name:'Leaf',exact:true}).click();
  await page.getByRole('tab',{name:'Board',exact:true}).click();const card=page.getByTestId('task-card');await expect(card).toHaveCount(1);await expect(card).toContainText('Leaf');await expect(page.locator('.board-column[data-status="planned"]').getByTestId('task-card')).toHaveCount(1);
  await card.getByRole('button',{name:'Leaf',exact:true}).click();await expect(page.getByRole('dialog').getByRole('textbox',{name:'Title',exact:true})).toHaveValue('Leaf');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('nav.breadcrumbs .breadcrumb-buttons button').filter({hasText:/^Child$/}).click();await expect(card).toHaveCount(1);await expect(card).toContainText('Leaf');
  await page.locator('nav.breadcrumbs .breadcrumb-buttons button').filter({hasText:/^Parent$/}).click();await expect(card).toHaveCount(1);await expect(card).toContainText('Child');
});

test('F12 collapsible task rows align metadata and hide document identifiers',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await login(page);await project(page);await seedTasks(page,'# Compact List\n\n- ⏳3 Parent - Parent Work #parent\n  - ⬜H2 20261115 Child - Child Work #task-secret\n    - 📄L1 Leaf - Leaf Work #leaf\n- ✅M1 Other - Other Work #other\n');
  await page.getByRole('tab',{name:'List',exact:true}).click();const list=page.getByRole('region',{name:'Markdown task list'});
  await expect(list.locator('[data-task-row]')).toHaveCount(4);await expect(list).not.toContainText('#task-secret');await expect(list).not.toContainText('#parent');
  const compact=await list.locator('.list-row').evaluateAll(rows=>rows.map(row=>({height:row.getBoundingClientRect().height,root:parseFloat(getComputedStyle(document.documentElement).fontSize),weight:getComputedStyle(row.querySelector('.list-title')!).fontWeight,line:parseFloat(getComputedStyle(row.querySelector('.markdown-entry')!).lineHeight)/parseFloat(getComputedStyle(row.querySelector('.markdown-entry')!).fontSize)})));for(const row of compact){expect(Number(row.weight)).toBeGreaterThanOrEqual(700);expect(row.line).toBeCloseTo(1.25,1);expect(row.height).toBeLessThanOrEqual(row.root*1.75);}
  const chosen=list.locator('[data-reference="task-secret"] > .list-row');await chosen.getByRole('button',{name:'Child',exact:true}).click();await expect(chosen).toHaveAttribute('data-selected','true');await page.mouse.move(0,0);const paint=await chosen.evaluate(element=>({background:getComputedStyle(element).backgroundColor,marker:getComputedStyle(element).boxShadow}));expect(paint.marker).not.toBe('none');expect(paint.background).not.toBe(await list.locator('[data-reference="other"] > .list-row').evaluate(element=>getComputedStyle(element).backgroundColor));
  await page.getByRole('tab',{name:'Board',exact:true}).click();await page.getByRole('tab',{name:'List',exact:true}).click();await expect(chosen.getByRole('button',{name:'Child',exact:true})).toHaveAttribute('aria-current','true');expect(await chosen.evaluate(element=>({background:getComputedStyle(element).backgroundColor,marker:getComputedStyle(element).boxShadow}))).toEqual(paint);
  const projectId=new URL(page.url()).searchParams.get('project');const snapshot=await(await page.request.get(`${appBase}/api/projects/${projectId}`)).json();const other=snapshot.tasks.find((task:any)=>task.reference==='other');const identity=await(await page.request.get(`${appBase}/api/me`)).json();const changed=await page.request.post(`${appBase}/api/projects/${projectId}/tasks/${other.id}`,{headers:{'X-CSRF-Token':identity.csrf_token,Origin:appOrigin},data:{task:{...other,description:'Updated through the API'},expected_version:other.version}});expect(changed.ok()).toBe(true);await expect(list.locator('[data-reference="other"] > .list-row')).toContainText('Updated through the API');await expect(chosen).toHaveAttribute('data-selected','true');expect(await chosen.evaluate(element=>({background:getComputedStyle(element).backgroundColor,marker:getComputedStyle(element).boxShadow}))).toEqual(paint);
  const parent=list.getByRole('button',{name:'Collapse Parent',exact:true});await parent.click();await expect(list.locator('[data-reference="task-secret"]')).toBeHidden();await expect(list.locator('[data-reference="leaf"]')).toBeHidden();
  await expect(list.getByRole('button',{name:'Expand Parent',exact:true})).toHaveAttribute('aria-expanded','false');
  await page.getByRole('tab',{name:'Board',exact:true}).click();await page.getByRole('tab',{name:'List',exact:true}).click();await expect(list.locator('[data-reference="task-secret"]')).toBeHidden();
  await list.getByRole('button',{name:'Expand Parent',exact:true}).click();await expect(list.locator('[data-reference="leaf"]')).toBeVisible();
  const cells=await list.locator('[data-reference="task-secret"] > .list-row .task-meta-cell').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().width));expect(cells).toHaveLength(3);expect(Math.max(...cells)-Math.min(...cells)).toBeLessThan(.5);
  await expect(list.locator('[data-reference="task-secret"] > .list-row .list-title')).toHaveText('Child');const shortDate=await page.evaluate(()=>new Intl.DateTimeFormat(navigator.language,{dateStyle:'short'}).format(new Date(2026,10,15)));await expect(list.locator('[data-reference="task-secret"] > .list-row time')).toHaveText(shortDate);
  const alignment=await chosen.evaluate(row=>({date:row.querySelector('time')!.getBoundingClientRect().right,row:row.getBoundingClientRect().right}));expect(alignment.row-alignment.date).toBeLessThan(8);
  await page.setViewportSize({width:320,height:740});await expect(list.locator('[data-reference="task-secret"] > .list-row')).toBeVisible();expect(await list.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('F12 list dates follow the browser locale at the right edge and text truncates',async({page,browser})=>{
  await login(page);await project(page);await seedTasks(page,'# Local Dates\n\n- ⏳H3 20301231 Long task title and description that remain available in full - A deliberately long description that uses the complete available line before the date #dated\n  - ⬜M1 20301231 Child - Nested task date #child\n- 📄L1 20301231 Other - Another root date #other\n');
  const url=page.url();
  for(const [locale,date]of [['en-US','12/31/30'],['de-CH','31.12.30']]){const context=await browser.newContext({locale,viewport:{width:1440,height:900}});try{
    const localized=await context.newPage();await login(localized);await localized.goto(url);await expandSidebar(localized);await localized.getByRole('tab',{name:'List',exact:true}).click();const list=localized.getByRole('region',{name:'Markdown task list'});await expect(list.locator('time')).toHaveText([date,date,date]);
    for(const width of [1440,390,320]){await localized.setViewportSize({width,height:900});const positions=await list.locator('.list-row').evaluateAll(rows=>rows.map(row=>({right:row.querySelector('time')!.getBoundingClientRect().right,end:row.getBoundingClientRect().right})));expect(Math.max(...positions.map(position=>position.right))-Math.min(...positions.map(position=>position.right))).toBeLessThan(1);for(const position of positions)expect(position.end-position.right).toBeLessThan(8);expect(await localized.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
    const content=list.locator('[data-reference="dated"] > .list-row .list-content');expect(await content.evaluate(element=>({clipped:element.scrollWidth>element.clientWidth,ellipsis:getComputedStyle(element).textOverflow,wrap:getComputedStyle(element).whiteSpace}))).toEqual({clipped:true,ellipsis:'ellipsis',wrap:'nowrap'});await expect(content).toContainText('A deliberately long description that uses the complete available line before the date');
  }finally{await context.close();}}
});

test('F12 nested Markdown list moves complete subtrees with pointer, keyboard and touch',async({page,context},info)=>{
  test.setTimeout(180000);
  await login(page);await project(page);
  await seedTasks(page,`# Ordered Work ${test.info().project.name} ${Date.now()}\n\n- ⏳M3 Parent - Parent Work #parent\n  - ⬜H2 20261115 Child - Child Work #child ^\n    - 📄L1 Leaf - Leaf Work #leaf\n- ✅M1 Other - Other Work #other\n`);
  await page.getByRole('tab',{name:'List',exact:true}).click();
  const tabs=await page.getByRole('tablist',{name:'Project views'}).getByRole('tab').allTextContents();expect(tabs).toEqual(['Bubbles','Board','List','Sprints','History','Members']);
  const list=page.getByRole('region',{name:'Markdown task list'});const rows=list.locator('[data-task-row]');
  const mirror=await context.newPage();await mirror.goto(page.url());await expect(mirror.getByRole('button',{name:'Add task',exact:true})).toBeEnabled();await mirror.getByRole('tab',{name:'List',exact:true}).click();
  await mirror.getByRole('button',{name:'Move Child',exact:true}).focus();
  await expect(rows).toHaveCount(4);
  const base=`${appBase}/api/projects/${new URL(page.url()).searchParams.get('project')}`;
  const exported=await(await page.request.get(`${base}/export?format=markdown`)).text();
  const presented=await rows.locator('.markdown-entry').allTextContents();
  expect(presented).toHaveLength(exported.split('\n').filter(line=>/^\s*- /.test(line)).length);
  for(const [index,title]of ['Parent','Child','Leaf','Other'].entries())expect(presented[index]).toContain(title);
  expect(presented.join('\n')).not.toMatch(/#(?:parent|child|leaf|other)/);
  await expect(rows.locator('.task-meta-cell').nth(3)).toHaveText('⬜');await expect(rows.locator('.task-meta-cell').nth(4)).toHaveText('H');await expect(rows.locator('.task-meta-cell').nth(5)).toHaveText('2');
  const shortDate=await page.evaluate(()=>new Intl.DateTimeFormat(navigator.language,{dateStyle:'short'}).format(new Date(2026,10,15)));await expect(rows.locator('time')).toHaveText(shortDate);expect(exported).toContain('#child ^');
  const child=list.locator('[data-reference="child"] > .list-row');
  const handle=child.getByRole('button',{name:'Move Child',exact:true});
  await handle.press('Space');await handle.press('ArrowLeft');await handle.press('Enter');
  await expect(list.locator('[data-reference="child"]')).toHaveAttribute('data-parent','');
  await expect(list.locator('[data-reference="leaf"]')).toHaveAttribute('data-parent',await list.locator('[data-reference="child"]').getAttribute('data-task-id') as string);
  await expect(handle).toBeFocused();
  await expect(mirror.getByRole('button',{name:'Move Child',exact:true})).toBeFocused();
  await handle.press('Space');await handle.press('ArrowUp');await handle.press('Enter');await expect(rows.first()).toHaveAttribute('data-task-row',await list.locator('[data-reference="child"]').getAttribute('data-task-id') as string);
  await handle.press('Space');await handle.press('ArrowDown');await handle.press('ArrowRight');await handle.press('Enter');await expect(list.locator('[data-reference="parent"] [data-reference="child"]')).toBeVisible();
  await handle.press('Space');await handle.press('ArrowLeft');await handle.press('Enter');await expect(list.locator('[data-reference="child"]')).toHaveAttribute('data-parent','');
  async function dragTo(target:Locator,fraction:number){const from=await handle.boundingBox();const to=await target.boundingBox();await page.mouse.move(from!.x+from!.width/2,from!.y+from!.height/2);await page.mouse.down();await page.mouse.move(to!.x+to!.width/2,to!.y+to!.height*fraction,{steps:12});await page.mouse.up();}
  await dragTo(list.locator('[data-reference="parent"] > .list-row'),.1);await expect(rows.first()).toHaveAttribute('data-task-row',await list.locator('[data-reference="child"]').getAttribute('data-task-id') as string);
  await dragTo(list.locator('[data-reference="other"] > .list-row'),.9);await expect(list.locator('> ul > li').last()).toHaveAttribute('data-reference','child');
  await dragTo(list.locator('[data-reference="other"] > .list-row'),.5);
  await expect(list.locator('[data-reference="child"]')).toHaveAttribute('data-parent',await list.locator('[data-reference="other"]').getAttribute('data-task-id') as string);
  await expect(list.locator('[data-reference="leaf"]')).toHaveAttribute('data-parent',await list.locator('[data-reference="child"]').getAttribute('data-task-id') as string);
  await expect(mirror.locator('[data-reference="other"] [data-reference="child"] [data-reference="leaf"]')).toBeVisible();await expect(mirror.getByRole('button',{name:'Move Child',exact:true})).toBeFocused();await expect(mirror.getByRole('tab',{name:'List',exact:true})).toHaveAttribute('aria-selected','true');await mirror.close();
  const beforeInvalid=await(await page.request.get(base)).json();await dragTo(list.locator('[data-reference="leaf"] > .list-row'),.5);await expect(list.getByRole('status')).toContainText('Move cancelled');expect((await(await page.request.get(base)).json()).sequence).toBe(beforeInvalid.sequence);
  await page.reload();await page.getByRole('tab',{name:'List',exact:true}).click();await expect(list.locator('[data-reference="other"] [data-reference="child"] [data-reference="leaf"]')).toBeVisible();
  await list.getByRole('button',{name:'Move Child',exact:true}).press('Space');await list.getByRole('button',{name:'Move Child',exact:true}).press('Escape');
  await list.getByRole('button',{name:'Child',exact:true}).dblclick();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Child');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await child.click({button:'right'});await expect(page.getByRole('menu')).toBeVisible();await page.getByRole('button',{name:'Close menu',exact:true}).click();
  const revisions=await(await page.request.get(`${base}/history`)).json();expect(revisions.filter((r:{action:string})=>r.action==='task_moved').length).toBeGreaterThanOrEqual(2);
  await page.getByRole('tab',{name:'History',exact:true}).click();await expect(page.locator('.history-list').getByText('Task moved',{exact:true}).first()).toBeVisible();await page.getByRole('tab',{name:'List',exact:true}).click();
  await list.getByRole('button',{name:'Move Child',exact:true}).press('Space');
  const beforeConflict=await(await page.request.get(base)).json();const otherTask=beforeConflict.tasks.find((task:{reference:string})=>task.reference==='other');const csrf=(await(await page.request.get(`${appBase}/api/me`)).json()).csrf_token;
  expect((await page.request.post(`${base}/tasks/${otherTask.id}`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{task:{...otherTask,description:'Changed remotely'},expected_version:otherTask.version}})).ok()).toBe(true);
  const stale=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.endsWith('/move'));
  await list.getByRole('button',{name:'Move Child',exact:true}).press('ArrowLeft');await list.getByRole('button',{name:'Move Child',exact:true}).press('Enter');expect((await stale).status()).toBe(409);await expect(list.getByRole('status')).toContainText('Another user saved changes');
  await expect(list.locator('[data-reference="other"] [data-reference="child"] [data-reference="leaf"]')).toBeVisible();
  await page.screenshot({path:info.outputPath('nested-list-desktop.png'),fullPage:true});
  await page.setViewportSize({width:320,height:740});await expandSidebar(page);await page.getByRole('tab',{name:'List',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await list.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('nested-list-mobile.png'),fullPage:true});
  // Pointer events use the same captured handle on touch devices.
  const touch=context.browser()!;const phone=await touch.newContext({viewport:{width:390,height:844},hasTouch:true,storageState:await context.storageState()});const mobile=await phone.newPage();await mobile.goto(page.url());await expandSidebar(mobile);await mobile.getByRole('tab',{name:'List',exact:true}).click();
  const touchHandle=mobile.getByRole('button',{name:'Move Child',exact:true});const target=mobile.locator('[data-reference="parent"] > .list-row');const a=await touchHandle.boundingBox();const b=await target.boundingBox();
  await touchHandle.dispatchEvent('pointerdown',{pointerId:9,pointerType:'touch',clientX:a!.x+10,clientY:a!.y+10,bubbles:true});await touchHandle.dispatchEvent('pointermove',{pointerId:9,pointerType:'touch',clientX:b!.x+b!.width/2,clientY:b!.y+b!.height/2,bubbles:true});await touchHandle.dispatchEvent('pointerup',{pointerId:9,pointerType:'touch',bubbles:true});
  await expect(mobile.locator('[data-reference="parent"] [data-reference="child"] [data-reference="leaf"]')).toBeVisible();await phone.close();
  const readonlyContext=await touch.newContext({baseURL:appURL});const readonly=await readonlyContext.newPage();await login(readonly,'reader');const readerMe=await(await readonly.request.get(`${appBase}/api/me`)).json();const membership=await(await page.request.get(base)).json();
  expect((await page.request.post(`${base}/members`,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data:{user_id:readerMe.user.id,role:'member',expected_sequence:membership.sequence}})).ok()).toBe(true);
  await readonly.goto(page.url());await readonly.getByRole('tab',{name:'List',exact:true}).click();const disabled=readonly.locator('.list-handle');await expect(disabled).toHaveCount(4);for(const button of await disabled.all())await expect(button).toBeDisabled();
  const unchanged=await(await readonly.request.get(base)).json();const forbidden=await readonly.request.post(`${base}/tasks/${unchanged.tasks[0].id}/move`,{headers:{'X-CSRF-Token':readerMe.csrf_token,Origin:appOrigin},data:{parent_id:null,before_id:null,expected_sequence:unchanged.sequence}});expect(forbidden.status()).toBe(403);expect((await(await readonly.request.get(base)).json()).sequence).toBe(unchanged.sequence);await readonlyContext.close();
});

test('F4 F5 F8 runtime print fixture with populated planning and revisions',async({page,context})=>{
  await login(page);await project(page);await seedTasks(page,visualSource());
  const id=new URL(page.url()).searchParams.get('project');const base=`${appBase}/api/projects/${id}`;const csrf=(await(await page.request.get(`${appBase}/api/me`)).json()).csrf_token;
  async function post(path:string,data:unknown){const response=await page.request.post(path,{headers:{'X-CSRF-Token':csrf,Origin:appOrigin},data});expect(response.ok(),await response.text()).toBe(true);return response.json();}
  let current=await(await page.request.get(base)).json();let delivery=current.tasks.find((task:{reference:string})=>task.reference==='delivery');
  delivery=await post(`${base}/tasks/${delivery.id}`,{task:{...delivery,details:'## First saved details\n\nVersion one.'},expected_version:delivery.version});
  delivery=await post(`${base}/tasks/${delivery.id}`,{task:{...delivery,title:'Delivery updated',description:'Second saved description',details:'## Second saved details\n\nVersion two.'},expected_version:delivery.version});
  delivery=await post(`${base}/tasks/${delivery.id}`,{task:{...delivery,details:'## First saved details\n\nVersion one.'},expected_version:delivery.version});
  current=await(await page.request.get(base)).json();const sprint=await post(`${base}/sprints`,{sprint:{id:crypto.randomUUID(),title:'Delivery Sprint',goal:'Retain planning and saved revisions across restarts',start_date:'2026-11-01',end_date:'2026-11-14',status:'active'},expected_sequence:current.sequence});
  delivery=await post(`${base}/tasks/${delivery.id}`,{task:{...delivery,sprint_id:sprint.id},expected_version:delivery.version});
  await expect(tree(page).getByRole('button',{name:'Bubble Delivery updated',exact:true})).toBeVisible({timeout:60000});
  await context.storageState({path:'artifacts/visual-session.json'});await writeFile('artifacts/visual-url.txt',page.url());
});

test('F2 F4 F5 F7 F8 F9 F10 responsive views, complete saved text history and persistence fixture', async ({page,context},info)=>{
  await login(page);await project(page);
  const source=visualSource();
  expect((await uploadTaskFile(page,source)).ok()).toBe(true);
  for(const width of [2400,1280,768,390]){
    await page.setViewportSize({width,height:width===390?844:1200});
    await expect(tree(page).getByRole('button',{name:'Bubble Delivery',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(width===390){await tree(page).getByRole('button',{name:'Bubble Workstream 1',exact:true}).focus();await tree(page).getByRole('button',{name:'Bubble Workstream 1',exact:true}).press('Enter');await expect(page.getByRole('combobox',{name:'Task level',exact:true}).locator('option:checked')).toHaveText('Workstream 1');}
    await expect(tree(page).locator('text[data-label-for]').first()).toBeVisible();
    const measured=await tree(page).locator('#svg').evaluate(measureLabelPaint);
    await writeFile(info.outputPath(`labels-${width}.json`),JSON.stringify(measured.labels));
    for(const failure of measured.failures){
      await writeFile(info.outputPath(`label-${width}-${failure.index}.svg`),failure.svg);
      await writeFile(info.outputPath(`label-${width}-${failure.index}.png`),Buffer.from(failure.png.split(',')[1],'base64'));
    }
    expect(measured.labels.length).toBeGreaterThan(0);expect(measured.labels.filter(label=>!label.pixels||!label.inside||!label.clear)).toEqual([]);
    await mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/bubbles-${info.project.name}-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:2400,height:1200});await expandSidebar(page);
  await page.getByRole('navigation',{name:'Task path'}).getByRole('button').first().click();
  await editTask(page,'Delivery');
  await page.getByRole('button',{name:'Markdown source',exact:true}).click();await page.getByLabel('Details Markdown').fill('## First saved details\n\nVersion one.');await page.getByRole('button',{name:'Save task',exact:true}).click();
  await editTask(page,'Delivery');await page.getByLabel('Title',{exact:true}).fill('Delivery updated');await page.getByRole('textbox',{name:'Description',exact:true}).fill('Second saved description');await page.getByRole('button',{name:'Markdown source',exact:true}).click();await page.getByLabel('Details Markdown').fill('## Second saved details\n\nVersion two.');await page.getByRole('button',{name:'Save task',exact:true}).click();
  await editTask(page,'Delivery updated');await page.getByRole('tab',{name:'Task history',exact:true}).click();
  const revisions=page.locator('[aria-label="Task edit history"] .history-list button');await expect(revisions).toHaveCount(3);
  await revisions.nth(1).click();await expect(page.getByLabel('Historical details')).toHaveValue('## First saved details\n\nVersion one.');await page.getByLabel('Restore details',{exact:true}).check();await page.getByRole('button',{name:'Restore selected fields',exact:true}).click();
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Delivery updated');await expect(page.getByRole('textbox',{name:'Description',exact:true})).toHaveValue('Second saved description');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('tab',{name:'Sprints',exact:true}).click();
  await page.getByRole('textbox',{name:'Sprint title',exact:true}).fill('Delivery Sprint');
  await page.getByRole('textbox',{name:'Sprint goal',exact:true}).fill('Retain planning and saved revisions across restarts');
  await page.getByRole('combobox',{name:'Sprint status',exact:true}).selectOption('active');
  const planning=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.endsWith('/sprints'));
  await page.getByRole('button',{name:'Save sprint',exact:true}).click();
  const planned=await planning;expect(planned.ok(),await planned.text()).toBe(true);const sprint=await planned.json();expect(sprint.status).toBe('active');
  await page.getByRole('tab',{name:'Bubbles',exact:true}).click();
  await editTask(page,'Delivery updated');
  await page.getByRole('combobox',{name:'Sprint',exact:true}).selectOption(sprint.id);
  const assigning=taskResponse(page);await page.getByRole('button',{name:'Save task',exact:true}).click();
  const assigned=await assigning;expect(assigned.ok(),await assigned.text()).toBe(true);const task=await assigned.json();expect(task.sprint_id).toBe(sprint.id);
  await readyTree(page,task);
  await context.storageState({path:'artifacts/visual-session.json'});await writeFile('artifacts/visual-url.txt',page.url());
  const snapshot=await page.evaluate(async()=>{const appBase=globalThis.document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content??'';const id=new URL(location.href).searchParams.get('project');const snapshot=await(await fetch(`${appBase}/api/projects/${id}`)).json();const exported=await(await fetch(`${appBase}/api/projects/${id}/export?format=json`)).json();return{project:id,snapshot,history:exported.history};});
  expect(snapshot.snapshot.sprints).toHaveLength(1);expect(snapshot.snapshot.sprints[0].id).toBe(sprint.id);
  expect(snapshot.snapshot.tasks.find((saved:{id:string})=>saved.id===task.id).sprint_id).toBe(sprint.id);
  await writeFile('artifacts/persistence.json',JSON.stringify(snapshot));
});
