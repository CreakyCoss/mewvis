# Mewvis 中文文档

这里是 Mewvis 详细文档的统一入口。[仓库首页](../README.md)提供项目介绍和快速启动。文档按主题分章，可在 [在线文档站](https://creakycoss.github.io/mewvis/) 中使用章节导航和全文搜索，也可在仓库中阅读，或通过应用内「文档中心」离线查阅。

## 从这里开始

- [开发指南](guide/development-guide.md)：项目定位、SDK 对比与内置／外部应用实践。
- [应用开发](apps/development.md)：从创建项目到工具、技能和界面接入。
- [插件开发](extensions/development.md)：扩展聊天流程、宿主服务和界面。
- [桌面应用开发](guide/desktop.md)：安装、启动与构建。
- [Agent 运行时](runtime/overview.md)：SDK、通信与协作工作流。
- [Node 后端服务](runtime/server.md)：独立启动、HTTP 接口与进程管理。
- [Chat 架构](architecture/chat.md)：共享聊天核心、界面与桌面宿主。
- [完整目录](SUMMARY.md)：按章节查找全部文档。

## 仓库结构

```text
mewvis/
├── apps/client/         桌面与 Web 共用的 React 前端
├── apps/desktop/        Tauri Rust 宿主与桌面打包命令
├── apps/agent-runtime/  Agent 运行时
├── apps/applications/   内置应用
├── apps/server/         独立 Node 后端服务
├── apps/extensions/     内置插件
├── packages/            应用与插件 SDK、开发工具链和共享契约
├── ai/pi/               通过 Git Subtree 引入的上游依赖
└── docs/                按章节组织的中文文档
```

上游依赖、内置技能和分发模板的原始说明随各自资源保留。第三方许可不迁移、不改写。根目录 README 作为项目入口，新增详细说明写入这里，不在源码目录新增 README。

## 阅读约定

正文默认使用简体中文，API 名称、路径、协议字段和可执行命令保留原名。页面中的源码相对路径以所介绍模块为基准，命令会注明执行目录。

正文描述当前支持的功能和开发方式；涉及旧数据时单独说明兼容范围。开发草稿、阶段复核和临时验收记录不收录到正式目录。

文档目录与离线阅读器共用 [SUMMARY.md](SUMMARY.md)。修改后执行 `pnpm docs:check` 检查覆盖和链接，执行 `pnpm docs:build` 更新离线索引。详见 [文档维护](guide/documentation.md)。
