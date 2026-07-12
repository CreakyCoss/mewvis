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
  requiredContractCapabilities: readonly string[];
}>;

export type BuiltinToolDefinition = Readonly<{
  name: string;
  label: string;
  description: string;
  capabilities: readonly string[];
  parameters: ToolParameterDefinition;
  createExecutor(context: BuiltinToolContext): (input: unknown) => Promise<unknown>;
}>;

export type BuiltinSkillDefinition = Readonly<{
  id: string;
  referenceName: string;
  skills: Readonly<{
    names: readonly string[];
    resolveSourcePath(): string;
  }>;
  requiredToolCapabilities: readonly string[];
  requiredContractCapabilities: readonly string[];
  requiredExternalTools: readonly string[];
}>;

export type BuiltinCombinationDefinition = Readonly<{
  skill: BuiltinSkillDefinition;
  tools: readonly BuiltinToolDefinition[];
}>;
