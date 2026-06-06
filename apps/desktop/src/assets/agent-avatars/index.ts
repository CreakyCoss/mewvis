import catCream from "./cat-cream.jpg";
import catGraphite from "./cat-graphite.jpg";
import catLavender from "./cat-lavender.jpg";
import catMint from "./cat-mint.jpg";
import catMoon from "./cat-moon.jpg";
import catPeach from "./cat-peach.jpg";
import catSky from "./cat-sky.jpg";
import catSun from "./cat-sun.jpg";
import fantasy01 from "./portraits/fantasy/fantasy-01.jpg";
import fantasy02 from "./portraits/fantasy/fantasy-02.jpg";
import fantasy03 from "./portraits/fantasy/fantasy-03.jpg";
import fantasy04 from "./portraits/fantasy/fantasy-04.jpg";
import fantasy05 from "./portraits/fantasy/fantasy-05.jpg";
import fantasy06 from "./portraits/fantasy/fantasy-06.jpg";
import fantasy07 from "./portraits/fantasy/fantasy-07.jpg";
import fantasy08 from "./portraits/fantasy/fantasy-08.jpg";
import modern01 from "./portraits/modern/modern-01.jpg";
import modern02 from "./portraits/modern/modern-02.jpg";
import modern03 from "./portraits/modern/modern-03.jpg";
import modern04 from "./portraits/modern/modern-04.jpg";
import modern05 from "./portraits/modern/modern-05.jpg";
import modern06 from "./portraits/modern/modern-06.jpg";
import modern07 from "./portraits/modern/modern-07.jpg";
import modern08 from "./portraits/modern/modern-08.jpg";
import scifi01 from "./portraits/scifi/scifi-01.jpg";
import scifi02 from "./portraits/scifi/scifi-02.jpg";
import scifi03 from "./portraits/scifi/scifi-03.jpg";
import scifi04 from "./portraits/scifi/scifi-04.jpg";
import scifi05 from "./portraits/scifi/scifi-05.jpg";
import scifi06 from "./portraits/scifi/scifi-06.jpg";
import scifi07 from "./portraits/scifi/scifi-07.jpg";
import scifi08 from "./portraits/scifi/scifi-08.jpg";
import tavern01 from "./portraits/tavern/tavern-01.jpg";
import tavern02 from "./portraits/tavern/tavern-02.jpg";
import tavern03 from "./portraits/tavern/tavern-03.jpg";
import tavern04 from "./portraits/tavern/tavern-04.jpg";
import tavern05 from "./portraits/tavern/tavern-05.jpg";
import tavern06 from "./portraits/tavern/tavern-06.jpg";
import tavern07 from "./portraits/tavern/tavern-07.jpg";
import tavern08 from "./portraits/tavern/tavern-08.jpg";
import wuxia01 from "./portraits/wuxia/wuxia-01.jpg";
import wuxia02 from "./portraits/wuxia/wuxia-02.jpg";
import wuxia03 from "./portraits/wuxia/wuxia-03.jpg";
import wuxia04 from "./portraits/wuxia/wuxia-04.jpg";
import wuxia05 from "./portraits/wuxia/wuxia-05.jpg";
import wuxia06 from "./portraits/wuxia/wuxia-06.jpg";
import wuxia07 from "./portraits/wuxia/wuxia-07.jpg";
import wuxia08 from "./portraits/wuxia/wuxia-08.jpg";

export type AgentAvatarOption = {
  id: string;
  label: string;
  src: string;
  groupId: string;
};

export type AgentAvatarGroup = {
  id: string;
  label: string;
  description: string;
  options: AgentAvatarOption[];
};

const createAvatar = (
  groupId: string,
  id: string,
  label: string,
  src: string,
): AgentAvatarOption => ({
  id,
  label,
  src,
  groupId,
});

export const agentAvatarGroups: AgentAvatarGroup[] = [
  {
    id: "cats",
    label: "默认猫猫",
    description: "系统角色默认使用的写实猫咪头像。",
    options: [
      createAvatar("cats", "cat-cream", "喵维斯", catCream),
      createAvatar("cats", "cat-moon", "狸花猫", catMoon),
      createAvatar("cats", "cat-sun", "橘猫", catSun),
      createAvatar("cats", "cat-lavender", "布偶猫", catLavender),
      createAvatar("cats", "cat-sky", "暹罗猫", catSky),
      createAvatar("cats", "cat-peach", "三花猫", catPeach),
      createAvatar("cats", "cat-graphite", "英短蓝猫", catGraphite),
      createAvatar("cats", "cat-mint", "奶牛猫", catMint),
    ],
  },
];

export const tavernAvatarGroups: AgentAvatarGroup[] = [
  {
    id: "wuxia",
    label: "武侠江湖",
    description: "适合古风、门派、夜行、侠客与谋士角色。",
    options: [
      createAvatar("wuxia", "wuxia-01", "青衣剑客", wuxia01),
      createAvatar("wuxia", "wuxia-02", "山雨游侠", wuxia02),
      createAvatar("wuxia", "wuxia-03", "白袍谋士", wuxia03),
      createAvatar("wuxia", "wuxia-04", "溪谷医者", wuxia04),
      createAvatar("wuxia", "wuxia-05", "夜行刺客", wuxia05),
      createAvatar("wuxia", "wuxia-06", "茶肆掌柜", wuxia06),
      createAvatar("wuxia", "wuxia-07", "玄衣捕快", wuxia07),
      createAvatar("wuxia", "wuxia-08", "白发宗师", wuxia08),
    ],
  },
  {
    id: "tavern",
    label: "雨夜酒馆",
    description: "适合酒馆、群像、调查、旅人和桌边讲述者。",
    options: [
      createAvatar("tavern", "tavern-01", "柜台老板", tavern01),
      createAvatar("tavern", "tavern-02", "吟游旅人", tavern02),
      createAvatar("tavern", "tavern-03", "黑衣调查员", tavern03),
      createAvatar("tavern", "tavern-04", "老兵守卫", tavern04),
      createAvatar("tavern", "tavern-05", "烛边档案员", tavern05),
      createAvatar("tavern", "tavern-06", "雨夜信使", tavern06),
      createAvatar("tavern", "tavern-07", "牌桌老手", tavern07),
      createAvatar("tavern", "tavern-08", "炉边讲述者", tavern08),
    ],
  },
  {
    id: "modern",
    label: "现代创作",
    description: "适合普通聊天、写作协作、研究和产品创意角色。",
    options: [
      createAvatar("modern", "modern-01", "青年小说家", modern01),
      createAvatar("modern", "modern-02", "故事编辑", modern02),
      createAvatar("modern", "modern-03", "资料研究员", modern03),
      createAvatar("modern", "modern-04", "视觉设计师", modern04),
      createAvatar("modern", "modern-05", "项目策划师", modern05),
      createAvatar("modern", "modern-06", "档案顾问", modern06),
      createAvatar("modern", "modern-07", "播客主持人", modern07),
      createAvatar("modern", "modern-08", "数据分析师", modern08),
    ],
  },
  {
    id: "fantasy",
    label: "奇幻史诗",
    description: "适合魔法、王国、异族、预言和冒险角色。",
    options: [
      createAvatar("fantasy", "fantasy-01", "森林法师", fantasy01),
      createAvatar("fantasy", "fantasy-02", "王国骑士", fantasy02),
      createAvatar("fantasy", "fantasy-03", "精灵绘图师", fantasy03),
      createAvatar("fantasy", "fantasy-04", "沙海神谕者", fantasy04),
      createAvatar("fantasy", "fantasy-05", "炼金术士", fantasy05),
      createAvatar("fantasy", "fantasy-06", "龙裔学者", fantasy06),
      createAvatar("fantasy", "fantasy-07", "月夜游侠", fantasy07),
      createAvatar("fantasy", "fantasy-08", "白须先知", fantasy08),
    ],
  },
  {
    id: "scifi",
    label: "科幻未来",
    description: "适合星舰、赛博、未来都市和智能体角色。",
    options: [
      createAvatar("scifi", "scifi-01", "星舰舰长", scifi01),
      createAvatar("scifi", "scifi-02", "义体工程师", scifi02),
      createAvatar("scifi", "scifi-03", "轨道医师", scifi03),
      createAvatar("scifi", "scifi-04", "霓虹黑客", scifi04),
      createAvatar("scifi", "scifi-05", "仿生外交官", scifi05),
      createAvatar("scifi", "scifi-06", "外星勘探员", scifi06),
      createAvatar("scifi", "scifi-07", "战术分析师", scifi07),
      createAvatar("scifi", "scifi-08", "星站档案员", scifi08),
    ],
  },
];

export const agentAvatarOptions = agentAvatarGroups.flatMap((group) => group.options);
export const tavernAvatarOptions = tavernAvatarGroups.flatMap((group) => group.options);
export const allAgentAvatarOptions = [...agentAvatarOptions, ...tavernAvatarOptions];

const agentAvatarById = new Map(allAgentAvatarOptions.map((option) => [option.id, option]));
const systemAgentAvatarById = new Map(agentAvatarOptions.map((option) => [option.id, option]));
const tavernAvatarById = new Map(tavernAvatarOptions.map((option) => [option.id, option]));

const fallbackAvatar = agentAvatarOptions[0] ?? tavernAvatarOptions[0];

if (!fallbackAvatar) {
  throw new Error("No agent avatars configured.");
}

export const defaultAgentAvatar = fallbackAvatar;
export const defaultTavernAvatar = tavernAvatarOptions[0] ?? defaultAgentAvatar;

export const resolveAgentAvatar = (avatar: string | null | undefined) =>
  agentAvatarById.get(avatar ?? "") ?? defaultAgentAvatar;

export const normalizeAgentAvatarId = (avatar: string | null | undefined) =>
  systemAgentAvatarById.get(avatar ?? "")?.id ?? defaultAgentAvatar.id;

export const normalizeTavernAvatarId = (avatar: string | null | undefined) =>
  tavernAvatarById.get(avatar ?? "")?.id ?? defaultTavernAvatar.id;
