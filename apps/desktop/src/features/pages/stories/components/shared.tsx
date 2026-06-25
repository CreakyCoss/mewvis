import {
  BookOpen,
  FileText,
  GitBranch,
  GitMerge,
  ScrollText,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type {
  StoryAsset,
  StoryContextCharacter,
  StoryContextEdge,
  StoryContextLorebookEntry,
  StoryContextNode,
  StoryContextScene,
  StoryContextStage,
  StoryImportSourceKind,
  StoryManuscriptDraft,
} from "@/features/story";

export type StoryDraft = Pick<
  StoryAsset,
  "title" | "outline" | "goal" | "userPersonaName"
>;

export type StoryConfigTab =
  | "overview"
  | "characters"
  | "scenes"
  | "world"
  | "graph"
  | "manuscripts";

export const emptyDraft: StoryDraft = {
  title: "",
  outline: "",
  goal: "",
  userPersonaName: "我",
};

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

export const createDraftFromStory = (story: StoryAsset | null): StoryDraft =>
  story
    ? {
        title: story.title,
        outline: story.outline,
        goal: story.goal,
        userPersonaName: story.userPersonaName,
      }
    : emptyDraft;

export const formatCount = (count: number, label: string) => `${count} ${label}`;

export const splitKeywords = (value: string) =>
  value
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);

export const getPendingDraftCount = (story: StoryAsset) =>
  story.manuscriptInbox.drafts.filter((draft) => draft.status === "pending").length;

const createStoryLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export const emptyCharacterMemory = (): NonNullable<StoryContextCharacter["memory"]> => ({
  required: "",
  public: "",
  known: "",
  privateSelf: "",
  directorSecret: "",
});

export const createStoryCharacter = (index: number): StoryContextCharacter => ({
  id: createStoryLocalId("story-character"),
  name: `角色 ${index + 1}`,
  description: "",
  speakingStyle: "自然回应，保持人设一致。",
  writingStyle: "",
  replyStylePrompt: "",
  goals: "",
  relationshipSummary: "",
  publicRelationshipSummary: "",
  memory: emptyCharacterMemory(),
});

export const createStoryScene = (index: number): StoryContextScene => ({
  id: createStoryLocalId("story-scene"),
  title: `场景 ${index + 1}`,
  scene: "",
  goal: "",
  plot: "",
  direction: "",
  transition: "",
  memory: "",
  status: {
    location: "",
    timeLabel: "",
    weather: "",
    atmosphere: "",
    scenePhase: "",
    immediateThreat: "",
  },
});

export const createStoryLorebookEntry = (index: number): StoryContextLorebookEntry => ({
  id: createStoryLocalId("story-lore"),
  title: `世界书 ${index + 1}`,
  content: "",
  keywords: [],
  enabled: true,
  alwaysOn: false,
});

export const createStoryStage = (index: number): StoryContextStage => ({
  id: createStoryLocalId("story-stage"),
  title: `阶段 ${index + 1}`,
  summary: "",
  order: index,
});

export const createStoryNode = (story: StoryAsset): StoryContextNode => {
  const stage = story.graph.stages[0] ?? createStoryStage(0);
  const scene = story.scenes[0];
  return {
    id: createStoryLocalId("story-node"),
    stageId: stage.id,
    sceneId: scene?.id,
    title: `节点 ${story.graph.nodes.length + 1}`,
    type: "normal",
    pathRole: "main",
    status: "draft",
  };
};

export const createStoryEdge = (story: StoryAsset): StoryContextEdge | null => {
  const [fromNode, toNode] = story.graph.nodes;
  if (!fromNode || !toNode) {
    return null;
  }

  return {
    id: createStoryLocalId("story-edge"),
    fromNodeId: fromNode.id,
    toNodeId: toNode.id,
    label: "分支",
    reason: "",
    isDefault: false,
    priority: story.graph.edges.length,
  };
};

export const moveItem = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }
  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
};

export const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export const manuscriptSourceLabels: Record<StoryManuscriptDraft["source"], string> = {
  tavern: "酒馆",
  chat: "聊天框",
  manual: "手写",
  aiPolish: "AI 润色",
  import: "导入",
};

export const storyImportSourceLabels: Record<StoryImportSourceKind, string> = {
  json: "JSON",
  plainText: "纯文本",
  aiGenerated: "AI 生成",
  characterCard: "角色卡",
  worldBook: "世界书",
  unknown: "自动",
};

export const StoryMetric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) => (
  <div className="flex min-w-0 items-center gap-3 rounded-md border bg-background px-3 py-2">
    <Icon className="size-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  </div>
);

export const StorySection = ({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="rounded-lg border bg-background p-4">
    <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const EditorField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="block space-y-2">
    <span className="text-sm font-medium">{label}</span>
    {children}
  </label>
);

export const EmptyBlock = ({ text }: { text: string }) => (
  <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
    {text}
  </div>
);

export const CountBadge = ({ count, label }: { count: number; label: string }) => (
  <Badge variant="outline">{formatCount(count, label)}</Badge>
);
