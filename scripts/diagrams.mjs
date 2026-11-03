import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('doc',{recursive:true});await mkdir('artifacts/docs',{recursive:true});
const source=await readFile('ARCHITECTURE.md','utf8');
for(const match of source.matchAll(/```plantuml\n(@startuml ([a-z-]+)[\s\S]*?@enduml)\n```/g)){
  for(const format of ['svg','png']){
    const result=spawnSync('plantuml',[`-t${format}`,'-pipe'],{input:match[1],maxBuffer:16*1024*1024,timeout:60000});
    if(result.status!==0)throw new Error(`Diagram ${match[2]} could not be rendered: ${result.stderr}`);
    await writeFile(format==='svg'?`doc/${match[2]}.svg`:`artifacts/docs/${match[2]}.png`,result.stdout);
  }
}
