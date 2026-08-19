// vision-proxy-route — DeepSeek Harness (rc.5) route wrapper that lets a
// text-only DeepSeek session accept pasted images in the Web GUI.
//
// Registers a new provider route `deepseek-vision` that:
//   1. declares `inputModalities: ['text', 'image']` in resolveModel(), so the
//      api-proxy attachment preflight and the read_image gate admit images;
//   2. intercepts the model request and transcribes every `{ type: 'image',
//      attachment }` content block into a text block via the free Zhipu GLM
//      vision models (glm-4v-flash → glm-4.6v-flash → glm-4.1v-thinking-flash),
//      using the user's existing GLM_API_KEY;
//   3. delegates the cleaned text-only request to the real DeepSeek adapter.
//
// The official `deepseek-official` route is left untouched; the user picks
// `deepseek-vision` in the model selector before sending images.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

const execFileAsync = promisify(execFile)

const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const VISION_MODELS = ['glm-4v-flash', 'glm-4.6v-flash', 'glm-4.1v-thinking-flash']
const TRANSCRIBE_TIMEOUT_MS = 60000
const CACHE_MAX = 200
const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // GLM hard cap
const PROMPT_BASE =
  '请用中文详细描述这张图片，用于让纯文本大模型理解其内容。要求：' +
  '1) 逐字转写图中所有文字（界面文字、报错、标题、按钮、标签等）；' +
  '2) 描述整体布局、主要元素及其位置关系；' +
  '3) 说明颜色风格与图表/数据要点。输出结构化中文描述。'

export const name = 'vision-proxy-route'
export const inject = ['llm']

// ---------- GLM transcription ----------

export function resolveApiKeyFromEnv() {
  for (const name of ['GLM_API_KEY', 'ZHIPU_API_KEY']) {
    const v = process.env[name]
    if (v && v.trim()) return v.trim()
  }
  return undefined
}

export async function resolveApiKey() {
  const fromEnv = resolveApiKeyFromEnv()
  if (fromEnv) return fromEnv
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
export async function callGlm(model, imageUrl, prompt, key, signal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('transcribe-timeout'), TRANSCRIBE_TIMEOUT_MS)
  const combined = signal === undefined
    ? controller.signal
    : AbortSignal.any([signal, controller.signal])
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              { type: 'text', text: prompt },
            ],
          },
        ],
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

/**
 * Transcribe one attachment reference. Returns the description text, or a
 * "failure marker" string when the image cannot be read or the API fails —
 * the conversation must never stall on a bad image.
 */
export async function transcribeAttachment(attachments, ref, signal) {
  let stored
  try {
    stored = await attachments.readImage(ref, signal)
  } catch (error) {
    return `[图片转译失败: 附件读取错误 ${error?.message ?? error}]`
  }
  const data = stored?.data
  if (!data || data.byteLength === 0) return '[图片转译失败: 空附件]'
  if (data.byteLength > MAX_IMAGE_BYTES) {
    return `[图片转译失败: 图片 ${(data.byteLength / 1048576).toFixed(1)}MB 超过 15MB 上限]`
  }
  const mime = stored.ref?.mediaType ?? ref.mediaType ?? 'image/png'
  const imageUrl = `data:${mime};base64,${Buffer.from(data).toString('base64')}`
  const key = await resolveApiKey()
  if (!key) {
    return '[图片转译失败: 未找到 GLM_API_KEY（请配置智谱 GLM 免费 key）]'
  }
  let lastError
  for (const model of VISION_MODELS) {
    try {
      return (await callGlm(model, imageUrl, PROMPT_BASE, key, signal)).trim()
    } catch (error) {
      lastError = error
    }
  }
  return `[图片转译失败: 所有视觉通道失败 ${lastError?.message ?? ''}]`
}

// ---------- the adapter wrapper ----------

class VisionProxyAdapter extends LlmAdapter {
  constructor(ctx, inner) {
    super()
    this.ctx = ctx
    this.inner = inner
    this.cache = new Map()
  }

  providerInfo(provider) {
    return { id: provider, name: 'DeepSeek + 自动识图' }
  }

  providerRetryPolicy(provider) {
    return this.inner.providerRetryPolicy?.(provider)
  }

  listModels(provider) {
    return this.inner.listModels(provider)
  }

  resolveModel(provider, model, signal) {
    return this.inner.resolveModel(provider, model, signal).then((info) => ({
      ...info,
      provider,
      inputModalities: ['text', 'image'],
    }))
  }

  cacheGet(ref) {
    const hit = this.cache.get(String(ref.attachmentId))
    if (hit !== undefined) return hit
    return undefined
  }

  cacheSet(ref, text) {
    if (this.cache.size >= CACHE_MAX) {
      const first = this.cache.keys().next().value
      if (first !== undefined) this.cache.delete(first)
    }
    this.cache.set(String(ref.attachmentId), text)
  }

  async transcribe(ref, contextText, signal) {
    const cached = this.cacheGet(ref)
    if (cached !== undefined) return cached
    const attachments = this.ctx.get('attachments')
    let text
    if (!attachments) {
      text = '[图片转译失败: 附件服务不可用]'
    } else {
      const prompt = contextText && contextText.trim()
        ? `${PROMPT_BASE}\n用户在消息中同时说：${contextText.slice(0, 2000)}`
        : PROMPT_BASE
      text = await transcribeAttachment(attachments, ref, signal)
    }
    this.cacheSet(ref, text)
    return text
  }

  /** Recursively replace image blocks with transcribed text blocks. */
  async cleanBlocks(blocks, contextText, signal) {
    const out = []
    for (const block of blocks) {
      if (block.type === 'image' && block.attachment) {
        const text = await this.transcribe(block.attachment, contextText, signal)
        out.push({ type: 'text', text })
      } else if (Array.isArray(block.content) && block.content.length > 0) {
        // Nested content (e.g. tool-result blocks carrying read_image output).
        const nested = await this.cleanBlocks(block.content, '', signal)
        out.push({ ...block, content: nested })
      } else {
        out.push(block)
      }
    }
    return out
  }

  async cleanMessages(messages, signal) {
    const out = []
    for (const message of messages) {
      if (!Array.isArray(message.content) || message.content.length === 0) {
        out.push(message)
        continue
      }
      const contextText = message.content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join(' ')
      const content = await this.cleanBlocks(message.content, contextText, signal)
      out.push(content === message.content ? message : { ...message, content })
    }
    return out
  }

  async *stream(options) {
    const messages = await this.cleanMessages(options.messages, options.signal)
    const next = messages === options.messages ? options : { ...options, messages }
    yield* this.inner.stream(next)
  }
}

export function apply(ctx) {
  let registered = false
  const register = () => {
    if (registered) return
    // dsh-llm's registration() throws NO_ADAPTER for a provider whose adapter
    // is not mounted yet (newer DSH); older versions returned undefined. Treat
    // both the same: not mounted yet, so wait for the llm/adapters-updated
    // event below and retry then.
    let inner
    try {
      inner = ctx.llm.registration('deepseek-official')?.adapter
    } catch {
      inner = undefined
    }
    if (!inner) return
    try {
      ctx.llm.registerAdapter(['deepseek-vision'], new VisionProxyAdapter(ctx, inner))
      registered = true
      ctx.logger.info('[vision-proxy-route] deepseek-vision registered (image input declared; GLM transcription)')
    } catch (error) {
      if (error?.code === 'DUPLICATE_ADAPTER') {
        registered = true
        return
      }
      ctx.logger.warn('[vision-proxy-route] registration failed:')
      ctx.logger.warn(error)
    }
  }
  register()
  if (!registered) {
    // The inner DeepSeek adapter may not be mounted yet; wait for the topology
    // event. The listener is disposed automatically with this fiber.
    ctx.on('llm/adapters-updated', register)
  }
}
