export type ToolParameterDefinition =
  | {
      type: "string";
      description: string;
      optional?: boolean;
    }
  | {
      type: "boolean";
      description: string;
      optional?: boolean;
    }
  | {
      type: "json";
      description: string;
      optional?: boolean;
    }
  | {
      type: "literal";
      value: string;
      optional?: boolean;
    }
  | {
      type: "union";
      description: string;
      anyOf: readonly ToolParameterDefinition[];
      optional?: boolean;
    }
  | {
      type: "array";
      description: string;
      items: ToolParameterDefinition;
      optional?: boolean;
    }
  | {
      type: "object";
      description?: string;
      properties: Record<string, ToolParameterDefinition>;
      optional?: boolean;
    };

export type BuiltinToolContext = Readonly<{
  workspacePath: string;
}>;

type BuiltinToolMethodName<TApi extends object> = Extract<
  {
    [TKey in keyof TApi]-?: TApi[TKey] extends (...args: never[]) => unknown ? TKey : never;
  }[keyof TApi],
  string
>;

export type BuiltinToolMethodContract = Readonly<{
  description?: string;
}>;

declare const BUILTIN_TOOL_CONTRACT_API: unique symbol;

export type BuiltinToolContract<TApi extends object = object> = Readonly<{
  id: string;
  version: number;
  methods: Readonly<Record<BuiltinToolMethodName<TApi>, BuiltinToolMethodContract>>;
  [BUILTIN_TOOL_CONTRACT_API]?: TApi;
}>;

export type AnyBuiltinToolContract = BuiltinToolContract<object>;

export type BuiltinToolApi<TContract extends AnyBuiltinToolContract> =
  TContract extends BuiltinToolContract<infer TApi> ? TApi : never;

export const defineBuiltinToolContract =
  <TApi extends object>() =>
  <const TContract extends BuiltinToolContract<TApi>>(contract: TContract) =>
    Object.freeze(contract) as TContract & BuiltinToolContract<TApi>;

export type BuiltinToolImplementation<TApi extends object> = Readonly<{
  api: TApi;
  execute(input: unknown): Promise<unknown>;
}>;

export type BuiltinToolDefinition<TContract extends AnyBuiltinToolContract = AnyBuiltinToolContract> = Readonly<{
  name: string;
  label: string;
  description: string;
  contract: TContract;
  parameters: ToolParameterDefinition;
  createImplementation(context: BuiltinToolContext): BuiltinToolImplementation<BuiltinToolApi<TContract>>;
}>;

export type BuiltinSkillDefinition = Readonly<{
  id: string;
  referenceName: string;
  skills: Readonly<{
    names: readonly string[];
    resolveSourcePath(): string;
  }>;
  requiredToolContracts: readonly AnyBuiltinToolContract[];
  requiredExternalTools: readonly string[];
}>;

export type BuiltinDefinition = Readonly<{
  id: string;
  skill: BuiltinSkillDefinition;
  tools: readonly BuiltinToolDefinition[];
}>;

const contractKey = (contract: AnyBuiltinToolContract) => `${contract.id}@${contract.version}`;

const missingContractMethods = (provided: AnyBuiltinToolContract, required: AnyBuiltinToolContract) =>
  Object.keys(required.methods).filter((method) => !(method in provided.methods));

export const assertBuiltinDefinition = (builtin: BuiltinDefinition) => {
  for (const required of builtin.skill.requiredToolContracts) {
    const candidates = builtin.tools.filter(
      (tool) => tool.contract.id === required.id && tool.contract.version === required.version,
    );
    if (candidates.length === 0) {
      throw new Error(`内置技能 ${builtin.skill.id} 缺少工具协议：${contractKey(required)}`);
    }
    const compatible = candidates.some((tool) => missingContractMethods(tool.contract, required).length === 0);
    if (!compatible) {
      const missing = [...new Set(candidates.flatMap((tool) => missingContractMethods(tool.contract, required)))];
      throw new Error(
        `内置技能 ${builtin.skill.id} 的工具协议 ${contractKey(required)} 缺少方法：${missing.join(", ")}`,
      );
    }
  }
};

export const defineBuiltin = <const TBuiltin extends BuiltinDefinition>(builtin: TBuiltin) => {
  assertBuiltinDefinition(builtin);
  return Object.freeze({
    ...builtin,
    tools: Object.freeze([...builtin.tools]),
  }) as TBuiltin;
};

export const assertBuiltinToolImplementation = (
  tool: BuiltinToolDefinition,
  implementation: BuiltinToolImplementation<object>,
) => {
  const missing = Object.keys(tool.contract.methods).filter(
    (method) => typeof (implementation.api as Record<string, unknown>)[method] !== "function",
  );
  if (missing.length > 0) {
    throw new Error(`内置工具 ${tool.name} 未实现协议 ${contractKey(tool.contract)} 的方法：${missing.join(", ")}`);
  }
};
