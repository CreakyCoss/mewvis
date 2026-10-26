#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parseKnowledgeServiceConfiguration } from "@mewvis/knowledge-sdk/configuration";
import { startKnowledgeApplication } from "./index.js";
import { seedKnowledgeDemo } from "./demo.js";

const usage = `Mewvis 知识库

  pnpm start:knowledge --data /absolute/data/directory
  pnpm start:knowledge --data /absolute/data/directory --headless
  pnpm start:knowledge --config /path/knowledge.json

  --data <目录>      显式指定 SQLite 数据目录，与 --config 二选一
  --config <文件>    知识库服务配置 JSON；相对目录按配置文件所在目录解析
  --host <地址>      默认 127.0.0.1
  --port <端口>      默认 4317；0 自动分配
  --headless         只启动 API，不提供网页
  --demo             空知识库中创建示例资料，便于测试
  --help             显示帮助

认证令牌通过 KNOWLEDGE_API_TOKEN 环境变量提供；非本机监听必须配置。
Embedding 等 credentialRef 从同名环境变量解析，不读取宿主 config.db。
`;

try {
  const { values } = parseArgs({
    options: {
      data: { type: "string" },
      config: { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
      headless: { type: "boolean" },
      demo: { type: "boolean" },
      help: { type: "boolean" },
    },
    strict: true,
  });
  if (values.help) {
    process.stdout.write(usage);
  } else {
    if (Boolean(values.data) === Boolean(values.config))
      throw new Error(
        "请通过 --data 或 --config 显式指定存储，二者不可同时使用。",
      );
    let raw: unknown;
    if (values.config) {
      const configPath = resolve(values.config);
      raw = JSON.parse(await readFile(configPath, "utf8"));
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const record = raw as {
          backend?: { kind?: string; directory?: string };
          attachmentStorage?: { kind?: string; directory?: string };
        };
        if (
          record.backend?.kind === "sqlite" &&
          typeof record.backend.directory === "string"
        )
          record.backend.directory = resolve(
            dirname(configPath),
            record.backend.directory,
          );
        if (
          record.attachmentStorage?.kind === "local" &&
          typeof record.attachmentStorage.directory === "string"
        )
          record.attachmentStorage.directory = resolve(
            dirname(configPath),
            record.attachmentStorage.directory,
          );
      }
    } else
      raw = { backend: { kind: "sqlite", directory: resolve(values.data!) } };
    const port =
      values.port === undefined
        ? 4317
        : /^\d+$/.test(values.port)
          ? Number(values.port)
          : NaN;
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
      throw new Error("端口必须为 0–65535 的整数。");
    const token = process.env.KNOWLEDGE_API_TOKEN;
    const app = await startKnowledgeApplication({
      configuration: parseKnowledgeServiceConfiguration(raw),
      port,
      ...(values.host ? { host: values.host } : {}),
      web: !values.headless,
      ...(token ? { token } : {}),
      serviceOptions: {
        resolveCredential(reference) {
          const value = process.env[reference];
          if (!value)
            throw new Error(
              "Knowledge credential environment reference is not configured",
            );
          return value;
        },
      },
    });
    try {
      if (values.demo) await seedKnowledgeDemo(app.service);
    } catch (error) {
      await app.close();
      throw error;
    }
    process.stdout.write(
      `知识库${values.headless ? "服务" : "应用"}已启动：${app.server.url}\nRPC：${app.server.rpcEndpoint}\n`,
    );
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void app.close().catch(() => {
        process.exitCode = 1;
      });
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof SyntaxError ? "配置文件不是有效的 JSON。" : error instanceof Error ? error.message : "知识库启动失败。"}\n`,
  );
  process.exitCode = 1;
}
