import type { Issue } from "../../shared/contracts";
import type {
  ComponentRef,
  GameComposition,
  LayoutDefinition,
  ModuleRuntime,
  ResolvedComposition,
  SkeletonDefinition,
} from "./contracts";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const ref = (value: unknown): value is ComponentRef =>
  object(value) &&
  typeof value.id === "string" &&
  /^[\w-]{1,100}$/.test(value.id) &&
  Number.isInteger(value.version) &&
  Number(value.version) > 0 &&
  Object.keys(value).every((k) => ["id", "version"].includes(k));
export const sameRef = (a: ComponentRef, b: ComponentRef) =>
  a.id === b.id && a.version === b.version;
export const componentRef = ({ id, version }: ComponentRef): ComponentRef => ({
  id,
  version,
});
export function sameJson(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : object(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export function resolveGameComposition<M, S, C, E, V>(
  input: unknown,
  configs: unknown,
  skeleton: SkeletonDefinition,
  layout: LayoutDefinition,
  registry: readonly ModuleRuntime<M, S, C, E, V>[],
  draft = false,
): ResolvedComposition<M, S, C, E, V> {
  const issues: Issue[] = [],
    add = (message: string) => issues.push({ path: "玩法组合", message });
  const snapshot: GameComposition = {
    version: 1,
    skeleton: componentRef(skeleton),
    layout: componentRef(layout),
    modules: [],
  };
  const fail = () => ({ issues, snapshot, modules: [] });
  if (!object(configs)) {
    add("模块配置必须是对象，无法忽略未知扩展。");
    return fail();
  }
  const byId = new Map(
    registry.map((module) => [module.definition.id, module]),
  );
  if (byId.size !== registry.length) add("模块登记标识重复。");
  for (const [id, config] of Object.entries(configs)) {
    const module = byId.get(id);
    if (!module) add("无法忽略未知扩展：" + id);
    else issues.push(...module.validate(config, draft));
  }
  // Old snapshots are interpreted in memory; loading never rewrites a project.
  const inferred: GameComposition = {
    ...snapshot,
    modules: registry
      .filter((module) => {
        const config = configs[module.definition.id];
        return object(config) && config.enabled === true;
      })
      .map((module) => componentRef(module.definition)),
  };
  const value = input === undefined ? inferred : input;
  if (
    !object(value) ||
    value.version !== 1 ||
    !ref(value.skeleton) ||
    !ref(value.layout) ||
    !Array.isArray(value.modules) ||
    value.modules.length > 16 ||
    !value.modules.every(ref) ||
    Object.keys(value).some(
      (k) => !["version", "skeleton", "layout", "modules"].includes(k),
    )
  ) {
    add("组合结构或版本不受支持。");
    return fail();
  }
  if (!sameRef(value.skeleton, skeleton)) add("玩法骨架或版本不受支持。");
  if (!sameRef(value.layout, layout) || !sameRef(layout.skeleton, skeleton))
    add("布局或版本与玩法骨架不兼容。");
  const selected = value.modules as ComponentRef[],
    ids = new Set<string>();
  for (const selectedModule of selected) {
    if (ids.has(selectedModule.id)) add("模块不能重复：" + selectedModule.id);
    ids.add(selectedModule.id);
    const module = byId.get(selectedModule.id);
    if (!module || !sameRef(selectedModule, module.definition)) {
      add("模块或版本不受支持：" + selectedModule.id);
      continue;
    }
    const definition = module.definition,
      config = configs[definition.id];
    if (
      !object(config) ||
      config.enabled !== true ||
      config.version !== definition.version
    )
      add("模块选择与配置开关或版本不一致：" + definition.name);
    if (definition.skeleton && !sameRef(definition.skeleton, skeleton))
      add("模块不支持当前骨架：" + definition.name);
    if (
      definition.requires.some(
        (capability) => !skeleton.capabilities.includes(capability),
      )
    )
      add("骨架缺少模块需要的能力：" + definition.name);
    if (definition.timings.some((timing) => !skeleton.timings.includes(timing)))
      add("骨架不支持模块的触发时机：" + definition.name);
    if (definition.slots.some((slot) => !layout.slots.includes(slot)))
      add("布局缺少模块需要的区域：" + definition.name);
    for (const dependency of definition.dependsOn)
      if (!selected.some((r) => sameRef(r, dependency)))
        add("模块缺少兼容依赖：" + dependency.id);
  }
  for (const [id, config] of Object.entries(configs))
    if (object(config) && config.enabled === true && !ids.has(id))
      add("已启用的模块未纳入组合：" + id);
  const ordered: ModuleRuntime<M, S, C, E, V>[] = [],
    visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      add("模块依赖形成循环：" + id);
      return;
    }
    const module = byId.get(id);
    if (!module) return;
    visiting.add(id);
    for (const dep of module.definition.dependsOn)
      if (ids.has(dep.id)) visit(dep.id);
    visiting.delete(id);
    visited.add(id);
    ordered.push(module);
  }
  selected.forEach((r) => visit(r.id));
  const commandTypes = new Set(skeleton.commandTypes),
    stateKeys = new Set(skeleton.stateKeys);
  for (const module of ordered) {
    if (["__proto__", "prototype", "constructor"].includes(module.stateKey))
      add("模块状态区域名称无效：" + module.stateKey);
    if (stateKeys.has(module.stateKey))
      add("模块状态区域冲突：" + module.stateKey);
    stateKeys.add(module.stateKey);
    for (const type of module.commandTypes) {
      if (commandTypes.has(type)) add("模块命令冲突：" + type);
      commandTypes.add(type);
    }
  }
  if (issues.length) return fail();
  return {
    issues,
    snapshot: {
      version: 1,
      skeleton: componentRef(skeleton),
      layout: componentRef(layout),
      modules: ordered.map((module) => componentRef(module.definition)),
    },
    modules: ordered,
  };
}
