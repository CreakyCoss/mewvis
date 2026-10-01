# 应用工坊

应用工坊位于 `apps/applications/builtins/app-workshop`，以普通内置应用接入 Isle。小应用先创建项目，再进入编辑页修改或让 AI 生成源码；构建完成后，用户保存版本并在应用工坊中使用。

## 页面与流程

首页采用左侧应用列表、右侧所选应用介绍和界面预览的布局。首页预览不接受交互；点击「使用」后打开已保存版本。没有保存版本的项目显示「待生成」。

编辑页采用文件树、源码／运行预览、AI 开发助手三栏布局。可新建、编辑、删除源码文件，查看构建错误的位置，重新运行预览，保存版本和恢复历史版本。切换文件、离开编辑页、发送需求前会保存当前源码；发生并发修改冲突时保留本地内容，由用户重新读取或处理。

运行版本与开发草稿分别维护。编辑或构建失败不会替换正在使用的版本。历史恢复会替换草稿源码和正在使用的版本，操作前显示确认说明。

## 接入与边界

应用声明 `application-workspaces`、`application-data`、`workspace-files`、`chat` 和 `embedded-views` 权限。工坊使用已有公共 SDK 管理工作区、聊天与子视图，不引入专用宿主业务命令。

每个小应用使用独立、专属登记的工作区。项目源码保存在 `.workshop/project.json` 的文件映射中，通过工坊的源码工具管理；构建产物及其源码快照保存在 `.workshop/builds`。源码提交使用 revision 检查、文件锁和原子替换；宿主进程退出遗留的锁只在确认原进程不存在后回收。文件读取检查大小和符号链接；删除项目只允许当前应用登记的专属工作区。

AI 会话通过公共 `Chat` 组件与 `ApplicationChatSession` 接入，每个项目拥有独立的 `workshop-developer` 场景。开发助手仅能调用以下工具：

- `workshop_read_project`、`workshop_read_file`：读取当前项目与源码。
- `workshop_write_file`、`workshop_delete_file`：使用最新 revision 修改源码。
- `workshop_build`：编译并返回诊断。

创建、版本保存、历史恢复及删除项目由界面操作。开发会话不授予安装依赖、进程执行或联网能力。

编译器只读取内存中的源码映射，用 TypeScript 转译并解析导入关系。生成代码不会在 Node 宿主中执行；浏览器产物仅在 `sandbox="allow-scripts"`、不透明源、严格 CSP 的子视图中运行。应用工坊为子视图提供 `state.read` 和 `state.write` 两个方法，状态按项目及 preview／live 范围隔离。子视图不能读取其他项目、获取工坊的宿主桥或直接调用系统工具。

## 当前支持范围

支持项目内 JS、JSX、TS、TSX 和 CSS，以及 React、`react/jsx-runtime`、`react-dom/client`、`@isle/app-sdk/views`。入口为 `main.tsx`。构建产物附带 Isle 公共主题令牌；宿主主题更新仍通过视图 SDK 传递。

暂不支持任意 npm 依赖、Node 后端、外部资源或网络。CSS 的 `@import` 和 `url()` 会产生构建诊断。每个项目最多 32 个文件、512 KiB 源码，每个文件最多 128 KiB；每个构建最多 3 MiB，保存版本最多 100 个。

## 开发与验证

```sh
pnpm --filter @isle/app-workshop check
pnpm --filter @isle/app-workshop test
pnpm --filter @isle/app-workshop dev -- --seed
```

本地预览位于 `http://127.0.0.1:5183/`。预览在显式隔离的临时目录执行真实 Node 项目工具；`--seed` 仅为预览创建示例项目，不会为安装后的应用自动添加示例。预览聊天使用 SDK 内存模拟，不调用真实模型；最终模型行为须在 Isle 中验证。停止并重新启动预览会创建新的临时目录；同一次预览中的页面刷新保留源码，聊天及运行状态为内存数据。

内置应用统一打包入口会先生成编译器、React 浏览器运行时与主题资源，再打包工坊。构建生成文件不纳入版本管理。
