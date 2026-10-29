import { copy } from "../shared/utils";
import type { NarrativeModel, StoryCondition, StoryValue } from "./model";
import { validateNarrative, valueMatches } from "./validation";
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
