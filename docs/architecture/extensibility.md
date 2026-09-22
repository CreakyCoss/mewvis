# 应用与宿主插件边界

Isle 将具有独立业务界面、设置、数据和会话的功能称为**应用（Application）**。RSS 阅读器、酒馆、文档中心、场景卡和聊天调试台都属于应用。

**宿主插件（Extension）**用于向宿主现有工作流程贡献工具、技能、命令、上下文或界面扩展。当前已有[宿主插件 SDK 闭环](../runtime/extensions.md)，支持工具、技能、显式命令、会话状态和 Agent 事件订阅，复用 Chord 装配生命周期，支持 Pi 和脚本 Mock；[独立包](../extensions/development.md)已支持清单、本地注册、配置、启停和开发 CLI。桌面已有插件管理，以及独立 iframe 承载的会话侧栏 UI 插槽；插件清单按 `modules.agent/ui` 分入口，UI 使用受控的会话读取接口。网络安装尚未实现。该机制不复用应用协议。

## 当前应用命名

| 层次              | 名称                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| 导航与路由        | 应用；`/apps`、`/apps/manage`、`/apps/:applicationId`                  |
| 公共开发包        | `@isle/app-sdk`、`@isle/app-dev`                                       |
| CLI               | `isle-app`；桌面工程中的 `app:create`、`app:validate`、`app:pack`      |
| SDK 工厂与类型    | `defineApplication`、`IsleApplicationContext`、`ApplicationChatClient` |
| 原生安装清单      | `isle.app`；`isle.ui` 继续声明应用界面                                 |
| Node 宿主与内置包 | `packages/app/host`、`apps/applications/builtins`              |
| 身份与协议        | `applicationId`、`application` 来源、`application:*` 桥接消息          |
| 数据根目录        | 产品数据目录下的 `apps/`                                               |
| 数据权限          | `application-data`、`application-workspaces`                           |
| 文档              | `docs/apps`                                                            |

本次命名切换是一次性协议更新。旧应用 SDK、清单字段、命令、路由、消息和数据位置不提供别名或自动迁移；已有应用源码和安装产物需要按新协议重新构建。仓库中的布局整理与设置版本迁移继续服务于应用自己的数据格式，不负责读取旧命名的数据根目录。

Tauri、Vite、Lexical、React Markdown、Cordis 等依赖自身的 plugin API，以及 DSH 市场的外部接口，保留上游名称。DSH 适配仍是应用包的一种导入方式，不作为宿主插件加载入口。

## 源码目录归属

应用开发包统一放在 `packages/app/`，各自保留独立包名和发布边界：

```text
packages/
  app/
    sdk/                    # @isle/app-sdk：应用公共契约
    dev/                    # @isle/app-dev：创建、预览和打包
    host/                   # @isle/app-host：Node 应用宿主、协议与构建
  chat-contracts/            # 跨宿主与应用共享的聊天契约
apps/applications/
  builtins/                 # 内置应用源码
  scripts/                  # 应用打包与文档生成
apps/client/
  src/
    api/applications/       # 应用管理、数据和工具 API
    workbench/shell/         # 桌面外壳、侧栏和布局
    workbench/pages/applications/ # 应用页面与沙箱桥
  scripts/app/
    host/                   # 应用宿主集成验证
    dev/                    # 开发预览验证
    chat/                   # 应用聊天构建、契约测试与样例
apps/server/src/modules/applications/ # 应用管理、数据、路径、UI 和工作区
```

目录分组不改变公开包名、应用协议、运行时数据目录或构建产物路径。聊天核心和桌面聊天适配仍位于各自模块；`chat-contracts` 同时服务宿主和应用，保持独立。

宿主插件开发契约位于 `packages/extension/sdk`，包管理和开发工具分别位于 `packages/extension/host`、`packages/extension/dev`，独立示例包位于 `apps/extensions/`。运行时使用 `apps/agent-runtime/src/extensions` 的独立 worker 入口。当前接受宿主指定的本地包或直接入口；完整方向见[插件协议与能力映射](extensions.md)。

## 后续接入边界

宿主插件使用独立的 `@isle/extension-sdk` 和 `isle.extension` 清单，由自己的加载入口校验。应用加载器不能把缺少 `isle.app` 的原生包推断为宿主插件；也不能把应用中可执行的 Node 入口直接授予宿主扩展权限。

应用会话归属与宿主插件启用列表是不同概念。前者决定谁可以管理会话，后者决定会话可以使用哪些扩展能力。后续应分别建模，保留宿主对权限、工具调用和会话持久化的管理。

同一个发行包未来可以分别声明应用和宿主插件，但需要分别校验、授权和加载。目前尚未提供这种组合包。
