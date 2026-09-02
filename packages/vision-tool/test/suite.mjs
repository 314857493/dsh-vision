import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

await import('../test-shape.mjs')
await import('../test-behavior.mjs')
await import('../test-module.mjs')

// Keep the official-component boundary in the package-level safety suite so
// source auditors can discover the same fail-closed contract exercised by CI.
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  const officialDependencies = Object.keys(manifest[field] ?? {})
    .filter(name => name.startsWith('@deepseek-ai/'))
  assert.deepEqual(officialDependencies, [], `${field} must not install official DSH components`)
}

console.log('OK: vision-tool package test suite')
