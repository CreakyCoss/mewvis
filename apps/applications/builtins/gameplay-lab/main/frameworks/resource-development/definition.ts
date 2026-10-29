import type { FrameworkDefinition } from "../contracts";
export const resourceDevelopmentDefinition = {
  id: "resource-development",
  gameType: "systems",
  name: "回合资源发展",
  description: "通过资源投入、周期产出和能力解锁推进目标。",
  simulator: {
    id: "resource-turns",
    version: 1,
  },
  schema: "gameplay-model-v1",
  scope:
    "支持资源支付、固定或按状态产出、能力前置和阈值目标；使用数值验证界面，不包含棋盘移动与资产归属。",
} satisfies FrameworkDefinition;
