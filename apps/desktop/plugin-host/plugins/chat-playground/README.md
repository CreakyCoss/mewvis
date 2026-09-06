# 聊天调试台 · @isle/chat-playground

Isle 内置聊天调试插件，用来调试当前 Chat SDK。源码放在 `plugin-host/plugins/chat-playground`，随应用自动构建，默认启用；已有用户禁用设置仍然优先。

## 已接入的能力

- 列出已有工作区，使用业务会话 ID 连接或恢复聊天；新会话生成独立 ID。
- 默认 `<Chat>` 与公开组合组件可切换，主视图共用 `viewId`，切换保留草稿；双视图的第二个输入框拥有独立草稿。
- 定制界面使用青绿色主题、助手消息侧边线、示例填充按钮，保留共享 Lexical、模型／技能／工具／知识库菜单与发送、停止、追问组件。
- 检查器展示消息数、工具调用数、任务、运行配置和保存状态，支持重新同步、刷新资源、立即保存和明确关闭。
- 可应用动态业务上下文。切换工作区、会话或隐藏聊天只切换视图，旧任务继续在宿主运行。
- `chat_playground_echo` 仅返回输入文本和字符数，供模型调用调试；不执行网络、文件或嵌套模型操作。

业务代码 `ui.tsx` 只导入 React 与公开 SDK，不使用应用内部 Store、Tauri、AgentClient 或聊天状态机。`preview.tsx` 是单独的开发宿主适配，不会打进插件。

## 内置构建与使用

在仓库的 `apps/desktop` 目录执行：

```sh
pnpm plugin:validate -- plugin-host/plugins/chat-playground
pnpm exec tsc -p plugin-host/plugins/chat-playground/tsconfig.json
node agent-runtime/scripts/pack-portable-plugins.mjs
```

应用的 `build:agent-runtime` 已包含上述内置打包流程。聊天调试台生成到 `agent-runtime/dist/plugins/chat-playground`，使用 Isle 格式；其他已有插件保持 DSH 兼容格式。构建后在当前开发应用的插件页面刷新列表，即可进入「聊天调试台」，不需要本地导入。若之前手动禁用过，在插件管理中重新启用即可。

需要宿主包含插件 Chat SDK 和桥接实现（提交 `884d43251` 或之后）。旧原生程序即使前端已热更新，也可能缺少 `post_plugin_chat`；需要使用已构建对应原生代码的开发环境。此插件不会启动或重启开发服务。

进入「聊天调试台」，选择工作区后点击「新会话」，由宿主生成记录 ID。已保存对话可从「插件对话」列表选择，也可以输入已有记录 ID 后点击「连接会话」。创建来源固定为本插件的 `debug` 场景；当前连接显示在表单下方。插件不会在挂载时创建会话或自动发送模型请求。

「插件对话」列出本插件在当前工作区已保存的对话，选择后立即恢复原场景和消息；也可点击「刷新对话」重新查询。列表不显示普通聊天或其他插件的记录。新会话首次发送保存后会出现在列表中，切换列表不会停止后台任务。禁用或移除插件后，可在应用侧栏只读查看其历史。

工作区须先在 Isle 中创建。权限包括 `chat`、`workspace-files`、`chat-knowledge`；实际发送会使用选中的宿主模型并保存历史。插件只拿工作区 ID，不拿真实目录或模型凭据。工具选择限于本插件的回显工具，当前不会申请其他宿主工具（包括 `ask_user`）；追问面板可在下述内存预览中验证，普通消息里的提问不等同于结构化追问事件。

修改源码后，重新运行内置打包脚本并刷新应用插件页面即可。下述独立预览读取源码目录内的 `dist/isle`，修改后运行 `pnpm plugin:pack -- plugin-host/plugins/chat-playground --target isle` 更新预览产物。两种方式都不需要启动第二个开发服务。

## 使用已有 1420 服务预览

先执行 `pnpm plugin:pack -- plugin-host/plugins/chat-playground --target isle`，并确保共享 UI 产物存在（缺失时执行 `pnpm build:chat-ui`）。打开：

[聊天调试台预览](http://localhost:1420/plugin-host/plugins/chat-playground/preview.html)

预览通过真实 `PluginFrame` 和打包后的插件 UI 运行，共享真正的 Chat 核心、SDK 和组件；模型、知识库与存储由内存测试适配提供。顶部明确显示「内存预览」，不读取或修改真实工作区、不调用真实模型。刷新页面会清空预览历史。

建议检查：

1. 点击「新会话」，点击「Markdown」填入示例，再手动发送。
2. 打开双视图，观察同一消息；切换默认／定制界面，确认主输入草稿保留。
3. 切换到另一个工作区，确认列表隔离且原 ID 无法打开；切回可从列表恢复之前的记录。
4. 填入示例后先点击预览顶部的「暂停授权」，再发送和停止，恢复授权后派发数不应增加。
5. 发送包含「追问」的文本，在共享追问组件回答；发送「工具调用」示例观察模拟工具事件。
6. 隐藏聊天后等待流式完成，再恢复视图；检查器仍能观察宿主状态。
7. 应用业务上下文后发送，检查预览回复；关闭会话后再次连接同一 ID，确认历史恢复。

预览模拟的工具事件不执行 Node 工具；`test.mjs` 会通过实际 Node Plugin Host 验证打包后的回显工具和 UI 文档。

## 验证命令

同样在 `apps/desktop` 中执行：

```sh
pnpm build:plugin-host
pnpm exec tsc -p plugin-host/plugins/chat-playground/tsconfig.preview.json
node plugin-host/plugins/chat-playground/test.mjs
node agent-runtime/scripts/pack-portable-plugins.mjs
node plugin-host/plugins/chat-playground/test.mjs --bundled
```

`test.mjs` 会重新打包插件、使用临时目录启动 Node Plugin Host、校验 UI 文档和工具调用。加上 `--bundled` 则直接验证应用实际内置产物，并检查其他插件仍保留 DSH 兼容格式。不会安装插件或访问真实用户数据。构建产物 `dist/` 不纳入 Git。

已验证：插件及预览 TypeScript 检查、实际 Node Host 加载与工具调用、前端构建；1420 浏览器中检查了界面切换与草稿保留、多视图、工作区隔离、准备期停止、后台运行、动态上下文、工具展示、追问回答、关闭后恢复和浅色／深色样式。真实模型与原生应用中的完整交互仍需验收。本轮通过内置清单设置默认启用，没有修改用户插件注册表或重启开发服务。
