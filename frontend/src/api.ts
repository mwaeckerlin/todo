let csrf = '';
let generation = 0;
const basePath = document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content ?? '';
export function appPath(path:string) { return basePath && path.startsWith('/') && path!==basePath && !path.startsWith(`${basePath}/`) ? `${basePath}${path}` : path; }
const sessionChannel = new BroadcastChannel('todo-session');
export function clearSession(broadcast=true) {
  csrf='';generation++;
  window.dispatchEvent(new Event('todo-session-ended'));
  if(broadcast)sessionChannel.postMessage('ended');
}
sessionChannel.onmessage=event=>{if(event.data==='ended')clearSession(false);};
export function setCsrf(value: string) { csrf = value; }
export class ApiError extends Error { constructor(message:string,readonly status:number){super(message);} }
export async function sessionFetch(path:string,options?:RequestInit) {
  const current=generation;
  const response=await fetch(appPath(path),options);
  if(response.status===401||(path==='/api/me'&&response.status===403))clearSession();
  if(current!==generation)throw new Error('Sign in to continue.');
  return response;
}
export async function api<T>(path: string, data?: unknown, method=data===undefined?'GET':'POST'): Promise<T> {
  const headers={ 'content-type':'application/json', 'x-csrf-token':csrf };
  if(path==='/auth/logout')clearSession();
  const current=generation;
  const response = await sessionFetch(path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(25000) });
  if (!response.ok) { const value = await response.json().catch(() => ({ error:`Request failed (${response.status})` })); throw new ApiError(value.error ?? `Request failed (${response.status})`,response.status); }
  const result=await response.json();
  if(current!==generation)throw new Error('Sign in to continue.');
  return result;
}
export function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
