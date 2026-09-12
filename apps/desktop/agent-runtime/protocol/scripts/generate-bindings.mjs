import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { build } from "esbuild";
const permissionBundle = await build({
  entryPoints: [fileURLToPath(new URL("../../src/security/safety/index.ts", import.meta.url))],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { AGENT_PERMISSION_DEFINITIONS, getAgentPermissionOptions } = await import(
  `data:text/javascript;base64,${Buffer.from(permissionBundle.outputFiles[0].text).toString("base64")}`
);

const protocolRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const protocolVersionRoot = join(protocolRoot, "v1");
const schemaRoot = join(protocolVersionRoot, "schema");
const aggregateSchema = join(schemaRoot, "bindings.schema.json");
const openRpcDocument = JSON.parse(readFileSync(join(protocolVersionRoot, "openrpc.json"), "utf8"));
const eventSchemaDocument = JSON.parse(readFileSync(join(schemaRoot, "event.schema.json"), "utf8"));
const modelSchemaDocument = JSON.parse(readFileSync(join(schemaRoot, "model.schema.json"), "utf8"));
const resultSchemaDocument = JSON.parse(readFileSync(join(schemaRoot, "result.schema.json"), "utf8"));
const checkOnly = process.argv.includes("--check");
const tempRoot = mkdtempSync(join(tmpdir(), "isle-agent-runtime-bindings-"));
const permissionOptions = getAgentPermissionOptions();
if (
  permissionOptions.filter((option) => option.isDefault).length !== 1 ||
  new Set(permissionOptions.map((option) => option.mode)).size !== permissionOptions.length
)
  throw new Error("权限定义必须有且只有一个默认项，且模式不可重复。");
const permissionSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://isle.local/protocol/agent-runtime/v1/permissions.schema.json",
  $comment: "Generated from src/security/safety/policy.ts; do not edit.",
  title: "IsleAgentPermissionsProtocol",
  anyOf: [{ $ref: "#/definitions/AgentPermissions" }, { $ref: "#/definitions/AgentPermissionOption" }],
  definitions: {
    AgentPermissionMode: { type: "string", enum: AGENT_PERMISSION_DEFINITIONS.map((definition) => definition.mode) },
    AgentPermissions: {
      type: "object",
      required: ["mode"],
      additionalProperties: false,
      properties: { mode: { $ref: "#/definitions/AgentPermissionMode" } },
    },
    AgentPermissionOption: {
      type: "object",
      required: ["mode", "label", "description", "isDefault"],
      additionalProperties: false,
      properties: {
        mode: { $ref: "#/definitions/AgentPermissionMode" },
        label: { type: "string" },
        description: { type: "string" },
        isDefault: { type: "boolean" },
      },
    },
  },
};

const commandMethods = openRpcDocument.methods
  .filter((method) => method["x-isle-command"])
  .map((method) => method.name);
const notificationMethods = openRpcDocument.methods
  .filter((method) => !method["x-isle-command"])
  .map((method) => method.name);
const eventTypes = [
  ...new Set(
    Object.values(eventSchemaDocument.definitions)
      .map((definition) => definition?.properties?.type?.const)
      .filter((value) => typeof value === "string"),
  ),
];
const resultTypes = [
  ...new Set(
    Object.values(resultSchemaDocument.definitions)
      .map((definition) => definition?.properties?.type?.const)
      .filter((value) => typeof value === "string"),
  ),
];
const modelEnumValues = Object.fromEntries(
  ["RuntimeApiFormat", "RuntimeModelInputModality"].map((name) => [name, modelSchemaDocument.definitions[name].enum]),
);

const sourceSchemas = [
  "access.schema.json",
  "permissions.schema.json",
  "model.schema.json",
  "request.schema.json",
  "response.schema.json",
  "notification.schema.json",
  "event.schema.json",
  "result.schema.json",
].map((name) => join(schemaRoot, name));

const targets = [
  {
    language: "typescript",
    generator: "json2ts",
    relativePath: "typescript/index.ts",
    extension: "ts",
    args: ["--style.singleQuote", "--style.semi"],
  },
  {
    language: "rust",
    relativePath: "rust/mod.rs",
    extension: "rs",
    args: [
      "--lang",
      "rust",
      "--visibility",
      "public",
      "--derive-partial-eq",
      "--skip-serializing-none",
      "--alphabetize-properties",
    ],
  },
  {
    language: "python",
    relativePath: "python/__init__.py",
    extension: "py",
    args: ["--lang", "python", "--python-version", "3.10", "--just-types", "--alphabetize-properties"],
  },
];

const quote = (value) => JSON.stringify(value);
const methodConstantSuffix = (method) =>
  method
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();

const pascalIdentifier = (value) =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");

const camelIdentifier = (value) => {
  const pascal = pascalIdentifier(value);
  return `${pascal[0].toLowerCase()}${pascal.slice(1)}`;
};

const typescriptStringEnumMetadata = (name, values) =>
  [
    `export const ${name} = {`,
    values.map((value) => `  ${pascalIdentifier(value)}: ${quote(value)},`).join("\n"),
    `} as const;`,
    `export type ${name} = (typeof ${name})[keyof typeof ${name}];`,
  ].join("\n");

const typescriptRequestMetadata = () => {
  const factories = commandMethods
    .map((method) => {
      const property = camelIdentifier(method);
      return [
        `  ${property}: (id: string | number, params: AgentRuntimeRequestParams<${quote(method)}>) =>`,
        `    createAgentRuntimeRequest(id, ${quote(method)}, params),`,
      ].join("\n");
    })
    .join("\n");

  return [
    "export type AgentRuntimeRequestFor<TMethod extends AgentRuntimeJsonRpcMethod> = Extract<IsleAgentRuntimeJSONRPCRequest, { method?: TMethod }> ;",
    'export type AgentRuntimeRequestParams<TMethod extends AgentRuntimeJsonRpcMethod> = NonNullable<AgentRuntimeRequestFor<TMethod>["params"]>;',
    "export const createAgentRuntimeRequest = <TMethod extends AgentRuntimeJsonRpcMethod>(",
    "  id: string | number,",
    "  method: TMethod,",
    "  params: AgentRuntimeRequestParams<TMethod>,",
    '): AgentRuntimeRequestFor<TMethod> => ({ jsonrpc: "2.0", id, method, params }) as AgentRuntimeRequestFor<TMethod>;',
    "export const agentRuntimeRequests = {",
    factories,
    "} as const;",
  ].join("\n");
};

const typescriptResultMetadata = () => {
  const typeProperties = resultTypes.map((type) => `  ${pascalIdentifier(type)}: ${quote(type)},`).join("\n");
  const factories = resultTypes
    .map((type) => {
      const property = pascalIdentifier(type);
      return [
        `  ${camelIdentifier(type)}: (payload: AgentRuntimeResultPayload<typeof AgentRuntimeResultType.${property}>) =>`,
        `    createAgentRuntimeResult(AgentRuntimeResultType.${property}, payload),`,
      ].join("\n");
    })
    .join("\n");
  const guards = resultTypes
    .map((type) => {
      const property = pascalIdentifier(type);
      return [
        `  ${camelIdentifier(type)}: (result: { type: string }): result is { type: typeof AgentRuntimeResultType.${property} } =>`,
        `    isAgentRuntimeResultType(result, AgentRuntimeResultType.${property}),`,
      ].join("\n");
    })
    .join("\n");

  return [
    "export const AgentRuntimeResultType = {",
    typeProperties,
    "} as const;",
    "export type AgentRuntimeResultType = (typeof AgentRuntimeResultType)[keyof typeof AgentRuntimeResultType];",
    "export type AgentRuntimeResultOf<TType extends AgentRuntimeResultType> = Extract<AgentRuntimeResult, { type: TType }> ;",
    'type AgentRuntimeResultPayloadFor<TResult> = TResult extends { type: AgentRuntimeResultType } ? Omit<TResult, "type"> : never;',
    "export type AgentRuntimeResultPayload<TType extends AgentRuntimeResultType> = AgentRuntimeResultPayloadFor<AgentRuntimeResultOf<TType>>;",
    "export const isAgentRuntimeResultType = <TType extends AgentRuntimeResultType>(",
    "  result: { type: string },",
    "  type: TType,",
    "): result is { type: TType } => result.type === type;",
    "export const createAgentRuntimeResult = <TType extends AgentRuntimeResultType>(",
    "  type: TType,",
    "  payload: AgentRuntimeResultPayload<TType>,",
    "): AgentRuntimeResultOf<TType> => ({ type, ...payload }) as unknown as AgentRuntimeResultOf<TType>;",
    "export const agentRuntimeResults = {",
    factories,
    "} as const;",
    "export const agentRuntimeResultGuards = {",
    guards,
    "} as const;",
  ].join("\n");
};

const typescriptEventMetadata = () => {
  const typeProperties = eventTypes.map((type) => `  ${pascalIdentifier(type)}: ${quote(type)},`).join("\n");
  const factories = eventTypes
    .map((type) => {
      const property = pascalIdentifier(type);
      return [
        `  ${camelIdentifier(type)}: (payload: AgentRuntimeEventPayload<typeof AgentRuntimeEventType.${property}>) =>`,
        `    createAgentRuntimeEvent(AgentRuntimeEventType.${property}, payload),`,
      ].join("\n");
    })
    .join("\n");
  const guards = eventTypes
    .map((type) => {
      const property = pascalIdentifier(type);
      return [
        `  ${camelIdentifier(type)}: (event: { type: string }): event is { type: typeof AgentRuntimeEventType.${property} } =>`,
        `    isAgentRuntimeEventType(event, AgentRuntimeEventType.${property}),`,
      ].join("\n");
    })
    .join("\n");

  return [
    "export const AgentRuntimeEventType = {",
    typeProperties,
    "} as const;",
    'export type AgentEvent = CollaborationAgentEvent["event"];',
    "export type CollaborationEvent = WorkflowStartedEvent | StepStartedEvent | CollaborationAgentEvent | StepDoneEvent | StepSkippedEvent | WorkflowDoneEvent | CollaborationErrorEvent;",
    "export type AgentRuntimeEventType = (typeof AgentRuntimeEventType)[keyof typeof AgentRuntimeEventType];",
    "export type AgentRuntimeEventOf<TType extends AgentRuntimeEventType> = Extract<AgentRuntimeEvent, { type: TType }> ;",
    'type AgentRuntimeEventPayloadFor<TEvent> = TEvent extends { type: AgentRuntimeEventType } ? Omit<TEvent, "type"> : never;',
    "export type AgentRuntimeEventPayload<TType extends AgentRuntimeEventType> = AgentRuntimeEventPayloadFor<AgentRuntimeEventOf<TType>>;",
    "export const isAgentRuntimeEventType = <TType extends AgentRuntimeEventType>(",
    "  event: { type: string },",
    "  type: TType,",
    "): event is { type: TType } => event.type === type;",
    "export const createAgentRuntimeEvent = <TType extends AgentRuntimeEventType>(",
    "  type: TType,",
    "  payload: AgentRuntimeEventPayload<TType>,",
    "): AgentRuntimeEventOf<TType> => ({ type, ...payload }) as unknown as AgentRuntimeEventOf<TType>;",
    "export const agentRuntimeEvents = {",
    factories,
    "} as const;",
    "export const agentRuntimeEventGuards = {",
    guards,
    "} as const;",
  ].join("\n");
};

const metadataFor = (language) => {
  if (language === "typescript") {
    return [
      `export const agentRuntimeProtocolVersion = ${quote(openRpcDocument.info.version)} as const;`,
      `export const agentRuntimeJsonRpcMethods = ${JSON.stringify(commandMethods)} as const;`,
      `export const agentRuntimeNotificationMethods = ${JSON.stringify(notificationMethods)} as const;`,
      "export type AgentRuntimeJsonRpcMethod = (typeof agentRuntimeJsonRpcMethods)[number];",
      "export type AgentRuntimeNotificationMethod = (typeof agentRuntimeNotificationMethods)[number];",
      ...Object.entries(modelEnumValues).map(([name, values]) => typescriptStringEnumMetadata(name, values)),
      `export const agentPermissionOptions = ${JSON.stringify(permissionOptions)} as const satisfies readonly AgentPermissionOption[];`,
      typescriptRequestMetadata(),
      typescriptEventMetadata(),
      typescriptResultMetadata(),
    ].join("\n");
  }
  if (language === "rust") {
    return [
      `pub const AGENT_RUNTIME_PROTOCOL_VERSION: &str = ${quote(openRpcDocument.info.version)};`,
      `pub const AGENT_RUNTIME_JSON_RPC_METHODS: &[&str] = &[${commandMethods.map(quote).join(", ")}];`,
      `pub const AGENT_RUNTIME_NOTIFICATION_METHODS: &[&str] = &[${notificationMethods.map(quote).join(", ")}];`,
      ...commandMethods.map((method) => `pub const METHOD_${methodConstantSuffix(method)}: &str = ${quote(method)};`),
      ...notificationMethods.map(
        (method) => `pub const NOTIFICATION_${methodConstantSuffix(method)}: &str = ${quote(method)};`,
      ),
      ...eventTypes.map((type) => `pub const EVENT_${methodConstantSuffix(type)}: &str = ${quote(type)};`),
      ...resultTypes.map((type) => `pub const RESULT_${methodConstantSuffix(type)}: &str = ${quote(type)};`),
    ].join("\n");
  }
  return [
    "from typing import Final",
    "",
    `AGENT_RUNTIME_PROTOCOL_VERSION: Final[str] = ${quote(openRpcDocument.info.version)}`,
    `AGENT_RUNTIME_JSON_RPC_METHODS: Final[tuple[str, ...]] = (${commandMethods.map(quote).join(", ")},)`,
    `AGENT_RUNTIME_NOTIFICATION_METHODS: Final[tuple[str, ...]] = (${notificationMethods.map(quote).join(", ")},)`,
    `AGENT_RUNTIME_EVENT_TYPES: Final[tuple[str, ...]] = (${eventTypes.map(quote).join(", ")},)`,
    `AGENT_RUNTIME_RESULT_TYPES: Final[tuple[str, ...]] = (${resultTypes.map(quote).join(", ")},)`,
    ...eventTypes.map((type) => `EVENT_${methodConstantSuffix(type)}: Final[str] = ${quote(type)}`),
    ...resultTypes.map((type) => `RESULT_${methodConstantSuffix(type)}: Final[str] = ${quote(type)}`),
  ].join("\n");
};

const generatedHeader = (language) => {
  const marker = language === "python" ? "#" : "//";
  return [
    `${marker} @generated by protocol/scripts/generate-bindings.mjs`,
    `${marker} Sources: protocol/v1/schema/*.schema.json and protocol/v1/openrpc.json`,
    `${marker} Do not edit this file directly.`,
    "",
  ].join("\n");
};

try {
  const stale = [];
  const saveGenerated = (destination, generated) => {
    const current = existsSync(destination) ? readFileSync(destination, "utf8") : null;
    if (current === generated) return;
    if (checkOnly) {
      stale.push(destination);
      return;
    }
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, generated);
    console.log(`generated ${destination}`);
  };
  saveGenerated(
    join(schemaRoot, "permissions.schema.json"),
    await format(JSON.stringify(permissionSchema), { parser: "json", printWidth: 120 }),
  );

  // Publish the same protocol types with the standalone Chat contracts. Applications
  // must not depend on a private desktop source path or a hand-maintained enum.
  const thinkingSchema = join(tempRoot, "model-thinking.schema.json");
  writeFileSync(
    thinkingSchema,
    JSON.stringify({
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "ModelThinkingProtocol",
      anyOf: [{ $ref: "#/definitions/RuntimeModelThinking" }],
      definitions: Object.fromEntries(
        ["RuntimeModelThinking", "RuntimeThinkingOption", "RuntimeThinkingLevel"].map((name) => [
          name,
          modelSchemaDocument.definitions[name],
        ]),
      ),
    }),
  );
  for (const [schema, name] of [
    ["access.schema.json", "agent-access"],
    ["permissions.schema.json", "agent-permissions"],
    [thinkingSchema, "model-thinking"],
  ]) {
    const sharedTypes = join(tempRoot, `${name}.d.ts`);
    const sharedResult = spawnSync("json2ts", ["--input", schema, "--output", sharedTypes], {
      cwd: schemaRoot,
      encoding: "utf8",
    });
    if (sharedResult.error || sharedResult.status !== 0)
      throw new Error(`共享协议 ${name} 生成失败：${sharedResult.error?.message ?? sharedResult.stderr}`);
    saveGenerated(
      join(protocolRoot, `../../../../packages/chat-contracts/${name}.d.ts`),
      await format(`${generatedHeader("typescript")}${readFileSync(sharedTypes, "utf8")}`, {
        parser: "typescript",
        printWidth: 120,
        singleQuote: false,
      }),
    );
  }
  saveGenerated(
    join(protocolRoot, "../../../../packages/chat-contracts/agent-access.schema.json"),
    readFileSync(join(schemaRoot, "access.schema.json"), "utf8"),
  );
  for (const target of targets) {
    const tempOutput = join(tempRoot, `agent-runtime-v1.${target.extension}`);
    const result =
      target.generator === "json2ts"
        ? spawnSync("json2ts", ["--input", "bindings.schema.json", "--output", tempOutput, ...target.args], {
            cwd: schemaRoot,
            encoding: "utf8",
          })
        : spawnSync(
            "quicktype",
            [
              "--src-lang",
              "schema",
              "--top-level",
              "AgentRuntimeMessage",
              ...target.args,
              ...sourceSchemas.flatMap((schema) => ["--additional-schema", schema]),
              "--out",
              tempOutput,
              aggregateSchema,
            ],
            { cwd: protocolRoot, encoding: "utf8" },
          );
    if (result.error) {
      throw new Error(
        `${target.generator ?? "quicktype"} 不可用；请在 ${protocolRoot} 运行 pnpm install\n${result.error.message}`,
      );
    }
    if (result.status !== 0) {
      throw new Error(
        `${target.generator ?? "quicktype"} ${target.language} 生成失败\n${result.stdout}\n${result.stderr}`,
      );
    }

    let generated = `${generatedHeader(target.language)}${readFileSync(tempOutput, "utf8").trim()}\n\n${metadataFor(
      target.language,
    )}\n`;
    if (target.language === "typescript") {
      generated = await format(generated, {
        parser: "typescript",
        printWidth: 120,
        tabWidth: 2,
        useTabs: false,
        semi: true,
        singleQuote: false,
        trailingComma: "all",
      });
    } else if (target.language === "rust") {
      // Access declarations reject typos at the native manifest boundary too.
      generated = generated.replace(
        /pub struct (AgentAccess|AgentFilesystemAccess|AgentNetworkAccess|AgentProcessAccess|AgentAccessPath) \{[\s\S]*?\n\}/g,
        (block) =>
          "#[serde(deny_unknown_fields)]\n" +
          block.replace(
            /(?<!#\[serde\(skip_serializing_if = "Option::is_none"\)\]\n)    pub (\w+): Option</g,
            '    #[serde(skip_serializing_if = "Option::is_none")]\n    pub $1: Option<',
          ),
      );
      writeFileSync(tempOutput, generated);
      const rustfmt = spawnSync("rustfmt", ["--edition", "2021", tempOutput], {
        cwd: protocolRoot,
        encoding: "utf8",
      });
      if (rustfmt.status !== 0) {
        throw new Error(`rustfmt 生成协议 binding 失败\n${rustfmt.stdout}\n${rustfmt.stderr}`);
      }
      generated = readFileSync(tempOutput, "utf8");
    }
    saveGenerated(join(protocolVersionRoot, "sdk", target.relativePath), generated);
  }

  if (stale.length > 0) {
    throw new Error(`协议 bindings 已漂移，请在 ${protocolRoot} 运行 pnpm generate：\n${stale.join("\n")}`);
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
