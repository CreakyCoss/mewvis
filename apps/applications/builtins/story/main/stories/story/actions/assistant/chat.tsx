import { workspaceForPath } from "@/platform/bridge";
import { useEffect, useState } from "react";
import { Chat } from "@mewvis/app-sdk/chat/react";
import { getApplicationChatClient, type ApplicationChatSession } from "@mewvis/app-sdk/chat";
import type { StoryLibraryItem } from "../../../storage";

export function StoryChat({ story, chatId }: { story: StoryLibraryItem; chatId: string }) {
  const [session, setSession] = useState<ApplicationChatSession | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setSession(null); setError("");
    void workspaceForPath(story.workspace.path).then(workspace => getApplicationChatClient().openSession({ workspaceId: workspace.id, chatId }))
      .then(value => { if (alive) setSession(value); })
      .catch(error => { if (alive) setError(String(error.message || error)); });
    return () => { alive = false; };
  }, [story.workspace.id, chatId]);
  return session ? <Chat session={session} /> : <Chat.Loading error={error || undefined} />;
}
