export enum AskUserInputType {
  Text = "text",
  Select = "select",
}

export type AskUserOption = {
  value: string;
  label: string;
  description?: string;
};

export type AskUserInput = {
  type: AskUserInputType;
  label?: string;
  options?: AskUserOption[];
  selected?: string;
};

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
