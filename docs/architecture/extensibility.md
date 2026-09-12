# 应用与宿主插件边界

Isle 将具有独立业务界面、设置、数据和会话的功能称为**应用（Application）**。RSS 阅读器、酒馆、文档中心、场景卡和聊天调试台都属于应用。

**宿主插件（Extension）**用于向宿主现有工作流程贡献工具、技能、命令、上下文或界面扩展。该机制尚未实现；`Extension` / `extension` 命名空间保留给后续建设，不复用应用协议。

## 当前应用命名

| 层次              | 名称                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| 导航与路由        | 应用；`/apps`、`/apps/manage`、`/apps/:applicationId`                  |
| 公共开发包        | `@isle/app-sdk`、`@isle/app-dev`                                       |
| CLI               | `isle-app`；桌面工程中的 `app:create`、`app:validate`、`app:pack`      |
| SDK 工厂与类型    | `defineApplication`、`IsleApplicationContext`、`ApplicationChatClient` |
| 原生安装清单      | `isle.app`；`isle.ui` 继续声明应用界面                                 |
| Node 宿主与内置包 | `apps/desktop/app-host`、`app-host/apps`                               |
| 身份与协议        | `applicationId`、`application` 来源、`application:*` 桥接消息          |
| 数据根目录        | 产品数据目录下的 `apps/`                                               |
| 数据权限          | `application-data`、`application-workspaces`                           |
| 文档              | `docs/apps`                                                            |

本次命名切换是一次性协议更新。旧应用 SDK、清单字段、命令、路由、消息和数据位置不提供别名或自动迁移；已有应用源码和安装产物需要按新协议重新构建。仓库中的布局整理与设置版本迁移继续服务于应用自己的数据格式，不负责读取旧命名的数据根目录。

Tauri、Vite、Lexical、React Markdown、Cordis 等依赖自身的 plugin API，以及 DSH 市场的外部接口，保留上游名称。DSH 适配仍是应用包的一种导入方式，不代表 Isle 已实现宿主插件机制。

## 后续接入边界

宿主插件应使用独立的 `ExtensionHost`、`@isle/extension-sdk` 和明确的安装声明，由自己的加载入口校验。应用加载器不能把缺少 `isle.app` 的原生包推断为宿主插件；也不能把应用中可执行的 Node 入口直接授予宿主扩展权限。

应用会话归属与宿主插件启用列表是不同概念。前者决定谁可以管理会话，后者决定会话可以使用哪些扩展能力。后续应分别建模，保留宿主对权限、工具调用和会话持久化的管理。

同一个发行包未来可以分别声明应用和宿主插件，但需要分别校验、授权和加载。本次改名不增加组合包或宿主插件运行时。
