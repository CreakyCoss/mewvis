import type { RiskLevel } from "@mewvis/chat-contracts";
import type { ApplicationChatClient } from "./chat/index.js";
import type { ApplicationStorage, ApplicationWorkspaces } from "./data/index.js";

export { default as schema } from "@deepseek-ai/schemastery";

export type MaybePromise<T> = T | Promise<T>;

export type MewvisDisposable = () => MaybePromise<void>;

export type MewvisToolRisk = RiskLevel;

export type MewvisToolDefinition = Readonly<{
  name: string;
  description: string;
  /** Maximum risk of this tool's operations; approval still follows the selected host permission mode. */
  risk: MewvisToolRisk;
  parameters: Record<string, unknown>;
  execute(arguments_: unknown): MaybePromise<unknown>;
  [key: string]: unknown;
}>;

export type MewvisSkillDefinition = Readonly<{
  name: string;
  description: string;
  content: string;
  [key: string]: unknown;
}>;

export interface MewvisToolRegistry {
  register(tool: MewvisToolDefinition): MewvisDisposable | unknown;
}

export interface MewvisSkillRegistry {
  register(skill: MewvisSkillDefinition): MewvisDisposable | unknown;
}

export interface MewvisSettingsSection<T extends object> {
  get(): Readonly<T>;
  update(patch: Partial<T>): Promise<void>;
  replace(value: T): Promise<void>;
  watch(
    callback: (next: Readonly<T>, previous: Readonly<T>) => MaybePromise<void>,
  ): MewvisDisposable;
}

export interface MewvisSettingsRegistry {
  register<T extends object>(
    namespace: string,
    schema: unknown,
    options?: MewvisSettingsRegisterOptions<T>,
  ): MewvisSettingsSection<T>;
  describe(): MewvisSettingsDescriptor[];
}

export type MewvisSettingsApplies = "live" | "restart";

export type MewvisSettingsRegisterOptions<T extends object> = Readonly<{
  base?: Partial<T>;
  applies?: MewvisSettingsApplies;
  validate?: (value: T) => void;
}>;

export type MewvisSettingsDescriptor = Readonly<{
  ns: string;
  value: unknown;
  base?: unknown;
  user?: unknown;
  revision: number;
}>;

export type MewvisSettingsMigration = (
  user: Record<string, unknown>,
) => MaybePromise<Record<string, unknown>>;

export type MewvisSettingsDefinition<T extends object> = Readonly<{
  namespace: string;
  version: number;
  schema: unknown;
  defaults?: Partial<T>;
  applies?: MewvisSettingsApplies;
  validate?: (value: Readonly<T>) => void;
  /** Migration N transforms the raw user layer from version N-1 to N. */
  migrations?: Readonly<Record<number, MewvisSettingsMigration>>;
}>;

export interface MewvisApplicationLogger {
  debug(message: string, ...values: unknown[]): void;
  info(message: string, ...values: unknown[]): void;
  warn(message: string, ...values: unknown[]): void;
  error(message: string, ...values: unknown[]): void;
}

/**
 * Stable Mewvis-owned view of the private Cordis context. New host services can
 * be added without requiring application authors to import Cordis or DSH packages.
 */
export interface MewvisApplicationContext {
  /** Available in the Mewvis desktop application host when chat permission is declared. */
  readonly chat?: ApplicationChatClient;
  /** Requires a host implementing the data v1 contract and application-data permission. */
  readonly storage?: ApplicationStorage;
  /** Application-owned workspace membership; never the desktop workspace registry. */
  readonly workspaces?: ApplicationWorkspaces;
  readonly tools: MewvisToolRegistry;
  readonly skills: MewvisSkillRegistry;
  readonly settings: MewvisSettingsRegistry;
  readonly logger: MewvisApplicationLogger;
  on(event: "dispose", callback: () => MaybePromise<void>): unknown;
}

export interface MewvisVersionedSettings<T extends object> {
  readonly namespace: string;
  readonly version: number;
  readonly schema: unknown;
  register(context: MewvisApplicationContext): Promise<MewvisSettingsSection<T>>;
}

export type MewvisApplicationMetadata = Readonly<{
  name?: string;
  inject?: readonly string[] | Readonly<Record<string, unknown>>;
  provide?: string | readonly string[];
  Config?: unknown;
}>;

export type MewvisApplicationFunction<TConfig = unknown> = ((
  context: MewvisApplicationContext,
  config: TConfig,
) => unknown) &
  MewvisApplicationMetadata;

export type MewvisApplicationObject<TConfig = unknown> = Readonly<{
  apply(context: MewvisApplicationContext, config: TConfig): unknown;
}> &
  MewvisApplicationMetadata;

export type MewvisApplication<TConfig = unknown> =
  MewvisApplicationFunction<TConfig> | MewvisApplicationObject<TConfig>;

export declare const defineApplication: <TConfig = unknown>(
  application: MewvisApplication<TConfig>,
) => MewvisApplication<TConfig>;

export declare const defineTool: <TTool extends MewvisToolDefinition>(
  tool: TTool,
) => TTool;

export declare const defineSkill: <TSkill extends MewvisSkillDefinition>(
  skill: TSkill,
) => TSkill;

export declare const defineSettings: <T extends object>(
  definition: MewvisSettingsDefinition<T>,
) => MewvisVersionedSettings<T>;
