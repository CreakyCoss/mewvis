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
    profile,
  });
  return session ? <Chat session={session} /> : <Chat.Loading error={error} />;
}
```

业务维护逻辑 `chatId` 和 `workspaceId`。`getPluginChatClient().listWorkspaces()` 返回获授权的工作区 ID、名称和默认标记，不返回磁盘路径。宿主将插件身份、工作区和逻辑 ID 映射到独立会话与安全磁盘 ID；插件不传 `scope`、真实目录或凭据。同一个逻辑会话再次打开会恢复历史。

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
const session = await chat.openSession({ workspaceId, chatId, profile });
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
- `session.reconnect()` 重新读取快照并恢复观察，不重新发送。快照带修订号，旧请求和旧观察者的事件不会覆盖新状态。连接句柄不能跨插件、跨 iframe 或跨原生宿主进程复用；连接重建后再次用逻辑 ID 打开。
- `send()` 的权限／传输异常可能拒绝 Promise；调用方应处理失败。未确认响应时先重新连接查看实际状态，不能盲目重发；显式 `requestId` 在当前宿主会话生命周期内去重。其他会话操作返回 `OperationResult`，错误也投影到快照供默认 UI 展示。
- 历史仍使用原 `meta.json`、`messages.json`、`options.json` 和 Pi session；没有迁移或重写真实用户数据。动态业务上下文由业务重新提供，不作为第二份可编辑模型执行上下文保存。

## 验证

在 `apps/desktop` 中运行 `pnpm test:chat:plugin`：构建共享 UI、核对公开组件声明、打包隔离测试插件，运行无 UI／代理／权限／并发／实际 Node 插件 stdio 回归。`pnpm test:chat` 保留原核心、桌面宿主和 DSH schema 回归。

已有 1420 开发环境的 `/scripts/chat/plugin-browser.html` 挂载真实 `PluginFrame` 和打包后的测试插件，使用内存 Runtime 与存储。包含默认和组合 Chat、模型与能力选择、暂停授权、停止、追问、视图卸载／重挂载。它不安装插件、不读写真实用户历史，也不等同于真实模型和重建后 Tauri 程序的端到端验收。

本阶段验证结果：插件 Chat 的 9 项自动测试、原核心与桌面适配的 24 项测试、DSH Schema 回归、插件打包与 UI Host 回归、12 项 Rust 插件相关测试、公开 API 类型检查和前端构建均通过。原 Chat 浏览器回归通过 21 项断言；插件测试页已验证快捷发送、准备期停止且不迟到派发、流式文本／思考／工具事件、追问、视图卸载后后台运行、重挂载与同步停止，控制台无错误。前端构建仍提示大 chunk。真实模型及重建后 Tauri 的完整链路尚未验收。
