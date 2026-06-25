import {
  BookOpen,
  FileText,
  GitBranch,
  GitMerge,
  ScrollText,
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
  icon: LucideIcon;
}> = [
  { id: "overview", label: "基础", icon: ScrollText },
  { id: "characters", label: "角色", icon: UsersRound },
  { id: "scenes", label: "场景", icon: BookOpen },
  { id: "world", label: "世界书", icon: FileText },
  { id: "graph", label: "结构", icon: GitBranch },
  { id: "manuscripts", label: "稿件", icon: GitMerge },
];
