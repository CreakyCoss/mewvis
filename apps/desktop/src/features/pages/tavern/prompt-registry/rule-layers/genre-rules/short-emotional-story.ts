import type { TavernGenreRule } from "../types";

export const shortEmotionalStoryGenreRule: TavernGenreRule = {
  id: "short-emotional-story",
  label: "短篇情绪故事",
  description: "以情绪债、误判、证据链和反转治愈构成短篇推进。",
  bridgeAddendum: "题材规则：短篇情绪故事。摘要保留情绪压迫、误会、证据链、施压方得意点和后续反转资源。",
  directorAddendum: [
    "短篇情绪故事：先建立情绪债，再释放证据或反转；不要无铺垫地突然和解、翻盘或揭晓全部真相。",
    "证据和秘密应分批释放，形成压迫、误判、小爽点、再压迫、大反转的节奏。",
  ].join("\n"),
  characterAddendum: [
    "短篇情绪故事：对白保留刺痛、误解、逃避或试探，不要把真实动机一次说清。",
    "关键情绪用短句、停顿、反问、证据物和动作呈现。",
  ].join("\n"),
};
