import {
  getApplicationChatClient,
  type ApplicationChatClient,
} from "@isle/app-sdk/chat";
import {
  getApplicationDataClient,
  type ApplicationDataClient,
} from "@isle/app-sdk/data";

export async function clearOldChats(
  data: ApplicationDataClient = getApplicationDataClient(),
  chat: ApplicationChatClient = getApplicationChatClient(),
): Promise<void> {
  for (const workspace of await data.workspaces.list()) {
    // listSessions is scoped to this application, even in a shared workspace.
    for (const session of await chat.listSessions({ workspaceId: workspace.id }))
      await chat.deleteSession({
        workspaceId: workspace.id,
        chatId: session.chatId,
      });
  }
}
