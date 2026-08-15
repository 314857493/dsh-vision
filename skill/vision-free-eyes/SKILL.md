---
name: vision-free-eyes
description: 给纯文本模型补免费视觉。当用户贴图/截图/发图片/PDF，或要求"看/描述/识别"某个图像文件，或 read_image 因模型不支持图像输入而失败时，调用 vision（GLM-4V-flash 免费识图）把图片转成文字描述。
whenToUse: 用户发送或粘贴了图片、截图、图片路径，要求查看/描述/OCR 一个图像或 PDF，或你无法用内置方式看到图像内容时。
---

# vision-free-eyes：免费识图工作流

底层是 `deepseek-free-eyes`（https://github.com/SolicitousMonkey/deepseek-free-eyes），
唯一入口是 `vision` 命令。它用智谱 GLM 免费视觉模型（glm-4v-flash → glm-4.6v-flash → glm-4.1v-thinking-flash 自动降级链）把图片变成文字，给 DeepSeek 这类纯文本模型补上"眼睛"。

## 何时使用

- 用户在对话里**粘贴/发送了图片或截图**，你需要知道图里有什么。
- 用户给了图片/PDF 的**路径**并要求查看、描述、OCR、对比、分析。
- 你尝试 `read_image` 但被拒绝（报错说模型不支持图像输入）时，改用本技能。
- 用户要求识别验证码、UI 截图、图表、报错截图等。

## 步骤

1. **确定图片路径**：
   - 用户直接给了路径 → 直接用。
   - 用户粘贴了图片但你没看到路径 → 在 `$env:DSH_HOME\attachments\v1\objects`（Windows 默认 `C:\Users\<用户名>\.dsh\attachments\v1\objects`）下按修改时间找最新对象；这些文件**没有扩展名**，用文件头魔数判断类型（PNG `89 50 4E 47` / JPEG `FF D8 FF` / GIF `GIF8` / WebP `RIFF....WEBP` / BMP `BM`），必要时复制成带扩展名的临时文件再传给 vision。
   - 找不到 → 用 ask_user_question 请用户给出图片文件路径。

2. **优先用 `vision` 工具**（如果模型目录里有 `vision` 这个原生工具）：
   ```
   vision(image="<绝对路径>", question="<你想问的，中文效果最好>")
   ```
   可选参数：`mode="ocr"`（只要文字）、`mode="doc"`（PDF/文档）、`json=true`（原始 JSON）、`no_cache=true`（跳过本地缓存）。工具在宿主进程里执行，无需提权；CLI 路径可用 `VISION_BIN` 指定，否则按 PATH 找 `vision`。

3. **工具不可用时用 shell 兜底**（以 Windows + `vision` 在 PATH 为例）：
   ```powershell
   vision "<图片路径>" "<问题>"
   # 或 vision ocr "<图片路径>"
   ```
   - 若沙箱拒绝子进程写临时文件（PermissionError / tempfile），在需要时申请提权重试该命令一次并说明理由。
   - `vision` 会自动从环境变量或 Windows 注册表（HKCU\Environment）读取 `GLM_API_KEY` / `ZHIPU_API_KEY`；若报未配置，先 `$env:GLM_API_KEY = [Environment]::GetEnvironmentVariable('GLM_API_KEY','User')`。

4. **解读结果**：输出是图片内容的文字描述，末尾带 `[glm | 耗时ms]` 标记（`[glm-strong | ...]` / `[glm-thinking | ...]` 表示降级链命中）。把描述整合进你的回答。失败时（网络/限流）换 `mode` 或重试。

## 注意

- **隐私**：图片会上传到智谱服务器（open.bigmodel.cn）。敏感图片用 `no_cache=true`；要完全本地可用 `VISION_LOCAL_MODEL`（Ollama）配置。
- **限制**：单图 ≤15MB；`ocr` 走 百度→Windows OCR→MinerU 兜底；`doc` 需要 `mineru-open-api`（npm 全局包）。
- **健康检查**：`vision status` / `vision self-test` 可查通道状态。
- 本地缓存目录 `~/.deepseek-free-eyes/cache`（TTL 7 天）。
