import {
  defineProtocol,
  type AnyProtocolDefinition,
  type ProtocolApi,
  type ProtocolDefinition,
  type ProtocolMemberDefinition,
} from "../../core/protocol.js";
type SafetyRisk = "low" | "medium" | "high";

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
export type BuiltinToolContract<TApi extends object = object> =
  ProtocolDefinition<TApi>;
export type AnyBuiltinToolContract = AnyProtocolDefinition;
export type BuiltinToolApi<TContract extends AnyBuiltinToolContract> =
  ProtocolApi<TContract>;
export const defineBuiltinToolContract = defineProtocol;

export type BuiltinToolImplementation<TApi extends object> = Readonly<{
  api: TApi;
  execute(input: unknown): Promise<unknown>;
}>;

export type BuiltinToolDefinition<
  TContract extends AnyBuiltinToolContract = AnyBuiltinToolContract,
> = Readonly<{
  name: string;
  label: string;
  risk: SafetyRisk;
  description: string;
  contract: TContract;
  parameters: ToolParameterDefinition;
  createImplementation(
    context: BuiltinToolContext,
  ): BuiltinToolImplementation<BuiltinToolApi<TContract>>;
}>;
