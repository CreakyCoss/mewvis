# 插件聊天

Isle 插件使用宿主持有的 Chat 会话。纯 SDK 只镜像快照和转发操作；消息归并、Pi 执行、模型凭据解析、运行配置和历史保存都在宿主完成。这里没有第二套聊天执行引擎。

## 清单与打包

在插件 `package.json` 中声明权限及 UI 源码入口：

```json
{
  "isle": {
    "plugin": { "version": 1, "entry": "./index.js" },
    "permissions": ["chat", "workspace-files"],
    "ui": { "version": 1, "kind": "sandbox", "entry": "./ui.tsx" }
  }
}
```

`chat` 允许使用宿主模型和聊天；`workspace-files` 允许访问工作区并保存插件聊天。如果场景要使用知识库，额外声明 `chat-knowledge`，并在 profile 中设置 `useKnowledge: true`。这些用途出现在原有安装权限说明中，不自动给已有插件增加权限。原生 Node 插件仍沿用现有受信任运行模式，声明不是 Node 沙箱。

用 Isle 的 `plugin:pack` 打包。聊天 UI 可以使用 TSX，打包器会解析 SDK 子入口，并将 React、ReactDOM 和 JSX runtime 连接到宿主提供的同一实例。生成的 UI 仍符合现有脚本大小限制；Chat、Lexical、设计系统、字体和图片由宿主共享运行时提供。CSS 和 JS 由应用实际源码构建，按需加载，不复制聊天组件。插件自己的 CSS 排在默认样式之后。

聊天能力目前只支持 Isle 目标。DSH 目标会明确拒绝带 `chat` 权限的包；原有可移植工具／技能插件的打包方式不变。

## 默认界面

```tsx
import { Chat, usePluginChatSession } from "@isle/plugin-sdk/chat/react";

const profile = {
  id: "business-assistant",
  systemPrompt: "你是业务助手，请根据当前任务协助用户。",
};

export function BusinessChat({ workspaceId, chatId }) {
  const { session, error } = usePluginChatSession({
    workspaceId,
    chatId,
  });
  return session ? <Chat session={session} /> : <Chat.Loading error={error} />;
}
```

业务只保存宿主返回的 `chatId` 和选择的 `workspaceId`。`listWorkspaces()` 返回已授权工作区的 ID、名称和默认标记。插件不传 `scope`、插件身份、真实目录或凭据。

在用户点击新建等明确操作中创建会话：

```ts
const chat = getPluginChatClient();
const session = await chat.createSession({ workspaceId, sceneId: "assistant", profile });
const chatId = session.identity.id;
```

每次 `createSession()` 都生成新的聊天记录 ID；不要在 React 挂载 effect 中创建。尚无消息的会话只保留于宿主内存，首次发送后进入历史列表。`usePluginChatSession({ workspaceId, chatId })` 只打开和观察已有会话，StrictMode 重挂载不会创建或发送。

列出当前插件在指定工作区的对话，再直接使用记录 ID 打开：

```ts
const conversations = await chat.listSessions({ workspaceId });
// 列表包含 chatId、sceneId、title、createdAt、updatedAt、messageCount。
const session = await chat.openSession({ workspaceId, chatId: conversations[0].chatId });
```

`openSession` 不接受 `profile`，不存在的记录返回错误。宿主从记录恢复原场景；知道其他记录的 ID 不会获得访问权。列表不包含其他插件记录、真实路径、凭据或提示词。

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

应用与插件的会话／消息契约共同依赖无运行时依赖的 `@isle/chat-contracts`。`@isle/plugin-sdk/chat/react` 的公开声明有类型测试对照应用实际组件，纯 `@isle/plugin-sdk/chat` 入口不会导入 React、DOM、CSS 或 Tauri。

## 无界面调用

浏览器插件可使用 `getPluginChatClient()`；桌面 Node 插件通过注入的 `ctx.chat` 获取同一类客户端。注册业务动作时调用它，不要在 React 挂载或插件初始化时自动发送。

```ts
// chat 是浏览器 getPluginChatClient() 或桌面 Node 插件的 ctx.chat。
const session = await chat.createSession({ workspaceId, sceneId: "assistant", profile });
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

纯 SDK 也提供 `createPluginChatClient(transport)`，供其他宿主或测试接入。桌面 Node 插件通过双向 stdio 与应用连接，等待聊天响应时不会阻塞普通 RPC 的输入读取。

当前真实会话拥有者仍是桌面应用。无界面插件不需要挂载聊天页面，但需要桌面宿主运行；关闭应用时会停止、保存并释放会话。本阶段没有实现独立常驻 daemon。Pi 工具执行环境不会反向注入桌面聊天客户端；其接口会明确报告该能力不可用，不启动递归聊天或加载 UI。

## 配置、权限与生命周期

- `profile` 是可序列化的场景声明，支持 `id`、`systemPrompt`、`context`、`allowedToolNames` 和 `useKnowledge`。同一会话不能更换场景定义；业务数据变化时使用 `session.setContext()`，随后发送。运行期间不允许修改上下文或运行配置。函数不通过插件消息传输。
- 运行配置通过异步 `session.updateConfig()` 更新。宿主校验模型、角色、技能、工具和知识库选项；工具范围限于当前插件注册的工具，还可由 `allowedToolNames` 进一步缩小。它不允许插件任意选择其他插件或宿主工具。
- 每次操作重新校验插件启用状态和授权，准备与派发前再次校验。停止和关闭始终允许用于当前连接已有的会话句柄。禁用／移除插件会停止并关闭该插件的会话，保存失败会在应用中报告。
- Provider 卸载只取消观察，后台任务和保存继续；同一会话可以有多个视图。不同 `viewId` 隔离草稿。插件草稿和展示偏好目前保留于 iframe 内存，整个 iframe 重载后不恢复；消息和运行配置由宿主保存。
- `session.reconnect()` 重新读取快照并恢复观察，不重新发送。快照带修订号，旧请求和旧观察者的事件不会覆盖新状态。连接句柄不能跨插件、跨 iframe 或跨原生宿主进程复用；连接重建后再次用记录 ID 打开。
- `send()` 的权限／传输异常可能拒绝 Promise；调用方应处理失败。未确认响应时先重新连接查看实际状态，不能盲目重发；显式 `requestId` 在当前宿主会话生命周期内去重。其他会话操作返回 `OperationResult`，错误也投影到快照供默认 UI 展示。
- 唯一聊天 ID 是 `meta.id`；`meta.workspaceId` 表示所属工作区，`meta.origin` 保存权威提供者和场景：`{ kind: "plugin", pluginId, sceneId }`。内置场景使用 `{ kind: "builtin", sceneId }`。来源由宿主写入且不可更改，列表和恢复使用同一份信息；`options.profile` 单独保存场景配置及最新动态上下文，与消息、运行选择共用保存队列。`profile.id` 是配置身份，不参与归属与权限判断。不保存凭据，不复制 Pi 执行上下文，不补齐或迁移旧记录。

## 从应用侧栏继续聊天

任务结束会让会话回到空闲状态，不会释放拥有者。侧栏打开插件记录时，直接观察宿主中的同一会话，因此保留插件上下文、工具范围和后台执行状态。离开侧栏或插件页面只取消观察。

应用重启后，侧栏根据记录来源恢复插件会话，重新校验插件启用状态、工作区、知识库和当前工具归属。插件禁用、删除或能力不可用时，侧栏通过公共 `Chat.History` 只读展示消息，保留复制功能，不创建运行会话或显示输入、发送、追问及模型／能力选择。已打开的侧栏也会在禁用或删除时切换到只读。恢复插件后点击「重新连接」可继续使用原会话。公共 `Chat.History` 接受 `connecting`、`retryError` 和 `onRetry`：重连时显示进度并禁用按钮，失败时保留消息并报告原因。没有可恢复来源的记录不提供 `onRetry`，只保留只读说明。

从插件与侧栏打开同一对话仍连接同一拥有者。动态上下文在重开时恢复，业务需要更新时调用 `setContext()`。需要更换场景定义时调用 `createSession` 创建新对话，已有对话的场景归属保持不变。

## 验证

在 `apps/desktop` 中运行 `pnpm test:chat:plugin`：构建共享 UI、核对公开组件声明、打包隔离测试插件，运行无 UI／代理／权限／并发／实际 Node 插件 stdio 回归。`pnpm test:chat` 保留原核心、桌面宿主和 DSH schema 回归。

已有 1420 开发环境的 `/scripts/chat/plugin-browser.html` 挂载真实 `PluginFrame` 和打包后的测试插件，使用内存 Runtime 与存储。包含默认和组合 Chat、模型与能力选择、暂停授权、停止、追问、视图卸载／重挂载。它不安装插件、不读写真实用户历史，也不等同于真实模型和重建后 Tauri 程序的端到端验收。

回归覆盖插件身份与权限隔离、只读历史、元数据列表、无场景参数重开、准备期停止、流式事件、追问、保存与后台运行。前端构建仍提示大 chunk。真实模型及重建后 Tauri 的完整链路需单独验收；测试不会启动或重启开发服务。
