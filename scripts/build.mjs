import { spawnSync } from 'node:child_process';
import './prepare-renderer.mjs';
for (const [command, args] of [['npm',['--prefix','.','run','build','-w','@mwaeckerlin/todo-ui']], ['cargo',['build','--release','--locked']]]) {
  const result = spawnSync(command,args,{stdio:'inherit'}); if(result.status!==0) process.exit(result.status??1);
}
