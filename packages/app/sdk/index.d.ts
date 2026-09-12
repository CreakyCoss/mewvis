import type { RiskLevel } from "@isle/chat-contracts";
import type { ApplicationChatClient } from "./chat/index.js";
import type { ApplicationStorage, ApplicationWorkspaces } from "./data/index.js";

export { default as schema } from "@deepseek-ai/schemastery";

export type MaybePromise<T> = T | Promise<T>;

export type IsleDisposable = () => MaybePromise<void>;

export type IsleToolRisk = RiskLevel;

export type IsleToolDefinition = Readonly<{
  name: string;
  description: string;
  /** Maximum risk of this tool's operations; approval still follows the selected host permission mode. */
  risk: IsleToolRisk;
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

export interface IsleApplicationLogger {
  debug(message: string, ...values: unknown[]): void;
  info(message: string, ...values: unknown[]): void;
  warn(message: string, ...values: unknown[]): void;
  error(message: string, ...values: unknown[]): void;
}

/**
 * Stable Isle-owned view of the private Cordis context. New host services can
 * be added without requiring application authors to import Cordis or DSH packages.
 */
export interface IsleApplicationContext {
  /** Available in the Isle desktop application host when chat permission is declared. */
  readonly chat?: ApplicationChatClient;
  /** Requires a host implementing the data v1 contract and application-data permission. */
  readonly storage?: ApplicationStorage;
  /** Application-owned workspace membership; never the desktop workspace registry. */
  readonly workspaces?: ApplicationWorkspaces;
  readonly tools: IsleToolRegistry;
  readonly skills: IsleSkillRegistry;
  readonly settings: IsleSettingsRegistry;
  readonly logger: IsleApplicationLogger;
  on(event: "dispose", callback: () => MaybePromise<void>): unknown;
}

export interface IsleVersionedSettings<T extends object> {
  readonly namespace: string;
  readonly version: number;
  readonly schema: unknown;
  register(context: IsleApplicationContext): Promise<IsleSettingsSection<T>>;
}

export type IsleApplicationMetadata = Readonly<{
  name?: string;
  inject?: readonly string[] | Readonly<Record<string, unknown>>;
  provide?: string | readonly string[];
  Config?: unknown;
}>;

export type IsleApplicationFunction<TConfig = unknown> = ((
  context: IsleApplicationContext,
  config: TConfig,
) => unknown) &
  IsleApplicationMetadata;

export type IsleApplicationObject<TConfig = unknown> = Readonly<{
  apply(context: IsleApplicationContext, config: TConfig): unknown;
}> &
  IsleApplicationMetadata;

export type IsleApplication<TConfig = unknown> =
  IsleApplicationFunction<TConfig> | IsleApplicationObject<TConfig>;

export declare const defineApplication: <TConfig = unknown>(
  application: IsleApplication<TConfig>,
) => IsleApplication<TConfig>;

export declare const defineTool: <TTool extends IsleToolDefinition>(
  tool: TTool,
) => TTool;

export declare const defineSkill: <TSkill extends IsleSkillDefinition>(
  skill: TSkill,
) => TSkill;

export declare const defineSettings: <T extends object>(
  definition: IsleSettingsDefinition<T>,
) => IsleVersionedSettings<T>;
