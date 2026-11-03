import type { DetailedHTMLProps, HTMLAttributes, Ref } from 'react';
export interface TreeEvent {action:string;taskId?:string;reference?:string;x?:number;y?:number;titleOnly?:boolean;message?:string}
export interface TreeHostState {reference:string;navigation:number;url:string;identities:{id:string;reference:string}[]}
export interface TreeConnection {sync(state:TreeHostState):void;dispose():void}
export class TaskTreeElement extends HTMLElement {renderer?:unknown;setDocument(data:unknown):unknown;dispose():void}
export function connectOriginalTree(host:TaskTreeElement,environment:{url:string;emit:(event:TreeEvent)=>void}):TreeConnection;
export const applicationTreeStyles:string;
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'task-tree-view':DetailedHTMLProps<HTMLAttributes<TaskTreeElement>,TaskTreeElement> & {ref?:Ref<TaskTreeElement>};
    }
  }
}
