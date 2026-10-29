import { narrativeSimulator } from "../narrative/model";
import { validateNarrative } from "../narrative/validation";
import { simulatorKey, type ReadinessIssue } from "../shared/contracts";
import { modelReadiness } from "../turn/simulators";
import { directionDefinition } from "./catalog";
import type { AnyProject } from "./model";
export function projectReadiness(p: AnyProject): ReadinessIssue[] {
  const errors: ReadinessIssue[] =
    p.model.format === "gameplay-narrative-v1"
      ? validateNarrative(p.model).map((e) => ({
          ...e,
          view: "model" as const,
          nodeId:
            p.model.format === "gameplay-narrative-v1" &&
            p.model.nodes.some((n) => n.id === e.path)
              ? e.path
              : undefined,
        }))
      : modelReadiness(p.model, p.simulator);
  const direction = directionDefinition(p.direction);
  if (!direction && !p.simulator)
    for (let i = errors.length - 1; i >= 0; i--)
      if (errors[i].path === "模拟器") errors.splice(i, 1);
  if (!direction)
    errors.unshift({
      path: "玩法方向",
      message: "选择当前项目要验证的玩法方向。",
      view: "simulator",
    });
  else {
    if (direction.schema !== p.model.format)
      errors.unshift({
        path: "策划模型",
        message: "所选玩法方向不支持这份策划模型。",
        view: "simulator",
      });
    if (direction.gameType !== p.gameType)
      errors.unshift({
        path: "游戏类型",
        message: "玩法方向与项目类型不兼容，请选择该类型支持的方向。",
        view: "simulator",
      });
    if (simulatorKey(p.simulator) !== simulatorKey(direction.simulator))
      errors.unshift({
        path: "模拟器",
        message: "当前模拟器未实现所选玩法方向的规则体系，请重新选择方向。",
        view: "simulator",
      });
  }
  if (
    p.model.format === "gameplay-narrative-v1" &&
    !!p.direction &&
    simulatorKey(p.simulator) !== simulatorKey(narrativeSimulator)
  )
    errors.push({
      path: "模拟器",
      message: "分支叙事需要条件分支叙事模拟器 v1。",
      view: "simulator",
    });
  if (
    (p.gameType === "narrative") !==
    (p.model.format === "gameplay-narrative-v1")
  )
    errors.push({
      path: "策划模型",
      message: "策划模型与游戏类型不一致。",
      view: "simulator",
    });
  if (p.model.format === "gameplay-card-v1" && p.gameType !== "card")
    errors.push({
      path: "策划模型",
      message: "独立卡牌模型只能用于卡牌类型。",
      view: "simulator",
    });
  return errors;
}
