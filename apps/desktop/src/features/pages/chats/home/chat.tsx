import { Chat } from "../chat";
import type { ChatInitialData } from "../chat/type";
import { useWorkspaceStore } from "./workspace-store";

export type HomeChatProps = {
  chatId: string;
  workspacePath: string;
  initialData: ChatInitialData;
};

export const HomeChat = ({ chatId, workspacePath, initialData }: HomeChatProps) => {
  const workspaceStore = useWorkspaceStore();

  return (
    <Chat
      chatId={chatId}
      workspacePath={workspacePath}
      initialData={initialData}
      onStatusChange={({ chatId: statusChatId, isRunning }) => workspaceStore.setChatLoading(statusChatId, isRunning)}
    />
  );
};
