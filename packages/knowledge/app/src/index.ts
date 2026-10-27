/** 独立应用入口：装配服务、HTTP 和可选网页；业务实现仍由 knowledge/service 提供。 */
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { KnowledgeError, createKnowledgeClient } from "@mewvis/knowledge-sdk";
import { parseOriginal } from "./parsing/index.js";
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
  const configuration =
    options.configuration.backend.kind === "sqlite" &&
    !options.configuration.attachmentStorage
      ? {
          backend: options.configuration.backend,
          ...(options.configuration.embedding
            ? { embedding: options.configuration.embedding }
            : {}),
          attachmentStorage: {
            kind: "local" as const,
            storageId: "standalone-originals",
            directory: join(
              options.configuration.backend.directory,
              "originals",
            ),
          },
        }
      : options.configuration;
  const service = await createKnowledgeService(
    configuration,
    options.serviceOptions,
  );
  try {
    const access = options.access ?? { subjectId: "standalone" };
    const transport = service.createTransport(access);
    const gateway = service.createAttachmentGateway(access);
    const expected = token ? Buffer.from(`Bearer ${token}`) : undefined;
    const authenticated = (request: {
      headers: { authorization?: string | undefined };
    }) => {
      if (!expected) return true;
      const actual = Buffer.from(request.headers.authorization ?? "");
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    };
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
        return authenticated(request) ? transport : null;
      },
      resolveAttachments(request) {
        return authenticated(request) ? gateway : null;
      },
      async parseAttachment(input, authorizedTransport, signal) {
        const client = createKnowledgeClient(authorizedTransport);
        const attachment = await client.attachments.get(input, { signal });
        if (attachment.state !== "ready")
          throw new KnowledgeError({
            code: "NOT_READY",
            message: "原件尚未完成上传。",
          });
        const download = await client.attachments.createDownload(input, {
          signal,
        });
        if (download.transfer.kind !== "host")
          throw new KnowledgeError({
            code: "NOT_SUPPORTED",
            message: "当前解析入口只支持本地原件。",
          });
        const file = await gateway.download(download.transfer.token, {
          signal,
        });
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of file.body) {
          size += chunk.byteLength;
          if (size > 32 * 1024 * 1024)
            throw new KnowledgeError({
              code: "INVALID_ARGUMENT",
              message: "原件超过解析大小限制。",
            });
          chunks.push(chunk);
        }
        const document = await parseOriginal(
          file.fileName,
          Buffer.concat(chunks),
          signal,
        );
        return {
          ...document,
          source: {
            attachmentId: attachment.id,
            mediaType: attachment.mediaType,
          },
        };
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
