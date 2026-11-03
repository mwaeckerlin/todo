import { useEffect, useId, useRef, useState } from 'react';
import { Crepe } from '@milkdown/crepe';
import { Portal } from '@headlessui/react';
import { commandsCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { undoCommand,redoCommand } from '@milkdown/kit/plugin/history';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bold, Italic, Strikethrough, Code, Link, Table, CodeXml, List, ListOrdered, ListTodo, Quote, Minus, Undo2, Redo2, type LucideIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@milkdown/crepe/theme/common/style.css';
import { api } from './api';
import { History } from './History';
import { DateInput } from './DateInput';
import { TaskSelection } from './TaskSelection';
import { statuses, statusNames, userLabel, descendants, type Task, type User, type Revision, type Sprint } from './types';

const toolbarIcon=(Icon:LucideIcon,label:string)=>renderToStaticMarkup(<Icon role="img" aria-label={label} aria-hidden={false}><title>{label}</title></Icon>);
function MarkdownEditor({value,onChange,read}:{value:string;onChange:(text:string)=>void;read:React.MutableRefObject<(()=>string)|null>}){
  const root=useRef<HTMLDivElement>(null);const update=useRef(onChange);update.current=onChange;
  const [error,setError]=useState('');
  useEffect(()=>{if(!root.current)return;let active=true,ready=false,last=value,canonical=value;const crepe=new Crepe({root:root.current,defaultValue:value,features:{[Crepe.Feature.ImageBlock]:false,[Crepe.Feature.Latex]:false,[Crepe.Feature.BlockEdit]:false,[Crepe.Feature.Toolbar]:false,[Crepe.Feature.TopBar]:true},featureConfigs:{[Crepe.Feature.TopBar]:{
    headingOptions:[{label:'Paragraph',level:null},...[2,3,4,5,6].map(level=>({label:`Heading ${level}`,level}))],
    boldIcon:toolbarIcon(Bold,'Bold'),italicIcon:toolbarIcon(Italic,'Italic'),strikethroughIcon:toolbarIcon(Strikethrough,'Strikethrough'),codeIcon:toolbarIcon(Code,'Inline code'),linkIcon:toolbarIcon(Link,'Link'),tableIcon:toolbarIcon(Table,'Table'),codeBlockIcon:toolbarIcon(CodeXml,'Code block'),bulletListIcon:toolbarIcon(List,'Bullet list'),orderedListIcon:toolbarIcon(ListOrdered,'Numbered list'),taskListIcon:toolbarIcon(ListTodo,'Task list'),quoteIcon:toolbarIcon(Quote,'Quote'),hrIcon:toolbarIcon(Minus,'Horizontal rule'),
    buildTopBar:builder=>{builder.addGroup('history','History').addItem('undo',{icon:toolbarIcon(Undo2,'Undo'),active:()=>false,onRun:(ctx:Ctx)=>{ctx.get(commandsCtx).call(undoCommand.key);}}).addItem('redo',{icon:toolbarIcon(Redo2,'Redo'),active:()=>false,onRun:(ctx:Ctx)=>{ctx.get(commandsCtx).call(redoCommand.key);}});}
  }}});
    const current=()=>{if(!ready)return value;const markdown=crepe.getMarkdown();return markdown===canonical?value:markdown;};read.current=current;
    crepe.on(listener=>listener.markdownUpdated((_ctx,markdown)=>{if(active&&ready&&markdown!==last){last=markdown;update.current(markdown);}}));
    crepe.create().then(()=>{if(!active)return;canonical=crepe.getMarkdown();last=canonical;ready=true;}).catch(e=>{if(active)setError(`The formatted editor could not load: ${e.message}`);});
    return()=>{active=false;if(read.current===current)read.current=null;void crepe.destroy();};
  },[]);
  return <>{error&&<p role="alert">{error}</p>}<div ref={root} className="formatted-editor" aria-label="Formatted details" onKeyDown={event=>{const button=(event.target as Element).closest<HTMLButtonElement>('.milkdown-top-bar button');if(button&&(event.key==='Enter'||event.key===' ')){event.preventDefault();button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));}}}/></>;
}
interface Props { project:string; initial:Task; tasks:Task[]; users:User[]; sprints:Sprint[]; readonly:boolean; onClose:()=>void; onSaved:(task:Task)=>void; refresh:number; titleOnly?:boolean }
export function Editor({project,initial,tasks,users,sprints,readonly,onClose,onSaved,refresh,titleOnly}:Props){
  const referenceId=useId();const [referenceEditable,setReferenceEditable]=useState(false);
  const [draft,setDraft]=useState<Task>(initial);const [baseline,setBaseline]=useState(initial);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [mode,setMode]=useState('Formatted');const [history,setHistory]=useState(false);const [discard,setDiscard]=useState(false);const [editorKey,setEditorKey]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);const detailsReader=useRef<(()=>string)|null>(null);const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);const isNew=baseline.version===0;
  function snapshot(){return{...draft,details:detailsReader.current?.()??draft.details};}
  const current=tasks.find(t=>t.id===initial.id);const stale=!!current&&current.version!==baseline.version;
  useEffect(()=>{dialog.current?.showModal();if(titleOnly)dialog.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();const d=dialog.current;return()=>d?.close();},[]);
  useEffect(()=>{const prevent=(e:BeforeUnloadEvent)=>{if(JSON.stringify(snapshot())!==JSON.stringify(baseline)){e.preventDefault();}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);});
  function change<K extends keyof Task>(key:K,value:Task[K]){setDraft(previous=>({...previous,[key]:value}));}
  function close(){if(busy)return;const value=snapshot();setDraft(value);if(JSON.stringify(value)!==JSON.stringify(baseline))setDiscard(true);else onClose();}
  function accept(task:Task){setDraft(task);setBaseline(task);setEditorKey(k=>k+1);onSaved(task);}
  async function save(){setError('');setBusy(true);const value=snapshot();setDraft(value);try{const task=await api<Task>(`/api/projects/${project}/tasks${isNew?'':`/${draft.id}`}`,{task:value,expected_version:baseline.version});accept(task);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function restore(revision:Revision,fields:string[]){setBusy(true);try{const task=await api<Task>(`/api/projects/${project}/tasks/${draft.id}/revert`,{revision_id:revision.id,fields,expected_version:baseline.version});accept(task);setHistory(false);}finally{setBusy(false);}}
  const invalidParents=new Set((draft.id?descendants(tasks,draft.id):[]).map(t=>t.id));
  return <dialog ref={dialog} className="task-editor" onCancel={e=>{e.preventDefault();close();}}>
    <header><h2>{isNew?'New task':'Edit task'}</h2></header>
    {discard?<section><p>Discard unsaved changes to this task?</p><button type="button" onClick={()=>setDiscard(false)}>Keep editing</button><button type="button" onClick={onClose}>Discard changes</button></section>:<>
    {error&&<p role="alert">{error}</p>}
    {stale&&<aside className="notice"><p>The task changed elsewhere. Your draft is retained.</p><button type="button" disabled={busy} onClick={()=>{if(current){setDraft(current);setBaseline(current);setEditorKey(k=>k+1);setError('');}}}>Reload current version</button></aside>}
    <Portal.Group target={dialog}><form aria-busy={busy} onSubmit={e=>{e.preventDefault();void save();}}>
    <fieldset disabled={readonly||busy} className="task-fields" aria-label="Task properties">
      <label data-field="Title">Title<input autoFocus={titleOnly} name="title" value={draft.title} required onChange={e=>change('title',e.target.value)}/></label>
      <label data-field="Description">Description<textarea name="description" rows={2} value={draft.description} required onChange={e=>change('description',e.target.value)}/></label>
      <label data-field="Status">Status<select value={draft.status} onChange={e=>change('status',e.target.value)}>{statuses.map(s=><option key={s} value={s}>{statusNames[s]}</option>)}</select></label>
      <label data-field="Priority">Priority<select value={draft.priority} onChange={e=>change('priority',e.target.value)}><option value="">None</option><option value="H">High</option><option value="M">Medium</option><option value="L">Low</option></select></label>
      <label data-field="Complexity">Complexity<input type="number" min={0} max={9} value={draft.complexity} required onChange={e=>change('complexity',Number(e.target.value))}/></label>
      <DateInput value={draft.due_date} onChange={value=>change('due_date',value)}/>
      <label data-field="Parent">Parent<select value={draft.parent_id??''} onChange={e=>change('parent_id',e.target.value||null)}><option value="">Project root</option>{tasks.filter(t=>t.id===draft.parent_id||!invalidParents.has(t.id)&&!t.archived).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      <div className="identifier-field"><label data-field="Identifier" htmlFor={referenceId}>Identifier</label><input id={referenceId} value={draft.reference} placeholder="Generated when saved" readOnly={!referenceEditable} onChange={event=>change('reference',event.target.value)}/><button type="button" onClick={()=>setReferenceEditable(!referenceEditable)}>{referenceEditable?'Lock identifier':'Change identifier'}</button>{referenceEditable&&<small>Loading an older Markdown file with the previous identifier can create another task.</small>}</div>
      <TaskSelection label="Owners" value={draft.owners} options={users.map(user=>({id:user.id,title:userLabel(user,users)}))} disabled={readonly||busy} onChange={value=>change('owners',value)}/>
      <label data-field="Sprint">Sprint<select value={draft.sprint_id??''} onChange={e=>change('sprint_id',e.target.value||null)}><option value="">Backlog</option>{sprints.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
      <TaskSelection label="Dependencies" value={draft.depends_on} options={tasks.filter(task=>task.id!==draft.id).map(task=>({id:task.id,title:task.title}))} disabled={readonly||busy} onChange={value=>change('depends_on',value)}/>
      <label data-field="Next week" className="check"><input type="checkbox" checked={draft.next_week} onChange={e=>change('next_week',e.target.checked)}/>Next week</label>
      <label data-field="Archived" className="check"><input type="checkbox" checked={draft.archived} onChange={e=>change('archived',e.target.checked)}/>Archived</label>
    </fieldset>
    <section className="editor-content" inert={busy}><div role="tablist" aria-label="Details editor">
      {['Details','Task history'].map(tab=><button type="button" role="tab" key={tab} disabled={tab==='Task history'&&isNew} aria-selected={tab==='Task history'?history:!history} onClick={()=>{setDraft(snapshot());setHistory(tab==='Task history');}}>{tab}</button>)}
    </div>
    {!history&&<div className="editor-mode"><button type="button" aria-pressed={mode==='Markdown'} onClick={()=>{setDraft(snapshot());setMode(mode==='Markdown'?'Formatted':'Markdown');}}>Markdown source</button></div>}
    {history?<History project={project} task={draft} tasks={tasks} sprints={sprints} canEdit={!readonly&&!dirty} onRestore={restore} refresh={refresh}/>:mode==='Markdown'?<label className="source-editor">Details Markdown<textarea className="markdown-source" value={draft.details} readOnly={readonly} onChange={e=>change('details',e.target.value)}/></label>:readonly?<div className="markdown-preview" aria-label="Formatted details"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{draft.details}</ReactMarkdown></div>:<MarkdownEditor key={editorKey} value={draft.details} read={detailsReader} onChange={text=>change('details',text)}/>}
    </section>
    <footer><button type="submit" className="primary" disabled={readonly||busy}>{busy?'Saving':'Save task'}</button><button type="button" disabled={busy} onClick={close}>Cancel</button><span>{readonly?'Read-only access':dirty?'Unsaved changes':isNew?'New task':`Version ${draft.version}`}</span></footer>
    </form></Portal.Group></>}
  </dialog>;
}
