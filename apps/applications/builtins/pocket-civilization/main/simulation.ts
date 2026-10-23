import { RESIDENTS, RESIDENT_IDS, type Action, type IslandEvent, type ResidentId, type World } from "./model";
import { currentFlowerArc, flowerPolicy, needsRoadConversation } from "./stories";

export const PLACES = {
  bakery: { name: "面包店前", x: 501, y: 590 },
  shop: { name: "雨伞铺前", x: 724, y: 601 },
  square: { name: "镇公所前", x: 943, y: 401 },
  orchard: { name: "果园", x: 1252, y: 420 },
  bridge: { name: "石桥边", x: 1170, y: 620 },
} as const;
export type PlaceId = keyof typeof PLACES;
export const PLACE_IDS = Object.keys(PLACES) as PlaceId[];
export const HOME: Record<ResidentId, PlaceId> = { atuan: "bakery", xiaoman: "shop", mayor: "square", gardener: "orchard" };
export const ACTIVITIES = ["admit-bread", "deny-bread", "share-feeling", "bridge-fact", "admit-lost", "find-way", "help-neighbor", "praise-neighbor", "decorate-umbrella", "sell-umbrella", "restock-umbrella", "clear-flowers", "discuss-flowers"] as const;
export type Activity = typeof ACTIVITIES[number];
export const MILESTONES = { confessed: "承认过偷吃面包", decorated: "做出了鲜花伞", traded: "卖出了第一把伞", cleared: "为大家清过小路", bridge: "发现了重复真话的效果", route: "记住了石桥的位置" } as const;
type Milestone = keyof typeof MILESTONES;
export interface Memory { eventId: string; day: number; text: string; otherId?: ResidentId }
export interface ResidentState {
  place: PlaceId;
  lastActedDay: number;
  memories: Memory[];
  knownFacts: string[];
  milestones: Milestone[];
  relations: Record<ResidentId, number>;
}
export interface IslandState {
  flowers: Record<PlaceId, number>;
  shop: { plainUmbrellas: number; flowerUmbrellas: number; looseFlowers: number; sold: number; coins: number };
  residents: Record<ResidentId, ResidentState>;
}
export interface Outcome {
  from: PlaceId;
  to: PlaceId;
  via?: PlaceId;
  notes: string[];
  flowersGrown: number;
  flowersCleared: number;
}
export interface ActionOption extends Action {
  activity: Activity;
  place: PlaceId;
  id: string;
  label: string;
  motive: string;
  priority: number;
}

function residentRecord<T>(value: (id: ResidentId) => T): Record<ResidentId, T> {
  return Object.fromEntries(RESIDENT_IDS.map((id) => [id, value(id)])) as Record<ResidentId, T>;
}

export function createIsland(): IslandState {
  return {
    flowers: { bakery: 0, shop: 0, square: 0, orchard: 0, bridge: 0 },
    shop: { plainUmbrellas: 6, flowerUmbrellas: 0, looseFlowers: 2, sold: 0, coins: 0 },
    residents: residentRecord<ResidentState>((id) => ({
      place: HOME[id], lastActedDay: 7, memories: [], knownFacts: [RESIDENTS[id].fact], milestones: [],
      relations: Object.fromEntries(RESIDENT_IDS.map((other) => [other, other === id ? 100 : id === "xiaoman" && other === "atuan" ? 38 : 50])) as ResidentState["relations"],
    })),
  };
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("小岛生活存档不完整，原存档已保留。");
  return value as Record<string, unknown>;
};
const integer = (value: unknown, max = 1_000_000) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) throw new Error("小岛资源或关系记录无效，原存档已保留。");
  return Number(value);
};
const strings = (value: unknown, max: number, length: number): string[] => {
  if (!Array.isArray(value) || value.length > max || value.some((v) => typeof v !== "string" || !v.trim() || v.length > length)) throw new Error("居民记忆记录无效，原存档已保留。");
  return [...value];
};
export const isPlace = (value: unknown): value is PlaceId => typeof value === "string" && Object.hasOwn(PLACES, value);
export const isActivity = (value: unknown): value is Activity => ACTIVITIES.includes(value as Activity);
export const isResident = (value: unknown): value is ResidentId => RESIDENT_IDS.includes(value as ResidentId);
const followsTarget = (activity: Activity) => ["admit-bread", "deny-bread", "help-neighbor", "praise-neighbor", "discuss-flowers"].includes(activity);

export function validateIsland(value: unknown, day: number): IslandState {
  const input = record(value), flowers = record(input.flowers), shop = record(input.shop), people = record(input.residents);
  const residents = Object.fromEntries(RESIDENT_IDS.map((id) => {
    const person = record(people[id]), relations = record(person.relations);
    if (!isPlace(person.place) || !Array.isArray(person.memories) || person.memories.length > 12) throw new Error("居民生活记录无效。");
    const memories = person.memories.map((v): Memory => {
      const memory = record(v), memoryDay = integer(memory.day, day);
      const [eventId, text] = [strings([memory.eventId], 1, 100)[0], strings([memory.text], 1, 240)[0]];
      if (!memoryDay || memory.otherId !== undefined && !isResident(memory.otherId)) throw new Error("居民记忆日期或人物无效。");
      return { eventId, text, day: memoryDay, ...(memory.otherId ? { otherId: memory.otherId as ResidentId } : {}) };
    });
    const milestones = strings(person.milestones, 6, 30);
    if (milestones.some((key) => !Object.hasOwn(MILESTONES, key))) throw new Error("居民经历记录无效。");
    return [id, { place: person.place, lastActedDay: integer(person.lastActedDay, day), memories, knownFacts: strings(person.knownFacts, 24, 240), milestones: [...new Set(milestones)] as Milestone[], relations: Object.fromEntries(RESIDENT_IDS.map((other) => [other, integer(relations[other], 100)])) }];
  })) as IslandState["residents"];
  return {
    flowers: Object.fromEntries(PLACE_IDS.map((id) => [id, integer(flowers[id], 30)])) as IslandState["flowers"],
    shop: Object.fromEntries(["plainUmbrellas", "flowerUmbrellas", "looseFlowers", "sold", "coins"].map((key) => [key, integer(shop[key])])) as IslandState["shop"], residents,
  };
}

export function validateOutcome(value: unknown): Outcome {
  const input = record(value);
  if (!isPlace(input.from) || !isPlace(input.to)) throw new Error("事件发生地点无效。");
  if (input.via !== undefined && !isPlace(input.via)) throw new Error("收花路线无效。");
  return { from: input.from, to: input.to, ...(input.via ? { via: input.via as PlaceId } : {}), notes: strings(input.notes, 8, 160), flowersGrown: integer(input.flowersGrown, 2), flowersCleared: integer(input.flowersCleared, 4) };
}

export const totalFlowers = (island: IslandState) => PLACE_IDS.reduce((sum, id) => sum + island.flowers[id], 0);
export const crowdedPlaces = (island: IslandState) => PLACE_IDS.filter((id) => id !== "orchard" && island.flowers[id] >= 4);
export const roadFlowers = (island: IslandState) => totalFlowers(island) - island.flowers.orchard;
export const roadStatus = (island: IslandState) => crowdedPlaces(island).length || roadFlowers(island) >= 8 ? "拥挤" : roadFlowers(island) >= 4 ? "渐渐变窄" : "通行顺畅";
export const relationshipText = (value: number) => value < 40 ? "还有些顾虑" : value < 60 ? "慢慢熟悉" : value < 80 ? "愿意互相帮忙" : "很信任彼此";

export function residentGoal(island: IslandState, id: ResidentId): string {
  if (id === "atuan") return !island.residents.atuan.milestones.includes("confessed") ? "鼓起勇气，承认偷吃面包的事" : island.residents.xiaoman.relations.atuan < 65 ? "多帮小满一点，让她重新相信自己" : "把帮助邻居变成一个小习惯";
  if (id === "xiaoman") return island.shop.flowerUmbrellas ? "把编好的鲜花伞卖给需要它的人" : island.shop.plainUmbrellas === 0 && island.shop.coins >= 2 ? "用小店的收入补进两把旧雨伞" : island.shop.looseFlowers >= 2 && island.shop.plainUmbrellas > 0 ? "用花篮里的花做一把鲜花伞" : "找一点新花，让小店继续经营";
  if (id === "gardener") return crowdedPlaces(island).length ? `给${PLACES[crowdedPlaces(island)[0]].name}留出一条能走的路` : totalFlowers(island) ? "把路边的花收入花篮，给小满留些材料" : "照顾果园，也留意邻居的小心事";
  return crowdedPlaces(island).length ? "和居民一起把拥挤的小路整理好" : "听听大家的心事，帮小镇维持日常秩序";
}

export function actionOptions(world: World): ActionOption[] {
  const island = world.island, law = world.pendingLaw ?? world.law, options: ActionOption[] = [];
  const add = (residentId: ResidentId, activity: Activity, kind: Action["kind"], place: PlaceId, label: string, text: string, speech: string, priority: number, targetId?: ResidentId) => {
    options.push({ id: `${residentId}:${activity}:${place}:${targetId ?? "none"}`, residentId, activity, kind, place, label, text, speech, priority: priority + Math.min(30, Math.max(0, world.day - island.residents[residentId].lastActedDay) * 10), motive: residentGoal(island, residentId), ...(targetId ? { targetId } : {}) });
  };
  if (!island.residents.atuan.milestones.includes("confessed")) {
    add("atuan", "admit-bread", "confess", island.residents.xiaoman.place, "承认偷吃", "阿团找到小满，承认面包是自己偷吃的。", "面包是我吃的，对不起。", law.trigger === "truth" ? 110 : 65, "xiaoman");
    add("atuan", "deny-bread", "repeat", island.residents.xiaoman.place, "藏起空盘子", "阿团找到小满，藏起空盘子，仍否认自己吃过面包。", "我真的只看了一眼！", law.trigger === "lie" ? 105 : 25, "xiaoman");
  }
  add("atuan", "share-feeling", "share", "bakery", "说说心里话", "阿团说起今天想和朋友一起散步的心愿。", "今天想和大家一起走走。", law.trigger === "truth" ? 62 : 30);
  if (!island.residents.mayor.milestones.includes("route")) {
    add("mayor", "admit-lost", "confess", "square", "承认迷路", "镇长承认自己记反了石桥的方向。", "刚才是我把方向记反了。", law.trigger === "truth" ? 95 : 50);
    add("mayor", "find-way", "misremember", "bridge", "认一认路", "镇长走到石桥边，记住了通向雨伞铺的路。", "原来这条路通向小满的店。", 55);
  }
  const policy = flowerPolicy(world), arc = currentFlowerArc(world);
  if (law.trigger === "truth") add("xiaoman", "bridge-fact", "repeat", policy === "orchard" ? "orchard" : "bridge", policy === "orchard" ? "去果园试种" : "试试重复真话", policy === "orchard" ? "小满按约定来到果园，又说了一遍“镇上有一座桥”。" : "小满来到石桥边，又说了一遍“镇上有一座桥”。", "镇上真的有一座桥呀。", policy === "orchard" && !arc?.entries.some((entry) => entry.id === "practice") ? 115 : !world.pendingLaw && (world.pendingInterpretation ?? world.interpretation) === "once" ? 10 : !island.residents.xiaoman.milestones.includes("bridge") && world.day >= law.since ? 108 : crowdedPlaces(island).length ? 20 : 82);
  if (needsRoadConversation(world)) add("mayor", "discuss-flowers", "discuss", island.residents.gardener.place, "商量小路的事", "镇长找到青禾，听她说起花料和通行的难处，准备一起向你请愿。", "花要留下，小路也要留给大家。", 122, "gardener");
  if (island.shop.plainUmbrellas > 0 && island.shop.looseFlowers >= 2) add("xiaoman", "decorate-umbrella", "decorate", "shop", "编一把鲜花伞", "小满从花篮里取出花，编在一把旧雨伞上。", "晴天也能带着花出门。", island.shop.flowerUmbrellas > 0 ? 60 : 100);
  if (island.shop.flowerUmbrellas + island.shop.plainUmbrellas > 0) add("xiaoman", "sell-umbrella", "trade", "shop", "照顾小店", island.shop.flowerUmbrellas ? "小满把一把鲜花伞卖给了路过的客人。" : "小满把一把旧雨伞卖给了路过的客人。", "带上它，慢慢走呀。", island.shop.flowerUmbrellas ? 96 : law.trigger === "truth" ? 58 : 88);
  if (island.shop.coins >= 2) add("xiaoman", "restock-umbrella", "restock", "shop", "给小店进货", "小满用小店收入补进两把待装饰的旧雨伞。", "再准备两把，明天也开门。", island.shop.plainUmbrellas + island.shop.flowerUmbrellas === 0 ? 105 : 25);
  for (const id of RESIDENT_IDS) {
    const target: ResidentId = id === "atuan" ? "xiaoman" : id === "xiaoman" ? "gardener" : id === "gardener" ? "xiaoman" : "atuan";
    add(id, "help-neighbor", "help", island.residents[target].place, "帮帮邻居", `${RESIDENTS[id].name}找到${RESIDENTS[target].name}，帮忙整理手边的东西。`, "这件事我们一起做吧。", id === "atuan" && island.residents.atuan.milestones.includes("confessed") && island.residents.xiaoman.relations.atuan < 75 ? 90 : id === "mayor" ? 69 : 42, target);
    add(id, "praise-neighbor", "praise", island.residents[target].place, "认真夸奖", `${RESIDENTS[id].name}认真夸奖${RESIDENTS[target].name}为小镇付出的心思。`, "你做的这些，我都有看见。", law.trigger === "praise" ? 92 : 28, target);
    if (id === "xiaoman") continue;
    for (const place of PLACE_IDS.filter((place) => island.flowers[place] > 0)) add(id, "clear-flowers", "clear", place, "收拢路边的花", `${RESIDENTS[id].name}把${PLACES[place].name}的花收拢，送进小满的花篮。`, "花留在篮子里，小路留给大家。", (id === "gardener" ? policy && place !== "orchard" ? 120 : 75 : 35) + (island.flowers[place] >= 4 ? 35 : 0), "xiaoman");
  }
  return options;
}

export function canonicalAction(world: World, action: Action): ActionOption {
  const contact = action.activity && followsTarget(action.activity);
  const options = actionOptions(world).filter((option) => option.residentId === action.residentId && (action.activity ? option.activity === action.activity : option.kind === action.kind) && (contact || !action.place || option.place === action.place) && (!action.targetId || option.targetId === action.targetId));
  const option = options[0];
  if (!option) throw new Error(`${RESIDENTS[action.residentId].name}现在还做不了这件事：材料、地点或经历已经变化。小岛尚未推进。`);
  // Narrative about inventory and effects comes from the executable action, never a model patch.
  return { ...option, speech: action.speech };
}

export function validateActionBatch(world: World, actions: Action[]): ActionOption[] {
  if (actions.length < 1 || actions.length > 3 || new Set(actions.map((action) => action.residentId)).size !== actions.length) throw new Error("一天需要1到3位不同居民的行动。");
  const canonical = actions.map((action) => canonicalAction(world, action));
  const positions = residentRecord((id) => world.island.residents[id].place);
  for (const action of canonical) {
    if (action.targetId && followsTarget(action.activity)) action.place = positions[action.targetId];
    positions[action.residentId] = action.activity === "clear-flowers" ? "shop" : action.place;
  }
  const clearPlaces = canonical.filter((action) => action.activity === "clear-flowers").map((action) => action.place);
  if (new Set(clearPlaces).size !== clearPlaces.length) throw new Error("两位居民准备收同一处花，请重新安排这一天。");
  return canonical;
}

export function selectCandidateActions(world: World, value: unknown): ActionOption[] {
  const input = record(value), options = actionOptions(world);
  if (!Array.isArray(input.actions) || input.actions.length !== 3) throw new Error("导演没有选出完整的3件行动，小岛尚未改变。");
  const actions = input.actions.map((value) => {
    const selection = record(value), option = options.find((option) => option.id === selection.candidateId);
    if (!option) throw new Error("导演选了尚不能执行的行动，小岛尚未改变，可以重试。");
    return option;
  });
  return validateActionBatch(world, actions);
}

function remember(person: ResidentState, event: IslandEvent, text: string, otherId?: ResidentId) {
  if (person.memories.some((memory) => memory.eventId === event.id)) return;
  person.memories = [...person.memories, { eventId: event.id, day: event.day, text, ...(otherId ? { otherId } : {}) }].slice(-12);
}
function milestone(person: ResidentState, value: Milestone) { if (!person.milestones.includes(value)) person.milestones.push(value); }
function learn(person: ResidentState, fact: string) { if (!person.knownFacts.includes(fact)) person.knownFacts = [...person.knownFacts, fact].slice(-24); }
function trust(island: IslandState, observer: ResidentId, actor: ResidentId, change: number) { island.residents[observer].relations[actor] = Math.max(0, Math.min(100, island.residents[observer].relations[actor] + change)); }

export function settleIsland(input: IslandState, events: IslandEvent[]): { island: IslandState; events: IslandEvent[] } {
  const island = structuredClone(input);
  const settled = events.map((event): IslandEvent => {
    if (!event.activity || !event.place) throw new Error("这件事缺少可执行的行动或地点。");
    const person = island.residents[event.residentId], from = person.place, notes: string[] = [];
    let flowersCleared = 0, flowersGrown = 0;
    const target = event.targetId;
    if (event.activity === "decorate-umbrella") {
      if (island.shop.plainUmbrellas < 1 || island.shop.looseFlowers < 2) throw new Error("编鲜花伞的材料不够，这一天尚未推进。");
      island.shop.plainUmbrellas--; island.shop.looseFlowers -= 2; island.shop.flowerUmbrellas++;
      milestone(person, "decorated"); notes.push("花篮少了2簇花，旧伞少了1把，鲜花伞多了1把。");
    } else if (event.activity === "sell-umbrella") {
      const decorated = island.shop.flowerUmbrellas > 0;
      if (!decorated && island.shop.plainUmbrellas < 1) throw new Error("店里已经没有可卖的伞，这一天尚未推进。");
      if (decorated) island.shop.flowerUmbrellas--; else island.shop.plainUmbrellas--;
      const price = decorated ? 2 : 1;
      island.shop.coins += price; island.shop.sold++; milestone(person, "traded");
      notes.push(`卖出1把${decorated ? "鲜花伞" : "旧雨伞"}，小店收到${price}枚零钱。`);
    } else if (event.activity === "restock-umbrella") {
      if (island.shop.coins < 2) throw new Error("小店的零钱还不够进货，这一天尚未推进。");
      island.shop.coins -= 2; island.shop.plainUmbrellas += 2; notes.push("用2枚零钱补进了2把旧雨伞。");
    } else if (event.activity === "clear-flowers") {
      flowersCleared = Math.min(4, island.flowers[event.place]);
      if (!flowersCleared) throw new Error("这里的花已经被收走了，这一天尚未推进。");
      island.flowers[event.place] -= flowersCleared; island.shop.looseFlowers += flowersCleared; milestone(person, "cleared");
      notes.push(`${PLACES[event.place].name}收走${flowersCleared}簇花，花篮里也多了这些材料。`);
    } else if (event.activity === "admit-bread") {
      milestone(person, "confessed");
      learn(person, "已经向小满承认偷吃面包，接下来想用行动弥补。");
      if (target) { trust(island, target, event.residentId, 12); learn(island.residents[target], "阿团已经亲口承认偷吃面包，愿意弥补。"); }
      notes.push(`${target ? RESIDENTS[target].name : "邻居"}听见了承认，愿意重新相信阿团。`);
    } else if (event.activity === "deny-bread") {
      trust(island, "xiaoman", "atuan", -4); notes.push("小满对阿团的说法又多了一点顾虑。");
    } else if (event.activity === "admit-lost" || event.activity === "find-way") {
      milestone(person, "route"); learn(person, "已经认清石桥通向雨伞铺的路，不需要再假装认路。"); notes.push("镇长把这条路记在了心里。");
    } else if (event.activity === "bridge-fact") {
      milestone(person, "bridge"); learn(person, `在第${event.day}天，重复说石桥的事实${event.effect === "flowers" ? "也开了花" : "没有带来新的花"}。`);
    } else if (event.activity === "discuss-flowers") {
      learn(person, "青禾愿意收拢小路上的花，小满也需要花料；大家要一起商量。");
      if (target) learn(island.residents[target], "镇长听过了花料和通行的难处，愿意一起向法则的书写者请愿。");
      notes.push("花料和通行的分歧被认真听见，居民准备写一封请愿。");
    }
    if (target && ["help", "praise", "clear"].includes(event.kind)) {
      trust(island, target, event.residentId, event.kind === "praise" ? 4 : 7);
      trust(island, event.residentId, target, 2);
      notes.push(`${RESIDENTS[target].name}记住了这份${event.kind === "praise" ? "肯定" : "帮助"}。`);
    }
    if (event.effect === "flowers") {
      flowersGrown = Math.min(2, 30 - island.flowers[event.place]);
      island.flowers[event.place] += flowersGrown;
      notes.push(flowersGrown ? `${PLACES[event.place].name}留下${flowersGrown}簇新花，明天还会在。` : "这里的花已经很密，新花没有再挤进小路。");
    }
    person.place = event.activity === "clear-flowers" ? "shop" : event.place; person.lastActedDay = event.day;
    const outcome: Outcome = { from, to: person.place, ...(event.activity === "clear-flowers" && event.place !== "shop" ? { via: event.place } : {}), notes, flowersGrown, flowersCleared };
    const text = event.effect === "flowers" && flowersGrown < 2 ? event.text.replace(/脚边开出两簇小花。$/, flowersGrown ? "脚边又开出一簇小花。" : "花丛已经很密，小路没有再添新花。") : event.text;
    const result = { ...event, text, outcome };
    remember(person, result, `${result.text}${notes[0] ?? ""}`, target);
    if (target) remember(island.residents[target], result, `${RESIDENTS[event.residentId].name}${event.activity === "clear-flowers" ? "把收好的花送到了我的花篮里：" : "来找过我："}${result.text}${notes[0] ?? ""}`, event.residentId);
    return result;
  });
  return { island, events: settled };
}

type Point = { x: number; y: number };
// Authored paths go around the roof silhouettes in the fixed island artwork.
const MARKET_GATE: Point = { x: 830, y: 680 }, EAST_GATE: Point = { x: 1000, y: 610 };
const routes: Record<string, Point[]> = {
  "bakery:shop": [{ x: 575, y: 620 }, { x: 650, y: 650 }],
  "shop:square": [MARKET_GATE, { x: 1000, y: 550 }, { x: 1000, y: 465 }],
  "shop:bridge": [MARKET_GATE, EAST_GATE],
  "square:bridge": [{ x: 1000, y: 465 }, { x: 1000, y: 550 }, EAST_GATE],
  "bridge:orchard": [{ x: 1270, y: 590 }, { x: 1320, y: 530 }, { x: 1310, y: 470 }],
};
export function walkingRoute(from: PlaceId, to: PlaceId): Point[] {
  if (from === to) return [PLACES[from], PLACES[to]];
  const direct = routes[`${from}:${to}`], reverse = routes[`${to}:${from}`];
  if (direct || reverse) return [PLACES[from], ...(direct ?? [...reverse].reverse()), PLACES[to]];
  const via: PlaceId = from === "orchard" || to === "orchard" ? "bridge" : "shop";
  return [...walkingRoute(from, via), ...walkingRoute(via, to).slice(1)];
}
