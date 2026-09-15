# 应用聊天

Isle 应用使用宿主持有的 Chat 会话。纯 SDK 只镜像快照和转发操作；消息归并、Pi 执行、模型凭据解析、运行配置和历史保存都在宿主完成。这里没有第二套聊天执行引擎。

## 清单与打包

在应用 `package.json` 中声明权限及 UI 源码入口：

```json
{
  "isle": {
    "app": { "version": 1, "entry": "./index.js" },
    "permissions": ["chat", "application-workspaces"],
    "ui": { "version": 1, "kind": "sandbox", "entry": "./ui.tsx" }
  }
}
```

`chat` 允许使用宿主模型和聊天；`application-workspaces` 允许通过数据 SDK 新增、查询当前应用登记的工作区，Chat 也通过这个服务解析记录目录。如果场景要使用知识库，额外声明 `chat-knowledge`，并在 profile 中设置 `useKnowledge: true`。这些用途出现在原有安装权限说明中，不自动给已有应用增加权限。工作区分配后的普通文件操作沿用标准沙箱和所选权限档位；SDK 声明不是 Node 沙箱。

用 Isle 的 `app:pack` 打包。聊天 UI 可以使用 TSX，打包器会解析 SDK 子入口，并将 React、ReactDOM 和 JSX runtime 连接到宿主提供的同一实例。生成的 UI 仍符合现有脚本大小限制；Chat、Lexical、设计系统、字体和图片由宿主共享运行时提供。CSS 和 JS 由应用实际源码构建，按需加载，不复制聊天组件。应用自己的 CSS 排在默认样式之后。

聊天能力目前只支持 Isle 目标。DSH 目标会明确拒绝带 `chat` 权限的包；原有可移植工具／技能应用的打包方式不变。

## 默认界面

```tsx
import { Chat, useApplicationChatSession } from "@isle/app-sdk/chat/react";

const profile = {
  id: "business-assistant",
  systemPrompt: "你是业务助手，请根据当前任务协助用户。",
};

export function BusinessChat({ workspaceId, chatId }) {
  const { session, error } = useApplicationChatSession({
    workspaceId,
    chatId,
  });
  return session ? <Chat session={session} /> : <Chat.Loading error={error} />;
}
```

业务只保存宿主返回的 `chatId` 和选择的 `workspaceId`。应用不向 Chat 传 `scope`、应用身份、真实目录或凭据。

工作区只通过 `getApplicationDataClient().workspaces.list/create/get` 获取，再把返回的 `id` 传给 Chat 的创建、列表和打开接口。Chat 宿主只通过数据服务查询当前应用的登记目录，不读取或回退到宿主工作区注册表。`chat.listWorkspaces()` 已移除，旧 `workspaces` 聊天请求会明确拒绝；已有应用需改用数据 SDK 并声明 `application-workspaces`。猜测宿主默认工作区或其他应用工作区的 ID，也无法读取其中的聊天。目录失效、标识损坏或权限撤销时拒绝操作。可额外声明 `application-data`，用 `storage` 保存选择；详见[应用数据与工作区](data.md)。

在用户点击新建等明确操作中创建会话：

```ts
const chat = getApplicationChatClient();
const session = await chat.createSession({
  workspaceId,
  sceneId: "assistant",
  profile,
});
const chatId = session.identity.id;
```

每次 `createSession()` 都生成新的聊天记录 ID；不要在 React 挂载 effect 中创建。尚无消息的会话只保留于宿主内存，首次发送后进入历史列表。`useApplicationChatSession({ workspaceId, chatId })` 只打开和观察已有会话，StrictMode 重挂载不会创建或发送。

列出当前应用在指定工作区的对话，再直接使用记录 ID 打开：

```ts
const conversations = await chat.listSessions({ workspaceId });
// 列表包含 chatId、sceneId、title、createdAt、updatedAt、messageCount。
const session = await chat.openSession({
  workspaceId,
  chatId: conversations[0].chatId,
});
```

`openSession` 不接受 `profile`，不存在的记录返回错误。宿主从记录恢复原场景；知道其他记录的 ID 不会获得访问权。列表不包含其他应用记录、真实路径、凭据或提示词。

## 组合界面

```tsx
<Chat.Provider session={session} viewId="business">
  <Chat.Layout className="business-chat">
    <BusinessHeader />
    <Chat.Messages renderMessage={renderBusinessMessage} />
    <Chat.Footer>
      <Chat.Error />
      <Chat.Question />
      <Chat.Composer slots={{ editor: BusinessEditor }}>
        <BusinessToolbar />
      </Chat.Composer>
    </Chat.Footer>
  </Chat.Layout>
</Chat.Provider>
```

业务组件使用 `ComposerBinding`、`useChatComposer`、`useChatControls`、`useChatSnapshot` 等公开绑定。自定义编辑器更新 `binding.setDraft({ text, blocks })`；自定义发送区域调用 `binding.submit()` / `binding.stop()`。默认发送和回答按钮直接调用动作，不依赖沙箱禁止的原生表单提交；Ctrl/⌘+Enter 由共享 Composer 处理。

应用与应用的会话／消息契约共同依赖无运行时依赖的 `@isle/chat-contracts`。`@isle/app-sdk/chat/react` 的 `react.d.ts` 由应用共享组件和 hook 自动生成，随 SDK 发布，不要手动修改。修改共享 UI 后，在 `apps/client` 运行 `pnpm build:chat-ui` 更新；`pnpm check:chat-ui-types` 只检查是否同步。构建检查公共依赖边界和声明独立可用性，类型测试双向对照实际组件签名。纯 `@isle/app-sdk/chat` 入口不会导入 React、DOM、CSS 或 Tauri。

## 无界面调用

浏览器应用可使用 `getApplicationChatClient()`；桌面 Node 应用通过注入的 `ctx.chat` 获取同一类客户端。注册业务动作时调用它，不要在 React 挂载或应用初始化时自动发送。

```ts
// chat 是浏览器 getApplicationChatClient() 或桌面 Node 应用的 ctx.chat。
const session = await chat.createSession({
  workspaceId,
  sceneId: "assistant",
  profile,
});
const detach = session.subscribe(() => {
  const snapshot = session.getSnapshot();
  // 读取消息、phase、pendingQuestion；按业务需要更新 TUI 或任务进度。
});

await session.setContext({ requestContext: currentBusinessContext });
const result = await session.send({
  text: "分析当前任务",
  requestId: businessRequestId,
});
// result.status 是 dispatched / cancelled / rejected；dispatched 不代表整轮结束。
// 不再观察时 detach()。真正结束会话时，由拥有者检查 await session.close() 的结果。
```

纯 SDK 也提供 `createApplicationChatClient(transport)`，供其他宿主或测试接入。桌面 Node 应用通过双向 stdio 与应用连接，等待聊天响应时不会阻塞普通 RPC 的输入读取。

当前真实会话拥有者仍是桌面应用。无界面应用不需要挂载聊天页面，但需要桌面宿主运行；关闭应用时会停止、保存并释放会话。本阶段没有实现独立常驻 daemon。Pi 工具执行环境不会反向注入桌面聊天客户端；其接口会明确报告该能力不可用，不启动递归聊天或加载 UI。

## 配置、权限与生命周期

- `profile` 是可序列化的场景声明，支持 `id`、`systemPrompt`、`context`、`allowedToolNames` 和 `useKnowledge`。同一会话不能更换场景定义；业务数据变化时使用 `session.setContext()`，随后发送。运行期间不允许修改上下文或运行配置。函数不通过应用消息传输。
- 运行配置通过异步 `session.updateConfig()` 更新。宿主校验模型、角色、技能、工具和知识库选项；工具范围限于当前应用注册的工具，还可由 `allowedToolNames` 进一步缩小。它不允许应用任意选择其他应用或宿主工具。
- 每次操作重新校验应用启用状态和授权，准备与派发前再次校验。停止和关闭始终允许用于当前连接已有的会话句柄。禁用／移除应用会停止并关闭该应用的会话，保存失败会在应用中报告。
- Provider 卸载只取消观察，后台任务和保存继续；同一会话可以有多个视图。不同 `viewId` 隔离草稿。应用草稿和展示偏好目前保留于 iframe 内存，整个 iframe 重载后不恢复；消息和运行配置由宿主保存。
- `session.reconnect()` 重新读取快照并恢复观察，不重新发送。快照带修订号，旧请求和旧观察者的事件不会覆盖新状态。连接句柄不能跨应用、跨 iframe 或跨原生宿主进程复用；连接重建后再次用记录 ID 打开。
- `send()` 的运行授权失败返回 `rejected` 并在会话快照报告原因；参数校验／传输异常可能拒绝 Promise，调用方应处理这两类失败。未确认响应时先重新连接查看实际状态，不能盲目重发；显式 `requestId` 在当前宿主会话生命周期内去重。其他会话操作返回 `OperationResult`，错误也投影到快照供默认 UI 展示。
- 唯一聊天 ID 是 `meta.id`；`meta.workspaceId` 表示所属工作区，`meta.origin` 保存权威提供者和场景：`{ kind: "application", applicationId, sceneId }`。内置场景使用 `{ kind: "builtin", sceneId }`。来源由宿主写入且不可更改，列表和恢复使用同一份信息；`options.profile` 单独保存场景配置及最新动态上下文，与消息、运行选择共用保存队列。`profile.id` 是配置身份，不参与归属与权限判断。不保存凭据，不复制 Pi 执行上下文，不补齐或迁移旧记录。

## 从应用侧栏继续聊天

任务结束会让会话回到空闲状态，不会释放拥有者。侧栏打开应用记录时，直接观察宿主中的同一会话，因此保留应用上下文、工具范围和后台执行状态。离开侧栏或应用页面只取消观察。

应用重启后，侧栏根据记录来源恢复应用会话，重新校验应用启用状态、工作区、知识库和当前工具归属。应用禁用、删除或能力不可用时，侧栏通过公共 `Chat.History` 只读展示消息，保留复制功能，不创建运行会话或显示输入、发送、追问及模型／能力选择。已打开的侧栏也会在禁用或删除时切换到只读。恢复应用后点击「重新连接」可继续使用原会话。公共 `Chat.History` 接受 `connecting`、`retryError` 和 `onRetry`：重连时显示进度并禁用按钮，失败时保留消息并报告原因。没有可恢复来源的记录不提供 `onRetry`，只保留只读说明。

从应用与侧栏打开同一对话仍连接同一拥有者。动态上下文在重开时恢复，业务需要更新时调用 `setContext()`。需要更换场景定义时调用 `createSession` 创建新对话，已有对话的场景归属保持不变。

## 验证

在 `apps/client` 中运行 `pnpm test:chat:application`：构建共享 UI、核对公开组件声明、打包隔离测试应用，运行无 UI／代理／权限／并发／实际 Node 应用 stdio 回归。`pnpm test:chat` 保留原核心、桌面宿主和 DSH schema 回归。

已有 1420 开发环境的 `/scripts/app/chat/application-browser.html` 挂载真实 `ApplicationFrame` 和打包后的测试应用，使用内存 Runtime 与存储。包含默认和组合 Chat、模型与能力选择、暂停授权、停止、追问、视图卸载／重挂载。它不安装应用、不读写真实用户历史，也不等同于真实模型和重建后 Tauri 程序的端到端验收。

回归覆盖应用身份与权限隔离、只读历史、元数据列表、无场景参数重开、准备期停止、流式事件、追问、保存与后台运行。前端构建仍提示大 chunk。真实模型及重建后 Tauri 的完整链路需单独验收；测试不会启动或重启开发服务。

### 执行权限

聊天配置通过 `permissionMode: ChatPermissionMode | null` 选择执行权限；
`ChatPermissionMode` 来自生成的 `AgentPermissions["mode"]`，当前模式为 `ask`、`auto`、`full`。
应用与宿主共同读取 `resources.permissionOptions`，用返回的名称、说明、默认项展示并校验权限选择。
目录加载前选择为 `null`，目录不可用时禁止发送。`profile.allowedToolNames` 仍用于场景能力分配，不参与安全规则判断。

Runtime 在实际执行前识别操作并进行安全检查。需要审批时，原调用直接等待宿主主窗口确认；
无需模型调用额外授权工具或重试。一分钟未批准即拒绝，排队时间计入这一分钟。
等待审批不暂停主/子 Agent 的超时计时。

应用可以观察只读的 `snapshot.pendingApproval`；SDK 没有审批方法，`session.answer()`
只能回答普通问题。后台和无界面会话同样使用宿主审批。`auto` 自动放行低、中风险操作，
高风险或无法完整分析的执行需要人工确认，不调用审核 Agent。

工具执行权限由 Runtime 策略统一控制。已启用的应用工具和内置业务工具按定义声明的风险等级审批；未声明风险的工具仍使用未知操作策略。已启用应用的加载不再单独请求审批。Agent Runtime 加载应用及执行工具均在本轮执行的沙箱进程中进行，三档共同遵守基础限制；
桌面单独管理的 ApplicationHost 和直接 UI 调用不属于这个执行边界。
