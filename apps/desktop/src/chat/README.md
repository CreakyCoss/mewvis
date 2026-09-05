# Isle Chat

应用内的可复用 Chat 库。当前使用 `@/chat/core`、`@/chat/react`、`@/chat/desktop` 三个独立入口，没有 `chat` 根入口把 UI 带进核心；会话与消息契约由无运行时依赖的工作区类型包 `@isle/chat-contracts` 统一提供。

## 文件和依赖

```text
src/chat/
  core/
    index.ts          无 UI 公共入口
    contracts.ts      会话、运行配置、能力目录及宿主接口
    messages.ts       语义消息、思考、工具结果、用户引用和追问
    session.ts        唯一的会话执行编排与不可变快照
    reducer.ts        复用原有 AgentClient 事件的消息归并
    save-queue.ts     串行写入、流式节流、节点防抖、失败重试
    manager.ts        创建合并、作用域隔离、持有与明确关闭
  react/
    index.ts          默认 Chat、组合组件、公开 hooks 和纯展示组件
    provider.tsx      useSyncExternalStore 绑定；Provider 只观察
    view-state.ts     按 session + viewId 保存草稿和展示偏好
    chat.tsx          默认 Chat 及相同实现的公开组合组件
    question.tsx      追问表单
    messages/         现有消息、Markdown、思考、工具事件的展示
    composer/         输入、默认工具栏、能力菜单与替换插槽
      editor/         Lexical 及文件／技能引用，仅 UI 使用
  desktop/
    index.ts          默认桌面宿主 service 和场景配置类型
    service.ts        会话拥有者；统一挂接运行时、目录和存储
    catalog.ts        模型／角色／技能／知识库／工具独立加载
    context.ts        复用工作区 prompt、引用技能和知识检索上下文
    runtime.ts        复用 AgentClient，私下解析凭据，连接 Pi
    storage.ts        兼容现有记录；配置／偏好／未读共用写队列
    ledger.ts         账本摘要的模型解析，UI 只传模型 ID
    react.tsx         DesktopChatEnvironment / useDesktopChatSession
```

依赖方向：`react → core`；`desktop → core + 现有 AgentClient/API`；`desktop/react → desktop + react`。核心只依赖现有纯 TypeScript 事件契约，不导入 AgentClient 的 Tauri 工厂。React 层可以使用现有设计系统、样式和 Lexical，不导入桌面 API 或普通聊天页面。

`features/app/chat-service.ts` 创建应用级 service；`chat-integration.tsx` 一次性连接文件目录、聊天列表与未读状态、资源刷新、窗口明确关闭。业务页面不访问核心或输入区内部 Store。

## 三种接入

### 无 UI / TUI

终端拥有者提供运行时、目录、存储接口，核心负责执行和保存。以下 `terminal` 是调用方界面接口，不是库中已实现的 TUI：

```ts
import { createChatSession } from "@/chat/core";

const session = await createChatSession({
  identity: { scope: "terminal", id: "analysis" },
  runtime, // ChatRuntime：连接已有 AgentClient/stdio，不实现新模型引擎
  catalog, // ChatCatalog：安全的模型、能力描述和默认项
  storage, // ChatStorage：load / save，可选 flush
  context, // 可选 ChatContextProvider
});
const detach = session.subscribe(() => terminal.render(session.getSnapshot()));
terminal.onSubmit((text) => session.send({ text }));
terminal.onStop(() => session.stop());
terminal.onAnswer((questionId, answer) => session.answer({ questionId, answer }));
terminal.onExit(async () => {
  const result = await session.close();
  if (result.ok) detach();
  else terminal.showError(result.error); // 数据仍在会话中，可以重试关闭
});
```

`scripts/chat/stdio-e2e.mjs` 是可直接运行的无 UI 示例和集成测试：它使用现有 Runtime 的 stdio JSON-RPC 客户端与 mock profile，在临时工作区完成两轮请求和历史恢复。

### 默认 Chat

应用启动处配置一次，service 不在 React 组件中创建：

```tsx
import { createDesktopChatService } from "@/chat/desktop";
import { DesktopChatEnvironment } from "@/chat/desktop/react";

export const chatService = createDesktopChatService();
// 根组件：<DesktopChatEnvironment service={chatService}><App /></DesktopChatEnvironment>
```

业务页面只指定身份、存储位置与稳定的场景配置：

```tsx
import { Chat } from "@/chat/react";
import { useDesktopChatSession } from "@/chat/desktop/react";

function Conversation({ workspace, chatId }) {
  const { session, error } = useDesktopChatSession({
    identity: { scope: `workspace:${workspace.id}`, id: chatId },
    workspacePath: workspace.path,
    profile: workspaceChatProfile,
  });
  return session ? <Chat session={session} /> : <Chat.Loading error={error} />;
}
```

默认界面包括消息、输入、模型／角色／技能／工具／知识库选择、思考与工具展示偏好、停止、追问和可重试错误。当前聊天页面已经使用此入口；首页发送成功后仅负责导航，不通过挂载 effect 重发首条消息。

### 组合与替换

```tsx
import { Chat, type ComposerBinding } from "@/chat/react";

function BusinessEditor(binding: ComposerBinding) {
  return (
    <textarea
      disabled={binding.disabled}
      value={binding.draft.text}
      onChange={(event) => {
        const text = event.target.value;
        binding.setDraft({ text, blocks: [{ type: "text", content: text }] });
      }}
    />
  );
}

<Chat.Provider session={session} viewId="business">
  <BusinessHeader />
  <Chat.Layout className="business-chat">
    <Chat.Messages renderMessage={(message, defaultMessage) => renderBusinessMessage(message, defaultMessage)} />
    <Chat.Footer>
      <Chat.Error />
      <Chat.Question />
      <Chat.Composer className="business-composer" slots={{ editor: BusinessEditor }}>
        <BusinessToolbar />
      </Chat.Composer>
    </Chat.Footer>
  </Chat.Layout>
</Chat.Provider>;
```

`slots.toolbar`、`slots.actions` 可替换默认工具栏和发送／停止区域；`children` 扩展默认工具栏。`useChatSnapshot`、`useChatActions`、`useChatComposer`、`useChatControls`、`useChatViewState` 供业务控件使用，发送、停止、追问都回到同一 session。`MessagesView`、`MessageView`、`QuestionView` 和接受显式 binding 的 `ComposerView` 可以单独使用。

## 生命周期与状态归属

| 内容           | 拥有者和约定                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| 会话身份       | `scope + id` 联合键；并发 open 合并；桌面宿主禁止不同身份同时写同一磁盘记录                                         |
| 会话生命周期   | service 持有；Provider 挂载／卸载只连接／取消观察；视图缓存淘汰不关闭后台会话                                       |
| 明确关闭       | `closeSession` / `closeWorkspace` / `closeAll` 停止、保存、释放 Runtime；失败保留会话供重试；重开等待关闭完成       |
| 配置           | 核心持有模型、角色、技能、工具、知识库 ID；一轮执行期间不可修改；缺失资源不丢弃已保存选择，显式空数组仍为空         |
| 场景上下文     | `ChatProfile.systemPrompt`、`context`、技能覆盖、工具范围、知识库开关；profile 对象应稳定，同 ID 更新应用于后续准备 |
| 展示状态       | React 按 session + viewId 保存草稿、展示偏好；菜单局部开关属于组件；不同 viewId 互不覆盖草稿                        |
| 展示偏好持久化 | 默认桌面适配只将 `main` 视图的偏好写回旧 options；其他视图默认保留于内存；宿主可通过 ChatEnvironment 提供自己的适配 |
| 消息作者       | 消息中的角色名称、头像标识是历史作者元数据，不包含编辑器状态或展开偏好                                              |

`send` 返回 `dispatched / cancelled / rejected`，不等待整轮生成结束。状态通过快照观察。可选 `requestId` 在会话生命周期内去重。只有成功派发且草稿修订未变化才清空输入；准备、首次保存或派发失败时保留草稿。

准备阶段停止会立即解除输入等待；迟到的异步结果不得派发。提交阶段停止等待 Runtime 注册应答后调用 abort，避免向尚不存在的任务发送无效停止。事件由任务 ID 和当前轮实例共同隔离。所有 Provider 卸载后仍归并和保存事件。

## 历史与 Pi

应用继续使用现有 `meta.json`、`messages.json`、`options.json`；运行配置仅提取已知 ID 字段，原有未知 options 字段保留。消息数组保持原语义格式。流式历史重新打开时，仅在内存中将未完成消息标记为中断；初始化不重写磁盘。

Pi 继续使用 `chats/<chatId>/session` 下的原执行上下文和账本。核心不会将应用历史重新灌入 Pi，不提供可独立编辑的第二份模型上下文。账本摘要仍走现有 Pi 接口。

首次请求写入应用历史后才派发 Runtime。流式保存按节点防抖和持续流节流执行，结束／停止／关闭立即 flush；失败保留最新待写版本。桌面偏好与未读更新同样串行并可重试。Rust 先完整创建新记录临时目录再发布，已有文件采用临时文件替换；已有记录的多个 JSON 文件尚不构成跨文件事务。

读取、列举和正常保存不再删除旧格式文件。未知或损坏记录报错且保留原文件，不用空记录覆盖。这里没有执行迁移或用户数据清理。显式删除会话仍保留原产品的删除行为，删除前先关闭拥有者。

模型目录、发送和账本摘要共用 `api/llm.ts` 的宿主配置缓存；目录读取安全的 `getLlmModelOptions`，执行和摘要通过 `resolveLlmModel` 按 ID 解析。首次读取和显式刷新才查询原生配置，并发读取合并为一次。`saveLlmSettings` 串行保存并用后端成功结果更新缓存；读取等待正在保存的配置，迟到的旧读取或错误不会覆盖新配置。返回副本避免调用方修改缓存。缓存仅在当前宿主实例的内存中，不写入浏览器存储。

`session.refreshResources()` 向目录传入 `{ refresh: true }`，强制重新读取模型配置；模型设置页的显式加载也会刷新。刷新失败会暴露错误、保留当前选择，下次读取可以重试；禁用或删除模型后不会继续返回旧的可执行配置。

凭据在宿主准备请求时解析并留在 dispatch 闭包，快照和 UI props 只包含安全的选项描述。工具选择不等于授予插件权限。插件 SDK、iframe／Node 宿主桥和共享 UI 已接入；用法与边界见 [插件聊天说明](../../../../packages/plugin-sdk/chat/README.md)。未迁移酒馆、RSS 或其他具体插件。

## 插件接入

`@isle/plugin-sdk/chat` 提供无 UI 客户端，`@isle/plugin-sdk/chat/react` 提供同一套 Chat 和绑定。`desktop/plugin.ts` 将经过身份绑定的连接映射到应用级 service，校验配置和授权，隔离会话句柄，并转发带修订号的快照。它不运行第二套 reducer。应用与 SDK 共同引用 `@isle/chat-contracts`，核心不依赖插件实现。

`features/app/plugin-chat.ts` 连接实际插件权限、工作区和 service；`plugin-chat-native.ts` 一次性接入 Node 插件双向 stdio，StrictMode 共用原生事件监听。`PluginFrame` 连接 iframe 消息。插件 UI 按需加载由 `build:chat-ui` 从应用源码生成的共享脚本和样式；构建产物不提交。SDK 的公开组件声明有对应的类型检查。

插件的 `chatId` 是业务逻辑 ID。宿主用插件身份和逻辑 ID 生成稳定的磁盘 ID，再结合工作区隔离；插件不传真实路径或凭据。动态上下文用 `setContext()` 更新，模型与能力用异步 `updateConfig()` 更新。会话仍由应用拥有，插件视图退出不停止任务；关闭应用、禁用或移除插件会明确关闭对应会话。

## 验证

在 `apps/desktop` 下运行：

```sh
pnpm test:chat
pnpm test:chat:stdio
pnpm test:chat:plugin
pnpm exec tsc --noEmit
pnpm exec vite build
cargo test --manifest-path src-tauri/Cargo.toml services::chats::tests
node scripts/agent-runtime/frontend-contract-e2e.mjs
node scripts/agent-runtime/user-input-e2e.mjs
```

`test:chat` 包含不带 DOM lib 的核心类型检查、Node bundle 依赖边界检查、核心竞态测试、默认宿主适配测试与已提交 DSH patchPath 的严格 Schema 回归。stdio 测试需要已有 `agent-runtime/dist/cli.js`，只使用临时测试数据。

浏览器测试地址为已有开发服务上的 `/scripts/chat/browser.html`，只使用内存存储和测试 Runtime。覆盖 StrictMode、多视图、后台运行、默认 Lexical、替换编辑器／工具栏／渲染和草稿保留。它不能替代真实 Tauri 页面验收，也不会自动启动服务器。

最终浏览器测试通过 21 项断言，包含实际停止按钮点击不会误触发发送、公开草稿更新同步到默认编辑器、不同 viewId 草稿隔离。

`/scripts/chat/page.html` 用内存数据挂载迁移后的真实首页和聊天路由，供手动验收。已在用户的 1420 环境检查原有布局、模型／技能／知识库／工具选择、发送、追问、准备期间停止、草稿与配置在页面切换后的恢复，以及首页首次发送不会重发。该页面仅允许 Web 预览，所有测试消息和保存均在内存中。

仍未验证真实模型与原生宿主的完整端到端行为。新增的 Runtime 释放命令已编译、通过契约检查，但还需要在重建后的原生程序中验证窗口关闭与资源释放；未擅自启动或重启开发服务。现有 Vite 构建仍提示主 chunk 超过 500 kB，本阶段未扩大到全应用分包。
