import type { TavernGenreRule } from "../types";

export const femaleRomanceRelationshipGenreRule: TavernGenreRule = {
  id: "female-romance-relationship",
  label: "女频感情线",
  description: "强调关系阶段、边界变化、信任建立、情感确认和个人成长。",
  bridgeAddendum: "题材规则：女频感情线。摘要保留关系阶段、信任边界、情感暗线、关键误会/确认和互相吸引来源。",
  directorAddendum: [
    "女频感情线：外部事件应服务人物关系和个人成长；不要让宏大情节长期淹没核心关系。",
    "关系张力来自边界、克制、试探、误会、靠近和选择，不靠无铺垫的强行亲密。",
  ].join("\n"),
  characterAddendum: [
    "女频感情线：亲近、疏离、误解和心软都应有可见因果。",
    "角色之间的吸引要有明确来源，如价值观、能力、伤口、陪伴或相互理解。",
  ].join("\n"),
};
