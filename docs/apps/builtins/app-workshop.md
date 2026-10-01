# 应用工坊

应用工坊位于 `apps/applications/builtins/app-workshop`，以普通内置应用接入 Isle。小应用先创建项目，再进入编辑页修改或让 AI 生成源码；构建完成后，用户保存版本并在应用工坊中使用。

## 页面与流程

首页保留左侧小应用列表、右侧所选应用介绍和界面预览，通过收紧列表宽度、行高、图标尺寸与区域间距提高布局密度。没有保存版本的项目显示「待生成」。

首页界面预览可以滚动查看完整内容，但不接受小应用的操作，也不会写入预览状态。点击「使用」后，已保存版本占满工坊的内容区域，只保留浮动的「返回工坊」按钮；使用页不提供开发切换或继续开发入口。修改应用需先返回首页，再进入开发页。

编辑页采用文件树、源码／运行预览、AI 开发助手三栏布局。可新建、编辑、删除源码文件，查看构建错误的位置，重新运行预览，保存版本和恢复历史版本。切换文件、离开编辑页、发送需求前会保存当前源码；发生并发修改冲突时保留本地内容，由用户重新读取或处理。

运行版本与开发草稿分别维护。编辑或构建失败不会替换正在使用的版本。历史恢复会替换草稿源码和正在使用的版本，操作前显示确认说明。

## 接入与边界

应用声明 `application-workspaces`、`application-data`、`workspace-files`、`chat` 和 `embedded-views` 权限。工坊使用已有公共 SDK 管理工作区、聊天与子视图，不引入专用宿主业务命令。

每个小应用使用独立、专属登记的工作区，源码保存在真实的 `source/` 项目目录中。`package.json`、`tsconfig.json` 属于小应用源码，与组件、样式一起编辑和纳入历史版本。工作区结构如下：

```text
<workspace>/
├── source/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .gitignore
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── styles.css
│   └── public/
├── .workshop/
│   ├── project.json
│   └── builds/
├── .isle/workspace.json
└── .isle-claw/chats/
```

`.workshop/project.json` 使用 format 2，仅保存项目说明、revision、源码摘要和版本索引，不再保存工作源码。构建产物及不可变的源码快照继续保存在 `.workshop/builds`；历史恢复会将快照写回真实源码目录。聊天继续由宿主保存在 `.isle-claw/chats`，工坊不移动或改写该目录。

工坊工具的文件路径均相对于 `source/`，例如 `src/App.tsx`，不能访问 `.workshop` 或聊天目录。源码提交使用 revision 检查、文件锁和逐文件原子替换；多文件修改通过 `.workshop/source-transaction.json` 记录事务，进程中断后继续恢复。宿主进程退出遗留的锁只在确认原进程不存在后回收。读取拒绝符号链接、硬链接、越界路径及超过限制的文件；`source/.git`、`node_modules` 和 `dist` 不作为源码读取或随版本恢复删除。删除项目只允许当前应用登记的专属工作区。

在外部编辑器修改 `source/` 后，下一次读取会更新 revision 并清除过期的草稿构建，已保存的运行版本保持原样。过期保存及事务恢复遇到外部冲突会保留现有文件并报错；中断事务存在冲突时，需先合并相关文件，使其与事务的修改前或修改后内容一致，再重新读取项目。

AI 会话通过公共 `Chat` 组件与 `ApplicationChatSession` 接入，每个项目拥有独立的 `workshop-developer` 场景。开发助手仅能调用以下工具：

- `workshop_read_project`、`workshop_read_file`：读取当前项目与源码。
- `workshop_write_file`、`workshop_delete_file`：使用最新 revision 修改源码。
- `workshop_build`：编译并返回诊断。

创建、版本保存、历史恢复及删除项目由界面操作。开发会话不授予安装依赖、进程执行或联网能力。

编译器读取 `source/` 后仅在内存中用 TypeScript 转译并解析导入关系。`package.json` 的脚本不会执行，依赖声明不能扩展工坊的依赖白名单；`tsconfig.json` 用于项目与编辑器配置，工坊仍使用固定的浏览器转译选项，并拒绝外部 `extends` 和编译插件。生成代码不会在 Node 宿主中执行；浏览器产物仅在 `sandbox="allow-scripts"`、不透明源、严格 CSP 的子视图中运行。应用工坊为子视图提供 `state.read` 和 `state.write` 两个方法，状态按项目及 preview／live 范围隔离。子视图不能读取其他项目、获取工坊的宿主桥或直接调用系统工具。

## 当前支持范围

支持项目内 JS、JSX、TS、TSX、CSS、JSON 模块，以及 React、`react/jsx-runtime`、`react-dom/client`、`@isle/app-sdk/views`。入口为 `source/src/main.tsx`；源码目录还可保存 Markdown、文本和 HTML 文档，`public/` 为预留资源目录，目前不作为静态资源服务器发布。构建产物附带 Isle 公共主题令牌；宿主主题更新仍通过视图 SDK 传递。

暂不支持任意 npm 依赖、Node 后端、外部资源或网络。CSS 的 `@import` 和 `url()` 会产生构建诊断。每个项目最多 64 个文件、1 MiB 源码，每个文件最多 128 KiB；每个构建最多 3 MiB，保存版本最多 100 个。

## 开发与验证

```sh
pnpm --filter @isle/app-workshop check
pnpm --filter @isle/app-workshop test
pnpm --filter @isle/app-workshop dev -- --seed
```

本地预览位于 `http://127.0.0.1:5183/`。预览在显式隔离的临时目录执行真实 Node 项目工具；`--seed` 仅为预览创建示例项目，不会为安装后的应用自动添加示例。预览聊天使用 SDK 内存模拟，不调用真实模型；最终模型行为须在 Isle 中验证。停止并重新启动预览会创建新的临时目录；同一次预览中的页面刷新保留源码，聊天及运行状态为内存数据。

内置应用统一打包入口会先生成编译器、React 浏览器运行时与主题资源，再打包工坊。构建生成文件不纳入版本管理。
