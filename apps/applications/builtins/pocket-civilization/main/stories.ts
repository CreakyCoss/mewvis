import type { DayPlan, IslandEvent, Petition, PetitionChoice, World } from "./model";
import { roadFlowers, type IslandState } from "./simulation";

export type FlowerPolicy = "harvest" | "orchard";
export interface StoryEntry { id: string; day: number; text: string }
export interface FlowerArc {
  lawId: string; startedDay: number;
  stage: "sprout" | "pressure" | "petition" | "agreement" | "complete" | "changed";
  entries: StoryEntry[];
  repeatChoice: "once" | "always" | null;
  policy: FlowerPolicy | null; pendingPolicy: FlowerPolicy | null;
  soldAtAgreement: number | null; ending: string | null;
}
export interface Stories {
  flowers: FlowerArc[];
  friendship: { stage: "unspoken" | "mending" | "friends"; entries: StoryEntry[] };
}
export const createStories = (): Stories => ({ flowers: [], friendship: { stage: "unspoken", entries: [] } });
export function currentFlowerArc(world: World): FlowerArc | undefined {
  return world.stories.flowers.find((arc) => arc.lawId === (world.pendingLaw ?? world.law).id);
}
export function flowerPolicy(world: World): FlowerPolicy | null {
  const arc = currentFlowerArc(world);
  return arc?.pendingPolicy ?? arc?.policy ?? null;
}
const has = (arc: FlowerArc | undefined, id: string) => arc?.entries.some((entry) => entry.id === id) ?? false;
function record(entries: StoryEntry[], id: string, day: number, text: string) {
  if (!entries.some((entry) => entry.id === id)) entries.push({ id, day, text });
}

export function needsRoadConversation(world: World): boolean {
  const law = world.pendingLaw ?? world.law, arc = currentFlowerArc(world);
  return law.trigger === "truth" && law.effect === "flowers" && world.island.residents.xiaoman.milestones.includes("decorated") && roadFlowers(world.island) >= 4 && !has(arc, "discussion") && !world.petitions.some((p) => p.lawId === law.id);
}

export function nextPetitionKind(world: World, island: IslandState, events: IslandEvent[]): Petition["kind"] | null {
  const law = world.pendingLaw ?? world.law;
  if (law.trigger !== "truth" || law.effect !== "flowers") return null;
  const own = world.petitions.filter((p) => p.lawId === law.id), arc = currentFlowerArc(world);
  if (own.some((p) => !p.resolution)) return null;
  const discussion = has(arc, "discussion") || events.some((event) => event.activity === "discuss-flowers");
  const repeated = has(arc, "repeated") || events.some((event) => event.activity === "bridge-fact" && event.effect === "flowers");
  if (!own.some((p) => p.kind === "repeat") && discussion && repeated && roadFlowers(island) >= 4) return "repeat";
  if (own.some((p) => p.kind === "repeat" && p.resolution) && !own.some((p) => p.kind === "road")) return "road";
  return null;
}

export function recordStoryChoice(world: World, petition: Petition, choice: PetitionChoice): Stories {
  const stories = structuredClone(world.stories), arc = stories.flowers.find((arc) => arc.lawId === petition.lawId);
  if (!arc) throw new Error("这封请愿的故事记录不完整。");
  if (petition.kind === "repeat") {
    if (choice !== "once" && choice !== "always") throw new Error("这不是这封请愿提供的选择。");
    arc.repeatChoice = choice;
    arc.stage = "pressure";
    record(arc.entries, "repeat-choice", world.day, choice === "once" ? "你决定同一件真话只开一次花，从明天起减少重复种花。" : "你决定保留每次真话开花的自由，居民需要一起照顾小路。");
  } else {
    if (choice !== "harvest" && choice !== "orchard") throw new Error("这不是这封请愿提供的选择。");
    arc.pendingPolicy = choice;
    arc.stage = "agreement";
    record(arc.entries, "road-choice", world.day, choice === "harvest" ? "你请大家优先收拢路边的花，把材料送给小满；约定明天开始。" : "你把重复真话的试种安排到果园，也请大家收拢路边旧花；约定明天开始。");
  }
  return stories;
}

export function advanceStories(world: World, plan: DayPlan, island: IslandState): Stories {
  const stories = structuredClone(world.stories), day = plan.day, events = plan.events;
  const friendship = stories.friendship;
  if (island.residents.atuan.milestones.includes("confessed")) {
    friendship.stage = "mending";
    record(friendship.entries, "apology", day, "阿团亲口承认偷吃面包，小满开始愿意重新相信他。");
    if (island.residents.xiaoman.relations.atuan >= 65) {
      friendship.stage = "friends";
      record(friendship.entries, "friends", day, "几次实实在在的帮忙后，小满终于放心把手边的事情交给阿团。道歉成了新的相处方式。");
    }
  }
  for (const arc of stories.flowers) if (arc.lawId !== plan.law.id && !["complete", "changed"].includes(arc.stage)) {
    arc.stage = "changed"; arc.pendingPolicy = null;
    arc.ending = "法则换了，试种暂告一段落。已经做好的伞、路边的花和居民的经历仍然留下。";
    record(arc.entries, "law-change", day, arc.ending);
  }
  if (plan.law.trigger !== "truth" || plan.law.effect !== "flowers") return stories;
  let arc = stories.flowers.find((arc) => arc.lawId === plan.law.id);
  if (!arc) {
    arc = { lawId: plan.law.id, startedDay: day, stage: "sprout", entries: [], repeatChoice: null, policy: null, pendingPolicy: null, soldAtAgreement: null, ending: null };
    stories.flowers = [...stories.flowers, arc].slice(-8);
  }
  if (["complete", "changed"].includes(arc.stage)) return stories;
  if (events.some((e) => e.activity === "decorate-umbrella")) record(arc.entries, "umbrella", day, "小满用花篮里的花做出鲜花伞，想把这种小生意继续做下去。");
  if (events.some((e) => e.activity === "bridge-fact" && e.effect === "flowers")) record(arc.entries, "repeated", day, "同一句关于石桥的真话又开了花。小满发现了新花的来源。");
  if (roadFlowers(island) >= 4) {
    arc.stage = "pressure";
    record(arc.entries, "pressure", day, "小路边的花渐渐挤在一起。材料多了，通行却成了大家的心事。");
  }
  if (events.some((e) => e.activity === "discuss-flowers")) record(arc.entries, "discussion", day, "镇长和青禾谈了谈：小满需要花，小路也得留给邻居。大家准备请你解释法则。");
  if (plan.petition) {
    arc.stage = "petition";
    record(arc.entries, `${plan.petition.kind}-petition`, day, plan.petition.kind === "repeat" ? "小满与青禾联名请愿：重复的真话，要不要一直开花？" : "解释已开始生效，居民接着来问：花从哪里来，小路又该怎么留？");
  }
  if (arc.pendingPolicy) {
    arc.policy = arc.pendingPolicy; arc.pendingPolicy = null; arc.soldAtAgreement = world.island.shop.sold;
    record(arc.entries, "agreement", day, "新的约定开始生效。大家准备把选择变成日常行动。");
  }
  if (arc.policy) {
    arc.stage = "agreement";
    const practiced = arc.policy === "harvest" ? events.some((e) => e.activity === "clear-flowers") : events.some((e) => e.activity === "bridge-fact" && e.place === "orchard");
    if (practiced) record(arc.entries, "practice", day, arc.policy === "harvest" ? "居民按约定收花回店，路上的花变成了小满花篮里的材料。" : "小满把重复真话的尝试搬到了果园，新花不再挤进石桥边的小路。");
    if (world.island.shop.flowerUmbrellas > 0 && events.some((event) => event.activity === "sell-umbrella")) record(arc.entries, "customer", day, "约定生效后，一把鲜花伞找到了客人。花料和通行终于不再互相挤占。");
    if (has(arc, "practice") && has(arc, "customer") && roadFlowers(island) < 4 && island.shop.sold > (arc.soldAtAgreement ?? island.shop.sold)) {
      arc.stage = "complete";
      arc.ending = `${arc.repeatChoice === "once" ? "重复的真话不再无尽开花" : "每次真话仍然可以开花"}，${arc.policy === "harvest" ? "大家把收花变成了日常合作" : "小满在果园里继续试种"}。小路重新宽敞，鲜花伞也找到了客人。`;
      record(arc.entries, "ending", day, arc.ending);
    }
  }
  return stories;
}

export function validateStories(value: unknown, day: number): Stories {
  if (!value || typeof value !== "object") throw new Error("故事记录不完整。");
  const input = value as Stories;
  const entries = (values: StoryEntry[]) => {
    if (!Array.isArray(values) || values.length > 16 || new Set(values.map((entry) => entry?.id)).size !== values.length || values.some((entry) => !entry || typeof entry.id !== "string" || !entry.id || entry.id.length > 40 || typeof entry.text !== "string" || !entry.text || entry.text.length > 240 || !Number.isInteger(entry.day) || entry.day < 1 || entry.day > day)) throw new Error("故事经历记录无效。");
    return values.map(({ id, day, text }) => ({ id, day, text }));
  };
  if (!Array.isArray(input.flowers) || input.flowers.length > 8 || new Set(input.flowers.map((arc) => arc?.lawId)).size !== input.flowers.length || !input.friendship || !["unspoken", "mending", "friends"].includes(input.friendship.stage)) throw new Error("故事进度记录无效。");
  return {
    friendship: { stage: input.friendship.stage, entries: entries(input.friendship.entries) },
    flowers: input.flowers.map((arc) => {
      if (!arc || typeof arc.lawId !== "string" || !arc.lawId || arc.lawId.length > 100 || !Number.isInteger(arc.startedDay) || arc.startedDay < 1 || arc.startedDay > day || !["sprout", "pressure", "petition", "agreement", "complete", "changed"].includes(arc.stage) || ![null, "once", "always"].includes(arc.repeatChoice) || ![null, "harvest", "orchard"].includes(arc.policy) || ![null, "harvest", "orchard"].includes(arc.pendingPolicy) || arc.soldAtAgreement !== null && (!Number.isSafeInteger(arc.soldAtAgreement) || arc.soldAtAgreement < 0) || arc.ending !== null && (typeof arc.ending !== "string" || arc.ending.length > 240)) throw new Error("种花故事记录无效。");
      return { ...arc, entries: entries(arc.entries) };
    }),
  };
}
