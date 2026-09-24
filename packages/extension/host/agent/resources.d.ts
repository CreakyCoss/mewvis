import type { JsonObject, JsonValue } from "../shared.js";

export interface ExtensionToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: JsonValue;
}

export interface ExtensionTool {
  name: string;
  label: string;
  description: string;
  parameters: JsonObject;
  execute(
    input: JsonObject,
    context: {
      callId: string;
      signal: AbortSignal;
      progress(result: ExtensionToolResult): void;
    },
  ): Promise<ExtensionToolResult>;
}

export interface ExtensionSkill {
  name: string;
  description: string;
  content: string;
}

export interface ExtensionCommand {
  /** Text commands accept slash input as { text }; other commands use structured arguments. */
  inputMode?: "text";
  name: string;
  description: string;
  parameters: JsonObject;
  execute(
    input: JsonObject,
    context: { signal: AbortSignal },
  ): Promise<JsonValue>;
}
