# 应用宿主

`packages/app/host` 是 Mewvis 自己管理的应用边界。Mewvis 定义包发现、清单、启用状态、数据路径、界面贡献和市场来源。Cordis 是负责生命周期及依赖注入的私有运行时内核，DSH 是通过适配器支持的一种兼容格式。

## 运行时分层

```text
ApplicationHost
├── MewvisApplicationAdapter ── mewvis.app entry
├── DshApplicationAdapter  ── dsh.bundle.patch
└── CordisApplicationHost
    ├── tools
    ├── skills
    └── namespaced settings
```

通用调用方使用 `ApplicationHost` 与 `RuntimeApplication`，不构造 DSH 宿主。Agent 协议传递 `resources.applications.items`，每项携带 `kind: "mewvis" | "dsh"`。`DshCompatApplicationHost` 仅作为适配器专项测试和旧程序调用方的兼容别名。

## 原生 Mewvis 包

Mewvis 包通过自己的清单暴露 Cordis 应用入口：

```json
{
  "name": "@mewvis/example",
  "type": "module",
  "mewvis": {
    "app": {
      "version": 1,
      "entry": "./index.js"
    },
    "permissions": ["network", "application-data"]
  }
}
```

入口可以导出 Cordis 函数、类或 `{ apply(ctx, config) }` 对象。作者从 `@mewvis/app-sdk` 导入 `defineApplication`、`defineTool`、`defineSkill`，无需导入 Cordis 或 DSH 服务。Mewvis 上下文提供 Cordis 生命周期语义，以及 `tools`、`skills`、`settings` 服务。

`mewvis.permissions` 声明应用对 `network`、`application-data`、`application-workspaces`、`workspace-files`、`open-external`、`process` 等能力的使用意图。新增原生应用必须声明该字段，不需要能力时填空数组。安装前 Mewvis 校验并展示声明；数据 SDK 对应的宿主接口还会检查声明，未申请的接口直接拒绝。该检查不替代现有文件沙箱和权限档位。工作区与业务存储的接入见 [应用数据 SDK](data.md)。

新安装的原生包缺少该字段会被拒绝；已安装的旧包在清单升级前强制禁用；内置原生包则校验失败。DSH 格式没有等价字段，仍允许导入，但默认禁用，并明确标记为受信任模式的兼容包，不虚构权限。

源码只维护 `mewvis.app` 一份声明。打包器可生成 Mewvis 包或 DSH 兼容包；后者自动生成 `dsh.bundle`、`cordis.patch.yml`，无需手工维护第二份入口。

## 开发流程

默认 React 脚手架由 [应用工程工具链](development.md) 管理。在 `apps/client` 运行 `pnpm app:create -- /absolute/path/my-application --name @example/my-application --local`，然后在新项目安装依赖。工具尚未发布时，`--local` 使用当前检出的 SDK 和工具链。

`pnpm dev` 开发，`pnpm check` 检查，`pnpm build` 构建。页面位于 `main/App.tsx`，可选 Node 工具位于 `main/host/tools.ts`。权限与能力统一在 `app.config.ts` 声明，由其生成安装清单。

`--template tools` 使用 JavaScript 工具／技能模板，它继续在 package.json 声明 `mewvis.app`。`app:validate` 检查原生入口与资源，不求值入口；React 项目会求值受信任的 TS 配置。`app:pack` 将依赖打包到 `dist/<target>`，拒绝覆盖没有 Mewvis 构建标记的目录。

DSH 目标保留附加的 `mewvis` 元数据并生成 DSH 声明。含 `chat` 权限的应用依赖 Mewvis，不能选择 DSH 目标；工具链不会把 React UI 转换成 `dsh.client`。

内置应用由 `apps/applications/registry.json` 中的 `applications` 数组显式登记。数组项是 `apps/applications/builtins` 下的一级目录名，例如 `"story"`。构建按数组顺序校验和打包这些应用，并将登记配置复制到产物根目录；运行时按此顺序展示应用列表和应用管理中的内置应用。默认顺序为应用工坊、故事工坊、学习工坊、文档中心、RSS 阅读器、调试台，六个应用均默认启用。其他应用排在登记应用之后，按应用 ID 排序；外部安装的同 ID 版本沿用原内置应用的位置。旧产物没有登记配置时，沿用按应用 ID 排序。

新增目录后需将目录名加入此配置，未登记的目录不会进入内置应用包。删除条目并重新构建后，该应用也不会随新版 Runtime 发布。配置中允许空数组；目录名重复、应用 ID 重复、目录名无效或目录不存在都会使构建失败。

持久配置使用 SDK 的 `defineSettings`。Schema 默认值是基础层，应用默认值是组合层。桌面宿主按完整应用 ID 隔离 `apps/<namespace>/settings.yaml`，文件内按设置 namespace 保存用户覆盖及 `$version`，同时维护格式标记。工具注册前按序迁移用户层；缺少迁移或版本过新都会明确启动失败。

## 内置调试台

[调试台](builtins/chat-playground.md)以能力展厅展示聊天、工具与技能、权限审批、应用数据与工作区、内嵌视图和宿主集成。每个示例提供运行入口、实际结果与接入代码，并保留共享会话、默认／组合 Chat 和会话检查。它仅打包为 Mewvis 应用，默认启用，但用户保存的启用设置优先。其他原有内置应用保留 DSH 兼容包。示例还提供基于现有 1420 开发服务的预览。

## DSH 兼容

没有 `mewvis.app`、但声明 `dsh.bundle.patch` 的外部包会被识别为 DSH 兼容包。适配器解析可移植的顶层 insert 行、解析包入口，挂载到独立 Cordis 生命周期。完整 DSH 配置、浏览器 Client Runtime、session、shell、agent、LLM 服务均不提供；不支持的服务依赖会明确失败。

独立目录 `dshmarketplace.dev` 注册为 `dsh-community` 市场提供者，不属于 Mewvis 原生市场，也不视为 DeepSeek 官方注册中心。可通过 `DSH_MARKETPLACE_URL` 环境变量配置地址。

## 数据与界面

应用应用根目录保留宿主的 `registry.json` 与共享安装缓存，每个应用的配置、SDK 数据库、默认工作区和外部安装包统一归入完整应用 ID 对应的目录。启动时先完成旧目录和配置迁移，再加载应用；安装包位于 `package/`，可以独立升级和卸载。详见[持久化与工作区](data.md)。包可通过 `mewvis.ui` 增加沙箱页面，详见[应用界面协议](ui.md)。

内置桌面对话不加载应用。应用对话仅加载所属应用，并结合分配的内置工具使用；从宿主历史重新打开仍保留同一归属。

## 独立构建

`packages/app/host` 以私有工作区包 `@mewvis/app-host` 提供宿主 API，Runtime 通过包名导入。执行 `pnpm --filter @mewvis/app-host build` 生成库模块及 `dist/service.mjs`、`dist/migrate-layout.mjs`，不依赖桌面项目的构建命令。

内置应用由 `apps/applications` 中的 `@mewvis/builtin-applications` 包管理，执行 `pnpm --filter @mewvis/builtin-applications build` 输出到该模块的 `dist/`；文档生成脚本位于 `scripts/docs/`。应用 Chat UI 仍由 client 中的共享 React 实现构建。Runtime 构建最后将宿主和内置应用产物复制到自己的 `dist/app-host`、`dist/apps`，保持分发和运行时路径不变。
