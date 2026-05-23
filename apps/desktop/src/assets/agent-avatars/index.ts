import catGraphite from "./cat-graphite.svg";
import catLavender from "./cat-lavender.svg";
import catMint from "./cat-mint.svg";
import catPeach from "./cat-peach.svg";
import catSky from "./cat-sky.svg";
import catSun from "./cat-sun.svg";

export type AgentAvatarOption = {
  id: string;
  label: string;
  src: string;
};

export const agentAvatarOptions: AgentAvatarOption[] = [
  { id: "cat-sun", label: "橘猫", src: catSun },
  { id: "cat-lavender", label: "布偶猫", src: catLavender },
  { id: "cat-sky", label: "暹罗猫", src: catSky },
  { id: "cat-peach", label: "三花猫", src: catPeach },
  { id: "cat-graphite", label: "英短蓝猫", src: catGraphite },
  { id: "cat-mint", label: "奶牛猫", src: catMint },
];

export const defaultAgentAvatar = agentAvatarOptions[0];

export const resolveAgentAvatar = (avatar: string | null | undefined) =>
  agentAvatarOptions.find((option) => option.id === avatar) ?? defaultAgentAvatar;
