import { spawnSync } from 'node:child_process';

if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('This bootstrap installs packages on a GitHub Actions runner. Use npm test for local verification.');
}

for (const [command, args] of [
  ['sudo', ['apt-get', 'update']],
  ['sudo', ['apt-get', 'install', '--yes', '--no-install-recommends', 'plantuml', 'graphviz', 'python3', 'python3-pil', 'fontconfig']],
  ['npm', ['run', 'setup:browsers', '--', '--with-deps']],
  ['npm', ['test']]
]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
