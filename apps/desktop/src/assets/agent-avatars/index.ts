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
  { id: "cat-mint", label: "薄荷猫", src: catMint },
  { id: "cat-peach", label: "蜜桃猫", src: catPeach },
  { id: "cat-sky", label: "晴空猫", src: catSky },
  { id: "cat-lavender", label: "薰衣草猫", src: catLavender },
  { id: "cat-sun", label: "太阳猫", src: catSun },
  { id: "cat-graphite", label: "石墨猫", src: catGraphite },
];

export const defaultAgentAvatar = agentAvatarOptions[0];

export const resolveAgentAvatar = (avatar: string | null | undefined) =>
  agentAvatarOptions.find((option) => option.id === avatar) ?? defaultAgentAvatar;
