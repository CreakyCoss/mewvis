# 插件宿主

`apps/desktop/plugin-host` 是 Isle 自己管理的插件边界。Isle 定义包发现、清单、启用状态、数据路径、界面贡献和市场来源。Cordis 是负责生命周期及依赖注入的私有运行时内核，DSH 是通过适配器支持的一种兼容格式。

## 运行时分层

```text
PluginHost
├── IslePluginAdapter ── isle.plugin entry
├── DshPluginAdapter  ── dsh.bundle.patch
└── CordisPluginHost
    ├── tools
    ├── skills
    └── namespaced settings
```

通用调用方使用 `PluginHost` 与 `RuntimePlugin`，不构造 DSH 宿主。Agent 协议传递 `resources.plugins.items`，每项携带 `kind: "isle" | "dsh"`。`DshCompatPluginHost` 仅作为适配器专项测试和旧程序调用方的兼容别名。

## 原生 Isle 包

Isle 包通过自己的清单暴露 Cordis 插件入口：

```json
{
  "name": "@isle/example",
  "type": "module",
  "isle": {
    "plugin": {
      "version": 1,
      "entry": "./index.js"
    },
    "permissions": ["network", "plugin-data"]
  }
}
```

入口可以导出 Cordis 函数、类或 `{ apply(ctx, config) }` 对象。作者从 `@isle/plugin-sdk` 导入 `definePlugin`、`defineTool`、`defineSkill`，无需导入 Cordis 或 DSH 服务。Isle 上下文提供 Cordis 生命周期语义，以及 `tools`、`skills`、`settings` 服务。

`isle.permissions` 声明插件对 `network`、`plugin-data`、`plugin-workspaces`、`workspace-files`、`open-external`、`process` 等能力的使用意图。新增原生插件必须声明该字段，不需要能力时填空数组。安装前 Isle 校验并展示声明；数据 SDK 对应的宿主接口还会检查声明，未申请的接口直接拒绝。该检查不替代现有文件沙箱和权限档位。工作区与业务存储的接入见 [插件数据 SDK](data.md)。

新安装的原生包缺少该字段会被拒绝；已安装的旧包在清单升级前强制禁用；内置原生包则校验失败。DSH 格式没有等价字段，仍允许导入，但默认禁用，并明确标记为受信任模式的兼容包，不虚构权限。

源码只维护 `isle.plugin` 一份声明。打包器可生成 Isle 包或 DSH 兼容包；后者自动生成 `dsh.bundle`、`cordis.patch.yml`，无需手工维护第二份入口。

## 开发流程

默认 React 脚手架由 [插件工程工具链](development.md) 管理。在 `apps/desktop` 运行 `pnpm plugin:create -- /absolute/path/my-plugin --name @example/my-plugin --local`，然后在新项目安装依赖。工具尚未发布时，`--local` 使用当前检出的 SDK 和工具链。

`pnpm dev` 开发，`pnpm check` 检查，`pnpm build` 构建。页面位于 `main/App.tsx`，可选 Node 工具位于 `main/host/tools.ts`。权限与能力统一在 `isle.config.ts` 声明，由其生成安装清单。

`--template tools` 使用 JavaScript 工具／技能模板，它继续在 package.json 声明 `isle.plugin`。`plugin:validate` 检查原生入口与资源，不求值入口；React 项目会求值受信任的 TS 配置。`plugin:pack` 将依赖打包到 `dist/<target>`，拒绝覆盖没有 Isle 构建标记的目录。

DSH 目标保留附加的 `isle` 元数据并生成 DSH 声明。含 `chat` 权限的插件依赖 Isle，不能选择 DSH 目标；工具链不会把 React UI 转换成 `dsh.client`。

应用构建按目录名稳定排序，自动发现、校验和打包 `plugin-host/plugins` 下所有一级插件目录，新增内置插件无需修改注册列表。

持久配置使用 SDK 的 `defineSettings`。Schema 默认值是基础层，插件默认值是组合层。桌面宿主按完整插件 ID 隔离 `plugins/<namespace>/settings.yaml`，文件内按设置 namespace 保存用户覆盖及 `$version`，同时维护格式标记。工具注册前按序迁移用户层；缺少迁移或版本过新都会明确启动失败。

## 内置聊天调试台

[聊天调试台](builtins/chat-playground.md)演示工作区选择、共享会话、默认与组合 Chat、自定义样式和会话检查。它仅打包为 Isle 插件，默认启用，但用户保存的启用设置优先。其他原有内置插件保留 DSH 兼容包。示例还提供基于现有 1420 开发服务的预览。

## DSH 兼容

没有 `isle.plugin`、但声明 `dsh.bundle.patch` 的外部包会被识别为 DSH 兼容包。适配器解析可移植的顶层 insert 行、解析包入口，挂载到独立 Cordis 生命周期。完整 DSH 配置、浏览器 Client Runtime、session、shell、agent、LLM 服务均不提供；不支持的服务依赖会明确失败。

独立目录 `dshmarketplace.dev` 注册为 `dsh-community` 市场提供者，不属于 Isle 原生市场，也不视为 DeepSeek 官方注册中心。可通过 `DSH_MARKETPLACE_URL` 环境变量配置地址。

## 数据与界面

应用插件根目录保留宿主的 `registry.json` 与共享安装缓存，每个插件的配置、SDK 数据库、默认工作区和外部安装包统一归入完整插件 ID 对应的目录。启动时先完成旧目录和配置迁移，再加载插件；安装包位于 `package/`，可以独立升级和卸载。详见[持久化与工作区](data.md)。包可通过 `isle.ui` 增加沙箱页面，详见[插件界面协议](ui.md)。

内置桌面对话不加载插件。插件对话仅加载所属插件，并结合分配的内置工具使用；从宿主历史重新打开仍保留同一归属。
