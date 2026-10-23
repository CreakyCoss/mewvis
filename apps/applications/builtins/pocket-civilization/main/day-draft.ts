import { validateAction, validateJudgment, type Action, type Judgment, type World } from "./model";
import { validateActionBatch } from "./simulation";

export interface DayDraft {
  id: string; day: number; originRevision: number; lawId: string; modelId: string;
  actions: Action[]; judgments: (Judgment | null)[];
  attempts: { actionIndex: number; judgment: Judgment }[];
  note: string; failure: string | null;
}
export const isFinalJudgment = (judgment: Judgment | null): judgment is Judgment => judgment?.status === "accepted" && (judgment.value === "触发法则" || judgment.value === "不触发法则");
export class DayReviewRequired extends Error {
  constructor() { super("这件事还没有明确结论，演绎草稿已保存。复核后可以从这里继续，今天尚未改变。"); }
}
export function validateDayDraft(value: unknown, world: World): DayDraft | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("演绎草稿不完整。");
  const input = value as DayDraft;
  if (world.mode !== "intelligent" || typeof input.id !== "string" || !input.id || input.id.length > 100 || input.day !== world.day + 1 || input.lawId !== (world.pendingLaw ?? world.law).id || input.modelId !== world.modelId || !Number.isSafeInteger(input.originRevision) || input.originRevision < 0 || input.originRevision > world.revision || !Array.isArray(input.actions) || input.actions.length !== 3 || !Array.isArray(input.judgments) || input.judgments.length !== 3 || !Array.isArray(input.attempts) || input.attempts.length > 12 || typeof input.note !== "string" || input.note.length > 300 || input.failure !== null && (typeof input.failure !== "string" || input.failure.length > 500)) throw new Error("演绎草稿与当前小岛不符，请放弃这份草稿后重新安排。");
  const actions = validateActionBatch(world, input.actions.map(validateAction)).map(validateAction);
  const judgments = input.judgments.map((judgment) => judgment === null ? null : validateJudgment(judgment, "plugin"));
  // Only a completed prefix can be followed by the one disputed or unfinished action.
  const unfinished = judgments.findIndex((judgment) => !isFinalJudgment(judgment));
  if (unfinished >= 0 && judgments.slice(unfinished + 1).some((judgment) => judgment !== null)) throw new Error("草稿中的判断顺序不完整。");
  const attempts = input.attempts.map((attempt) => {
    if (!attempt || !Number.isInteger(attempt.actionIndex) || attempt.actionIndex < 0 || attempt.actionIndex > 2) throw new Error("复核记录无效。");
    return { actionIndex: attempt.actionIndex, judgment: validateJudgment(attempt.judgment, "plugin") };
  });
  return { id: input.id, day: input.day, originRevision: input.originRevision, lawId: input.lawId, modelId: input.modelId, actions, judgments, attempts, note: input.note, failure: input.failure };
}
export function saveDayDraft(world: World, draft: DayDraft | null): World {
  return { ...world, revision: world.revision + 1, updatedAt: Date.now(), dayDraft: validateDayDraft(draft, world) };
}
