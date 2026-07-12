import { useMemo } from "react";
import { Bot, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { WorkspaceChatPage } from "@/features/pages/chat/components/workspace-chat-page";
import type { StoryChatSeed } from "@/features/pages/chat/components/workspace-chat-page/story-seed";
import { createMessageId } from "@/features/pages/chat/utils/sessions";
import type { Workspace } from "@/features/pages/workspace/types";
import { storyDocumentData } from "../../../documents/model";
import type { StoryJsonDocument } from "../../../documents/types";
import type { StoryJson } from "../../model/types";
import type { StoryWorkspace } from "../../../storage";

const STORY_AUTHORING_ENTRY_SKILL_NAME = "story-assistant";
const storyAssistantTools = ["read", "ls", "find", "grep", "ask_user"];
const storyAssistantBuiltinSkills = [STORY_AUTHORING_ENTRY_SKILL_NAME];

type StoryAssistantDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  documents: StoryJsonDocument[];
  story: StoryJson;
  workspace: StoryWorkspace;
};

const toChatWorkspace = (workspace: StoryWorkspace, story: StoryJson): Workspace => ({
  id: workspace.id,
  name: story.title,
  description: "结构化故事创作工作区",
  path: workspace.path,
  isDefault: false,
  isPinned: true,
  order: 0,
  groupId: null,
  createdAt: story.createdAt,
  updatedAt: story.updatedAt,
});

const resolveRevision = (documents: StoryJsonDocument[]) => {
  const manifest = documents.map(storyDocumentData).find((data) => data?.kind === "story-manifest");
  return typeof manifest?.revision === "number" ? manifest.revision : null;
};

const createStoryAssistantSeed = (story: StoryJson, documents: StoryJsonDocument[]): StoryChatSeed => ({
  storyId: story.id,
  nodeId: story.graph.nodes[0]?.id ?? `${story.id}-root`,
  title: `${story.title} · 结构化创作`,
  runtimeInstruction: [
    "你正在 Novel Claw 的结构化故事创作弹窗中协作。",
    "必须先使用 story-assistant 专属路由，再按意图选择对应的 story-assistant-* 技能。不要调用普通 story-* 技能。",
    "story-authoring 内置能力已经强制绑定私有 story 工具。首次工作先调用 story(action=describe_structure)；工具会读取当前工作区 story/.novel-claw/contract.json，技能不得自行决定或覆盖项目协议。ChangeSet 的 validationProfile 只控制校验完整度。",
    "若 story(action=read_context) 报项目尚未初始化，调用 story(action=initialize)；已有普通 JSON 时未经用户确认不得 replaceExistingJson。",
    "正式故事文件只能通过 story(action=commit_changes) 原子校验并提交：工具会先完整校验，只有通过才写入。不要在每次提交前额外调用 action=validate_changes；该动作只用于用户明确要求预览或排查校验错误。",
    "不要使用 write、edit 或 bash 修改 story 目录。不要创建 Markdown 故事资产。",
    `当前故事 ID：${story.id}`,
    `当前 revision：${resolveRevision(documents) ?? "尚未初始化"}`,
  ].join("\n"),
  messages: [
    {
      id: createMessageId(),
      role: "assistant",
      text: [
        `已连接「${story.title}」的结构化故事项目。`,
        "",
        "我可以帮你开书、完善作品定位、设计卷纲和章节细纲，也可以按细纲写作。所有变更会先校验，只有通过后才会写入故事。",
      ].join("\n"),
      createdAt: Date.now(),
      status: "done",
    },
  ],
});

export const StoryAssistantDialog = ({
  documents,
  open,
  onOpenChange,
  story,
  workspace,
}: StoryAssistantDialogProps) => {
  const chatWorkspace = useMemo(() => toChatWorkspace(workspace, story), [story, workspace]);
  const seed = useMemo(() => createStoryAssistantSeed(story, documents), [documents, story]);
  const revision = resolveRevision(documents);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="!flex h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-1.5rem)]"
      >
        <DialogHeader className="shrink-0 border-b bg-background px-5 py-4 text-left">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="size-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base">故事创作助手</DialogTitle>
                <DialogDescription className="mt-1 line-clamp-1">
                  使用结构化写作技能维护「{story.title}」
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            >
              <ShieldCheck className="size-3.5" />
              校验后落库 · {revision === null ? "待初始化" : `revision ${revision}`}
            </Badge>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceChatPage
            workspace={chatWorkspace}
            workspaceSections={[]}
            isRouteNewSession
            onOpenWorkspace={() => undefined}
            onCreateWorkspace={() => undefined}
            storyChatSeed={seed}
            builtinSkillNames={storyAssistantBuiltinSkills}
            forcedAllowedTools={storyAssistantTools}
            hideContextTools
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
