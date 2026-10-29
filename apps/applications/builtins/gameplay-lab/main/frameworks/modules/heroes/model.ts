import type { Issue } from "../../../shared/contracts";

export interface HeroDefinition {
  id: string;
  name: string;
  skill: {
    id: string;
    name: string;
    timing: "before-play";
    effect: "peek";
    uses: number;
    count: number;
  };
}
export interface HeroesConfig {
  version: 1;
  enabled: boolean;
  seats: HeroDefinition[];
}
export interface HeroReveal<Card = { id: string }> {
  target: number;
  step: number;
  cards: Card[];
}
export interface HeroesState<Card = { id: string }> {
  used: number[];
  reveals: HeroReveal<Card>[][];
}
export interface HeroesView<Card = { id: string }> {
  used: number[];
  reveals: HeroReveal<Card>[];
}

export function createHeroesConfig(players = 3): HeroesConfig {
  return {
    version: 1,
    enabled: true,
    seats: ["观星者", "听风者", "探路者"].slice(0, players).map((name, i) => ({
      id: "hero-" + (i + 1),
      name,
      skill: {
        id: "insight",
        name: "洞察",
        timing: "before-play",
        effect: "peek",
        uses: 1,
        count: 1,
      },
    })),
  };
}

export function validateHeroes(
  input: unknown,
  draft = false,
  players = 3,
): Issue[] {
  const issue = (message: string) => [{ path: "英雄模块", message }];
  if (!input || typeof input !== "object" || Array.isArray(input))
    return issue("英雄模块配置无效，无法忽略未知扩展。");
  const config = input as HeroesConfig;
  if (
    config.version !== 1 ||
    typeof config.enabled !== "boolean" ||
    Object.keys(config).some(
      (k) => !["version", "enabled", "seats"].includes(k),
    )
  )
    return issue("英雄模块版本或字段不受支持。");
  if (!Array.isArray(config.seats) || config.seats.length !== players)
    return issue("请为 " + players + " 位玩家分别配置一个英雄。");
  const ids = new Set<string>();
  for (const hero of config.seats) {
    if (!hero || typeof hero !== "object" || Array.isArray(hero))
      return issue("英雄配置无效。");
    if (
      typeof hero.id !== "string" ||
      !/^[\w-]{1,100}$/.test(hero.id) ||
      ids.has(hero.id) ||
      typeof hero.name !== "string" ||
      (!draft && !hero.name.trim()) ||
      hero.name.length > 40 ||
      Object.keys(hero).some((k) => !["id", "name", "skill"].includes(k))
    )
      return issue("英雄标识必须唯一，名称为 1–40 字。");
    ids.add(hero.id);
    const skill = hero.skill;
    if (
      !skill ||
      typeof skill !== "object" ||
      Array.isArray(skill) ||
      typeof skill.id !== "string" ||
      !/^[\w-]{1,100}$/.test(skill.id) ||
      typeof skill.name !== "string" ||
      (!draft && !skill.name.trim()) ||
      skill.name.length > 40 ||
      skill.timing !== "before-play" ||
      skill.effect !== "peek" ||
      !Number.isInteger(skill.uses) ||
      skill.uses < 1 ||
      skill.uses > 3 ||
      !Number.isInteger(skill.count) ||
      skill.count < 1 ||
      skill.count > 3 ||
      Object.keys(skill).some(
        (k) => !["id", "name", "timing", "effect", "uses", "count"].includes(k),
      )
    )
      return issue(
        "技能须为出牌前洞察，名称为 1–40 字，次数与查看张数均为 1–3。",
      );
  }
  return [];
}
