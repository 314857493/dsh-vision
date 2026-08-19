# Changelog

本仓库的显著变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]

## [dsh-vision-free-eyes@0.1.1] - 2026-08-20

### vision-tool / skill（`dsh-vision-free-eyes`）

- 修复：Skill 不再让模型遍历 DSH 附件对象目录或按修改时间猜测 GUI 上传图片；自动识图路由已提供
  图片描述时直接回答，只有用户给出已知本地绝对路径时才调用 `vision`。
- 优化：工具描述明确默认 `image` 模式使用完整 GLM 视觉语言模型做语义理解，`ocr` 仅用于用户明确
  要求的逐字转写；缓存改为按图片内容、模式和问题区分，`no_cache=true` 现在会实际绕过缓存。
- 安全：`vision` 在联网前强制要求绝对路径并校验图片文件魔数，拒绝相对路径和非图片内容，避免
  将普通本地文件按 PNG 上传；Skill 同时明确图片文字属于不可信观察数据，不能作为模型指令执行。

## [dsh-vision-proxy-route@0.1.2] - 2026-08-20

### vision-route（`dsh-vision-proxy-route`）

- 新增：通过 `targetProvider`、`provider`、`displayName` 包裹任意已注册的纯文本 provider，
  支持火山方舟等自定义模型路由；默认行为仍为 `deepseek-official → deepseek-vision`。
- 修复：委派给多 provider 适配器时，在模型列表、模型解析、重试策略和流请求阶段完整映射回
  `targetProvider`，避免只改注册目标后仍以包装路由 ID 请求底层适配器。
- 修复：GLM 转译提示词现在会收到同消息中的用户问题，并明确要求输出自然语言事实；下游请求把
  转译内容标记为图片描述，且会将意外返回的 JSON 扁平化，避免 DeepSeek 误判为用户粘贴的 JSON。
  对普通看图问题增加直接作答和不主动搜索的停止条件，避免为猜测具体品牌/来源而过度调用工具；
  图片缓存也改为按“附件 + 用户问题”区分。
- 修复：文字消息明确追问最近一张历史图片时，自动复用原 attachment 引用，以当前追问重新调用
  GLM，并把新图片描述注入当前用户消息；主模型不再需要内部绝对路径，也不会要求用户重复上传。
  普通无关消息不会触发额外识图。
- 修复：多图追问支持“第一张 / 上一张 / 两张对比”，同消息多图会编号；图片引用限制在最近用户
  轮次内，弱指代只匹配紧邻图片，避免把无关的“登录页面 / 这个问题”误判为旧图追问。
- 修复：不再缓存缺 Key、附件服务、网络或限流等失败结果；视觉描述使用不可信数据边界，明确禁止
  执行图片中出现的命令或提示词。
- 测试：新增零依赖运行时覆盖，验证默认兼容、自定义 provider 映射与目标适配器延迟挂载。
- 文档：兼容范围补充 DeepSeek Harness `0.1.0-rc.7`。

## [dsh-vision-proxy-route@0.1.1] - 2026-08-19

### vision-route（`dsh-vision-proxy-route`）

- 修复：兼容新版 DSH——`ctx.llm.registration()` 对未挂载的 provider 现在抛 `NO_ADAPTER`
  异常（旧版返回 `undefined`），会导致插件树加载失败、DSH 无法启动。改为 try/catch
  容错，未挂载时继续等待 `llm/adapters-updated` 事件重试。

## [dsh-vision-free-eyes@0.1.0 / dsh-vision-proxy-route@0.1.0] - 2026-08-17

### vision-tool（`dsh-vision-free-eyes`）

- 首个发布：模型可直接调用的 `vision` 工具（`image` 描述 / `ocr` 取文字），**直连智谱 GLM API，无需任何外部 CLI**。
- GLM 降级链：`glm-4v-flash` → `glm-4.6v-flash` → `glm-4.1v-thinking-flash`。
- 进程内结果缓存（同图同会话只请求一次）；`no_cache` 可绕过。
- Key 解析：`GLM_API_KEY` / `ZHIPU_API_KEY` 环境变量，Windows 自动读注册表 `HKCU\Environment`；config 支持 `apiKeyEnv`。

### vision-route（`dsh-vision-proxy-route`）

- 首个发布：注册 `deepseek-vision` 路由，声明图像输入（`inputModalities: ['text','image']`），
  粘贴到 Web GUI 的图片在请求流里被 GLM 自动转译成文字后，再委派给真正的 DeepSeek 适配器。
- 转译失败优雅降级：替换为 `[图片转译失败: ...]` 文本，对话不卡死。

### 仓库

- 两个包已发布到 npm（`dsh-vision-free-eyes`、`dsh-vision-proxy-route`，均为 0.1.0）。
- 仓库更名为 `314857493/dsh-vision`。
