import { Chat } from "../chat";
import type { ChatInitialData } from "../chat/type";

export type HomeChatProps = {
  chatId: string;
  workspacePath: string;
  initialData: ChatInitialData;
};

export const HomeChat = ({ chatId, workspacePath, initialData }: HomeChatProps) => (
  <Chat chatId={chatId} workspacePath={workspacePath} initialData={initialData} />
);
