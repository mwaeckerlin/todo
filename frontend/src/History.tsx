import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { taskFields, statusNames, userLabel, type Revision, type Task, type User, type Sprint } from './types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
interface Props { project:string; task?:Task; tasks:Task[];sprints:Sprint[];canEdit:boolean; refresh:number; onRestore?:(revision:Revision,fields:string[])=>Promise<void> }
export function History({project,task,tasks,sprints,canEdit,refresh,onRestore}:Props){
  const [items,setItems]=useState<Revision[]>([]);const [chosen,setChosen]=useState<Revision|null>(null);const [fields,setFields]=useState<string[]>([]);const [error,setError]=useState('');const [more,setMore]=useState(false);
  const [pending,setPending]=useState<Revision[]|null>(null);const currentItems=useRef(items);currentItems.current=items;
  const [people,setPeople]=useState<User[]>([]);useEffect(()=>{api<User[]>('/api/users').then(setPeople).catch(e=>setError(e.message));},[]);
  const actionName=(action:string)=>action.startsWith('history_imported:')?'Imported history':({task_created:'Task created',task_saved:'Task saved',task_moved:'Task moved',task_restored:'Task restored',task_imported:'Task imported',task_json_imported:'Task imported from JSON',project_created:'Project created',project_renamed:'Project renamed',project_json_imported:'Project imported from JSON',members_changed:'Project access changed',sprint_saved:'Sprint saved'}[action]??action);
  function display(field:string,value:unknown):string{if(value===null||value===undefined||value==='')return 'None';if(field==='owners'&&Array.isArray(value))return value.map(id=>((user)=>user?userLabel(user,people):String(id))(people.find(u=>u.id===id))).join(', ')||'None';if(field==='depends_on'&&Array.isArray(value))return value.map(id=>tasks.find(t=>t.id===id)?.title??String(id)).join(', ')||'None';if(field==='parent_id')return tasks.find(t=>t.id===value)?.title??String(value);if(field==='sprint_id')return sprints.find(s=>s.id===value)?.title??String(value);if(field==='status')return statusNames[String(value)]??String(value);return typeof value==='string'?value:JSON.stringify(value);}
  const endpoint=`/api/projects/${project}/history${task?`?task_id=${encodeURIComponent(task.id)}`:''}`;
  useEffect(()=>{let alive=true;api<Revision[]>(endpoint).then(v=>{if(alive){if(currentItems.current.length){if(v[0]?.id!==currentItems.current[0]?.id)setPending(v);}else{setItems(v);setMore(v.length===100);setChosen(current=>current??v[0]??null);}}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[endpoint,refresh]);
  async function loadMore(){try{const v=await api<Revision[]>(`${endpoint}${task?'&':'?'}before=${items.at(-1)!.sequence}`);setItems([...items,...v]);setMore(v.length===100);}catch(e){setError(String(e));}}
  const old=chosen?.after;
  return <section className="history" aria-label={task?'Task edit history':'Project history'}>
    {error&&<p role="alert">{error}</p>}
    {pending&&<aside className="history-pending"><button type="button" onClick={()=>{setItems(pending);setMore(pending.length===100);setChosen(pending[0]??null);setFields([]);setPending(null);}}>Show new revisions</button></aside>}
    <ol className="history-list">{items.map(revision=><li key={revision.id}><button type="button" onClick={()=>{setChosen(revision);setFields([]);}} aria-pressed={chosen?.id===revision.id}>
      <time dateTime={revision.at}>{new Date(revision.at).toLocaleString()}</time><strong>{revision.after?.title??revision.before?.title??revision.after?.name??revision.before?.name??'Project'}</strong><span>{userLabel(revision.actor,people)}</span><span>{actionName(revision.action)}</span><span>{revision.fields.map(f=>f.replaceAll('_',' ')).join(', ')||'Saved without field changes'}</span>
    </button></li>)}</ol>
    {!items.length&&<p>No saved revisions.</p>}{more&&<button type="button" onClick={loadMore}>Load older revisions</button>}
    {chosen&&<section className="revision" aria-label="Historical revision"><h3>Revision {chosen.sequence}</h3>
      <p>{userLabel(chosen.actor,people)} · {new Date(chosen.at).toLocaleString()}</p>
      {chosen.imported_by&&<p>Imported by {userLabel(chosen.imported_by,people)}. Source revision: {chosen.source_revision_id}</p>}
      {old&&'description'in old?<>
        <label>Historical title<input readOnly value={old.title}/></label>
        <label>Historical description<textarea readOnly value={old.description}/></label>
        <label>Historical details<textarea readOnly value={old.details}/></label>
        <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{old.details}</ReactMarkdown></div>
        <dl className="property-changes">{chosen.fields.filter(f=>!['title','description','details'].includes(f)).map(f=><div key={f}><dt>{f.replaceAll('_',' ')}</dt><dd>{display(f,chosen.before?.[f as keyof Task])} → {display(f,chosen.after?.[f as keyof Task])}</dd></div>)}</dl>
        <details><summary>Before and after</summary><pre>{JSON.stringify({before:chosen.before,after:chosen.after},null,2)}</pre></details>
        {task&&canEdit&&onRestore&&<><fieldset><legend>Fields to restore</legend>{taskFields.map(field=><label className="check" key={field}><input type="checkbox" aria-label={`Restore ${field}`} checked={fields.includes(field)} onChange={e=>setFields(e.target.checked?[...fields,field]:fields.filter(f=>f!==field))}/>{field.replaceAll('_',' ')}</label>)}</fieldset>
          <button type="button" className="primary" disabled={!fields.length} onClick={async()=>{try{await onRestore(chosen,fields);setChosen(null);setFields([]);}catch(e){setError(String(e));}}}>Restore selected fields</button>
          <button type="button" onClick={()=>setFields(taskFields)}>Select whole task</button></>}
      </>:<pre>{JSON.stringify(chosen.after,null,2)}</pre>}
    </section>}
  </section>;
}
