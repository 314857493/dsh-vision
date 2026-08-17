// 离线结构冒烟测试：验证 cordis 加载器要求的模块形态（name/inject/apply）。
// 不需要网络、不需要 GLM key。运行：node test-module.mjs
import { name, inject, apply } from './index.js'

if (name !== 'vision-proxy-route') throw new Error(`unexpected plugin name: ${name}`)
if (!Array.isArray(inject) || !inject.includes('llm')) {
  throw new Error(`inject must include "llm" (got: ${JSON.stringify(inject)})`)
}
if (typeof apply !== 'function') throw new Error('apply must be a function')

console.log(`OK: dsh-vision-proxy-route module shape (name=${name}, inject=${inject.join(',')})`)
