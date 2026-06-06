import generalTavernBackgroundUrl from "@/assets/tavern-backgrounds/general-lounge.jpg";
import tavernBackgroundUrl from "@/assets/tavern-backgrounds/rainy-tavern.jpg";
import wuxiaBackgroundUrl from "@/assets/tavern-backgrounds/wuxia-courtyard.jpg";
import type { VisualPresetDefinition, VisualPresetId } from "./types";

export type {
  TavernVisualPresetClassNames,
  VisualPresetDefinition,
  VisualPresetId,
  VisualPresetScope,
} from "./types";

export const DEFAULT_VISUAL_PRESET_ID: VisualPresetId = "general";

export const VISUAL_PRESETS: VisualPresetDefinition[] = [
  {
    id: "general",
    label: "通用",
    description: "清爽、克制，适合大多数叙事场景。",
    scopes: ["system", "tavern"],
    tavern: {
      page: "bg-background text-foreground",
      backgroundImage: generalTavernBackgroundUrl,
      backgroundOverlay: "linear-gradient(180deg,rgba(248,250,252,0.92),rgba(248,250,252,0.76) 38%,rgba(248,250,252,0.92)),radial-gradient(circle at 50% 34%,rgba(255,255,255,0.72),transparent 46%),linear-gradient(90deg,rgba(248,250,252,0.72),rgba(248,250,252,0.32) 24%,rgba(248,250,252,0.32) 76%,rgba(248,250,252,0.72))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-border/60 bg-background/78 backdrop-blur-xl",
      headerIcon: "border-teal-500/25 bg-teal-500/10 text-primary shadow-[0_10px_24px_-20px_rgb(13_148_136_/_0.65)]",
      scrollArea: "bg-background",
      sceneCard: "rounded-xl border-border/60 bg-background/72 shadow-[0_18px_50px_-38px_rgb(15_23_42_/_0.45)] backdrop-blur-xl",
      sceneBadge: "rounded-full bg-primary/10 text-primary ring-1 ring-primary/15",
      messageList: "max-w-3xl",
      narratorBubble: "rounded-full border-teal-700/12 bg-white/54 text-slate-500 shadow-[0_10px_28px_-24px_rgb(15_23_42_/_0.42)] ring-1 ring-white/55 backdrop-blur-xl",
      characterBubble: "rounded-[18px] rounded-tl-[6px] border-teal-800/14 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(232,247,244,0.78))] text-slate-900 shadow-[0_20px_46px_-34px_rgb(15_23_42_/_0.52)] ring-1 ring-white/70 backdrop-blur-xl",
      characterBubbleTail: "border-teal-800/14 bg-[#f2fbfa]",
      userBubble: "rounded-[18px] rounded-tr-[6px] border-teal-200/28 bg-[linear-gradient(135deg,#0f8b75,#0d9488)] text-white shadow-[0_18px_42px_-30px_rgb(13_148_136_/_0.82)] ring-1 ring-teal-100/25",
      userBubbleTail: "border-teal-200/28 bg-[#0d9488]",
      composer: "border-border/60 bg-background/72 backdrop-blur-xl",
      composerInput: "rounded-xl border-border/60 bg-background/82 shadow-[0_18px_42px_-36px_rgb(15_23_42_/_0.4)] backdrop-blur-xl",
      sidePanel: "border-border/60 bg-background/68 backdrop-blur-xl",
    },
  },
  {
    id: "wuxia",
    label: "武侠",
    description: "墨色、竹影和冷玉色调，适合江湖、门派和夜行故事。",
    scopes: ["tavern"],
    tavern: {
      page: "bg-[#f7faf7] text-[#15231d] dark:bg-[#07100d] dark:text-[#e8f2ed]",
      backgroundImage: wuxiaBackgroundUrl,
      backgroundOverlay: "linear-gradient(180deg,rgba(247,250,247,0.82),rgba(242,247,239,0.70) 42%,rgba(247,250,247,0.88)),radial-gradient(circle at 50% 34%,rgba(255,252,238,0.64),transparent 48%),linear-gradient(90deg,rgba(247,250,247,0.72),rgba(247,250,247,0.24) 24%,rgba(247,250,247,0.24) 76%,rgba(247,250,247,0.72))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-[#6f8f82]/28 bg-[#f7faf7]/74 backdrop-blur-xl dark:border-[#8db3a1]/22 dark:bg-[#07100d]/78",
      headerIcon: "border-[#6f8f82]/38 bg-[#e7f1eb]/80 text-[#08765c] shadow-[0_12px_28px_-22px_rgba(8,118,92,0.58)] dark:border-[#8db3a1]/24 dark:bg-[#10231c]/80 dark:text-[#67d0ad]",
      scrollArea: "bg-[#f7faf7] dark:bg-[#07100d]",
      sceneCard: "rounded-xl border-[#6f8f82]/30 bg-[#fbfdf9]/70 shadow-[0_18px_46px_-36px_rgba(17,55,43,0.46)] ring-1 ring-[#ffffff]/45 backdrop-blur-xl dark:border-[#8db3a1]/20 dark:bg-[#0b1713]/74 dark:ring-[#8db3a1]/10",
      sceneBadge: "rounded-full bg-[#08765c]/10 text-[#08765c] ring-1 ring-[#08765c]/16 dark:bg-[#67d0ad]/12 dark:text-[#67d0ad]",
      messageList: "max-w-3xl",
      narratorBubble: "rounded-full border-[#6f8f82]/24 bg-[#fffdf1]/46 text-[#4d655c] shadow-[0_12px_28px_-24px_rgba(20,50,38,0.34)] backdrop-blur-xl dark:border-[#8db3a1]/18 dark:bg-[#0b1713]/58 dark:text-[#aac5ba]",
      characterBubble: "rounded-[18px] rounded-tl-[4px] border-[#6f8f82]/38 bg-[linear-gradient(135deg,rgba(255,253,241,0.88),rgba(232,242,232,0.78))] text-[#182b23] shadow-[0_20px_48px_-36px_rgba(11,46,33,0.56)] ring-1 ring-[#ffffff]/50 backdrop-blur-xl dark:border-[#8db3a1]/24 dark:bg-[linear-gradient(135deg,rgba(16,35,28,0.88),rgba(10,23,19,0.80))] dark:text-[#e8f2ed] dark:ring-[#8db3a1]/10",
      characterBubbleTail: "border-[#6f8f82]/38 bg-[#f1f7ee] dark:border-[#8db3a1]/24 dark:bg-[#10231c]",
      userBubble: "rounded-[18px] rounded-tr-[4px] border-[#d6eadf]/28 bg-[linear-gradient(135deg,#0b7259,#1d9a75)] text-white shadow-[0_18px_42px_-30px_rgba(8,118,92,0.82)] ring-1 ring-[#d6eadf]/35 dark:border-[#76d4b6]/24 dark:bg-[linear-gradient(135deg,#1f9f7e,#14745f)] dark:text-[#06110d]",
      userBubbleTail: "border-[#d6eadf]/28 bg-[#1d9a75] dark:border-[#76d4b6]/24 dark:bg-[#14745f]",
      composer: "border-[#6f8f82]/26 bg-[#fbfdf9]/70 backdrop-blur-xl dark:border-[#8db3a1]/18 dark:bg-[#0b1713]/72",
      composerInput: "rounded-xl border-[#6f8f82]/32 bg-[#fbfdf9]/80 shadow-[0_16px_38px_-34px_rgba(20,50,38,0.42)] backdrop-blur-xl dark:border-[#8db3a1]/22 dark:bg-[#0f211a]/82",
      sidePanel: "border-[#6f8f82]/26 bg-[#edf6ef]/50 backdrop-blur-xl dark:border-[#8db3a1]/18 dark:bg-[#0b1713]/58",
    },
  },
  {
    id: "tavern",
    label: "酒馆",
    description: "暖灯、吧台和夜雨氛围，适合桌边对话和角色群像。",
    scopes: ["tavern"],
    tavern: {
      page: "bg-[#101614] text-[#f7f3e8]",
      backgroundImage: tavernBackgroundUrl,
      backgroundOverlay: "linear-gradient(180deg,rgba(8,13,12,0.80),rgba(16,22,20,0.76) 42%,rgba(10,13,12,0.94)),radial-gradient(circle at 50% 34%,rgba(16,22,20,0.54),rgba(16,22,20,0.18) 34%,transparent 58%),linear-gradient(90deg,rgba(8,13,12,0.62),rgba(8,13,12,0.18) 28%,rgba(8,13,12,0.18) 72%,rgba(8,13,12,0.62))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-[#d8b56d]/22 bg-[#101614]/78 backdrop-blur-xl",
      headerIcon: "border-[#d8b56d]/30 bg-[#17322c]/82 text-[#f5c56d] shadow-[0_12px_28px_-22px_rgba(245,197,109,0.62)]",
      scrollArea: "bg-[#101614]",
      sceneCard: "rounded-xl border-[#d8b56d]/22 bg-[#14211e]/68 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.78)] ring-1 ring-[#f5c56d]/8 backdrop-blur-xl",
      sceneBadge: "rounded-full bg-[#f5c56d]/12 text-[#f5c56d] ring-1 ring-[#f5c56d]/16",
      messageList: "max-w-3xl",
      narratorBubble: "rounded-full border-[#d8b56d]/18 bg-[#14211e]/46 text-[#d8d5c8] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.88)] ring-1 ring-[#f5c56d]/8 backdrop-blur-xl",
      characterBubble: "rounded-[18px] rounded-tl-[5px] border-[#d8b56d]/32 bg-[linear-gradient(135deg,rgba(38,52,42,0.90),rgba(24,40,36,0.82)_52%,rgba(29,24,18,0.86))] text-[#fff6df] shadow-[0_22px_56px_-34px_rgba(0,0,0,0.92)] ring-1 ring-[#f5c56d]/12 backdrop-blur-xl",
      characterBubbleTail: "border-[#d8b56d]/30 bg-[#20332d]",
      userBubble: "rounded-[18px] rounded-tr-[5px] border-[#8ee7d3]/24 bg-[linear-gradient(135deg,#0f8b75,#107566_54%,#0d5f53)] text-white shadow-[0_18px_46px_-30px_rgba(15,139,117,0.9)] ring-1 ring-[#8ee7d3]/24",
      userBubbleTail: "border-[#8ee7d3]/24 bg-[#107566]",
      composer: "border-[#d8b56d]/18 bg-[#101614]/74 backdrop-blur-xl",
      composerInput: "rounded-xl border-[#d8b56d]/22 bg-[#182824]/78 text-[#f7f3e8] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#aeb8ad] backdrop-blur-xl",
      sidePanel: "border-[#d8b56d]/18 bg-[#111c19]/62 text-[#f7f3e8] backdrop-blur-xl",
    },
  },
];

const visualPresetById = new Map(VISUAL_PRESETS.map((preset) => [preset.id, preset]));

export const normalizeVisualPresetId = (value: unknown): VisualPresetId => (
  value === "wuxia" || value === "tavern" || value === "general"
    ? value
    : DEFAULT_VISUAL_PRESET_ID
);

export const getVisualPreset = (id: unknown): VisualPresetDefinition =>
  visualPresetById.get(normalizeVisualPresetId(id)) ?? visualPresetById.get(DEFAULT_VISUAL_PRESET_ID)!;

export const TAVERN_SCENE_PRESET_OPTIONS = VISUAL_PRESETS.filter((preset) =>
  preset.scopes.includes("tavern")
);
