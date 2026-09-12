import {
  assertProtocolImplementation,
  defineProtocol,
  missingProtocolMembers,
  protocolKey,
  protocolSatisfies,
  type AnyProtocolDefinition,
  type ProtocolApi,
  type ProtocolDefinition,
  type ProtocolMemberDefinition,
} from "../../../../core/protocol.js";
import type { SafetyRisk } from "../../security/safety/types.js";

export type ToolParameterDefinition =
  | {
      type: "string";
      description: string;
      optional?: boolean;
    }
  | {
      type: "number" | "integer";
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

export type BuiltinToolMethodContract = ProtocolMemberDefinition;
export type BuiltinToolContract<TApi extends object = object> = ProtocolDefinition<TApi>;
export type AnyBuiltinToolContract = AnyProtocolDefinition;
export type BuiltinToolApi<TContract extends AnyBuiltinToolContract> = ProtocolApi<TContract>;
export const defineBuiltinToolContract = defineProtocol;

export type BuiltinToolImplementation<TApi extends object> = Readonly<{
  api: TApi;
  execute(input: unknown): Promise<unknown>;
}>;

export type BuiltinToolDefinition<TContract extends AnyBuiltinToolContract = AnyBuiltinToolContract> = Readonly<{
  name: string;
  label: string;
  risk: SafetyRisk;
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

export const assertBuiltinDefinition = (builtin: BuiltinDefinition) => {
  for (const required of builtin.skill.requiredToolContracts) {
    const candidates = builtin.tools.filter(
      (tool) => tool.contract.id === required.id && tool.contract.version === required.version,
    );
    if (candidates.length === 0) {
      throw new Error(`内置技能 ${builtin.skill.id} 缺少工具协议：${protocolKey(required)}`);
    }
    const compatible = candidates.some((tool) => protocolSatisfies(tool.contract, required));
    if (!compatible) {
      const missing = candidates.map((tool) => missingProtocolMembers(tool.contract, required));
      const methods = [...new Set(missing.flatMap((entry) => entry.methods))];
      const properties = [...new Set(missing.flatMap((entry) => entry.properties))];
      const details = [
        ...(methods.length > 0 ? [`方法：${methods.join(", ")}`] : []),
        ...(properties.length > 0 ? [`属性：${properties.join(", ")}`] : []),
      ];
      throw new Error(`内置技能 ${builtin.skill.id} 的工具协议 ${protocolKey(required)} 缺少${details.join("；")}`);
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
  try {
    assertProtocolImplementation(tool.contract, implementation.api);
  } catch (error) {
    throw new Error(
      `内置工具 ${tool.name} 未实现协议 ${protocolKey(tool.contract)}：${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
