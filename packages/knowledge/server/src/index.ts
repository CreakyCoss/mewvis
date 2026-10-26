/** HTTP 接入入口。调用方提供已授权的 Transport；本包不创建数据库或读取宿主配置。 */
import type { IncomingMessage } from "node:http";
import type { KnowledgeTransport } from "@mewvis/knowledge-sdk";
import { startHttpServer } from "./http.js";

export interface KnowledgeHttpServerOptions {
  /** 身份来自请求认证，而不是 RPC 参数。未认证时返回 null。 */
  readonly resolveTransport: (
    request: IncomingMessage,
    context: { readonly signal: AbortSignal },
  ) => KnowledgeTransport | null | Promise<KnowledgeTransport | null>;
  readonly host?: string;
  readonly port?: number;
  /** 默认 /api/knowledge。 */
  readonly rpcPath?: string;
  /** 仅服务模式省略；只提供目录中的网页与 assets，不暴露服务数据目录。 */
  readonly staticDirectory?: string;
  readonly maxRequestBytes?: number;
  readonly requestTimeoutMs?: number;
  /** 反向代理等额外可信 Host / Origin；不支持通配符。 */
  readonly allowedHosts?: readonly string[];
  readonly allowedOrigins?: readonly string[];
}

export interface KnowledgeHttpServer {
  readonly url: string;
  readonly rpcEndpoint: string;
  readonly address: { readonly host: string; readonly port: number };
  /** 停止接收请求并中止在途请求；注入的服务由调用方关闭。 */
  close(): Promise<void>;
}

export function createKnowledgeHttpServer(
  options: KnowledgeHttpServerOptions,
): Promise<KnowledgeHttpServer> {
  return startHttpServer(options);
}
