---
name: vision-free-eyes
description: 给纯文本模型补免费视觉。当用户贴图/截图/发图片，或要求"看/描述/识别"某个图像文件，或 read_image 因模型不支持图像输入而失败时，调用 vision（GLM-4V-flash 免费识图）把图片转成文字描述。
whenToUse: 用户发送或粘贴了图片、截图、图片路径，要求查看/描述/OCR 一个图像，或你无法用内置方式看到图像内容时。
---

# vision-free-eyes：免费识图工作流

`vision` 工具直连智谱 GLM 免费视觉 API（glm-4v-flash → glm-4.6v-flash → glm-4.1v-thinking-flash 自动降级链），
无需安装任何外部 CLI，只需环境里有 `GLM_API_KEY`（或 `ZHIPU_API_KEY`）。

## 何时使用

- 用户在对话里**粘贴/发送了图片或截图**，你需要知道图里有什么。
- 用户给了图片的**路径**并要求查看、描述、OCR、对比、分析。
- 你尝试 `read_image` 但被拒绝（报错说模型不支持图像输入）时，改用本技能。
- 用户要求识别验证码、UI 截图、图表、报错截图等。

## 步骤

1. **确定图片路径**：
   - 用户直接给了路径 → 直接用。
   - 用户粘贴了图片但你没看到路径 → 在 `$env:DSH_HOME\attachments\v1\objects`（Windows 默认 `C:\Users\<用户名>\.dsh\attachments\v1\objects`）下按修改时间找最新对象；这些文件**没有扩展名**，没关系，`vision` 工具会自动按文件头识别类型。
   - 找不到 → 用 ask_user_question 请用户给出图片文件路径。

2. **调用 `vision` 工具**（如果模型目录里有 `vision` 这个原生工具）：
   ```
   vision(image="<绝对路径>", question="<你想问的，中文效果最好>")
   ```
   可选参数：`mode="ocr"`（只提取图中文字）、`no_cache=true`（跳过进程内缓存）。工具在宿主进程里执行，无需提权。

3. **工具不可用时**：让用户在模型选择器里切到「DeepSeek + 自动识图」再贴图；或请用户给出图片文件路径。

4. **解读结果**：输出是图片内容的文字描述，末尾带 `[glm | 耗时ms]` 标记。把描述整合进你的回答。失败时（网络/限流/缺 key）重试或换 `mode`。

## 注意

- **隐私**：图片会上传到智谱服务器（open.bigmodel.cn）；本工具只在进程内缓存文本结果。
- **限制**：单图 ≤15MB；仅支持图片（png/jpg/jpeg/webp/gif/bmp），不支持 PDF。
- **缺 key**：报错会提示"未找到 GLM_API_KEY"，请用户配置（Windows 可 `setx GLM_API_KEY "id.secret"` 后重启 DSH）。
