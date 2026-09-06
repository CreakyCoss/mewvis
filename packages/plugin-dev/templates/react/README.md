# **PLUGIN_NAME**

安装依赖后运行 `pnpm dev` 开发，`pnpm check` 检查，`pnpm build` 生成 `dist/isle` 可安装插件。

- `main/App.tsx` 默认导出 React 页面，不需要编写 React 启动或宿主桥接代码。
- `main/host/tools.ts` 默认导出宿主工具数组，由工具链生成注册入口。
- 页面通过 `@isle/plugin-sdk/browser` 的 `getPluginHost().executeTool()` 调用自己的工具，通过 Chat SDK 使用聊天。
- `main/contracts.ts` 放共享数据类型，页面不能直接导入 `main/host/` 实现。
- 插件身份和版本以 package.json 为准，权限和能力只在 isle.config.ts 声明。

开发预览中的聊天、工作区、历史由公共内存宿主提供，刷新清空，不访问真实用户数据；宿主工具通过开发服务在本机 Node 进程执行真实业务代码。真实模型与安装权限需要在 Isle 内验收。

工具示例使用 Node crypto 计算 SHA-256，无文件或网络操作。可以输入空文本检查宿主 Schema 错误。

使用本地工具链生成的 `--local` 项目依赖当前检出目录。SDK 和工具链发布后可将 link 依赖换为相应版本；当前不假设这些包已经发布。
