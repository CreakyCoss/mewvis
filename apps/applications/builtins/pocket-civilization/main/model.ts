import { actionOptions, createIsland, isActivity, isPlace, isResident, settleIsland, validateActionBatch, validateIsland, validateOutcome, type Activity, type IslandState, type Outcome, type PlaceId } from "./simulation";
import { advanceStories, createStories, nextPetitionKind, recordStoryChoice, validateStories, type Stories } from "./stories";
import { isFinalJudgment, validateDayDraft, type DayDraft } from "./day-draft";

export type ResidentId = "atuan" | "xiaoman" | "mayor" | "gardener";
export type Trigger = "truth" | "lie" | "help" | "praise";
export type Effect = "rain" | "flowers";
export type PlayMode = "story" | "intelligent";
export type ActionKind = "confess" | "repeat" | "misremember" | "help" | "praise" | "trade" | "share" | "decorate" | "clear" | "restock" | "discuss";
export type JudgmentStatus = "accepted" | "review_required" | "abstained";

export interface Law {
  id: string;
  text: string;
  trigger: Trigger;
  effect: Effect;
  since: number;
}
export interface Judgment {
  value: "触发法则" | "不触发法则" | "存在解释争议" | null;
  status: JudgmentStatus;
  reason: string;
  source: "story" | "plugin";
}
export interface Action {
  residentId: ResidentId;
  kind: ActionKind;
  text: string;
  speech: string;
  activity?: Activity;
  place?: PlaceId;
  targetId?: ResidentId;
}
export interface IslandEvent extends Action {
  id: string;
  day: number;
  time: string;
  lawId: string;
  effect: Effect | null;
  judgment: Judgment;
  outcome?: Outcome;
}
export type PetitionChoice = "once" | "always" | "harvest" | "orchard";
export interface Petition {
  id: string;
  kind: "repeat" | "road";
  lawId: string;
  day: number;
  title: string;
  text: string;
  options: { id: PetitionChoice; title: string; description: string }[];
  resolution?: PetitionChoice;
  resolvedDay?: number;
}
export interface DayPlan {
  baseRevision: number;
  day: number;
  law: Law;
  events: IslandEvent[];
  petition?: Petition;
  island: IslandState;
}
export interface World {
  format: "pocket-civilization-v3";
  revision: number;
  day: number;
  law: Law;
  pendingLaw: Law | null;
  mode: PlayMode;
  events: IslandEvent[];
  petitions: Petition[];
  interpretation: "once" | "always" | null;
  pendingInterpretation: "once" | "always" | null;
  modelId: string;
  updatedAt: number;
  island: IslandState;
  stories: Stories;
  dayDraft: DayDraft | null;
}

export const RESIDENTS: Record<ResidentId, {
  name: string; role: string; traits: string; goal: string;
  fact: string; x: number; y: number; color: string;
}> = {
  atuan: { name: "阿团", role: "面包店的小帮手", traits: "有点胆小，很在意朋友", goal: "想让大家原谅偷吃面包的自己", fact: "第7天偷吃了面包，知道面包是自己吃的。", x: 501, y: 590, color: "#637c9a" },
  xiaoman: { name: "小满", role: "诚实雨伞铺的店主", traits: "好奇、灵活，总能找到小商机", goal: "让小店在每一种天气里都能开下去", fact: "第7天开了雨伞铺，知道镇上有一座石桥。", x: 724, y: 601, color: "#ba8c50" },
  mayor: { name: "镇长", role: "努力维持秩序的人", traits: "有点爱面子，也愿意认真听人说话", goal: "让每个人都能好好走过小镇", fact: "有时会记错路线，并非每次说错话都在故意骗人。", x: 943, y: 401, color: "#939483" },
  gardener: { name: "青禾", role: "果园里的园丁", traits: "温和、细心，喜欢安静", goal: "照顾植物，也给小路留一点空隙", fact: "负责照顾镇上的果树，会帮助居民整理路边植物。", x: 1252, y: 420, color: "#72855d" },
};
export const RESIDENT_IDS = Object.keys(RESIDENTS) as ResidentId[];
export const TRIGGERS: Record<Trigger, string> = { truth: "说真话", lie: "明知不实仍故意说谎", help: "主动帮助别人", praise: "真诚地夸奖别人" };
export const EFFECTS: Record<Effect, string> = { rain: "头顶下起局部小雨", flowers: "脚边开出两簇小花" };
export const LAW_OPTIONS = ["真话开花", "谎言下雨", "善举开花", "夸奖开花", "真话下雨", "谎言开花", "善举下雨", "夸奖下雨", "尚不能明确实现"] as const;
const LAW_MEANINGS: Record<string, [Trigger, Effect]> = {
  真话开花: ["truth", "flowers"], 谎言下雨: ["lie", "rain"], 善举开花: ["help", "flowers"], 夸奖开花: ["praise", "flowers"],
  真话下雨: ["truth", "rain"], 谎言开花: ["lie", "flowers"], 善举下雨: ["help", "rain"], 夸奖下雨: ["praise", "rain"],
};

export const newId = () => crypto.randomUUID();
export function lawFromChoice(text: string, choice: string, day: number): Law {
  const meaning = Object.hasOwn(LAW_MEANINGS, choice) ? LAW_MEANINGS[choice] : undefined;
  if (!meaning) throw new Error("手册还无法明确实现这条法则。试着写清谁做了什么，以及下雨或开花的变化。 ");
  const value = text.trim();
  if (!value || value.length > 80) throw new Error("请用1到80个字写下一条法则。");
  return { id: newId(), text: value, trigger: meaning[0], effect: meaning[1], since: day };
}

/** Authored mode is deliberately bounded; it never pretends to be a model judgment. */
export function interpretStoryLaw(text: string, day: number): Law {
  const triggers = ([
    ["truth", /真话|诚实/], ["lie", /说谎|谎言|撒谎|骗人/],
    ["help", /帮忙|帮助|助人|善举/], ["praise", /夸奖|夸人|赞美/],
  ] as const).filter(([, pattern]) => pattern.test(text));
  const effects = ([ ["rain", /下雨|降雨/], ["flowers", /开花|长花|花朵/]] as const).filter(([, pattern]) => pattern.test(text));
  if (triggers.length !== 1 || effects.length !== 1 || /不再|不会|不能|不要|禁止|不许|除非|只有|除了|否则|只要不/.test(text))
    throw new Error("这句话还有点复杂。故事模式支持一个清楚的触发条件和一种变化，例如“说真话的人，身边会开花。”");
  return { id: newId(), text: text.trim(), trigger: triggers[0][0], effect: effects[0][0], since: day };
}

export function createWorld(): World {
  const law: Law = { id: "first-rain", text: "说谎的人，头顶会下雨。", trigger: "lie", effect: "rain", since: 1 };
  const world: World = {
    format: "pocket-civilization-v3", revision: 0, day: 7, law, pendingLaw: null, island: createIsland(), stories: createStories(), dayDraft: null,
    mode: "story", modelId: "", interpretation: null, pendingInterpretation: null,
    petitions: [], updatedAt: Date.now(),
    events: [
      { id: "first-rain-event", day: 7, time: "09:00", residentId: "atuan", kind: "confess", text: "阿团说自己没偷吃，头顶开始下雨。", speech: "我才没偷吃！", lawId: law.id, effect: "rain", judgment: { source: "story", status: "accepted", value: "触发法则", reason: "阿团知道面包是自己吃的，仍故意否认。这是手写的开场故事。" } },
      { id: "shop-open", day: 7, time: "10:15", residentId: "xiaoman", kind: "trade", text: "小满开了「诚实雨伞铺」。", speech: "来挑一把伞吧。", lawId: law.id, effect: null, judgment: { source: "story", status: "accepted", value: "不触发法则", reason: "开店本身不触发说谎下雨。这是手写的开场故事。" } },
      { id: "mayor-signs", day: 7, time: "12:00", residentId: "mayor", kind: "help", text: "镇长改用手势开会。", speech: "今天用手势开会。", lawId: law.id, effect: null, judgment: { source: "story", status: "accepted", value: "不触发法则", reason: "镇长选择少说几句，避免误会。这是手写的开场故事。" } },
    ],
  };
  for (const event of world.events) {
    world.island.residents[event.residentId].memories.push({ eventId: event.id, day: event.day, text: event.text });
  }
  return world;
}

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("小岛存档格式不完整。");
  return v as Record<string, unknown>;
};
const textValue = (v: unknown, max: number) => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error("小岛文字数据不完整。");
  return v;
};
function validateLaw(v: unknown): Law {
  const r = object(v);
  if (!Object.hasOwn(TRIGGERS, String(r.trigger)) || !Object.hasOwn(EFFECTS, String(r.effect)) || !Number.isInteger(r.since) || Number(r.since) < 1) throw new Error("法则存档无效。");
  return { id: textValue(r.id, 100), text: textValue(r.text, 80), trigger: r.trigger as Trigger, effect: r.effect as Effect, since: Number(r.since) };
}
export function validateAction(v: unknown): Action {
  const r = object(v);
  if (!RESIDENT_IDS.includes(r.residentId as ResidentId) || !["confess", "repeat", "misremember", "help", "praise", "trade", "share", "decorate", "clear", "restock", "discuss"].includes(String(r.kind))) throw new Error("导演提出了岛上还无法执行的行动。");
  if (r.activity !== undefined && !isActivity(r.activity) || r.place !== undefined && !isPlace(r.place) || r.targetId !== undefined && !isResident(r.targetId)) throw new Error("行动的地点、对象或做法还无法执行。");
  return { residentId: r.residentId as ResidentId, kind: r.kind as ActionKind, text: textValue(r.text, 120), speech: textValue(r.speech, 40), ...(r.activity ? { activity: r.activity as Activity } : {}), ...(r.place ? { place: r.place as PlaceId } : {}), ...(r.targetId ? { targetId: r.targetId as ResidentId } : {}) };
}
export function validateJudgment(v: unknown, source?: Judgment["source"]): Judgment {
  const r = object(v);
  if (!["accepted", "review_required", "abstained"].includes(String(r.status)) || !["story", "plugin"].includes(String(r.source))) throw new Error("判断结果状态无效。");
  if (r.status === "abstained" ? r.value !== null : !["触发法则", "不触发法则", "存在解释争议"].includes(String(r.value))) throw new Error("判断结果与状态不一致。");
  if (source && r.source !== source) throw new Error("判断结果来源不一致。");
  return { status: r.status as JudgmentStatus, value: r.value as Judgment["value"], reason: textValue(r.reason, 2400), source: r.source as Judgment["source"] };
}
export function validateWorld(v: unknown): World {
  const r = object(v);
  if (r.format !== "pocket-civilization-v3" || !Number.isInteger(r.day) || Number(r.day) < 1 || !Number.isInteger(r.revision) || Number(r.revision) < 0 || !["story", "intelligent"].includes(String(r.mode)) || !Array.isArray(r.events) || r.events.length > 200 || !Array.isArray(r.petitions) || r.petitions.length > 30) throw new Error("小岛存档无法读取，原存档已保留。");
  const law = validateLaw(r.law), pendingLaw = r.pendingLaw === null ? null : validateLaw(r.pendingLaw);
  if (law.since > Number(r.day) || (pendingLaw && pendingLaw.since !== Number(r.day) + 1)) throw new Error("法则生效日期与存档不符。");
  const events = r.events.map((v): IslandEvent => {
    const e = object(v), action = validateAction(e), judgment = validateJudgment(e.judgment);
    if (!Number.isInteger(e.day) || Number(e.day) > Number(r.day) || Number(e.day) < 1 || !/^\d{2}:\d{2}$/.test(String(e.time)) || (e.effect !== null && !Object.hasOwn(EFFECTS, String(e.effect)))) throw new Error("事件记录无效。");
    if (e.effect && (judgment.status !== "accepted" || judgment.value !== "触发法则")) throw new Error("事件效果没有可采纳的判断依据。");
    return { ...action, id: textValue(e.id, 100), day: Number(e.day), time: String(e.time), lawId: textValue(e.lawId, 100), effect: e.effect as Effect | null, judgment, ...(e.outcome !== undefined ? { outcome: validateOutcome(e.outcome) } : {}) };
  });
  if (new Set(events.map((e) => e.id)).size !== events.length) throw new Error("事件记录出现重复。");
  const petitions = r.petitions.map((v): Petition => {
    const p = object(v);
    if (!Number.isInteger(p.day) || Number(p.day) < 1 || Number(p.day) > Number(r.day) || !["repeat", "road"].includes(String(p.kind))) throw new Error("请愿记录无效。");
    const petition = makePetition(Number(p.day), textValue(p.lawId, 100), p.kind as Petition["kind"]);
    if (p.resolution !== undefined && (!petition.options.some((option) => option.id === p.resolution) || !Number.isInteger(p.resolvedDay) || Number(p.resolvedDay) < Number(p.day) || Number(p.resolvedDay) > Number(r.day))) throw new Error("请愿选择无效。");
    return { ...petition, id: textValue(p.id, 100), ...(p.resolution ? { resolution: p.resolution as PetitionChoice, resolvedDay: Number(p.resolvedDay) } : {}) };
  });
  const interpretation = (value: unknown) => value === null || value === "once" || value === "always" ? value : (() => { throw new Error("法则解释无效。"); })();
  const world: World = { format: "pocket-civilization-v3", revision: Number(r.revision), day: Number(r.day), law, pendingLaw, mode: r.mode as PlayMode, modelId: typeof r.modelId === "string" ? r.modelId : "", events, petitions, interpretation: interpretation(r.interpretation), pendingInterpretation: interpretation(r.pendingInterpretation), updatedAt: Number(r.updatedAt) || Date.now(), island: validateIsland(r.island, Number(r.day)), stories: validateStories(r.stories, Number(r.day)), dayDraft: null };
  world.dayDraft = validateDayDraft(r.dayDraft, world);
  return world;
}

export function scheduleLaw(world: World, law: Law): World {
  if (law.since !== world.day + 1) throw new Error("新法则只能从下一天生效。");
  return { ...world, pendingLaw: validateLaw(law), dayDraft: null, revision: world.revision + 1, updatedAt: Date.now() };
}
export function withdrawLaw(world: World): World {
  return { ...world, pendingLaw: null, dayDraft: null, revision: world.revision + 1, updatedAt: Date.now() };
}
export function effectiveInterpretation(world: World): World["interpretation"] {
  return world.pendingLaw ? null : world.pendingInterpretation ?? world.interpretation;
}
export function makePetition(day: number, lawId: string, kind: Petition["kind"] = "repeat"): Petition {
  if (kind === "road") return { id: `petition-road-${day}`, kind, lawId, day, title: "花从哪里来，小路留给谁？", text: "法则已经解释清楚，店里的生意和路边的花却还要继续照顾。青禾愿意帮忙收花，小满也愿意把试种挪到果园。她们想与你定下一个日常约定。", options: [
    { id: "harvest", title: "一起收花，把小路留出来", description: "居民优先清理路边的花，回收材料做鲜花伞。" },
    { id: "orchard", title: "把重复真话的试种移到果园", description: "小满到果园尝试种花，邻居继续收拢路边旧花。" },
  ] };
  return { id: `petition-repeat-${day}`, kind, lawId, day, title: "同一句真话，也能一直开花吗？", text: "小满想用反复说“镇上有一座桥”来种花。鲜花伞需要材料，青禾又想给小路留些空间。镇长听过双方的心事，大家想请你把法则说得更清楚一点。", options: [
    { id: "once", title: "重复的真话不再开花", description: "每位居民第一次说出这件事时，才会开花。" },
    { id: "always", title: "每一次真话都算", description: "保留这份自由，请大家一起整理花朵。" },
  ] };
}
export function resolvePetition(world: World, id: string, resolution: PetitionChoice): World {
  const petition = world.petitions.find((p) => p.id === id && !p.resolution);
  if (!petition) throw new Error("这封请愿已经处理过了。");
  if (world.pendingLaw || petition.lawId !== world.law.id) throw new Error("这封请愿属于之前的法则，不能用来解释即将生效的新法则。");
  if (!petition.options.some((option) => option.id === resolution)) throw new Error("这不是这封请愿提供的选择。");
  return { ...world, dayDraft: null, revision: world.revision + 1, updatedAt: Date.now(), stories: recordStoryChoice(world, petition, resolution), pendingInterpretation: petition.kind === "repeat" ? resolution as "once" | "always" : world.pendingInterpretation, petitions: world.petitions.map((p) => p.id === id ? { ...p, resolution, resolvedDay: world.day } : p) };
}
export function storyActions(world: World, law: Law): Action[] {
  const candidates = actionOptions({ ...world, pendingLaw: law.id !== world.law.id ? law : world.pendingLaw }).sort((a, b) => b.priority - a.priority);
  const selected: Action[] = [];
  for (const candidate of candidates) {
    if (selected.some((action) => action.residentId === candidate.residentId || action.activity === "clear-flowers" && candidate.activity === "clear-flowers" && action.place === candidate.place)) continue;
    selected.push(candidate);
    if (selected.length === 3) break;
  }
  return selected;
}
export function storyJudgment(action: Action, law: Law, world: World): Judgment {
  const repeated = action.activity === "bridge-fact" && law.trigger === "truth";
  const triggered = law.trigger === "truth" ? action.kind === "confess" || action.kind === "share" || repeated && world.interpretation !== "once"
    : law.trigger === "lie" ? action.activity === "deny-bread"
    : law.trigger === "help" ? action.kind === "help" || action.kind === "clear" : action.kind === "praise";
  return { source: "story", status: "accepted", value: triggered ? "触发法则" : "不触发法则", reason: `${triggered ? "这次行动符合" : "这次行动不符合"}“${TRIGGERS[law.trigger]}”的条件。这是故事模式按已写好的情节结算。${repeated && world.interpretation === "once" ? "你留下的解释限制了重复触发。" : ""}` };
}
export function makePlan(world: World, actions: Action[], judgments: Judgment[]): DayPlan {
  if (actions.length < 1 || actions.length > 3 || judgments.length !== actions.length) throw new Error("新一天的事件不完整。");
  const law = world.pendingLaw ?? world.law, day = world.day + 1;
  const canonical = validateActionBatch(world, actions.map(validateAction));
  const events = canonical.map((action, index): IslandEvent => {
    const judgment = validateJudgment(judgments[index]);
    if (!isFinalJudgment(judgment)) throw new Error("还有判断需要复核，这一天尚未推进。请稍后重试。");
    const effect = judgment.value === "触发法则" ? law.effect : null;
    return { ...validateAction(action), id: newId(), day, time: ["08:30", "09:10", "10:00"][index], lawId: law.id, effect, judgment, text: `${action.text}${effect ? EFFECTS[effect] + "。" : ""}` };
  });
  const settled = settleIsland(world.island, events);
  const kind = nextPetitionKind(world, settled.island, settled.events);
  return { baseRevision: world.revision, day, law, events: settled.events, island: settled.island, ...(kind ? { petition: makePetition(day, law.id, kind) } : {}) };
}
export function planStoryDay(world: World): DayPlan {
  const law = world.pendingLaw ?? world.law;
  const effective = { ...world, interpretation: effectiveInterpretation(world) };
  const actions = storyActions(effective, law);
  return makePlan(world, actions, actions.map((a) => storyJudgment(a, law, effective)));
}
export function applyPlan(world: World, plan: DayPlan): World {
  if (world.revision !== plan.baseRevision || world.day + 1 !== plan.day || (world.pendingLaw ?? world.law).id !== plan.law.id) throw new Error("小岛已经发生变化，这份旧的演绎结果没有被采用。");
  if (world.mode === "intelligent" && plan.events.some((e) => e.judgment.source !== "plugin")) throw new Error("智能模式没有收到实际插件判断。");
  const canonical = validateActionBatch(world, plan.events);
  for (const [index, event] of plan.events.entries()) {
    if (event.place !== canonical[index].place || event.activity !== canonical[index].activity || event.day !== plan.day || event.lawId !== plan.law.id || !isFinalJudgment(event.judgment) || event.effect !== (event.judgment.value === "触发法则" ? plan.law.effect : null)) throw new Error("这一天的行动与判断不一致。");
  }
  const settled = settleIsland(world.island, plan.events);
  return validateWorld({ ...world, dayDraft: null, stories: advanceStories(world, plan, settled.island), revision: world.revision + 1, day: plan.day, law: plan.law, pendingLaw: null, interpretation: world.law.id !== plan.law.id ? null : effectiveInterpretation(world), pendingInterpretation: null, events: [...world.events, ...settled.events].slice(-180), petitions: plan.petition ? [...world.petitions, plan.petition].slice(-30) : world.petitions, updatedAt: Date.now(), island: settled.island });
}
