/**
 * 知识库 SDK 的消费端入口：服务检查、知识库管理、文本导入、片段读取、检索和任务控制。
 *
 * 调用方注入 Transport，宿主负责连接、身份和授权；同一接口适用于本地或远端服务。
 * 数据结构与消息协议定义在 contracts.ts，调用执行和校验由 client.ts 负责。
 *
 * @example
 * const knowledge = createKnowledgeClient(transport, { timeoutMs: 5000 });
 * const result = await knowledge.search({ knowledgeBaseIds: [baseId], query: "资料在哪里？" });
 */
import type {
  KnowledgeBase,
  KnowledgeCall,
  KnowledgePage,
  KnowledgePageInput,
  KnowledgeProbeResult,
  KnowledgeRequestOptions,
  KnowledgeServiceDescription,
  KnowledgeTransport,
} from "./contracts.js";
import { createTransportClient } from "./client.js";

/** 调用方与服务实现共同遵守的能力接口；实际可用操作由 capabilities 和宿主授权决定。 */
export interface KnowledgeClient {
  /** 发现服务能力与限制，检查存储、索引和 Embedding 的可用状态。 */
  readonly service: {
    describe(
      options?: KnowledgeRequestOptions,
    ): Promise<KnowledgeServiceDescription>;
    probe(options?: KnowledgeRequestOptions): Promise<KnowledgeProbeResult>;
  };

  /** 管理知识库；删除和重建返回异步任务，完成状态通过 jobs 查询。 */
  readonly bases: {
    list(
      input?: KnowledgePageInput,
      options?: KnowledgeRequestOptions,
    ): Promise<KnowledgePage<KnowledgeBase>>;
    get: KnowledgeCall<"bases.get">;
    create: KnowledgeCall<"bases.create">;
    update: KnowledgeCall<"bases.update">;
    delete: KnowledgeCall<"bases.delete">;
    reindex: KnowledgeCall<"bases.reindex">;
  };

  /** 读取文档、导入标准文本或删除/重建指定文档；写入结果通过返回的任务确认。 */
  readonly documents: {
    list: KnowledgeCall<"documents.list">;
    get: KnowledgeCall<"documents.get">;
    import: KnowledgeCall<"documents.import">;
    delete: KnowledgeCall<"documents.delete">;
    reindex: KnowledgeCall<"documents.reindex">;
  };

  /** 读取文档分块及出处，用于预览和核对引用。 */
  readonly chunks: {
    list: KnowledgeCall<"chunks.list">;
    get: KnowledgeCall<"chunks.get">;
  };

  /** 在显式指定的知识库内检索，返回有序证据片段、出处与逐库诊断。 */
  readonly search: KnowledgeCall<"search">;

  /** 查询持久化任务进度或请求取消；客户端不自动轮询。 */
  readonly jobs: {
    list: KnowledgeCall<"jobs.list">;
    get: KnowledgeCall<"jobs.get">;
    /** Requests server-side cancellation; the returned job may still be cancelling. */
    cancel: KnowledgeCall<"jobs.cancel">;
  };
}

export interface KnowledgeClientOptions {
  /** 默认等待上限；省略时不设置默认超时，每次调用仍可单独指定。 */
  readonly timeoutMs?: number;
}

/** 创建消费端客户端；不创建数据库，不自动重试或轮询，也不持有全局服务实例。 */
export function createKnowledgeClient(
  transport: KnowledgeTransport,
  options: KnowledgeClientOptions = {},
): KnowledgeClient {
  return createTransportClient(transport, options);
}

export * from "./contracts.js";
export { KnowledgeError } from "./errors.js";
export {
  KNOWLEDGE_METHODS,
  isKnowledgeMethod,
  isKnowledgeMutation,
  parseKnowledgeRequest,
  parseKnowledgeResponse,
  validateKnowledgeResult,
} from "./protocol.js";
