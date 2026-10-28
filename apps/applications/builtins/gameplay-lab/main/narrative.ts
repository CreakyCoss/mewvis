import { copy, uid, type Issue } from "./model";
import type { SimulatorRef } from "./simulators";
export type StoryValue = boolean | number | string;
export interface StoryVariable {
  id: string;
  name: string;
  type: "boolean" | "number" | "text";
  initial: StoryValue;
}
export interface StoryCondition {
  variable: string;
  op: "eq" | "neq" | "gte" | "lte";
  value: StoryValue;
}
export interface StoryEffect {
  variable: string;
  operation: "set" | "add";
  value: StoryValue;
}
export interface StoryChoice {
  id: string;
  label: string;
  target: string;
  conditions: StoryCondition[];
  effects: StoryEffect[];
}
export interface StoryNode {
  id: string;
  title: string;
  text: string;
  speaker: string;
  ending: boolean;
  choices: StoryChoice[];
}
export interface NarrativeModel {
  format: "gameplay-narrative-v1";
  id: string;
  name: string;
  description: string;
  characters: { id: string; name: string; description: string }[];
  variables: StoryVariable[];
  nodes: StoryNode[];
  startNode: string;
}
export const narrativeSimulator: SimulatorRef = {
  id: "branching-narrative",
  version: 1,
};
export function blankNarrative(name: string): NarrativeModel {
  return {
    format: "gameplay-narrative-v1",
    id: uid("story"),
    name,
    description: "",
    characters: [],
    variables: [],
    nodes: [],
    startNode: "",
  };
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 300): v is string =>
  typeof v === "string" && v.length <= max;
const identifier = (v: unknown): v is string =>
  text(v) &&
  /^[a-zA-Z0-9_-]{1,100}$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
const number = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && Math.abs(v) <= 1_000_000;
const storyValue = (value: unknown): value is StoryValue =>
  typeof value === "boolean" || number(value) || text(value, 1000);
export const valueMatches = (
  type: StoryVariable["type"],
  v: unknown,
): v is StoryValue =>
  type === "boolean"
    ? typeof v === "boolean"
    : type === "number"
      ? number(v)
      : text(v, 1000);
export function validateNarrative(input: unknown, draft = false): Issue[] {
  const errors: Issue[] = [];
  const add = (path: string, message: string) => errors.push({ path, message });
  if (
    !object(input) ||
    input.format !== "gameplay-narrative-v1" ||
    !identifier(input.id) ||
    !text(input.name) ||
    !text(input.description, 2000)
  )
    return [{ path: "策划", message: "文字冒险文件格式不完整。" }];
  for (const key of ["characters", "variables", "nodes"])
    if (!Array.isArray(input[key]) || input[key].length > 80)
      add(key, "列表最多包含 80 项。");
  if (errors.length) return errors;
  const m = input as unknown as NarrativeModel,
    ids = new Set<string>();
  for (const [key, items] of [
    ["characters", m.characters],
    ["variables", m.variables],
    ["nodes", m.nodes],
  ] as const)
    for (const item of items) {
      if (!object(item) || !identifier(item.id) || ids.has(item.id)) {
        add(key, "定义的标识无效或重复。");
        continue;
      }
      ids.add(item.id);
    }
  if (errors.length) return errors;
  for (const c of m.characters)
    if (
      !text(c.name) ||
      !text(c.description, 2000) ||
      (!draft && !c.name.trim())
    )
      add(c.id, "请填写人物名称及有效说明。");
  for (const v of m.variables)
    if (
      !text(v.name) ||
      !["boolean", "number", "text"].includes(v.type) ||
      !valueMatches(v.type, v.initial) ||
      (!draft && !v.name.trim())
    )
      add(v.id, "变量名称、类型或初始值无效。");
  if (typeof m.startNode !== "string") add("起始剧情", "起始剧情标识无效。");
  const variables = new Map(m.variables.map((v) => [v.id, v]));
  const choices = new Set<string>();
  for (const node of m.nodes) {
    if (
      !text(node.title) ||
      !text(node.text, 8000) ||
      typeof node.speaker !== "string" ||
      typeof node.ending !== "boolean" ||
      !Array.isArray(node.choices) ||
      node.choices.length > 20
    ) {
      add(node.id, "剧情内容不完整或选项超过 20 个。");
      continue;
    }
    if (!draft && (!node.title.trim() || !node.text.trim()))
      add(node.id, "请填写剧情标题和正文。");
    if (
      !draft &&
      node.speaker &&
      !m.characters.some((c) => c.id === node.speaker)
    )
      add(node.id, "发言人物不存在。");
    if (!draft && node.ending && node.choices.length)
      add(node.id, "结局节点不能继续提供选项，请移除选项或取消结局标记。");
    if (!draft && !node.ending && !node.choices.length)
      add(node.id, "非结局剧情至少需要一个选项。");
    for (const c of node.choices) {
      if (
        !object(c) ||
        !identifier(c.id) ||
        choices.has(c.id) ||
        !text(c.label) ||
        typeof c.target !== "string" ||
        !Array.isArray(c.conditions) ||
        !Array.isArray(c.effects) ||
        c.conditions.length > 20 ||
        c.effects.length > 20
      ) {
        add(node.id, "选项格式无效，条件和后果各最多 20 项。");
        continue;
      }
      choices.add(c.id);
      if (
        !draft &&
        (!c.label.trim() || !m.nodes.some((n) => n.id === c.target))
      )
        add(node.id, "选项需要文字及有效的目标剧情。");
      for (const condition of c.conditions) {
        if (
          !object(condition) ||
          typeof condition.variable !== "string" ||
          !["eq", "neq", "gte", "lte"].includes(condition.op) ||
          !storyValue(condition.value)
        ) {
          add(node.id, "选项条件格式无效。");
          continue;
        }
        const v = variables.get(condition.variable);
        if (
          (!v && !draft) ||
          (v &&
            (!valueMatches(v.type, condition.value) ||
              (["gte", "lte"].includes(condition.op) && v.type !== "number")))
        )
          add(node.id, "条件需要有效变量及与类型匹配的比较值。");
      }
      for (const effect of c.effects) {
        if (
          !object(effect) ||
          typeof effect.variable !== "string" ||
          !["set", "add"].includes(effect.operation) ||
          !storyValue(effect.value)
        ) {
          add(node.id, "选项后果格式无效。");
          continue;
        }
        const v = variables.get(effect.variable);
        if (
          (!v && !draft) ||
          (v &&
            (!valueMatches(v.type, effect.value) ||
              (effect.operation === "add" && v.type !== "number")))
        )
          add(node.id, "后果需要有效变量及匹配的值，只有数字变量可加减。");
      }
    }
  }
  if (!draft) {
    if (!m.name.trim()) add("策划", "请填写项目名称。");
    if (!m.nodes.length) add("剧情", "添加起始剧情和结局。");
    if (!m.nodes.some((n) => n.id === m.startNode))
      add("起始剧情", "请选择有效的起始剧情。");
    if (!m.nodes.some((n) => n.ending))
      add("结局", "至少将一个剧情节点标记为结局。");
  }
  return errors;
}
export function narrativeAnalysis(m: NarrativeModel) {
  const reachable = new Set<string>(),
    pending = [m.startNode];
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    const n = m.nodes.find((n) => n.id === id);
    if (!n) continue;
    reachable.add(id);
    if (!n.ending) pending.push(...n.choices.map((c) => c.target));
  }
  return {
    reachable: reachable.size,
    unreachable: m.nodes.filter((n) => !reachable.has(n.id)),
    endings: m.nodes.filter((n) => n.ending && reachable.has(n.id)).length,
  };
}
export interface StoryState {
  node: string;
  values: Record<string, StoryValue>;
  steps: number;
  outcome: "playing" | "ending" | "blocked" | "budget";
  events: { choice: string; from: string; to: string; changes: string[] }[];
}
export function conditionPass(
  c: StoryCondition,
  values: Record<string, StoryValue>,
) {
  const a = values[c.variable],
    b = c.value;
  if (c.op === "eq") return a === b;
  if (c.op === "neq") return a !== b;
  return (
    typeof a === "number" &&
    typeof b === "number" &&
    (c.op === "gte" ? a >= b : a <= b)
  );
}
export const availableChoices = (m: NarrativeModel, s: StoryState) =>
  m.nodes
    .find((n) => n.id === s.node)
    ?.choices.filter((c) =>
      c.conditions.every((x) => conditionPass(x, s.values)),
    ) ?? [];
function settle(m: NarrativeModel, s: StoryState): StoryState {
  s.outcome = m.nodes.find((n) => n.id === s.node)?.ending
    ? "ending"
    : s.steps >= 200
      ? "budget"
      : availableChoices(m, s).length
        ? "playing"
        : "blocked";
  return s;
}
export function startStory(m: NarrativeModel): StoryState {
  const errors = validateNarrative(m);
  if (errors.length) throw new Error(errors.map((e) => e.message).join(" "));
  return settle(m, {
    node: m.startNode,
    values: Object.fromEntries(m.variables.map((v) => [v.id, copy(v.initial)])),
    steps: 0,
    outcome: "playing",
    events: [],
  });
}
export function advanceStory(
  m: NarrativeModel,
  state: StoryState,
  choiceId: string,
): StoryState {
  if (state.outcome !== "playing")
    throw new Error("当前剧情已经结束或无法继续。");
  const choice = availableChoices(m, state).find((c) => c.id === choiceId);
  if (!choice) throw new Error("选项不存在或条件不满足。");
  const next = copy(state),
    changes: string[] = [];
  for (const e of choice.effects) {
    const v = m.variables.find((v) => v.id === e.variable)!;
    const before = next.values[e.variable];
    const after =
      e.operation === "add" ? Number(before) + Number(e.value) : e.value;
    if (!valueMatches(v.type, after))
      throw new Error("选项后果导致变量越界，未提交本次选择。");
    next.values[e.variable] = after;
    changes.push(`${v.name}：${String(before)} → ${String(after)}`);
  }
  next.node = choice.target;
  next.steps++;
  next.events.push({
    choice: choice.id,
    from: state.node,
    to: next.node,
    changes,
  });
  return settle(m, next);
}
export interface StoryRecord {
  format: "gameplay-story-run-v1";
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  simulator: SimulatorRef;
  model: NarrativeModel;
  decisions: string[];
  final: StoryState;
}
export function newStoryRecord(
  projectId: string,
  model: NarrativeModel,
): StoryRecord {
  const now = new Date().toISOString();
  return {
    format: "gameplay-story-run-v1",
    id: uid("story-run"),
    projectId,
    createdAt: now,
    updatedAt: now,
    simulator: copy(narrativeSimulator),
    model: copy(model),
    decisions: [],
    final: startStory(model),
  };
}
export function storyState(
  record: StoryRecord,
  count = record.decisions.length,
) {
  let s = startStory(record.model);
  for (const id of record.decisions.slice(0, count))
    s = advanceStory(record.model, s, id);
  return s;
}
export function chooseStory(record: StoryRecord, id: string): StoryRecord {
  const next = copy(record);
  next.final = advanceStory(next.model, next.final, id);
  next.decisions.push(id);
  next.updatedAt = new Date().toISOString();
  return next;
}
export function parseStoryRecord(
  input: unknown,
  projectId: string,
): StoryRecord {
  if (
    !object(input) ||
    input.format !== "gameplay-story-run-v1" ||
    !identifier(input.id) ||
    input.projectId !== projectId ||
    typeof input.createdAt !== "string" ||
    typeof input.updatedAt !== "string" ||
    !object(input.simulator) ||
    input.simulator.id !== narrativeSimulator.id ||
    input.simulator.version !== 1 ||
    !Array.isArray(input.decisions) ||
    input.decisions.length > 200 ||
    !input.decisions.every(identifier) ||
    validateNarrative(input.model).length
  )
    throw new Error("剧情记录无效或模拟器版本不支持，原文件已保留。");
  const record = input as unknown as StoryRecord;
  if (JSON.stringify(storyState(record)) !== JSON.stringify(record.final))
    throw new Error("剧情记录与冻结规则重算结果不一致。");
  return copy(record);
}
