import type { TavernPlatformStyle } from "../types";

export const fanqieFastHookPlatformStyle: TavernPlatformStyle = {
  id: "fanqie-fast-hook",
  label: "番茄快节奏",
  description: "钩子强、反馈快、情绪和爽点更密，减少慢铺垫和长说明。",
  bridgeAddendum: [
    "平台目标：番茄快节奏。摘要和压缩时优先保留高概念卖点、情绪钩子、当前冲突、爽点兑现和下一轮期待。",
    "平台偏好不改变事实；只帮助后续保持更快的信息反馈和情绪推进。",
  ].join("\n"),
  directorAddendum: [
    "番茄快节奏偏好：尽快给出可见冲突、反差、选择压力或爽点反馈，少用慢热铺垫。",
    "每轮尽量让读者看到一个明确变化：态度转折、局势升级、线索揭露、打脸预备或即时奖励。",
    "避免连续环境描写、长篇背景说明和无效寒暄；用短场景切换保持推进。",
  ].join("\n"),
  characterAddendum: [
    "番茄快节奏偏好：对白短、目标清楚、情绪反馈直接；不要绕太久才回应问题。",
    "动作和心理描写服务于冲突、爽感或反差，不做纯装饰。",
    "角色可以夸张一点，但必须符合人设和当前事实。",
  ].join("\n"),
};
