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
//     and on PATH, or point `VISION_BIN` (or config `bin`) at the executable.
//   - GLM_API_KEY / ZHIPU_API_KEY in the process env or the Windows user
//     environment (the CLI merges HKCU\Environment itself).
//   - Outbound HTTPS to open.bigmodel.cn.
//
// Fallback: when the vision CLI is NOT installed (executable not found),
// `image` / `ocr` calls fall back to a direct GLM chat/completions request
// (no CLI needed, only GLM_API_KEY). `doc` and `status` still require the CLI.
// Set config `fallback: false` to disable the fallback.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, extname, basename } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

const execFileAsync = promisify(execFile)

// Magic-byte sniffers for extension-less attachment objects
// (<DSH_HOME>/attachments/v1/objects/<prefix>/<sha256> have no extension).
const MAGIC = [
  { ext: '.png', test: (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: '.jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', test: (b) => b.length >= 4 && b.toString('ascii', 0, 4) === 'GIF8' },
  { ext: '.webp', test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: '.bmp', test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d },
]

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
}

const KNOWN_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

function sniffMime(buf) {
  const hit = MAGIC.find((m) => m.test(buf))
  return hit ? MIME_BY_EXT[hit.ext] : undefined
}

// ---------- direct GLM fallback (no vision CLI needed) ----------

const GLM_API_BASE = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const GLM_FALLBACK_MODELS = ['glm-4v-flash', 'glm-4.6v-flash', 'glm-4.1v-thinking-flash']
const GLM_TIMEOUT_MS = 60000
const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // GLM hard cap
const OCR_PROMPT = '请逐字转写图片中的所有文字（界面文字、报错、标题、按钮、标签等），用中文输出。'

// In-process cache keyed by `path:byteLength`, LRU-capped (same image asked
// twice in one session is only billed once).
const FALLBACK_CACHE = new Map()
const FALLBACK_CACHE_MAX = 200
function setFallbackCache(key, value) {
  if (FALLBACK_CACHE.size >= FALLBACK_CACHE_MAX) {
    const first = FALLBACK_CACHE.keys().next().value
    if (first !== undefined) FALLBACK_CACHE.delete(first)
  }
  FALLBACK_CACHE.set(key, value)
}

async function resolveGlmKey(config) {
  const envNames = Array.isArray(config?.apiKeyEnv) ? config.apiKeyEnv
    : typeof config?.apiKeyEnv === 'string' && config.apiKeyEnv ? [config.apiKeyEnv]
    : ['GLM_API_KEY', 'ZHIPU_API_KEY']
  for (const name of envNames) {
    const v = process.env[name]
    if (v && v.trim()) return v.trim()
  }
  try {
    // Windows user env may postdate the running dsh process; read the registry.
    const { stdout } = await execFileAsync(
      'reg',
      ['query', 'HKCU\\Environment', '/v', 'GLM_API_KEY'],
      { windowsHide: true, timeout: 5000 },
    )
    const m = stdout.match(/GLM_API_KEY\s+REG_SZ\s+(\S+)/)
    if (m && m[1].trim()) return m[1].trim()
  } catch {
    // fall through
  }
  return undefined
}

/** One GLM chat/completions call with the given model; throws on non-2xx. */
async function callGlmDirect(model, imageUrl, prompt, key, signal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('glm-timeout'), GLM_TIMEOUT_MS)
  const combined = signal === undefined
    ? controller.signal
    : AbortSignal.any([signal, controller.signal])
  try {
    const response = await fetch(GLM_API_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
      signal: combined,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`GLM ${model} HTTP ${response.status}: ${detail.slice(0, 200)}`)
    }
    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (!text) throw new Error(`GLM ${model} returned empty content`)
    return text
  } finally {
    clearTimeout(timer)
  }
}

/** Describe / OCR one image file via the GLM API directly (no CLI needed). */
async function describeViaGlm(imagePath, question, signal, config) {
  const buf = await readFile(imagePath)
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`图片 ${(buf.byteLength / 1048576).toFixed(1)}MB 超过 15MB 上限`)
  }
  const key = await resolveGlmKey(config)
  if (!key) {
    throw new Error('未找到 GLM_API_KEY / ZHIPU_API_KEY（请配置智谱 GLM 免费 key），且 vision CLI 未安装，无法回退')
  }
  const cacheKey = `${imagePath}:${buf.byteLength}`
  const hit = FALLBACK_CACHE.get(cacheKey)
  if (hit !== undefined) return hit
  const prompt = question && question.trim() ? question.trim() : '请用中文详细描述这张图片。'
  const mime = sniffMime(buf) ?? 'image/png'
  const imageUrl = `data:${mime};base64,${buf.toString('base64')}`
  let lastError
  for (const model of GLM_FALLBACK_MODELS) {
    try {
      const text = (await callGlmDirect(model, imageUrl, prompt, key, signal)).trim()
      setFallbackCache(cacheKey, text)
      return text
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`所有 GLM 视觉通道失败: ${lastError?.message ?? ''}`)
}

// ---------- vision CLI path ----------

async function resolveBin(config) {
  if (typeof config?.bin === 'string' && config.bin.trim()) return config.bin.trim()
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

async function runVision(args, exec, config) {
  const bin = await resolveBin(config)
  const cliArgs = []
  let timeoutMs = 150000
  const mode = args.mode ?? 'image'

  switch (mode) {
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
      cliArgs.push(mode)
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
    if (err.code === 'ENOENT' && config?.fallback !== false && (mode === 'image' || mode === 'ocr')) {
      // vision CLI not installed — fall back to a direct GLM call.
      const question = mode === 'ocr' ? OCR_PROMPT : args.question
      try {
        return await describeViaGlm(args.image, question, exec.signal, config)
      } catch (fallbackError) {
        throw new Error(`vision CLI 未安装且 GLM 直连回退失败: ${fallbackError.message}`)
      }
    }
    const detail = (err.stdout || '') + (err.stderr || '')
    const reason = err.code === 'ENOENT'
      ? `vision executable not found ("${bin}"). Install it with: uv tool install git+https://github.com/SolicitousMonkey/deepseek-free-eyes  (or set VISION_BIN to its path). ${mode === 'doc' ? 'doc 模式依赖 vision CLI，无回退。' : ''}`
      : `vision failed (exit ${err.code ?? 'unknown'}): ${detail.trim() || err.message}`
    throw new Error(reason)
  }
  return (out.stdout || '').trim()
}

export function apply(ctx, config = {}) {
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
      return runVision(args, exec, config)
    },
  }))
}
