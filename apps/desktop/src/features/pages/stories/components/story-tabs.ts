import {
  BookOpen,
  FileText,
  GitBranch,
  GitMerge,
  House,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type StoryConfigTab =
  | "overview"
  | "characters"
  | "scenes"
  | "world"
  | "graph"
  | "manuscripts";

export const storyConfigTabs: Array<{
  id: StoryConfigTab;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "overview", label: "总览", description: "核心故事资源概览", icon: House },
  { id: "characters", label: "角色", description: "角色人设与记忆", icon: UsersRound },
  { id: "scenes", label: "场景", description: "场景内容和推进", icon: BookOpen },
  { id: "graph", label: "剧情结构", description: "节点和分支", icon: GitBranch },
  { id: "world", label: "世界书", description: "共享设定资料", icon: FileText },
  { id: "manuscripts", label: "稿件", description: "收稿和记录", icon: GitMerge },
];
