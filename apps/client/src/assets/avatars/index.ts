import catCream from "./cats/cat-cream.jpg";
import catGraphite from "./cats/cat-graphite.jpg";
import catLavender from "./cats/cat-lavender.jpg";
import catMint from "./cats/cat-mint.jpg";
import catMoon from "./cats/cat-moon.jpg";
import catPeach from "./cats/cat-peach.jpg";
import catSky from "./cats/cat-sky.jpg";
import catSun from "./cats/cat-sun.jpg";
import blankAvatar from "./fallback/blank-avatar.svg";

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
    description: "智能体默认使用的写实猫咪头像。",
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

export const agentAvatarOptions = agentAvatarGroups.flatMap((group) => group.options);
const fallbackAvatar: AvatarOption = { id: "blank-avatar", label: "空白头像", src: blankAvatar, groupId: "fallback" };

export const allAvatarOptions = [...agentAvatarOptions, fallbackAvatar];

const avatarById = new Map(allAvatarOptions.map((option) => [option.id, option]));
const systemAgentAvatarById = new Map(agentAvatarOptions.map((option) => [option.id, option]));

export const defaultAgentAvatar = agentAvatarOptions[0] ?? fallbackAvatar;

export const resolveAvatar = (avatar: string | null | undefined) => avatarById.get(avatar ?? "") ?? fallbackAvatar;

export const normalizeAgentAvatarId = (avatar: string | null | undefined) =>
  systemAgentAvatarById.get(avatar ?? "")?.id ?? fallbackAvatar.id;
