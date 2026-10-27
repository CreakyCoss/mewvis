# 独立知识库应用与 HTTP 接入

知识库可以独立作为网页应用运行，也可以只启动 API，由宿主按需接入。所有实现集中在 `packages/knowledge/`：

| 包        | 职责                                                     |
| --------- | -------------------------------------------------------- |
| `sdk`     | 公共契约、客户端和 HTTP Transport                        |
| `service` | SQLite、文本入库、检索和持久化任务                       |
| `server`  | 为调用方注入的 Transport 提供 HTTP RPC，可选托管静态网页 |
| `ui`      | 可嵌入的工作台、管理列表、任务中心及导入组件             |
| `app`     | 配置加载、服务装配、独立网页和命令行入口                 |

新应用使用独立的调用方数据目录，不读取宿主配置或旧知识库，也不迁移旧数据。宿主当前尚未接入这些页面。

## 启动

要求 Node.js 22.13 或更高版本。先在仓库根目录安装依赖并构建：

```bash
pnpm install
pnpm build:knowledge
pnpm start:knowledge --data /absolute/path/to/knowledge
```

默认访问 `http://127.0.0.1:4317`，API 为 `POST /api/knowledge`。数据目录必须显式提供；它存放 `knowledge.sqlite`、SQLite 的伴随文件及默认的 `originals/` 原件目录。旧格式数据库会被明确拒绝，不迁移或删除旧数据；升级试用时请指定新目录。

```bash
# 只提供 API，不托管网页
pnpm start:knowledge --data /absolute/path/to/knowledge --headless

# 空数据空间中创建少量真实示例资料
pnpm start:knowledge --data /absolute/path/to/demo-knowledge --demo

# 从 JSON 加载服务与 Embedding 配置
pnpm start:knowledge --config /absolute/path/to/knowledge.json --port 4318
```

`--data` 和 `--config` 二选一。配置文件结构沿用[服务配置](knowledge-sdk.md)，SQLite 目录按配置文件所在目录解析。Embedding 的 `credentialRef` 从同名环境变量解析，不写入数据库。`--demo` 只对没有知识库的数据空间生效。

完整应用和纯服务模式共用相同数据与生命周期。SIGINT/SIGTERM 会停止 HTTP 请求并关闭服务；未发布任务遵循[恢复机制](knowledge-service.md)。

## 网页流程

- 工作台：最左侧工具栏控制文档导航，选择知识库和文档，阅读正文或片段，在右侧测试检索。
- 管理知识库：单栏列表、名称搜索、新建、打开、侧滑编辑及更多菜单中的维护操作。
- 导入：PDF、UTF-8 TXT、Markdown 或粘贴文本。文件先上传到本地原件存储，再解析并预览；确认后提交入库任务。支持移除失败文件、取消未提交资料，并从任务中心查看处理结果。
- 原件：查看 PDF 原始排版并翻页，下载保存的文件，或重新解析原件并替换正文与索引；重新解析失败时保留已有内容。
- 任务：按知识库查看处理进度、逐文档结果、错误信息，并取消未完成任务。
- 检索：只展示服务和当前知识库可用的方式；保留无结果、失败与降级诊断。定位原文会校验文档修订、文本与 Unicode 码点范围，拒绝错误的高亮位置。

独立网页在本机浏览器保存知识库选择与文档导航状态，不保存访问令牌。任务由服务持久化，刷新网页后仍可查看。

文件解析支持可提取文字的 PDF 及 UTF-8 TXT/Markdown，不读取 `source.uri`，不上传本机路径。文件使用原始字节的 SHA-256，粘贴文本使用文本的 SHA-256 作为重复标识；同名不同内容不会自动覆盖。替换已有文档应从文档的「替换文档」入口操作，沿用该文档的稳定标识。

独立应用默认将原件保存在 `<data>/originals`，也可在配置中显式指定本地 `attachmentStorage` 目录。标准文本、分页映射和索引保存在 SQLite。PDF 在独立工作线程中逐页解析，片段不跨页，检索证据保留页码与 Unicode 码点范围。

单文件上限 32 MiB，每批文件总量 64 MiB；PDF 上限 500 页、200 万字、30 秒。受密码保护、损坏、无可提取文字的 PDF 会给出具体提示；部分空白或扫描页会在预览中警告。OCR、DOCX 等解析器、MongoDB、远端知识库及第三方存储仅保留扩展入口，未实现时返回明确错误。附件生命周期见[原始附件存储](knowledge-attachments.md)。

## 嵌入 UI

UI 只接收 `KnowledgeClient`，不创建数据库或读取凭据。接入方提供 React、设计系统主题与 Tailwind 样式处理，将 `@mewvis/knowledge-ui` 和 `design-system` 的源组件加入 Tailwind 扫描。独立应用的 `web/styles.css` 是可运行的接入示例。

```tsx
import { KnowledgeApplication } from "@mewvis/knowledge-ui";
import "@mewvis/knowledge-ui/styles.css";

<KnowledgeApplication
  client={knowledgeClient}
  serviceLabel="团队资料服务"
  preferences={localStorage}
  onConnectionSettings={() => openConnectionSettings()}
/>;
```

也可以使用 `useKnowledgeWorkspace` 配合 `KnowledgeWorkbench`、`KnowledgeManagerPage` 和 `KnowledgeTasksPage`，或单独引用 `KnowledgeDocumentView`、`KnowledgeSearchPanel`、`KnowledgeImportDialog` 和 `KnowledgeBaseDialog`。

`parseFile(file, signal, knowledgeBaseId)` 可替换默认文件解析器，并返回 SDK 标准文本；`acceptedFileTypes / fileFormatLabel` 声明当前支持的格式。`onDiscardDocument` 清理取消或移除的待导入原件；`onOpenAttachment / onDownloadAttachment / onReparseDocument` 配合已授权的附件能力提供预览、下载和重新解析。页面依据服务及知识库能力显示操作，实际权限仍由服务检查。

## HTTP 与认证

`@mewvis/knowledge-server` 不创建数据库。调用方使用 `createKnowledgeHttpServer({ resolveTransport })` 为每个请求返回授权后的 Transport；认证失败返回 `null`。身份和范围不能来自 RPC 业务参数。

独立应用默认只监听回环地址。使用 `--host 0.0.0.0` 等非回环地址时，必须通过 `KNOWLEDGE_API_TOKEN` 配置访问令牌。网页在连接界面输入现有令牌，仅保存在当前页面内存。外部部署由反向代理提供 HTTPS。

HTTP 层校验协议、UTF-8 JSON、请求体大小、Host 与 Origin，并设置请求期限。默认请求上限 16 MiB、期限 60 秒；超时的写操作可能已提交，应查看任务后再决定是否重试。服务不会自动重试写操作。

默认只允许实际监听地址与本机别名的 Host/Origin；反向代理需要在程序装配中显式传入 `allowedHosts` 和 `allowedOrigins`。这些选项不启用跨域 CORS；浏览器应通过同源代理接入。`/healthz` 只表示 HTTP 进程可用，业务状态通过 `service.probe` 获取。

静态托管只读取网页入口和 `assets` 文件；不托管数据目录。静态页面与健康检查不要求令牌，所有 RPC、文件传输和解析请求均经过认证。页面设置 CSP，并禁止第三方框架嵌入。

原件上传与下载使用 `PUT / GET /api/knowledge/files`，通过 `x-knowledge-transfer` 携带短期授权；授权绑定身份、知识库、附件、方向和期限。`POST /api/knowledge/parse` 接收附件引用，通过已授权的 Transport 检查读取与下载权限后解析，返回标准文本，不直接创建入库任务。

## 验证

```bash
pnpm test:knowledge
```

包含 SDK、SQLite 服务、HTTP 回环调用、鉴权范围、请求限制、静态资源边界、启动模式、数据重启恢复，以及原文定位与文件身份校验。浏览器交互和视觉检查结果保存在 `packages/knowledge/app/design-qa.md`。
