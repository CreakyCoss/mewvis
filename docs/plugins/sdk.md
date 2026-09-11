# 插件 SDK

`@isle/plugin-sdk` 是 Isle 插件的公开开发接口。

托管 React 项目使用 [插件工程工具链](development.md)，由其管理启动、预览和构建；业务代码位于 `main/`，`isle.config.ts` 生成下述清单权限。

浏览器业务从 `@isle/plugin-sdk/browser` 导入 `getPluginHost`。`getPluginHost().executeTool(name, args)` 调用本插件的 Node 工具，返回 `{ value, content, meta }`。SDK 使用宿主认证的沙箱桥，不暴露 Tauri，也不要求手写 postMessage。`getHost()` 返回安全元数据与主题；`openExternal()` 需要用户操作触发。模板演示了通过 React 按钮执行真实 Node crypto 工具。

## 权限与生命周期

运行时权限声明在包清单的 `isle.permissions`，不放在 `definePlugin` 中。支持 `network`、`plugin-data`、`workspace-files`、`open-external`、`process`、`chat`、`chat-knowledge`；无需能力时使用空数组。新安装的原生包缺少此字段会失败。安装界面展示这些声明，但声明不替代 Node.js 沙箱。

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

Agent 执行安全由宿主在调用时控制，工具定义不声明权限或风险等级。宿主聊天和插件聊天使用同样的模式与审批流程；无法分类的自定义工具在 `ask`、`auto` 下需要审批。直接执行插件 Node/UI 不属于 Agent 的执行门控，清单权限也独立存在。

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

## 聊天

[插件聊天](chat.md)介绍无界面客户端、默认与组合 React Chat、桌面 `ctx.chat` 接口、权限、生命周期及构建测试。SDK 根入口不会加载聊天 UI；需明确使用 `/chat` 或 `/chat/react` 子入口。
