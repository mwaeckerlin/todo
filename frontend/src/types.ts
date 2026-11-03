export const statuses = ['open','planned','in_work','merged','done','waiting','dropped'] as const;
export const statusNames: Record<string, string> = { open:'Open', planned:'Planned', in_work:'In Work', merged:'Merged', done:'Done', waiting:'Waiting', dropped:'Dropped' };
export interface Task {
  id: string; parent_id: string | null; title: string; description: string; details: string;
  status: string; priority: string; complexity: number; due_date: string | null;
  owners: string[]; reference: string; next_week: boolean; archived: boolean;
  order: number; version: number; updated_at: string; sprint_id:string|null; depends_on:string[];
}
export interface User { id: string; username: string; role:string }
export function userLabel(user:Pick<User,'id'|'username'>,users:User[]){
  const others=users.filter(other=>other.username===user.username&&other.id!==user.id);
  if(!others.length)return user.username;
  let length=8;
  while(length<user.id.length&&others.some(other=>other.id.slice(0,length)===user.id.slice(0,length)))length=Math.min(length+4,user.id.length);
  return `${user.id.slice(0,length)} · ${user.username}`;
}
export interface Sprint { id:string;title:string;goal:string;start_date:string;end_date:string;status:string }
export interface Project { id: string; name: string; role: string; sequence: number }
export interface Revision { id:string; sequence:number; task_id:string; actor:User; at:string; action:string; fields:string[]; before:(Partial<Task>&{name?:string;preamble?:string})|null; after:(Partial<Task>&{name?:string;preamble?:string})|null;imported_by?:User|null;source_revision_id?:string|null }
export const taskFields = ['title','description','details','parent_id','status','priority','complexity','due_date','owners','reference','next_week','archived','order','sprint_id','depends_on'];
export function dateString(date:Date){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function blank(parent_id: string | null, order: number): Task { const id=crypto.randomUUID();return { id,parent_id,title:'',description:'',details:'',status:'open',priority:'M',complexity:1,due_date:null,owners:[],reference:`task-${id}`,next_week:false,archived:false,order,version:0,updated_at:'',sprint_id:null,depends_on:[] }; }
export function descendants(tasks: Task[], id: string | null): Task[] {
  if (!id) return tasks;
  const ids = new Set([id]);
  for (let changed = true; changed;) { changed = false; for (const t of tasks) if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) { ids.add(t.id); changed = true; } }
  return tasks.filter(t => ids.has(t.id));
}
