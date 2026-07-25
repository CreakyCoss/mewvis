import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { ChatInitialData } from "../chat/type";
import { useWorkspaceStore } from "./workspace-store";

export type HomeChatProps = {
  chatId: string;
  workspaceId: string;
  initialData: ChatInitialData;
};

export const HomeChat = ({ chatId, workspaceId, initialData }: HomeChatProps) => {
  const navigate = useNavigate();
  const workspaceStore = useWorkspaceStore();

  useEffect(() => {
    workspaceStore.openChat({ workspaceId, chatId, initialData });
    navigate(`/chats/${workspaceId}/${chatId}`, { replace: true });
  }, [chatId, initialData, navigate, workspaceId, workspaceStore.openChat]);

  return null;
};
