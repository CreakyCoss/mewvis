/**
 * SQLite 后端入口：在接入方提供的目录中管理独立的知识库数据库。
 *
 * 创建后返回统一的 KnowledgeService，包含 SDK 操作、Transport 和 close()。
 * 表结构、持久化任务与检索实现由本目录内部维护。
 */
import type {
  KnowledgeEmbeddingConfiguration,
  KnowledgeSqliteBackend,
} from "@mewvis/knowledge-sdk/configuration";
import type { KnowledgeService, KnowledgeServiceOptions } from "../../types.js";
import { fail } from "../../util.js";
import { createSqliteService } from "./service.js";

/** SQLite 后端专用配置，沿用 SDK 的存储和 Embedding 配置契约。 */
export interface SqliteKnowledgeServiceConfiguration {
  /** 必须显式提供接入方拥有的目录；服务在其中初始化 knowledge.sqlite。 */
  readonly backend: KnowledgeSqliteBackend;
  /** 可选；未配置且未注入 Embedding 时提供关键词检索。 */
  readonly embedding?: KnowledgeEmbeddingConfiguration;
}

/** 由公共工厂完成配置校验后创建实例；调用方负责最终调用 close()。 */
export async function createSqliteKnowledgeService(
  configuration: SqliteKnowledgeServiceConfiguration,
  options: KnowledgeServiceOptions = {},
): Promise<KnowledgeService> {
  if (configuration.backend.kind !== "sqlite")
    fail("NOT_SUPPORTED", "The SQLite provider requires a SQLite backend");
  return createSqliteService(configuration, options);
}
