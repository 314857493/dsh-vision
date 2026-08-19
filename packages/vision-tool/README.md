# dsh-vision-free-eyes — 免费识图 `vision` 工具（vision-tool 包）

给 DeepSeek Harness（DSH）的纯文本模型补上免费「眼睛」：一个分析已知本地图片路径的
`vision(image, question)` 工具，
**直连智谱 GLM 免费视觉 API**（glm-4v-flash → glm-4.6v-flash → glm-4.1v-thinking-flash 自动降级链），
不依赖任何外部 CLI。完整说明见仓库根目录的 [README](../README.md)。

## 安装（发布后）

```sh
dsh plugin --profile web add dsh-vision-free-eyes
```

或在 profile 的 `cordis.patch.yml` 中追加：

```yaml
- insert:
    - id: dsh-vision-free-eyes
      name: dsh-vision-free-eyes
```

## 前提

- **必须**：智谱 GLM 免费 key，环境变量 `GLM_API_KEY` 或 `ZHIPU_API_KEY`
  （[open.bigmodel.cn](https://open.bigmodel.cn) 注册即得，格式 `id.secret`；Windows 也可 `setx`，插件自动读注册表）。
- 出站 HTTPS 到 `open.bigmodel.cn`。

## 使用

告诉模型图片的已知绝对路径即可，例如："看一下 `D:\xxx\screenshot.png`"。默认 `image` 模式使用
完整 GLM 视觉语言模型理解图片并回答 `question`；只有用户明确要求逐字提取时才用 `mode="ocr"`。
`no_cache=true` 可跳过进程内结果缓存。

工具会在联网前强制检查绝对路径和图片文件魔数；相对路径以及非 png/jpeg/webp/gif/bmp 内容会
直接拒绝，不会把普通本地文件伪装成图片上传。

该工具不会自动解析 GUI 粘贴/上传附件，也不应遍历 DSH 附件目录猜测图片路径。GUI 贴图请使用
「… + 自动识图」路由；路由已经提供图片描述时，模型应直接使用描述，不要再次调用本工具。
输出为图片内容的文字描述，末尾带 `[glm | 耗时ms]` 标记。

## 配置

| config | 默认 | 说明 |
|---|---|---|
| `apiKeyEnv` | `GLM_API_KEY` / `ZHIPU_API_KEY` | GLM key 的环境变量名（可传数组） |
| `no_cache` | `false` | 跳过进程内结果缓存，强制重新请求 |

## 限制

- 单图 ≤ 15MB；支持 png/jpg/jpeg/webp/gif/bmp。
- 不支持 PDF（`doc` 模式已移除）；图片字节会上传到智谱服务器。
