# Changelog

本仓库的显著变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]

- 修复：在两个 npm manifest 的标准 `engines.dsh` 字段同步声明 DSH 兼容范围，并补充当前 `0.1.2-rc.1` 精确兼容记录；此前仅写入 `dsh.compatibility` 时，DSH Store 的发现预检会把插件判为未声明兼容性。
- 发布：两个包版本提升到 `0.1.4`，避免 npm 继续提供缺少标准兼容字段的 `0.1.3` 元数据。
- 测试：包级合同测试和一次性 Profile 验收脚本现在强制校验标准字段与当前 DSH 版本记录。

## [dsh-vision-free-eyes@0.1.3 / dsh-vision-proxy-route@0.1.3] - 2026-08-26

### 两个 Bundle

- 修复：移除对 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-attachment`
  和 Cordis 的 optional peer 导入。此前 Profile 安装只会链接 Bundle，ESM 从插件目录解析这些 peer
  时会失败，导致真实 `dsh web` 启动报 `ERR_MODULE_NOT_FOUND`；现在只使用 DSH 注入的结构化服务
  契约，不重复安装、替换或直接导入官方运行时组件。
- 兼容：两个 manifest 明确声明 `>=0.1.0-rc.8 <0.2.0`，并对 `0.1.0-rc.8`、
  `0.1.1-rc.1`、`0.1.1-rc.2` 写入精确 `dshReleases` 兼容记录。
- 测试：CI 对上述三个 DSH 版本逐一创建一次性 Web Profile，验证两个 Bundle 的安装、配置合成、
  真实服务启动和卸载；真实用户 Profile 保持不变。
- 契约：统一 npm、本地安装示例和 Bundle Patch 的插件自有 Entry ID；manifest 明确把已验证范围
  限定为 Web Profile，包级 README/SECURITY 披露文件、网络、命令、凭据、生命周期和证据边界。
- 测试：两个子包新增可直接执行的 `npm test` 入口，便于 DSH STORE 合同审计和 CI 从各自
  `manifestPath` 发现测试；rollback、真实用户 Profile、带真实 Key 的端到端结果和独立安全审计
  保持未验证，不以低层测试替代。

### vision-tool（`dsh-vision-free-eyes`）

- 修复：直接注册 DSH 标准 ToolDefinition，并把 `image` 设为必填、参数对象设为封闭结构；保留工具
  执行前的绝对路径、文件类型和模式校验。

### vision-route（`dsh-vision-proxy-route`）

- 修复：代理路由改用结构化 adapter，不再继承另一个包实例中的 `LlmAdapter`；provider 信息、重试、
  模型枚举、模型解析和流式委派行为保持不变。

## [dsh-vision-free-eyes@0.1.2] - 2026-08-20

### vision-tool / skill（`dsh-vision-free-eyes`）

- 优化：根据真实会话收紧单文件边界；目录路径不再触发底层 `EISDIR`，Skill 禁止先用 shell 预检
  路径，目录错误后必须停止，不以“目录里只有一张图”为例外，除非用户明确要求批量分析。
- 优化：保留定向追问能力，同时让模糊问题保持简洁；GLM 只陈述可确认事实，并区分总数、当前项、
  额外/折叠项和当前页可见条目，区分地址栏、搜索框等界面区域；单一事实问答不再主动附加未经
  询问的位置或上下文，减少计数误读与细节猜测。
- 清理：`vision` 返回纯图片描述，不再向主模型暴露 `[glm | 耗时ms]` 内部诊断标记。

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
