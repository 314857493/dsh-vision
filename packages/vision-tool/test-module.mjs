// 离线结构冒烟测试：验证 cordis 加载器要求的模块形态，以及 apply 能注册 `vision` 工具。
// 不需要网络、不需要 GLM key。运行：node test-module.mjs
import { name, inject, apply } from './index.js'

if (name !== 'vision-free-eyes') throw new Error(`unexpected plugin name: ${name}`)
if (!Array.isArray(inject) || !inject.includes('tools')) {
  throw new Error(`inject must include "tools" so ctx.tools is available (got: ${JSON.stringify(inject)})`)
}
if (typeof apply !== 'function') throw new Error('apply must be a function')

const defs = []
apply({ tools: { register: (d) => defs.push(d) } }, {})
const tool = defs.find((d) => d.name === 'vision')
if (!tool) throw new Error('vision tool not registered')
if (typeof tool.execute !== 'function') throw new Error('vision tool missing execute')
if (!tool.parameters?.properties?.image) {
  throw new Error('vision tool must declare the image parameter')
}

console.log(`OK: dsh-vision-free-eyes module shape (name=${name}, inject=${inject.join(',')}, tool=vision)`)
