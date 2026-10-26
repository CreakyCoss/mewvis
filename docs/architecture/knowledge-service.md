# 知识库服务实现

`@mewvis/knowledge-service` 位于 `packages/knowledge/service`，实现[知识库 SDK](knowledge-sdk.md)的公共接口。当前提供独立的 SQLite 后端、标准文本入库、关键词/向量/混合检索和持久化任务。它没有接入现有宿主、子应用或旧知识库，也不读取、迁移或删除旧数据。

## 边界与目录

```text
packages/knowledge/service/src/
  service.ts                 公共工厂与后端选择
  types.ts                   服务生命周期、可信访问视图、运行选项
  attachments/index.ts       原始附件存储、流式读写与传输授权的适配契约
  embeddings.ts              Embedding 适配与向量校验
  ingestion/text.ts          保留出处的分块及中英文索引规范化
  retrieval/ranking.ts       RRF 排名融合
  providers/sqlite/
    index.ts                 SQLite 专用配置与创建入口
    service.ts               SQLite 后端的 SDK 操作实现
    store.ts                 数据结构、事务、实例租约、幂等与游标
    jobs.ts                  持久化任务及原子发布
    search.ts                范围内检索与降级诊断
    filter.ts                元数据过滤到绑定参数 SQL 的映射
```

后端实现以同一 `KnowledgeService / KnowledgeTransport` 接口交付。SQL、队列持久化和查询方式集中在 SQLite 适配目录；文本分块、Embedding 和排名融合组件独立维护。新增数据库后端需要实现对应存储与检索语义，公共工厂不能把不支持的数据库悄悄替换为 SQLite。

公共工厂完成配置校验和后端选择后，通过 `providers/sqlite/index.ts` 创建 SQLite 实例。该入口定义 `SqliteKnowledgeServiceConfiguration` 与 `createSqliteKnowledgeService`，具体 SDK 操作保留在目录内的 `service.ts`。应用仍通过包的公共工厂接入。

当前 `mongodb / remote` 配置类型仍可被 SDK 结构校验，但服务工厂会明确返回 `NOT_SUPPORTED`。二进制文件解析、远端知识库转发、HTTP 服务监听和应用 SDK 桥接尚未实现。

原始附件新增了独立的[存储契约](knowledge-attachments.md)，调用方可以声明本地目录、OSS/S3 或其他适配器。当前仅完成 SDK、配置和服务端适配接口，尚未接入附件元数据表、驱动或字节网关。SQLite 的能力描述仍只包含已实现的 19 个操作，对附件调用、附件存储配置和文档附件引用返回 `NOT_SUPPORTED`。

## 创建和使用

运行环境为 Node.js 22.13 或更高版本，使用内置 `node:sqlite` 的 FTS5 与 JSON 功能。接入方必须提供目录，不存在宿主默认目录或隐式内存存储。

```ts
import { setTimeout as delay } from "node:timers/promises";
import { createKnowledgeService } from "@mewvis/knowledge-service";

const knowledge = await createKnowledgeService({
  backend: { kind: "sqlite", directory: "/caller/owned/knowledge" },
});

try {
  const base = await knowledge.bases.create({ name: "项目资料" });
  const receipt = await knowledge.documents.import(
    {
      knowledgeBaseId: base.id,
      duplicatePolicy: "replace",
      documents: [
        {
          externalId: "manual/chapter-1",
          title: "第一章",
          text: "月亮下的图书馆保存着古老的秘密。",
          source: { uri: "urn:manual:chapter-1" },
          metadata: { topic: "manual" },
        },
      ],
    },
    { idempotencyKey: "chapter-1-v1" },
  );

  // 显式等待任务；SDK 不自动轮询。生产接入应提供适当的等待上限或取消操作。
  let job;
  do {
    await delay(10);
    job = await knowledge.jobs.get({
      knowledgeBaseId: base.id,
      jobId: receipt.id,
    });
  } while (["queued", "running", "cancelling"].includes(job.state));
  if (job.state !== "succeeded")
    throw new Error(job.error?.message ?? job.state);

  const result = await knowledge.search({
    knowledgeBaseIds: [base.id],
    query: "图书馆保存了什么秘密？",
    filter: { operator: "eq", field: "topic", value: "manual" },
  });
  // 使用 result.hits 构造回答上下文与引用；服务不生成聊天回答。
} finally {
  await knowledge.close();
}
```

返回对象实现整个 `KnowledgeClient`，额外提供 `transport / createTransport / close`。接入方通过 `close()` 停止任务、终止正在等待的查询和 Embedding、释放数据库资源。未完成且未被用户取消的任务重新排队，供同目录的新实例恢复。

## 存储与实例

SQLite 后端在指定目录创建 `knowledge.sqlite`，运行时可能出现 `-wal / -shm` 伴随文件。元数据、标准文本、片段、FTS 索引、向量、任务和幂等回执都在这个数据库内，因此文档、索引和任务成功状态可以一起提交。

同一目录同时由一个服务实例负责读写与任务执行，多个调用方复用它提供的 Transport。数据库保存服务身份、游标签名密钥和带进程信息的租约；租约每 5 秒续期，有效期 30 秒。重复启动返回 `CONFLICT`；同机进程已退出时可以立即接管。发布事务会校验持有者，防止丢失租约的实例继续写入。

目录和不同数据库构成不同数据空间；不会因为模块被多处导入而产生全局共享对象。服务身份、回执和分页游标在同目录重启后保留。更新版本或非本模块的数据库会被拒绝，不做清空重建或旧数据兼容。

导入输入在任务非终态时持久化，以支持恢复；任务进入终态后清除任务中的原始输入，保留文档内容、任务结论和逐文档结果。知识库删除后任务历史仍可按原知识库 ID 查询。当前没有自动清理历史任务与幂等回执，需要后续按实际保留策略扩展。

## 文本与索引发布

输入沿用 SDK 的标准文本契约，不直接读取 `source.uri`，也不从业务请求接受本机路径。服务保留原始标准文本，以保证 Unicode 码点偏移、页码/章节映射和引用可复核。清洗后的搜索表示与正文分开保存。

默认分块最长 1200 个 Unicode 码点、重叠 160 个码点，优先在句子、换行和空白边界分割。可通过 `chunking.maxCharacters / overlapCharacters` 调整。每个片段保留标准文本中的半开字符范围和行号；提供 `locations` 时附带对应页码、章节等原始位置。跨页片段以起点匹配的映射描述来源，不表示服务已实现 PDF 页面解析。

索引文本采用 NFKC、小写及 CJK 单字/双字组合，查询使用相同规则并排除部分常见中文功能字。原文、元数据值和出处不随检索规范化改变。这提供中文自然问句与短名称的基本词法召回；当前不包含专业分词词典、同义词扩展、查询改写或 reranker。

入库在数据库事务之外完成分块、Embedding 与校验，随后一次事务写入成功文档、片段、向量并更新任务终态。替换失败的文档保持原有版本。批次导入允许部分成功，失败逐文档报告；整库或选中文档重建任一目标失败时不发布本次重建，继续提供上次可用索引。

`externalId` 在一个知识库内唯一。`reject / skip / replace` 行为与 SDK 一致；相同内容、分块配置和向量空间的替换会跳过计算，保留文档 ID 和已发布索引。显式重建会重新执行索引。服务不自动重试付费 Embedding 调用；需要重试时由调用方在查看失败原因后显式发起操作。

任务完成与取消竞态返回实际状态。取消正在运行的任务会丢弃尚未发布的准备结果；提交事务开始后，在完成前不会让其他请求插入写操作。突然退出时，SQLite 事务保证索引与成功状态不会只提交一半；重启会重新排队运行中的未发布任务，将正在取消的任务置为已取消。

## Embedding

当前支持 `openai-compatible` 和 `ollama`，也可通过服务选项注入 `KnowledgeEmbeddingProvider`。配置和注入不能同时使用。

```ts
const knowledge = await createKnowledgeService(
  {
    backend: { kind: "sqlite", directory: "/caller/owned/knowledge" },
    embedding: {
      provider: "openai-compatible",
      endpoint: "https://embedding.example/v1",
      model: "embedding-model",
      credentialRef: "embedding-secret",
      options: { batchSize: 32, queryTimeoutMs: 5000 },
    },
  },
  {
    resolveCredential: async (reference) => credentials.get(reference),
  },
);
```

OpenAI-compatible 适配器调用 `/embeddings`，Ollama 调用 `/api/embed`；也接受已经包含完整操作路径的 endpoint。指定维度时传入 `dimensions`，Ollama 额外传入 `truncate: false`。OpenAI-compatible 响应按 `index` 还原顺序，并检查索引完整性和唯一性。两个适配器均检查数量、维度、有限数值与非零向量，再归一化存储。

支持的 `embedding.options`：

| 参数                           | 默认值及作用                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `batchSize`                    | 云端 32、Ollama 1，最大 256；入库管线还会将工作分成最多 32 个片段的可取消批次 |
| `requestTimeoutMs`             | 文档批次 60000 毫秒                                                           |
| `queryTimeoutMs`               | 查询 10000 毫秒，独立于文档批次                                               |
| `documentPrefix / queryPrefix` | 默认空字符串，由接入方按模型要求配置                                          |
| `includeTitle`                 | 默认 false；开启时文档向量输入包含标题                                        |
| `sendInputType`                | 默认 false；开启时发送 `input_type: document / query`，需供应商支持           |

适配器不猜测模型专用前缀。凭据由接入方解析，不写入知识库数据库或业务响应；不跟随重定向，不继承浏览器凭据。响应上限为 16 MiB，供应商错误只返回归一化错误与 HTTP 状态，不回传原始正文。

向量空间身份包括提供方、模型、地址、维度和输入格式，排除凭据。旋转凭据不会令索引过期；更换向量空间后，已有知识库显示 `degraded`，显式向量检索返回 `NOT_READY`，`auto` 使用词法检索并给出警告。重新导入和局部重建被阻止，必须完成一次整库重建再原子切换空间。注入提供方必须保证自己的 `signature` 随实际模型/格式变化而变化。

## 检索、过滤与限制

关键词召回使用 FTS5 BM25，按 SQLite 的较小值优先排序；不将负分做反向换算。向量召回对选定知识库及元数据范围内的向量计算精确余弦相似度，混合检索通过 RRF 融合排名。知识库范围与元数据条件都在取候选前应用，不先从全库截断再过滤。

当前 SQLite 后端没有 ANN 索引，精确向量扫描适合有限规模本地资料。默认单库每次向量查询最多扫描 20000 个片段、估算数据量 128 MiB。超过限制时，显式 `vector / hybrid` 返回错误；`auto` 回退词法召回并在 `warnings` 中解释。没有通用相似度阈值，调用方应根据结果和出处判断是否适合用于回答。

其他默认限制为：每次导入 100 份文档，每份 2000000 个码点，每库 100000 个片段；请求 JSON 16 MiB，单任务向量准备区 128 MiB；每次检索 100 个结果、64 个知识库、8192 码点查询；列表每页最多 100 项。部分容量可通过 `options.limits` 调整，服务在能力描述中公布可表达的限制。

过滤覆盖 SDK 的全部操作符。`field` 是顶层文档元数据键，包含点号的键也按字面名称处理。标量比较保留 JSON 类型：数字 1、布尔 true 和字符串 "1" 不相等；null 与不存在的字段不同。`ne / notIn` 要求字段存在；逻辑 `not` 按子条件的真假取反。字段和值均绑定参数，不解释为 SQL 或 JSON 路径。过滤最多 128 个节点、16 层及 512 个参数。

分页使用数据库密钥签名的不透明游标，绑定方法、资源与可信访问视图。片段分页还绑定文档和索引修订；重建后应从第一页重新读取。列表不承诺跨写入的历史快照，调用方应在资料变化后刷新列表。

## 宿主授权接入

```ts
import { createKnowledgeClient } from "@mewvis/knowledge-sdk";

// 这段由可信宿主执行，身份和授权不来自子应用请求体。
const applicationTransport = knowledge.createTransport({
  subjectId: "application:reader",
  knowledgeBaseIds: [allowedBaseId],
  methods: ["service.describe", "bases.list", "bases.get", "search"],
});
const client = createKnowledgeClient(applicationTransport);
```

未指定知识库范围的 Transport 属于可信全库视图；`knowledgeBaseIds: []` 不授予任何知识库。受限视图不能创建新知识库，宿主应先创建并明确授权相应 ID。业务端不能更改 Transport 的身份、授权或存储后端。静态访问视图没有独立的用户/角色数据库，动态权限更新由宿主替换相应 Transport。

服务在执行和召回前校验方法及知识库范围；知识库列表也受同一范围限制。文档、片段与任务查找同时约束所属知识库。幂等键按可信 `subjectId` 隔离，同一键同内容重放原始回执，不同内容返回 `CONFLICT`；重放的任务回执可能仍显示接受时状态，应使用 `jobs.get` 查询最新进度。

该接入示例使用通用 Transport，尚未在 `@mewvis/app-sdk` 增加知识库桥接，也没有注册宿主网络接口。

## 开源设计参考

本实现独立编写 TypeScript 代码，借鉴以下内部边界，不引入上游应用运行时：

| 上游源码                                                                                                                                                                                                                                                   | 采用的设计                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Dify DocumentIndexingService](https://github.com/langgenius/dify/blob/main/api/services/knowledge/indexing/execution.py)                                                                                                                                  | 入库按阶段编排，网络计算与持久化边界分开，保留错误及文档状态                |
| [RAGFlow PipelineExecutor](https://github.com/infiniflow/ragflow/blob/main/internal/ingestion/task/pipeline_executor.go)及[ChunkIndexWriter](https://github.com/infiniflow/ragflow/blob/main/internal/ingestion/task/chunk_index_writer.go)                | 分批索引与可取消任务，完成前使结果可检索，将索引结果与状态最终确认分开      |
| [Haystack InMemoryDocumentStore](https://github.com/deepset-ai/haystack/blob/main/haystack/document_stores/in_memory/document_store.py)及[DocumentStore 协议](https://github.com/deepset-ai/haystack/blob/main/haystack/document_stores/types/protocol.py) | 实例数据空间、显式生命周期、重复策略、统一索引/查询文本规范化及后端检索能力 |

本地实现使用单 SQLite 事务发布，以获得明确的成功时点；未来非事务型远端后端需要用自身的版本/索引发布机制实现相同公共语义。

## 验证

仓库根目录运行：

```sh
pnpm test:knowledge-sdk
pnpm test:knowledge-service
```

服务测试使用临时真实 SQLite、真实本机 HTTP Embedding 夹具和会突然退出的子进程，覆盖 SDK 操作、中文召回、BM25/RRF、提前过滤、错误降级、重复策略、出处、权限视图、幂等与游标、原子替换/重建、取消、重启与崩溃恢复。HTTP 夹具验证请求协议与超时，不代表已使用生产模型评估真实语义检索质量。
