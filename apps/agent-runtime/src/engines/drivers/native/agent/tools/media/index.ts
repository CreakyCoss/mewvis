import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  getModelConfigurationError,
  MODEL_PROTOCOLS,
  resolveModelConnection,
  type ModelConfiguration,
} from "@mewvis/chat-contracts/model-configuration";
import type { ToolParameterDefinition } from "../../../../../builtins/definition.js";
import {
  ProgramExecutor,
  type ExecutionPolicy,
} from "../../../../../../security/execution/index.js";
import entries from "../../../../../../../build-entries.json" with { type: "json" };
import {
  redactMedia,
  type MediaProgress,
  type MediaResult,
  type MediaRunner,
  type MediaRunContext,
} from "./types.js";

export const MEDIA_TOOL_DEFINITION = {
  name: "generate_media",
  label: "生成媒体",
  description:
    "Generate or edit images and generate videos using only the currently selected model's configuration. First call action=list to discover its available purposes, inputSchema and overridable parameters. Then call action=generate with input matching that schema. The tool handles model credentials, provider polling and saving files. Wait for the result and use its absolute file paths in later tools or the answer. Do not switch models or invent unsupported purposes or options. A saved path does not mean you have visually inspected the result. On failure or stopped waiting, do not automatically resubmit a paid generation request.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "union",
        description:
          "List the selected model's available media purposes or generate media.",
        anyOf: [
          { type: "literal", value: "list" },
          { type: "literal", value: "generate" },
        ],
      },
      purpose: {
        type: "string",
        optional: true,
        description:
          "Required for generate; optional filter for list. image-generation, image-editing or video-generation.",
      },
      input: {
        type: "json",
        optional: true,
        description:
          "Required for generate. Follow the selected model purpose's inputSchema exactly; field names vary by configuration.",
      },
      files: {
        type: "json",
        optional: true,
        description:
          "Optional local reference files inserted into input before schema validation. Array of {pointer, filePath, format?: 'data-url'|'base64', mimeType?}. Use a JSON Pointer such as /image or /images/0, an absolute local filePath, and prepare the parent input structure. Only authorized workspace files can be read. Maximum 8 files, 16 MiB each. Multipart or provider uploads are not supported.",
      },
      parameters: {
        type: "json",
        optional: true,
        description:
          "Optional object containing only parameters listed as overridable. Omitted values use configured defaults.",
      },
      outputDirectory: {
        type: "string",
        optional: true,
        description:
          "Directory within the current workspace, absolute or relative. Defaults to generated-media. Files receive unique names.",
      },
      timeoutSeconds: {
        type: "integer",
        optional: true,
        description:
          "Maximum total wait, 1–3600 seconds, default 1800. Stopping the wait does not guarantee upstream cancellation.",
      },
    },
  } as const satisfies ToolParameterDefinition,
} as const;

const argumentsSchema = z
  .object({
    action: z.enum(["list", "generate"]),
    purpose: z
      .enum(["image-generation", "image-editing", "video-generation"])
      .optional(),
    input: z.json().optional(),
    files: z.json().optional(),
    parameters: z.record(z.string(), z.json()).optional(),
    outputDirectory: z.string().trim().min(1).optional(),
    timeoutSeconds: z.number().int().min(1).max(3600).optional(),
  })
  .strict();

export type MediaToolContext = {
  workspacePath: string;
  runtimeModel?: unknown;
  protectedPaths?: readonly string[];
  execution: ExecutionPolicy;
  run?: MediaRunner;
};

const runInWorker: MediaRunner = async (request, context) => {
  const worker = new ProgramExecutor({
    policy: request.execution,
    program: {
      executable: process.execPath,
      args: [
        fileURLToPath(new URL(entries.mediaToolWorker.output, import.meta.url)),
      ],
    },
  });
  try {
    return await worker.call<MediaResult>(
      "generate",
      request,
      context.signal,
      context.progress,
    );
  } finally {
    await worker.dispose();
  }
};

/** Generic tool definition and lifecycle; adapters only translate their engine's call/result types. */
export function createMediaTool(context: MediaToolContext) {
  const modelSchema = z.object({
    modelId: z.string().min(1),
    apiKey: z.string().nullish(),
    apiEndpoint: z.string().nullish(),
    apiFormat: z.enum(MODEL_PROTOCOLS).nullish(),
    capabilities: z.object({ toolCalling: z.boolean() }).nullish(),
    configuration: z.custom<ModelConfiguration>(
      (value) => !getModelConfigurationError(value),
    ),
  });
  const parsed = modelSchema.safeParse(context.runtimeModel);
  if (!parsed.success || parsed.data.capabilities?.toolCalling === false)
    return undefined;
  const { configuration, modelId, apiKey, apiEndpoint, apiFormat } =
    parsed.data;
  if (
    configuration.purposes.find((purpose) => purpose.type === "chat")
      ?.toolCalling === false
  )
    return undefined;
  const snapshot = structuredClone({
    model: {
      modelId,
      configuration: {
        ...configuration,
        purposes: configuration.purposes.map((purpose) => ({
          ...purpose,
          modelId: purpose.modelId ?? modelId,
          connection: resolveModelConnection(purpose, {
            apiKey: apiKey ?? undefined,
            apiEndpoint: apiEndpoint ?? "",
            apiFormat: apiFormat ?? "http-json",
          }),
        })),
      },
    },
    execution: context.execution,
    protectedPaths: [...(context.protectedPaths ?? [])],
  });
  if (snapshot.execution.workspacePath !== context.workspacePath)
    throw new Error("媒体工具的执行范围与工作区不一致");
  const model = snapshot.model;
  const secrets = [
    apiKey ?? "",
    ...model.configuration.purposes.map(
      (purpose) => purpose.connection?.apiKey ?? "",
    ),
  ];
  const catalog = model.configuration.purposes.filter(
    (purpose) =>
      ["image-generation", "image-editing", "video-generation"].includes(
        purpose.type,
      ) &&
      purpose.adapter === "http-json" &&
      purpose.request &&
      purpose.response &&
      purpose.output.some((type) => type === "image" || type === "video") &&
      (!!purpose.connection?.apiEndpoint ||
        /^https?:\/\//i.test(purpose.request.path)),
  );
  if (!catalog.length) return undefined;
  const calls = new Map<string, Promise<MediaResult>>();
  let running = 0;
  return {
    ...MEDIA_TOOL_DEFINITION,
    async execute(
      callId: string,
      input: unknown,
      execution: MediaRunContext = {},
    ) {
      execution.signal?.throwIfAborted();
      const args = argumentsSchema.parse(input);
      if (args.action === "list")
        return redactMedia(
          {
            modelId: model.modelId,
            purposes: catalog
              .filter(
                (purpose) => !args.purpose || purpose.type === args.purpose,
              )
              .map((purpose) => ({
                purpose: purpose.type,
                input: purpose.input,
                output: purpose.output,
                inputSchema: purpose.inputSchema ?? true,
                parameters: purpose.parameters.filter(
                  (parameter) => parameter.overridable,
                ),
              })),
          },
          secrets,
        );
      if (!args.purpose)
        throw new Error("生成媒体必须指定 list 返回的 purpose");
      const purpose = catalog.find((purpose) => purpose.type === args.purpose);
      if (!purpose)
        throw new Error("当前模型未配置可执行的媒体用途，请先使用 list 查看");
      const previous = calls.get(callId);
      if (previous) return previous;
      if (running >= 4 || calls.size >= 64)
        throw new Error("媒体工具调用次数或并发数超过上限");
      const operation = (async () => {
        running++;
        let latest: MediaProgress = {
          stage: "preparing",
          message: "准备媒体生成",
          outputs: [],
        };
        const progress = (value: MediaProgress) => {
          latest = value;
          execution.progress?.(redactMedia(value, secrets));
        };
        progress(latest);
        const heartbeat = setInterval(
          () =>
            execution.progress?.(
              redactMedia(
                { ...latest, message: "仍在等待媒体生成工具返回结果…" },
                secrets,
              ),
            ),
          30_000,
        );
        heartbeat.unref();
        try {
          const result = await (context.run ?? runInWorker)(
            {
              model,
              purpose,
              arguments: args,
              execution: snapshot.execution,
              protectedPaths: snapshot.protectedPaths,
            },
            { signal: execution.signal, progress },
          );
          return redactMedia(result, secrets);
        } catch (error) {
          return redactMedia(
            {
              status: execution.signal?.aborted ? "stopped" : "failed",
              modelId: purpose.modelId ?? model.modelId,
              purpose: purpose.type,
              stage: latest.stage,
              ...(latest.taskId ? { taskId: latest.taskId } : {}),
              outputs: latest.outputs ?? [],
              error: execution.signal?.aborted
                ? "已停止等待，上游任务可能仍在执行。请勿自动重新提交生成请求。"
                : error instanceof Error
                  ? error.message.slice(0, 2000)
                  : "媒体生成失败",
              resubmitAutomatically: false,
            } satisfies MediaResult,
            secrets,
          );
        } finally {
          clearInterval(heartbeat);
          running--;
        }
      })();
      calls.set(callId, operation);
      return operation;
    },
  };
}
