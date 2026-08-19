// 零依赖源码级结构检查：验证 cordis 加载器要求的导出都在。
// 适用于 CI 裸环境（无需安装 @deepseek-ai/* 依赖）。运行：node test-shape.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')
const checks = [
  [/export const name = 'vision-proxy-route'/, 'name 导出'],
  [/export const inject = \['llm'\]/, 'inject=llm 导出'],
  [/export function resolveConfig\(/, 'resolveConfig 导出'],
  [/export function apply\(/, 'apply 导出'],
]
for (const [re, label] of checks) {
  if (!re.test(src)) throw new Error(`缺少 ${label}`)
}
console.log('OK: vision-route 源码声明了 name / inject=llm / resolveConfig / apply')
