// dsh-vision-free-eyes / vision-tool — a model-facing `vision` tool for
// DeepSeek Harness.
//
// Wraps the `deepseek-free-eyes` CLI (https://github.com/SolicitousMonkey/deepseek-free-eyes)
// so a text-only model can "see" images on disk through the free Zhipu GLM
// vision models (glm-4v-flash -> glm-4.6v-flash -> glm-4.1v-thinking-flash
// fallback chain).
//
// The tool executes the vision CLI in the harness HOST process, so it is not
// subject to the agent shell's file sandbox: no per-call escalation is needed.
//
// Requirements:
//   - `vision` CLI installed (e.g. `uv tool install git+https://github.com/SolicitousMonkey/deepseek-free-eyes`)
//     and on PATH, or point `VISION_BIN` at the executable.
//   - GLM_API_KEY / ZHIPU_API_KEY in the process env or the Windows user
//     environment (the CLI merges HKCU\Environment itself).
//   - Outbound HTTPS to open.bigmodel.cn.
//
// Overrides:
//   - VISION_BIN env var: absolute path to the vision executable.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, copyFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, extname, basename } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

const execFileAsync = promisify(execFile)

export const name = 'vision-free-eyes'
export const inject = ['tools']

// Magic-byte sniffers for extension-less attachment objects
// (<DSH_HOME>/attachments/v1/objects/<prefix>/<sha256> have no extension).
const MAGIC = [
  { ext: '.png', test: (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: '.jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', test: (b) => b.length >= 4 && b.toString('ascii', 0, 4) === 'GIF8' },
  { ext: '.webp', test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: '.bmp', test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d },
]

const KNOWN_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

async function resolveBin() {
  if (process.env.VISION_BIN) return process.env.VISION_BIN
  return 'vision' // resolved via PATH
}

/**
 * Ensure the image path carries a real image extension so the CLI's MIME guess
 * matches the bytes. Extension-less attachment objects are copied to a temp
 * file with the sniffed extension; a wrong extension is fixed the same way.
 */
async function ensureImagePath(image) {
  let target = image
  const ext = extname(image).toLowerCase()
  if (KNOWN_EXT.has(ext)) return image
  const buf = await readFile(image)
  const hit = MAGIC.find((m) => m.test(buf))
  if (!hit) return image // let the CLI report its own error
  const dir = await mkdtemp(join(tmpdir(), 'dsh-vision-'))
  target = join(dir, basename(image).replace(/[^a-zA-Z0-9._-]/g, '_') + hit.ext)
  await copyFile(image, target)
  return target
}

async function runVision(args, exec) {
  const bin = await resolveBin()
  const cliArgs = []
  let timeoutMs = 150000

  switch (args.mode ?? 'image') {
    case 'image': {
      const image = await ensureImagePath(args.image)
      cliArgs.push(image)
      if (args.question) cliArgs.push(args.question)
      break
    }
    case 'ocr': {
      const image = await ensureImagePath(args.image)
      cliArgs.push('ocr', image)
      break
    }
    case 'doc': {
      cliArgs.push('doc', args.image)
      timeoutMs = 300000
      break
    }
    case 'status':
    case 'stats':
    case 'self-test': {
      cliArgs.push(args.mode)
      timeoutMs = 180000
      break
    }
    default:
      throw new Error(`unknown vision mode "${args.mode}" (expected image|ocr|doc|status|stats|self-test)`)
  }
  if (args.json) cliArgs.push('--json')
  if (args.no_cache) cliArgs.push('--no-cache')

  let out
  try {
    out = await execFileAsync(bin, cliArgs, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      signal: exec.signal,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    })
  } catch (err) {
    const detail = (err.stdout || '') + (err.stderr || '')
    const reason = err.code === 'ENOENT'
      ? `vision executable not found ("${bin}"). Install it with: uv tool install git+https://github.com/SolicitousMonkey/deepseek-free-eyes  (or set VISION_BIN to its path)`
      : `vision failed (exit ${err.code ?? 'unknown'}): ${detail.trim() || err.message}`
    throw new Error(reason)
  }
  return (out.stdout || '').trim()
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'vision',
    description:
      'Describe an image using a free GLM vision model (glm-4v-flash). Use this whenever the user pastes, uploads, or points to an image/screenshot and you need to know its content, or when read_image is unavailable because the routed model has no image input. Give the absolute path to the image file; the result is a Chinese text description plus a latency marker like [glm | 1234ms].',
    parameters: {
      image: {
        type: 'string',
        description: 'Absolute path to the image file (png/jpg/jpeg/webp/gif/bmp). Required for modes image/ocr/doc. Extension-less attachment objects are auto-detected by content.',
      },
      question: {
        type: 'string',
        description: 'Optional question/prompt about the image (Chinese works best). Defaults to "describe this image in Chinese".',
      },
      mode: {
        type: 'string',
        description: 'image = describe the picture (default); ocr = extract text only; doc = parse a PDF/document; status|stats|self-test = CLI health/statistics.',
      },
      json: {
        type: 'boolean',
        description: 'Return the raw JSON envelope instead of the formatted text.',
      },
      no_cache: {
        type: 'boolean',
        description: 'Bypass the local result cache (privacy: the image is still sent to Zhipu servers unless a local model is configured).',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if ((args.mode === 'image' || args.mode === 'ocr' || args.mode === 'doc') && !args.image) {
        throw new Error('missing required parameter: image')
      }
      return runVision(args, exec)
    },
  }))
}
