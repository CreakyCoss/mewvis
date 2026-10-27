# 知识库服务 SDK

`packages/knowledge/sdk` 提供独立于宿主、数据库和供应商的知识库公共契约与客户端，包名为 `@mewvis/knowledge-sdk`。它与现有[知识库与检索](rag.md)实现并行存在，当前尚未接入宿主或应用 SDK，也不读写旧配置和索引。

SDK 提供类型契约、运行时请求与响应校验、可注入 Transport 的客户端、本协议的 HTTP Transport，以及宿主启动配置的类型与结构校验。SDK 不导出 `createKnowledgeService`，也不包含数据库驱动。当前 SQLite、Embedding、文本入库、任务和可信访问视图的实现见[知识库服务实现](knowledge-service.md)；MongoDB 和远端知识库保留空适配入口；PDF 解析由[独立应用](knowledge-app.md)实现。配置类型不表示相应驱动已经可用。

SDK 已增加原始附件的元数据、上传确认、下载授权、文档来源关联及可配置存储契约，见[原始附件存储契约](knowledge-attachments.md)。本地附件驱动、生命周期及字节网关已接入 SQLite 服务；OSS/S3 和自定义存储仅保留接口。SDK 本身不传输原始字节。

## 接入边界

调用链为“知识库服务 → 宿主装配 → 宿主授权的能力接口 → 子应用 SDK”。业务调用方依赖同一套 `KnowledgeClient`，宿主可以通过进程内、应用桥接或 HTTP Transport 接入。

```text
packages/knowledge/sdk
  index.ts           消费端能力接口、客户端选项和创建入口
  contracts.ts       公共实体、方法、消息、错误和调用选项
  client.ts          无存储、无全局实例的调用客户端
  protocol.ts        请求、响应和结果范围校验
  attachment-protocol.ts 附件元数据、传输凭证与结果范围校验
  configuration.ts   宿主专用的启动配置
  http.ts            本协议的 HTTP Transport
```

消费端从 `src/index.ts` 阅读：入口直接定义 `KnowledgeClient`，按服务检查、知识库、文档、附件、片段、检索和任务分组展示全部能力，并提供 `createKnowledgeClient`。`contracts.ts` 保留数据与协议定义，`client.ts` 实现传输执行、超时和校验。`contracts` 子路径仍通过类型导出提供同一个 `KnowledgeClient`，不产生运行时反向依赖。

每个逻辑服务实例绑定一个调用方指定的后端，可以管理多个知识库。A 的 SQLite 目录、B 的远端服务目标、C 的 MongoDB 数据库可以分别构成独立数据空间。指向同一目录、数据库或远端目标的实例会访问同一份数据；创建客户端本身不会创建或隔离数据库。

宿主负责认证连接、绑定应用身份、限制可访问的知识库和操作，再将请求交给服务。`capabilities` 用于展示和适配功能，不能代替逐次权限检查。业务消息没有 `applicationId`、存储目录、数据库 URI、SQL、原始向量或凭据字段。

## 包入口

| 入口                                  | 内容                                             |
| ------------------------------------- | ------------------------------------------------ |
| `@mewvis/knowledge-sdk`               | 客户端、公共类型、错误、协议方法和校验函数       |
| `@mewvis/knowledge-sdk/contracts`     | 类型、协议版本及错误码常量，无 HTTP 或数据库依赖 |
| `@mewvis/knowledge-sdk/configuration` | 宿主启动配置及纯结构校验                         |
| `@mewvis/knowledge-sdk/http`          | 可注入 `fetch` 的 HTTP Transport                 |

包没有运行时依赖，不导入宿主、应用 UI、Node 文件系统或任何数据库驱动。宿主集成时应将其加入自身的构建依赖；当前独立 SDK 可通过 `pnpm --filter @mewvis/knowledge-sdk build` 构建。

## 宿主配置与业务接口分离

`KnowledgeServiceConfiguration` 是提供给未来服务构造器的配置，由宿主或独立服务入口保存和管理。子应用不通过业务接口选择或修改实例的后端。

```ts
import { parseKnowledgeServiceConfiguration } from "@mewvis/knowledge-sdk/configuration";

const local = parseKnowledgeServiceConfiguration({
  backend: { kind: "sqlite", directory: "/caller/owned/knowledge" },
  embedding: {
    provider: "cloud-adapter",
    endpoint: "https://embedding.example/v1",
    model: "embedding-model",
    credentialRef: "embedding-secret",
  },
});

const mongo = parseKnowledgeServiceConfiguration({
  backend: {
    kind: "mongodb",
    uri: "mongodb://localhost:27017/",
    database: "knowledge_c",
    credentialRef: "mongo-secret",
  },
});

const remote = parseKnowledgeServiceConfiguration({
  backend: {
    kind: "remote",
    provider: "mewvis-v1",
    endpoint: "https://knowledge.example/rpc",
    credentialRef: "remote-secret",
    options: { namespace: "b" },
  },
});
```

这些调用只校验、复制并冻结配置，不创建目录、数据库或连接，不解析凭据，也不验证检索组件是否可用。`credentialRef` 由接入方提供的凭据设施解析；URI 不接受内嵌用户名和密码。供应商专用参数放在宿主配置的 `options` 中，由对应适配器校验，不能进入通用业务请求。

本地数据库后端可以单独配置 Embedding，模型维度省略时由未来适配器确定。`remote` 指委托给已有知识库服务，其 Embedding 由远端负责，因此不接受本地 `embedding` 配置。接入新的数据库或第三方协议需要服务适配器，不能仅替换 URL 就假定协议兼容。

## 对外操作

当前 v1 定义以下 26 个操作，其中 7 个附件操作由配置了本地附件存储的 SQLite 服务实现。所有资源 ID 都是服务数据空间内的不透明标识。

| 分组   | 方法                                                      | 返回及语义                                                  |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| 服务   | `service.describe`                                        | 服务 ID、协议版本、后端类别、当前可用能力；不返回配置和凭据 |
| 服务   | `service.probe`                                           | 存储、检索等检查项及 `ready / degraded / unavailable` 状态  |
| 知识库 | `bases.list / get`                                        | 可访问的知识库及其能力                                      |
| 知识库 | `bases.create / update`                                   | 创建知识库或更新名称、描述、元数据                          |
| 知识库 | `bases.delete / reindex`                                  | 返回删除或全库重建任务                                      |
| 文档   | `documents.list / get`                                    | 文档摘要列表，或包含标准文本的文档详情                      |
| 文档   | `documents.import`                                        | 接受标准文本批次，返回导入任务                              |
| 文档   | `documents.delete / reindex`                              | 处理显式指定的非空文档 ID 列表，返回任务                    |
| 附件   | `attachments.list / get`                                  | 原始附件元数据，不返回存储路径或字节                        |
| 附件   | `attachments.createUpload / completeUpload / abortUpload` | 申请短期授权、确认完整性或放弃上传                          |
| 附件   | `attachments.createDownload / delete`                     | 申请短期下载授权，或删除无引用附件                          |
| 片段   | `chunks.list / get`                                       | 指定文档的分块预览及出处                                    |
| 检索   | `search`                                                  | 最终排好序的证据片段和逐库诊断                              |
| 任务   | `jobs.list / get / cancel`                                | 查看或请求取消指定知识库的任务                              |

没有隐式“删除全部”参数。全库重建使用明确的 `bases.reindex`。列表使用不透明 `cursor` 和可选 `limit`；页结果始终包含 `nextCursor`，最后一页为 `null`。游标绑定同一操作、知识库和筛选条件，服务不能将它解释为调用方提供的 SQL。

`bases.update` 的 `patch` 必须非空；省略字段保持原值，传入 `metadata` 替换整个元数据对象。知识库的独立性不依赖资料原先所在的文件夹，`source.uri` 仅保留来源。

## 能力发现与只读后端

服务和每个知识库都返回 `KnowledgeCapabilities`：支持的方法、检索模式、元数据过滤操作符、幂等支持和可选限制。服务可以提供比某个只读知识库更多的管理能力；调用方需要同时遵守服务和目标库的能力。

一个外部只读库可以仅声明检索相关方法，其他操作返回 `NOT_SUPPORTED`。未实现的过滤条件或显式检索模式也必须返回 `NOT_SUPPORTED`，不能静默忽略过滤而扩大查询范围。客户端不自动发起能力探测，也不缓存能力或代替服务授权。

能力中的方法名允许新 v1 服务增加名称，旧客户端只调用自己认识的方法。结果对象允许增加字段；请求参数严格校验，未知参数不会被悄悄转发。新增必填字段、改变现有字段含义或不兼容消息结构需要新协议版本。

服务适配器应显式构造公共结果，不能直接序列化配置记录或上游原始响应；请求/响应校验不能代替凭据脱敏和授权。

## 标准文本导入与任务

v1 导入的输入为 `KnowledgeTextDocument`：标题、纯文本、可选来源、元数据、稳定 `externalId`，以及文本范围到页码或章节的映射。输入不接受宿主路径、文件对象、Base64 或原始向量。来源可用 `source.attachmentId` 关联同库已完成上传的原件，SQLite 服务在配置附件存储后校验此关联。文件选择、PDF 解析和清洗由独立应用负责，产出标准文本后调用此接口；DOCX 解析尚未实现。

```ts
const accepted = await knowledge.documents.import(
  {
    knowledgeBaseId: "base-a",
    duplicatePolicy: "replace",
    documents: [
      {
        externalId: "manual/chapter-1",
        title: "第一章",
        text: "蓝鹭计划的档案存放于北塔。",
        source: { uri: "urn:manual:chapter-1", mediaType: "text/plain" },
        metadata: { topic: "novel" },
      },
    ],
  },
  { idempotencyKey: "chapter-1-revision-2" },
);

const job = await knowledge.jobs.get({
  knowledgeBaseId: "base-a",
  jobId: accepted.id,
});
```

导入默认使用 `reject` 重复策略。`skip / replace` 要求每份输入都有库内稳定的 `externalId`；同一批次不允许重复 `externalId`。服务生成自己的文档 ID，并负责维护外部 ID 的映射，不能拿文件名隐式覆盖文档。

导入、删除和重建返回任务，表示服务已接受操作，不代表已完成。任务状态为 `queued / running / cancelling / succeeded / partially_succeeded / failed / cancelled`。进度的 `processed` 包含成功、失败和跳过项，未知总数用 `null` 表示。失败应返回可定位的错误，批次结果可包含逐文档结论。

任务 `succeeded` 表示操作完成：导入和重建的成功文档已可供后续检索，删除的目标已不再出现在后续结果中。部分成功必须使用 `partially_succeeded`，不能用整体成功掩盖失败项。后续服务实现需要确保重建失败保留上一次可用索引，并明确发布时点；SDK 本身不实现索引发布。

客户端不自动轮询或重试。`jobs.cancel` 请求服务端取消任务，响应仍可能是 `cancelling`；任务完成与取消竞态应返回实际状态。终态任务的取消请求返回当前终态，服务不应重新执行任务。

## 检索与出处

```ts
const result = await knowledge.search(
  {
    knowledgeBaseIds: ["base-a"],
    query: "蓝鹭计划的档案在哪里？",
    mode: "auto",
    limit: 8,
    filter: { operator: "eq", field: "topic", value: "novel" },
  },
  { signal: abortController.signal, timeoutMs: 5000 },
);
```

查询必须显式传入非空、去重的 `knowledgeBaseIds`，缺省或空数组不表示全部知识库。服务应在检索候选生成前应用授权和知识库范围。客户端也校验结果范围，拒绝其他库、其他文档、错误任务或错误片段的响应；这一校验不能代替服务端隔离。

元数据过滤为结构化 AST：`eq / ne / gt / gte / lt / lte / in / notIn / exists`，以及 `and / or / not`。`field` 指文档元数据字段，由适配器安全映射；不接受数据库查询语言。

检索模式为 `auto / keyword / vector / hybrid`。`auto` 允许服务选择可用方案，发生降级时通过诊断警告说明；显式模式必须受支持。结果数组顺序就是最终相关性顺序。可选分数包含数值、类型和排序方向，既不保证位于 0–1，也不保证跨库可比较，因此公共接口不提供通用 `minScore` 阈值。

片段保留标题、文本、知识库 ID，以及可用的文档 ID、文档修订、片段 ID、来源 URI、页码、章节、行号和文本位置。`hit.id` 是结果内唯一的证据标识，不等同于可读取的 `chunkId`。远端缺少文档读取能力时，仍可直接使用结果中的证据；回答引用应绑定这次结果的快照。SDK 不生成回答、编号、XML 提示词或聊天记录，也不读取/下载 `source.uri`。

字符位置统一使用从 0 开始、右端不包含的 Unicode 码点偏移，行号和页码从 1 开始；`locations` 的范围针对标准文本，不是原始 PDF 字节位置。这样不同语言的服务适配器可以保持一致。

检索始终包含每个请求库的诊断：成功的空结果也是 `ok`。默认任一库失败即返回错误；只有显式 `allowPartial: true` 才能返回 `partial`，并逐库携带失败原因。失败库不能贡献结果片段。嵌入模型异常等降级信息进入 `warnings`，不能静默伪装为“没有资料”。

## Transport 与错误

```ts
import { createKnowledgeClient } from "@mewvis/knowledge-sdk";

const knowledge = createKnowledgeClient({
  version: 1,
  async request(request, options) {
    // 由宿主实现应用桥接；身份和授权绑定在此连接上。
    return hostTransport.request(request, options);
  },
});
```

消息均为可序列化 JSON，调用选项中的 `AbortSignal` 不进入消息。请求包含 `{ version: 1, method, params, idempotencyKey? }`；成功响应为 `{ version: 1, ok: true, value, requestId? }`，失败为 `{ version: 1, ok: false, error, requestId? }`。`parseKnowledgeRequest` 供服务端共用结构校验，`parseKnowledgeResponse` 和 `validateKnowledgeResult` 检查返回结构及请求范围。

SDK 在发送前复制并冻结请求，在交付前复制并冻结结果；拒绝循环、类实例、访问器、稀疏数组、`undefined`、`bigint`、符号和非有限数值。JSON 最多嵌套 64 层、遍历 100,000 个节点，文本长度和业务批次限制另由服务能力描述。可选字段应省略，不能显式传入 `undefined`。

`KnowledgeError` 保留稳定错误码、可选 `requestId`、`retryAfterMs` 和结构化详情。错误分为参数/认证/权限、未找到/冲突、不支持/未就绪、限流/不可用、超时/取消、服务内部错误、无效响应和传输错误。未知错误码和损坏响应归为 `INVALID_RESPONSE`。无结果返回空列表，不能与错误混淆。

`signal / timeoutMs` 控制当前调用的等待和传输；取消或超时不能证明服务未执行写入，也不撤销已经接受的任务。取消服务端工作使用 `jobs.cancel`。SDK 不设默认超时，可由客户端构造参数或每次调用指定。

幂等键只允许用于写操作。服务声明支持时，同一键和相同方法/参数应返回原操作；同一键对应不同内容应返回 `CONFLICT`。不支持时返回 `NOT_SUPPORTED`。SDK 不实现幂等记录，也不会自动重发付费或写请求。

### HTTP Transport

```ts
import { createKnowledgeClient } from "@mewvis/knowledge-sdk";
import { createKnowledgeHttpTransport } from "@mewvis/knowledge-sdk/http";

const knowledge = createKnowledgeClient(
  createKnowledgeHttpTransport({
    endpoint: "https://knowledge.example/rpc",
    headers: async () => ({
      authorization: `Bearer ${await resolveServiceToken()}`,
    }),
  }),
  { timeoutMs: 5000 },
);
```

HTTP Transport 向指定的完整端点发送 POST，不自动追加路径。它只理解本 SDK 的协议，不是 Dify、RAGFlow 或 MongoDB 客户端。应用沙箱通过宿主桥接使用业务客户端，HTTP 凭据解析留在可信接入方。

Transport 使用 `credentials: omit`、禁用重定向和缓存，不自动重试。默认响应上限 16 MiB，可用 `maxResponseBytes` 调整；响应按 UTF-8 校验。非成功 HTTP 响应中的合法协议错误仍交给客户端处理；代理等返回的非协议错误按 HTTP 状态归一化，保留可用的 `Retry-After`，不把原始错误正文暴露为错误消息。

## 开源参考与取舍

接口设计参考以下上游公开文档和源码，核对日期为 2026-10-26。它们提供设计依据，本包没有引入其运行时依赖或复制实现。

| 项目                                                                                                                                                                                                                                                                   | 参考内容                                                           | 本 SDK 的取舍                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [Dify 外部知识库](https://github.com/langgenius/dify-docs/blob/main/en/self-host/use-dify/knowledge/connect-external-knowledge-base.mdx)及[外部检索协议](https://github.com/langgenius/dify-docs/blob/main/en/self-host/use-dify/knowledge/external-knowledge-api.mdx) | 连接与具体知识库分离，外部来源可以只提供检索，结果包含内容与元数据 | 宿主配置与业务接口分离；按能力支持只读库；使用自有版本化协议，并保留更明确的证据和诊断 |
| [RAGFlow Dataset SDK](https://github.com/infiniflow/ragflow/blob/main/sdk/python/ragflow_sdk/modules/dataset.py)及[Chunk 模型](https://github.com/infiniflow/ragflow/blob/main/sdk/python/ragflow_sdk/modules/chunk.py)                                                | 文档管理、异步解析/取消、文档与片段来源及检索分数组成              | 文档导入与任务查询分开；明确取消语义；片段保留来源，客户端不自动轮询                   |
| [Haystack DocumentStore 协议](https://github.com/deepset-ai/haystack/blob/main/haystack/document_stores/types/protocol.py)                                                                                                                                             | 可替换存储协议、元数据过滤、重复写入策略，检索与后端能力关联       | 统一服务契约、显式过滤与重复策略；供应商和数据库实现留在服务包内部                     |

公共知识库接口不包含聊天生成，也不直接暴露向量数据库操作。这样宿主、独立应用和远端代理可以使用同一个消费端协议，而内部实现仍能独立演进。

## 验证

在仓库根目录运行：

```sh
pnpm test:knowledge-sdk
```

测试包含严格 TypeScript 调用示例、全部方法的消息往返、文本导入与显式任务查询、Unicode 出处、结果范围、部分失败、无结果、错误分类、超时取消，以及本机临时 HTTP 服务的协议联调。这些测试验证 SDK 契约与传输，不代表实际数据库、远端供应商或检索质量已经实现或验收。
