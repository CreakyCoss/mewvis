import type { Issue, SimulatorRef } from "../../shared/contracts";

export type ComponentRef = SimulatorRef;
export interface GameComposition {
  version: 1;
  skeleton: ComponentRef;
  layout: ComponentRef;
  modules: ComponentRef[];
}
export interface PresetSummary {
  id: string;
  version: number;
  name: string;
  description: string;
}
export interface SkeletonDefinition extends ComponentRef {
  name: string;
  capabilities: readonly string[];
  timings: readonly string[];
  commandTypes: readonly string[];
  stateKeys: readonly string[];
}
export interface LayoutDefinition extends ComponentRef {
  name: string;
  skeleton: ComponentRef;
  slots: readonly string[];
}
export interface ModuleDefinition extends ComponentRef {
  name: string;
  description: string;
  skeleton: ComponentRef;
  requires: readonly string[];
  dependsOn: readonly ComponentRef[];
  timings: readonly string[];
  slots: readonly string[];
}
export interface ModuleRuntime<M, S, C, E, V> {
  definition: ModuleDefinition;
  stateKey: string;
  commandTypes: readonly string[];
  createConfig(): unknown;
  validate(config: unknown, draft?: boolean): Issue[];
  /** Deterministic contribution to effective rules; the source design remains frozen. */
  projectRules?(context: { model: M; rules: M; config: unknown }): M;
  initialize(context: { model: M; state: S; config: unknown }): unknown;
  observe(context: {
    model: M;
    state: S;
    config: unknown;
    value: unknown;
    player: number;
  }): unknown;
  commands(context: {
    model: M;
    view: V;
    config: unknown;
    value: unknown;
  }): C[];
  advance(context: {
    model: M;
    state: S;
    config: unknown;
    value: unknown;
    command: C;
  }): { state: S; value: unknown; events: E[] };
  choose?(context: {
    model: M;
    view: V;
    config: unknown;
    value: unknown;
    commands: C[];
  }): C | undefined;
  describeCommand?(command: C): string;
}
export interface ResolvedComposition<M, S, C, E, V> {
  issues: Issue[];
  snapshot: GameComposition;
  modules: readonly ModuleRuntime<M, S, C, E, V>[];
}
