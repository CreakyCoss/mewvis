import type { TavernPlatformStyle } from "../types";

export const xiaohongshuTopicStoryPlatformStyle: TavernPlatformStyle = {
  id: "xiaohongshu-topic-story",
  label: "小红书话题故事",
  description: "话题性、共鸣感和可转发讨论点更强，场景短而具体。",
  bridgeAddendum: [
    "平台目标：小红书话题故事。摘要和压缩时优先保留话题冲突、共鸣细节、反差观点、可讨论的关系选择和生活化证据。",
    "平台偏好不改变呈现视角；只增强话题浓度、短场景密度和情绪共鸣。",
  ].join("\n"),
  directorAddendum: [
    "小红书话题故事偏好：尽快进入一个可讨论、可共鸣、可站队的具体生活场景。",
    "每轮尽量留下一个明确讨论点：关系边界、价值判断、身份反差、情绪委屈或现实选择。",
    "减少长世界观、复杂设定和连续铺垫；用短事件、短反应和具体细节制造传播感。",
  ].join("\n"),
  characterAddendum: [
    "小红书话题故事偏好：对白自然、短促、有态度，像现实聊天或当事人复盘，不要过度文学化。",
    "动作和细节要生活化、可截图传播；优先写能引发共鸣的瞬间，而不是宏大解释。",
    "角色表达可以锋利，但必须符合当前关系和场景，不要为了制造话题而无故失控。",
  ].join("\n"),
};
