import type { TavernNarrativeStyle } from "../types";

export const webnovelHighDensityNarrativeStyle: TavernNarrativeStyle = {
  id: "webnovel-high-density",
  label: "爽文高密度",
  description: "提高事件、冲突、反馈和信息增量密度，避免连续空转。",
  bridgeAddendum: "叙事风格：爽文高密度。摘要优先保留冲突、收益、阶段反馈、未兑现期待和下一步钩子。",
  directorAddendum: [
    "爽文高密度：连续推进中不能只有气氛和等待；每轮至少产生一个可回应钩子、冲突升级、信息增量、关系变化或小型反馈。",
    "爽点间需要铺垫期待和阻力；释放后及时安排余波、奖励、代价或新的悬念。",
  ].join("\n"),
  characterAddendum: [
    "爽文高密度：角色回复应贡献目标、阻力、线索、态度变化、交易条件或新的可回应问题之一。",
    "不要只复述现状或空泛等待；结尾尽量留下动作、问题、承诺、威胁或未完成信息。",
  ].join("\n"),
};
