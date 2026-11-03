import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

const runtime = JSON.parse(await readFile('artifacts/demo.json', 'utf8'))
const origin = new URL(runtime.url).origin
const base = '/todo'
const source = await readFile('tests/fixtures/opensource.md', 'utf8')
const expected = source.split('\n').filter(line => /^ *- [⬜📄⏳🔀✅⏸❌]/u.test(line)).length
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 2400, height: 1350 } })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}${base}/`)
  await page.getByRole('link', { name: 'Sign in with Authentik' }).click()
  await page.locator('input[name="uidField"]').fill('akadmin')
  await page.getByRole('button', { name: /Log in|Continue|Next/ }).click()
  const password = page.locator('ak-stage-password')
  await password.locator('input[type="password"]').fill('local-test-password')
  await password.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Load', exact: true })).toBeVisible()
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Load', exact: true }).click()
  ])
  const loaded = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `${base}/api/load`)
  await chooser.setFiles({ name: 'opensource.md', mimeType: 'text/markdown', buffer: Buffer.from(source) })
  const response = await loaded
  assert.equal(response.ok(), true, await response.text())
  const imported = await response.json()
  await expect(page.getByRole('combobox', { name: 'Project', exact: true }).locator('option:checked')).toHaveText('Open Source Projects')
  const project = imported.project.id
  await expect(page).toHaveURL(url => url.searchParams.get('project') === project)
  const snapshot = await (await page.request.get(`${origin}${base}/api/projects/${project}`)).json()
  assert.equal(snapshot.tasks.filter(task => !task.archived).length, expected)
  await mkdir('doc/screenshots', { recursive: true })
  for (const [view, file] of [['Bubbles', 'bubbles'], ['Board', 'board'], ['List', 'list']]) {
    await page.getByRole('tab', { name: view, exact: true }).click()
    if (view === 'Bubbles') {
      const svg = page.locator('.task-tree-host #svg')
      await expect(svg.locator('circle').first()).toBeVisible()
      await svg.evaluate(async element => {
        await document.fonts.ready
        let previous = '', stable = 0
        const deadline = performance.now() + 15000
        while (stable < 5 && performance.now() < deadline) {
          await new Promise(requestAnimationFrame)
          const current = element.getAttribute('viewBox')
          stable = current === previous ? stable + 1 : 0
          previous = current
        }
        if (stable < 5) throw new Error('The diagram did not settle')
      })
    }
    if (view === 'Board') await expect(page.getByTestId('task-card')).toHaveCount(7)
    if (view === 'List') await expect(page.locator('.list-row')).toHaveCount(expected)
    await page.mouse.move(0, 0)
    await page.screenshot({ path: `doc/screenshots/${file}.png`, fullPage: false })
  }
  assert.deepEqual(errors, [])
  await writeFile('artifacts/opensource-screenshots.json', JSON.stringify({ url: page.url(), tasks: expected, views: ['Bubbles', 'Board', 'List'], viewport: { width: 2400, height: 1350 }, image: runtime.image_id, captured: new Date().toISOString() }, null, 2))
  console.log(`Captured Bubbles, Board and List with ${expected} tasks: ${page.url()}`)
} finally {
  await browser.close()
}
