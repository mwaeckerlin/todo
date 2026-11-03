import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { descendants, statuses, type Task, type User } from './types';

type Destination={parent_id:string|null;before_id:string|null;target:string|null;position:'before'|'after'|'inside'|'root'};
type Gesture={task:Task;tasks:Task[];sequence:number;destination:Destination;pointer:number|null;x:number;y:number;started:boolean;valid:boolean};
interface Props {tasks:Task[];users:User[];selected:string|null;sequence:number;canEdit:boolean;onMove:(task:Task,destination:Destination,sequence:number)=>Promise<void>;onEdit:(task:Task,titleOnly?:boolean)=>void;onFocus:(id:string|null)=>void;onContext:(task:Task,x:number,y:number)=>void}
const icons=['⬜','📄','⏳','🔀','✅','⏸','❌'];
export function TaskList({tasks,users,selected,sequence,canEdit,onMove,onEdit,onFocus,onContext}:Props){
  const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
  const [active,setActive]=useState<Gesture|null>(null);const gesture=useRef<Gesture|null>(null);const root=useRef<HTMLElement>(null);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const click=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const focused=useRef<{element:HTMLButtonElement;task:string;handle:boolean}|null>(null);
  useLayoutEffect(()=>{const previous=focused.current;if(previous&&!previous.element.isConnected&&document.activeElement===document.body){root.current?.querySelector<HTMLButtonElement>(`[data-task-id="${CSS.escape(previous.task)}"] > .list-row .${previous.handle?'list-handle':'list-title'}`)?.focus({preventScroll:true});}},[tasks]);
  const available=tasks;
  function siblings(items:Task[],parent:string|null,id?:string){return items.filter(task=>task.parent_id===parent&&task.id!==id).sort((a,b)=>a.order-b.order);}
  function publish(value:Gesture|null){gesture.current=value;setActive(value?{...value}:null);}
  function initial(task:Task,pointer:number|null,x=0,y=0):Gesture{
    const peers=siblings(available,task.parent_id);const next=peers[peers.findIndex(peer=>peer.id===task.id)+1];
    return {task,tasks:available,sequence,destination:{parent_id:task.parent_id,before_id:next?.id??null,target:task.id,position:'before'},pointer,x,y,started:pointer===null,valid:true};
  }
  function destinationAt(x:number,y:number){
    const current=gesture.current;if(!current)return;
    const element=document.elementFromPoint(x,y);const row=element?.closest<HTMLElement>('[data-task-row]');
    current.valid=false;
    if(!row){if(element?.closest('[data-root-drop]'))current.destination={parent_id:null,before_id:null,target:null,position:'root'};else {publish(current);return;}}
    else {
      const task=current.tasks.find(task=>task.id===row.dataset.taskRow);if(!task||task.archived||descendants(current.tasks,current.task.id).some(child=>child.id===task.id)){publish(current);return;}
      const box=row.getBoundingClientRect();const fraction=(y-box.top)/box.height;
      if(fraction>=.25&&fraction<=.75)current.destination={parent_id:task.id,before_id:null,target:task.id,position:'inside'};
      else {const peers=siblings(current.tasks,task.parent_id,current.task.id);const after=peers[peers.findIndex(peer=>peer.id===task.id)+1];current.destination={parent_id:task.parent_id,before_id:fraction<.25?task.id:after?.id??null,target:task.id,position:fraction<.25?'before':'after'};}
    }
    current.valid=true;publish(current);
  }
  async function finish(){const current=gesture.current;publish(null);if(!current?.started)return;if(!current.valid){setMessage('Move cancelled. Choose a destination outside the moved branch.');return;}setBusy(true);try{await onMove(current.task,current.destination,current.sequence);setMessage(`Moved ${current.task.title}`);}catch(error){setMessage((error as Error).message);}finally{setBusy(false);requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>(`[data-task-id="${CSS.escape(current.task.id)}"] > .list-row > .list-handle`)?.focus({preventScroll:true}));}}
  useEffect(()=>{
    function move(event:globalThis.PointerEvent){const current=gesture.current;if(!current||current.pointer!==event.pointerId)return;if(!current.started&&Math.hypot(event.clientX-current.x,event.clientY-current.y)<5)return;event.preventDefault();current.started=true;current.x=event.clientX;current.y=event.clientY;destinationAt(current.x,current.y);}
    function up(event:globalThis.PointerEvent){if(gesture.current?.pointer===event.pointerId)void finish();}
    function cancel(){publish(null);}
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);clearTimeout(click.current);};
  },[onMove]);
  useEffect(()=>{
    if(active?.pointer===null||!active?.started)return;
    let frame:number;
    function scroll(){const current=gesture.current;const area=root.current?.closest('.work-area');if(current&&area){const box=area.getBoundingClientRect();const edge=40;const delta=current.y<box.top+edge?-10:current.y>box.bottom-edge?10:0;if(delta){area.scrollBy(0,delta);destinationAt(current.x,current.y);}}frame=requestAnimationFrame(scroll);}
    frame=requestAnimationFrame(scroll);return()=>cancelAnimationFrame(frame);
  },[active?.started,active?.pointer]);
  function pointerDown(event:PointerEvent<HTMLButtonElement>,task:Task){if(event.button!==0||busy||!canEdit||task.archived)return;event.preventDefault();event.currentTarget.focus();if(event.isTrusted)event.currentTarget.setPointerCapture(event.pointerId);publish(initial(task,event.pointerId,event.clientX,event.clientY));}
  function keyDown(event:KeyboardEvent<HTMLButtonElement>,task:Task){
    if(!canEdit||busy||task.archived)return;
    if(event.key==='Escape'){event.preventDefault();publish(null);setMessage('Move cancelled');return;}
    if(!gesture.current){if(event.key===' '){event.preventDefault();publish(initial(task,null));setMessage(`Moving ${task.title}. Use arrows, Enter to save, Escape to cancel.`);}return;}
    const current=gesture.current;if(current.task.id!==task.id)return;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();void finish();return;}
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();
    const d=current.destination;const peers=siblings(current.tasks,d.parent_id,task.id);const at=d.before_id?peers.findIndex(peer=>peer.id===d.before_id):peers.length;
    if(event.key==='ArrowUp'&&at>0)current.destination={...d,before_id:peers[at-1].id,target:peers[at-1].id,position:'before'};
    if(event.key==='ArrowDown'&&at<peers.length)current.destination={...d,before_id:peers[at+1]?.id??null,target:peers[at].id,position:'after'};
    if(event.key==='ArrowRight'&&at>0)current.destination={parent_id:peers[at-1].id,before_id:null,target:peers[at-1].id,position:'inside'};
    if(event.key==='ArrowLeft'&&d.parent_id){const parent=current.tasks.find(item=>item.id===d.parent_id)!;const above=siblings(current.tasks,parent.parent_id,task.id);current.destination={parent_id:parent.parent_id,before_id:above[above.findIndex(item=>item.id===parent.id)+1]?.id??null,target:parent.id,position:'after'};}
    publish(current);
  }
  function titleClick(task:Task){clearTimeout(click.current);click.current=setTimeout(()=>onFocus(task.id),300);}
  function branch(parent:string|null):ReactNode{
    return <ul>{siblings(available,parent).map(task=>{
      const owners=task.owners.map(id=>users.find(user=>user.id===id)?.username??id);
      const children=siblings(available,task.id);const expanded=!collapsed.has(task.id);
      return <li key={task.id} data-task-id={task.id} data-reference={task.reference} data-parent={task.parent_id??''}>
        <div className="list-row" data-task-row={task.id} data-selected={task.id===selected} data-drop={active?.valid&&active.destination.target===task.id?active.destination.position:undefined} data-moving={active?.task.id===task.id} title={`${task.description}${task.due_date?' · '+task.due_date:''}`} onContextMenu={event=>{event.preventDefault();onContext(task,event.clientX,event.clientY);}} onDoubleClick={event=>{if(!(event.target as Element).closest('button'))onEdit(task);}}>
          <button className="list-handle" type="button" aria-label={`Move ${task.title}`} aria-describedby="list-move-help" aria-pressed={active?.task.id===task.id} disabled={!canEdit||busy||task.archived} onPointerDown={event=>pointerDown(event,task)} onKeyDown={event=>keyDown(event,task)}><GripVertical aria-hidden="true"/></button>
          {children.length?<button className="list-expander" type="button" aria-label={`${expanded?'Collapse':'Expand'} ${task.title}`} aria-expanded={expanded} onClick={()=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(task.id))next.delete(task.id);else next.add(task.id);return next;})}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={expanded?'M3 5 8 10 13 5':'M5 3 10 8 5 13'}/></svg></button>:<span className="list-expander-space"/>}
          <span className="markdown-entry"><span className="list-metadata"><span className="task-meta-cell" title={task.status}>{icons[statuses.indexOf(task.status as typeof statuses[number])]??icons[0]}</span><span className="task-meta-cell" title="Priority">{task.priority}</span><span className="task-meta-cell" title="Complexity">{task.complexity}</span></span><span className="list-content"><button className="list-title" type="button" aria-current={task.id===selected?'true':undefined} onClick={()=>titleClick(task)} onDoubleClick={()=>{clearTimeout(click.current);onEdit(task,true);}}>{task.title}</button>{task.description&&<span className="list-description"> - {task.description}</span>}{owners.length>0&&<span className="list-owners"> [{owners.join(',')}]</span>}{task.next_week&&<span title="Planned next week"> ^</span>}</span>{task.due_date&&<time className="list-due" dateTime={task.due_date}>{new Intl.DateTimeFormat(navigator.language,{dateStyle:'short'}).format(new Date(`${task.due_date}T12:00:00`))}</time>}</span>
        </div>{children.length>0&&expanded&&branch(task.id)}
      </li>;
    })}</ul>;
  }
  const destination=active?.destination;const target=available.find(task=>task.id===destination?.target);
  return <section ref={root} className="markdown-list" aria-label="Markdown task list" aria-busy={busy} onFocusCapture={event=>{const element=event.target as HTMLButtonElement;const task=element.closest<HTMLElement>('[data-task-id]')?.dataset.taskId;if(task&&element instanceof HTMLButtonElement)focused.current={element,task,handle:element.classList.contains('list-handle')};}} onBlurCapture={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))focused.current=null;}}>
    <p id="list-move-help" className="list-help">Drag a handle to move a branch. Space picks up, arrows position, Enter saves, Escape cancels.</p>
    {available.length?branch(null):<p>No matching tasks</p>}
    {canEdit&&<div className="list-root-drop" data-root-drop data-drop={destination?.position==='root'}>Project root</div>}
    <p role="status" className="list-move-status">{active?.started?(active.valid?`${active.task.title}: ${destination?.position==='inside'?'inside':destination?.position==='root'?'at':destination?.position} ${target?.title??'Project root'}`:'Choose a destination outside the moved branch'):busy?'Saving task order…':message}</p>
  </section>;
}
