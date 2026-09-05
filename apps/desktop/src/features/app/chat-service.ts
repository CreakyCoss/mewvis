import { createDesktopChatService } from "@/chat/desktop";
// Owned by the application, never created/disposed by a Chat view.
export const chatService = createDesktopChatService();
