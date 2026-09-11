# 聊天调试台 · @isle/chat-playground

这是使用 `@isle/plugin-dev` 的内置 React 插件示例，默认启用；已有用户的禁用设置仍然优先。

```text
isle.config.ts                  权限与能力配置
main/App.tsx                    工作区、插件对话、默认／组合 Chat 和会话检查器
main/components/HostTools.tsx    普通 React 页面调用宿主工具
main/host/tools.ts              Node 工具：回显与文本分析
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
node apps/desktop/agent-runtime/scripts/pack-portable-plugins.mjs
```

内置产物位于 `apps/desktop/agent-runtime/dist/plugins/chat-playground`，会随应用正常构建。
构建后在当前开发应用刷新插件列表并打开「聊天调试台」。不需要导入或创建另一份插件。

展开顶部「宿主能力示例 · 文本分析」，输入文本并点击「调用宿主工具」，页面通过 SDK 执行本插件的 `chat_playground_inspect_text`。返回值包含字符数、UTF-8 字节数和真实 Node crypto 计算的 SHA-256；清空输入可检查失败提示。这个工具不调用模型、不读写文件。

技能示例 `chat-playground-text-inspection` 在 `host.skills` 中声明，工具链自动注册到宿主。新建对话后，点击组合界面的“技能示例”填入请求并发送；默认界面可以直接输入“请使用 chat-playground-text-inspection 技能分析文本 Hello Isle 👋 的字符数、UTF-8 字节数和 SHA-256”。技能指导模型使用 `chat_playground_inspect_text` 并解释结果，不会自动调用工具或扩大工具权限。

插件技能沿用现有 Pi 自动加载机制，与技能页中的文件技能目录不同，目前不在 Chat 的技能选择菜单中单独显示。 没有 `read` 工具的会话由宿主把已解析且允许模型使用的插件技能内容加入本轮模型上下文；有 `read` 时继续使用 Pi 原有的按需加载机制，不额外授予文件权限。

聊天区域保留已有工作区／插件对话选择、会话恢复、默认／定制界面切换、双视图、检查器、动态上下文和显式关闭能力。模型仍可使用原有 `chat_playground_echo`，也可选择新的文本分析工具。切换视图不会停止后台会话。

会话来源为本插件的 `debug` 场景。对话列表只返回本插件在当前工作区创建的记录；插件禁用或移除后，应用侧栏保留只读查看。

## 普通 React 开发

在本插件目录运行 `pnpm dev`，由工具链提供开发页面和 React Refresh。聊天使用内存模型和存储，工具通过本机 Node Worker 执行真实业务代码。开发配置变化需手动重新运行 dev；业务源码变化自动更新。顶部“插件技能定义”展示从 Node 加载的实际名称与内容，修改技能会刷新预览；内存模型不模拟技能推理。该命令不会替换已占用端口上的服务。

如果要复用仓库已经启动的 1420 服务，可打开：

[静态预览](http://localhost:1420/scripts/plugin-dev/preview.html)

这份仓库开发入口位于 `apps/desktop/scripts/plugin-dev`，不属于插件业务，也不进入插件产物。它直接预览 React 源码和公共内存聊天宿主，无须另外启动服务。1420 未挂载工具链的 Node 接口，因此宿主工具按钮会明确提示未连接，而不会伪造执行结果。真实 Node 调用在 Isle 或插件自身的 `pnpm dev` 中验证。

## 测试

```sh
pnpm --filter desktop build:plugin-host
node apps/desktop/plugin-host/plugins/chat-playground/test.mjs
node apps/desktop/agent-runtime/scripts/pack-portable-plugins.mjs
node apps/desktop/plugin-host/plugins/chat-playground/test.mjs --bundled
pnpm --filter desktop test:plugin-dev
```

Node E2E 在临时目录加载真实插件宿主，检查两个工具、输出和错误、UI 文档、真实 Pi 技能加载与临时文件释放，以及其他内置插件的 DSH 产物。测试不读取真实用户记录、不修改插件注册表。

更多脚手架用法见仓库 `docs/plugins/development.md`。
