export { default as schema } from "@deepseek-ai/schemastery";

export type MaybePromise<T> = T | Promise<T>;

export type IsleDisposable = () => MaybePromise<void>;

export type IsleToolDefinition = Readonly<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(arguments_: unknown): MaybePromise<unknown>;
  [key: string]: unknown;
}>;

export type IsleSkillDefinition = Readonly<{
  name: string;
  description: string;
  content: string;
  [key: string]: unknown;
}>;

export interface IsleToolRegistry {
  register(tool: IsleToolDefinition): IsleDisposable | unknown;
}

export interface IsleSkillRegistry {
  register(skill: IsleSkillDefinition): IsleDisposable | unknown;
}

export interface IsleSettingsSection<T extends object> {
  get(): Readonly<T>;
  update(patch: Partial<T>): Promise<void>;
  replace(value: T): Promise<void>;
  watch(
    callback: (next: Readonly<T>, previous: Readonly<T>) => MaybePromise<void>,
  ): IsleDisposable;
}

export interface IsleSettingsRegistry {
  register<T extends object>(
    namespace: string,
    schema: unknown,
    options?: IsleSettingsRegisterOptions<T>,
  ): IsleSettingsSection<T>;
  describe(): IsleSettingsDescriptor[];
}

export type IsleSettingsApplies = "live" | "restart";

export type IsleSettingsRegisterOptions<T extends object> = Readonly<{
  base?: Partial<T>;
  applies?: IsleSettingsApplies;
  validate?: (value: T) => void;
}>;

export type IsleSettingsDescriptor = Readonly<{
  ns: string;
  value: unknown;
  base?: unknown;
  user?: unknown;
  revision: number;
}>;

export type IsleSettingsMigration = (
  user: Record<string, unknown>,
) => MaybePromise<Record<string, unknown>>;

export type IsleSettingsDefinition<T extends object> = Readonly<{
  namespace: string;
  version: number;
  schema: unknown;
  defaults?: Partial<T>;
  applies?: IsleSettingsApplies;
  validate?: (value: Readonly<T>) => void;
  /** Migration N transforms the raw user layer from version N-1 to N. */
  migrations?: Readonly<Record<number, IsleSettingsMigration>>;
}>;

export interface IslePluginLogger {
  debug(message: string, ...values: unknown[]): void;
  info(message: string, ...values: unknown[]): void;
  warn(message: string, ...values: unknown[]): void;
  error(message: string, ...values: unknown[]): void;
}

/**
 * Stable Isle-owned view of the private Cordis context. New host services can
 * be added without requiring plugin authors to import Cordis or DSH packages.
 */
export interface IslePluginContext {
  /** Available in the Isle desktop plugin host when chat permission is declared. */
  readonly chat?: import("./chat/index.js").PluginChatClient;
  readonly tools: IsleToolRegistry;
  readonly skills: IsleSkillRegistry;
  readonly settings: IsleSettingsRegistry;
  readonly logger: IslePluginLogger;
  on(event: "dispose", callback: () => MaybePromise<void>): unknown;
}

export interface IsleVersionedSettings<T extends object> {
  readonly namespace: string;
  readonly version: number;
  readonly schema: unknown;
  register(context: IslePluginContext): Promise<IsleSettingsSection<T>>;
}

export type IslePluginMetadata = Readonly<{
  name?: string;
  inject?: readonly string[] | Readonly<Record<string, unknown>>;
  provide?: string | readonly string[];
  Config?: unknown;
}>;

export type IslePluginFunction<TConfig = unknown> = ((
  context: IslePluginContext,
  config: TConfig,
) => unknown) &
  IslePluginMetadata;

export type IslePluginObject<TConfig = unknown> = Readonly<{
  apply(context: IslePluginContext, config: TConfig): unknown;
}> &
  IslePluginMetadata;

export type IslePlugin<TConfig = unknown> =
  IslePluginFunction<TConfig> | IslePluginObject<TConfig>;

export declare const definePlugin: <TConfig = unknown>(
  plugin: IslePlugin<TConfig>,
) => IslePlugin<TConfig>;

export declare const defineTool: <TTool extends IsleToolDefinition>(
  tool: TTool,
) => TTool;

export declare const defineSkill: <TSkill extends IsleSkillDefinition>(
  skill: TSkill,
) => TSkill;

export declare const defineSettings: <T extends object>(
  definition: IsleSettingsDefinition<T>,
) => IsleVersionedSettings<T>;
