// vision-tool 冒烟测试（独立运行，不依赖 harness）。
// 用法: node test-run.mjs [图片路径]
// 需要 vision CLI 在 PATH 或设置 VISION_BIN；需要 GLM_API_KEY。
import { apply } from './index.js'

const imagePath = process.argv[2] || ''

const defs = []
const ctx = { tools: { register: (d) => defs.push(d) } }
apply(ctx)
console.log('registered tools:', defs.map((d) => d.name))
const tool = defs.find((d) => d.name === 'vision')
if (!tool) throw new Error('vision tool not registered')

const sig = (ms) => AbortSignal.timeout(ms)

console.log('\n== 1. status ==')
try {
  console.log(await tool.execute({ mode: 'status' }, { signal: sig(30000) }))
} catch (e) {
  console.log('ERROR:', e.message)
}

if (imagePath) {
  console.log(`\n== 2. image (${imagePath}) ==`)
  try {
    console.log(await tool.execute({ image: imagePath, question: '这张图片里有什么？用中文回答。' }, { signal: sig(120000) }))
  } catch (e) {
    console.log('ERROR:', e.message)
  }
}

console.log('\nDONE')
