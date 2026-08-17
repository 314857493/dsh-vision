# Changelog

本仓库的显著变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [0.1.0] - 2026-08-17

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
