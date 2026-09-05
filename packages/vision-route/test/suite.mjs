import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

await import('../test-shape.mjs')
await import('../test-provider-mapping.mjs')
await import('../test-module.mjs')

// Keep the official-component boundary in the package-level safety suite so
// source auditors can discover the same fail-closed contract exercised by CI.
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(manifest.engines?.dsh, '>=0.1.0-rc.8 <0.2.0')
assert.equal(manifest.dsh?.compatibility?.dsh, manifest.engines.dsh)
assert.equal(manifest.dsh?.compatibility?.dshReleases?.['0.1.2-rc.1'], 'compatible')
for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  const officialDependencies = Object.keys(manifest[field] ?? {})
    .filter(name => name.startsWith('@deepseek-ai/'))
  assert.deepEqual(officialDependencies, [], `${field} must not install official DSH components`)
}

console.log('OK: vision-route package test suite')
