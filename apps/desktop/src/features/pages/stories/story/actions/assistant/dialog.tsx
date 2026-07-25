import { useMemo, useState } from "react";
import { Bot, Plus, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspaceChatPage } from "@/features/pages/chat/components/workspace-chat-page";
import type { StoryChatSeed } from "@/features/pages/chat/components/workspace-chat-page/story-seed";
import { createMessageId } from "@/features/pages/chat/utils/sessions";
import type { Workspace } from "@/features/pages/workspace/types";
import type { StoryDocument, StoryOverview } from "../../../../../../../core/story-project/types";
import type { StoryWorkspace } from "../../../storage";
import { storyDocumentData } from "../../../story-document";

const STORY_AUTHORING_ENTRY_SKILL_NAME = "story-assistant";
const storyAssistantTools = ["read", "ls", "find", "grep", "ask_user"];
const storyAssistantBuiltinSkills = [STORY_AUTHORING_ENTRY_SKILL_NAME];

type StoryAssistantDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  documents: StoryDocument[];
  overview: StoryOverview;
  workspace: StoryWorkspace;
};

type StoryAssistantConversation = {
  instance: number;
  sessionId: string | null;
  isNew: boolean;
};

const toChatWorkspace = (workspace: StoryWorkspace, overview: StoryOverview): Workspace => ({
  id: workspace.id,
  name: overview.title,
  description: "结构化故事创作工作区",
  path: workspace.path,
  isDefault: false,
  isPinned: true,
  order: 0,
  groupId: null,
  createdAt: overview.createdAt,
  updatedAt: overview.updatedAt,
});

const resolveRevision = (documents: StoryDocument[]) => {
  const manifest = documents.map(storyDocumentData).find((data) => data?.kind === "story-manifest");
  return typeof manifest?.revision === "number" ? manifest.revision : null;
};

const createStoryAssistantSeed = (overview: StoryOverview, documents: StoryDocument[]): StoryChatSeed => ({
  title: `${overview.title} · 结构化创作`,
  runtimeInstruction: [
    "你正在 Novel Claw 的结构化故事创作弹窗中协作。",
    "必须先使用 story-assistant 专属路由，再按意图选择对应的 story-assistant-* 技能。不要调用普通 story-* 技能。",
    "story-authoring 内置能力已经强制绑定私有 story 工具。首次工作先调用 story(action=describe_structure) 获取完整故事类型定义。写作时优先使用 read_context 返回的可读 text，所有结构化或 Markdown 变更通过 ChangeSet 校验后落库。",
    "若 story(action=read_context) 报项目尚未初始化，调用 story(action=initialize)；存储中已有故事记录时未经用户确认不得 replaceExisting。",
    "正式故事文件只能通过 story(action=commit_changes) 原子校验并提交：工具会先完整校验，只有通过才写入。不要在每次提交前额外调用 action=validate_changes；该动作只用于用户明确要求预览或排查校验错误。",
    "不要使用 write、edit 或 bash 修改 story 目录。不要创建 Markdown 故事资产。",
    `当前故事 ID：${overview.id}`,
    `当前 revision：${resolveRevision(documents) ?? "尚未初始化"}`,
  ].join("\n"),
  messages: [
    {
      id: createMessageId(),
      role: "assistant",
      text: [
        `已连接「${overview.title}」的结构化故事项目。`,
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
  overview,
  workspace,
}: StoryAssistantDialogProps) => {
  const chatWorkspace = useMemo(() => toChatWorkspace(workspace, overview), [overview, workspace]);
  const seed = useMemo(() => createStoryAssistantSeed(overview, documents), [documents, overview]);
  const revision = resolveRevision(documents);
  const [conversation, setConversation] = useState<StoryAssistantConversation>({
    instance: 0,
    sessionId: null,
    isNew: false,
  });

  const createConversation = () => {
    setConversation((current) => ({
      instance: current.instance + 1,
      sessionId: null,
      isNew: true,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="!flex h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-1.5rem)]"
      >
        <DialogHeader className="shrink-0 border-b bg-surface-raised/85 px-5 py-4 text-left">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="size-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base">故事创作助手</DialogTitle>
                <DialogDescription className="mt-1 line-clamp-1">
                  使用结构化写作技能维护「{overview.title}」
                </DialogDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline" className="gap-1.5 border-success/25 bg-success/10 text-success">
                <ShieldCheck className="size-3.5" />
                校验后落库 · {revision === null ? "待初始化" : `revision ${revision}`}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                title="保留当前对话并开始新会话"
                onClick={createConversation}
              >
                <Plus className="size-3.5" />
                新建会话
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceChatPage
            key={`${overview.id}:${conversation.instance}`}
            workspace={chatWorkspace}
            workspaceSections={[]}
            routeSessionId={conversation.sessionId}
            isRouteNewSession={conversation.isNew}
            onSessionCreated={(sessionId) => {
              setConversation((current) => ({ ...current, sessionId, isNew: false }));
            }}
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
