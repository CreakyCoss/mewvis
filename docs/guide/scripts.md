# 客户端与桌面脚本

`scripts/maintenance/sync-product-config.mjs` 同步前端与桌面的产品配置。`apps/desktop/scripts` 维护 macOS、Windows 桌面打包命令。`apps/client/scripts` 按其余职责组织：

- `packaging/`：共享 Node 后端的资源打包脚本。
- `platform/`：平台能力边界与桌面适配器行为检查。
- `agent-runtime/`：单 Agent 与协作运行时测试。
- `maintenance/`：模型同步等客户端维护脚本。
- `app/host/`：应用宿主和内置应用集成检查。
- `app/chat/`：应用聊天 SDK 构建、契约测试与浏览器验证。
- `chat/`：聊天核心与桌面宿主适配验证。
- `app/dev/`：应用开发工具链与预览验证。
- `docs/`：中文文档索引生成、链接检查与阅读器验证。

故事与酒馆业务测试位于 `apps/applications/builtins/story/test/`；客户端的 `test:story:*` 命令仅转发到该应用。

新增脚本放入职责最接近的目录，通过所属包的 `package.json` 提供稳定命令入口。
