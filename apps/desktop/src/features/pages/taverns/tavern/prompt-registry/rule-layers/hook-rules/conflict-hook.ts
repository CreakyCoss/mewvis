import type { TavernHookRule } from "../types";

export const conflictHookRule: TavernHookRule = {
  id: "conflict-hook",
  label: "冲突感",
  description: "用明确矛盾、选择压力或立场碰撞形成当前回合钩子。",
  bridgeAddendum: "钩子规则：冲突感。摘要保留当前冲突、选择压力、立场碰撞和未解决问题。",
  directorAddendum: "冲突感：每轮尽量让角色面对一个具体压力、条件、阻碍或态度碰撞，停在可回应的位置。",
  characterAddendum: "冲突感：角色回复要带出立场、要求、拒绝、条件、威胁或新的可回应问题之一。",
};
