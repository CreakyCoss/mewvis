import type { TavernGenreRule } from "../types";

export const acgCharacterFunGenreRule: TavernGenreRule = {
  id: "acg-character-fun",
  label: "二次元人设整活",
  description: "以人设萌点、梗点、次元语境和互动反应驱动内容。",
  bridgeAddendum: "题材规则：二次元人设整活。摘要保留角色萌点、梗点、脑洞设定、次元语境和可持续整活点。",
  directorAddendum: [
    "二次元人设整活：保持次元文化语境一致；看不懂的梗不要硬塞。",
    "同人感或二游感应来自角色关系和事件设计，不靠堆名词。",
  ].join("\n"),
  characterAddendum: [
    "二次元人设整活：优先展示萌点、怪癖、吐槽、误会和互动化反应。",
    "角色可以轻快，但不能脱离人设说段子。",
  ].join("\n"),
};
