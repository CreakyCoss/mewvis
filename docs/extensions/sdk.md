# Mewvis Extension SDK

这是外部插件作者协议，不是宿主内部插件协议。原生插件、页面插槽和 Agent 适配器使用独立的[宿主原生插件系统](native-host.md)。SDK 通过 Mewvis 适配器接入宿主。

插件作者面向 Mewvis 协议开发。一个插件包通过 `modules.agent`、`modules.ui` 按需声明能力；Agent 和 UI 分别加载、分别适配。

清单中的 `id` 是稳定标识，供注册和引用使用；可选的 `displayName` 是插件管理界面展示给用户的名称。内置插件均提供展示名称。本地插件未填写时，管理界面回退到包名。

从 [index.d.ts](../../packages/extension/sdk/index.d.ts) 开始阅读：这里实际定义 `ExtensionManifest`、`ExtensionModules` 和共享配置。各领域只有一组目录，类型与相关实现放在一起。

## 当前能提供什么

| 领域  | 能力                                                  | 详细契约                                                                                                          |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Agent | 注册工具、技能、命令                                  | [agent/resources.d.ts](../../packages/extension/sdk/agent/resources.d.ts)                                         |
| Agent | 观察运行、工具、回合、消息及压缩结果事件              | [agent/events.d.ts](../../packages/extension/sdk/agent/events.d.ts)                                               |
| Agent | 干预输入、系统提示、上下文、工具调用/结果、会话压缩   | [agent/middleware.d.ts](../../packages/extension/sdk/agent/middleware.d.ts)                                       |
| Agent | 插件会话状态、压缩请求与结果                          | [agent/session.d.ts](../../packages/extension/sdk/agent/session.d.ts)                                             |
| Agent | 同步 setup、异步激活、资源清理与注册入口              | [agent/index.d.ts](../../packages/extension/sdk/agent/index.d.ts)                                                 |
| UI    | 设置、状态、侧栏、会话操作和弹窗贡献 | [ui/slots.d.ts](../../packages/extension/sdk/ui/slots.d.ts)、[插槽目录](../../packages/extension/sdk/ui/slots.js) |
| Host  | 会话读取、只读账本、一次性摘要、能力协商和标准错误    | [host/services.d.ts](../../packages/extension/sdk/host/services.d.ts)                                             |
| UI    | 浏览器视图挂载、取消信号与清理                        | [ui/browser.d.ts](../../packages/extension/sdk/ui/browser.d.ts)                                                   |

UI 协议定义数据，具体 Slot 约束渲染参数，页面决定布局与展示时机。当前提供 `SidebarSlot`、`TextSlot`、`StatusSlot`、`ActionSlot`、`SettingsSlot` 和 `DialogSlot`；text 是静态结构化文本，可使用默认展示或由页面自行绘制。插件视图的内部内容仍由插件绘制。

## 按需阅读与导入

- `@mewvis/extension-sdk`：统一入口，包含总协议和各领域公开 API。
- `@mewvis/extension-sdk/agent`：Agent 模块定义和 `defineExtension` 等编写辅助函数。
- `@mewvis/extension-sdk/ui`：UI 模块、插槽、浏览器入口、`defineUIExtension` 和 `defineUIContribution`。
- `@mewvis/extension-sdk/host`：外部插件可调用的宿主服务协议与客户端。

```ts
import type { ExtensionManifest } from "@mewvis/extension-sdk";
import { defineExtension } from "@mewvis/extension-sdk/agent";
import { defineUIExtension, uiSlotDefinitions } from "@mewvis/extension-sdk/ui";
```

`shared.d.ts` 是 JSON 等跨领域基础类型。领域内部引用具体契约文件，不反向依赖 SDK 根入口。`host` 是宿主接入协议，不是清单中的可执行插件模块。清单顶层 `host.required/optional` 声明服务需求，插件通过 `ctx.host` 调用；当前由 UI 视图绑定，Agent worker 尚未注入此服务客户端。详见[宿主服务协议与适配](host-services.md)。

## 校验与实现边界

- [manifest.schema.json](../../packages/extension/sdk/manifest.schema.json) 校验插件清单。
- [ui/contribution.schema.json](../../packages/extension/sdk/ui/contribution.schema.json) 校验 UI 插槽与贡献类型，对外路径为 `@mewvis/extension-sdk/ui/contribution.schema.json`。独立使用 Ajv 时先注册此 Schema（ID 为 `urn:mewvis:ui-contribution`），再编译清单 Schema。
- UI 插槽的唯一源定义是 `ui/slots.js`：`uiSlotTypes` 定义各类贡献的必填字段，`uiSlotDefinitions` 定义具体位置与作用域。运行 `pnpm --filter @mewvis/extension-sdk generate` 生成 `ui/slots.generated.d.ts` 与贡献 Schema；`check:ui` 检查生成物漂移。其他领域的类型与 Schema 仍按各自契约维护。
- SDK 的 JS 提供作者辅助和服务客户端；`adapters` 负责转换，`host` 独立实现内部协议、注册、插槽和服务分发。具体 Agent 的原生适配留在自己的目录。

## 定义与页面挂载

```ts
import {
  defineUIContribution,
  uiSlotDefinitions,
} from "@mewvis/extension-sdk/ui";

const overview = defineUIContribution(uiSlotDefinitions.sessionSidebar, {
  id: "overview",
  title: "会话信息",
  icon: "info",
  view: { id: "overview" },
});
```

SDK 作者使用 SDK 定义对象；宿主页面使用独立的宿主定义对象，Mewvis 适配器负责映射。双方都不需要在 TS 中手填 key/type。`package.json` 是序列化清单，仍保存稳定的 `slot`、`type` 字符串；可把上面的结果写入清单，加载时统一执行 Schema 校验。缺失标题、图标或视图引用的 sidebar 贡献会被拒绝。

宿主插槽机制位于 `packages/extension/host/ui/slots/index.tsx`；具体接口位于同目录的 `sidebar.tsx`、`text.tsx` 和 `dialog.tsx`。具体插槽提供默认展示，页面可以省略 `render`，也可以通过它完整替换默认布局（包括返回 `null` 隐藏内容）：

插件数据沿目录 → `ExtensionHost` → `ExtensionSlotProvider` → Slot 流动。`contributions` 仅由宿主注入 Provider，所有 Slot 都不接受这个属性。页面提供位置定义、上下文和渲染函数；页面原有组件无需实现插件协议，渲染函数负责把插件字段适配到页面自己的结构。

```tsx
import { SidebarSlot } from "@mewvis/extension-host/ui/slots/sidebar";
import { UIIcon } from "@mewvis/extension-host/ui/slots/icons";
import { uiSlotDefinitions } from "@mewvis/extension-host/ui";

<SidebarSlot
  definition={uiSlotDefinitions.sessionSidebar}
  context={{ workspacePath, chatId }}
  fallback={<p>暂无内容</p>}
  renderError={(error) => <p role="alert">{error}</p>}
  render={({ title, icon, renderView }) => (
    <article className="my-card">
      <h2>
        <UIIcon name={icon} />
        {title}
      </h2>
      {renderView()}
    </article>
  )}
/>;
```

`title`、`icon`、`view` 等字段直接来自协议；`key` 是宿主添加的唯一标识，`renderView()` 已绑定视图引用和当前会话。宿主图标映射是可选工具，页面也可以用自己的映射。Slot 不添加默认标题栏或布局。同一贡献可以在其他页面使用不同的 `render` 展示，各处视图实例相互独立。

页面先编写原生布局，在需要增强的位置留出 Slot。聊天侧栏使用普通页面组件 `ChatPanels` 与 `ChatPanel`：一个面板只声明一次标题、图标和内容，插件也只需一个 Slot。

```tsx
<ChatPanels defaultValue="files">
  <ChatPanel value="files" title="文件" icon={<FolderIcon />}>
    <WorkspaceFiles workspacePath={workspacePath} />
  </ChatPanel>
  <SidebarSlot
    definition={uiSlotDefinitions.sessionSidebar}
    context={{ workspacePath, chatId }}
    render={({ key, title, icon, renderView }) => (
      <ChatPanel value={key} title={title} icon={<UIIcon name={icon} />}>
        {renderView}
      </ChatPanel>
    )}
  />
</ChatPanels>
```

`ChatPanels` 和 `ChatPanel` 是聊天页面自己的组件，不属于插件 SDK。`ChatPanels` 提供工具栏和内容位置并管理选择；`ChatPanel` 生成按钮，将选中且展开的内容通过 React portal 放到内容位置，保持声明处的 React 上下文。`renderView` 作为延迟函数传入，未选中时不调用，收起或切换时卸载内容。组件不解析 Slot 的子节点，也不重复挂载插件以收集元数据。

布局与选择机制都在 Slot 外部，移除 Slot，原生页面仍然完整。Slot 的渲染函数只把插件贡献适配为普通 `ChatPanel`，不包裹整个页面，也不接收原生面板数据。

需要处理插件集合时可以使用 `renderAll({ items, error })`，例如对扩展区域中的插件条目分组展示。`renderAll` 同样只渲染预留的扩展区域。`render` 与 `renderAll` 必须提供其中一个，不能同时使用；空集合和目录错误也交由页面处理。只有按需渲染 `item.renderView()` 的返回值，插件视图才会挂载。不要在渲染回调里调用 Hook，需要 Hook 时返回独立组件。

没有具体封装时可以从 `@mewvis/extension-host/ui/slots` 导入 `ExtensionSlot`；传入同一份定义，仍能推导完整参数，不退化成任意对象。`SidebarSlot` 只接受 sidebar 定义，`TextSlot` 只接受 text 定义。位置和类型是不同维度，同一种类型可以增加多个位置定义。

结构化数据只由相应协议提供。例如 `TextSlot` 的 `render={({ text, tone }) => ...}` 让页面自由绘制文本，它不提供 `renderView`。当前 sidebar 提供插件视图，尚未额外声明结构化内容；后续按具体业务协议增加精确字段，不使用无约束的通用 `data`。

新增类型的流程是：修改协议源并生成 → 插件声明贡献 → 按需提供具体 Slot → 页面传入 render。无需修改全局适配器注册表。页面不挂载或返回 `null` 就不会展示；只有页面渲染了视图才会执行插件 UI。若新能力需要新的受控服务或执行方式，也必须实现对应宿主服务。


### 弹窗贡献

插件声明 `uiSlotDefinitions.sessionDialog` 对应的贡献，必须提供标题、尺寸（`sm/md/lg`）与视图引用。`ctx.ui.dialog.open({ id: "detail", input: { runId: "..." } })` 打开本插件的弹窗，Promise 在关闭后完成；目标视图通过 `ctx.input` 读取参数，通过 `ctx.ui.dialog.close()` 关闭自身。

宿主在应用根部挂载 `<DialogSlot />`，默认使用统一弹窗容器；需要自定义外壳时传入 `render`。插件通过 `ctx.ui.dialog.available` 判断当前是否有插槽；参数仅接受 64 KiB 以内的 JSON 对象，会话范围由宿主从来源视图继承。当前一次打开一个弹窗，插件停用、更新或来源视图销毁会自动关闭。完整生命周期见[宿主原生插件系统](native-host.md#弹窗插槽)。

`ctx.ui.confirm({ title, description?, confirmText, cancelText?, tone? })` 请求宿主显示小型确认框并返回布尔值；插件只在返回 `true` 后自行执行删除等操作。它不需要新增贡献或声明一个确认弹窗视图，复用应用根部的 `DialogSlot`。关闭、按 Escape、来源视图卸载或插件停用均返回 `false`；当前已有插件弹窗时返回 `UI_BUSY`。

会话操作贡献可声明在 `session.composer-actions` 或 `session.header-actions`，必填 `title`、`icon` 和 `trigger: { kind: "dialog", id: "..." }`；目标必须是同插件声明的 `session.dialog`。宿主提供默认按钮，页面也可以用 `render` 或 `renderAll` 改变显示方式。只有点击时才打开目标视图，贡献本身不会启动 iframe。
