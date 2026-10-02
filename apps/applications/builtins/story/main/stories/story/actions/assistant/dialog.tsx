import { workspaceForPath } from "@/platform/bridge";
import { useEffect, useMemo, useState } from "react";
import { Bot, Plus, ShieldCheck } from "lucide-react";
import { orderBy } from "lodash-es";
import { getApplicationChatClient } from "@mewvis/app-sdk/chat";
import { prepareStoryChatProfile } from "./resources";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "design-system/components/ui/dialog";
import { Badge } from "design-system/components/ui/badge";
import { Button } from "design-system/components/ui/button";
import { Spinner } from "design-system/components/ui/spinner";

import type { StoryDocument, StoryOverview } from "@story/project/types";
import type { StoryLibraryItem, StoryWorkspace } from "../../../storage";
import { storyDocumentData } from "../../../story-document";
import { StoryChat } from "./chat";

type StoryAssistantDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  documents: StoryDocument[];
  overview: StoryOverview;
  workspace: StoryWorkspace;
};

type StoryAssistantConversation = {
  instance: number;
  chatId: string | null;
};

const resolveRevision = (documents: StoryDocument[]) => {
  const manifest = documents.map(storyDocumentData).find((data) => data?.kind === "story-manifest");
  return typeof manifest?.revision === "number" ? manifest.revision : null;
};

const opening = new Map<string, Promise<string>>();
const openConversation = (story: StoryLibraryItem, fresh = false) => {
  const key = `${story.workspace.id}:${fresh ? "new" : "latest"}`;
  if (opening.has(key)) return opening.get(key)!;
  const pending = (async () => {
    const client = getApplicationChatClient();
    const workspace = await workspaceForPath(story.workspace.path);
    const latest = fresh ? undefined : orderBy((await client.listSessions({ workspaceId: workspace.id }))
      .filter(chat => chat.sceneId === "story-assistant"), ["updatedAt", "createdAt", "chatId"], ["desc", "desc", "desc"])[0];
    if (latest) return latest.chatId;
    const session = await client.createSession({ workspaceId: workspace.id, sceneId: "story-assistant", profile: prepareStoryChatProfile({ ...story, workspace: { ...story.workspace, id: workspace.id } }) });
    const flushed = await session.flush();
    if (!flushed.ok) throw new Error(flushed.error);
    return session.identity.id;
  })().finally(() => opening.delete(key));
  opening.set(key, pending);
  return pending;
};

export const StoryAssistantDialog = ({
  documents,
  open,
  onOpenChange,
  overview,
  workspace,
}: StoryAssistantDialogProps) => {
  const story = useMemo<StoryLibraryItem>(
    () => ({ id: workspace.id, documents, overview, workspace }),
    [documents, overview, workspace],
  );
  const revision = resolveRevision(documents);
  const [openError, setOpenError] = useState("");
  const [conversation, setConversation] = useState<StoryAssistantConversation>(() => ({
    instance: 0,
    chatId: null,
  }));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void openConversation(story).then(chatId => {
      if (!cancelled) setConversation(current => ({ ...current, chatId }));
    }).catch(error => {
      if (!cancelled) setOpenError(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
    };
  }, [open, workspace.path, workspace.id]);

  const createConversation = async () => {
    setOpenError("");
    setConversation(current => ({ ...current, chatId: null }));
    try {
      const chatId = await openConversation(story, true);
      setConversation(current => ({ instance: current.instance + 1, chatId }));
    } catch (error) { setOpenError(error instanceof Error ? error.message : String(error)); }
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
                disabled={!conversation.chatId}
              >
                <Plus className="size-3.5" />
                新建会话
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {conversation.chatId ? (
            <StoryChat key={`${overview.id}:${conversation.instance}`} story={story} chatId={conversation.chatId} />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
              {!openError && <Spinner />}
              <span>{openError || "正在恢复上次会话"}</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
