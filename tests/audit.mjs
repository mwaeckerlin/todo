import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const binary='target/audit/bin/cargo-audit';
if(!existsSync(binary)){
  const install=spawnSync('cargo',['install','cargo-audit','--locked','--root','target/audit'],{stdio:'inherit',env:{...process.env,CARGO_BUILD_JOBS:process.env.CARGO_BUILD_JOBS??'2'}});
  if(install.status!==0)process.exit(install.status??1);
}
const result=spawnSync(binary,['audit','--deny','warnings'],{stdio:'inherit'});process.exit(result.status??1);
