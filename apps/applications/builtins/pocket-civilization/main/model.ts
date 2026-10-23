export type ResidentId = "atuan" | "xiaoman" | "mayor" | "gardener";
export type Trigger = "truth" | "lie" | "help" | "praise";
export type Effect = "rain" | "flowers";
export type PlayMode = "story" | "intelligent";
export type ActionKind = "confess" | "repeat" | "misremember" | "help" | "praise" | "trade";
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
}
export interface IslandEvent extends Action {
  id: string;
  day: number;
  time: string;
  lawId: string;
  effect: Effect | null;
  judgment: Judgment;
}
export interface Petition {
  id: string;
  lawId: string;
  day: number;
  title: string;
  text: string;
  options: { id: "once" | "always"; title: string; description: string }[];
  resolution?: "once" | "always";
  resolvedDay?: number;
}
export interface DayPlan {
  baseRevision: number;
  day: number;
  law: Law;
  events: IslandEvent[];
  petition?: Petition;
}
export interface World {
  format: "pocket-civilization-v1";
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
export const EFFECTS: Record<Effect, string> = { rain: "头顶下起局部小雨", flowers: "脚边开出一小簇花" };
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
  return {
    format: "pocket-civilization-v1", revision: 0, day: 7, law, pendingLaw: null,
    mode: "story", modelId: "", interpretation: null, pendingInterpretation: null,
    petitions: [], updatedAt: Date.now(),
    events: [
      { id: "first-rain-event", day: 7, time: "09:00", residentId: "atuan", kind: "confess", text: "阿团说自己没偷吃，头顶开始下雨。", speech: "我才没偷吃！", lawId: law.id, effect: "rain", judgment: { source: "story", status: "accepted", value: "触发法则", reason: "阿团知道面包是自己吃的，仍故意否认。这是手写的开场故事。" } },
      { id: "shop-open", day: 7, time: "10:15", residentId: "xiaoman", kind: "trade", text: "小满开了「诚实雨伞铺」。", speech: "来挑一把伞吧。", lawId: law.id, effect: null, judgment: { source: "story", status: "accepted", value: "不触发法则", reason: "开店本身不触发说谎下雨。这是手写的开场故事。" } },
      { id: "mayor-signs", day: 7, time: "12:00", residentId: "mayor", kind: "help", text: "镇长改用手势开会。", speech: "今天用手势开会。", lawId: law.id, effect: null, judgment: { source: "story", status: "accepted", value: "不触发法则", reason: "镇长选择少说几句，避免误会。这是手写的开场故事。" } },
    ],
  };
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
  if (!RESIDENT_IDS.includes(r.residentId as ResidentId) || !["confess", "repeat", "misremember", "help", "praise", "trade"].includes(String(r.kind))) throw new Error("导演提出了岛上还无法执行的行动。");
  return { residentId: r.residentId as ResidentId, kind: r.kind as ActionKind, text: textValue(r.text, 120), speech: textValue(r.speech, 40) };
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
  if (r.format !== "pocket-civilization-v1" || !Number.isInteger(r.day) || Number(r.day) < 1 || !Number.isInteger(r.revision) || Number(r.revision) < 0 || !["story", "intelligent"].includes(String(r.mode)) || !Array.isArray(r.events) || r.events.length > 200 || !Array.isArray(r.petitions)) throw new Error("小岛存档无法读取，原存档已保留。");
  const law = validateLaw(r.law), pendingLaw = r.pendingLaw === null ? null : validateLaw(r.pendingLaw);
  if (law.since > Number(r.day) || (pendingLaw && pendingLaw.since !== Number(r.day) + 1)) throw new Error("法则生效日期与存档不符。");
  const events = r.events.map((v): IslandEvent => {
    const e = object(v), action = validateAction(e), judgment = validateJudgment(e.judgment);
    if (!Number.isInteger(e.day) || Number(e.day) > Number(r.day) || Number(e.day) < 1 || !/^\d{2}:\d{2}$/.test(String(e.time)) || (e.effect !== null && !Object.hasOwn(EFFECTS, String(e.effect)))) throw new Error("事件记录无效。");
    if (e.effect && (judgment.status !== "accepted" || judgment.value !== "触发法则")) throw new Error("事件效果没有可采纳的判断依据。");
    return { ...action, id: textValue(e.id, 100), day: Number(e.day), time: String(e.time), lawId: textValue(e.lawId, 100), effect: e.effect as Effect | null, judgment };
  });
  if (new Set(events.map((e) => e.id)).size !== events.length) throw new Error("事件记录出现重复。");
  const petitions = r.petitions.map((v): Petition => {
    const p = object(v);
    if (!Number.isInteger(p.day) || Number(p.day) > Number(r.day) || (p.resolution && !["once", "always"].includes(String(p.resolution)))) throw new Error("请愿记录无效。");
    return { ...makePetition(Number(p.day), textValue(p.lawId, 100)), id: textValue(p.id, 100), ...(p.resolution ? { resolution: p.resolution as "once" | "always", resolvedDay: Number(p.resolvedDay) } : {}) };
  });
  const interpretation = (value: unknown) => value === null || value === "once" || value === "always" ? value : (() => { throw new Error("法则解释无效。"); })();
  return { format: "pocket-civilization-v1", revision: Number(r.revision), day: Number(r.day), law, pendingLaw, mode: r.mode as PlayMode, modelId: typeof r.modelId === "string" ? r.modelId : "", events, petitions, interpretation: interpretation(r.interpretation), pendingInterpretation: interpretation(r.pendingInterpretation), updatedAt: Number(r.updatedAt) || Date.now() };
}

export function scheduleLaw(world: World, law: Law): World {
  if (law.since !== world.day + 1) throw new Error("新法则只能从下一天生效。");
  return { ...world, pendingLaw: validateLaw(law), revision: world.revision + 1, updatedAt: Date.now() };
}
export function withdrawLaw(world: World): World {
  return { ...world, pendingLaw: null, revision: world.revision + 1, updatedAt: Date.now() };
}
export function effectiveInterpretation(world: World): World["interpretation"] {
  return world.pendingLaw ? null : world.pendingInterpretation ?? world.interpretation;
}
export function makePetition(day: number, lawId: string): Petition {
  return { id: `petition-repeat-${day}`, lawId, day, title: "同一句真话，也能一直开花吗？", text: "小满发现，反复说“镇上有一座桥”也会开花。鲜花伞很好卖，可青禾发现小路越来越挤。她们想请你把法则说得更清楚一点。", options: [
    { id: "once", title: "重复的真话不再开花", description: "每位居民第一次说出这件事时，才会开花。" },
    { id: "always", title: "每一次真话都算", description: "保留这份自由，请大家一起整理花朵。" },
  ] };
}
export function resolvePetition(world: World, id: string, resolution: "once" | "always"): World {
  if (!world.petitions.some((p) => p.id === id && !p.resolution)) throw new Error("这封请愿已经处理过了。");
  if (world.pendingLaw || !world.petitions.some((p) => p.id === id && p.lawId === world.law.id)) throw new Error("这封请愿属于之前的法则，不能用来解释即将生效的新法则。");
  return { ...world, revision: world.revision + 1, updatedAt: Date.now(), pendingInterpretation: resolution, petitions: world.petitions.map((p) => p.id === id ? { ...p, resolution, resolvedDay: world.day } : p) };
}
export function storyActions(world: World, law: Law): Action[] {
  const elapsed = world.day + 1 - law.since;
  if (law.trigger === "truth") return [
    { residentId: "atuan", kind: "confess", text: elapsed ? "阿团认真说出了今天的心里话。" : "阿团终于承认面包是自己偷吃的。", speech: elapsed ? "我今天有一点想朋友。" : "是我偷吃的。" },
    elapsed > 0 ? { residentId: "xiaoman", kind: "repeat", text: "小满又说了一遍“镇上有一座桥”。", speech: "这里真的有一座桥呀。" } : { residentId: "xiaoman", kind: "trade", text: "小满试着把鲜花编进旧雨伞。", speech: "晴天也能带着花出门。" },
    { residentId: "mayor", kind: "confess", text: "镇长承认自己刚刚迷了路。", speech: "我刚才确实走错了。" },
  ];
  if (law.trigger === "lie") return [
    { residentId: "atuan", kind: "repeat", text: "阿团把空盘子藏到身后，说自己没吃面包。", speech: "我真的只看了一眼！" },
    { residentId: "xiaoman", kind: "trade", text: "小满为带着小雨来买伞的客人留了一盏灯。", speech: "雨会停的，先坐一会。" },
    { residentId: "mayor", kind: "misremember", text: "镇长把桥的方向记反，青禾陪他找到了路。", speech: "原来我把方向记反啦。" },
  ];
  if (law.trigger === "help") return [
    { residentId: "gardener", kind: "help", text: "青禾帮小满整理店门前的花盆。", speech: "留一点路，大家都能过。" },
    { residentId: "atuan", kind: "help", text: "阿团帮镇长把面包送到桥边。", speech: "这一次让我来帮忙吧。" },
    { residentId: "xiaoman", kind: "trade", text: "小满为来帮忙的居民泡了一杯茶。", speech: "歇一歇，茶还是热的。" },
  ];
  return [
    { residentId: "xiaoman", kind: "praise", text: "小满认真夸奖青禾把果园照顾得很好。", speech: "今年的果树真有精神。" },
    { residentId: "atuan", kind: "praise", text: "阿团感谢小满做的雨伞很漂亮。", speech: "你的伞像装着一小片天。" },
    { residentId: "gardener", kind: "help", text: "青禾把一篮新鲜果子放在店门口。", speech: "是今早刚摘的。" },
  ];
}
export function storyJudgment(action: Action, law: Law, world: World): Judgment {
  const repeated = action.kind === "repeat" && law.trigger === "truth";
  const triggered = law.trigger === "truth" ? action.kind === "confess" || repeated && world.interpretation !== "once"
    : law.trigger === "lie" ? action.residentId === "atuan" && action.kind === "repeat"
    : law.trigger === "help" ? action.kind === "help" : action.kind === "praise";
  return { source: "story", status: "accepted", value: triggered ? "触发法则" : "不触发法则", reason: `${triggered ? "这次行动符合" : "这次行动不符合"}“${TRIGGERS[law.trigger]}”的条件。这是故事模式按已写好的情节结算。${repeated && world.interpretation === "once" ? "你留下的解释限制了重复触发。" : ""}` };
}
export function makePlan(world: World, actions: Action[], judgments: Judgment[]): DayPlan {
  if (actions.length < 1 || actions.length > 3 || judgments.length !== actions.length) throw new Error("新一天的事件不完整。");
  const law = world.pendingLaw ?? world.law, day = world.day + 1;
  const events = actions.map((raw, index): IslandEvent => {
    const action = validateAction(raw), judgment = validateJudgment(judgments[index]);
    if (judgment.status !== "accepted" || !judgment.value) throw new Error("还有判断需要复核，这一天尚未推进。请稍后重试。");
    const effect = judgment.value === "触发法则" ? law.effect : null;
    return { ...action, id: newId(), day, time: ["08:30", "09:10", "10:00"][index], lawId: law.id, effect, judgment, text: `${action.text}${effect ? EFFECTS[effect] + "。" : ""}` };
  });
  const hasPetition = law.trigger === "truth" && law.effect === "flowers" && !effectiveInterpretation(world) && !world.petitions.some((p) => p.lawId === law.id && !p.resolution) && events.some((e) => e.kind === "repeat" && e.effect === "flowers");
  const disputed = events.some((e) => e.judgment.value === "存在解释争议");
  return { baseRevision: world.revision, day, law, events, ...(hasPetition || disputed && law.trigger === "truth" && law.effect === "flowers" ? { petition: makePetition(day, law.id) } : {}) };
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
  return validateWorld({ ...world, revision: world.revision + 1, day: plan.day, law: plan.law, pendingLaw: null, interpretation: world.law.id !== plan.law.id ? null : effectiveInterpretation(world), pendingInterpretation: null, events: [...world.events, ...plan.events].slice(-180), petitions: plan.petition ? [...world.petitions, plan.petition].slice(-30) : world.petitions, updatedAt: Date.now() });
}
