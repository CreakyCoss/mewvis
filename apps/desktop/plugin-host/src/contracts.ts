export type PluginRuntimeKind = "isle" | "dsh";

export type RuntimePlugin = Readonly<{
  kind: PluginRuntimeKind;
  id: string;
  entry: string;
  packageRoot: string;
  patchPath?: string | null;
  config?: Record<string, unknown> | null;
}>;

export interface PluginAdapter {
  readonly kind: PluginRuntimeKind;
  load(plugin: RuntimePlugin): Promise<void>;
}

export type PluginToolSchema = Readonly<{
  name: string;
  description: string;
  parameters: unknown;
}>;

export type PluginToolCall = Readonly<{
  callId: string;
  name: string;
  arguments: unknown;
  signal?: AbortSignal;
}>;

export type PluginToolResult = Readonly<{
  isError: boolean;
  error: { message: string };
  value: unknown;
  content: readonly unknown[];
  meta?: unknown;
  additionalContexts?: unknown;
  concludesTurn?: boolean;
}>;

export type PluginSkillViewOptions = Readonly<{
  cwd?: string;
}>;

export type PluginSkillSummary = Readonly<{
  name: string;
  [key: string]: unknown;
}>;

export type PluginSkillDefinition = Readonly<{
  name: string;
  description: string;
  content: string;
  provider: string;
  path?: string;
  resourceBase?: { kind: string; path: string };
  invocation: { modelInvocable: boolean };
  [key: string]: unknown;
}>;
