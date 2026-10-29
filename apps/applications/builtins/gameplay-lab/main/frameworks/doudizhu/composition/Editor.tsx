import { CompositionEditor } from "../../composition/Editor";
import type { CompositionDesign } from "../../composition/design";
import type { ModuleEditorProps } from "../../composition/ui";
import type { DoudizhuModel } from "../model";
import {
  doudizhuLayout,
  doudizhuModules,
  doudizhuSkeleton,
  resolveDoudizhuComposition,
} from "./catalog";
import {
  applyDoudizhuPreset,
  doudizhuPresets,
  matchingDoudizhuPreset,
  setDoudizhuModuleEnabled,
} from "./presets";
const design: CompositionDesign<DoudizhuModel> = {
  skeletonName: doudizhuSkeleton.name,
  layoutName: doudizhuLayout.name,
  description:
    "牌型、叫分、阵营和胜负流程由骨架提供。模块同时加入编辑页面、运行能力和牌桌交互，所有方案使用相同的保存与回放流程。",
  presetEffect:
    "应用预设会替换当前出牌规则及启用模块的设置，项目名称和设计说明保留。",
  presets: doudizhuPresets,
  modules: doudizhuModules,
  resolve: resolveDoudizhuComposition,
  matchingPreset: matchingDoudizhuPreset,
  applyPreset: applyDoudizhuPreset,
  setModuleEnabled: setDoudizhuModuleEnabled,
};
export function DoudizhuCompositionEditor(
  props: ModuleEditorProps<DoudizhuModel>,
) {
  return <CompositionEditor {...props} definition={design} />;
}
