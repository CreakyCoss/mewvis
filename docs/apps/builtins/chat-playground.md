# 聊天调试台 · @isle/chat-playground

这是使用 `@isle/app-dev` 的内置 React 应用示例，默认启用；已有用户的禁用设置仍然优先。

```text
isle.config.ts                  权限与能力配置
main/App.tsx                    工作区、应用对话、默认／组合 Chat 和会话检查器
main/preferences.ts             通过应用 storage 保存工作区和各目录最近选择的会话
main/components/HostTools.tsx    普通 React 页面调用宿主工具
main/host/tools.ts              Node 工具：低风险回显、文本分析与中风险审批测试
main/host/skills.ts             文本分析技能：使用工具的步骤与输出规则
main/contracts.ts               共享业务数据类型
main/styles.css                 定制样式
```

React 初始化、宿主工具与技能注册、SDK 连接、预览和打包由公共工具链管理。业务代码不引用 desktop 内部 Store、AgentClient、Tauri 或聊天状态机。

## 在 Isle 中调试

在仓库根目录执行：

```sh
pnpm --filter @isle/chat-playground check
pnpm --filter @isle/chat-playground build
pnpm build:runtime
```

内置产物位于 `apps/agent-runtime/dist/apps/chat-playground`，会随应用正常构建。
构建后在当前开发应用刷新应用列表并打开「聊天调试台」。不需要导入或创建另一份应用。

调试台声明 `application-workspaces`、`application-data`，通过 `@isle/app-sdk/data` 管理自己的工作区和业务状态。首次加载使用应用的默认工作区；点击「新增工作区」，填写名称，再点击「选择目录并创建」，由宿主打开目录选择器。选择已被其他应用登记的目录时，宿主显示共享提示；取消不会切换或登记目录。页面展示实际目录，应用工作区不会加入应用侧栏的工作区列表。

`storage` 保存最近选择的工作区和各目录的会话 ID。重新打开应用后，调试台查询所选目录的历史，只恢复仍存在的会话；未发送过消息的空会话不会在应用重启后自动创建。消息和运行配置继续保存在工作区的聊天记录中。切换工作区会清空当前视图，再加载该目录的历史，已有后台任务继续运行。保存选择失败或目录不可用时，界面显示错误。

宿主 Chat 只接受应用通过数据 SDK 登记的工作区 ID，并通过数据服务验证归属、标识文件和目录可用性。应用不能枚举宿主默认工作区，也不能用宿主工作区 ID 绕过登记来加载历史。原有宿主工作区的聊天不自动迁移，应用侧可保留只读历史。聊天执行、已分配目录的普通文件访问和权限档位沿用既有流程。

展开顶部「宿主能力示例 · 文本分析」，输入文本并点击「调用宿主工具」，页面通过 SDK 执行本应用的 `chat_playground_inspect_text`。返回值包含字符数、UTF-8 字节数和真实 Node crypto 计算的 SHA-256；清空输入可检查失败提示。这个工具不调用模型、不读写文件。

现有的 `chat_playground_echo`、`chat_playground_inspect_text` 都声明为 `low`。新增的 `chat_playground_medium_risk` 声明为 `medium`，复用回显逻辑，仅用于验证审批，不读写文件或访问网络。点击「查询当前工具授权」可查看工具的授权状态和声明风险。

测试中风险审批时，先在应用管理的工具权限中确认 `chat_playground_medium_risk` 已开启；已有的自定义工具勾选不会自动包含新工具。在聊天调试台选择 `ask` 档位，点击组合界面的「中风险工具」并发送，预期出现审批；选择 `auto` 或 `full` 档位时，预期直接执行。默认界面也可以发送“请调用 chat_playground_medium_risk，text 设为中风险审批测试”。审批测试应通过聊天中的 Agent 工具调用进行；顶部 SDK 直接调用按钮用于测试工具执行，不经过 Agent 审批。

技能示例 `chat-playground-text-inspection` 在 `host.skills` 中声明，工具链自动注册到宿主。新建对话后，点击组合界面的“技能示例”填入请求并发送；默认界面可以直接输入“请使用 chat-playground-text-inspection 技能分析文本 Hello Isle 👋 的字符数、UTF-8 字节数和 SHA-256”。技能指导模型使用 `chat_playground_inspect_text` 并解释结果，不会自动调用工具或扩大工具权限。

应用技能沿用现有 Pi 加载机制，与技能页中的文件技能目录不同，目前不在 Chat 的技能选择菜单中单独显示。

聊天区域保留已有工作区／应用对话选择、会话恢复、默认／定制界面切换、双视图、检查器、动态上下文和显式关闭能力。模型仍可使用原有 `chat_playground_echo`，也可选择新的文本分析工具。切换视图不会停止后台会话。

会话来源为本应用的 `debug` 场景。对话列表只返回本应用在当前工作区创建的记录；应用禁用或移除后，应用侧栏保留只读查看。

## 普通 React 开发

在本应用目录运行 `pnpm dev`，由工具链提供开发页面和 React Refresh。聊天、应用工作区和业务状态使用内存适配；新增工作区生成 `/memory/…` 虚拟目录，整页刷新后清空，不会选择或创建真实目录。工具通过本机 Node Worker 执行真实业务代码。开发配置变化需手动重新运行 dev；业务源码变化自动更新。顶部“应用技能定义”展示从 Node 加载的实际名称与内容，修改技能会刷新预览；内存模型不模拟技能推理。该命令不会替换已占用端口上的服务。

如果要复用仓库已经启动的 1420 服务，可打开：

[静态预览](http://localhost:1420/scripts/app/dev/preview.html)

这份仓库开发入口位于 `apps/client/scripts/app/dev`，不属于应用业务，也不进入应用产物。它直接预览 React 源码和公共内存聊天宿主，无须另外启动服务。1420 未挂载工具链的 Node 接口，因此宿主工具按钮会明确提示未连接，而不会伪造执行结果。真实 Node 调用在 Isle 或应用自身的 `pnpm dev` 中验证。

## 测试

```sh
pnpm --filter client test:app-host:chat-playground
pnpm build:runtime
node apps/applications/builtins/chat-playground/test.mjs --bundled
pnpm --filter client test:app-dev
```

Node E2E 在临时目录加载真实应用宿主，检查三个工具及其风险声明、输出和错误、UI 文档、真实 Pi 技能加载与临时文件释放，以及其他内置应用的 DSH 产物。测试不读取真实用户记录、不修改应用注册表。

数据接入回归使用实际应用 Chat 服务、SDK、目录解析与调试台状态模块，在临时文件中模拟原生 IO，验证新目录内保存、重建服务后恢复、工作区隔离、权限撤销、无效目录拒绝及并发选择的保存顺序；模型执行使用测试适配。真实 SQLite、目录标识和跨进程恢复由 `pnpm --filter client test:app-host:data` 覆盖。原生目录选择弹窗和真实模型仍需在重建后的应用中验收。

更多脚手架用法见仓库 `docs/apps/development.md`。
