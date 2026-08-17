// dsh-vision-free-eyes / vision-tool — a model-facing `vision` tool for
// DeepSeek Harness.
//
// Describes / OCRs image files directly through the free Zhipu GLM vision API
// (glm-4v-flash -> glm-4.6v-flash -> glm-4.1v-thinking-flash fallback chain).
// No external CLI is required — the tool talks HTTPS to open.bigmodel.cn
// itself, so it works anywhere with a GLM key.
//
// Requirements:
//   - GLM_API_KEY / ZHIPU_API_KEY in the process env or the Windows user
//     environment (HKCU\Environment is merged automatically).
//   - Outbound HTTPS to open.bigmodel.cn.
//
// Config:
//   apiKeyEnv: env var name(s) for the GLM key (default GLM_API_KEY, ZHIPU_API_KEY)
//   no_cache:  force a fresh request (bypass the in-process result cache)

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { defineTool } from '@deepseek-ai/dsh-tools'

const execFileAsync = promisify(execFile)

const API_BASE = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const VISION_MODELS = ['glm-4v-flash', 'glm-4.6v-flash', 'glm-4.1v-thinking-flash']
const TIMEOUT_MS = 60000
const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // GLM hard cap
const DEFAULT_PROMPT = '请用中文详细描述这张图片。'
const OCR_PROMPT = '请逐字转写图片中的所有文字（界面文字、报错、标题、按钮、标签等），用中文输出。'

// Magic-byte sniffers: extension-less attachment objects
// (<DSH_HOME>/attachments/v1/objects/<prefix>/<sha256> have no extension).
const MAGIC = [
  { ext: '.png', mime: 'image/png', test: (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: '.jpg', mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', mime: 'image/gif', test: (b) => b.length >= 4 && b.toString('ascii', 0, 4) === 'GIF8' },
  { ext: '.webp', mime: 'image/webp', test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: '.bmp', mime: 'image/bmp', test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d },
]

function sniffMime(buf) {
  const hit = MAGIC.find((m) => m.test(buf))
  return hit?.mime
}

// In-process result cache keyed by `path:byteLength:mode`, LRU-capped.
const CACHE = new Map()
const CACHE_MAX = 200
function setCache(key, value) {
  if (CACHE.size >= CACHE_MAX) {
    const first = CACHE.keys().next().value
    if (first !== undefined) CACHE.delete(first)
  }
  CACHE.set(key, value)
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
async function callGlm(model, imageUrl, prompt, key, signal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('glm-timeout'), TIMEOUT_MS)
  const combined = signal === undefined
    ? controller.signal
    : AbortSignal.any([signal, controller.signal])
  try {
    const response = await fetch(API_BASE, {
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

/** Describe / OCR one image file via the GLM API. */
async function analyze(imagePath, mode, question, signal, config) {
  const buf = await readFile(imagePath)
  if (buf.byteLength === 0) throw new Error('图片文件为空')
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`图片 ${(buf.byteLength / 1048576).toFixed(1)}MB 超过 15MB 上限`)
  }
  const key = await resolveGlmKey(config)
  if (!key) {
    throw new Error('未找到 GLM_API_KEY / ZHIPU_API_KEY（请配置智谱 GLM 免费 key，格式 id.secret）')
  }
  const cacheKey = `${imagePath}:${buf.byteLength}:${mode}`
  if (!config?.no_cache) {
    const hit = CACHE.get(cacheKey)
    if (hit !== undefined) return hit
  }
  const prompt = mode === 'ocr'
    ? OCR_PROMPT
    : (question && question.trim() ? question.trim() : DEFAULT_PROMPT)
  const mime = sniffMime(buf) ?? 'image/png'
  const imageUrl = `data:${mime};base64,${buf.toString('base64')}`
  const started = Date.now()
  let lastError
  for (const model of VISION_MODELS) {
    try {
      const text = (await callGlm(model, imageUrl, prompt, key, signal)).trim()
      const marker = `[glm | ${Date.now() - started}ms]`
      const result = `${text}\n${marker}`
      if (!config?.no_cache) setCache(cacheKey, result)
      return result
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`所有 GLM 视觉通道失败: ${lastError?.message ?? ''}`)
}

export function apply(ctx, config = {}) {
  ctx.tools.register(defineTool({
    name: 'vision',
    description:
      'Describe or OCR an image using a free GLM vision model (glm-4v-flash), calling the Zhipu API directly. Use this whenever the user pastes, uploads, or points to an image/screenshot and you need to know its content, or when read_image is unavailable because the routed model has no image input. Give the absolute path to the image file; the result is a Chinese text description plus a latency marker like [glm | 1234ms].',
    parameters: {
      image: {
        type: 'string',
        description: 'Absolute path to the image file (png/jpg/jpeg/webp/gif/bmp). Extension-less attachment objects are auto-detected by content.',
      },
      question: {
        type: 'string',
        description: 'Optional question/prompt about the image (Chinese works best). Defaults to "describe this image in Chinese".',
      },
      mode: {
        type: 'string',
        description: 'image = describe the picture (default); ocr = extract text only.',
      },
      no_cache: {
        type: 'boolean',
        description: 'Bypass the in-process result cache (privacy: the image is always sent to Zhipu servers).',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!args.image) throw new Error('missing required parameter: image')
      const mode = args.mode ?? 'image'
      if (mode !== 'image' && mode !== 'ocr') {
        throw new Error(`unknown vision mode "${args.mode}" (expected image|ocr)`)
      }
      return analyze(args.image, mode, args.question, exec.signal, config)
    },
  }))
}
