import catCream from "./cats/cat-cream.jpg";
import catGraphite from "./cats/cat-graphite.jpg";
import catLavender from "./cats/cat-lavender.jpg";
import catMint from "./cats/cat-mint.jpg";
import catMoon from "./cats/cat-moon.jpg";
import catPeach from "./cats/cat-peach.jpg";
import catSky from "./cats/cat-sky.jpg";
import catSun from "./cats/cat-sun.jpg";
import blankAvatar from "./fallback/blank-avatar.svg";
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

export type AvatarOption = {
  id: string;
  label: string;
  src: string;
  groupId: string;
};

export type AvatarGroup = {
  id: string;
  label: string;
  description: string;
  options: AvatarOption[];
};

type AvatarOptionDefinition = Omit<AvatarOption, "groupId">;

const createAvatar = (id: string, label: string, src: string): AvatarOptionDefinition => ({
  id,
  label,
  src,
});

const createAvatarGroup = (
  group: Omit<AvatarGroup, "options"> & {
    options: AvatarOptionDefinition[];
  },
): AvatarGroup => ({
  ...group,
  options: group.options.map((option) => ({
    ...option,
    groupId: group.id,
  })),
});

export const agentAvatarGroups: AvatarGroup[] = [
  createAvatarGroup({
    id: "cats",
    label: "默认猫猫",
    description: "系统角色默认使用的写实猫咪头像。",
    options: [
      createAvatar("cat-cream", "喵维斯", catCream),
      createAvatar("cat-moon", "狸花猫", catMoon),
      createAvatar("cat-sun", "橘猫", catSun),
      createAvatar("cat-lavender", "布偶猫", catLavender),
      createAvatar("cat-sky", "暹罗猫", catSky),
      createAvatar("cat-peach", "三花猫", catPeach),
      createAvatar("cat-graphite", "英短蓝猫", catGraphite),
      createAvatar("cat-mint", "奶牛猫", catMint),
    ],
  }),
];

export const tavernAvatarGroups: AvatarGroup[] = [
  createAvatarGroup({
    id: "wuxia",
    label: "武侠江湖",
    description: "适合古风、门派、夜行、侠客与谋士角色。",
    options: [
      createAvatar("wuxia-01", "青衣剑客", wuxia01),
      createAvatar("wuxia-02", "山雨游侠", wuxia02),
      createAvatar("wuxia-03", "白袍谋士", wuxia03),
      createAvatar("wuxia-04", "溪谷医者", wuxia04),
      createAvatar("wuxia-05", "夜行刺客", wuxia05),
      createAvatar("wuxia-06", "茶肆掌柜", wuxia06),
      createAvatar("wuxia-07", "玄衣捕快", wuxia07),
      createAvatar("wuxia-08", "白发宗师", wuxia08),
    ],
  }),
  createAvatarGroup({
    id: "tavern",
    label: "雨夜酒馆",
    description: "适合酒馆、群像、调查、旅人和桌边讲述者。",
    options: [
      createAvatar("tavern-01", "柜台老板", tavern01),
      createAvatar("tavern-02", "吟游旅人", tavern02),
      createAvatar("tavern-03", "黑衣调查员", tavern03),
      createAvatar("tavern-04", "老兵守卫", tavern04),
      createAvatar("tavern-05", "烛边档案员", tavern05),
      createAvatar("tavern-06", "雨夜信使", tavern06),
      createAvatar("tavern-07", "牌桌老手", tavern07),
      createAvatar("tavern-08", "炉边讲述者", tavern08),
    ],
  }),
  createAvatarGroup({
    id: "modern",
    label: "现代创作",
    description: "适合普通聊天、写作协作、研究和产品创意角色。",
    options: [
      createAvatar("modern-01", "青年小说家", modern01),
      createAvatar("modern-02", "故事编辑", modern02),
      createAvatar("modern-03", "资料研究员", modern03),
      createAvatar("modern-04", "视觉设计师", modern04),
      createAvatar("modern-05", "项目策划师", modern05),
      createAvatar("modern-06", "档案顾问", modern06),
      createAvatar("modern-07", "播客主持人", modern07),
      createAvatar("modern-08", "数据分析师", modern08),
    ],
  }),
  createAvatarGroup({
    id: "fantasy",
    label: "奇幻史诗",
    description: "适合魔法、王国、异族、预言和冒险角色。",
    options: [
      createAvatar("fantasy-01", "森林法师", fantasy01),
      createAvatar("fantasy-02", "王国骑士", fantasy02),
      createAvatar("fantasy-03", "精灵绘图师", fantasy03),
      createAvatar("fantasy-04", "沙海神谕者", fantasy04),
      createAvatar("fantasy-05", "炼金术士", fantasy05),
      createAvatar("fantasy-06", "龙裔学者", fantasy06),
      createAvatar("fantasy-07", "月夜游侠", fantasy07),
      createAvatar("fantasy-08", "白须先知", fantasy08),
    ],
  }),
  createAvatarGroup({
    id: "scifi",
    label: "科幻未来",
    description: "适合星舰、赛博、未来都市和智能体角色。",
    options: [
      createAvatar("scifi-01", "星舰舰长", scifi01),
      createAvatar("scifi-02", "义体工程师", scifi02),
      createAvatar("scifi-03", "轨道医师", scifi03),
      createAvatar("scifi-04", "霓虹黑客", scifi04),
      createAvatar("scifi-05", "仿生外交官", scifi05),
      createAvatar("scifi-06", "外星勘探员", scifi06),
      createAvatar("scifi-07", "战术分析师", scifi07),
      createAvatar("scifi-08", "星站档案员", scifi08),
    ],
  }),
];

export const agentAvatarOptions = agentAvatarGroups.flatMap((group) => group.options);
export const tavernAvatarOptions = tavernAvatarGroups.flatMap((group) => group.options);
const fallbackAvatar: AvatarOption = { id: "blank-avatar", label: "空白头像", src: blankAvatar, groupId: "fallback" };

export const allAvatarOptions = [...agentAvatarOptions, ...tavernAvatarOptions, fallbackAvatar];

const avatarById = new Map(allAvatarOptions.map((option) => [option.id, option]));
const systemAgentAvatarById = new Map(agentAvatarOptions.map((option) => [option.id, option]));
const tavernAvatarById = new Map(tavernAvatarOptions.map((option) => [option.id, option]));

export const defaultAgentAvatar = agentAvatarOptions[0] ?? fallbackAvatar;
export const defaultTavernAvatar = tavernAvatarOptions[0] ?? fallbackAvatar;

export const resolveAvatar = (avatar: string | null | undefined) => avatarById.get(avatar ?? "") ?? fallbackAvatar;

export const normalizeAgentAvatarId = (avatar: string | null | undefined) =>
  systemAgentAvatarById.get(avatar ?? "")?.id ?? fallbackAvatar.id;

export const normalizeTavernAvatarId = (avatar: string | null | undefined) =>
  tavernAvatarById.get(avatar ?? "")?.id ?? fallbackAvatar.id;
