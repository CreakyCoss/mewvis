# 应用文件与宿主预览

`@mewvis/app-sdk/files` 提供完整路径的文件接口。应用定义自己的目录和业务文件格式；宿主统一负责访问检查、原子保存和只读预览。接口不创建新的目录授权制度，不要求媒体进入统一素材数据库。

## 权限与范围

应用声明 `workspace-files` 才能建立文件连接。每次操作由宿主连接确定应用身份，只允许当前应用的数据目录，以及它已登记、标识有效且仍可访问的工作区。访问登记工作区还需保留 `application-workspaces` 声明。应用不能通过传入另一个应用 ID 或数据库路径改变范围。

宿主自己的客户端可以使用宿主数据目录和宿主已登记的工作区，包括默认工作区；应用不会自动获得这些目录。自行建立的项目目录，需要通过现有工作区 SDK 登记后才成为本接口的允许范围。范围外直接拒绝，不发起审批，也不随 Agent 的 `full` 档位扩大。

所有文件操作经过同一个 `authorize(connection, filePath, action)` 检查，包含复制/移动两端，以及预览资源的每次流式请求。拒绝父目录跳转、符号链接和多硬链接文件。根目录不能被覆盖、移动或删除；宿主管理的应用数据库、设置、安装包，以及工作区数据库、`.mewvis` 和 `.git` 元数据禁止修改。

这项约束属于新 SDK 和预览服务，不改变 Agent 的现有沙箱和审批规则，也不会拦截应用 Node 代码自行调用 `node:fs`。缺少文件服务的开发预览和独立 Agent 环境明确返回能力不可用，不回退到浏览器存储或任意文件读取。

## 实现位置

前端预览集中在 `apps/client/src/workbench/shell/files/`：`index.tsx` 提供非弹窗 `FilePreview` 统一组件，管理加载与类型分发；`FilePreviewHost` 监听宿主弹窗请求并复用该组件。资源获取与连接清理由 `use-file-preview.ts` 管理。`preview-dialog.tsx` 负责公共面板布局。共享渲染核心和所有格式渲染器集中在 SDK 的 `files/view.js`、`files/renderers/`，应用组件、普通 JS 接口与宿主界面均复用它们。

后端集中在 `apps/server/src/modules/files/`：`application-files.ts` 接收协议并协调生命周期，`access.ts` 统一校验连接身份、路径和文件打开，`operations.ts` 实现文件操作及原子保存，`preview.ts` 管理只读预览资源和流式读取。两项服务共享同一个 `FileAccess`，权限检查不依赖前端界面。

`util.ts` 集中提供无状态的文件基础方法，目前包含应用、宿主、工作区的受保护文件路径和 SQLite 附属文件列表，供应用文件范围、宿主文件范围和应用数据库完整性检查复用。

## 使用

内置「调试台」的「文件与预览」页面提供图片、文本、音频和 PDF 示例，并支持导入本地文件副本或输入允许范围内的完整路径，体验页面内预览与宿主弹窗。

```ts
import { getApplicationFileClient } from "@mewvis/app-sdk/files";

const files = getApplicationFileClient();
const { dataPath, workspacePaths } = await files.roots();
const path = `${dataPath}/files/project.json`;
await files.writeText(path, JSON.stringify({ title: "新项目" }));
const previous = await files.stat(path);
await files.writeText(path, JSON.stringify({ title: "更新项目" }), {
  overwrite: true,
  expectedModifiedAt: previous.modifiedAt,
});
const project = JSON.parse(await files.readText(path));
```

原生 Node ApplicationHost 可以 `inject: ["files"]`，通过 `ctx.files` 使用相同客户端、相同路径检查。浏览器页面从公开 SDK 取客户端；底层连接令牌只保留在父页面，不交给应用 iframe。

| 接口                                           | 行为                                                   |
| ---------------------------------------------- | ------------------------------------------------------ |
| `roots()`                                      | 当前调用者的数据目录和可用工作区目录；不创建默认工作区 |
| `stat(filePath)`                               | 普通文件或目录的名称、完整路径、大小、修改时间         |
| `list(filePath)`                               | 直接子项，最多 4096 项，不遍历、不返回符号链接         |
| `mkdir(filePath)`                              | 递归创建范围内的目录                                   |
| `readText/readBinary`                          | UTF-8 文本或字节；默认分配上限 16 MiB                  |
| `readChunks(filePath)`                         | 按 64 KiB 读取，适合大文件；读取期间变更会失败         |
| `writeText/writeBinary`                        | 分块暂存，提交后原子发布；覆盖需显式 `overwrite: true` |
| `beginWrite/writeChunk/commitWrite/abortWrite` | 自行传送有序字节块；每块最多 64 KiB                    |
| `copy/move(source, destination)`               | 普通文件复制/移动，两端校验，目标必须不存在            |
| `remove(filePath)`                             | 删除普通文件或空目录，非递归                           |
| `preview.open(container, { filePath })`        | 在调用者自己的 DOM 容器显示文件，返回可关闭的预览实例  |
| `preview.openDialog({ filePath })`             | 打开宿主只读弹窗                                       |
| `preview.create/describe`                      | 获取当前连接拥有的只读资源描述，不能查询其他连接的预览 |
| `preview.close(id)`                            | 关闭当前连接的预览；不能关闭其他连接的预览             |

保存使用同目录临时文件和原子发布，未提交时原文件保持可读。`expectedModifiedAt` 可检测并发修改；失败保留原文件。连接撤销、应用停用或超时清理未提交的保存。每个连接最多 4 个暂存保存，空闲 10 分钟过期。文件目录迁移、项目格式迁移和业务索引仍由应用处理。

## 预览

```ts
const preview = await files.preview.openDialog({
  filePath: `${workspacePaths[0]}/videos/shot-01.mp4`,
});
// 默认打开宿主弹窗，应用不需要自己挂载播放器。
await files.preview.close(preview.id);
```

应用可以直接使用分开的 React 组件，二者共享 `FilePreviewInput`（当前为 `{ filePath }`）：

```tsx
import { FilePreview, FilePreviewDialog } from "@mewvis/app-sdk/files/react";

<FilePreview filePath={assetPath} style={{ height: 360 }} />
<FilePreviewDialog filePath={assetPath} open={open} onOpenChange={setOpen} />
```

普通 JS 应用自行规划区域，调用同一套入参：

```ts
const view = await files.preview.open(container, { filePath: assetPath });
await view.ready;
await view.close();
const dialog = await files.preview.openDialog({ filePath: assetPath });
await files.preview.close(dialog.id);
```

只需声明 `workspace-files`。组件及 `open` 接口在应用自己的 DOM 中显示内容，自然参与布局、滚动、裁剪和遮挡，不再同步坐标或由宿主覆盖绘制。路径切换、卸载、容器移除、预览过期或撤销时停止读取并释放对应资源。`FilePreviewDialog` 的 `open` 控制弹窗生命周期，用户关闭时通知 `onOpenChange(false)`。

音视频内联预览支持可选的本地播放接口：`onMediaReady(controls)` 提供 `play()`、`pause()`、`seek(seconds)`，关闭时回调 `null`；`onMediaStateChange(state)` 同步 `currentTime`、`duration`、`paused` 和 `ended`。元数据加载前 `duration` 为 0，不执行定位。`mediaControls={false}` 隐藏原生控件并静音，适合时间轴缩略图。React 组件直接接收这些属性；普通 JS 使用 `files.preview.open(container, input, options)` 的第三个参数。它们不经过 Server，不扩大文件权限。

宿主界面也可使用 `@/workbench/shell/files` 中的 `FilePreview`，完整路径模式创建自己的连接，`applicationId` 由可信宿主指定；通过 `previewId` 则复用已存在的只读预览，由原创建者负责关闭。

应用获得的是宿主检查后创建的、单文件的短期只读 URL。每次 GET/HEAD/Range 仍检查原连接、权限、工作区范围、文件身份和有效期，URL 不接受用户路径，也不携带通用宿主凭据。只在这个能力资源路由开放无凭据 CORS；普通命令和事件接口仍保持原来源与认证限制。

声明 `workspace-files` 的应用 CSP 仅允许图片、媒体和读取访问宿主的 `/api/file-previews/` 路径前缀，以及本地 Blob PDF 运行时；不开放通用后端请求或任意外部网络。PDF.js 模块与 Worker 由可信宿主提供，在应用本地创建 Blob，关闭时回收。缺少文件服务的旧宿主和独立开发预览返回能力不可用。

首版支持常见图片、音频、视频、PDF 和 UTF-8 文本。音视频使用当前浏览器支持的编码；PDF 使用宿主打包的 PDF.js，在 Canvas 中分页显示，不执行文档脚本、表单或链接动作；PDF 预览上限为 64 MiB。文本只展示前 2 MiB，并标记截断。HTML/XML/代码按纯文本显示，不执行文档内容。PPT/PPTX 等尚未接入内容渲染的格式明确显示不可预览，仍可打开/下载原文件；不会伪造预览成功。

资源地址只授予单个文件的临时只读访问，不携带通用宿主凭据，也不接受路径参数。视频支持 GET/HEAD 和单段 Range 请求，可定位播放。预览固定已打开的文件句柄；文件变更、权限/工作区登记撤销、连接关闭、应用停用或者 10 分钟到期后失效。关闭面板结束对应流，释放句柄。最多同时保留 64 个预览。

资源描述只属于当前文件连接；应用不能通过另一个预览 ID 获取其他连接的资源 URL。授权规则不依赖客户端渲染方式。

## 错误和验证

错误通过 `ApplicationFileError.code` 表达，包括 `PERMISSION_DENIED`、`INVALID_ARGUMENT`、`FILE_NOT_FOUND`、`FILE_EXISTS`、`FILE_CHANGED`、`LIMIT_EXCEEDED`、`INVALID_ENCODING`、`CAPABILITY_UNAVAILABLE` 和 `PREVIEW_EXPIRED`。传输失败不自动重试写入，应重新读取确认提交结果。

```sh
pnpm --filter @mewvis/app-sdk test
pnpm --filter @mewvis/app-host build
pnpm --filter @mewvis/server build
node --test apps/server/test/modules/application-files.test.mjs
pnpm --filter client test:app-host:files:browser
pnpm --filter client test:app-host:playground-files:browser
```

回归使用临时目录和真实的应用工作区 SQLite 登记，覆盖隔离、链接越界、原子保存、并发覆盖检测、二进制分块、复制/移动、撤销清理，以及 HTTP 预览 Range/HEAD 和失效资源。不会读写用户应用数据。

浏览器回归需要 Playwright 和 Chromium/WebKit，可通过 `MEWVIS_PLAYWRIGHT_MODULE` 指定已安装的模块。测试真实应用 iframe、SDK 桥接、宿主文件服务与预览面板，验证 SDK React 组件、宿主弹窗与内嵌的文本、图片、音频和 PDF 显示、不支持格式提示，以及应用自身 DOM 渲染、自然滚动与弹层遮挡、普通 JS 区域接口、文件切换、越界拒绝和卸载后的资源失效。

调试台回归加载真实打包后的应用，额外验证示例文件保存、本地文件分块导入、输入路径与回车打开、切换页面后的清理，以及小屏幕布局。
