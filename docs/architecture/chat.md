# Mewvis Chat

应用内的可复用 Chat 库。当前使用 `@/chat/core`、`@/chat/react`、`@/chat/desktop` 三个独立入口，没有 `chat` 根入口把 UI 带进核心；会话与消息契约由无运行时依赖的工作区类型包 `@mewvis/chat-contracts` 统一提供。`desktop` 目录保留宿主适配层的历史命名，当前由桌面与 Web 共用。

## 文件和依赖

```text
src/chat/
  core/
    index.ts          无 UI 公共入口
    contracts.ts      核心宿主接口、创建参数及配置辅助函数
    session.ts        唯一的会话执行编排与不可变快照
    reducer.ts        复用原有 AgentClient 事件的消息归并
    save-queue.ts     串行写入、流式节流、节点防抖、失败重试
    manager.ts        可选的无 UI 多会话管理；桌面宿主使用自己的单一拥有者
  react/
    index.ts          默认 Chat、组合组件、公开 hooks 和纯展示组件
    provider.tsx      useSyncExternalStore 绑定；Provider 只观察
    view-state.ts     按 session + viewId 管理草稿、提交事务和展示偏好
    chat.tsx          默认 Chat 及相同实现的公开组合组件
    question.tsx      追问表单
    messages/         现有消息、Markdown、思考、工具事件的展示
    composer/         输入、默认工具栏、能力菜单与替换插槽
      editor/         Lexical 及文件／技能引用，仅 UI 使用
  desktop/
    index.ts          默认桌面宿主 service 和场景配置类型
    service.ts        桌面唯一拥有者；集中打开、恢复、关闭及运行时／存储装配
    catalog.ts        模型／角色／技能／知识库／工具独立加载
    context.ts        复用工作区 prompt、引用技能和知识检索上下文
    runtime.ts        复用 AgentClient，私下解析凭据，连接 Pi
    storage.ts        读取现有消息格式；来源／配置／偏好／未读共用写队列
    ledger.ts         账本摘要的模型解析，UI 只传模型 ID
    application.ts         权限校验、场景配置解析和连接句柄；不另持有会话或执行状态
    react.tsx         DesktopChatEnvironment / useDesktopChatSession / useDesktopChatRecord
```

依赖方向：`react → core`；`desktop → core + 现有 AgentClient/API`；`desktop/react → desktop + react`。核心只依赖现有纯 TypeScript 事件契约，不导入宿主 AgentClient 工厂。React 层可以使用现有设计系统、样式和 Lexical，不导入桌面 API 或普通聊天页面。

消息、会话和运行配置类型只在 `packages/chat-contracts/index.d.ts` 定义。核心内部直接从定义文件或共享包导入；`core/index.ts` 集中对外导出共享类型与核心 API，业务和其他层继续使用 `@/chat/core`。内部文件不再重复转导出共享类型，也不通过本层公共入口反向导入。

`workbench/shell/chat-service.ts` 一次性创建应用级 service 和应用宿主、配置场景恢复器；`chat-integration.tsx` 一次性连接文件目录、聊天列表与未读状态、资源刷新、窗口明确关闭。业务页面不访问核心或输入区内部 Store。

业务创建会话使用 `useDesktopChatSession`；侧栏等历史入口使用 `useDesktopChatRecord`，由 `service.openRecord` 按磁盘记录查找原拥有者。应用记录通过启动时配置的 `resolveRecord` 校验权限并返回场景配置，service 统一复用或创建拥有者；恢复器不再调用 `openSession`。删除记录使用 `closeRecord(workspacePath, chatId)` 关闭实际拥有者，不根据侧栏入口猜测 scope。

## 从操作查找实现

- `core/session.ts`：一轮任务的初始化、授权准备、发送、事件归并、停止、追问和关闭。内部状态与保存队列不向调用方开放；`ChatRuntime.authorize` 在同一轮可取消的 preparing 阶段执行，授权完成前不改消息或持久化记录，派发前仍由宿主复核权限。
- `desktop/service.ts`：会话创建、并发打开合并、磁盘归属、来源恢复、关闭和上下文保存。每个会话条目聚合配置、来源、存储、打开／关闭 Promise 和订阅；失败打开会清理预留归属。桌面不再叠加核心 manager 与应用的打开缓存。
- `react/view-state.ts`：草稿、偏好及提交事务；内部处理重复提交、失败保留和版本匹配后的草稿清空。Provider 中的 hook 订阅状态并提供现有组件绑定。

历史打开的顺序是 `openRecord → 读取来源 → resolveRecord 校验并返回配置 → openSession`，失败返回只读历史。React 通过 `subscribeRecord` 观察指定记录的可用性，不从全局会话流推测原拥有者；明确关闭不会触发观察者自动重开。手动重连的最短 loading 展示仍在 React 绑定中。

`react/messages` 与 `react/composer` 的代码、目录及组件契约保持不变。`core/manager.ts` 继续作为独立无 UI 接入的可选管理器，不在桌面调用链中重复管理生命周期。

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
terminal.onAnswer((questionId, answer) =>
  session.answer({ questionId, answer }),
);
terminal.onExit(async () => {
  const result = await session.close();
  if (result.ok) detach();
  else terminal.showError(result.error); // 数据仍在会话中，可以重试关闭
});
```

`apps/client/scripts/chat/stdio-e2e.mjs` 是可直接运行的无 UI 示例和集成测试：它使用现有 Runtime 的 stdio JSON-RPC 客户端与 mock profile，在临时工作区完成两轮请求和历史恢复。

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
    workspaceId: workspace.id,
    origin: { kind: "builtin", sceneId: "chat" },
    workspacePath: workspace.path,
    profile: workspaceChatProfile,
  });
  return session ? <Chat session={session} /> : <Chat.Loading error={error} />;
}
```

默认界面包括消息、输入、模型／角色／技能／工具／知识库选择、思考与工具展示偏好、停止、追问和可重试错误。当前聊天页面已经使用此入口；首页发送成功后仅负责导航，不通过挂载 effect 重发首条消息。

输入 `/` 或点击输入栏左侧的 `+`，会打开同一个引用选择器，可按插件名称和当前可用的技能组浏览命令与技能，并筛选名称、说明和标识。插件命令仅在消息开头可选；从 `/` 呼出的选择器中选中选项时替换掉 `/关键词`，从 `+` 呼出时直接在光标处插入引用。两种方式插入的引用都只显示名称。`@` 文件引用保持独立。

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
    <Chat.Messages
      renderMessage={(message, defaultMessage) =>
        renderBusinessMessage(message, defaultMessage)
      }
    />
    <Chat.Footer>
      <Chat.Error />
      <Chat.Question />
      <Chat.Composer
        className="business-composer"
        slots={{ editor: BusinessEditor }}
      >
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

首次请求写入应用历史后才派发 Runtime。流式保存按节点防抖和持续流节流执行，结束／停止／关闭立即 flush；失败保留最新待写版本。桌面偏好与未读更新同样串行并可重试。Node 先完整创建新记录临时目录再发布，已有文件采用临时文件替换；已有记录的多个 JSON 文件尚不构成跨文件事务。

读取、列举和正常保存不再删除旧格式文件。未知或损坏记录报错且保留原文件，不用空记录覆盖。这里没有执行迁移或用户数据清理。显式删除会话仍保留原产品的删除行为，删除前先关闭拥有者。

模型目录、发送和账本摘要共用 `api/llm.ts` 的宿主配置缓存；目录读取安全的 `getLlmModelOptions`，执行和摘要通过 `resolveLlmModel` 按 ID 解析。首次读取和显式刷新才查询 Node 配置，并发读取合并为一次。`saveLlmSettings` 串行保存并用后端成功结果更新缓存；读取等待正在保存的配置，迟到的旧读取或错误不会覆盖新配置。返回副本避免调用方修改缓存。缓存仅在当前宿主实例的内存中，不写入浏览器存储。

`session.refreshResources()` 向目录传入 `{ refresh: true }`，强制重新读取模型配置；模型设置页的显式加载也会刷新。刷新失败会暴露错误、保留当前选择，下次读取可以重试；删除模型后不会继续返回旧的可执行配置。

凭据在宿主准备请求时解析并留在 dispatch 闭包，快照和 UI props 只包含安全的选项描述。工具选择不等于授予应用权限。应用 SDK、iframe／Node 宿主桥和共享 UI 已接入；用法与边界见 [应用聊天说明](../apps/chat.md)。未迁移酒馆、RSS 或其他具体应用。

## 应用接入

`@mewvis/app-sdk/chat` 提供无 UI 客户端，`@mewvis/app-sdk/chat/react` 提供同一套 Chat 和绑定。`desktop/application.ts` 将经过身份绑定的连接映射到应用级 service，校验配置和授权，隔离会话句柄，并转发带修订号的快照。它不再管理会话打开缓存或发送准备状态；`resolveSession` 只返回配置。动态上下文交给 `service.updateContext` 更新和保存，`viewPersistence` 只暴露展示偏好接口。应用与 SDK 共同引用 `@mewvis/chat-contracts`，核心不依赖应用实现。

`workbench/shell/chat-service.ts` 连接实际应用权限、工作区和 service；`chat-integration.tsx` 内的局部方法 `connectBackendApplicationChat` 统一接入后端应用聊天事件，StrictMode 共用后端事件监听。`ApplicationFrame` 连接 iframe 消息。应用 UI 按需加载由 `build:chat-ui` 从应用源码生成的共享脚本和样式；脚本和样式产物不提交。同一构建还生成 `packages/app/sdk/chat/react.d.ts`，该声明随 SDK 保留在仓库中；组件、hook 和 UI 类型不再手写第二份字段结构。生成器读取 SDK 的实际运行导出，保留公开类型名，并将核心契约和应用协议保留为包导入。

在 `apps/client` 执行 `pnpm check:chat-ui-types`，检查声明是否与源码同步，不改写声明。生成和检查均验证声明只引用公共依赖，并在不使用应用别名、不跳过声明检查的环境下进行 TypeScript 检查；应用契约测试另双向对照实际组件签名。

应用通过 `createSession({ workspaceId, sceneId, profile })` 明确创建会话，宿主返回的 `session.identity.id` 就是 `meta.id`。`openSession({ workspaceId, chatId })` 只打开已有记录；React 的 `useApplicationChatSession` 只负责打开和观察，不创建。不同创建操作生成不同 ID，多视图打开同一 ID 共用一个拥有者。应用不传真实路径或凭据。

`meta.workspaceId` 保存所属工作区；`meta.origin` 是来源和场景的唯一依据：内置普通聊天是 `{ kind: "builtin", sceneId: "chat" }`，应用是 `{ kind: "application", applicationId, sceneId }`。场景配置保存在 `options.profile`，其中 `id` 只标识配置，动态上下文也经同一队列保存。运行选择和展示偏好保留原字段位置。保存不能更改已有记录的来源和工作区。

`openRecord` 返回可运行的 `session` 或只读 `history`。侧栏按元数据恢复原场景，应用恢复仍需验证当前权限、工具归属和工作区。故事助手作为故事应用会话接入，旧的内置 `story-assistant` 场景不再提供运行入口。来源缺失、场景未知或应用不可用时，公共 `Chat.History` 保留消息与复制，不创建运行会话。应用撤销事件使打开的历史视图重新解析；重新启用后可点击「重新连接」。绑定公开 `connecting` 和 `retryError`，重试期间保留消息并禁用按钮，失败时显示具体原因。`history.canRetry` 表示当前只读原因是否支持重试；来源信息缺失或宿主没有恢复入口时不显示按钮。当前不自动补齐或迁移旧来源格式。

`chat.listSessions({ workspaceId })` 直接从元数据过滤当前应用、工作区，返回记录 ID 和场景摘要；不读取消息和提示词。动态上下文用 `setContext()`，模型与能力用 `updateConfig()`。Provider 卸载只取消观察，关闭应用或禁用／移除应用才停止、保存并释放相应会话。

## 验证

在 `apps/client` 下运行：

```sh
pnpm test:chat
pnpm test:chat:stdio
pnpm test:chat:application
pnpm check:chat-ui-types
pnpm exec tsc --noEmit
pnpm exec vite build
pnpm --filter @mewvis/server test
node scripts/agent-runtime/frontend-contract-e2e.mjs
node scripts/agent-runtime/user-input-e2e.mjs
```

`test:chat` 包含不带 DOM lib 的核心类型检查、Node bundle 依赖边界检查、核心竞态测试、桌面宿主测试及 DSH patchPath 严格 Schema 回归。stdio 测试使用临时数据，需要已有 `agent-runtime/dist/cli.js`。

Node 存储回归测试覆盖元数据来源不可变、配置不覆盖归属、目录 ID 校验与历史文件保护；冻结的旧 Rust 存储快照继续用于验证历史数据兼容性。

已有 1420 服务提供 `/scripts/chat/browser.html`（StrictMode、多视图、默认／组合 UI、只读历史）、`/scripts/chat/page.html`（真实首页和聊天路由）以及 `/scripts/app/chat/application-browser.html`（真实沙箱与测试应用）。这些测试使用内存 Runtime 和存储，不连接真实模型或用户历史；应用测试页需点击「创建会话」。

手动重试时，桌面绑定让 loading 至少显示 400 毫秒以避免快速失败时闪烁，请求会立即发起；较慢的请求持续显示 loading 直到结束。首次自动打开不增加这段反馈时间。

验证应覆盖授权等待时停止、迟到授权不派发、不写记录、打开失败后的归属恢复、定向观察、上下文更新，以及默认与定制界面切换。浏览器夹具使用内存数据；涉及模型或原生能力的修改仍需在对应环境验证。

## 执行权限与审批

输入区以 `permissionMode` 提供请求批准、帮我批准、完全访问权限；技能与知识库在模型菜单中分别选择。
未指定有效权限时使用权限目录声明的默认项（当前为第二档“帮我批准”，`auto`）。工具范围由 Runtime 默认值与宿主场景配置决定。
应用和宿主使用同一份权限目录。`agent/tools/list` 的 `permissionOptions` 返回模式、名称、说明和默认项。
唯一维护位置是 Runtime 的 `security/safety/policy.ts`（`security/safety/index.ts` 统一校验并提供展示选项），
审批层与 `security/execution/policy.ts` 的沙箱层各自通过 `enabled` 开关控制。
协议模式和公开 Chat 类型通过 `pnpm generate:agent-runtime:protocol` 同步生成。
前端菜单、配置校验和历史恢复读取目录，不维护枚举或标签；目录不可用时禁用选择与发送。

`pendingApproval` 独立于 `pendingQuestion`。`AppChatIntegration` 挂载宿主 `ChatApprovals`，
覆盖后台及无界面会话。审批只能通过 desktop service 和统一 Node API 答复，普通 `answer()` 不能批准操作。
前端展示执行摘要、参数、识别出的操作、审批原因与期限，后端作最终判断。

公共安全模块 `security/safety` 从同一配置解析操作风险、公共及档位边界；Pi 适配层在执行前调用安全入口。
启用执行沙箱时，包括 `full` 在内的三档都在沙箱进程中执行文件、Bash、业务及应用工具。关闭沙箱时，所有已启用应用的聊天使用普通子进程，保留 `agentAccess` 的工具级检查、Node 子进程权限控制和档位审批；不提供操作系统级文件／网络隔离。审批不能覆盖工具级禁用规则。
需要审批时直接等待当前调用，一分钟未批准就拒绝，排队也计时；主/子 Agent 超时不暂停。
批准只允许该次执行，后续操作重新检查。拒绝、取消或审批期间参数/目标权限变化均不执行。
