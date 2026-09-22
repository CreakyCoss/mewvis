# Isle Extension SDK

插件作者面向 Isle 协议开发。一个插件包通过 `modules.agent`、`modules.ui` 按需声明能力；Agent 和 UI 分别加载、分别适配。

从 [index.d.ts](../../packages/extension/sdk/index.d.ts) 开始阅读：这里实际定义 `ExtensionManifest`、`ExtensionModules` 和共享配置。各领域只有一组目录，类型与相关实现放在一起。

## 当前能提供什么

| 领域  | 能力                                                  | 详细契约                                                                                                          |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Agent | 注册工具、技能、命令                                  | [agent/resources.d.ts](../../packages/extension/sdk/agent/resources.d.ts)                                         |
| Agent | 观察运行、工具、回合、消息及压缩结果事件              | [agent/events.d.ts](../../packages/extension/sdk/agent/events.d.ts)                                               |
| Agent | 干预输入、系统提示、上下文、工具调用/结果、会话压缩   | [agent/middleware.d.ts](../../packages/extension/sdk/agent/middleware.d.ts)                                       |
| Agent | 插件会话状态、压缩请求与结果                          | [agent/session.d.ts](../../packages/extension/sdk/agent/session.d.ts)                                             |
| Agent | 同步 setup、异步激活、资源清理与注册入口              | [agent/index.d.ts](../../packages/extension/sdk/agent/index.d.ts)                                                 |
| UI    | `session.status` 文本贡献、`session.sidebar` 侧栏贡献 | [ui/slots.d.ts](../../packages/extension/sdk/ui/slots.d.ts)、[插槽目录](../../packages/extension/sdk/ui/slots.js) |
| UI    | 当前会话的公开消息与关联运行读取                      | [ui/services.d.ts](../../packages/extension/sdk/ui/services.d.ts)                                                 |
| UI    | 浏览器视图挂载、取消信号与清理                        | [ui/browser.d.ts](../../packages/extension/sdk/ui/browser.d.ts)                                                   |
| 宿主  | 加载来源、贡献目录、受控调用绑定                      | [host/index.d.ts](../../packages/extension/sdk/host/index.d.ts)                                                   |
| 宿主  | Agent 能力协商、原生适配与降级报告                    | [host/adapter.d.ts](../../packages/extension/sdk/host/adapter.d.ts)                                               |

UI 的协议定义、适配器支持和页面挂载相互独立。当前桌面实现 text/sidebar 适配器，产品页面只挂载 `session.sidebar`；text 为静态纯文本。缺少适配器、空适配器和已支持但未挂载的状态分别报告。

## 按需阅读与导入

- `@isle/extension-sdk`：统一入口，包含总协议和各领域公开 API。
- `@isle/extension-sdk/agent`：Agent 模块定义和 `defineExtension` 等编写辅助函数。
- `@isle/extension-sdk/ui`：UI 模块、插槽、数据服务、浏览器入口、`defineUIExtension` 和 `defineUIContribution`。
- `@isle/extension-sdk/host`：宿主来源/绑定契约，以及 Agent 适配声明与协商函数。

```ts
import type { ExtensionManifest } from "@isle/extension-sdk";
import { defineExtension } from "@isle/extension-sdk/agent";
import { defineUIExtension, uiSlotDefinitions } from "@isle/extension-sdk/ui";
import { defineExtensionAdapter } from "@isle/extension-sdk/host";
```

`shared.d.ts` 是 JSON 等跨领域基础类型。领域内部引用具体契约文件，不反向依赖 SDK 根入口。`host` 是宿主接入协议，不是清单中的可执行插件模块。

## 校验与实现边界

- [manifest.schema.json](../../packages/extension/sdk/manifest.schema.json) 校验插件清单。
- [ui/contribution.schema.json](../../packages/extension/sdk/ui/contribution.schema.json) 校验 UI 插槽与贡献类型，对外路径为 `@isle/extension-sdk/ui/contribution.schema.json`。独立使用 Ajv 时先注册此 Schema（ID 为 `urn:isle:ui-contribution`），再编译清单 Schema。
- UI 插槽的唯一源定义是 `ui/slots.js`：`uiSlotTypes` 定义各类贡献的必填字段，`uiSlotDefinitions` 定义具体位置与作用域。运行 `pnpm --filter @isle/extension-sdk generate` 生成 `ui/slots.generated.d.ts` 与贡献 Schema；`check:ui` 检查生成物漂移。其他领域的类型与 Schema 仍按各自契约维护。
- SDK 的 JS 只提供编写辅助、目录与协商逻辑；包管理位于 `packages/extension/host`，隔离执行位于 Agent Runtime，桌面适配与渲染位于 client。

## 定义、适配与挂载

```ts
import {
  defineUIContribution,
  uiSlotDefinitions,
} from "@isle/extension-sdk/ui";

const overview = defineUIContribution(uiSlotDefinitions.sessionSidebar, {
  id: "overview",
  title: "会话统计",
  icon: "chart",
  view: { id: "overview" },
});
```

作者代码和页面使用同一份定义对象，不再手填插槽 key/type。`package.json` 是序列化清单，仍保存稳定的 `slot`、`type` 字符串；可把上面的结果写入清单，加载时统一执行 Schema 校验。缺失标题、图标或视图引用的 sidebar 贡献会被拒绝。

桌面实现位于 `apps/client/src/extensions/slots/adapters/*.adapter.tsx`。每个文件默认导出 `defineUIAdapter(uiSlotTypes.sidebar, { mode: "supported", component })` 这样的独立声明；Vite 自动发现，重复类型注册直接报错。适配器只决定呈现，页面显式使用 `<UISlot definition={uiSlotDefinitions.sessionSidebar} context={...} />` 才会挂载。

新增类型的流程是：修改协议源并生成 → 插件声明贡献 → 添加适配器文件 → 页面挂载插槽。不需要修改工作台注册表或插件来源的类型分支。适配器可以省略或声明带原因的 `noop`；字段完整性不会因此放宽。若新能力需要新的受控服务或新的执行方式，也必须实现对应宿主服务，不能仅靠声明获得能力。
