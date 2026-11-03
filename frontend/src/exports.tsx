import { diagramURL } from './Bubbles';
import { download, sessionFetch } from './api';
import { descendants, type Task } from './types';
export async function exportPicture(format:string,tasks:Task[],focus:string|null,project:string){
  const scoped=descendants(tasks,focus);
  const response=await sessionFetch(diagramURL(project,scoped,format==='HTML'?'html':'svg'),{signal:AbortSignal.timeout(60000)});
  if(!response.ok){const error=await response.json().catch(()=>({error:'The task tree could not be exported. Try again.'}));throw new Error(error.error);}
  const serialized=await response.text();
  if(format==='SVG'){download(serialized,'tasks.svg','image/svg+xml');return;}
  if(format==='HTML'){download(serialized,'tasks.html','text/html');return;}
  const svg=new DOMParser().parseFromString(serialized,'image/svg+xml').documentElement;
  const width=Number(svg.getAttribute('width'));const height=Number(svg.getAttribute('height'));
  const url=URL.createObjectURL(new Blob([serialized],{type:'image/svg+xml'}));
  try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d')!.drawImage(image,0,0);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('The PNG could not be generated.'))));download(blob,'tasks.png','image/png');}finally{URL.revokeObjectURL(url);}
}
