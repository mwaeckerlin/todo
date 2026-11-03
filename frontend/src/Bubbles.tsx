import { useEffect, useRef, useState } from 'react';
import { dateString, descendants, type Task } from './types';
import { sessionFetch, appPath } from './api';
import { applicationTreeStyles, connectOriginalTree, type TaskTreeElement, type TreeEvent, type TreeConnection } from './original-task-tree';
interface Props { project:string; tasks:Task[]; focus:string|null; navigation?:number; printFocus?:string|null; onFocus:(id:string|null)=>void; onEdit:(task:Task,titleOnly?:boolean)=>void; onContext:(task:Task,x:number,y:number)=>void; exportMode?:boolean }
export function diagramURL(project:string,tasks:Task[],format:string){
  const today=new Date();const start=new Date(today);start.setHours(0,0,0,0);start.setDate(start.getDate()-(start.getDay()+6)%7);const end=new Date(start);end.setDate(end.getDate()+7);
  const query=new URLSearchParams({format,tasks:tasks.map(task=>task.id).join(','),today:dateString(today),week_start:start.toISOString(),week_end:end.toISOString(),version:tasks.map(task=>task.version).join('.')});
  return appPath(`/api/projects/${project}/diagram?${query}`);
}
export function Bubbles(props:Props){
  const element=useRef<TaskTreeElement>(null);const connection=useRef<TreeConnection|null>(null);const current=useRef(props);current.current=props;
  const [renderError,setRenderError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const url=diagramURL(props.project,props.tasks,'interactive');
  const printed=descendants(props.tasks,props.printFocus??null);
  function focus(){const p=current.current;if(!p.tasks.length)return;connection.current?.sync({reference:p.tasks.find(task=>task.id===p.focus)?.reference??'',navigation:p.navigation??0,url:diagramURL(p.project,p.tasks,'interactive'),identities:p.tasks.map(task=>({id:task.id,reference:`#${task.reference}`}))});}
  function message(data:TreeEvent){
      const p=current.current;
      const task=p.tasks.find(task=>task.id===data.taskId)??p.tasks.find(task=>`#${task.reference}`===data.reference);
      if(data.action==='ready')focus();
      else if(data.action==='updated')setRenderError('');
      else if(data.action==='error')setRenderError(data.message??'The task drawing could not load. Retry the drawing.');
      else if(data.action==='focus')p.onFocus(task?.id??null);
      else if(data.action==='up')p.onFocus(p.tasks.find(task=>task.id===p.focus)?.parent_id??null);
      else if(data.action==='edit'&&task)p.onEdit(task,!!data.titleOnly);
      else if(data.action==='context'&&task)p.onContext(task,data.x??0,data.y??0);
  }
  useEffect(()=>{
    if(connection.current){focus();return;}
    if(!props.tasks.length)return;
    const abort=new AbortController();let disposed=false;
    void (async()=>{
      try{
        const response=await sessionFetch(url,{signal:abort.signal});
        if(!response.ok)throw new Error('The task drawing could not load. Retry the drawing.');
        const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
        const data=parsed.getElementById('task-tree-data');if(!data)throw new Error('The task drawing contains no task data. Retry the drawing.');
        if(disposed||!element.current)return;
        const host=element.current;host.setDocument(JSON.parse(data.textContent??''));
        const style=document.createElement('style');style.textContent=applicationTreeStyles;host.shadowRoot!.append(style);
        connection.current=connectOriginalTree(host,{url,emit:event=>{if(host.isConnected)message(event);}});focus();setRenderError('');
      }catch(error){if(!disposed)setRenderError((error as Error).message);}
    })();
    return()=>{disposed=true;abort.abort();};
  },[url,attempt]);
  useEffect(focus,[props.focus,props.navigation]);
  useEffect(()=>()=>{
    connection.current?.dispose();connection.current=null;element.current?.dispose();
  },[]);
  return <section className="bubble-view" aria-label="Bubble view">
    {<task-tree-view ref={element} className="task-tree-host" aria-label="Task tree"/>}
    {renderError&&<p className="drawing-error" role="alert">{renderError}<button type="button" onClick={()=>{if(connection.current)focus();else setAttempt(value=>value+1);}}>Retry drawing</button></p>}
    {printed.length?<img className="print-diagram" src={diagramURL(props.project,printed,'svg')} alt="Task tree and legend"/>:<p className="print-notice">No tasks in the selected export scope.</p>}
  </section>;
}
