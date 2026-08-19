# dsh-vision-proxy-route — 贴图自动转译路由（vision-route 包）

给 DeepSeek Harness（DSH）注册一个自动识图包装路由：声明图像输入（`inputModalities: ['text','image']`），
粘贴到 Web GUI 的图片在请求流里被免费的智谱 GLM 视觉模型（glm-4v-flash 降级链）转译成文字，再委派给真正的
目标适配器。默认是 `deepseek-official → deepseek-vision`，也可包裹火山方舟等自定义 provider。
完整说明见仓库根目录的 [README](../../README.md)。

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

- DSH `0.1.0-rc.5` / `rc.6` / `rc.7`（依赖 `ctx.llm.registerAdapter` / `registration(provider).adapter` / `resolveModel.inputModalities` / `ctx.attachments.readImage` 这些插件缝）
- 智谱 GLM 免费 key：环境变量 `GLM_API_KEY` 或 `ZHIPU_API_KEY`（Windows 也可 `setx GLM_API_KEY "id.secret"`，插件自动读注册表）

## 使用

模型选择器切到「DeepSeek + 自动识图」，直接粘贴图片/截图并附带问题即可。后续可用“这张图”
“上一张”“第一张”或“两张图对比”等方式追问；路由会在有限的最近用户轮次内选择对应 attachment，
带上本次问题重新分析，并按顺序编号后注入当前消息。弱指代只关联紧邻图片，无关的“登录页面”
或“这个问题”不会触发旧图重传。主模型不需要 DSH 内部绝对路径，用户也无需重复上传图片。

视觉描述会被标成不可信观察数据；图片里的命令或提示词只作为可见文字，不会成为下游模型指令。
临时网络、Key 或限流错误不会进入缓存，恢复后同一问题可以直接重试。

转译失败会替换为 `[图片转译失败: ...]` 文本，对话不卡死。

## 自定义 provider

目标 provider 须先在 DSH 中配置并可正常完成纯文本请求。然后为本插件设置：

```yaml
- insert:
    - id: dsh-vision-proxy-route-ark
      name: dsh-vision-proxy-route
      config:
        targetProvider: volcengine-ark
        provider: volcengine-ark-vision
        displayName: 火山方舟 + 自动识图
```

| config | 默认值 | 说明 |
|---|---|---|
| `targetProvider` | `deepseek-official` | 真正处理转译后文字请求的 provider |
| `provider` | `deepseek-vision` | 新包装路由的 ID，必须与目标不同 |
| `displayName` | `DeepSeek + 自动识图` | 模型选择器显示名称；自定义目标时默认使用 `<targetProvider> + 自动识图` |

包装路由会在模型枚举、模型解析、重试策略和流请求阶段把自身 provider 映射回 `targetProvider`，
因此可委派给 `dsh-llm-pi-ai` 这类同时服务多个 provider 的适配器。
