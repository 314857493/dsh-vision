// Disposable-profile acceptance for one exact published DSH release.
//
// Usage: node scripts/test-dsh-compatibility.mjs 0.1.1-rc.2
//
// The test never touches the user's real DSH_HOME. It installs both local
// bundles into a temporary web profile, composes the config, waits for a real
// web-server readiness URL, uninstalls both bundles, and verifies removal.

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const supportedReleases = new Set([
  '0.1.0-rc.8',
  '0.1.1-rc.1',
  '0.1.1-rc.2',
])
const release = process.argv[2]
if (!supportedReleases.has(release)) {
  throw new Error(`expected one supported DSH release, got ${JSON.stringify(release)}`)
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagePaths = [
  resolve(repositoryRoot, 'packages/vision-tool'),
  resolve(repositoryRoot, 'packages/vision-route'),
]
const packageNames = ['dsh-vision-free-eyes', 'dsh-vision-proxy-route']
const profileHome = mkdtempSync(join(tmpdir(), `dsh-vision-${release}-`))
const sharedStore = join(tmpdir(), 'dsh-vision-compat-pnpm-store')
const sharedCache = join(tmpdir(), 'dsh-vision-compat-pnpm-cache')
const dlxPrefix = [
  `--config.store-dir=${sharedStore}`,
  `--config.cache-dir=${sharedCache}`,
  'dlx',
  `@deepseek-ai/dsh@${release}`,
]
const environment = {
  ...process.env,
  DSH_HOME: profileHome,
  DSH_TELEMETRY_MODE: 'DISABLED',
}

function runDsh(args, options = {}) {
  const result = spawnSync('pnpm', [...dlxPrefix, ...args], {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    timeout: options.timeout ?? 180_000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`DSH ${release} command failed (${args.join(' ')}):\n${output}`)
  }
  return output
}

async function startWebProfile() {
  await new Promise((resolveReady, rejectReady) => {
    const child = spawn('pnpm', [
      ...dlxPrefix,
      'web',
      '--no-open',
      '--port',
      '0',
    ], {
      cwd: repositoryRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let ready = false
    let settled = false
    let timer
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) rejectReady(error)
      else resolveReady()
    }
    const inspect = (chunk) => {
      output += chunk.toString()
      if (!ready && /dsh web: http:\/\/127\.0\.0\.1:\d+/.test(output)) {
        ready = true
        child.kill('SIGTERM')
      }
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.on('error', finish)
    child.on('exit', (code, signal) => {
      if (ready) finish()
      else finish(new Error(`DSH ${release} web profile exited before readiness (${code ?? signal}):\n${output}`))
    })
    timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish(new Error(`DSH ${release} web profile did not become ready:\n${output}`))
    }, 45_000)
  })
}

function assertManifestContract() {
  for (const packagePath of packagePaths) {
    const manifest = JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8'))
    assert.equal(manifest.version, '0.1.3')
    assert.equal(manifest.engines?.node, '>=22')
    assert.equal(manifest.dsh?.compatibility?.dsh, '>=0.1.0-rc.8 <0.2.0')
    assert.deepEqual(manifest.dsh?.compatibility?.profiles, ['web'])
    assert.equal(manifest.dsh?.compatibility?.dshReleases?.[release], 'compatible')
    assert.equal(manifest.scripts?.preinstall, undefined)
    assert.equal(manifest.scripts?.install, undefined)
    assert.equal(manifest.scripts?.postinstall, undefined)
    assert.equal(manifest.scripts?.prepare, undefined)
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const official = Object.keys(manifest[field] ?? {}).filter(name => name.startsWith('@deepseek-ai/'))
      assert.deepEqual(official, [], `${manifest.name} must not install or peer-import official DSH packages`)
    }
  }
}

try {
  assertManifestContract()

  // The first command initializes a disposable web profile and pins its own
  // pnpm store/cache to temporary paths before any package installation.
  runDsh(['plugin', '--profile', 'web', 'config', 'set', 'store-dir', sharedStore, '--location=project'])
  runDsh(['plugin', '--profile', 'web', 'config', 'set', 'cache-dir', sharedCache, '--location=project'])
  runDsh(['plugin', '--profile', 'web', 'add', ...packagePaths])

  const installedConfig = runDsh(['--profile', 'web', '--dump-config'])
  for (const packageName of packageNames) {
    assert.match(installedConfig, new RegExp(`# == ${packageName}\\n`))
  }

  await startWebProfile()

  runDsh(['plugin', '--profile', 'web', 'remove', ...packageNames])
  const removedConfig = runDsh(['--profile', 'web', '--dump-config'])
  for (const packageName of packageNames) {
    assert.doesNotMatch(removedConfig, new RegExp(`# == ${packageName}\\n`))
  }

  console.log(`OK: DSH ${release} disposable profile install/start/uninstall`)
} finally {
  rmSync(profileHome, { recursive: true, force: true })
}
