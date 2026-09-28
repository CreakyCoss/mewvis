export type Mode = "working" | "waiting" | "leisure" | "idle";
export type Activity = keyof typeof ACTIVITIES;
export type Point = { x: number; y: number };
export type ActivityIcon = "work" | "cartoon" | "movie" | "web" | "game" | "music" | "reading" | "coffee" | "rest";
export type Cat = {
  id: string;
  col: number;
  role: string;
  slot: number;
  personality: string;
  preferences: Partial<Record<Activity, number>>;
};
export type CatState = {
  mode: Mode;
  activity: Activity;
  place: "desk" | "lounge";
  elapsedMs: number;
  durationMs: number;
  recent: Activity[];
};
export type Journey = { points: Point[]; destination: CatState; index: number };
export const MODES: Record<Mode, string> = {
  working: "工作中",
  waiting: "思考中",
  leisure: "休闲中",
  idle: "休息中",
};
type ActivityDefinition = {
  title: string;
  short: string;
  description: string;
  icon: ActivityIcon;
  mode: Mode;
  place: CatState["place"];
  seconds: [number, number];
};
function activity(
  title: string,
  short: string,
  description: string,
  icon: ActivityIcon,
  mode: Mode = "working",
  place: CatState["place"] = "desk",
  seconds: [number, number] = [38, 72],
): ActivityDefinition {
  return { title, short, description, icon, mode, place, seconds };
}
export const ACTIVITIES = {
  plan: activity("规划下一步", "做计划", "整理大家的进度，把接下来要做的事排一排。", "work"),
  code: activity("写代码", "写代码", "专心整理界面逻辑，顺手修掉几个小问题。", "work"),
  research: activity("查资料", "查资料", "翻阅参考案例，把有用的信息整理在一起。", "web"),
  write: activity("写文稿", "写文稿", "把刚冒出来的想法，慢慢写成一篇完整的稿子。", "reading"),
  archive: activity("整理文件", "理文件", "给素材分类、检查命名，让文件夹变得整整齐齐。", "work"),
  review: activity("检查工作成果", "做检查", "逐项看看页面与文稿，找出还可以改进的细节。", "work"),
  email: activity("处理邮件", "看邮件", "阅读消息，整理需要跟进的事项。", "web"),
  meeting: activity("准备讨论提纲", "备讨论", "把需要交流的问题和自己的建议记下来。", "work"),
  learn: activity("学习新知识", "学新知", "读一读新教程，试着掌握一个新的小技巧。", "reading"),
  design: activity("设计界面", "做设计", "试试新的排版与配色，把界面打磨得更舒服。", "work"),
  calendar: activity("安排日程", "排日程", "看看日历，给接下来的任务留好时间。", "work"),
  data: activity("分析数据", "看数据", "对照记录和图表，找出值得关注的变化。", "work"),
  thinking: activity(
    "琢磨一个点子",
    "想点子",
    "停下来想一会儿，也许新的办法就要出现了。",
    "work",
    "waiting",
    "desk",
    [18, 32],
  ),
  cartoon: activity(
    "看动画片",
    "动画片",
    "阳光草地上的猫咪冒险，今天也要轻松一点。",
    "cartoon",
    "leisure",
    "desk",
    [30, 60],
  ),
  movie: activity("看电影", "看电影", "夜色、群山和星空，一场安静的太空旅行。", "movie", "leisure", "desk", [35, 65]),
  web: activity("刷网页", "刷网页", "翻翻今日精选，发现一些有意思的新东西。", "web", "leisure", "desk", [25, 50]),
  game: activity("打游戏", "打游戏", "收集金币，和小猫一起闯过下一关。", "game", "leisure", "desk", [30, 55]),
  music: activity("听音乐", "听音乐", "放一首喜欢的歌，让脑袋慢慢放空。", "music", "leisure", "desk", [25, 50]),
  reading: activity(
    "读闲书",
    "读闲书",
    "翻几页有趣的故事，暂时离开忙碌的工作。",
    "reading",
    "leisure",
    "desk",
    [30, 60],
  ),
  puzzle: activity(
    "玩益智小游戏",
    "玩益智",
    "试着解开这一关，再给自己一点小挑战。",
    "game",
    "leisure",
    "desk",
    [25, 50],
  ),
  nap: activity("打个盹", "打个盹", "找个舒服的位置，蜷起来睡一小会儿。", "rest", "idle", "lounge", [35, 65]),
  coffee: activity("喝杯咖啡", "喝咖啡", "离开工位，慢慢喝完这一杯，歇歇脑袋。", "coffee", "idle", "lounge", [25, 45]),
  stretch: activity(
    "伸个懒腰",
    "伸懒腰",
    "活动一下爪子和肩膀，舒舒服服地休息一下。",
    "rest",
    "idle",
    "lounge",
    [20, 35],
  ),
  standby: activity("屏幕待机", "待机", "工位暂时无人，屏幕安静地休息着。", "rest", "idle", "lounge"),
};
export const ACTIVITY_POOL = (Object.keys(ACTIVITIES) as Activity[]).filter((id) => id !== "standby");
export const CATS: Cat[] = [
  {
    id: "Mewvis",
    col: 0,
    role: "任务统筹",
    slot: 0,
    personality: "爱安排，也爱停下来琢磨新点子。",
    preferences: { plan: 10, meeting: 6, calendar: 6, thinking: 4, email: 4, coffee: 3 },
  },
  {
    id: "Lihua",
    col: 1,
    role: "工程开发",
    slot: 1,
    personality: "喜欢钻研，忙完偶尔打两局游戏。",
    preferences: { code: 12, learn: 6, data: 5, review: 5, game: 4, puzzle: 3 },
  },
  {
    id: "Orange",
    col: 2,
    role: "信息调研",
    slot: 3,
    personality: "好奇心很旺盛，也很容易被动画片吸引。",
    preferences: { research: 10, web: 9, cartoon: 7, data: 5, movie: 4, coffee: 4 },
  },
  {
    id: "File",
    col: 3,
    role: "资料管理",
    slot: 5,
    personality: "整整齐齐才安心，整理完就想打个盹。",
    preferences: { archive: 12, nap: 10, email: 5, calendar: 4, reading: 4, coffee: 4 },
  },
  {
    id: "Writer",
    col: 4,
    role: "内容创作",
    slot: 4,
    personality: "喜欢文字和故事，音乐也是灵感的来源。",
    preferences: { write: 12, reading: 10, movie: 6, design: 5, music: 5, thinking: 5 },
  },
  {
    id: "Review",
    col: 5,
    role: "质量检查",
    slot: 2,
    personality: "爱找细节，也爱挑战益智游戏。",
    preferences: { review: 12, puzzle: 9, game: 7, data: 5, design: 4, code: 3, stretch: 4 },
  },
];
export function favoriteActivities(cat: Cat): Activity[] {
  return (Object.entries(cat.preferences) as [Activity, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
}
const randomUnit = (random: () => number) => Math.max(0, Math.min(0.999999, random()));
export type ActivityContext = {
  occupiedActivities: ReadonlySet<Activity>;
};
export function chooseNextActivity(
  cat: Cat,
  current?: CatState,
  random = Math.random,
  context?: ActivityContext,
): Activity {
  const candidates = ACTIVITY_POOL.filter(
    (id) => id !== current?.activity && (ACTIVITIES[id].place === "lounge" || !context?.occupiedActivities.has(id)),
  );
  const weights = candidates.map((id) => (cat.preferences[id] ?? 1) * (current?.recent.includes(id) ? 0.35 : 1));
  let ticket = randomUnit(random) * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < candidates.length; i++) {
    ticket -= weights[i];
    if (ticket < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
export function createCatState(id: Activity, random = Math.random, recent: Activity[] = []): CatState {
  const definition = ACTIVITIES[id],
    [min, max] = definition.seconds;
  return {
    activity: id,
    mode: definition.mode,
    place: definition.place,
    elapsedMs: 0,
    durationMs: (min + randomUnit(random) * (max - min)) * 1000,
    recent,
  };
}
export function progressFor(state: CatState): number {
  return Math.min(100, Math.floor((state.elapsedMs / state.durationMs) * 100));
}
export function deskPoint(cat: Cat): Point {
  return { x: [672, 938, 1230][cat.slot % 3], y: cat.slot < 3 ? 314 : 562 };
}
export function loungePoint(cat: Cat): Point {
  return [
    { x: 330, y: 606 },
    { x: 94, y: 473 },
    { x: 188, y: 576 },
    { x: 175, y: 326 },
    { x: 285, y: 326 },
    { x: 380, y: 487 },
  ][cat.col];
}
export function pointFor(cat: Cat, state: CatState): Point {
  return state.place === "desk" ? deskPoint(cat) : loungePoint(cat);
}
// Desk rows have their own exit aisles. All movement uses these corridors.
// Cats enter the lounge along its right edge, never through a desk or coffee table.
export function routeFor(cat: Cat, from: CatState, to: CatState): Point[] {
  if (from.place === to.place) return [];
  const desk = deskPoint(cat),
    rest = loungePoint(cat);
  const aisleY = cat.slot < 3 ? 346 : 616;
  const loungeEntry = { x: 510, y: 346 };
  const loungePath =
    rest.y < 400
      ? [loungeEntry, { x: 510, y: 326 }, rest]
      : [loungeEntry, { x: 510, y: 500 }, { x: rest.x, y: 500 }, rest];
  const points = [desk, { x: desk.x, y: aisleY }, { x: 510, y: aisleY }, { x: 510, y: 346 }, ...loungePath];
  const compact = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  return from.place === "desk" ? compact : [...compact].reverse();
}
export function stepToward(from: Point, to: Point, distance: number): { point: Point; arrived: boolean } {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length <= distance) return { point: to, arrived: true };
  return {
    point: { x: from.x + ((to.x - from.x) * distance) / length, y: from.y + ((to.y - from.y) * distance) / length },
    arrived: false,
  };
}
