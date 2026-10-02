# 应用界面协议

`isle.ui` 是 Isle 为原生和兼容应用定义的 UI 扩展，与 `dsh.client` 独立。双目标包可以同时携带两份 UI 声明，继续向 DSH 生态分发。

机器可读定义位于 [isle-ui.schema.json](../../packages/app/host/schema/isle-ui.schema.json)。

React 项目可使用 [应用工程工具链](development.md)：页面从 `main/App.tsx` 导出，工具与技能通过 `host.tools` / `host.skills` 指向 `main/host/tools.ts` 和 `main/host/skills.ts`，权限和 UI 设置放入 `isle.config.ts`。工具链生成下列 JS 入口与清单，浏览器通过 SDK 的 `getApplicationHost()` 调用本应用工具，无需手写桥接代码。

## 应用自有页面

一个界面由包内 JS 入口及可选样式表构成。Isle 管理应用目录、导航、沙箱、权限桥与通用工具兜底页面；应用负责业务标记、样式与交互。

```json
{
  "isle": {
    "app": { "version": 1, "entry": "./index.js" },
    "ui": {
      "version": 1,
      "kind": "sandbox",
      "entry": "./isle-ui.js",
      "style": "./isle-ui.css",
      "title": "我的应用"
    }
  }
}
```

源码只维护 `isle` 声明。在 `apps/client` 运行 `pnpm app:pack -- <package> --target dsh`，会保留 UI 元数据，并在分发包增加 `dsh.bundle` 和 `cordis.patch.yml`。

路径必须以 `./` 开头，解析后位于包内，不得经符号链接越界。

内置与外部应用的自带界面统一铺满常驻导航栏之外的应用工作区，无需声明布局。宿主不显示应用详情栏或沙箱卡片边框，窗口顶部保留 40 px 拖动区域，应用可通过公共顶栏接口复用这一区域显示标题与返回入口，通过常驻导航栏切换页面。应用加载失败时，宿主显示错误信息；UI 声明无效或未提供自带界面时，使用通用工具页面。

未声明 `isle.ui` 时，Isle 根据工具 JSON Schema 生成通用表单，因此只有自定义流程才需要自带界面。

宿主先安装桥，再执行入口。页面可操作 iframe 内 DOM，仅能调用同一应用注册的工具：

```js
const response = await window.isleApplication.executeTool("my_tool", {
  input: "value",
});
console.log(response.value);
```

`executeTool()` 返回 `{ value, content, meta }`。桥还提供：

- `window.isleApplication.version`：当前为 `1`。
- `window.isleApplication.getHost()`：最近一次宿主描述，包括安全的应用元数据、`light` / `dark` 主题与工具 Schema。
- `window.isleApplication.header`：可选的宿主顶栏接口，旧宿主和独立开发预览可能不提供。`header.set({ title, backLabel?, backDisabled? })` 显示 32 px 高的紧凑导航组，包含纯文本标题和可选返回按钮：macOS 放在覆盖式 40 px 顶栏的最右侧；Windows/Linux 和 Web 放在内容区内 40 px 导航行的左侧，不覆盖原生窗口按钮。返回 `{ supported }`；仅在 supported 为 true 后收起应用自己的 header。标题最多 160 字符，返回文案最多 80 字符。`header.subscribe(action => …)` 订阅 `"back"` 操作并返回取消订阅函数，应用自行处理内部导航；`header.set(null)` 清空本 frame 的顶栏。离开应用、重新加载或 frame 离开沙箱时宿主自动清理，macOS 顶栏空白处继续支持拖动窗口。该接口不提供自定义 HTML、窗口拖动或其他应用的导航能力。
- `window.isleApplication.openExternal(url)`：由用户操作触发，请求宿主用系统浏览器打开 HTTP(S) 地址，其他协议会被拒绝。
- `window.isleApplication.writeClipboardText(text)`：从用户点击操作复制文本，上限 256 KiB，不提供剪贴板读取。共享 Chat 消息与故事酒馆使用 SDK 的同名辅助函数，独立预览回退到浏览器剪贴板。
- `isle:ready`：收到宿主描述后触发的窗口事件。
- `isle:theme`：应用主题变化时触发的窗口事件。

## 隔离与限制

沙箱使用不透明源和固定 CSP：

- 禁止 fetch 及图片、媒体、字体、frame、object 等外部资源；声明 `embedded-views` 的应用页面仅额外允许本地内嵌视图。
- 不授予表单、弹窗、下载、同源访问和顶层导航能力。
- 允许内联脚本和 CSS，是因为受审计的宿主文档直接嵌入包资源。
- 工具参数必须是 JSON 对象，上限 256 KiB；每个 frame 最多同时调用四个工具。
- 浏览器桥和 Node 宿主都会复核工具归属。

iframe 离开宿主文档后不再展示界面。JS 入口上限 8 MiB，样式表上限 2 MiB（图片、字体内联后的实际大小）。只有 UI 文档读取响应允许 24 MiB，以容纳内联资源及 JSON 编码开销；普通应用工具响应仍限制为 4 MiB，普通 HTTP 响应仍限制为 16 MiB。UI 加载或执行失败不影响工具与技能；无效 UI 声明回退到通用工具台。

浏览器沙箱隔离 DOM 与应用权限，不会将安装包变为不可信数据。宿主侧 Cordis 入口是可执行 Node.js 代码，必须来自受信任来源。

## 内嵌沙箱视图

应用工坊等容器应用可以加载自己管理的 JS/CSS 构建产物，无需将每个小应用安装到 Isle 应用列表。创建项目、源码编辑、编译、版本与业务数据管理仍由容器应用负责。宿主只提供浏览器视图隔离与通信，不导入生成的 Node 入口。

在 `isle.config.ts` 的 `permissions` 中声明 `"embedded-views"`。已声明并启用的应用页面获得 `getApplicationHost().views`，CSP 的 `frame-src` 仅允许 `blob:`；普通应用保持 `frame-src 'none'`。每个子视图通过 `srcdoc` 载入，使用 `sandbox="allow-scripts"` 与不透明源，并设置自己的严格 CSP，禁止网络及外部资源；子视图不获得应用宿主或视图挂载接口。该载入方式兼容 WebKit 对沙箱 Blob 导航的限制。

容器应用挂载示例：

```ts
import { mountApplicationView } from "@isle/app-sdk/views";
import { getApplicationDataClient } from "@isle/app-sdk/data";

const storage = getApplicationDataClient().storage;
const view = mountApplicationView(container, {
  id: project.id,
  title: project.name,
  script: build.script,
  style: build.style,
  methods: {
    "state.read": async (_params, { viewId }) =>
      storage.getItem(`mini:${viewId}:state`),
    "state.write": async ({ value }, { viewId, signal }) => {
      signal.throwIfAborted();
      await storage.setItem(`mini:${viewId}:state`, value);
      return null;
    },
  },
  onError: (error) => showError(error.message),
});
await view.ready;
view.postMessage({ selection: "current" });
// 关闭或替换版本时：
view.dispose();
```

子视图的源码在编译时引用 SDK：

```ts
import { getApplicationViewClient } from "@isle/app-sdk/views";

const client = getApplicationViewClient();
const state = await client.request("state.read");
await client.request("state.write", { value: { count: 1 } });
const unsubscribe = client.subscribe((event) => updateSelection(event));
```

子视图没有 `isleApplication`、工作区连接、应用工具目录或聊天权限。容器显式提供方法白名单，运行时按实际 frame 来源及每次挂载的实例标识校验通信；`viewId` 来自挂载身份，子视图参数不能替换它。容器的方法仍须校验业务参数和限定数据范围，不能直接透传任意工具名、存储键或工作区路径。方法白名单在挂载时快照，修改权限需要释放并重新挂载。

单个应用页面最多四个视图，每个视图最多四个并发请求。请求、响应及主动事件上限 256 KiB，方法执行超时 30 秒，启动超时 5 秒，JS/CSS 上限为 8 MiB / 2 MiB。`ready` 在浏览器 bundle 的初始同步执行结束后完成，不代表业务验收通过。主题和公共 CSS tokens 随应用更新；`client.getHost()` 返回当前视图 ID 与主题。

`dispose()` 可重复调用，释放 iframe、监听器并取消进行中的请求。移除容器、iframe 导航、应用卸载或页面关闭也会释放视图。处理函数获得的 `signal` 会在关闭或超时时取消；已完成的外部写入不会自动回滚，运行时不重放请求。替换版本时先释放旧句柄，再用同一项目 ID 挂载新产物。

`pnpm dev` 使用同一视图运行时，子视图同样受沙箱与 CSP 限制，应用数据和聊天仍遵循开发预览的内存语义。声明 `embedded-views` 不开放 Agent 的文件、网络或进程权限。

在 `apps/client` 运行 `pnpm test:app-host:theme` 检查默认限制与显式开启行为；`pnpm test:app-host:views:browser` 用已安装的 Playwright 运行 Chromium 端到端检查。可用 `ISLE_PLAYWRIGHT_MODULE` 指定 Playwright 模块路径，`ISLE_VIEW_TEST_BROWSERS=chromium,webkit` 同时检查 WebKit；自定义浏览器位置使用 `ISLE_VIEW_TEST_WEBKIT_EXECUTABLE` 等对应变量。

## 与 dsh.client 的关系

上游 `dsh.client` 面向 DeepSeek 浏览器模块表、React 实例、Cordis 客户端运行器与类型化插槽。Isle 识别该声明，但不在应用上下文执行它。双目标包可以保留 DSH 的 `./client` 导出，再增加小型 `isle.ui` 入口；两套 UI 可以调用同一批宿主工具，共享业务行为。

Isle 的 DSH 打包目标目前只生成宿主 Cordis 声明。已有的自定义 `dsh.client` 构建仍由应用自身维护。

## 共享基础组件

宿主和内置应用可以共同依赖工作区包 `design-system`，通过 `design-system/components/ui/button`、`design-system/components/ui/dialog`、`design-system/components/markdown` 等入口复用组件，通过 `design-system/lib/utils` 使用 `cn`。组件实现不依赖宿主目录、Tauri 或应用业务。

Tailwind 入口先导入 `tailwindcss`，再导入 `design-system/theme.css`；后者包含主题变量、通用样式及共享组件的源码扫描声明。应用继续扫描自己的页面源码，并维护业务专属样式。这个包在构建时复用，应用通过现有沙箱打包流程运行；Chat 仍通过 `@isle/app-sdk/chat/react` 使用。

共享目录保持原组件层级：`packages/design-system/components/ui/` 存放基础 UI，`packages/design-system/components/markdown.tsx` 等上层通用组件与 `ui/` 同级。配套工具和 hooks 分别放在 `lib/`、`hooks/`；主题入口为 `design-system/theme.css`。新增通用组件直接放入对应目录，包的子路径导出会自动覆盖它，无需在宿主保留转发文件。

`components.json` 和组件生成所需别名统一放在 `packages/design-system`，后续组件生成从该目录执行。`pnpm --filter design-system check` 检查整个共享包，包括当前尚无调用方的组件。宿主的原生窗口拖动组件属于 `workbench/shell/layout`，不进入通用组件包。
