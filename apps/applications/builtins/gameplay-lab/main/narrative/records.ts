import type { SimulatorRef } from "../shared/contracts";
import { copy, uid } from "../shared/utils";
import { advanceStory, startStory, type StoryState } from "./engine";
import { narrativeSimulator, type NarrativeModel } from "./model";
import { identifier, object, validateNarrative } from "./validation";
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
