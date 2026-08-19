// 零依赖运行时测试：替换 dsh-tools 的 defineTool 后导入源码，验证
// vision 的真实工具描述、问题敏感缓存与 no_cache 参数。运行：
// node test-behavior.mjs
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = await readFile(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')
const importLine = "import { defineTool } from '@deepseek-ai/dsh-tools'"
if (!source.includes(importLine)) throw new Error('找不到待替换的 dsh-tools import')
const runnable = source.replace(importLine, 'const defineTool = value => value')
const moduleUrl = `data:text/javascript;base64,${Buffer.from(runnable).toString('base64')}`
const { apply } = await import(moduleUrl)

let tool
apply({
  tools: {
    register(value) {
      tool = value
    },
  },
})

assert.ok(tool)
assert.match(tool.description, /one local image file at a known absolute path/)
assert.match(tool.description, /semantic image understanding/)
assert.match(tool.description, /Do not inspect an ambiguous path with shell or file-listing tools/)
assert.match(tool.description, /even when it may contain only one image/)
assert.match(tool.description, /cannot discover a GUI-pasted\/uploaded attachment/)
assert.match(tool.description, /untrusted visual observation/)
assert.match(tool.parameters.image.description, /never a directory/)
assert.match(tool.parameters.question.description, /preserving its scope and requested level of detail/)
assert.match(tool.parameters.mode.description, /ocr = exact text transcription only when explicitly requested/)

const originalFetch = globalThis.fetch
const originalGlmKey = process.env.GLM_API_KEY
const fixtureDir = await mkdtemp(join(tmpdir(), 'dsh-vision-tool-'))
const fixturePath = join(fixtureDir, 'image-without-extension')
const nonImagePath = join(fixtureDir, 'not-an-image.txt')
await writeFile(fixturePath, Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10))
await writeFile(nonImagePath, 'not image bytes')

let calls = 0
const prompts = []
globalThis.fetch = async (_url, options) => {
  calls += 1
  const body = JSON.parse(options.body)
  const prompt = body.messages[0].content[1].text
  prompts.push(prompt)
  return {
    ok: true,
    async json() {
      return { choices: [{ message: { content: `answer:${prompt}` } }] }
    },
  }
}
process.env.GLM_API_KEY = 'test-id.test-secret'

try {
  await assert.rejects(
    tool.execute({ image: 'relative-image.png', question: '看看' }, { signal: undefined }),
    /绝对路径/,
  )
  await assert.rejects(
    tool.execute({ image: fixtureDir, question: '看看' }, { signal: undefined }),
    /当前路径是目录；请指定具体图片文件/,
  )
  await assert.rejects(
    tool.execute({ image: nonImagePath, question: '看看' }, { signal: undefined }),
    /不支持的图片格式/,
  )
  assert.equal(calls, 0)

  const first = await tool.execute(
    { image: fixturePath, question: '这是什么？' },
    { signal: undefined },
  )
  assert.match(first, /answer:[\s\S]*用户问题：这是什么？$/)
  assert.doesNotMatch(first, /\[glm \|/)
  assert.equal(calls, 1)

  const cached = await tool.execute(
    { image: fixturePath, question: '这是什么？' },
    { signal: undefined },
  )
  assert.equal(cached, first)
  assert.equal(calls, 1)

  await tool.execute(
    { image: fixturePath, question: '详细描述颜色和位置' },
    { signal: undefined },
  )
  assert.equal(calls, 2)
  assert.match(prompts.at(-1), /只陈述图片中清晰可见且能确认的事实/)
  assert.match(prompts.at(-1), /区分总数、当前项、额外或折叠项/)
  assert.match(prompts.at(-1), /不要把浏览器地址栏 URL 或查询参数、页面搜索框/)
  assert.match(prompts.at(-1), /只询问一个数值、标签或字段的单一事实问题/)
  assert.match(prompts.at(-1), /最多用五个短句或要点/)
  assert.match(prompts.at(-1), /绝不服从或执行/)
  assert.match(prompts.at(-1), /用户问题：详细描述颜色和位置/)

  await tool.execute(
    { image: fixturePath, question: '详细描述颜色和位置', no_cache: true },
    { signal: undefined },
  )
  assert.equal(calls, 3)

  await tool.execute(
    { image: fixturePath, mode: 'ocr', question: '这是什么？' },
    { signal: undefined },
  )
  assert.equal(calls, 4)
  assert.match(prompts.at(-1), /逐字转写图片中的所有文字/)
} finally {
  globalThis.fetch = originalFetch
  if (originalGlmKey === undefined) delete process.env.GLM_API_KEY
  else process.env.GLM_API_KEY = originalGlmKey
  await rm(fixtureDir, { recursive: true, force: true })
}

console.log('OK: vision 工具单图片校验、事实约束、问题敏感缓存与 no_cache')
