# Chat 基座接入草案

状态：待确认，仅描述目标接口；本轮未实现新基座，也未创建新的 SDK 包。示例里的 `@isle/chat/*`、工厂和组件名称都是提案。

## 本轮恢复结果

- 恢复基线：`6ab9311d4212dbb83ecdb6f588e73e9ee904c121`（内置应用自动扫描完成之后）。
- 撤回本轮聊天组件化、页面改接和会话核心抽取，不影响已提交的应用功能。
- 保留资源加载的独立容错，以及 DSH `patchPath` 的严格 Schema 校验修复。
- 完整代码和测试备份：Git stash `c70ff8f626dbcf30c1e5350361ae43e475b753bb`，名称为 `backup: chat-componentization before chat foundation redesign`。
- 备份包括原暂存内容；未跟踪的 `.codex` 文件保持原样。备份不是当前方案的继续实施承诺，可在新边界确定后选取代码和测试。不要在包含保留修复或其他新工作的目录里直接整包应用旧 stash。

## 要解决的问题

应用复用的是一个完整 Chat 基座：既能只使用独立 Agent 核心，也能直接使用已经连接核心的默认 UI，或组合和替换其中的 UI。普通聊天、故事助手和应用不应重复编写事件订阅、流式归并、停止、追问和保存逻辑，也不应相互引用页面内部实现。

先确认下面三个接入方式，再决定具体目录和文件拆分。

## 1. 只使用核心：无界面或 TUI

```ts
import { createAgentSession } from "@isle/chat/core";

const session = await createAgentSession({
  id: "terminal-session",
  runtime: cliRuntime,
  storage: historyStorage,
  config: {
    modelId: "configured-model",
    tools: ["read"],
    skills: [],
  },
});

const detach = session.subscribe(() => terminal.render(session.getSnapshot()));
terminal.onSubmit((text) => session.send({ text }));
terminal.onStop(() => session.stop());
terminal.onAnswer((answer) => session.answer(answer));
terminal.onExit(async () => {
  detach();
  await session.dispose();
});
```

`terminal`、`cliRuntime` 和 `historyStorage` 表示该宿主提供的界面、运行时和存储。它们不是核心的内置依赖。本阶段不要求开发完整 TUI，但必须用不加载 React、DOM、Tauri 的运行测试证明这种接入成立。

核心持有语义消息、活动任务、工具执行状态、待回答问题和有效运行配置。核心复用现有 Pi 执行能力，不重新实现模型调用循环、工具执行引擎或 Pi 会话压缩。

## 2. 应用使用默认聊天界面

```tsx
// 应用启动处已完成宿主运行时、存储和权限的接入。
// 页面只指定会话身份与业务配置，不重复实现这些接入。
const session = await chatService.openSession({
  id: chatId,
  scope: { workspaceId },
  profile: workspaceAssistantProfile,
});

return <Chat session={session} />;
```

`chatService` 是系统对核心的预配置接入，不是另一套会话引擎。`Chat` 默认包括消息列表、输入框、模型与能力选择、停止、追问和错误展示；这些操作由基座连接到会话，页面不再逐项接线。

宿主处理模型配置、能力目录、凭据和存储位置。运行配置和可用能力通过受控接口供调用方使用，完整密钥不进入组件 props 或应用消息。

## 3. 应用自由组合、定制 UI

```tsx
import { Chat } from "@isle/chat/react";

return (
  <Chat.Provider session={session}>
    <TavernHeader />
    <Chat.Messages renderMessage={renderTavernMessage} />
    <Chat.Composer className="tavern-composer">
      <TavernRoleSelector />
    </Chat.Composer>
  </Chat.Provider>
);
```

默认界面应使用同一套公开组件组合出来，不维护一套隐藏的默认实现。基座提供消息、输入、工具栏、追问等组件及其定制点；自定义组件通过公开的 hook/context 访问受控状态和操作，不读取内部 Store。

角色、世界观、知识检索策略和工作区 Prompt 由场景配置或明确的上下文扩展点提供。系统提供常用默认接入；场景不必为修改一个 Prompt 就重新实现运行时、存储或会话生命周期。

纯展示组件仍可按需使用，但它们是基座的低层定制入口，不是应用默认必须手工拼接的一堆零件。

## 必须明确的边界

| 边界               | 约定                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 核心与 UI          | 核心入口不加载 React、DOM、CSS、Tauri；React 入口依赖核心，反向依赖禁止。不能通过根入口重导出 UI，让 TUI 意外加载 React。                         |
| 运行配置与展示偏好 | 模型、工具、技能和上下文属于运行配置；草稿、是否展开思考、消息样式属于 UI 状态。两者分别持有，允许分别保存。                                      |
| 消息与渲染         | 核心归并统一的语义消息和任务事件；UI 只将其投影为气泡或终端文本，不为每个界面重写运行状态机。                                                     |
| 生命周期           | 宿主或应用的会话管理者持有会话；Provider 只连接视图。视图卸载只取消观察，明确关闭会话才取消活动工作、保存并释放资源。                             |
| 多实例             | 相同会话可以被多个视图观察；不同作用域/会话 ID 之间隔离。重复挂载不能重复启动任务，切换视图不能误取消后台任务。                                   |
| Pi 与记录          | Pi 负责执行上下文和自身 session；应用记录保存展示历史、标题等。具体读写由宿主适配，第一阶段不迁移现有用户数据，不另造一份可独立修改的 Pi 上下文。 |
| 应用权限           | 应用通过宿主桥使用获准的会话和能力。选择工具不等于授予权限，不能通过定制 UI 获得密钥、任意路径或 Tauri 访问权。                                   |

`send()` 的结果表示是否接受/成功派发请求，不表示整轮回复已结束；完成状态通过快照或事件观察。准备或派发失败时，绑定 UI 应保留草稿。停止、追问和存储失败的重试语义应在实现前写入契约测试。

## 确认后再实施

1. 定义一个基座的核心、React 和宿主接入公共入口，以及共享会话契约；不要先为目录整齐大规模搬文件。
2. 用无 UI 测试验证发送、流式更新、停止、追问、历史和多会话隔离。按新语义边界复用 stash 中适用的测试与实现，不整包移回。
3. 实现默认 Chat 和可组合组件的统一连接，验证视图重挂载、后台运行、草稿保留与样式替换。
4. 只迁移当前聊天页面供验收，保持用户使用方式和记录兼容。验收通过后，再迁移其他场景并开放应用 SDK/宿主桥。

本草案尚未决定具体磁盘目录、文件清单或包发布方式；先确认接入体验、数据归属和生命周期，再用能兑现这些约定的最小结构实现。
