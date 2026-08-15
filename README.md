# dsh-vision-free-eyes

给 DeepSeek Harness（DSH）里的纯文本模型补上免费「眼睛」：GUI 直接贴图自动转译 + 磁盘图片识图工具 + 使用指引 skill。底层视觉走智谱 GLM 免费模型（glm-4v-flash），无需付费。

Eyes for text-only DeepSeek Harness agents: paste an image in the Web GUI and it just works — the image is transcribed by a free Zhipu GLM vision model before DeepSeek sees the text.

> ⚠️ **需要 GLM key（免费，但必须要有）**：识图走智谱免费模型 `glm-4v-flash`，需要去 [open.bigmodel.cn](https://open.bigmodel.cn) 注册获取免费 API key（格式 `id.secret`），配置为环境变量 `GLM_API_KEY` 或 `ZHIPU_API_KEY`（Windows 可直接 `setx GLM_API_KEY "你的key"`）。**没有 key 时贴图转译会失败**（对话中显示 `[图片转译失败: 未找到 GLM_API_KEY ...]`）。key 只存在于你的环境，不会进代码或仓库。

## 特性

| 组件 | 作用 |
|---|---|
| **deepseek-vision 路由**（`packages/vision-route`） | 注册新模型组「DeepSeek + 自动识图」：声明图像输入（`inputModalities: ['text','image']`），贴图在请求流里被 GLM 自动转译成文字，再委派给真正的 DeepSeek 适配器 |
| **vision 工具**（`packages/vision-tool`） | 模型可对磁盘上的图片路径直接调用的 `vision(image, question)` 工具（封装 `vision` CLI） |
| **vision-free-eyes skill**（`skill/`） | 教模型「何时 / 怎么用」视觉能力的指令文件 |

- 免费默认：智谱 GLM 免费通道（`glm-4v-flash` → `glm-4.6v-flash` → `glm-4.1v-thinking-flash` 自动降级链），只需一个免费申请的 GLM key。
- 官方 DeepSeek 路由**完全不动**：纯文本对话零开销、零改动；贴图时在模型选择器里切到「DeepSeek + 自动识图」即可。
- 无重启热生效：插件行写入 profile 的 `cordis.patch.yml` 后由 `watchUserPatches` 实时重放（见安装步骤；Windows 上插件路径必须用 `file:///` URL）。
- 优雅降级：某个图片转译失败时替换为 `[图片转译失败: ...]` 文本，对话不卡死。

## 架构

```
用户贴图/截图
   │
   ▼
DSH Web GUI 预检（检查所选模型的 inputModalities）
   │  ← deepseek-vision 路由声明了 ['text','image']，放行
   ▼
deepseek-vision 适配器（vision-route）
   │  拦截请求，把每个 { type:'image', attachment } 块：
   │    readImage(ref) → base64 → GLM chat/completions → 文字描述
   │  替换成 { type:'text', text:'[图片转译] …' }
   ▼
真正的 DeepSeek 适配器（deepseek-official，纯文本）
   │
   ▼
DeepSeek 基于文字作答
```

```
磁盘上的图片文件
   │
   ▼
模型调用 vision 工具（vision-tool）
   │  执行 vision.exe（deepseek-free-eyes CLI，含 GLM 降级链 + 本地缓存）
   ▼
文字描述 → 模型整合进回答
```

## 安装

### 前提

- DeepSeek Harness `0.1.0-rc.5` / `rc.6`（本方案在 rc.5 上实测通过）
- [deepseek-free-eyes](https://github.com/SolicitousMonkey/deepseek-free-eyes) CLI（`vision` 工具用；贴图转译路由不依赖它，直接调 GLM API）：
  ```sh
  uv tool install git+https://github.com/SolicitousMonkey/deepseek-free-eyes
  ```
- 智谱 GLM 免费 key（[open.bigmodel.cn](https://open.bigmodel.cn) 注册即得，格式 `id.secret`），配置方式（任选其一）：
  - 环境变量 `GLM_API_KEY` 或 `ZHIPU_API_KEY`；或
  - Windows 用户环境变量（`setx GLM_API_KEY "..."`，插件会自动读注册表 `HKCU\Environment`）

### 步骤

1. 把 `packages/vision-tool` 和 `packages/vision-route` 放到你的机器上（例如 `D:\tools\`）。

2. 编辑 profile patch（`$DSH_HOME/profiles/web/cordis.patch.yml`，即 `C:\Users\<你>\.dsh\profiles\web\cordis.patch.yml`），追加：
   ```yaml
   - insert:
       - id: tool-vision
         name: file:///D:/tools/vision-tool/index.js
       - id: vision-proxy-route
         name: file:///D:/tools/vision-route/index.js
   ```
   > ⚠️ **Windows 必须用 `file:///` URL 形式**：DSH 的 Loader 用原生 `import()` 加载插件行，`D:/xxx` 盘符路径会报 `ERR_UNSUPPORTED_ESM_URL_SCHEME`。Linux/macOS 用 `/abs/path/to/index.js` 即可。完整模板见 [`cordis.patch.example.yml`](cordis.patch.example.yml)。

3. 安装 skill（可选但推荐）：把 `skill/vision-free-eyes/` 复制到 `$DSH_HOME/skills/`（即 `C:\Users\<你>\.dsh\skills\`）。

4. 生效方式（二选一）：
   - **热生效**：patch 由 `watchUserPatches` 实时重放，改完等 1~2 秒即可；刷新浏览器页面让模型选择器加载新组。
   - 或重启 `dsh web`（修改插件代码后必须重启，Loader 对同名模块复用旧导出）。

5. 验证：
   ```sh
   dsh --profile web --dump-config | grep -A2 vision
   ```
   应看到两个插件行；浏览器刷新后模型选择器出现「DeepSeek + 自动识图」。

## 使用

1. 聊天框右下角**模型选择器**选 **「DeepSeek + 自动识图」**（原 DeepSeek 组保留不动）。
2. **直接粘贴图片 / 截图**并附带问题，或给出图片文件路径。
3. DeepSeek 基于转译文字作答。

`vision` 工具（任何路由都可用）：让模型"看一下 `D:\xxx\screenshot.png`"即可，或直接告诉模型图片路径。

## 配置

### vision-route（`packages/vision-route/index.js`）

| 常量 | 默认 | 说明 |
|---|---|---|
| `API_URL` | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | GLM OpenAI 兼容端点 |
| `VISION_MODELS` | `glm-4v-flash → glm-4.6v-flash → glm-4.1v-thinking-flash` | 转译降级链 |
| `TRANSCRIBE_TIMEOUT_MS` | `60000` | 单次转译超时 |
| `MAX_IMAGE_BYTES` | `15MB` | GLM 单图上限 |
| `PROMPT_BASE` | 中文结构化描述提示词 | 可改（如改成纯段落描述） |
| 缓存 | 按 `attachmentId` 进程内缓存，上限 200 条 | 同图只转译一次 |

### vision-tool（`packages/vision-tool/index.js`）

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `VISION_BIN` | `vision`（PATH 查找） | vision CLI 可执行文件路径 |
| `GLM_API_KEY` / `ZHIPU_API_KEY` | — | GLM key（vision CLI 也会自行读 Windows 注册表） |

## 兼容性

- 实测：DSH `0.1.0-rc.5`（Windows）。
- 设计兼容：rc.6（与 dsh-vision-proxy 相同的公开缝：`ctx.llm.registerAdapter` / `resolveModel.inputModalities` / `ctx.llm.registration(provider).adapter` / `ctx.attachments.readImage`）。
- ⚠️ 这些是 DSH 的**半稳定插件缝**，后续大版本可能变动；升级 DSH 后若失效，优先检查上述 API 是否改名。

## 隐私

- 图片字节会上传到智谱服务器（open.bigmodel.cn）进行转译。
- 未配置任何 key 或转译失败时，会以 `[图片转译失败: ...]` 占位并继续对话，不会静默卡死。
- 会话历史中只存转译后的文字，不存图片字节（DSH 附件存储除外）。

## 致谢

- [deepseek-free-eyes](https://github.com/SolicitousMonkey/deepseek-free-eyes) —— `vision` CLI（工具插件的执行后端），MIT。
- 智谱 GLM 免费视觉模型（glm-4v-flash 系列）。
- DeepSeek Harness 插件体系（profile patch / `watchUserPatches` / `ctx.llm`）。

## License

[MIT](LICENSE)
