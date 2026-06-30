export type ToolParameterDefinition =
  | {
    type: "string";
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
