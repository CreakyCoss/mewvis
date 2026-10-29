import { createElement, type ComponentType } from "react";
import type { ResolvedComposition } from "./contracts";

export interface ModuleEditorProps<M> {
  model: M;
  update(change: (model: M) => void): void;
}
export interface ModulePlayProps<M, C, V> {
  model: M;
  view: V;
  busy: boolean;
  readOnly: boolean;
  execute(command: C): void;
  seat?: number;
  selected?: string[];
  actionId?: string;
}
export interface ModulePresentation<M, C, V> {
  id: string;
  Editor: ComponentType<ModuleEditorProps<M>>;
  slots: Record<string, ComponentType<ModulePlayProps<M, C, V>>>;
}

export function assembledModuleEditors<M, S, C, E, V>(
  composition: ResolvedComposition<M, S, C, E, V>,
  presentations: readonly ModulePresentation<M, C, V>[],
) {
  return composition.modules.map((module) => {
    const presentation = presentations.find(
      (item) => item.id === module.definition.id,
    );
    if (
      !presentation ||
      module.definition.slots.some((slot) => !presentation.slots[slot])
    )
      throw new Error("模块缺少配套编辑或游玩组件：" + module.definition.name);
    return {
      id: module.definition.id,
      name: module.definition.name,
      Editor: presentation.Editor,
    };
  });
}
export function renderModuleSlot<M, S, C, E, V>(
  composition: ResolvedComposition<M, S, C, E, V>,
  presentations: readonly ModulePresentation<M, C, V>[],
  slot: string,
  props: ModulePlayProps<M, C, V>,
) {
  return composition.modules
    .filter((module) => module.definition.slots.includes(slot))
    .map((module) => {
      const Component = presentations.find(
        (item) => item.id === module.definition.id,
      )?.slots[slot];
      if (!Component)
        throw new Error("模块缺少游玩区域：" + module.definition.name);
      return createElement(Component, { ...props, key: module.definition.id });
    });
}
