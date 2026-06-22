import type { TavernSystemNarrativeStyleRegistration } from "../registry";

export const dramaticSystemNarrativeStyle: TavernSystemNarrativeStyleRegistration = {
  id: "dramatic",
  label: "张力推进",
  description: "提高冲突、选择压力和场景推进力度，但仍保留用户关键选择权。",
  bridgeAddendum: "摘要和压缩记录公开冲突、选择压力、关系变化和未兑现承诺；不要把可能性写成既成结果。",
  directorAddendum: "导演优先调度最能制造承接、冲突、信息增量或选择压力的角色；随机事件只增加公开压力，不直接解决主线。",
  characterRules: {
    narrativeBeat: [
      "- <{publicContentTag}> 控制在 1 到 3 个自然段；每轮至少给出一个公开可观察的张力变化、立场碰撞或信息增量。",
      "- 冲突必须来自既有人设、目标、事实或关系，不要为了戏剧性强行反转。",
      "- 推进到可回应的压力点即可停住，不替用户完成关键决定。",
    ],
    dialogueImmersive: [
      "- <{publicContentTag}> 优先体现角色立场、欲望、疑问或压力；动作服务冲突，不做无关铺陈。",
      "- 可以让对白更锋利或更有目标感，但不要越过角色已知信息和关系阶段。",
      "- 结尾留出可被用户或下一角色接住的问题、要求、威胁、条件或承诺。",
    ],
    dialoguePlain: [
      "- 回复要有明确立场或行动压力，避免只寒暄、等待或总结。",
      "- 不用强行升格冲突；紧扣当前场景目标和角色动机。",
    ],
  },
  selectable: true,
  order: 30,
};
