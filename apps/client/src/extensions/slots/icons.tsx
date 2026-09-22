import { ActivityIcon, ChartNoAxesColumnIcon, FolderIcon, GitBranchIcon, InfoIcon, PuzzleIcon } from "lucide-react";
import type { UIContribution } from "@isle/extension-sdk/ui";

const icons = {
  activity: ActivityIcon,
  chart: ChartNoAxesColumnIcon,
  files: FolderIcon,
  "git-branch": GitBranchIcon,
  info: InfoIcon,
  puzzle: PuzzleIcon,
} satisfies Record<Extract<UIContribution, { icon: string }>["icon"], typeof InfoIcon>;
export function UIIcon({ name, className }: { name: keyof typeof icons; className?: string }) {
  const Icon = icons[name];
  return <Icon className={className} />;
}
