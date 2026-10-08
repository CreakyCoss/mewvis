# 知识库与检索

知识库为聊天提供可检索的本地资料。用户将文本目录登记为知识库，选择向量模型并构建索引；聊天按本轮选择的知识库召回片段，作为回答和创作的参考材料。

## 使用流程

1. 在「知识库 → 管理」配置 Embedding 服务、模型和向量维度。
2. 新建知识库，填写名称，选择已有资料目录和向量模型。
3. 在知识库详情中查看文件并重建索引；失败原因和索引状态在页面中显示。
4. 在聊天中选择需要的知识库，或使用绑定了知识库的智能体。

每个知识库登记一个目录，底层以 Collection 和 Source 保存知识库及资料来源关系。同一目录不能重复登记为不同知识库。模型或资料配置变化会使索引过期，需重新构建；目录文件变化不会自动触发后台索引。

## 当前能力与边界

- 知识库及索引由本机 Node Server 管理，桌面与 Web 共用。
- 支持 UTF-8 文本文件：`.txt`、`.md`、`.markdown`、`.json`、`.csv`、`.ts`、`.tsx`、`.js`、`.jsx`、`.rs`、`.toml`、`.yaml`、`.yml`。
- 扫描跳过隐藏目录、`node_modules`、`dist`、`build` 和符号链接；单文件最多 50 MiB。
- Embedding 支持 OpenAI-compatible `/embeddings` 和 Ollama `/api/embed`，可维护多份模型配置并由知识库分别选择。
- 检索使用 SQLite FTS5 和 sqlite-vec；向量服务不可用时仍可使用已有文本索引。
- 当前不抽取 PDF、DOCX、网页或图片，也不提供 reranker、MMR 或独立的检索测试界面。
- `manual` 来源可以登记，但索引器明确拒绝手写来源，不能据此认为它已支持手写资料检索。

## 存储与索引

| 数据     | 位置                         | 内容                                             |
| -------- | ---------------------------- | ------------------------------------------------ |
| 配置     | `<dataDir>/config.db`        | 知识库、来源关系、Embedding profile 和知识库设置 |
| 索引     | `<dataDir>/rag/index.sqlite` | 文档元数据、分块、FTS5、向量与索引状态           |
| 原始资料 | 登记的本地目录               | 用户维护的文本文件                               |

默认 `dataDir` 为 `~/.mewvis`。配置库 schema 在 [config/schema.ts](../../apps/server/src/storage/config/schema.ts) 中维护，索引 schema 在 [knowledge/storage/schema.ts](../../apps/server/src/modules/knowledge/storage/schema.ts) 中维护。修改表结构需按相应升级规则处理，不在文档中维护另一套建表 SQL。

重建按选中知识库的已启用来源执行。文本按 Unicode 字符切块，优先在句子或空白边界分割，最长 1200 字符、重叠 160 字符。一次重建扫描文本最多 256 MiB、生成最多 50,000 个分块；向量另有 256 MiB 预算。

重建前必须绑定有效的 Embedding profile。响应会校验数量、维度、有限数值与非零向量；索引记录模型和维度。重建中配置发生变化时拒绝提交旧结果。向量请求失败会保留生成的文本索引，并将失败原因写入索引状态；原始资料不会因重建失败而删除。

## 检索与聊天接入

`search_workspace_knowledge` 接受 `query`、可选 `collectionIds`、`maxResults` 和 `minScore`，返回 `matches` 与 `enabledSourceIds`。`workspaceId` 保留在接口中，当前资料范围由知识库和来源的启用状态决定。

- 传入 `collectionIds` 时，只检索这些已启用知识库关联的已启用来源；省略时检索全部已启用知识库。
- 文本召回使用 FTS5，向量召回使用对应 profile 的余弦距离；同一来源、路径与片段按较高分合并后排序。
- 若没有召回结果，再进行文本 `LIKE` 匹配。当前实现没有 RRF 排名融合。
- 返回数量默认为 8，最多 20；分数用于当前排序与过滤，不是模型置信度。

普通聊天在发送前，根据会话选择及智能体绑定的知识库调用检索。片段经过 XML 转义，放入 `<retrieved_knowledge>` 上下文，使用 `R1`、`R2` 等编号引用。资料内容属于参考数据，不能覆盖用户请求或系统指令。检索失败时聊天仍可继续，但不注入检索结果。

应用聊天使用同一宿主 Chat 流程，仍受场景能力与应用权限约束。它不直接访问索引数据库或模型密钥。

## 源码入口

| 职责             | 源码                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 知识库界面       | [workbench/pages/knowledge](../../apps/client/src/workbench/pages/knowledge)                                                                       |
| 前端接口         | [api/knowledge.ts](../../apps/client/src/api/knowledge.ts)                                                                                         |
| 后端命令与配置   | [knowledge/service.ts](../../apps/server/src/modules/knowledge/service.ts)、[repository.ts](../../apps/server/src/modules/knowledge/repository.ts) |
| 文本发现与切块   | [documents.ts](../../apps/server/src/modules/knowledge/documents.ts)                                                                               |
| 索引与检索       | [indexer.ts](../../apps/server/src/modules/knowledge/indexer.ts)                                                                                   |
| Embedding 请求   | [embeddings.ts](../../apps/server/src/modules/knowledge/embeddings.ts)                                                                             |
| Chat 检索调用    | [chat/desktop/runtime.ts](../../apps/client/src/chat/desktop/runtime.ts)                                                                           |
| 引用与上下文组装 | [chat/desktop/context.ts](../../apps/client/src/chat/desktop/context.ts)                                                                           |

接口封装、索引限额和错误处理另见 [Server 业务接口](../runtime/server-interfaces.md#知识库)。修改知识库实现后，在仓库根目录运行 `pnpm test:server`；涉及历史索引兼容时，再运行 `pnpm test:server:interop`。
