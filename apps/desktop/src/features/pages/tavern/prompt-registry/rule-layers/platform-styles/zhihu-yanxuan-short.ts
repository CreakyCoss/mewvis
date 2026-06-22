import type { TavernPlatformStyle } from "../types";

export const zhihuYanxuanShortPlatformStyle: TavernPlatformStyle = {
  id: "zhihu-yanxuan-short",
  label: "知乎盐言短篇",
  description: "情绪拉扯、关系刺痛和反转治愈并重，适合强情绪短篇结构。",
  bridgeAddendum: [
    "平台目标：知乎盐言短篇。摘要和压缩时优先保留情绪债、关系伤口、误会/秘密、反转证据和结尾情绪落点。",
    "不要把平台偏好的第一人称倾向强加给呈现规则；视角仍以 presentation_profile 为准。",
  ].join("\n"),
  directorAddendum: [
    "知乎盐言短篇偏好：围绕情绪拉扯、关系误判、证据释放和认知反转组织推进。",
    "关键秘密不要一次说尽；线索分批出现，让误解、刺痛和期待形成连续曲线。",
    "爽点或治愈点应建立在前文情绪债之上，避免无铺垫的突然和解或突然翻盘。",
  ].join("\n"),
  characterAddendum: [
    "知乎盐言短篇偏好：对白保留潜台词和情绪刺点，角色不必把动机解释完整。",
    "伤害、迟疑、试探和自我保护要通过具体动作、停顿和短句体现。",
    "若呈现规则允许第一人称，可更贴近主观感受；否则仍遵守当前呈现规则。",
  ].join("\n"),
};
