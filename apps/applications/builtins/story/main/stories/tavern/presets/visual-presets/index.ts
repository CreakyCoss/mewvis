import generalTavernBackgroundUrl from "@/assets/backgrounds/general-lounge.jpg";
import tavernBackgroundUrl from "@/assets/backgrounds/rainy-tavern.jpg";
import wuxiaBackgroundUrl from "@/assets/backgrounds/wuxia-courtyard.jpg";
import modernBackgroundUrl from "@/assets/backgrounds/modern-city-lounge.jpg";
import mysteryBackgroundUrl from "@/assets/backgrounds/mystery-archive.jpg";
import scifiBackgroundUrl from "@/assets/backgrounds/scifi-observatory.jpg";
import fantasyBackgroundUrl from "@/assets/backgrounds/fantasy-library.jpg";
import oracleBackgroundUrl from "@/assets/backgrounds/oracle-sanctum.jpg";
import type { VisualPresetDefinition, VisualPresetId } from "./types";
import "./themes.css";

export const DEFAULT_VISUAL_PRESET_ID: VisualPresetId = "general";

export const VISUAL_PRESETS: VisualPresetDefinition[] = [
  {
    id: "general",
    label: "通用",
    description: "薄雾书房、纸白与灰蓝，适合日常对话和通用叙事。",
    scopes: ["system", "tavern"],
    tavern: {
      page: "tavern-scene tavern-scene-general bg-background text-foreground",
      backgroundImage: generalTavernBackgroundUrl,
      backgroundOverlay: "var(--tavern-background-overlay)",
      backgroundPosition: "left center",
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
      page: "tavern-scene tavern-scene-wuxia bg-[#f7faf7] text-[#15231d] dark:bg-[#07100d] dark:text-[#e8f2ed]",
      backgroundImage: wuxiaBackgroundUrl,
      backgroundOverlay: "var(--tavern-background-overlay)",
      backgroundPosition: "18% center",
      backgroundSize: "cover",
      header: "border-[#6f8f82]/28 bg-[#f7faf7]/74 backdrop-blur-xl dark:border-[#8db3a1]/22 dark:bg-[#07100d]/78",
      headerIcon:
        "border-[#6f8f82]/38 bg-[#e7f1eb]/80 text-[#08765c] shadow-[0_12px_28px_-22px_rgba(8,118,92,0.58)] dark:border-[#8db3a1]/24 dark:bg-[#10231c]/80 dark:text-[#67d0ad]",
      scrollArea: "bg-[#f7faf7] dark:bg-[#07100d]",
      sceneCard:
        "rounded-lg border-[#6f8f82]/30 bg-[#fbfdf9]/70 shadow-[0_18px_46px_-36px_rgba(17,55,43,0.46)] ring-1 ring-[#ffffff]/45 backdrop-blur-xl dark:border-[#8db3a1]/20 dark:bg-[#0b1713]/74 dark:ring-[#8db3a1]/10",
      sceneBadge:
        "rounded-full bg-[#08765c]/10 text-[#08765c] ring-1 ring-[#08765c]/16 dark:bg-[#67d0ad]/12 dark:text-[#67d0ad]",
      messageList: "max-w-3xl font-serif",
      narratorBubble:
        "font-serif rounded-md border-[#6f8f82]/24 bg-[#fffdf1]/46 text-[#4d655c] shadow-[0_12px_28px_-24px_rgba(20,50,38,0.34)] backdrop-blur-xl dark:border-[#8db3a1]/18 dark:bg-[#0b1713]/58 dark:text-[#aac5ba]",
      characterBubble:
        "rounded-[14px] rounded-tl-[3px] border-[#6f8f82]/38 bg-[linear-gradient(135deg,rgba(255,253,241,0.88),rgba(232,242,232,0.78))] text-[#182b23] shadow-[0_20px_48px_-36px_rgba(11,46,33,0.56)] ring-1 ring-[#ffffff]/50 backdrop-blur-xl dark:border-[#8db3a1]/24 dark:bg-[linear-gradient(135deg,rgba(16,35,28,0.88),rgba(10,23,19,0.80))] dark:text-[#e8f2ed] dark:ring-[#8db3a1]/10",
      characterBubbleTail: "border-[#6f8f82]/38 bg-[#f1f7ee] dark:border-[#8db3a1]/24 dark:bg-[#10231c]",
      userBubble:
        "rounded-[14px] rounded-tr-[3px] border-[#d6eadf]/28 bg-[linear-gradient(135deg,#0b7259,#168465)] text-white shadow-[0_18px_42px_-30px_rgba(8,118,92,0.82)] ring-1 ring-[#d6eadf]/35 dark:border-[#76d4b6]/24 dark:bg-[linear-gradient(135deg,#67d0ad,#43b891)] dark:text-[#06110d]",
      userBubbleTail: "border-[#d6eadf]/28 bg-[#168465] dark:border-[#76d4b6]/24 dark:bg-[#43b891]",
      composer: "border-[#6f8f82]/26 bg-[#fbfdf9]/70 backdrop-blur-xl dark:border-[#8db3a1]/18 dark:bg-[#0b1713]/72",
      composerInput:
        "rounded-lg border-[#6f8f82]/32 bg-[#fbfdf9]/80 shadow-[0_16px_38px_-34px_rgba(20,50,38,0.42)] backdrop-blur-xl dark:border-[#8db3a1]/22 dark:bg-[#0f211a]/82",
      sidePanel: "border-[#6f8f82]/26 bg-[#edf6ef]/50 backdrop-blur-xl dark:border-[#8db3a1]/18 dark:bg-[#0b1713]/58",
    },
  },
  {
    id: "tavern",
    label: "酒馆",
    description: "暖灯、吧台和夜雨氛围，适合桌边对话和角色群像。",
    scopes: ["tavern"],
    tavern: {
      page: "tavern-scene tavern-scene-tavern bg-[#1c1410] text-[#f7f3e8]",
      backgroundImage: tavernBackgroundUrl,
      backgroundOverlay: "var(--tavern-background-overlay)",
      backgroundPosition: "left center",
      backgroundSize: "cover",
      header: "border-[#d8b56d]/22 bg-[#1c1410]/78 backdrop-blur-xl",
      headerIcon:
        "border-[#d8b56d]/30 bg-[#342219]/82 text-[#f5c56d] shadow-[0_12px_28px_-22px_rgba(245,197,109,0.62)]",
      scrollArea: "bg-[#1c1410]",
      sceneCard:
        "rounded-xl border-[#d8b56d]/22 bg-[#2a1d16]/68 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.78)] ring-1 ring-[#f5c56d]/8 backdrop-blur-xl",
      sceneBadge: "rounded-full bg-[#f5c56d]/12 text-[#f5c56d] ring-1 ring-[#f5c56d]/16",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-full border-[#d8b56d]/18 bg-[#2a1d16]/46 text-[#d8d5c8] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.88)] ring-1 ring-[#f5c56d]/8 backdrop-blur-xl",
      characterBubble:
        "rounded-[16px] rounded-tl-[5px] border-[#d8b56d]/32 bg-[linear-gradient(135deg,rgba(52,36,25,0.90),rgba(37,25,20,0.82)_52%,rgba(29,24,18,0.86))] text-[#fff6df] shadow-[0_22px_56px_-34px_rgba(0,0,0,0.92)] ring-1 ring-[#f5c56d]/12 backdrop-blur-xl",
      characterBubbleTail: "border-[#d8b56d]/30 bg-[#3a281d]",
      userBubble:
        "rounded-[16px] rounded-tr-[5px] border-[#edb77f]/24 bg-[linear-gradient(135deg,#a45b2c,#794423_54%,#65351f)] text-white shadow-[0_18px_46px_-30px_rgba(164,91,44,0.9)] ring-1 ring-[#edb77f]/24",
      userBubbleTail: "border-[#edb77f]/24 bg-[#794423]",
      composer: "border-[#d8b56d]/18 bg-[#1c1410]/74 backdrop-blur-xl",
      composerInput:
        "rounded-xl border-[#d8b56d]/22 bg-[#2e2018]/78 text-[#f7f3e8] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#aeb8ad] backdrop-blur-xl",
      sidePanel: "border-[#d8b56d]/18 bg-[#271a13]/62 text-[#f7f3e8] backdrop-blur-xl",
    },
  },
  {
    id: "modern",
    label: "现代",
    description: "城市天际线、玻璃与冷蓝，适合都市、职场和现实题材。",
    scopes: ["tavern"],
    tavern: {
      page: "tavern-scene tavern-scene-modern bg-[#f8fafc] text-[#172033] dark:bg-[#0d1117] dark:text-[#eff6ff]",
      backgroundImage: modernBackgroundUrl,
      backgroundOverlay: "var(--tavern-background-overlay)",
      backgroundPosition: "22% center",
      backgroundSize: "cover",
      header: "border-[#cbd5e1]/70 bg-[#f8fafc]/78 backdrop-blur-xl dark:border-[#334155]/70 dark:bg-[#0d1117]/82",
      headerIcon:
        "border-[#38bdf8]/28 bg-[#e0f2fe]/72 text-[#0369a1] shadow-[0_10px_24px_-20px_rgba(14,165,233,0.64)] dark:border-[#7dd3fc]/24 dark:bg-[#082f49]/70 dark:text-[#7dd3fc]",
      scrollArea: "bg-[#f8fafc] dark:bg-[#0d1117]",
      sceneCard:
        "rounded-lg border-[#cbd5e1]/70 bg-[#ffffff]/72 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.44)] ring-1 ring-[#ffffff]/60 backdrop-blur-xl dark:border-[#334155]/60 dark:bg-[#111827]/74 dark:ring-[#7dd3fc]/8",
      sceneBadge:
        "rounded-full bg-[#0ea5e9]/10 text-[#0369a1] ring-1 ring-[#0ea5e9]/18 dark:bg-[#7dd3fc]/12 dark:text-[#7dd3fc]",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-md border-[#cbd5e1]/58 bg-[#ffffff]/56 text-[#64748b] shadow-[0_10px_26px_-24px_rgba(15,23,42,0.38)] ring-1 ring-[#ffffff]/60 backdrop-blur-xl dark:border-[#334155]/54 dark:bg-[#111827]/58 dark:text-[#cbd5e1]",
      characterBubble:
        "rounded-[10px] rounded-tl-[6px] border-[#cbd5e1]/72 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(239,246,255,0.82))] text-[#172033] shadow-[0_18px_42px_-34px_rgba(15,23,42,0.48)] ring-1 ring-[#ffffff]/70 backdrop-blur-xl dark:border-[#334155]/62 dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.92),rgba(15,23,42,0.84))] dark:text-[#eff6ff] dark:ring-[#7dd3fc]/8",
      characterBubbleTail: "border-[#cbd5e1]/72 bg-[#f4f8ff] dark:border-[#334155]/62 dark:bg-[#1e293b]",
      userBubble:
        "rounded-[10px] rounded-tr-[6px] border-[#bae6fd]/30 bg-[linear-gradient(135deg,#0369a1,#0f766e)] text-white shadow-[0_16px_40px_-30px_rgba(2,132,199,0.76)] ring-1 ring-[#bae6fd]/26",
      userBubbleTail: "border-[#bae6fd]/30 bg-[#0f766e]",
      composer: "border-[#cbd5e1]/66 bg-[#f8fafc]/74 backdrop-blur-xl dark:border-[#334155]/60 dark:bg-[#0d1117]/78",
      composerInput:
        "rounded-lg border-[#cbd5e1]/76 bg-[#ffffff]/82 shadow-[0_16px_38px_-34px_rgba(15,23,42,0.36)] backdrop-blur-xl dark:border-[#334155]/62 dark:bg-[#111827]/84",
      sidePanel: "border-[#cbd5e1]/62 bg-[#f1f5f9]/58 backdrop-blur-xl dark:border-[#334155]/58 dark:bg-[#111827]/62",
    },
  },
  {
    id: "mystery",
    label: "悬疑",
    description: "雨夜档案室、炭灰与暗红，适合调查、推理和怪谈。",
    scopes: ["tavern"],
    tavern: {
      page: "tavern-scene tavern-scene-mystery bg-[#101216] text-[#f4f1e8]",
      backgroundImage: mysteryBackgroundUrl,
      backgroundOverlay: "var(--tavern-background-overlay)",
      backgroundPosition: "15% center",
      backgroundSize: "cover",
      header: "border-[#9ca3af]/20 bg-[#101216]/80 backdrop-blur-xl",
      headerIcon: "border-[#e7a3ae]/28 bg-[#30202b]/78 text-[#e7a3ae] shadow-[0_12px_28px_-22px_rgba(231,163,174,0.58)]",
      scrollArea: "bg-[#101216]",
      sceneCard:
        "rounded-md border-[#9ca3af]/22 bg-[#141922]/70 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.84)] ring-1 ring-[#e7a3ae]/8 backdrop-blur-xl",
      sceneBadge: "rounded-md bg-[#e7a3ae]/12 text-[#e7a3ae] ring-1 ring-[#e7a3ae]/16",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-md border-[#9ca3af]/18 bg-[#141922]/54 text-[#d1d5db] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.88)] ring-1 ring-[#e7a3ae]/8 backdrop-blur-xl",
      characterBubble:
        "rounded-[10px] rounded-tl-[5px] border-[#9ca3af]/24 bg-[linear-gradient(135deg,rgba(31,41,55,0.92),rgba(17,24,39,0.86))] text-[#f9fafb] shadow-[0_22px_54px_-34px_rgba(0,0,0,0.92)] ring-1 ring-[#e7a3ae]/10 backdrop-blur-xl",
      characterBubbleTail: "border-[#9ca3af]/24 bg-[#1f2937]",
      userBubble:
        "rounded-[10px] rounded-tr-[5px] border-[#f1c2cc]/22 bg-[linear-gradient(135deg,#6e3448,#452b3b)] text-white shadow-[0_18px_44px_-30px_rgba(110,52,72,0.78)] ring-1 ring-[#f1c2cc]/18",
      userBubbleTail: "border-[#f1c2cc]/22 bg-[#452b3b]",
      composer: "border-[#9ca3af]/18 bg-[#101216]/76 backdrop-blur-xl",
      composerInput:
        "rounded-md border-[#9ca3af]/22 bg-[#151b24]/80 text-[#f4f1e8] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#a7adb7] backdrop-blur-xl",
      sidePanel: "border-[#9ca3af]/18 bg-[#111720]/64 text-[#f4f1e8] backdrop-blur-xl",
    },
  },
  {
    id: "scifi",
    label: "科幻",
    description: "星舰观景舱、深蓝与冰青，适合太空、星际和未来故事。",
    scopes: ["tavern"],
    tavern: {
      page: "tavern-scene tavern-scene-scifi bg-[#07111d] text-[#eef8ff]",
      backgroundImage: scifiBackgroundUrl,
      backgroundOverlay: "var(--tavern-background-overlay)",
      backgroundPosition: "18% center",
      backgroundSize: "cover",
      header: "border-[#22d3ee]/24 bg-[#07111d]/80 backdrop-blur-xl",
      headerIcon: "border-[#22d3ee]/34 bg-[#083344]/82 text-[#67e8f9] shadow-[0_12px_28px_-22px_rgba(34,211,238,0.68)]",
      scrollArea: "bg-[#07111d]",
      sceneCard:
        "rounded-md border-[#22d3ee]/26 bg-[#081827]/70 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.84)] ring-1 ring-[#67e8f9]/10 backdrop-blur-xl",
      sceneBadge: "font-mono rounded-md bg-[#67e8f9]/12 text-[#67e8f9] ring-1 ring-[#67e8f9]/18",
      messageList: "max-w-3xl",
      narratorBubble:
        "rounded-md border-[#22d3ee]/22 bg-[#071827]/54 text-[#b9d9e7] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.88)] ring-1 ring-[#67e8f9]/10 backdrop-blur-xl",
      characterBubble:
        "rounded-[8px] rounded-tl-none border-[#22d3ee]/32 bg-[linear-gradient(135deg,rgba(14,116,144,0.34),rgba(15,23,42,0.90))] text-[#eef8ff] shadow-[0_22px_56px_-34px_rgba(0,0,0,0.92)] ring-1 ring-[#67e8f9]/14 backdrop-blur-xl",
      characterBubbleTail: "border-[#22d3ee]/30 bg-[#0b2235]",
      userBubble:
        "rounded-[8px] rounded-tr-none border-[#67e8f9]/24 bg-[linear-gradient(135deg,#0e7490,#155e75_58%,#111827)] text-white shadow-[0_18px_46px_-30px_rgba(34,211,238,0.84)] ring-1 ring-[#67e8f9]/18",
      userBubbleTail: "border-[#67e8f9]/24 bg-[#155e75]",
      composer: "border-[#22d3ee]/20 bg-[#07111d]/76 backdrop-blur-xl",
      composerInput:
        "rounded-md border-[#22d3ee]/26 bg-[#0b1f33]/82 text-[#eef8ff] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#96b7c8] backdrop-blur-xl",
      sidePanel: "border-[#22d3ee]/20 bg-[#081827]/64 text-[#eef8ff] backdrop-blur-xl",
    },
  },
  {
    id: "fantasy",
    label: "奇幻",
    description: "森林古籍厅、苔绿与古金，适合王国、预言和冒险旅队。",
    scopes: ["tavern"],
    tavern: {
      page: "tavern-scene tavern-scene-fantasy bg-[#101813] text-[#fbf6df]",
      backgroundImage: fantasyBackgroundUrl,
      backgroundOverlay: "var(--tavern-background-overlay)",
      backgroundPosition: "20% center",
      backgroundSize: "cover",
      header: "border-[#d6b661]/24 bg-[#101813]/78 backdrop-blur-xl",
      headerIcon:
        "border-[#d6b661]/34 bg-[#1f3427]/80 text-[#f6d77a] shadow-[0_12px_28px_-22px_rgba(246,215,122,0.62)]",
      scrollArea: "bg-[#101813]",
      sceneCard:
        "rounded-2xl border-[#d6b661]/24 bg-[#13211a]/70 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.78)] ring-1 ring-[#f6d77a]/10 backdrop-blur-xl",
      sceneBadge: "rounded-full bg-[#f6d77a]/12 text-[#f6d77a] ring-1 ring-[#f6d77a]/16",
      messageList: "max-w-3xl font-serif",
      narratorBubble:
        "rounded-full border-[#d6b661]/20 bg-[#13211a]/50 text-[#ddd6bd] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.86)] ring-1 ring-[#f6d77a]/8 backdrop-blur-xl",
      characterBubble:
        "rounded-[24px] rounded-tl-[8px] border-[#d6b661]/30 bg-[#f5eed8]/96 text-[#2a372a] shadow-[0_22px_56px_-34px_rgba(0,0,0,0.90)] ring-1 ring-[#f6d77a]/12 backdrop-blur-xl",
      characterBubbleTail: "border-[#d6b661]/30 bg-[#f5eed8]",
      userBubble:
        "rounded-[24px] rounded-tr-[8px] border-[#f6d77a]/24 bg-[linear-gradient(135deg,#166534,#7c2d12)] text-white shadow-[0_18px_44px_-30px_rgba(22,101,52,0.84)] ring-1 ring-[#f6d77a]/18",
      userBubbleTail: "border-[#f6d77a]/24 bg-[#7c2d12]",
      composer: "border-[#d6b661]/20 bg-[#101813]/76 backdrop-blur-xl",
      composerInput:
        "rounded-2xl border-[#d6b661]/24 bg-[#17251d]/82 text-[#fbf6df] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#b8b09a] backdrop-blur-xl",
      sidePanel: "border-[#d6b661]/20 bg-[#111d17]/64 text-[#fbf6df] backdrop-blur-xl",
    },
  },
  {
    id: "oracle",
    label: "占卜",
    description: "星象烛光房、暮紫与黄铜，适合占卜、梦境和神秘学。",
    scopes: ["tavern"],
    tavern: {
      page: "tavern-scene tavern-scene-oracle bg-[#171222] text-[#f5eefc]",
      backgroundImage: oracleBackgroundUrl,
      backgroundOverlay: "var(--tavern-background-overlay)",
      backgroundPosition: "16% center",
      backgroundSize: "cover",
      header: "border-[#e7c978]/24 bg-[#171222]/80 backdrop-blur-xl",
      headerIcon:
        "border-[#e7c978]/34 bg-[#30243f]/82 text-[#f7d779] shadow-[0_12px_28px_-22px_rgba(247,215,121,0.64)]",
      scrollArea: "bg-[#171222]",
      sceneCard:
        "rounded-2xl border-[#e7c978]/24 bg-[#251b34]/70 shadow-[0_18px_52px_-36px_rgba(0,0,0,0.82)] ring-1 ring-[#f7d779]/10 backdrop-blur-xl",
      sceneBadge: "rounded-full bg-[#f7d779]/12 text-[#f7d779] ring-1 ring-[#f7d779]/16",
      messageList: "max-w-3xl font-serif",
      narratorBubble:
        "rounded-full border-[#e7c978]/20 bg-[#251b34]/50 text-[#d0bedf] shadow-[0_14px_34px_-28px_rgba(0,0,0,0.86)] ring-1 ring-[#f7d779]/8 backdrop-blur-xl",
      characterBubble:
        "rounded-[22px] rounded-tl-[8px] border-[#e7c978]/30 bg-[linear-gradient(135deg,rgba(45,34,61,0.88),rgba(29,22,40,0.86))] text-[#f5eefc] shadow-[0_22px_56px_-34px_rgba(0,0,0,0.90)] ring-1 ring-[#f7d779]/12 backdrop-blur-xl",
      characterBubbleTail: "border-[#e7c978]/30 bg-[#342640]",
      userBubble:
        "rounded-[22px] rounded-tr-[8px] border-[#dac3f1]/20 bg-[linear-gradient(135deg,#735093,#523966)] text-white shadow-[0_18px_44px_-30px_rgba(115,80,147,0.82)] ring-1 ring-[#f7d779]/18",
      userBubbleTail: "border-[#dac3f1]/20 bg-[#523966]",
      composer: "border-[#e7c978]/20 bg-[#171222]/76 backdrop-blur-xl",
      composerInput:
        "rounded-2xl border-[#e7c978]/24 bg-[#2a203a]/82 text-[#f5eefc] shadow-[0_18px_48px_-38px_rgba(0,0,0,0.9)] placeholder:text-[#c6b3d5] backdrop-blur-xl",
      sidePanel: "border-[#e7c978]/20 bg-[#21182e]/64 text-[#f5eefc] backdrop-blur-xl",
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
