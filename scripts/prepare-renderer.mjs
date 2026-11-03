import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const project=dirname(dirname(fileURLToPath(import.meta.url)));
let source=process.env.TODO_RENDERER_SOURCE;
for(let folder=dirname(project);!source;folder=dirname(folder)){
  const candidate=join(folder,'bin','build-todo-tree.py');
  if(existsSync(candidate)){source=candidate;break;}
  if(dirname(folder)===folder)break;
}
const staged=join(project,'renderer','task-tree.py');
if(source&&resolve(source)!==staged)copyFileSync(source,staged);
if(!existsSync(staged))throw new Error('Set TODO_RENDERER_SOURCE to the original task-tree builder before building.');
const result=spawnSync('python3',['renderer/browser-module.py'],{cwd:project,stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
