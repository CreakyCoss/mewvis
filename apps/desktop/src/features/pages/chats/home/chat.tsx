import { useEffect } from "react";
import { Chat } from "../chat";
import type { ChatInitialData } from "../chat/type";
import { useWorkspaceStore } from "./workspace-store";

export type HomeChatProps = {
  chatId: string;
  workspaceId: string;
  workspacePath: string;
  initialData: ChatInitialData;
};

export const HomeChat = ({ chatId, workspaceId, workspacePath, initialData }: HomeChatProps) => {
  const workspaceStore = useWorkspaceStore();

  useEffect(() => {
    workspaceStore.setCurrentChat({ workspaceId, chatId });
    return () => workspaceStore.setCurrentChat(null);
  }, [chatId, workspaceId, workspaceStore.setCurrentChat]);

  return (
    <Chat
      chatId={chatId}
      workspacePath={workspacePath}
      initialData={initialData}
      onStatusChange={({ chatId: statusChatId, isRunning }) =>
        workspaceStore.setChatLoading(workspaceId, statusChatId, isRunning)
      }
    />
  );
};
