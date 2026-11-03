import { useEffect, useRef } from 'react';
import { userLabel, type Task, type User } from './types';

// Delay the first pointer click until the browser can deliver a double-click.
const CARD_CLICK_DELAY = 500;

export function BoardCard({task,children,tasks,users,canEdit,onEdit,onOpen,onContext}:{task:Task;children:Task[];tasks:Task[];users:User[];canEdit:boolean;onEdit:(task:Task)=>void;onOpen:(id:string)=>void;onContext:(task:Task,x:number,y:number)=>void}){
  const pending=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const dragging=useRef(false);
  const latest=useRef({task,onEdit});latest.current={task,onEdit};
  function cancelClick(){clearTimeout(pending.current);pending.current=undefined;}
  useEffect(()=>cancelClick,[]);
  function edit(){cancelClick();latest.current.onEdit(latest.current.task);}
  function open(){cancelClick();if(children.length)onOpen(task.id);else edit();}
  return <article data-testid="task-card" draggable={canEdit} onDragStart={event=>{cancelClick();dragging.current=true;event.dataTransfer.setData('text/plain',task.id);}} onDragEnd={()=>{dragging.current=false;}} className="task-card" data-priority={task.priority}
    onContextMenu={event=>{event.preventDefault();cancelClick();onContext(task,event.clientX,event.clientY);}}
    onClick={event=>{if(dragging.current)return;if(event.detail===0){edit();return;}cancelClick();if(event.detail===1)pending.current=setTimeout(edit,CARD_CLICK_DELAY);}}
    onDoubleClick={event=>{event.preventDefault();open();}}>
    <button type="button" className="card-title">{task.title}</button>
    {task.description&&<p>{task.description}</p>}
    <dl><dt>Priority</dt><dd>{task.priority||'None'}</dd><dt>Complexity</dt><dd>{task.complexity}</dd>{task.due_date&&<><dt>Due</dt><dd><time>{task.due_date}</time></dd></>}</dl>
    {task.depends_on.length>0&&<p>Dependencies: {task.depends_on.map(id=>tasks.find(item=>item.id===id)?.title??id).join(', ')}{task.depends_on.some(id=>tasks.find(item=>item.id===id)?.status!=='done')?' · Blocked':''}</p>}
    {task.owners.length>0&&<p className="owners">{task.owners.map(id=>{const user=users.find(item=>item.id===id);return user?userLabel(user,users):id;}).join(', ')}</p>}
    {children.length>0&&<div className="card-children" role="link" tabIndex={0} aria-label={`Open children of ${task.title}`} onClick={event=>{event.stopPropagation();open();}} onDoubleClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();open();}}}><ul>{children.map(child=><li key={child.id}>{child.title}</li>)}</ul></div>}
  </article>;
}
