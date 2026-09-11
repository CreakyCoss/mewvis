# 桌面脚本

`apps/desktop/scripts` 按职责组织：

- `packaging/`：各平台打包与内置运行时资源辅助脚本。
- `agent-runtime/`：单 Agent 与协作运行时测试。
- `business/story/`：小说业务冒烟与端到端检查。
- `business/tavern/`：酒馆冒烟、提示词、运行时与真实模型检查。
- `maintenance/`：配置同步、模型同步等维护脚本。
- `plugin-host/`：插件宿主和内置插件集成检查。
- `chat/`：聊天核心、插件聊天与浏览器验证入口。
- `plugin-dev/`：插件开发工具链与预览验证。
- `docs/`：中文文档索引生成、链接检查与阅读器验证。

新增脚本放入职责最接近的目录，通过 `apps/desktop/package.json` 提供稳定命令入口。
