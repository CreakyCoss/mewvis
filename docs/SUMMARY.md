# 文档目录

- [文档首页](README.md)

## 开发入门

- [桌面应用开发](guide/desktop.md)
- [Git 与上游同步](guide/git.md)
- [脚本目录](guide/scripts.md)
- [文档维护](guide/documentation.md)

## 架构与设计

- [技术规格（历史方案）](architecture/spec.md)
- [Chat 架构](architecture/chat.md)
- [应用与宿主插件边界](architecture/extensibility.md)
- [插件协议与能力映射](architecture/extensions.md)
- [前端 Agent 契约](architecture/client-contracts.md)
- [知识检索设计](architecture/rag.md)
- [视觉系统](architecture/design-system.md)
- [Chat 基座草案（历史）](CHAT_FOUNDATION_DRAFT.md)

## Agent 运行时

- [运行时概览](runtime/overview.md)
- [内置工具与技能示例](runtime/builtins-example.md)
- [宿主插件最小闭环](runtime/extensions.md)
- [宿主原生插件系统](extensions/native-host.md)
- [插件 SDK 能力与目录](extensions/sdk.md)
- [宿主服务协议与适配](extensions/host-services.md)
- [角色协作插件](extensions/collaboration.md)
- [插件包开发与管理](extensions/development.md)
- [Pi 兼容基准与协议规格](extensions/pi-compatibility.md)
- [插件中间件](extensions/middleware.md)
- [消息与回合观察事件](extensions/events.md)
- [会话压缩钩子](extensions/session-control.md)
- [Node 后端服务](runtime/server.md)
  - [Server 配置接口](runtime/server-settings.md)
  - [Server 工作区管理](runtime/server-workspaces.md)
  - [Server 业务接口](runtime/server-interfaces.md)
- [通信协议](runtime/protocol.md)
- [模型思考等级](runtime/models.md)
- [Pi 接入与子 Agent](runtime/pi.md)
- [协作模式](runtime/collaboration.md)
- [安全架构](runtime/security/overview.md)
  - [调用前安全与审批](runtime/security/approval.md)
  - [程序执行与沙箱](runtime/security/execution.md)

## 应用开发

- [应用工程](apps/development.md)
- [应用 SDK](apps/sdk.md)
- [应用数据与工作区 SDK](apps/data.md)
- [应用宿主](apps/host.md)
- [应用界面协议](apps/ui.md)
- [应用聊天](apps/chat.md)

## 内置应用

- [故事工作台](apps/builtins/story.md)
- [文档中心](apps/builtins/docs-reader.md)
- [聊天调试台](apps/builtins/chat-playground.md)
- [RSS 阅读器](apps/builtins/rss-reader.md)
- [学习工作台](apps/builtins/learning.md)

## 质量记录

- [酒馆提示词评估](quality/tavern-prompts.md)
- [界面设计验收（历史）](quality/design-qa.md)
