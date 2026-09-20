import generalTavernBackgroundUrl from "@/assets/backgrounds/general-lounge.jpg";
import tavernBackgroundUrl from "@/assets/backgrounds/rainy-tavern.jpg";
import wuxiaBackgroundUrl from "@/assets/backgrounds/wuxia-courtyard.jpg";
import type { VisualPresetDefinition, VisualPresetId } from "./types";

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
      backgroundOverlay:
        "linear-gradient(180deg,color-mix(in srgb,var(--background) 92%,transparent),color-mix(in srgb,var(--background) 76%,transparent) 38%,color-mix(in srgb,var(--background) 92%,transparent)),radial-gradient(circle at 50% 34%,color-mix(in srgb,var(--card) 72%,transparent),transparent 46%)",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-border/60 bg-background/78 backdrop-blur-xl",
      headerIcon:
        "border-primary-border bg-primary-subtle text-primary shadow-[var(--shadow-primary)]",
      scrollArea: "bg-background",
      sceneCard:
        "rounded-xl border-border/60 bg-background/72 shadow-[var(--shadow-floating)] backdrop-blur-xl",
      sceneBadge:
        "rounded-full bg-primary/10 text-primary ring-1 ring-primary/15",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-full border-border/60 bg-card/54 text-muted-foreground shadow-[var(--shadow-card)] ring-1 ring-border/55 backdrop-blur-xl",
      characterBubble:
        "rounded-[18px] rounded-tl-[6px] border-border bg-card/94 text-card-foreground shadow-[var(--shadow-floating)] ring-1 ring-border/70 backdrop-blur-xl",
      characterBubbleTail: "border-border bg-card",
      userBubble:
        "rounded-[18px] rounded-tr-[6px] border-primary-border bg-primary text-primary-foreground shadow-[var(--shadow-primary)] ring-1 ring-primary/25",
      userBubbleTail: "border-primary-border bg-primary",
      composer: "border-border/60 bg-background/72 backdrop-blur-xl",
      composerInput:
        "rounded-xl border-border/60 bg-background/82 shadow-[var(--shadow-composer)] backdrop-blur-xl",
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
      backgroundOverlay:
        "linear-gradient(180deg,rgba(247,250,247,0.82),rgba(242,247,239,0.70) 42%,rgba(247,250,247,0.88)),radial-gradient(circle at 50% 34%,rgba(255,252,238,0.64),transparent 48%),linear-gradient(90deg,rgba(247,250,247,0.72),rgba(247,250,247,0.24) 24%,rgba(247,250,247,0.24) 76%,rgba(247,250,247,0.72))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-[#6f8f82]/28 bg-[#f7faf7]/74 backdrop-blur-xl dark:border-[#8db3a1]/22 dark:bg-[#07100d]/78",
      headerIcon:
        "border-[#6f8f82]/38 bg-[#e7f1eb]/80 text-[#08765c] shadow-[0_12px_28px_-22px_rgba(8,118,92,0.58)] dark:border-[#8db3a1]/24 dark:bg-[#10231c]/80 dark:text-[#67d0ad]",
      scrollArea: "bg-[#f7faf7] dark:bg-[#07100d]",
      sceneCard:
        "rounded-xl border-[#6f8f82]/30 bg-[#fbfdf9]/70 shadow-[0_18px_46px_-36px_rgba(17,55,43,0.46)] ring-1 ring-[#ffffff]/45 backdrop-blur-xl dark:border-[#8db3a1]/20 dark:bg-[#0b1713]/74 dark:ring-[#8db3a1]/10",
      sceneBadge:
        "rounded-full bg-[#08765c]/10 text-[#08765c] ring-1 ring-[#08765c]/16 dark:bg-[#67d0ad]/12 dark:text-[#67d0ad]",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-full border-[#6f8f82]/24 bg-[#fffdf1]/46 text-[#4d655c] shadow-[0_12px_28px_-24px_rgba(20,50,38,0.34)] backdrop-blur-xl dark:border-[#8db3a1]/18 dark:bg-[#0b1713]/58 dark:text-[#aac5ba]",
      characterBubble:
        "rounded-[18px] rounded-tl-[4px] border-[#6f8f82]/38 bg-[linear-gradient(135deg,rgba(255,253,241,0.88),rgba(232,242,232,0.78))] text-[#182b23] shadow-[0_20px_48px_-36px_rgba(11,46,33,0.56)] ring-1 ring-[#ffffff]/50 backdrop-blur-xl dark:border-[#8db3a1]/24 dark:bg-[linear-gradient(135deg,rgba(16,35,28,0.88),rgba(10,23,19,0.80))] dark:text-[#e8f2ed] dark:ring-[#8db3a1]/10",
      characterBubbleTail: "border-[#6f8f82]/38 bg-[#f1f7ee] dark:border-[#8db3a1]/24 dark:bg-[#10231c]",
      userBubble:
        "rounded-[18px] rounded-tr-[4px] border-[#d6eadf]/28 bg-[linear-gradient(135deg,#0b7259,#1d9a75)] text-white shadow-[0_18px_42px_-30px_rgba(8,118,92,0.82)] ring-1 ring-[#d6eadf]/35 dark:border-[#76d4b6]/24 dark:bg-[linear-gradient(135deg,#1f9f7e,#14745f)] dark:text-[#06110d]",
      userBubbleTail: "border-[#d6eadf]/28 bg-[#1d9a75] dark:border-[#76d4b6]/24 dark:bg-[#14745f]",
      composer: "border-[#6f8f82]/26 bg-[#fbfdf9]/70 backdrop-blur-xl dark:border-[#8db3a1]/18 dark:bg-[#0b1713]/72",
      composerInput:
        "rounded-xl border-[#6f8f82]/32 bg-[#fbfdf9]/80 shadow-[0_16px_38px_-34px_rgba(20,50,38,0.42)] backdrop-blur-xl dark:border-[#8db3a1]/22 dark:bg-[#0f211a]/82",
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
      backgroundOverlay:
        "linear-gradient(180deg,rgba(8,13,12,0.80),rgba(16,22,20,0.76) 42%,rgba(10,13,12,0.94)),radial-gradient(circle at 50% 34%,rgba(16,22,20,0.54),rgba(16,22,20,0.18) 34%,transparent 58%),linear-gradient(90deg,rgba(8,13,12,0.62),rgba(8,13,12,0.18) 28%,rgba(8,13,12,0.18) 72%,rgba(8,13,12,0.62))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-[#d8b56d]/22 bg-[#101614]/78 backdrop-blur-xl",
      headerIcon:
        "border-[#d8b56d]/30 bg-[#17322c]/82 text-[#f5c56d] shadow-[0_12px_28px_-22px_rgba(245,197,109,0.62)]",
      scrollArea: "bg-[#101614]",
      sceneCard:
        "rounded-xl border-[#d8b56d]/22 bg-[#14211e]/68 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.78)] ring-1 ring-[#f5c56d]/8 backdrop-blur-xl",
      sceneBadge: "rounded-full bg-[#f5c56d]/12 text-[#f5c56d] ring-1 ring-[#f5c56d]/16",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-full border-[#d8b56d]/18 bg-[#14211e]/46 text-[#d8d5c8] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.88)] ring-1 ring-[#f5c56d]/8 backdrop-blur-xl",
      characterBubble:
        "rounded-[18px] rounded-tl-[5px] border-[#d8b56d]/32 bg-[linear-gradient(135deg,rgba(38,52,42,0.90),rgba(24,40,36,0.82)_52%,rgba(29,24,18,0.86))] text-[#fff6df] shadow-[0_22px_56px_-34px_rgba(0,0,0,0.92)] ring-1 ring-[#f5c56d]/12 backdrop-blur-xl",
      characterBubbleTail: "border-[#d8b56d]/30 bg-[#20332d]",
      userBubble:
        "rounded-[18px] rounded-tr-[5px] border-[#8ee7d3]/24 bg-[linear-gradient(135deg,#0f8b75,#107566_54%,#0d5f53)] text-white shadow-[0_18px_46px_-30px_rgba(15,139,117,0.9)] ring-1 ring-[#8ee7d3]/24",
      userBubbleTail: "border-[#8ee7d3]/24 bg-[#107566]",
      composer: "border-[#d8b56d]/18 bg-[#101614]/74 backdrop-blur-xl",
      composerInput:
        "rounded-xl border-[#d8b56d]/22 bg-[#182824]/78 text-[#f7f3e8] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#aeb8ad] backdrop-blur-xl",
      sidePanel: "border-[#d8b56d]/18 bg-[#111c19]/62 text-[#f7f3e8] backdrop-blur-xl",
    },
  },
  {
    id: "modern",
    label: "现代",
    description: "明亮玻璃、访谈室和城市办公感，适合都市、职场和现实题材。",
    scopes: ["tavern"],
    tavern: {
      page: "bg-[#f8fafc] text-[#172033] dark:bg-[#0d1117] dark:text-[#eff6ff]",
      backgroundImage: generalTavernBackgroundUrl,
      backgroundOverlay:
        "linear-gradient(180deg,rgba(248,250,252,0.92),rgba(239,246,250,0.74) 40%,rgba(248,250,252,0.92)),linear-gradient(90deg,rgba(248,250,252,0.78),rgba(248,250,252,0.30) 28%,rgba(248,250,252,0.30) 72%,rgba(248,250,252,0.78))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-[#cbd5e1]/70 bg-[#f8fafc]/78 backdrop-blur-xl dark:border-[#334155]/70 dark:bg-[#0d1117]/82",
      headerIcon:
        "border-[#38bdf8]/28 bg-[#e0f2fe]/72 text-[#0369a1] shadow-[0_10px_24px_-20px_rgba(14,165,233,0.64)] dark:border-[#7dd3fc]/24 dark:bg-[#082f49]/70 dark:text-[#7dd3fc]",
      scrollArea: "bg-[#f8fafc] dark:bg-[#0d1117]",
      sceneCard:
        "rounded-xl border-[#cbd5e1]/70 bg-[#ffffff]/72 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.44)] ring-1 ring-[#ffffff]/60 backdrop-blur-xl dark:border-[#334155]/60 dark:bg-[#111827]/74 dark:ring-[#7dd3fc]/8",
      sceneBadge:
        "rounded-full bg-[#0ea5e9]/10 text-[#0369a1] ring-1 ring-[#0ea5e9]/18 dark:bg-[#7dd3fc]/12 dark:text-[#7dd3fc]",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-full border-[#cbd5e1]/58 bg-[#ffffff]/56 text-[#64748b] shadow-[0_10px_26px_-24px_rgba(15,23,42,0.38)] ring-1 ring-[#ffffff]/60 backdrop-blur-xl dark:border-[#334155]/54 dark:bg-[#111827]/58 dark:text-[#cbd5e1]",
      characterBubble:
        "rounded-[18px] rounded-tl-[6px] border-[#cbd5e1]/72 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(239,246,255,0.82))] text-[#172033] shadow-[0_18px_42px_-34px_rgba(15,23,42,0.48)] ring-1 ring-[#ffffff]/70 backdrop-blur-xl dark:border-[#334155]/62 dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.92),rgba(15,23,42,0.84))] dark:text-[#eff6ff] dark:ring-[#7dd3fc]/8",
      characterBubbleTail: "border-[#cbd5e1]/72 bg-[#f4f8ff] dark:border-[#334155]/62 dark:bg-[#1e293b]",
      userBubble:
        "rounded-[18px] rounded-tr-[6px] border-[#bae6fd]/30 bg-[linear-gradient(135deg,#0284c7,#0f766e)] text-white shadow-[0_16px_40px_-30px_rgba(2,132,199,0.76)] ring-1 ring-[#bae6fd]/26",
      userBubbleTail: "border-[#bae6fd]/30 bg-[#0f766e]",
      composer: "border-[#cbd5e1]/66 bg-[#f8fafc]/74 backdrop-blur-xl dark:border-[#334155]/60 dark:bg-[#0d1117]/78",
      composerInput:
        "rounded-xl border-[#cbd5e1]/76 bg-[#ffffff]/82 shadow-[0_16px_38px_-34px_rgba(15,23,42,0.36)] backdrop-blur-xl dark:border-[#334155]/62 dark:bg-[#111827]/84",
      sidePanel: "border-[#cbd5e1]/62 bg-[#f1f5f9]/58 backdrop-blur-xl dark:border-[#334155]/58 dark:bg-[#111827]/62",
    },
  },
  {
    id: "mystery",
    label: "悬疑",
    description: "冷雨、档案灯和低对比暗色，适合调查、怪谈和 noir 氛围。",
    scopes: ["tavern"],
    tavern: {
      page: "bg-[#101216] text-[#f4f1e8]",
      backgroundImage: tavernBackgroundUrl,
      backgroundOverlay:
        "linear-gradient(180deg,rgba(9,12,17,0.84),rgba(17,24,39,0.76) 42%,rgba(8,10,14,0.94)),linear-gradient(90deg,rgba(8,10,14,0.70),rgba(8,10,14,0.22) 30%,rgba(8,10,14,0.22) 70%,rgba(8,10,14,0.70))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-[#9ca3af]/20 bg-[#101216]/80 backdrop-blur-xl",
      headerIcon: "border-[#facc15]/28 bg-[#27251b]/78 text-[#fde68a] shadow-[0_12px_28px_-22px_rgba(250,204,21,0.58)]",
      scrollArea: "bg-[#101216]",
      sceneCard:
        "rounded-xl border-[#9ca3af]/22 bg-[#141922]/70 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.84)] ring-1 ring-[#fde68a]/8 backdrop-blur-xl",
      sceneBadge: "rounded-full bg-[#fde68a]/12 text-[#fde68a] ring-1 ring-[#fde68a]/16",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-full border-[#9ca3af]/18 bg-[#141922]/54 text-[#d1d5db] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.88)] ring-1 ring-[#fde68a]/8 backdrop-blur-xl",
      characterBubble:
        "rounded-[18px] rounded-tl-[5px] border-[#9ca3af]/24 bg-[linear-gradient(135deg,rgba(31,41,55,0.92),rgba(17,24,39,0.86))] text-[#f9fafb] shadow-[0_22px_54px_-34px_rgba(0,0,0,0.92)] ring-1 ring-[#fde68a]/10 backdrop-blur-xl",
      characterBubbleTail: "border-[#9ca3af]/24 bg-[#1f2937]",
      userBubble:
        "rounded-[18px] rounded-tr-[5px] border-[#fef3c7]/22 bg-[linear-gradient(135deg,#92400e,#334155)] text-white shadow-[0_18px_44px_-30px_rgba(146,64,14,0.78)] ring-1 ring-[#fef3c7]/18",
      userBubbleTail: "border-[#fef3c7]/22 bg-[#334155]",
      composer: "border-[#9ca3af]/18 bg-[#101216]/76 backdrop-blur-xl",
      composerInput:
        "rounded-xl border-[#9ca3af]/22 bg-[#151b24]/80 text-[#f4f1e8] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#a7adb7] backdrop-blur-xl",
      sidePanel: "border-[#9ca3af]/18 bg-[#111720]/64 text-[#f4f1e8] backdrop-blur-xl",
    },
  },
  {
    id: "scifi",
    label: "科幻",
    description: "深空屏幕、冷光和高对比界面，适合星舰、赛博和未来都市。",
    scopes: ["tavern"],
    tavern: {
      page: "bg-[#07111d] text-[#eef8ff]",
      backgroundImage: generalTavernBackgroundUrl,
      backgroundOverlay:
        "linear-gradient(180deg,rgba(2,6,23,0.88),rgba(8,24,39,0.78) 42%,rgba(2,6,23,0.94)),linear-gradient(110deg,rgba(34,211,238,0.16),rgba(34,211,238,0.02) 34%,rgba(245,158,11,0.08) 74%,rgba(2,6,23,0.48))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-[#22d3ee]/24 bg-[#07111d]/80 backdrop-blur-xl",
      headerIcon: "border-[#22d3ee]/34 bg-[#083344]/82 text-[#67e8f9] shadow-[0_12px_28px_-22px_rgba(34,211,238,0.68)]",
      scrollArea: "bg-[#07111d]",
      sceneCard:
        "rounded-xl border-[#22d3ee]/26 bg-[#081827]/70 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.84)] ring-1 ring-[#67e8f9]/10 backdrop-blur-xl",
      sceneBadge: "rounded-full bg-[#67e8f9]/12 text-[#67e8f9] ring-1 ring-[#67e8f9]/18",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-full border-[#22d3ee]/22 bg-[#071827]/54 text-[#b9d9e7] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.88)] ring-1 ring-[#67e8f9]/10 backdrop-blur-xl",
      characterBubble:
        "rounded-[18px] rounded-tl-[4px] border-[#22d3ee]/32 bg-[linear-gradient(135deg,rgba(14,116,144,0.34),rgba(15,23,42,0.90))] text-[#eef8ff] shadow-[0_22px_56px_-34px_rgba(0,0,0,0.92)] ring-1 ring-[#67e8f9]/14 backdrop-blur-xl",
      characterBubbleTail: "border-[#22d3ee]/30 bg-[#0b2235]",
      userBubble:
        "rounded-[18px] rounded-tr-[4px] border-[#fbbf24]/24 bg-[linear-gradient(135deg,#0891b2,#7c3aed_58%,#111827)] text-white shadow-[0_18px_46px_-30px_rgba(34,211,238,0.84)] ring-1 ring-[#fbbf24]/18",
      userBubbleTail: "border-[#fbbf24]/24 bg-[#7c3aed]",
      composer: "border-[#22d3ee]/20 bg-[#07111d]/76 backdrop-blur-xl",
      composerInput:
        "rounded-xl border-[#22d3ee]/26 bg-[#0b1f33]/82 text-[#eef8ff] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#96b7c8] backdrop-blur-xl",
      sidePanel: "border-[#22d3ee]/20 bg-[#081827]/64 text-[#eef8ff] backdrop-blur-xl",
    },
  },
  {
    id: "fantasy",
    label: "奇幻",
    description: "森林、古籍和微光魔法感，适合王国、预言和冒险旅队。",
    scopes: ["tavern"],
    tavern: {
      page: "bg-[#101813] text-[#fbf6df] dark:bg-[#07100d] dark:text-[#fbf6df]",
      backgroundImage: wuxiaBackgroundUrl,
      backgroundOverlay:
        "linear-gradient(180deg,rgba(16,24,19,0.76),rgba(26,39,29,0.64) 42%,rgba(12,18,14,0.88)),linear-gradient(90deg,rgba(12,18,14,0.64),rgba(12,18,14,0.16) 26%,rgba(12,18,14,0.16) 74%,rgba(12,18,14,0.64))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-[#d6b661]/24 bg-[#101813]/78 backdrop-blur-xl",
      headerIcon:
        "border-[#d6b661]/34 bg-[#1f3427]/80 text-[#f6d77a] shadow-[0_12px_28px_-22px_rgba(246,215,122,0.62)]",
      scrollArea: "bg-[#101813]",
      sceneCard:
        "rounded-xl border-[#d6b661]/24 bg-[#13211a]/70 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.78)] ring-1 ring-[#f6d77a]/10 backdrop-blur-xl",
      sceneBadge: "rounded-full bg-[#f6d77a]/12 text-[#f6d77a] ring-1 ring-[#f6d77a]/16",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-full border-[#d6b661]/20 bg-[#13211a]/50 text-[#ddd6bd] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.86)] ring-1 ring-[#f6d77a]/8 backdrop-blur-xl",
      characterBubble:
        "rounded-[18px] rounded-tl-[5px] border-[#d6b661]/30 bg-[linear-gradient(135deg,rgba(47,70,44,0.88),rgba(18,35,28,0.84))] text-[#fff8df] shadow-[0_22px_56px_-34px_rgba(0,0,0,0.90)] ring-1 ring-[#f6d77a]/12 backdrop-blur-xl",
      characterBubbleTail: "border-[#d6b661]/30 bg-[#223726]",
      userBubble:
        "rounded-[18px] rounded-tr-[5px] border-[#c4b5fd]/24 bg-[linear-gradient(135deg,#166534,#7c2d12)] text-white shadow-[0_18px_44px_-30px_rgba(22,101,52,0.84)] ring-1 ring-[#f6d77a]/18",
      userBubbleTail: "border-[#c4b5fd]/24 bg-[#7c2d12]",
      composer: "border-[#d6b661]/20 bg-[#101813]/76 backdrop-blur-xl",
      composerInput:
        "rounded-xl border-[#d6b661]/24 bg-[#17251d]/82 text-[#fbf6df] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#b8b09a] backdrop-blur-xl",
      sidePanel: "border-[#d6b661]/20 bg-[#111d17]/64 text-[#fbf6df] backdrop-blur-xl",
    },
  },
  {
    id: "oracle",
    label: "占卜",
    description: "烛影、牌阵和旧纸纹理，适合命理、梦境和神秘学叙事。",
    scopes: ["tavern"],
    tavern: {
      page: "bg-[#14110f] text-[#fbf3dd]",
      backgroundImage: tavernBackgroundUrl,
      backgroundOverlay:
        "linear-gradient(180deg,rgba(20,17,15,0.82),rgba(35,25,22,0.70) 42%,rgba(12,10,9,0.92)),linear-gradient(100deg,rgba(180,83,9,0.14),rgba(20,17,15,0.10) 36%,rgba(13,148,136,0.10) 76%,rgba(20,17,15,0.48))",
      backgroundPosition: "center",
      backgroundSize: "cover",
      header: "border-[#e7c978]/24 bg-[#14110f]/80 backdrop-blur-xl",
      headerIcon:
        "border-[#e7c978]/34 bg-[#33251d]/82 text-[#f7d779] shadow-[0_12px_28px_-22px_rgba(247,215,121,0.64)]",
      scrollArea: "bg-[#14110f]",
      sceneCard:
        "rounded-xl border-[#e7c978]/24 bg-[#1f1713]/70 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.82)] ring-1 ring-[#f7d779]/10 backdrop-blur-xl",
      sceneBadge: "rounded-full bg-[#f7d779]/12 text-[#f7d779] ring-1 ring-[#f7d779]/16",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-full border-[#e7c978]/20 bg-[#1f1713]/50 text-[#ded2b8] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.86)] ring-1 ring-[#f7d779]/8 backdrop-blur-xl",
      characterBubble:
        "rounded-[18px] rounded-tl-[5px] border-[#e7c978]/30 bg-[linear-gradient(135deg,rgba(67,45,34,0.88),rgba(31,23,19,0.86))] text-[#fff6df] shadow-[0_22px_56px_-34px_rgba(0,0,0,0.90)] ring-1 ring-[#f7d779]/12 backdrop-blur-xl",
      characterBubbleTail: "border-[#e7c978]/30 bg-[#2d211a]",
      userBubble:
        "rounded-[18px] rounded-tr-[5px] border-[#99f6e4]/20 bg-[linear-gradient(135deg,#854d0e,#0f766e)] text-white shadow-[0_18px_44px_-30px_rgba(133,77,14,0.82)] ring-1 ring-[#f7d779]/18",
      userBubbleTail: "border-[#99f6e4]/20 bg-[#0f766e]",
      composer: "border-[#e7c978]/20 bg-[#14110f]/76 backdrop-blur-xl",
      composerInput:
        "rounded-xl border-[#e7c978]/24 bg-[#241b16]/82 text-[#fbf3dd] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#baaf99] backdrop-blur-xl",
      sidePanel: "border-[#e7c978]/20 bg-[#1a130f]/64 text-[#fbf3dd] backdrop-blur-xl",
    },
  },
];

const visualPresetById = new Map(VISUAL_PRESETS.map((preset) => [preset.id, preset]));

const visualPresetIds = new Set(VISUAL_PRESETS.map((preset) => preset.id));

export const normalizeVisualPresetId = (value: unknown): VisualPresetId =>
  typeof value === "string" && visualPresetIds.has(value as VisualPresetId)
    ? (value as VisualPresetId)
    : DEFAULT_VISUAL_PRESET_ID;

export const getVisualPreset = (id: unknown): VisualPresetDefinition =>
  visualPresetById.get(normalizeVisualPresetId(id)) ?? visualPresetById.get(DEFAULT_VISUAL_PRESET_ID)!;

export const TAVERN_SCENE_PRESET_OPTIONS = VISUAL_PRESETS.filter((preset) => preset.scopes.includes("tavern"));
