# dsh-vision-proxy-route — 贴图自动转译路由（vision-route 包）

给 DeepSeek Harness（DSH）注册一个 `deepseek-vision` 路由：声明图像输入（`inputModalities: ['text','image']`），
粘贴到 Web GUI 的图片在请求流里被免费的智谱 GLM 视觉模型（glm-4v-flash 降级链）转译成文字，再委派给真正的
DeepSeek 适配器。完整说明见仓库根目录的 [README](../README.md)。

## 安装（发布后）

```sh
dsh plugin --profile web add dsh-vision-proxy-route
```

或在 profile 的 `cordis.patch.yml` 中追加：

```yaml
- insert:
    - id: dsh-vision-proxy-route
      name: dsh-vision-proxy-route
```

## 前提

- DSH `0.1.0-rc.5` / `rc.6`（依赖 `ctx.llm.registerAdapter` / `registration(provider).adapter` / `resolveModel.inputModalities` / `ctx.attachments.readImage` 这些插件缝）
- 智谱 GLM 免费 key：环境变量 `GLM_API_KEY` 或 `ZHIPU_API_KEY`（Windows 也可 `setx GLM_API_KEY "id.secret"`，插件自动读注册表）

## 使用

模型选择器切到「DeepSeek + 自动识图」，直接粘贴图片/截图并附带问题即可；转译失败会替换为 `[图片转译失败: ...]` 文本，对话不卡死。
