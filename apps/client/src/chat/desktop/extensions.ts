import type { UIExecutionSource } from "@isle/extension-host/ui/react";
import type { DesktopChatService } from "./service";

/** Translate the desktop session into the native UI execution port. No plugin-specific state. */
export function createChatExecutionSource(service: DesktopChatService): UIExecutionSource {
  const current = (context: { workspacePath: string; chatId: string }, taskId: string) => {
    const session = service.findSession(context.workspacePath, context.chatId);
    if (!session || session.getSnapshot().activeTaskId !== taskId) throw new Error("任务已结束或变化");
    return session;
  };
  return {
    getSnapshot: ({ workspacePath, chatId }) => service.findSession(workspacePath, chatId)?.getSnapshot().execution,
    subscribe: (context, listener) =>
      service.subscribe((session) => {
        const location = service.getLocation(session);
        if (location?.workspacePath === context.workspacePath && location.chatId === context.chatId) listener();
      }),
    async resume(context, taskId) {
      const result = await current(context, taskId).resume?.();
      if (!result) throw new Error("宿主未实现继续能力");
      if (!result.ok) throw new Error(result.error);
    },
    async cancel(context, taskId) {
      const result = await current(context, taskId).stop();
      if (!result.ok) throw new Error(result.error);
    },
  };
}
