# `__PLUGIN_NAME__`

安装依赖后运行 `pnpm dev` 开发，`pnpm check` 检查，`pnpm build` 生成 `dist/isle` 可安装插件。

- `main/App.tsx` 默认导出 React 页面，不需要编写 React 启动或宿主桥接代码。
- `main/host/tools.ts` 默认导出宿主工具数组，由工具链生成注册入口。
- `main/host/skills.ts` 默认导出 `defineSkill()` 数组，在 `isle.config.ts` 的 `host.skills` 中指定入口，由工具链自动注册。
- 页面通过 `@isle/plugin-sdk/browser` 的 `getPluginHost().executeTool()` 调用自己的工具，通过 Chat SDK 使用聊天。
- `main/contracts.ts` 放共享数据类型，页面不能直接导入 `main/host/` 实现。
- 插件身份和版本以 package.json 为准，权限和能力只在 isle.config.ts 声明。
- 工作区通过 `@isle/plugin-sdk/data` 查询，只包含本插件的登记目录；模板声明 `plugin-workspaces`，不会读取宿主默认工作区。保存业务结构时另行申请 `plugin-data` 并使用 `storage`。

开发预览中的聊天、工作区、历史由公共内存宿主提供，刷新清空，不访问真实用户数据；宿主工具通过开发服务在本机 Node 进程执行真实业务代码。真实模型与安装权限需要在 Isle 内验收。

工具示例使用 Node crypto 计算 SHA-256，无文件或网络操作。可以输入空文本检查宿主 Schema 错误。

使用本地工具链生成的 `--local` 项目依赖当前检出目录。SDK 和工具链发布后可将 link 依赖换为相应版本；当前不假设这些包已经发布。

技能示例 `__SKILL_NAME__` 指导模型调用 `__TOOL_NAME__` 分析文本，并解释 Unicode 码点数与 UTF-8 字节数的区别。安装启用后新建对话，发送：

```text
请使用 __SKILL_NAME__ 技能分析文本 Hello Isle 👋 的字符数、UTF-8 字节数和 SHA-256。
```

插件技能由 Pi 自动加载，当前不出现在 Chat 的文件技能选择菜单中；工具是否可用仍受会话允许范围控制。

开发预览顶部可展开“插件技能定义”检查真实名称和内容，修改技能文件会刷新预览。静态 1420 预览未连接 Node，不能验证技能加载或模型执行。只有技能的插件可以只配置 `host.skills`，并设置 `ui: false`。
