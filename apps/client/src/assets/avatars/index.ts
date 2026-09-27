import agentOffice from "./agents/agent-office.webp";
import agentWriting from "./agents/agent-writing.webp";
import agentResearch from "./agents/agent-research.webp";
import agentMeeting from "./agents/agent-meeting.webp";
import agentReporting from "./agents/agent-reporting.webp";
import agentData from "./agents/agent-data.webp";
import agentPlanning from "./agents/agent-planning.webp";
import agentDevelopment from "./agents/agent-development.webp";
import agentProduct from "./agents/agent-product.webp";
import agentDesign from "./agents/agent-design.webp";
import agentUserResearch from "./agents/agent-user-research.webp";
import agentReview from "./agents/agent-review.webp";
import agentTesting from "./agents/agent-testing.webp";
import agentDocumentation from "./agents/agent-documentation.webp";
import agentSupport from "./agents/agent-support.webp";
import agentContent from "./agents/agent-content.webp";
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
    id: "agents",
    label: "智能体头像",
    description: "按工作用途设计的智能体头像。",
    options: [
      createAvatar("agent-office", "办公助手", agentOffice),
      createAvatar("agent-writing", "写作助手", agentWriting),
      createAvatar("agent-research", "资料整理助手", agentResearch),
      createAvatar("agent-meeting", "会议纪要助手", agentMeeting),
      createAvatar("agent-reporting", "汇报助手", agentReporting),
      createAvatar("agent-data", "数据分析助手", agentData),
      createAvatar("agent-planning", "项目规划助手", agentPlanning),
      createAvatar("agent-development", "研发助手", agentDevelopment),
      createAvatar("agent-product", "产品经理", agentProduct),
      createAvatar("agent-design", "界面设计师", agentDesign),
      createAvatar("agent-user-research", "用户研究员", agentUserResearch),
      createAvatar("agent-review", "代码审查员", agentReview),
      createAvatar("agent-testing", "测试工程师", agentTesting),
      createAvatar("agent-documentation", "技术文档作者", agentDocumentation),
      createAvatar("agent-support", "客户支持专员", agentSupport),
      createAvatar("agent-content", "内容运营助手", agentContent),
    ],
  }),
  createAvatarGroup({
    id: "cats",
    label: "猫咪头像",
    description: "可选的猫咪头像。",
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

export const resolveAvatar = (avatar: string | null | undefined) => avatarById.get(avatar ?? "") ?? defaultAgentAvatar;

export const normalizeAgentAvatarId = (avatar: string | null | undefined) =>
  systemAgentAvatarById.get(avatar ?? "")?.id ?? defaultAgentAvatar.id;
