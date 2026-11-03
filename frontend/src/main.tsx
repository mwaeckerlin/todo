import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CircleDot, Columns3, ListTree, CalendarRange, History as HistoryIcon, Users, PanelLeftClose, PanelLeftOpen, Plus, Pencil, Trash2, Upload, FileJson, FileText, LogOut, type LucideIcon } from 'lucide-react';
import { api, setCsrf, download, clearSession, sessionFetch, appPath, ApiError } from './api';
import { Bubbles } from './Bubbles';
import { BoardCard } from './BoardCard';
import { Editor } from './Editor';
import { DateInput } from './DateInput';
import { History } from './History';
import { Sprints } from './Sprints';
import { TaskList } from './TaskList';
import { exportPicture } from './exports';
import { blank, descendants, dateString, userLabel, statuses, statusNames, type Project, type Task, type User, type Sprint } from './types';
import './style.css';

const viewIcons:Record<string,LucideIcon>={Bubbles:CircleDot,Board:Columns3,List:ListTree,Sprints:CalendarRange,History:HistoryIcon,Members:Users};
const authenticationError=document.querySelector<HTMLMetaElement>('meta[name="auth-error"]')?.content??'';
function App(){
  const [identity,setIdentity]=useState<User|null|undefined>(undefined);const [projects,setProjects]=useState<Project[]>([]);const [project,setProject]=useState(new URLSearchParams(location.search).get('project')??'');
  const [tasks,setTasks]=useState<Task[]>([]);const [users,setUsers]=useState<User[]>([]);const [tab,setTab]=useState('Bubbles');const [focus,setFocus]=useState<string|null>(null);const [editing,setEditing]=useState<{task:Task;titleOnly?:boolean}|null>(null);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [connected,setConnected]=useState(false);const [tick,setTick]=useState(0);const [search,setSearch]=useState('');const [owner,setOwner]=useState('');const [priority,setPriority]=useState('');const [status,setStatus]=useState('');const [due,setDue]=useState('');const [archived,setArchived]=useState(false);
  const [newProject,setNewProject]=useState(false);const [deleting,setDeleting]=useState(false);const [renaming,setRenaming]=useState(false);const [newName,setNewName]=useState('');const [context,setContext]=useState<{task:Task;x:number;y:number}|null>(null);const [scope,setScope]=useState('all');const [members,setMembers]=useState<Record<string,string>>({});const [membersProject,setMembersProject]=useState('');const [membersSequence,setMembersSequence]=useState(0);
  const [sprints,setSprints]=useState<Sprint[]>([]);const [sprintFilter,setSprintFilter]=useState('');const [sprintDays,setSprintDays]=useState(14);
  const [sidebarOpen,setSidebarOpen]=useState(()=>!matchMedia('(max-width:48rem)').matches);const [importBusy,setImportBusy]=useState(false);
  const [navigation,setNavigation]=useState(0);
  const [projectSequence,setProjectSequence]=useState(0);const [projectError,setProjectError]=useState('');const [projectBusy,setProjectBusy]=useState(false);
  const upload=useRef<HTMLInputElement>(null);const uploadTarget=useRef<Record<string,number>>({});
  const latest=useRef({project:'',sequence:0});const selectedProject=useRef(project);selectedProject.current=project;
  const menu=useRef<HTMLDivElement>(null);const projectDialog=useRef<HTMLDialogElement>(null);const active=projects.find(p=>p.id===project);const canEdit=!!active&&active.role!=='reader';
  const documentTitle=active?.name??'';
  useEffect(()=>{
    function ended(){flushSync(()=>{setIdentity(null);setProjects([]);setProject('');selectedProject.current='';latest.current={project:'',sequence:0};setTasks([]);setUsers([]);setSprints([]);setMembers({});setMembersProject('');setMembersSequence(0);setFocus(null);setEditing(null);setContext(null);setNewProject(false);setRenaming(false);setDeleting(false);setNewName('');setError('');setNotice('');setSearch('');setOwner('');setPriority('');setStatus('');setDue('');setSprintFilter('');setConnected(false);uploadTarget.current={};if(upload.current)upload.current.value='';});const url=new URL(location.href);url.searchParams.delete('project');history.replaceState({},'',url);}
    window.addEventListener('todo-session-ended',ended);
    return()=>window.removeEventListener('todo-session-ended',ended);
  },[]);
  useEffect(()=>{
    if(!identity)return;
    let disposed=false,socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,expiry:ReturnType<typeof setTimeout>|undefined;
    async function connect(){
      if(disposed||!navigator.onLine)return;
      try{const me=await api<{session_expires_at:number;server_time:number}>('/api/me');if(disposed)return;clearTimeout(expiry);expiry=setTimeout(()=>clearSession(),Math.max(0,me.session_expires_at-me.server_time));
        const url=new URL(appPath('/api/session/events'),location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';const current=new WebSocket(url);socket=current;
        current.onclose=event=>{if(disposed||socket!==current)return;socket=undefined;if(event.code===4001){clearSession();return;}retry=setTimeout(()=>void connect(),1000);};
      }catch{if(!disposed)retry=setTimeout(()=>void connect(),1000);}
    }
    function resume(){if(!socket){clearTimeout(retry);void connect();}}
    function check(){if(document.visibilityState==='visible')void api('/api/me').catch(()=>{});}
    function pageHidden(){clearSession(false);}
    function pageShown(event:PageTransitionEvent){if(event.persisted)location.reload();}
    window.addEventListener('online',resume);window.addEventListener('focus',check);window.addEventListener('pagehide',pageHidden);window.addEventListener('pageshow',pageShown);document.addEventListener('visibilitychange',check);void connect();
    return()=>{disposed=true;clearTimeout(retry);clearTimeout(expiry);socket?.close();window.removeEventListener('online',resume);window.removeEventListener('focus',check);window.removeEventListener('pagehide',pageHidden);window.removeEventListener('pageshow',pageShown);document.removeEventListener('visibilitychange',check);};
  },[identity]);
  const refresh=useCallback(async()=>{if(!project)return;const p=await api<Project&{tasks:Task[];sprints:Sprint[];members:Record<string,string>;preamble?:string}>(`/api/projects/${project}`).catch(async(error)=>{if(error instanceof ApiError&&error.status===404&&selectedProject.current===project){setTasks([]);setSprints([]);setMembers({});setEditing(null);setContext(null);setFocus(null);setProject('');setProjects(await api<Project[]>('/api/projects'));setError('This project was deleted. Select another project.');return null;}throw error;});if(!p)return;if(selectedProject.current!==project||(latest.current.project===project&&p.sequence<latest.current.sequence))return;latest.current={project,sequence:p.sequence};setTasks(p.tasks);setSprints(p.sprints);setMembers(p.members);setMembersProject(p.id);setMembersSequence(p.sequence);setProjects(old=>old.map(v=>v.id===p.id?p:v));setTick(t=>t+1);},[project]);
  useEffect(()=>{if(authenticationError){setIdentity(null);return;}api<{user:User;csrf_token:string;settings:{sprint_days:number}}>('/api/me').then(async me=>{setCsrf(me.csrf_token);setIdentity(me.user);setSprintDays(me.settings.sprint_days);const [ps,us]=await Promise.all([api<Project[]>('/api/projects'),api<User[]>('/api/users')]);setProjects(ps);setUsers(us);setProject(old=>ps.some(p=>p.id===old)?old:ps[0]?.id??'');}).catch(error=>{setIdentity(null);if(error instanceof ApiError&&error.status===403)setError(error.message);});},[]);
  useEffect(()=>{document.title=active?.name??'Tasks';},[active?.name]);
  useEffect(()=>{if(!project)return;const url=new URL(location.href);url.searchParams.set('project',project);history.replaceState({},'',url);setFocus(null);setTasks([]);setSprints([]);setMembersProject('');setSprintFilter('');setContext(null);setError('');setNotice('');void refresh().catch(e=>setError(e.message));},[project,refresh]);
  useEffect(()=>{
    if(!identity||!project)return;
    let closed=false,socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,refreshTimer:ReturnType<typeof setTimeout>|undefined,after=0;
    setConnected(false);
    function connect(){
      if(closed||!navigator.onLine||socket)return;
      clearTimeout(retry);
      const url=new URL(appPath(`/api/projects/${project}/events`),location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('after',String(after));
      const current=new WebSocket(url);socket=current;
      current.onopen=()=>{if(closed||socket!==current)return;setConnected(true);void refresh().catch(e=>setError(e.message));};
      current.onmessage=event=>{if(closed||socket!==current)return;const message=JSON.parse(event.data);after=Math.max(after,message.sequence);clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh().catch(e=>setError(e.message)),30);};
      current.onclose=()=>{if(socket!==current)return;socket=undefined;setConnected(false);if(!closed&&navigator.onLine)retry=setTimeout(connect,1000);};
    }
    function offline(){clearTimeout(retry);clearTimeout(refreshTimer);const current=socket;socket=undefined;setConnected(false);current?.close();}
    window.addEventListener('offline',offline);window.addEventListener('online',connect);connect();
    return()=>{closed=true;window.removeEventListener('offline',offline);window.removeEventListener('online',connect);clearTimeout(retry);clearTimeout(refreshTimer);const current=socket;socket=undefined;current?.close();};
  },[identity,project,refresh]);
  useEffect(()=>{if(!context||!menu.current)return;const r=menu.current.getBoundingClientRect();menu.current.style.setProperty('--menu-x',`${Math.max(0,context.x>innerWidth-r.width?context.x-r.width:context.x)}px`);menu.current.style.setProperty('--menu-y',`${Math.max(0,context.y>innerHeight-r.height?context.y-r.height:context.y)}px`);},[context,users]);
  useEffect(()=>{if(context)menu.current?.focus();},[context]);
  useEffect(()=>{if(newProject||renaming||deleting)projectDialog.current?.showModal();},[newProject,renaming,deleting]);
  useEffect(()=>{const small=matchMedia('(max-width:48rem)');const resize=()=>{if(small.matches)setSidebarOpen(false);};small.addEventListener('change',resize);return()=>small.removeEventListener('change',resize);},[]);
  useEffect(()=>{if(tab!=='Members'&&!editing&&!context)return;let alive=true;api<User[]>('/api/users').then(people=>{if(alive)setUsers(people);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[tab,editing?.task.id,context?.task.id]);
  async function perform(action:()=>Promise<void>){setError('');try{await action();}catch(e){setError((e as Error).message);}}
  async function update(task:Task,patch:Partial<Task>){await api(`/api/projects/${project}/tasks/${task.id}`,{task:{...task,...patch},expected_version:task.version});await refresh();}
  const moveTask=useCallback(async(task:Task,destination:{parent_id:string|null;before_id:string|null},sequence:number)=>{try{await api(`/api/projects/${project}/tasks/${task.id}/move`,{parent_id:destination.parent_id,before_id:destination.before_id,expected_sequence:sequence});await refresh();}catch(error){await refresh();throw error;}},[project,refresh]);
  function edit(task:Task,titleOnly=false){setEditing({task,titleOnly});}
  function setCurrentFocus(id:string|null){setFocus(id);setSearch('');setNavigation(value=>value+1);}
  const excluded=new Set(tasks.filter(t=>t.archived).flatMap(t=>descendants(tasks,t.id)).map(t=>t.id));
  const filtered=tasks.filter(t=>(!sprintFilter||(sprintFilter==='backlog'?!t.sprint_id:t.sprint_id===sprintFilter))&&(archived||!excluded.has(t.id))&&(!search||`${t.title} ${t.description} ${t.details} ${t.reference}`.toLowerCase().includes(search.toLowerCase()))&&(!owner||t.owners.includes(owner))&&(!priority||t.priority===priority)&&(!status||t.status===status)&&(!due||!!t.due_date&&(due==='any'||t.due_date<=dateString(new Date()))));
  const isLeaf=focus!==null&&!tasks.some(task=>task.parent_id===focus&&!task.archived);
  const visible=filtered.filter(t=>isLeaf?t.id===focus:t.parent_id===focus).sort((a,b)=>a.order-b.order);
  const shown=new Set(filtered.map(t=>t.id));for(let grow=true;grow;){grow=false;for(const t of tasks)if(shown.has(t.id)&&t.parent_id&&!shown.has(t.parent_id)){shown.add(t.parent_id);grow=true;}}
  const bubbleTasks=tasks.filter(t=>shown.has(t.id));
  const path:Task[]=[];let ancestor=focus?tasks.find(t=>t.id===focus):null;while(ancestor){path.unshift(ancestor);ancestor=tasks.find(t=>t.id===ancestor!.parent_id);}
  async function exportFile(format:string){if(['SVG','PNG','HTML'].includes(format)){await exportPicture(format,bubbleTasks,scope==='current'?focus:null,project);return;}const response=await sessionFetch(`/api/projects/${project}/export?format=${format==='MD'?'markdown':format.toLowerCase()}`,{signal:AbortSignal.timeout(25000)});if(!response.ok){const result=await response.json().catch(()=>({error:'The export could not be downloaded. Try again.'}));throw new Error(result.error);}download(await response.blob(),format==='JSON'?'tasks.json':'TODO.md',format==='JSON'?'application/json':'text/markdown');}
  function chooseFile(){uploadTarget.current=Object.fromEntries(projects.map(item=>[item.id,item.sequence]));upload.current?.click();}
  async function importFile(file:File){setImportBusy(true);setError('');setNotice('');try{
    const source=await file.text();const result=await api<{project:Project;created:boolean}>('/api/load',{source,expected_versions:uploadTarget.current});
    const ps=await api<Project[]>('/api/projects');setProjects(ps);
    if(result.project.id===project)await refresh();else{setEditing(null);setProject(result.project.id);}
    setNotice(result.created?'Project loaded':'Project changes loaded');
  }catch(error){setError((error as Error).message);try{setProjects(await api<Project[]>('/api/projects'));}catch{}}
  finally{setImportBusy(false);if(upload.current)upload.current.value='';}}
  async function deleteProject(){setProjectBusy(true);setProjectError('');try{
    await api(`/api/projects/${project}`,{expected_sequence:projectSequence},'DELETE');
    const ps=await api<Project[]>('/api/projects');setProjects(ps);setEditing(null);setContext(null);setFocus(null);setTasks([]);setSprints([]);setMembers({});setProject(ps[0]?.id??'');setDeleting(false);
  }catch(error){setProjectError((error as Error).message);}finally{setProjectBusy(false);}}
  async function saveProject(){setProjectBusy(true);setProjectError('');try{if(renaming){await api<Project>(`/api/projects/${project}`,{name:newName,expected_sequence:projectSequence});await refresh();}else{const created=await api<Project>('/api/projects',{name:newName});setProjects(old=>[...old,created]);setProject(created.id);}setNewProject(false);setRenaming(false);setNewName('');}catch(error){setProjectError((error as Error).message);}finally{setProjectBusy(false);}}
  if(identity===undefined)return <main className="entry"><h1>Tasks</h1><p role="status">Loading session…</p></main>;
  if(identity===null)return <main className="entry"><h1>Tasks</h1><p>Explore projects as nested bubbles or boards. Keep every saved version.</p>{(authenticationError||error)&&<p role="alert">{authenticationError||error}</p>}<a className="button primary" href={appPath('/auth/login')}>Sign in with Authentik</a><a className="button" href={appPath('/auth/provider-logout')}>Sign out of Authentik</a><a href={appPath('/api/docs')}>API reference</a></main>;
  return <div className="application" data-sidebar-open={sidebarOpen}>
    <aside className="project-sidebar" aria-label="Project sidebar" hidden={!sidebarOpen}>
      <div className="sidebar-heading"><h1><ListTree aria-hidden="true"/>Tasks</h1><button type="button" title="Collapse sidebar" onClick={()=>setSidebarOpen(false)} aria-label="Collapse sidebar"><PanelLeftClose aria-hidden="true"/></button></div>
      <div className="sidebar-content">
        <label className="project-picker">Project<select aria-label="Project" value={project} disabled={importBusy} onChange={e=>setProject(e.target.value)}>{!projects.length&&<option value="">No projects</option>}{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {identity.role==='admin'&&<div className="project-actions"><button type="button" aria-label="New project" disabled={importBusy} onClick={()=>{setNewName('');setProjectError('');setNewProject(true);}}><Plus aria-hidden="true"/>New</button><button type="button" aria-label="Rename project" disabled={!project||importBusy} onClick={()=>{setNewName(documentTitle||active?.name||'');setProjectSequence(active!.sequence);setProjectError('');setRenaming(true);}}><Pencil aria-hidden="true"/>Rename</button><button type="button" aria-label="Delete project" disabled={!project||importBusy} onClick={()=>{setProjectSequence(active!.sequence);setProjectError('');setDeleting(true);}}><Trash2 aria-hidden="true"/>Delete</button></div>}
        <nav aria-label="Project actions"><div role="tablist" aria-label="Project views">{['Bubbles','Board','List','Sprints','History','Members'].map(v=>{const Icon=viewIcons[v];return <button type="button" key={v} role="tab" aria-selected={tab===v} onClick={()=>{setTab(v);if(matchMedia('(max-width:48rem)').matches)setSidebarOpen(false);}} disabled={!project}><Icon aria-hidden="true"/>{v}</button>;})}</div></nav>
        <div className="file-actions"><button className="primary" type="button" disabled={!canEdit||importBusy} onClick={()=>edit(blank(focus,tasks.length))}><Plus aria-hidden="true"/>Add task</button><button type="button" disabled={identity.role==='reader'||importBusy} title="Load a project by its document title and merge changes" onClick={chooseFile}><Upload aria-hidden="true"/>Load</button>{['JSON','MD'].map(format=><button key={format} type="button" disabled={!project||importBusy} onClick={()=>void perform(()=>exportFile(format))}>{format==='JSON'?<FileJson aria-hidden="true"/>:<FileText aria-hidden="true"/>}Save {format}</button>)}</div>
        <input ref={upload} type="file" hidden aria-label="Choose task file" accept=".md,.markdown,.json,text/markdown,application/json" onChange={event=>{const file=event.target.files?.[0];if(file)void importFile(file);}}/>
        {importBusy&&<p role="status">Loading project…</p>}
        {['Bubbles','Board','List'].includes(tab)&&<form className="filters" onSubmit={e=>e.preventDefault()}><label>Search tasks<input value={search} onChange={e=>setSearch(e.target.value)} type="search"/></label><details><summary>Filters</summary><div className="filter-fields"><label>Owner<select value={owner} onChange={e=>setOwner(e.target.value)}><option value="">All owners</option>{users.map(u=><option key={u.id} value={u.id}>{userLabel(u,users)}</option>)}</select></label><label>Status filter<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map(s=><option key={s} value={s}>{statusNames[s]}</option>)}</select></label><label>Priority filter<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="">All priorities</option>{['H','M','L'].map(p=><option key={p}>{p}</option>)}</select></label><label>Due filter<select value={due} onChange={e=>setDue(e.target.value)}><option value="">All dates</option><option value="any">Has due date</option><option value="overdue">Due or overdue</option></select></label><label>Sprint filter<select value={sprintFilter} onChange={e=>setSprintFilter(e.target.value)}><option value="">All sprints</option><option value="backlog">Backlog</option>{sprints.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label className="check"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>Include archived</label></div></details></form>}
        <details className="image-actions"><summary>Images</summary><label>Export scope<select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">Whole project</option><option value="current">Current subtree</option></select></label>{['SVG','PNG','HTML'].map(format=><button key={format} type="button" disabled={!project} onClick={()=>void perform(()=>exportFile(format))}>Save {format}</button>)}</details>
      </div>
      <footer className="sidebar-footer"><span className="connection" data-connected={connected}>{project?(connected?'Live':'Reconnecting'):'Ready'}</span><span className="account-name">{userLabel(identity,users)}</span><button type="button" aria-label="Sign out" title="Sign out" onClick={()=>void perform(async()=>{await api('/auth/logout',{});setIdentity(null);})}><LogOut aria-hidden="true"/></button><a href={appPath('/api/docs')}>API reference</a><small>{active?`${active.role} access · ${tasks.length} tasks`:''}</small></footer>
    </aside>
    <main className="workspace">
      <header className="workspace-heading">{!sidebarOpen&&<button type="button" title="Expand sidebar" onClick={()=>setSidebarOpen(true)} aria-label="Expand sidebar"><PanelLeftOpen aria-hidden="true"/></button>}<nav className="breadcrumbs" aria-label="Task path" data-reference={tasks.find(task=>task.id===focus)?.reference??''}>
        <div className="breadcrumb-buttons"><button type="button" onClick={()=>setCurrentFocus(null)}>{documentTitle||'Tasks'}</button>{path.map(task=><button type="button" key={task.id} onClick={()=>setCurrentFocus(task.id)} onDoubleClick={()=>edit(task)} onContextMenu={event=>{event.preventDefault();setContext({task,x:event.clientX,y:event.clientY});}}>{task.title}</button>)}</div>
        <div className="mobile-hierarchy"><button type="button" aria-label="Parent level" disabled={!focus} onClick={()=>setCurrentFocus(tasks.find(task=>task.id===focus)?.parent_id??null)}>Up</button><select aria-label="Task level" value={focus??''} onChange={event=>setCurrentFocus(event.target.value||null)}><option value="">{documentTitle||'Tasks'}</option>{path.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></div>
      </nav></header>
      {error&&<p className="workspace-message" role="alert">{error}<button type="button" onClick={()=>setError('')}>Dismiss</button></p>}{notice&&<p className="workspace-message" role="status">{notice}<button type="button" onClick={()=>setNotice('')}>Dismiss</button></p>}
      <div className="work-area">
      {project&&<>
      <div className="view-pane" hidden={tab!=='Bubbles'||!bubbleTasks.length}><Bubbles key={project} project={project} tasks={bubbleTasks} focus={focus} navigation={navigation} printFocus={scope==='current'?focus:null} onFocus={setCurrentFocus} onEdit={edit} onContext={(task,x,y)=>setContext({task,x,y})}/></div>
      {tab==='Bubbles'&&!bubbleTasks.length&&<section className="empty"><h2>Build your task tree</h2><p>Add a task or load a TODO.md file.</p></section>}
      {tab==='Board'&&<section className="board" aria-label="Status board">{statuses.map(s=><section key={s} data-testid={`column-${s}`} data-status={s} className="board-column" data-empty={!visible.some(task=>task.status===s)} onDragOver={e=>{if(canEdit)e.preventDefault();}} onDrop={e=>{e.preventDefault();const t=tasks.find(t=>t.id===e.dataTransfer.getData('text/plain'));if(t&&canEdit)void perform(()=>update(t,{status:s}));}}><h2>{statusNames[s]} <small>{visible.filter(t=>t.status===s).length}</small></h2>{visible.filter(t=>t.status===s).map(t=><BoardCard key={t.id} task={t} children={tasks.filter(child=>child.parent_id===t.id&&(archived||!child.archived)).sort((a,b)=>a.order-b.order)} tasks={tasks} users={users} canEdit={canEdit} onEdit={edit} onOpen={setCurrentFocus} onContext={(task,x,y)=>setContext({task,x,y})}/>)}</section>)}</section>}
      {tab==='Sprints'&&<Sprints key={project} project={project} sprints={sprints} tasks={tasks} sequence={active?.sequence??0} days={sprintDays} canEdit={canEdit} onSaved={refresh}/>}
      <div hidden={tab!=='List'}><TaskList key={project} tasks={bubbleTasks} users={users} selected={focus} sequence={active?.sequence??0} canEdit={canEdit} onMove={moveTask} onFocus={setCurrentFocus} onEdit={edit} onContext={(task,x,y)=>setContext({task,x,y})}/></div>
      {tab==='History'&&<History key={project} project={project} tasks={tasks} sprints={sprints} canEdit={canEdit} refresh={tick}/>}
      {tab==='Members'&&<section className="members"><h2>Project access</h2><p>Users appear after their first Authentik sign-in. Assigning a task grants no project access. Global administrators can access every project.</p>{membersProject!==project?<p role="status">Loading project access…</p>:users.map(u=><label key={u.id}>{userLabel(u,users)}<select value={members[u.id]?'member':'remove'} disabled={active?.role!=='admin'} onChange={e=>{const role=e.target.value;void perform(async()=>{await api(`/api/projects/${project}/members`,{user_id:u.id,role,expected_sequence:membersSequence});await refresh();});}}><option value="remove">No access</option><option value="member">Member ({u.role})</option></select></label>)}</section>}
      </>}
      {!project&&<section className="empty"><h2>Create a project</h2><p>A project contains one task tree, its members and its complete history.</p></section>}
      </div>
    </main>
    {context&&<div className="context-menu" ref={menu} role="menu" tabIndex={-1} aria-label={`Actions for ${context.task.title}`} onKeyDown={e=>{if(e.key==='Escape')setContext(null);}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setContext(null);}}>
      <strong>{context.task.title}</strong><button type="button" role="menuitem" onClick={()=>{edit(context.task);setContext(null);}}>Edit task</button>
      <fieldset disabled={!canEdit}><legend>Quick changes</legend><button type="button" role="menuitem" onClick={()=>{const t=context.task;const owners=t.owners.includes(identity.id)?t.owners.filter(id=>id!==identity.id):[...t.owners,identity.id];setContext(null);void perform(()=>update(t,{owners}));}}>{context.task.owners.includes(identity.id)?'Remove me':'Assign to me'}</button>
      {users.filter(u=>u.id!==identity.id).map(u=><label key={u.id} className="check"><input type="checkbox" checked={context.task.owners.includes(u.id)} onChange={e=>{const t=context.task;const owners=e.target.checked?[...t.owners,u.id]:t.owners.filter(id=>id!==u.id);setContext(null);void perform(()=>update(t,{owners}));}}/>{userLabel(u,users)}</label>)}
      <label>Status<select value={context.task.status} onChange={e=>{const t=context.task;setContext(null);void perform(()=>update(t,{status:e.target.value}));}}>{statuses.map(s=><option key={s} value={s}>{statusNames[s]}</option>)}</select></label>
      <label>Priority<select value={context.task.priority} onChange={e=>{const t=context.task;setContext(null);void perform(()=>update(t,{priority:e.target.value}));}}><option value="">None</option>{['H','M','L'].map(p=><option key={p}>{p}</option>)}</select></label>
      <DateInput menu value={context.task.due_date} onChange={value=>{const t=context.task;setContext(null);void perform(()=>update(t,{due_date:value}));}}/></fieldset><button type="button" onClick={()=>setContext(null)}>Close menu</button>
    </div>}
    {editing&&<Editor key={editing.task.id||'new'} project={project} initial={editing.task} tasks={tasks} users={users} sprints={sprints} readonly={!canEdit} titleOnly={editing.titleOnly} refresh={tick} onClose={()=>setEditing(null)} onSaved={task=>{setTasks(old=>old.some(t=>t.id===task.id)?old.map(t=>t.id===task.id?task:t):[...old,task]);void refresh();}}/>}
    {deleting&&<dialog ref={projectDialog} className="project-dialog" onCancel={event=>{if(projectBusy)event.preventDefault();else setDeleting(false);}}><form aria-busy={projectBusy} onSubmit={event=>{event.preventDefault();void deleteProject();}}><h2>Delete project</h2><p>Delete {documentTitle} and all its tasks, sprints and saved history?</p>{projectError&&<p role="alert">{projectError}<button type="button" disabled={projectBusy} onClick={()=>void api<Project>(`/api/projects/${project}`).then(current=>{setProjectSequence(current.sequence);setProjectError('');}).catch(error=>setProjectError(error.message))}>Reload project</button></p>}<footer><button className="primary" disabled={projectBusy}>Delete project</button><button type="button" disabled={projectBusy} onClick={()=>setDeleting(false)}>Cancel</button></footer></form></dialog>}
    {(newProject||renaming)&&<dialog ref={projectDialog} className="project-dialog" onCancel={event=>{if(projectBusy)event.preventDefault();else{setNewProject(false);setRenaming(false);}}}><form aria-busy={projectBusy} onSubmit={event=>{event.preventDefault();void saveProject();}}><h2>{renaming?'Rename project':'New project'}</h2>{projectError&&<p role="alert">{projectError}{renaming&&<button type="button" disabled={projectBusy} onClick={()=>{void api<Project>(`/api/projects/${project}`).then(current=>{setNewName(current.name);setProjectSequence(current.sequence);setProjectError('');}).catch(error=>setProjectError(error.message));}}>Reload project title</button>}</p>}<label>Project name<input required disabled={projectBusy} value={newName} onChange={event=>setNewName(event.target.value)}/></label><footer><button className="primary" disabled={projectBusy}>{renaming?'Save project':'Create project'}</button><button type="button" disabled={projectBusy} onClick={()=>{setNewProject(false);setRenaming(false);}}>Cancel</button></footer></form></dialog>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
