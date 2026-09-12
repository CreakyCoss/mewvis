# 插件 SDK

`@isle/plugin-sdk` 是 Isle 插件的公开开发接口。

托管 React 项目使用 [插件工程工具链](development.md)，由其管理启动、预览和构建；业务代码位于 `main/`，`isle.config.ts` 生成下述清单权限。

浏览器业务从 `@isle/plugin-sdk/browser` 导入 `getPluginHost`。`getPluginHost().executeTool(name, args)` 调用本插件的 Node 工具，返回 `{ value, content, meta }`。SDK 使用宿主认证的沙箱桥，不暴露 Tauri，也不要求手写 postMessage。`getHost()` 返回安全元数据与主题；`openExternal()` 需要用户操作触发。模板演示了通过 React 按钮执行真实 Node crypto 工具。

## 权限与生命周期

权限声明在包清单的 `isle.permissions`，不放在 `definePlugin` 中。支持 `network`、`plugin-data`、`plugin-workspaces`、`workspace-files`、`open-external`、`process`、`chat`、`chat-knowledge`；无需能力时使用空数组。新安装的原生包缺少此字段会失败。安装界面展示这些声明供用户审核，对应 SDK 宿主接口检查所需权限；声明不替代现有沙箱。

插件通过 Isle 上下文中的 `tools`、`skills`、`settings` 使用 Cordis 生命周期和依赖注入，无需直接导入 Cordis 或 DeepSeek Harness 服务包。

```js
import { definePlugin, defineTool, schema } from "@isle/plugin-sdk";

export default definePlugin({
  name: "@example/hello",
  inject: ["tools"],
  apply(ctx) {
    ctx.tools.register(
      defineTool({
        name: "hello",
        description: "返回问候语。",
        risk: "low",
        parameters: { type: "object", properties: {} },
        output: {
          schema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
            additionalProperties: false,
          },
          render: (_args, value) => [{ type: "text", text: value.message }],
        },
        execute: () => ({ message: "hello" }),
      }),
    );
  },
});
```

工具通过 `risk: "low" | "medium" | "high"` 声明其最高操作风险，`defineTool` 和工具链检查会拒绝缺失或无效的声明。纯计算、读取可声明低风险，普通数据修改声明中风险，删除、执行程序等声明高风险；包含多种操作的工具按最高风险声明，也可以拆分为独立工具。

用户启用插件并允许工具后，Agent 从已注册定义读取风险，按统一档位审批：`ask` 自动通过低风险，`auto` 自动通过低、中风险，`full` 自动通过全部已声明风险。超过档位上限仍需审批；调用参数不能覆盖声明。未声明风险的外部工具仍按未知操作处理。宿主文件、Shell 工具继续根据实际参数分析，不由静态声明替代。

已启用插件的初始化不再单独请求 `plugins.load` 审批。初始化和 Agent 工具实现运行于同一受限执行进程，风险声明不会扩大 `agentAccess` 或沙箱范围，也不能覆盖明确的拒绝规则。直接执行插件 Node/UI 不属于 Agent 的执行门控，清单权限仍独立检查。

## 版本化设置

SDK 导出 Isle 的设置 `schema` 构建器，具体实现仍属于宿主内部契约。版本化设置将 Schema 默认值、插件默认值、持久化用户覆盖分开保存：

```js
import { defineSettings, schema } from "@isle/plugin-sdk";

const settings = defineSettings({
  namespace: "example-plugin",
  version: 2,
  schema: schema.object({ endpoint: schema.string().default("") }),
  defaults: { endpoint: "https://example.com" },
  migrations: {
    1: (user) => user,
    2: (user) => ({ ...user, endpoint: user.url ?? user.endpoint }),
  },
});

export async function apply(ctx) {
  const values = await settings.register(ctx);
  console.log(values.get().endpoint);
}
```

迁移 `N` 将原始用户层从版本 `N-1` 转为 `N`。保留字段 `$version` 与数据存放在 `plugins/<namespace>/settings.yaml`，但插件读取时不可见。旧插件遇到新 Schema 写入的数据会拒绝加载，不会静默降级。

使用 Isle 工具链验证并打包源码。DSH 目标将 SDK 内联到产物并生成 Cordis 补丁，同一份插件源码可以分发给两类宿主。

## 业务存储与插件工作区

`@isle/plugin-sdk/data` 提供插件独立的持久化键值存储，以及工作区新增与查询；桌面插件页面和原生 PluginHost 已接入宿主落库服务。两类接口分别要求 `plugin-data`、`plugin-workspaces`。工作区使用与宿主遵循相同的文件操作规则，SDK 不修改 Agent／Pi 流程或增加文件访问限制。详见 [插件数据与工作区 SDK](data.md)。

## 聊天

[插件聊天](chat.md)介绍无界面客户端、默认与组合 React Chat、桌面 `ctx.chat` 接口、权限、生命周期及构建测试。SDK 根入口不会加载聊天 UI；需明确使用 `/chat` 或 `/chat/react` 子入口。
