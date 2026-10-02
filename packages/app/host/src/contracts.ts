import type { MewvisToolRisk } from "@mewvis/app-sdk";

export type ApplicationRuntimeKind = "mewvis" | "dsh";

export type RuntimeApplication = Readonly<{
  kind: ApplicationRuntimeKind;
  id: string;
  entry: string;
  packageRoot: string;
  patchPath?: string | null;
  config?: Record<string, unknown> | null;
}>;

export interface ApplicationAdapter {
  readonly kind: ApplicationRuntimeKind;
  load(application: RuntimeApplication): Promise<void>;
}

export type ApplicationToolSchema = Readonly<{
  name: string;
  description: string;
  risk?: MewvisToolRisk;
  parameters: unknown;
}>;

export type ApplicationToolCall = Readonly<{
  callId: string;
  name: string;
  arguments: unknown;
  signal?: AbortSignal;
}>;

export type ApplicationToolResult = Readonly<{
  isError: boolean;
  error: { message: string };
  value: unknown;
  content: readonly unknown[];
  meta?: unknown;
  additionalContexts?: unknown;
  concludesTurn?: boolean;
}>;

export type ApplicationSkillViewOptions = Readonly<{
  cwd?: string;
}>;

export type ApplicationSkillSummary = Readonly<{
  name: string;
  [key: string]: unknown;
}>;

export type ApplicationSkillDefinition = Readonly<{
  name: string;
  description: string;
  content: string;
  provider: string;
  path?: string;
  resourceBase?: { kind: string; path: string };
  invocation: { modelInvocable: boolean };
  [key: string]: unknown;
}>;
