import type { FrameworkId } from "./contracts";
import { frameworkCreation } from "./creation";
export function createFrameworkModel(
  id: FrameworkId,
  name: string,
  presetId?: string,
) {
  const registration = frameworkCreation(id);
  if (!registration) throw new Error("玩法框架不受支持。");
  if (
    presetId !== undefined &&
    !registration.presets.some((preset) => preset.id === presetId)
  )
    throw new Error("预设不受支持或与玩法框架不兼容。");
  return registration.create(name, presetId);
}
