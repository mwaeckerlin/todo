import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile('frontend/src/style.css', 'utf8')
const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
const root = css.match(/:root\s*\{([^{}]*)\}/)
assert.ok(root, 'The stylesheet must define the shared design tokens')
const rules = css.replace(root[0], '')
const violations = []
for (const declaration of rules.matchAll(/([\w-]+)\s*:\s*([^;{}]+)(?:;|(?=\}))/g)) {
  const [, property, value] = declaration
  if (/(-?\d*\.?\d+)(?:rem|em|ex|ch|vw|vh|dvh|cqi)\b/.test(value)) violations.push(`${property}: ${value} uses an unnamed measurement`)
  if (/#(?:[a-f\d]{3,8})\b|\brgba?\(|\bhsla?\(|\b(?:white|black|transparent|currentColor)\b|\bcolor-mix\(/i.test(value)) violations.push(`${property}: ${value} bypasses a semantic colour token`)
  if (/var\(--(?:blue|dark|grey|light|white|rose-grey|green|mint|amber|red|pink|orange)\b/.test(value)) violations.push(`${property}: ${value} uses a palette token directly`)
}
assert.doesNotMatch(css, /\b\d*\.?\d+px\b/, 'Owned CSS dimensions must remain relative')
assert.doesNotMatch(root[1], /(?:^|;)\s*font-size\s*:/, 'The browser root font choice must be retained')
assert.doesNotMatch(rules, /html\s*\{[^}]*font-size\s*:/, 'The browser root font choice must be retained')
assert.deepEqual(violations, [], 'Component rules must consume named measurements and semantic colours')
assert.match(root[1], /--short\s*:\s*calc\(var\(--space\)\s*\/\s*2\)/)
assert.match(root[1], /--wide\s*:\s*calc\(var\(--space\)\s*\*\s*3\)/)
assert.match(root[1], /--long\s*:\s*calc\(var\(--space\)\s*\*\s*1\.5\)/)
assert.match(root[1], /--font-small\s*:/)
assert.match(root[1], /--font-body\s*:/)
assert.match(root[1], /--font-emphasis\s*:/)
console.log('F1 F5 F7 F12 shared CSS token, colour and rhythm contracts passed')
