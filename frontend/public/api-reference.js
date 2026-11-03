const operations = document.querySelector('#operations');
const basePath = document.querySelector('meta[name="app-base"]')?.content ?? '';
const spec = await (await fetch(`${basePath}/api/openapi.json`)).json();
for (const [path, methods] of Object.entries(spec.paths)) for (const [method, operation] of Object.entries(methods)) {
  const row = document.createElement('article'); const title = document.createElement('strong');
  title.textContent = `${method.toUpperCase()} ${path}`;
  const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Contract';
  const pre = document.createElement('pre'); pre.textContent = JSON.stringify(operation, null, 2); details.append(summary, pre); row.append(title, details); operations.append(row);
}
document.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault(); const result = document.querySelector('#result');
  try {
    const data = new FormData(event.currentTarget); const path = String(data.get('path'));
    if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Choose an API path on this server.');
    const me = await (await fetch(`${basePath}/api/me`)).json(); const method = String(data.get('method'));
    const response = await fetch(`${basePath}${path}`, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrf_token }, body: method === 'GET' ? undefined : String(data.get('body')), signal: AbortSignal.timeout(25000) });
    result.textContent = `${response.status}\n${await response.text()}`;
  } catch (error) { result.textContent = error.message; }
});
