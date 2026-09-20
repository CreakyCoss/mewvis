# 应用界面协议

`isle.ui` 是 Isle 为原生和兼容应用定义的 UI 扩展，与 `dsh.client` 独立。双目标包可以同时携带两份 UI 声明，继续向 DSH 生态分发。

机器可读定义位于 [isle-ui.schema.json](../../packages/app/host/schema/isle-ui.schema.json)。

React 项目可使用 [应用工程工具链](development.md)：页面从 `main/App.tsx` 导出，工具与技能通过 `host.tools` / `host.skills` 指向 `main/host/tools.ts` 和 `main/host/skills.ts`，权限和 UI 设置放入 `isle.config.ts`。工具链生成下列 JS 入口与清单，浏览器通过 SDK 的 `getApplicationHost()` 调用本应用工具，无需手写桥接代码。

## 应用自有页面

一个界面由包内 JS 入口及可选样式表构成。Isle 管理应用目录、详情标题、沙箱、权限桥与通用工具兜底页面；应用负责业务标记、样式与交互。

```json
{
  "isle": {
    "app": { "version": 1, "entry": "./index.js" },
    "ui": {
      "version": 1,
      "kind": "sandbox",
      "entry": "./isle-ui.js",
      "style": "./isle-ui.css",
      "title": "我的应用",
      "layout": "full"
    }
  }
}
```

源码只维护 `isle` 声明。在 `apps/client` 运行 `pnpm app:pack -- <package> --target dsh`，会保留 UI 元数据，并在分发包增加 `dsh.bundle` 和 `cordis.patch.yml`。

路径必须以 `./` 开头，解析后位于包内，不得经符号链接越界。`layout` 可省略：

- `contained`：默认值，在有标题的沙箱卡片中显示，适用于紧凑工具。
- `full`：iframe 铺满应用详情内容区，保留应用左侧栏和应用详情栏。
- `fullscreen`：打开应用时自动隐藏应用左侧栏和应用详情栏，铺满应用工作区。窗口顶部保留拖动区域和“退出全屏”按钮；退出后可从详情栏再次进入。切换不会重载应用界面，离开应用页面后恢复应用导航。此声明不切换操作系统窗口全屏。

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
- `window.isleApplication.openExternal(url)`：由用户操作触发，请求宿主用系统浏览器打开 HTTP(S) 地址，其他协议会被拒绝。
- `window.isleApplication.writeClipboardText(text)`：从用户点击操作复制文本，上限 256 KiB，不提供剪贴板读取。共享 Chat 消息与故事酒馆使用 SDK 的同名辅助函数，独立预览回退到浏览器剪贴板。
- `isle:ready`：收到宿主描述后触发的窗口事件。
- `isle:theme`：应用主题变化时触发的窗口事件。

## 隔离与限制

沙箱使用不透明源和固定 CSP：

- 禁止 fetch 及图片、媒体、字体、frame、object 等外部资源。
- 不授予表单、弹窗、下载、同源访问和顶层导航能力。
- 允许内联脚本和 CSS，是因为受审计的宿主文档直接嵌入包资源。
- 工具参数必须是 JSON 对象，上限 256 KiB；每个 frame 最多同时调用四个工具。
- 浏览器桥和 Node 宿主都会复核工具归属。

iframe 离开宿主文档后不再展示界面。JS 入口上限 8 MiB，样式表上限 2 MiB（图片、字体内联后的实际大小）。只有 UI 文档读取响应允许 24 MiB，以容纳内联资源及 JSON 编码开销；普通应用工具响应仍限制为 4 MiB，普通 HTTP 响应仍限制为 16 MiB。UI 加载或执行失败不影响工具与技能；无效 UI 声明回退到通用工具台。

浏览器沙箱隔离 DOM 与应用权限，不会将安装包变为不可信数据。宿主侧 Cordis 入口是可执行 Node.js 代码，必须来自受信任来源。

## 与 dsh.client 的关系

上游 `dsh.client` 面向 DeepSeek 浏览器模块表、React 实例、Cordis 客户端运行器与类型化插槽。Isle 识别该声明，但不在应用上下文执行它。双目标包可以保留 DSH 的 `./client` 导出，再增加小型 `isle.ui` 入口；两套 UI 可以调用同一批宿主工具，共享业务行为。

Isle 的 DSH 打包目标目前只生成宿主 Cordis 声明。已有的自定义 `dsh.client` 构建仍由应用自身维护。

## 共享基础组件

宿主和内置应用可以共同依赖工作区包 `design-system`，通过 `design-system/components/ui/button`、`design-system/components/ui/dialog`、`design-system/components/markdown` 等入口复用组件，通过 `design-system/lib/utils` 使用 `cn`。组件实现不依赖宿主目录、Tauri 或应用业务。

Tailwind 入口先导入 `tailwindcss`，再导入 `design-system/theme.css`；后者包含主题变量、通用样式及共享组件的源码扫描声明。应用继续扫描自己的页面源码，并维护业务专属样式。这个包在构建时复用，应用通过现有沙箱打包流程运行；Chat 仍通过 `@isle/app-sdk/chat/react` 使用。


共享目录保持原组件层级：`packages/design-system/components/ui/` 存放基础 UI，`packages/design-system/components/markdown.tsx` 等上层通用组件与 `ui/` 同级。配套工具和 hooks 分别放在 `lib/`、`hooks/`；主题入口为 `design-system/theme.css`。新增通用组件直接放入对应目录，包的子路径导出会自动覆盖它，无需在宿主保留转发文件。

`components.json` 和组件生成所需别名统一放在 `packages/design-system`，后续组件生成从该目录执行。`pnpm --filter design-system check` 检查整个共享包，包括当前尚无调用方的组件。宿主的原生窗口拖动组件属于 `workbench/shell/layout`，不进入通用组件包。
