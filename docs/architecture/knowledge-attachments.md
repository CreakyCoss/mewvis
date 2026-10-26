# 原始附件存储契约

知识库元数据数据库和原始附件存储分别由接入方选择。例如，SQLite 可以搭配本地文件、阿里云 OSS、S3 兼容对象存储或自定义存储；更换数据库不应改变业务端的附件接口。

本次交付的是 **SDK 契约、客户端、运行时协议校验、配置结构校验和服务端适配接口**。尚未实现附件元数据表、SQLite 附件生命周期、文件存储驱动、上传下载网关、清理任务或文件解析器。配置供应商名称不代表驱动已安装。现有 SQLite 服务不声明附件能力，对附件调用、附件引用和附件存储配置明确返回 `NOT_SUPPORTED`，不忽略配置或回退存储。

## 配置与接入边界

宿主启动配置新增可选 `attachmentStorage`，与 `backend`、`embedding` 并列。未配置时不隐式使用 SQLite 目录保存文件。业务请求不接受目录、Bucket、对象 Key、供应商配置或长期凭据。

```ts
import {
  parseKnowledgeAttachmentStorageConfiguration,
  parseKnowledgeServiceConfiguration,
} from "@mewvis/knowledge-sdk/configuration";

// 仅校验并冻结配置，不创建目录或连接云服务。
const local = parseKnowledgeAttachmentStorageConfiguration({
  kind: "local",
  storageId: "originals-v1",
  directory: "/caller/owned/originals",
});

const oss = parseKnowledgeAttachmentStorageConfiguration({
  kind: "object-storage",
  storageId: "originals-v1",
  provider: "aliyun-oss",
  bucket: "knowledge-originals",
  region: "cn-hangzhou",
  prefix: "knowledge/",
  credentialRef: "oss-credentials",
});

const s3 = parseKnowledgeAttachmentStorageConfiguration({
  kind: "object-storage",
  storageId: "originals-v2",
  provider: "s3-compatible",
  bucket: "knowledge-originals",
  endpoint: "https://objects.example",
  credentialRef: "s3-credentials",
  options: { forcePathStyle: true },
});

const custom = parseKnowledgeAttachmentStorageConfiguration({
  kind: "custom",
  storageId: "originals-v3",
  provider: "caller-storage",
  credentialRef: "custom-storage-credentials",
  options: { namespace: "project-a" },
});

const configuration = parseKnowledgeServiceConfiguration({
  backend: { kind: "sqlite", directory: "/caller/owned/metadata" },
  attachmentStorage: oss,
});
```

`storageId` 是持久化存储绑定，不是业务授权。未来运行时需要记录并核对绑定，禁止更改目录、Bucket 或前缀后把旧附件悄悄指向另一个位置；切换位置需要明确的数据移动流程。`options` 只保存非秘密参数，凭据通过 `credentialRef` 交给调用方解析。

`remote` 表示委托给完整的远端知识库服务，其附件存储和 Embedding 均由远端负责，因此不能同时传入本地 `attachmentStorage` 或 `embedding`。远端是否支持原件上传、下载，由能力发现决定。

## 业务接口

`KnowledgeClient.attachments` 直接定义在 SDK 的 `src/index.ts`，通过现有 Transport 调用：

| 方法             | 语义                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `list`           | 按知识库分页列出可访问的附件                                          |
| `get`            | 读取元数据，不返回原始字节或存储路径                                  |
| `createUpload`   | 提交文件名、类型、大小和 SHA-256，创建 pending 附件并申请短期上传凭证 |
| `completeUpload` | 校验实际字节，发布 ready 附件                                         |
| `abortUpload`    | 放弃未完成的上传并安排清理；不能用于删除 ready 附件                   |
| `createDownload` | 对 ready 附件重新授权，申请短期下载凭证                               |
| `delete`         | 删除无文档或待执行任务引用的附件；仍被引用时返回 `CONFLICT`           |

所有操作都显式包含 `knowledgeBaseId`，读取、完成、放弃、下载和删除还包含 `attachmentId`。服务端必须同时检查附件所属库、调用者授权和上传会话身份；持有附件 ID 不等于有权访问。pending 会话应受创建者身份约束，列表也遵循同一规则。

`createUpload / completeUpload / abortUpload / delete` 支持既有幂等键契约。下载授权是读取操作，不接受幂等键。SDK 不自动重试、轮询、计算摘要、传输文件或刷新凭证。原上传凭证过期后不能自动重放写入，需由上层明确处理会话和重新申请。

附件元数据包含名称、类型、字节数、完整文件 SHA-256、pending/ready 状态和时间。上传结果核对知识库及提交的文件信息；其他结果核对知识库和附件 ID。分页拒绝跨库结果、重复附件 ID 和超出请求页大小的结果。

## 上传与文档关联

流程为：导入层计算原件摘要与大小 → 申请上传凭证 → 独立通道传输 → `completeUpload` 校验发布 → 解析出标准文本 → `source.attachmentId` 关联同库 ready 原件 → 标准文本入库。

以下是**目标协议调用示意**，需要支持附件的服务和调用方二进制通道，不能直接用于当前 SQLite 服务：

```ts
import type {
  KnowledgeClient,
  KnowledgeAttachmentTransfer,
} from "@mewvis/knowledge-sdk";

declare const knowledge: KnowledgeClient;
declare const file: File;
declare const sha256: string; // 导入层计算的完整原件摘要。
declare const transferBytes: (
  target: KnowledgeAttachmentTransfer<"PUT">,
  file: Blob,
) => Promise<void>;

const upload = await knowledge.attachments.createUpload({
  knowledgeBaseId: "base-a",
  fileName: file.name,
  mediaType: file.type || "application/octet-stream",
  sizeBytes: file.size,
  sha256,
});
await transferBytes(upload.transfer, file);
const original = await knowledge.attachments.completeUpload({
  knowledgeBaseId: "base-a",
  attachmentId: upload.attachment.id,
});
const job = await knowledge.documents.import({
  knowledgeBaseId: "base-a",
  documents: [
    {
      externalId: "manual/chapter-1",
      title: "第一章",
      text: "解析后的标准文本。",
      source: { attachmentId: original.id, mediaType: original.mediaType },
    },
  ],
  duplicatePolicy: "replace",
});
```

`source.uri` 仍然只是被动来源描述，不代表存储位置或下载地址。`source.attachmentId` 在文档、片段和检索证据中沿用同一契约，服务需验证它属于同一知识库且已 ready。同一原件可以被同库多个文档引用。

上传成功不等于文本入库成功，也不代表文件已被解析。对象存储适配器不负责 PDF/OCR/清洗/分块。

## 字节传输与发布

文件不作为 Base64、字节数组或本机路径进入 JSON RPC。短期传输授权有两种形式：

- `http`：HTTP(S) URL、固定 GET/PUT 方法、必要请求头和过期时间，适合直传或代理。
- `host`：交给调用方已认证二进制桥接处理的不透明短期 token，适合桌面宿主等接入。

授权必须限制附件、对象、操作及有效期。SDK 只返回凭证，不自动访问 URL。直传 URL 可能包含对象定位信息，但业务端不能以任意对象 Key 替代授权。URL、请求头和 token 都是临时秘密，不写入文档、片段、检索结果或普通日志。下载时重新申请，不把过期地址作为 `source.uri` 保存。

协议拒绝非 HTTP(S) URL、URL 内嵌用户名密码、错误传输方向，以及带控制字符或 Cookie 的传输请求头。

预签名上传必须指向暂存对象，不能指向 ready 原件，否则校验完成后仍可能被覆盖。未来服务需将暂存字节发布为独立、不可变的最终对象，在写入过程中校验大小和摘要，再提交 ready 元数据。仅相信客户端声明、对象自定义元数据或 ETag 不足以完成 SHA-256 校验。

## 服务端适配接口

核心定义位于 `packages/knowledge/service/src/attachments/index.ts`，通过 `@mewvis/knowledge-service` 和 `/attachments` 导出类型：

| 接口                                  | 职责                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `KnowledgeAttachmentStorage`          | `probe / stat / put / get / delete / close`，流式处理原始字节                 |
| `KnowledgeAttachmentStorageFactory`   | 根据 kind/provider 和调用方凭据解析器创建适配器；未知驱动返回 `NOT_SUPPORTED` |
| `KnowledgeAttachmentTransferProvider` | 可选的直接上传、下载授权；本地存储也可由宿主单独提供二进制桥接                |

Key 由服务生成，不来自原始文件名或业务请求。适配器负责字节完整性、未完成写入不可见、同 Key 的不可变语义和取消资源释放；删除不存在对象是幂等成功。提供方错误需转换为知识库错误，不回传上游正文、密钥或真实路径。`close()` 只释放实例资源，不删除数据。

元数据、引用、权限、会话和清理重试由知识库服务负责。工厂类型是运行时装配契约，本次尚未作为可执行的 `createKnowledgeService` 选项接入。

## 后续实现要求

- pending 附件不可下载或关联文档；完成上传需可幂等重试，完成与放弃的竞态需要明确终态。
- 导入入队时固定附件引用，删除同时检查已发布文档和待执行任务，防止后台入库期间原件被清除。
- 文档替换成功后释放旧引用。无引用原件是否保留由独立策略决定，不能删除其他文档仍在使用的附件。
- 数据库和对象存储不能假装在同一原子事务中提交，需要持久化清理与恢复记录，处理上传失败、对象已写入但元数据未提交、删除失败和进程退出。
- 取消、过期上传及解析失败产生的无引用对象需要清理策略；本次没有自动清理功能。
- 删除只处理模块保存的原件副本，不能跟随 `source.uri` 删除调用方原始来源。
- 驱动、二进制网关及附件元数据生命周期完成后，才可声明对应能力，并开始 UI/宿主接入。

## 验证

运行 `pnpm test:knowledge-sdk` 与 `pnpm test:knowledge-service`。测试覆盖客户端方法、配置、传输授权格式、来源关联、跨库/跨附件响应拒绝、不可用能力的明确错误和适配接口类型契约，不代表已经联调 OSS/S3 或本地附件驱动。
