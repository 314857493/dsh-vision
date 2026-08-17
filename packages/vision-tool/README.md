# dsh-vision-free-eyes — 免费识图 `vision` 工具（vision-tool 包）

给 DeepSeek Harness（DSH）的纯文本模型补上免费「眼睛」：一个模型可调用的 `vision(image, question)` 工具，
封装 `deepseek-free-eyes` CLI，走智谱 GLM 免费视觉模型（glm-4v-flash → glm-4.6v-flash → glm-4.1v-thinking-flash
自动降级链）。完整说明见仓库根目录的 [README](../README.md)。

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

- `vision` CLI 在 PATH 上（`uv tool install git+https://github.com/SolicitousMonkey/deepseek-free-eyes`），
  或设置环境变量 `VISION_BIN` 指向可执行文件。
- 智谱 GLM 免费 key：环境变量 `GLM_API_KEY` 或 `ZHIPU_API_KEY`（Windows 也可 `setx`，CLI 自动读注册表）。

## 使用

告诉模型图片路径即可，例如："看一下 `D:\xxx\screenshot.png`"。可选参数：`mode="ocr"`（只要文字）、
`mode="doc"`（PDF/文档）、`json=true`、`no_cache=true`。
