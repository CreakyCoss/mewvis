import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { ChatTurnRequest } from "../components/chat-input/type";
import { useWorkspaceStore } from "../workspace-store";

export type HomeChatProps = {
  chatId: string;
  workspaceId: string;
  initialTurn: ChatTurnRequest;
};

export const HomeChat = ({ chatId, workspaceId, initialTurn }: HomeChatProps) => {
  const navigate = useNavigate();
  const workspaceStore = useWorkspaceStore();

  useEffect(() => {
    workspaceStore.openChat({ workspaceId, chatId, initialTurn });
    navigate(`/chats/${workspaceId}/${chatId}`, { replace: true });
  }, [chatId, initialTurn, navigate, workspaceId, workspaceStore.openChat]);

  return null;
};
