import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  getModelConfigurationError,
  getMissingModelParameters,
  MODEL_PROTOCOLS,
  resolveModelConnection,
  type ModelConfiguration,
  type ModelPurpose,
} from "@mewvis/chat-contracts/model-configuration";
import type { ToolParameterDefinition } from "../../../../../builtins/definition.js";
import {
  ProgramExecutor,
  type ExecutionPolicy,
} from "../../../../../../security/execution/index.js";
import { canonicalPath } from "../../../../../../security/platforms/resources.js";
import entries from "../../../../../../../build-entries.json" with { type: "json" };
import {
  assertMediaGenerationArguments,
  mediaCallHelp,
  mediaParameterQuestion,
  mediaPurposeContract,
} from "./contract.js";
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
  description: [
    "Generate images, edit images, generate videos or synthesize speech using the selected model configuration. Workflow: first call action=list with only an optional purpose filter. This returns configuration, not a decision that user parameters are complete. Read the purpose modelId, inputSchema, parameters, requiredUserParameters, questionTemplates and conditional nextSteps.",
    "Before generation, compare the CURRENT user request with those constraints. Read parameter.description for its business meaning, schema.description for value constraints, and schema.options labels/descriptions to interpret the user's intent; only option.value is sent to the provider. schema.enum is the equivalent raw allowed-value list. Reuse values the user already clearly supplied; never ask for them again. askWhenMissing=true requires an explicit or reliably mapped value from the request or an ask_user answer, even when a default exists. A preference such as male voice is not a voice_id unless the returned configuration establishes the mapping. If a requested value or its mapping is unclear, call ask_user BEFORE generate, even when askWhenMissing=false. Use defaults only for unspecified non-asking parameters with no conflicting user preference.",
    "Use the relevant questionTemplates question/context/input to call ask_user, adapting the wording to the user. Templates are possible questions, not a list of missing values. Ask only unresolved items; never invent options. Decode JSON-encoded select answers, or parse text according to valueType/schema, and put the confirmed values in parameters. If the user cancels, stop generation.",
    "Do not use Bash, file/source/history searches or repeated list calls to discover or guess missing parameter identifiers. Ask the user instead. Do not submit generate merely to find out what to ask.",
    "Once values are resolved, call action=generate with the configured purpose. Put content in input and adjustable values in the top-level parameters object. Replace callExample input and outputName placeholders and preserve user choices instead of copying example defaults. Never construct supplier HTTP bodies. The tool selects the actual model, renders the saved template, polls tasks and saves files.",
    "For generate, set outputName to a short descriptive title based on the user's request, honoring an explicitly requested filename. Omit the extension. This is a local filename hint, not provider input. Do not ask the user or make another model request just to name files. The runtime sanitizes names, adds batch indices when needed, a random suffix and the MIME-based extension; omitted or empty names fall back to media type and UTC time. Use the returned fileName and filePath as the actual saved names and paths.",
    "Execution also checks missing parameters: if status=needs_input, no generation was submitted. Use ask_user with the returned questions and retry with the answers in parameters, preserving input and other arguments. Wait for returned file paths; a path does not mean you inspected or listened to it. On failure or stopped waiting, do not automatically resubmit paid generation requests.",
  ].join("\n\n"),
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "union",
        description:
          "list only queries configuration (no input/parameters/files/output settings). generate submits generation and requires purpose and input.",
        anyOf: [
          { type: "literal", value: "list" },
          { type: "literal", value: "generate" },
        ],
      },
      purpose: {
        type: "string",
        optional: true,
        description:
          "Required for generate; optional filter for list. image-generation, image-editing, video-generation or speech.",
      },
      input: {
        type: "json",
        optional: true,
        description:
          "Generation content only, following inputSchema and inputPaths from list. Adjustable values belong in parameters, NOT inside input. Do not supply this field for list.",
      },
      files: {
        type: "array",
        optional: true,
        description:
          'Optional local references inserted into input before schema validation. Use an array, e.g. [{"pointer":"/image","filePath":"/workspace/first.png"}], never an {item: ...} wrapper. Prepare the parent input structure. Only authorized workspace files can be read. Maximum 8 files, 16 MiB each. Multipart or provider uploads are not supported.',
        items: {
          type: "object",
          properties: {
            pointer: {
              type: "string",
              description: "JSON Pointer into input, e.g. /image or /images/0.",
            },
            filePath: {
              type: "string",
              description:
                "Absolute path to an authorized local reference file.",
            },
            format: {
              type: "union",
              optional: true,
              description: "File encoding, defaults to data-url.",
              anyOf: [
                { type: "literal", value: "data-url" },
                { type: "literal", value: "base64" },
              ],
            },
            mimeType: {
              type: "string",
              optional: true,
              description:
                "Optional MIME type, e.g. image/png; otherwise detected from the file.",
            },
          },
        },
      },
      parameters: {
        type: "json",
        optional: true,
        description:
          "Top-level object for adjustable values, e.g. parameters:{voice_id:'user-requested-voice',speed:1.2}. Follow parameterPaths and schemas from list. Never put these fields inside input or at the root. Preserve JSON types. Omitted values use defaults unless askWhenMissing requires asking the user. Do not supply this field for list.",
      },
      outputDirectory: {
        type: "string",
        optional: true,
        description:
          "Directory within the current workspace, absolute or relative. Defaults to generated-media. Files receive unique names.",
      },
      outputName: {
        type: "string",
        optional: true,
        description:
          "Short descriptive filename stem, at most 256 characters, without directory or extension. Honor the user's requested name or derive one from the content. The runtime sanitizes it and adds an optional batch index, random suffix and MIME-based extension. Do not supply this field for list.",
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
      .enum(["image-generation", "image-editing", "video-generation", "speech"])
      .optional(),
    input: z.json().optional(),
    files: z
      .array(
        z
          .object({
            pointer: z.string(),
            filePath: z.string().min(1),
            format: z.enum(["data-url", "base64"]).optional(),
            mimeType: z.string().min(1).optional(),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    parameters: z.record(z.string(), z.json()).optional(),
    outputDirectory: z.string().trim().min(1).optional(),
    outputName: z.string().trim().max(256).optional(),
    timeoutSeconds: z.number().int().min(1).max(3600).optional(),
  })
  .strict();

/** Expose known override types to the model; per-purpose constraints are still validated before submission. */
function overrideParameters(
  purposes: readonly ModelPurpose[],
): ToolParameterDefinition {
  const parameters = new Map<string, Map<string, ToolParameterDefinition>>();
  for (const purpose of purposes) {
    for (const parameter of purpose.parameters.filter(
      (item) => item.overridable,
    )) {
      const variants =
        parameters.get(parameter.name) ??
        new Map<string, ToolParameterDefinition>();
      const previous = variants.get(parameter.type);
      const description = [
        previous && "description" in previous
          ? previous.description
          : undefined,
        `${purpose.type}: ${(parameter.description?.trim() ?? "") || `Override ${parameter.name}`}. Follow this purpose's list result for allowed values.`,
      ]
        .filter(Boolean)
        .join("\n");
      variants.set(
        parameter.type,
        parameter.type === "object"
          ? { type: "json", description }
          : parameter.type === "array"
            ? {
                type: "array",
                description,
                items: { type: "json", description: "Configured array item." },
              }
            : { type: parameter.type, description },
      );
      parameters.set(parameter.name, variants);
    }
  }
  return {
    type: "object",
    optional: true,
    description:
      MEDIA_TOOL_DEFINITION.parameters.properties.parameters.description,
    properties: Object.fromEntries(
      [...parameters].map(([name, variants]) => {
        const types = [...variants.values()];
        return [
          name,
          types.length === 1
            ? { ...types[0], optional: true }
            : {
                type: "union",
                optional: true,
                description: `Type depends on the selected purpose; consult list.`,
                anyOf: types,
              },
        ];
      }),
    ),
  };
}

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
          modelId: purpose.modelId?.trim() || modelId,
          connection: resolveModelConnection(purpose, {
            apiKey: apiKey ?? undefined,
            apiEndpoint: apiEndpoint ?? "",
            apiFormat: apiFormat ?? "http-json",
          }),
        })),
      },
    },
    execution: context.execution,
    // Resolve host-owned paths before isolation; workers cannot inspect them.
    protectedPaths: [
      ...new Set((context.protectedPaths ?? []).map(canonicalPath)),
    ],
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
      [
        "image-generation",
        "image-editing",
        "video-generation",
        "speech",
      ].includes(purpose.type) &&
      purpose.adapter === "http-json" &&
      purpose.request &&
      purpose.response &&
      purpose.output.some(
        (type) => type === "image" || type === "video" || type === "audio",
      ) &&
      (!!purpose.connection?.apiEndpoint ||
        /^https?:\/\//i.test(purpose.request.path)),
  );
  if (!catalog.length) return undefined;
  const calls = new Map<string, Promise<MediaResult>>();
  let running = 0;
  return {
    ...MEDIA_TOOL_DEFINITION,
    parameters: {
      ...MEDIA_TOOL_DEFINITION.parameters,
      properties: {
        ...MEDIA_TOOL_DEFINITION.parameters.properties,
        parameters: overrideParameters(catalog),
      },
    },
    async execute(
      callId: string,
      input: unknown,
      execution: MediaRunContext = {},
    ) {
      execution.signal?.throwIfAborted();
      const parsed = argumentsSchema.safeParse(input);
      if (!parsed.success) {
        const purpose =
          input && typeof input === "object" && "purpose" in input
            ? catalog.find((purpose) => purpose.type === input.purpose)
            : undefined;
        throw new Error(
          redactMedia(
            `generate_media 参数格式错误：${parsed.error.message}。可调参数必须放在顶层 parameters 对象中，不能使用 description 或直接放在根级。${mediaCallHelp(purpose)}`,
            secrets,
          ),
        );
      }
      const args = parsed.data;
      if (args.action === "list") {
        const generationFields = [
          "input",
          "parameters",
          "files",
          "outputDirectory",
          "outputName",
          "timeoutSeconds",
        ].filter((field) => Object.hasOwn(args, field));
        if (generationFields.length) {
          const purpose = catalog.find(
            (purpose) => purpose.type === args.purpose,
          );
          throw new Error(
            redactMedia(
              `action="list" 只查询配置，不能携带 ${generationFields.join("、")}。尚未提交生成请求；要生成请改用 action="generate"。${mediaCallHelp(purpose)}`,
              secrets,
            ),
          );
        }
        const purposes = catalog.filter(
          (purpose) => !args.purpose || purpose.type === args.purpose,
        );
        if (!purposes.length)
          throw new Error(
            "当前模型未配置此媒体用途，请使用 action=list 查看可用用途",
          );
        return redactMedia(
          {
            status: "configuration",
            selectedModelId: model.modelId,
            parameterFields: {
              name: "传入 parameters 时使用的字段名。",
              type: "实际 JSON 数据类型，不能把数字、布尔值转换为字符串。",
              description:
                "参数本身的业务用途与意图匹配依据，优先用于理解用户要求。",
              "schema.description": "取值结构与约束的补充说明。",
              "schema.options":
                "带说明的允许值列表。根据 label、description 匹配用户意图，只提交 value；不提交标签或选项对象。",
              "schema.enum":
                "允许值列表，与 options 二选一；其他 Schema 条件仍需同时满足。",
              default:
                "未指定且 askWhenMissing=false 时可使用；askWhenMissing=true 时仅作为询问的推荐值，不能代替用户选择。",
              askWhenMissing:
                "true 表示需要从用户要求或回答中得到明确值；已有明确值或可从选项说明可靠匹配时无需重复询问。无论开关如何，无法确定符合用户要求的有效值时都先询问。",
              overridable:
                "true 才允许通过 parameters 提供值；false 的配置值由工具使用，模型不得覆盖。",
            },
            message:
              "仅返回配置，尚未判断用户参数是否完整，也未提交生成。请先结合用户原话核对所选用途的 inputSchema、parameters 和 requiredUserParameters：已明确且符合约束的值直接使用，不要重复询问；尚未明确的询问参数，或无法可靠映射为有效值的用户偏好，必须先调用 ask_user。questionTemplates 仅供需要时提问，不代表其中每个参数都缺失。不要反复 list，也不要通过 Bash、文件、源码或历史会话搜索来猜测参数 ID。实际型号见各用途的 modelId，HTTP 请求体由工具按已保存模板渲染。",
            nextSteps: [
              {
                when: "所选用途仍有需要用户明确的参数，或无法确认符合用户偏好的有效值",
                tool: "ask_user",
                instruction:
                  "使用对应 questionTemplates 的 question、context、input 提问，可改写为用户易懂的表达。只询问未明确项，保留用户已给出的值；取消时停止生成。选择项 value 是 JSON 编码，解码后放入 parameters；文本回答按 valueType 和 schema 转换并校验，不要猜测。",
              },
              {
                when: "用户要求和询问参数都已明确，其他未指定参数允许使用默认值",
                tool: "generate_media",
                action: "generate",
                instruction:
                  "替换 callExample 的 input 示例内容，将已明确的参数放进 parameters。callExample 中的默认值不能覆盖用户要求；askWhenMissing=true 的默认值不能代替用户选择。",
              },
            ],
            purposes: purposes.map((purpose) =>
              mediaPurposeContract(purpose, model.modelId),
            ),
          },
          secrets,
        );
      }
      if (!args.purpose)
        throw new Error("生成媒体必须指定 list 返回的 purpose");
      const purpose = catalog.find((purpose) => purpose.type === args.purpose);
      if (!purpose)
        throw new Error("当前模型未配置可执行的媒体用途，请先使用 list 查看");
      const previous = calls.get(callId);
      if (previous) return previous;
      try {
        assertMediaGenerationArguments(purpose, args);
      } catch (error) {
        throw new Error(
          redactMedia(
            error instanceof Error ? error.message : "生成参数无效",
            secrets,
          ),
        );
      }
      const missing = getMissingModelParameters(purpose, args.parameters);
      if (missing.length)
        return redactMedia(
          {
            status: "needs_input",
            modelId: purpose.modelId?.trim() || model.modelId,
            purpose: purpose.type,
            outputs: [],
            nextAction: "ask_user",
            message:
              "尚未提交生成请求。请使用 ask_user 询问缺少的参数，选项 value 是 JSON 编码，回答后解码并放入 parameters。保留原始输入和其他调用参数；用户取消时停止生成，不要套用默认值。",
            questions: missing.map(mediaParameterQuestion),
          } satisfies MediaResult,
          secrets,
        );
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
              modelId: purpose.modelId?.trim() || model.modelId,
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
