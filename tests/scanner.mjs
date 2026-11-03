import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
const url=(await readFile('artifacts/visual-url.txt','utf8')).trim();
function docker(args,allowed=false){const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0&&!allowed)throw new Error(r.stderr||r.stdout);if(r.stdout)console.log(r.stdout.slice(-2000));return r.stdout.trim();}
const click=css=>({action:'click',target:{css}});
const expand={...click('button[aria-label="Expand sidebar"]'),when:{visible:{css:'button[aria-label="Expand sidebar"]'}}};
const edit={action:'press',target:{css:'[aria-label="Bubble Delivery updated"]'},key:'F2'};
const states={
  list:[expand,click('[role="tab"]:has-text("List")')],
  listmove:[expand,click('[role="tab"]:has-text("List")'),{action:'press',target:{css:'.markdown-list > ul > li:first-child > .list-row > .list-handle'},key:'Space'}],
  bubbles:[],legend:[{action:'click',target:{css:'details.tree-legend > summary'},when:{visible:{css:'details.tree-legend > summary'}}}],board:[expand,click('[role="tab"]:has-text("Board")')],history:[expand,click('[role="tab"]:has-text("History")')],
  children:[expand,click('[role="tab"]:has-text("Board")'),click('[role=link][aria-label="Open children of Delivery updated"]')],
  editor:[edit],dependencies:[edit,click('button[aria-label="Show dependencies"]')],markdown:[edit,click('button:has-text("Markdown source")')],
  revisions:[edit,click('[role="tab"]:has-text("Task history")')],
  sprints:[expand,click('[role="tab"]:has-text("Sprints")')],members:[expand,click('[role="tab"]:has-text("Members")')],
  sidebar:[expand],collapsed:[expand,click('button[aria-label="Collapse sidebar"]')],
  filters:[expand,click('.filters summary')],
  rename:[expand,click('button[aria-label="Rename project"]')],
  link:[edit,click('.milkdown-top-bar button:has(svg[aria-label="Link"])')],
  importerror:[expand,click('.file-actions button:text-is("Load")'),{action:'upload',target:{css:'input[type="file"]'},files:['/tmp/invalid.md']}],
  context:[{action:'press',target:{css:'[aria-label="Bubble Delivery updated"]'},key:'Shift+F10'}],
  hover:[{action:'hover',target:{css:'[aria-label="Bubble Task 1.1"]'}}],
  conflict:[
    expand,{action:'expectPopup',name:'remote',trigger:{action:'click',target:{css:'a[href$="/api/docs"]'},button:'middle'}},
    {action:'waitForSelector',target:{css:'#operations article:first-child'},state:'visible'},
    {action:'goto',url},{action:'waitForSelector',target:{css:'[aria-label="Bubble Delivery updated"]'},state:'visible'},
    {action:'usePage',name:'main'},click('button[aria-label="Collapse sidebar"]'),edit,{action:'fill',target:{label:'Description',exact:true},value:'Retained conflict draft'},
    {action:'usePage',name:'remote'},edit,click('label:has-text("Next week") input'),click('button:text-is("Save task")'),{action:'expectHidden',target:{css:'dialog.task-editor'}},
    {action:'usePage',name:'main'},{action:'waitForSelector',target:{css:'dialog.task-editor > .notice'},state:'visible'},{action:'closePage',name:'remote'}
  ],
  api:[expand,click('a[href$="/api/docs"]')],
  signin:[],signinerror:[]
};
const readySelectors={bubbles:'.task-tree-host',board:'.board',history:'.history-list > li:first-child > button',editor:'.milkdown .ProseMirror',markdown:'label:has-text("Details Markdown") textarea',revisions:'.history-list > li:first-child > button',sprints:'label:has-text("Sprint title") input',members:'.members label:first-of-type select',sidebar:'.project-sidebar',collapsed:'button[aria-label="Expand sidebar"]',filters:'.filter-fields',rename:'.project-dialog',link:'.milkdown-link-edit[data-show="true"] input',context:'.context-menu',hover:'[role="tooltip"]',api:'#operations article:first-child'};
const label=process.argv[2]??'final';if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid scanner output label.');
readySelectors.children='.board';
readySelectors.dependencies='[role="listbox"]';
readySelectors.list='.markdown-list';
readySelectors.listmove='.list-handle[aria-pressed="true"]';
readySelectors.legend='.task-tree-host';
readySelectors.importerror='.workspace-message[role="alert"]:has-text("invalid due date")';
readySelectors.conflict='dialog.task-editor > .notice';
readySelectors.signin='.entry a[href$="/auth/login"]';
readySelectors.signinerror='.entry [role="alert"]:has-text("Sign-in was declined")';
const printOnly=process.argv.includes('--print-only');const failures=[];
const config={version:1,stabilize:{settleMs:0,scrollSettleMs:100,networkIdle:false,preScroll:false},diagnostics:{captureConsole:true,failOnPageError:true,failOnHttpError:true}};
if(printOnly)Object.assign(config,{viewports:{presets:['full-hd'],derived:false},screenshots:{enabled:false}});
await writeFile('artifacts/scanner-invalid.md','- ⬜H2 20260230 Invalid - Keep the Existing Data #invalid');
for(const [state,steps]of Object.entries(states)){
  if(printOnly&&state!=='bubbles')continue;
  const signedOut=state==='signin'||state==='signinerror';const target=new URL(url);
  if(state==='signinerror'){target.pathname=target.pathname.replace(/\/$/,'')+'/auth/callback';target.search='?error=access_denied';}
  await writeFile('artifacts/scanner-config.json',JSON.stringify({...config,navigation:{failOnErrorStatus:state!=='signinerror'},diagnostics:{...config.diagnostics,failOnHttpError:!signedOut&&state!=='importerror'}}));
  const workflow={version:1,name:state,defaults:{timeout:20000},steps:[{action:'waitForSelector',target:{css:signedOut?readySelectors[state]:'[aria-label="Bubble Delivery updated"]'},state:'visible'},...steps,{action:'waitForSelector',target:{css:readySelectors[state]},state:'visible'},{action:'ready'}]};
  await writeFile('artifacts/scanner-workflow.json',JSON.stringify(workflow));
  const name=`todo-scan-${process.pid}-${state}`;const out=path.resolve(`artifacts/${label}/scan-${state}`);await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
  let id;
  try{
    id=docker(['create','--name',name,'--network','host','--shm-size','1g','-e',`TARGET_URL=${target.href}`,...(signedOut?[]:['-e','STORAGE_STATE=/tmp/state.json']),'-e','WORKFLOW_FILE=/tmp/workflow.json','-e','CONFIG_FILE=/tmp/config.json','-e','ON_EXISTING=overwrite','mwaeckerlin/webdesign-scanner']);
    for(const [source,target]of [...(signedOut?[]:[['artifacts/visual-session.json','state.json']]),['artifacts/scanner-workflow.json','workflow.json'],['artifacts/scanner-config.json','config.json'],['artifacts/scanner-invalid.md','invalid.md']])docker(['cp',source,`${id}:/tmp/${target}`]);
    const run=spawnSync('docker',['start','-a',id],{encoding:'utf8',maxBuffer:32*1024*1024});
    await writeFile(path.join(out,'scanner.log'),(run.stdout??'')+(run.stderr??''));
    const info=JSON.parse(docker(['inspect',id]))[0];
    docker(['cp',`${id}:/out/.`,out],true);
    if(run.status!==0||info.State.ExitCode!==0)throw new Error(`Scanner ${state} failed: ${run.status}/${info.State.ExitCode}. See ${out}/scanner.log.`);
    if(state==='bubbles'){
      const pages=await readdir(path.join(out,'print','png'));
      for(const format of ['a3','a4','a5','letter'])for(const orientation of ['portrait','landscape']){
        const matches=pages.filter(name=>name.startsWith(`${format}-${orientation}-p`)&&name.endsWith('.png'));
        if(matches.length!==1)failures.push(`${format} ${orientation}: expected one complete bubble diagram page, received ${matches.length}`);
      }
    }
    console.log(`Scanner ${label}/${state}: captured`);
  }catch(error){failures.push(error.message);
  }finally{if(id)docker(['rm','-f',id],true);}
}
await writeFile(`artifacts/${label}/scanner-results.json`,JSON.stringify({failures,at:new Date().toISOString()},null,2));
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
