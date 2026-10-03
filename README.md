# Mewvis

Mewvis 是面向写作、学习和日常工作的 AI 工作空间，将对话、Agent、工具、技能与应用放在同一个工作区中。项目提供 Tauri 桌面端和 Web 入口，共用 React 前端与 Node.js 后端。

## 功能

- **对话与 Agent**：流式对话、工具调用、技能和多角色协作。
- **内置应用**：应用工坊、故事工坊、学习工坊、文档中心、RSS 阅读器和调试台。
- **应用与插件扩展**：通过 SDK 和开发工具链接入界面、宿主工具与技能，并声明所需权限。
- **本地工作区**：管理文件、会话、知识库和应用数据。

## 快速启动

准备 Node.js 22.19 或更高版本，以及 pnpm 8.15.9。桌面开发还需要 Rust 和 Tauri 2 的平台构建依赖。

在仓库根目录安装依赖并构建上游 AI 包：

```sh
pnpm install --frozen-lockfile
pnpm build:ai
```

启动桌面端：

```sh
pnpm dev:desktop
```

启动 Web 开发环境：

```sh
pnpm dev:web
```

启动后，在设置中配置模型服务与模型，并选择工作区。默认应用数据目录为 `~/.mewvis`。平台准备和打包说明见 [桌面应用开发](docs/guide/desktop.md)。

## 常用命令

以下命令均在仓库根目录执行：

| 命令 | 用途 |
| --- | --- |
| `pnpm build:desktop` | 构建桌面应用 |
| `pnpm build:web` | 构建 Web 前端与后端 |
| `pnpm build:runtime` | 构建 Agent 运行时和内置应用 |
| `pnpm test:server` | 运行后端测试 |
| `pnpm docs:check` | 检查文档目录与链接 |
| `pnpm check:product-config` | 检查产品配置的生成结果 |

## 仓库结构

```text
apps/
  client/          桌面与 Web 共用的 React 前端
  desktop/         Tauri 桌面宿主与打包命令
  server/          Node.js 后端服务
  agent-runtime/   Agent 运行时
  applications/    内置应用
  extensions/      内置宿主插件
packages/          应用 SDK、开发工具链和共享模块
ai/pi/             通过 Git Subtree 引入的上游依赖
docs/              开发文档与技术说明
```

产品名称、数据目录和应用入口文件名统一定义在 [apps/product.config.json](apps/product.config.json)。修改后执行 `pnpm sync-product-config`，再重新构建。

## 文档

- [文档首页](docs/README.md)与 [完整目录](docs/SUMMARY.md)
- [应用开发](docs/apps/development.md)：使用 `app.config.ts` 声明权限、界面与宿主能力
- [插件开发](docs/extensions/development.md)
- [Agent 运行时](docs/runtime/overview.md)
- [Node 后端服务](docs/runtime/server.md)
- [文档维护](docs/guide/documentation.md)

完整中文文档也随应用内「文档中心」提供，可离线阅读。上游代码与第三方资源的说明和许可证保留在各自目录中。
