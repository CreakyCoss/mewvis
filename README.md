<p align="center">
  <img src="apps/client/public/assets/startup/brand-mark.png" alt="Mewvis" width="96" />
</p>

<h1 align="center">🐾 Mewvis</h1>

<p align="center"><strong>有想法，就有能用的 AI 应用</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-24C8D8?style=flat-square&amp;logo=tauri&amp;logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&amp;logo=react&amp;logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript 5" />
</p>

<p align="center">
  <a href="#设计理念">设计理念</a> ·
  <a href="#核心模块">核心模块</a> ·
  <a href="#界面预览">界面预览</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="docs/README.md">开发文档</a>
</p>

---

> **从想法到应用，触手可及。** Mewvis 把 AI 应用最难的「基座」都搭好了，你只要出想法，剩下交给它。

Mewvis 把模型接入、Agent、工具、数据存储、工作区这些 AI 应用都会用到的底层能力，收进一个安全可控的基座，再通过一套 SDK 交出去。

有了它，想到什么，随时都能做成一个能用的应用：想写小说就做个写作助手，想学一门课就做个学习导师，想看书就做个阅读器。每个应用只是固定目录里的一份代码，照着 SDK 写就行，AI 也能照着同一份 SDK 直接写出来。

日常只需要守住基座这一份代码，业务应用的代码质量不必逐个操心；以后 AI 进化、出现更好玩的能力，也只需要把基座变强，再按需调整几个业务应用，不必推倒重来。

## 💡 设计理念

### 🧱 基座做通用，应用做自己

一个 AI 应用里，真正费力的往往是那些每次都一样的底层能力。把它们收进基座，应用就只写自己独有的业务——应用代码被压到最小，守住基座这一份，就等于守住了所有应用。

### 🔗 两种扩展，各司其职

Mewvis 把「扩展」拆成两条清晰、互不混淆的边界：**应用**是一段拥有独立界面、数据与会话的完整体验；**插件**是向现有会话和 Agent 流程贡献能力的扩展点。使用者得到完整专注的场景，扩展者也清楚该在哪里接入。

### 🛡️ Agent 会动手，也受约束

Agent 不只是能回话的助手，它能真正读写文件、执行命令。但每一次动手都要经过权限与审批，并可在沙箱里执行——安全不是事后补丁，而是执行模型的一部分。

### 🔀 协作靠编排，不靠祈祷

当任务需要分工时，为多个 Agent 配置不同的角色、模型和工具，把「谁做什么、什么时候做、依赖什么」明确地写下来，而不是靠提示词去祈祷模型「自觉」配合。

### 📁 本地优先，模型无关

工作区就是一个本地目录，数据存在你自己的机器上、由你掌控；模型接入也不绑定任何一家服务商。

### 🎛️ 一个聊天内核，多种界面

聊天能力被收敛成一个与界面分离的核心：从无界面的脚本、默认的聊天界面，到自由组合的业务界面，底层都是同一套会话逻辑。这让「聊天」成为能嵌入任何场景的基础能力。

## 🧩 核心模块

| 模块 | 说明 |
| :--- | :--- |
| 📦 **应用** | 承载完整场景的最小单位，拥有独立的界面、设置、数据与会话。开发者通过应用 SDK 接入聊天、宿主工具、数据存储和工作区能力。内置应用工坊、故事工坊、学习工坊、RSS 阅读器、文档中心和调试台。 |
| 🔌 **插件** | 扩展已有会话与 Agent 执行流程，提供工具、技能、命令、上下文处理与会话侧栏，可在插件管理中配置、启用或停用。内置协作流程、智能判断和会话链路查看器，也支持通过插件 SDK 接入。 |
| 🤖 **模型与 Agent** | 统一管理模型服务与对话，支持 OpenAI、Anthropic、Google Gemini 及 OpenAI 兼容接口。Agent 可读取文件、修改内容、执行命令，经权限与审批控制执行范围；多 Agent 可配置不同角色、模型和工具，用工作流组织协作。 |
| 🗂️ **工作区** | 以本地目录组织项目，集中管理文件与会话，可保存和继续已有对话。 |

## 🖼️ 界面预览

### 🏠 应用选择

集中浏览已启用的应用，查看功能与权限声明，选择应用进入创作、学习或阅读界面。

![Mewvis 应用入口：应用选择、功能介绍与权限声明](docs/assets/screenshots/home-applications.jpg)

### ✍️ 故事工坊

章节目录、正文编辑区与创作助手集中在同一界面，也可以查看大纲、角色和伏笔等项目资料。

![Mewvis 故事工坊：小说章节、正文编辑区与创作助手](docs/assets/screenshots/story-workshop.png)

### 📖 课程学习

课时目录、教学内容与 AI 导师在同一界面中呈现，支持逐课学习、公式讲解、互动实验和测验。

![Mewvis 学习内页：课时目录、公式内容与 AI 导师](docs/assets/screenshots/learning-lesson.jpg)

### 📰 RSS 阅读器

聚合订阅源和未读文章，在今日阅读中浏览文章，并管理稍后读、收藏和订阅源。

![Mewvis RSS 阅读器：今日阅读、订阅源与未读文章](docs/assets/screenshots/rss-reader.png)

### 🐱 办公室

猫咪在像素办公室中按各自偏好走动、休息和切换活动。点击角色或显示器，可以查看活动详情与工位屏幕。

![Mewvis 办公室：猫咪角色、像素工位与不同活动的屏幕](docs/assets/screenshots/office.jpg)

## 🚀 快速开始

### ⚙️ 环境要求

- Node.js **22.19 或更高版本**
- pnpm **8.15.9**
- 桌面端开发需要 Rust 和 Tauri 2 的平台依赖，详见 [桌面开发与构建](docs/guide/desktop.md)

### ▶️ 安装与启动

在仓库根目录安装依赖并构建 AI 包：

```sh
pnpm install --frozen-lockfile
pnpm build:ai
```

**桌面端**

```sh
pnpm dev:desktop
```

**Web**

```sh
pnpm dev:web
```

启动后，在设置中添加模型服务并选择模型，再打开或创建工作区。内置应用从应用列表进入。

应用数据默认保存在 `~/.mewvis`，项目文件保存在所选工作区。安装包构建与平台配置见 [桌面开发与构建](docs/guide/desktop.md)，Web 服务配置见 [后端服务](docs/runtime/server.md)。

## 📚 开发文档

完整中文文档见 [文档首页](docs/README.md)与 [目录](docs/SUMMARY.md)，也可在应用内的「文档中心」离线阅读。

| 文档 | 内容 |
| --- | --- |
| [应用开发](docs/apps/development.md) | 创建、调试和打包应用 |
| [应用 SDK](docs/apps/sdk.md) | 接入界面、聊天、数据与工作区能力 |
| [插件开发](docs/extensions/development.md) | 扩展宿主工具与 Agent 执行流程 |
| [Agent 运行时](docs/runtime/overview.md) | 运行时架构、SDK 与通信协议 |
| [桌面开发](docs/guide/desktop.md) | 平台准备、开发与安装包构建 |

## 🤝 参与贡献

欢迎通过 Issue 反馈问题或提出功能建议，通过 Pull Request 改进代码、文档、应用和插件。提交问题时，请提供运行环境、复现步骤与相关日志。

## 🌐 社区

欢迎访问 [LINUX DO](https://linux.do/) 交流。

## 💖 致谢

Mewvis 使用了 [Pi](https://github.com/earendil-works/pi) 的模型接入与 Agent 能力：

- `@earendil-works/pi-ai`：统一的模型调用接口。
- `@earendil-works/pi-coding-agent`：Agent 会话与工具执行能力。

Pi 源码通过 Git Subtree 引入，保存在 [`ai/pi`](ai/pi) 中，并保留其 [MIT 许可证](ai/pi/LICENSE)。感谢 Mario Zechner 和 Pi 的贡献者。其他开源依赖与第三方资源的来源和许可证保留在各自目录中。
