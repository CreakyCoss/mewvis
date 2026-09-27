# Server 业务接口

Node Server 覆盖迁移前 Tauri 注册的现行业务命令；旧协作流程的保存和删除命令已退役，流程统一在角色协作插件中管理。`apps/server/test/integration/backend-api.test.mjs` 读取冻结的历史命令清单，对照 `GET /api/commands` 检查未退役命令的缺项，并确认退役命令不再注册；它同时包含业务回归测试。新增接口继续使用 `POST /api/commands/<name>`、Bearer 认证和原 Tauri 请求/结果字段。

## 覆盖范围

| 模块              | 数量 | 提供的能力                                                      |
| ----------------- | ---: | --------------------------------------------------------------- |
| Agent 与沙箱      |   18 | 任务、协作、会话、审批、取消、工具目录、沙箱状态与初始化        |
| 模型与 Agent 配置 |    5 | Provider、模型、聊天角色                                 |
| 工作区登记        |    4 | 默认工作区、创建、编辑、移除登记                                |
| 数据库维护        |    4 | 初始化、状态、配置库重建、工作区库重建                          |
| 工作区文件        |    8 | 列表、读取、可选读取、写入、批量事务、删除、监听、取消监听      |
| Git 版本控制      |   12 | 状态、初始化、差异、提交、分支、历史、文件读取、撤销与恢复      |
| 聊天记录          |    5 | 列表、读取、保存、未读标记、删除                                |
| 酒馆存档          |    3 | v4 状态读取、保存、清理                                         |
| 故事登记          |    5 | 列表、创建、导入、改名、移除                                    |
| 技能              |    5 | 列表与分组、保存、市场搜索、GitHub/ZIP 安装、移除               |
| 知识库            |   17 | 来源、集合、目录导入、Embedding 配置、索引、文件列表、检索      |
| 应用              |   16 | 本地/市场安装、检查、启停、移除、UI、工具、授权、数据和聊天连接 |

除无参数命令及下表外，新业务命令使用 `{ "input": {...} }`。Agent、模型及工作区登记命令的原有封装见 [服务说明](server.md)、[配置接口](server-settings.md)和[工作区管理](server-workspaces.md)。

| 命令                                                             | 顶层参数                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `delete_embedding_profile`                                       | `{ "profileId": "..." }`                                                         |
| `get_knowledge_index_status`                                     | `{ "collectionId": "..." }`，可省略集合 ID                                       |
| `list_knowledge_collection_files`、`delete_knowledge_collection` | `{ "collectionId": "..." }`                                                      |
| `delete_knowledge_source`                                        | `{ "sourceId": "..." }`                                                          |
| `get_application_tool_policy`、`connect_application_data`        | `{ "applicationId": "..." }`                                                     |
| `set_application_tool_policy`                                    | `{ "applicationId": "...", "policy": { "allowedToolNames": [] } }`               |
| `request_application_data`                                       | `{ "connection": "...", "request": { "version": 1, "method": "storage.keys" } }` |
| `disconnect_application_data`                                    | `{ "connection": "..." }`                                                        |

## 文件、存档与版本控制

文件路径限制在指定工作区内，拒绝上级路径逃逸和越界符号链接。批量写入先准备暂存文件和旧文件备份，支持 `revisionCondition`，版本冲突返回 `409 REVISION_CONFLICT`。写入失败时回滚；回滚本身失败则保留暂存目录及 `recovery.json`，返回 `ROLLBACK_FAILED`，供人工恢复。它保证服务内批量写入的互斥与失败恢复，不是断电后自动恢复的文件系统事务。

聊天沿用 `.isle-claw/chats/<id>/` 的 `meta.json`、`messages.json`、`options.json`；既有聊天的 `workspaceId` 和 `origin` 不能改写，损坏记录不会因读取而被覆盖。酒馆沿用 v4 索引和分房间文件，清理旧房间只针对旧索引已登记的 ID。故事删除默认只删除登记；`deleteContent: true` 才会删除内容。

Git 使用系统命令行，以独立参数传递路径并禁用 hooks、外部 diff/textconv。工作区根目录必须有自己的仓库，不借用上级仓库。恢复历史版本更新索引和工作树，保持当前 HEAD，供后续创建新提交；切换分支要求当前没有未提交改动。

## 知识库

知识库列表右上角的“管理”按钮进入 `/knowledge/embedding`，集中管理可供各知识库选择的 Embedding 服务、模型与凭据；新建知识库时缺少向量模型也可从提示跳转到这里。页面、编辑弹窗与草稿逻辑位于 `apps/client/src/workbench/pages/knowledge/embedding/`，应用设置不再提供 Embedding 入口。返回按钮回到知识库列表，配置存储和知识库模型绑定沿用原格式。

配置复用原 `config.db`，索引复用 `<dataDir>/rag/index.sqlite`。沿用原 `rag_*` 表、FTS5、sqlite-vec 0.1.9 和 profile 向量表命名，向量为 little-endian float32 BLOB，已有索引无需因切换后端而重建。支持原有文本扩展名，跳过隐藏目录、构建产物、依赖目录与符号链接。单文件上限 50 MiB，一次重建扫描文本上限 256 MiB、分块上限 50,000；向量累计存储计算另设 256 MiB 上限。

重建前须给集合绑定 Embedding profile。OpenAI-compatible 使用 `/embeddings`，Ollama 使用 `/api/embed`；校验响应数量、维度、有限数值及非零向量，支持 embeddinggemma 的文档/查询前缀。网络请求异步执行，关闭 Server 会取消索引中的网络请求。

索引结合 SQLite FTS5 与 sqlite-vec 向量余弦检索，向量服务不可用时保留文本检索。模型、来源或集合配置变化会标记索引过期，重建期间配置发生变化会拒绝发布旧结果。结果保持原有 `matches` 和 `enabledSourceIds` 结构。检索排序实现不承诺与 Rust 原向量库逐项同序；当前适合本机知识库，大规模语料仍需进一步优化索引存储与查询性能。

`manual` 知识源可以登记；与原 Tauri 一致，重建时会明确报告暂不支持手写来源索引。

## 应用与技能

应用包安装到 `<dataDir>/apps/<应用命名空间>/package`，配置、SDK 数据和应用工作区位于同一命名空间的独立位置。保留包 scope，其他特殊字符编码，防止路径碰撞。应用卸载保留配置和 SDK 数据。`registry.json`、`settings.yaml`、`storage.sqlite`、应用工作区和 `.isle/workspace.json` 均沿用原格式；启动时在原 `.layout.lock` 保护下执行同一个 `app-host/migrate-layout.mjs`，处理原后端已有的历史目录升级。

本地安装接受已构建应用目录，检查清单、入口和权限声明，不自动执行源码工程构建脚本。市场 `provider` 使用 `dsh-community`，通过随 Runtime 分发的 pnpm（缺少时使用运行环境中的 pnpm）下载依赖，始终使用 `--ignore-scripts`。市场安装默认不启用。本地 Isle 应用按原接口默认启用，可传 `enable: false`。

应用 UI 工具、UI 文档和工具授权复用现有 `app-host/service.mjs`。它由 Server 按需启动并托管，不需要用户再启动另一个 HTTP 服务。超时及配置变化会停止旧宿主；未确认退出时禁止创建替代进程。应用数据连接由宿主生成，每次请求重新检查所有者及权限；应用停用/移除时撤销连接、取消所属 Agent 任务并通知聊天宿主。

技能支持 SkillsMP 搜索、GitHub 目录或安装命令解析、本地 ZIP 安装。「探索发现」的「全部」在没有输入关键词时也会加载技能；SkillsMP 公开接口要求关键词，因此服务端用通用词 `skill` 获取候选列表，并分别以 `stars` 和 `recent` 对应「最热」「最新」。安装限制 500 个文件、50 MiB，拒绝 ZIP 路径逃逸、链接和特殊文件。上传来源保留 `upload:` 技能 key，分组与默认组保存在配置库。相同目标技能已存在时返回冲突，要求先移除或更换名称。

## 数据库维护

配置库沿用 Rust 的版本 25 和完整历史升级规则。桌面和 Web 的 Node 后端复用原数据目录，同一时刻仅启动一个后端；使用原 `apps/.layout.lock` 的操作系统文件锁互斥，进程崩溃后锁自动释放。切换启动入口前先正常退出当前进程，不复制数据库或创建专属配置库。

配置库初始化失败时，Server 仍提供认证后的状态与重建接口。重建先准备新库、恢复可匹配表、校验完整性和外键，再替换旧库。旧文件保留为 `*.backup-<uuid>`，路径通过原 `DatabaseRestoreReport.warnings` 返回。锁冲突返回可重试错误，不把锁冲突当作数据损坏。无法读取的损坏库允许重建空库，但原文件始终保留备份。

工作区数据库目前沿用空业务 schema；旧表会列入 `skippedTables`，数据仍可从备份读取。重建接口是显式维护操作，不会在普通读写失败时自动触发。

## 宿主交互适配

文件监听和应用工作区交互统一使用 SSE。建立事件订阅后再发起操作；桌面需要选目录时使用 Tauri 原生交互，Web 使用 Node 原生选择器。

- `watch_workspace_files` 仍返回 watch ID；文件变化发送 `workspace_files_changed`，payload 为 `{ "watchId": "..." }`。不传 `onChange` Channel。停止监听仍调用 `unwatch_workspace_files`。
- 应用工作区需要选择目录时发送 `application-workspace:interaction`：`{ "requestId": "...", "applicationId": "...", "kind": "pick-directory" }`。宿主回复绝对目录路径或 `null`。
- 需要共享确认时，同一事件的 `kind` 为 `confirm-share`，附带 `path`、`applications`。宿主回复 `true` 或 `false`。
- 回复使用新增命令 `answer_application_workspace_interaction`，参数为 `{ "input": { "requestId": "...", "value": ... } }`。等待上限 60 秒；ID 仅能使用一次。SDK 请求不能传 `approved` 等字段绕过宿主确认，应用被撤权后待处理交互立即失效。
- 应用聊天请求沿用 `application-chat:request`，附带宿主生成的 `connectionId`。通过原 `post_application_chat` 回复。宿主重启后旧连接回复被拒绝；`application-chat:disconnect`、`application-chat:revoke` 的 SSE payload 分别使用 `{ "connectionId": "..." }`、`{ "applicationId": "..." }`。

Web 前端已通过统一传输层消费这些事件，通过本机 Node 打开原生文件/目录选择器，并提供共享确认弹窗。使用 `pnpm dev:web` 同时启动页面和 Node API；详见 [Web 启动与连接](server.md#启动-web-页面)。
