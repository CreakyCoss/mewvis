import { useEffect, useRef, useState } from "react";
import { createTimestampId } from "@/utils/ids";
import { ChatInput } from "../components/chat-input";
import type { ChatDisplayOptions, ChatInputSubmitPayload } from "../components/chat-input/type";
import { WorkspaceDialog, type WorkspaceDialogHandle } from "../components/workspace-dialog";
import { WorkspacePicker } from "../components/workspace-picker";
import { HomeChat, type HomeChatProps } from "./chat";
import { useWorkspaceStore } from "./workspace-store";

export const ChatHomePage = () => {
  const workspaceStore = useWorkspaceStore();
  const workspaceDialogRef = useRef<WorkspaceDialogHandle>(null);
  const [chat, setChat] = useState<HomeChatProps | null>(null);
  const [createChatError, setCreateChatError] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [displayOptions, setDisplayOptions] = useState<ChatDisplayOptions>({
    showThinkingProcess: true,
    showToolCallProcess: true,
  });

  useEffect(() => {
    void workspaceStore.loadWorkspaces();
  }, [workspaceStore.loadWorkspaces]);

  const submitPrompt = async (initialRequest: ChatInputSubmitPayload) => {
    if (!workspaceStore.currentWorkspace) {
      return;
    }

    const workspace = workspaceStore.currentWorkspace;
    const chatId = createTimestampId("chat");
    setCreateChatError("");
    setIsCreatingChat(true);

    try {
      const savedChat = await workspaceStore.saveChat(workspace, {
        chatId,
        title: initialRequest.text,
        messages: [],
      });
      setChat({
        chatId: savedChat.id,
        workspaceId: workspace.id,
        initialData: {
          request: initialRequest,
          resources: workspaceStore.resources,
          displayOptions,
        },
      });
    } catch (error) {
      setCreateChatError(error instanceof Error ? error.message : "新建对话失败，请重试。");
    } finally {
      setIsCreatingChat(false);
    }
  };

  if (chat) {
    return <HomeChat {...chat} />;
  }

  return (
    <main className="relative flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      <section
        aria-labelledby="chat-home-title"
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-y-auto px-4 py-8 sm:px-8"
      >
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex min-h-[calc(100vh-9rem)] flex-col items-center justify-center py-10">
            <div className="w-full space-y-7">
              <h1
                id="chat-home-title"
                className="mx-auto flex w-full max-w-[42rem] min-w-0 flex-wrap items-baseline justify-center text-center text-2xl font-semibold leading-tight tracking-normal text-foreground sm:text-3xl xl:text-4xl"
                title={
                  workspaceStore.currentWorkspace
                    ? `我们应该在 ${workspaceStore.currentWorkspace.name} 中构建什么？`
                    : "我们应该构建什么？"
                }
              >
                {workspaceStore.currentWorkspace ? (
                  <>
                    <span className="shrink-0">我们应该在&nbsp;</span>
                    <span className="max-w-full min-w-0 truncate">{workspaceStore.currentWorkspace.name}</span>
                    <span className="shrink-0">&nbsp;中构建什么？</span>
                  </>
                ) : (
                  "我们应该构建什么？"
                )}
              </h1>

              <div className="space-y-3">
                <ChatInput
                  resources={workspaceStore.resources}
                  displayOptions={displayOptions}
                  disabled={workspaceStore.isLoading || isCreatingChat || !workspaceStore.currentWorkspace}
                  placeholder={
                    workspaceStore.currentWorkspace
                      ? `询问关于 ${workspaceStore.currentWorkspace.name} 的任何问题`
                      : "输入问题"
                  }
                  onDisplayOptionsChange={setDisplayOptions}
                  onSubmit={submitPrompt}
                />

                {createChatError ? (
                  <div className="mx-auto w-full max-w-[69rem] px-1 text-sm text-destructive">{createChatError}</div>
                ) : null}

                <WorkspacePicker onCreateWorkspace={() => workspaceDialogRef.current?.()} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <WorkspaceDialog bind={workspaceDialogRef} />
    </main>
  );
};
