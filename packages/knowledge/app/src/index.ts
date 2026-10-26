/** 独立应用入口：装配服务、HTTP 和可选网页；业务实现仍由 knowledge/service 提供。 */
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { KnowledgeError } from "@mewvis/knowledge-sdk";
import type { KnowledgeServiceConfiguration } from "@mewvis/knowledge-sdk/configuration";
import {
  createKnowledgeService,
  type KnowledgeService,
  type KnowledgeServiceOptions,
  type KnowledgeAccess,
} from "@mewvis/knowledge-service";
import {
  createKnowledgeHttpServer,
  type KnowledgeHttpServer,
} from "@mewvis/knowledge-server";

export interface KnowledgeApplicationOptions {
  readonly configuration: KnowledgeServiceConfiguration;
  readonly serviceOptions?: KnowledgeServiceOptions;
  readonly host?: string;
  readonly port?: number;
  /** false 启动纯服务模式；默认提供本包构建后的网页。 */
  readonly web?: boolean;
  readonly staticDirectory?: string;
  /** 非本机监听必须配置认证。浏览器在内存中保存访问令牌，不写入启动配置。 */
  readonly token?: string;
  readonly access?: KnowledgeAccess;
  readonly allowedHosts?: readonly string[];
  readonly allowedOrigins?: readonly string[];
}
export interface KnowledgeApplication {
  readonly service: KnowledgeService;
  readonly server: KnowledgeHttpServer;
  close(): Promise<void>;
}

export async function startKnowledgeApplication(
  options: KnowledgeApplicationOptions,
): Promise<KnowledgeApplication> {
  const host = options.host ?? "127.0.0.1";
  const token = options.token;
  if (
    token !== undefined &&
    (!token.trim() || /[\s\u0000-\u001f\u007f]/.test(token))
  )
    throw new KnowledgeError({
      code: "INVALID_ARGUMENT",
      message:
        "The knowledge access token must be nonempty and contain no whitespace",
    });
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !token)
    throw new KnowledgeError({
      code: "INVALID_ARGUMENT",
      message:
        "A knowledge access token is required for non-loopback listeners",
    });
  const service = await createKnowledgeService(
    options.configuration,
    options.serviceOptions,
  );
  try {
    const transport = service.createTransport(
      options.access ?? { subjectId: "standalone" },
    );
    const expected = token ? Buffer.from(`Bearer ${token}`) : undefined;
    const server = await createKnowledgeHttpServer({
      host,
      ...(options.port !== undefined ? { port: options.port } : {}),
      ...(options.web !== false
        ? {
            staticDirectory:
              options.staticDirectory ??
              fileURLToPath(new URL("../client/", import.meta.url)),
          }
        : {}),
      ...(options.allowedHosts ? { allowedHosts: options.allowedHosts } : {}),
      ...(options.allowedOrigins
        ? { allowedOrigins: options.allowedOrigins }
        : {}),
      resolveTransport(request) {
        if (!expected) return transport;
        const actual = Buffer.from(request.headers.authorization ?? "");
        return actual.length === expected.length &&
          timingSafeEqual(actual, expected)
          ? transport
          : null;
      },
    });
    let closing: Promise<void> | undefined;
    return Object.freeze({
      service,
      server,
      close() {
        return (closing ??= (async () => {
          try {
            await server.close();
          } finally {
            await service.close();
          }
        })());
      },
    });
  } catch (error) {
    await service.close();
    throw error;
  }
}
