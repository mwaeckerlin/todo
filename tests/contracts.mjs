import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { testEnvironment } from './environment.mjs';
const read = p => readFile(p, 'utf8');
for(const directory of ['scripts','tests'])for(const file of await readdir(directory)){
  if(!file.endsWith('.mjs'))continue;
  const parsed=spawnSync(process.execPath,['--check',`${directory}/${file}`],{encoding:'utf8'});
  assert.equal(parsed.status,0,`${directory}/${file}: ${parsed.stderr}`);
}
const features = [...(await read('FEATURES.md')).matchAll(/^- \*\*F(\d+)\b/gm)].map(m => m[1]);
assert.equal(features.length, 12);
assert.equal(new Set(features).size, features.length);
const registry = await read('TESTS.md');
assert.ok(Date.now()<Date.parse('2026-12-01T00:00:00Z'),'Review the dated dependency workarounds before continuing');
const backlog = await read('TODO.md');
for (const id of features) {
  assert.match(registry, new RegExp(`\\bF${id}\\b`));
  const entry = [...backlog.matchAll(new RegExp(`^([ ]*)- .* #F${id}$`, 'gm'))];
  assert.equal(entry.length, 1, `F${id} must retain one trailing task ID`);
  assert.match(backlog, new RegExp(`^# F${id} [^\\n]+$`, 'm'));
  const parent = backlog.slice(0, entry[0].index).split('\n').filter(line => /^- /.test(line)).at(-1);
  const expected = {1:'Projects',2:'Task Management',3:'Interchange',4:'Personal Views',5:'Personal Views',6:'Projects',7:'Task Management',8:'Projects',9:'Deployment',10:'Planning Automation',11:'Planning Automation',12:'Personal Views'}[id];
  assert.ok(parent?.includes(` ${expected} - `), `F${id} belongs under ${expected}`);
}
for (const f of ['README.md','ARCHITECTURE.md','CHANGELOG.md','LICENSE','Dockerfile','docker-compose.yml']) assert.ok((await read(f)).length > 0, f);
for (const f of await readdir(new URL('.', import.meta.url))) {
  if (!f.endsWith('.spec.ts')) continue;
  assert.doesNotMatch(await read(`tests/${f}`), /(?:test|describe|it)\.(?:skip|only|fixme)\s*\(/);
}
const { parse } = await import('yaml');
const compose = parse(await read('docker-compose.yml'));
for (const service of Object.values(compose.services)) {
  assert.notEqual(String(service.user), '0');
  assert.ok(!service.privileged);
  for (const volume of service.volumes ?? []) assert.ok(!String(volume).startsWith('.'));
}
const resolved=spawnSync('docker',['compose','-p','todo-contract','-f','docker-compose.yml','-f','tests/databases.compose.yml','config','--format','json'],{encoding:'utf8',env:testEnvironment({...process.env,TODO_DATABASE_URL:'postgres://external.invalid/application',BIND_ADDRESS:'0.0.0.0',TODO_PORT:'18080'})});
assert.equal(resolved.status,0,resolved.stderr);
const testCompose=JSON.parse(resolved.stdout);
assert.equal(new URL(testCompose.services.todo.environment.DATABASE_URL).hostname,'database');
const ports=Object.entries(testCompose.services).flatMap(([service,settings])=>(settings.ports??[]).map(port=>({service,address:port.host_ip,published:port.published,target:port.target})));
assert.deepEqual(ports,[{service:'proxy',address:'127.0.0.1',published:'18080',target:8080}],'Traefik must publish the sole local port');
assert.equal(testCompose.services.todo.environment.OIDC_ISSUER,'http://localhost:18080/auth/application/o/todo/');
assert.equal(testCompose.services.authentik.environment.AUTHENTIK_WEB__PATH,'/auth/');
assert.equal(testCompose.services.todo.environment.APP_BASE_PATH,'/todo');
assert.equal(testCompose.services.authentik.environment.TODO_REDIRECT_URI,'http://localhost:18080/todo/auth/callback');
console.log('F1–F12 documentation, Compose and test-isolation contracts passed');
