import { useState } from "react";
import { useNavigate } from "react-router";
import { Chat } from "@/chat/react";
import { useDesktopChatSession } from "@/chat/desktop/react";
import type { Workspace } from "@/api/workspace";
import { createTimestampId } from "@/utils/ids";
import { useWorkspaceStore } from "../workspace-store";
import { workspaceChatProfile } from "../profile";

export function HomeComposer({ workspace }: { workspace: Workspace }) {
  const [chatId] = useState(() => createTimestampId("chat"));
  const navigate = useNavigate();
  const openChat = useWorkspaceStore((store) => store.openChat);
  const { session, error } = useDesktopChatSession({
    identity: { scope: `workspace:${workspace.id}`, id: chatId },
    workspaceId: workspace.id,
    origin: { kind: "builtin", sceneId: "chat" },
    workspacePath: workspace.path,
    profile: workspaceChatProfile,
  });
  if (!session) return <Chat.Loading error={error} />;
  return (
    <Chat.Provider session={session}>
      <Chat.Error />
      <Chat.Composer
        placeholder={`询问关于 ${workspace.name} 的任何问题`}
        onSubmitted={(result) => {
          if (result.status !== "dispatched") return;
          openChat({ workspaceId: workspace.id, chatId });
          navigate(`/chats/${workspace.id}/${chatId}`, { replace: true });
        }}
      />
    </Chat.Provider>
  );
}
