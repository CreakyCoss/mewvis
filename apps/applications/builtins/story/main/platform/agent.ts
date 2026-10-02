import {
  getApplicationChatClient,
  type ApplicationChatClient,
  type ApplicationChatSession,
} from "@mewvis/app-sdk/chat";
import type {
  TavernAgentFlowRunAgentInput,
  TavernAgentFlowRunAgentOutput,
} from "@/stories/tavern/room/agent-flow/types";
import { locationForPath } from "./bridge";

export function createApplicationAgentRuntime(
  client: ApplicationChatClient,
  resolveLocation = locationForPath,
) {
  const opening = new Map<string, Promise<ApplicationChatSession>>();
  const active = new Map<string, Promise<unknown>>();
  async function scenePrefix(path: string) {
    const { workspace, relativePath } = await resolveLocation(path);
    const hash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(relativePath),
      ),
    );
    return {
      workspace,
      prefix: `tavern:${Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("")}:`,
    };
  }
  async function sessionFor(input: TavernAgentFlowRunAgentInput) {
    const { workspace, prefix } = await scenePrefix(input.workspacePath);
    const sceneId = prefix + input.agentRoleId;
    const key = `${workspace.id}:${sceneId}`;
    if (opening.has(key)) return opening.get(key)!;
    const pending = (async () => {
      const existing = (
        await client.listSessions({ workspaceId: workspace.id })
      ).find((s) => s.sceneId === sceneId);
      if (existing)
        return client.openSession({
          workspaceId: workspace.id,
          chatId: existing.chatId,
        });
      const session = await client.createSession({
        workspaceId: workspace.id,
        sceneId,
        profile: {
          id: input.agentRoleId,
          systemPrompt: input.systemPrompt || "你正在执行酒馆角色演绎任务。",
          allowedToolNames: input.allowedTools ?? [],
          skills: [],
          useKnowledge: false,
        },
      });
      const saved = await session.flush();
      if (!saved.ok) throw new Error(saved.error);
      return session;
    })().finally(() => opening.delete(key));
    opening.set(key, pending);
    return pending;
  }

  async function run(
    input: TavernAgentFlowRunAgentInput,
  ): Promise<TavernAgentFlowRunAgentOutput> {
    const session = await sessionFor(input);
    const context = await session.setContext({
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      requestContext: input.requestContext || "",
      runtimeInstruction: [input.runtimeInstruction, input.bootstrapInstruction]
        .filter(Boolean)
        .join("\n"),
    });
    if (!context.ok) throw new Error(context.error);
    if (input.runtimeModel?.modelId) {
      const configured = await session.updateConfig({
        selectedModelId: input.runtimeModel.modelId,
        selectedAgentId: "",
      });
      if (!configured.ok) throw new Error(configured.error);
    }
    const start = session.getSnapshot().messages.length;
    const sent = await session.send({ text: input.userMessage });
    if (sent.status !== "dispatched")
      throw new Error(sent.reason || "酒馆任务未启动");
    return new Promise((resolve, reject) => {
      let finished = false;
      let detach = () => {};
      let previous = "";
      let previousThinking = "";
      const finish = (
        error?: Error,
        output?: TavernAgentFlowRunAgentOutput,
      ) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        detach();
        if (error) {
          void session.stop();
          reject(error);
        } else resolve(output!);
      };
      const inspect = () => {
        const snapshot = session.getSnapshot();
        const blocks = snapshot.messages
          .slice(start)
          .filter((m) => m.role === "assistant")
          .flatMap((m) => m.blocks);
        const text = blocks
          .filter((b) => b.type === "text")
          .map((b) => b.content)
          .join("\n");
        const thinking = blocks
          .filter((b) => b.type === "thinking")
          .map((b) => b.content)
          .join("\n");
        if (text !== previous) {
          input.onTextDelta?.(
            text.startsWith(previous) ? text.slice(previous.length) : text,
          );
          previous = text;
        }
        if (thinking !== previousThinking) {
          input.onThinkingDelta?.(
            thinking.startsWith(previousThinking)
              ? thinking.slice(previousThinking.length)
              : thinking,
          );
          previousThinking = thinking;
        }
        if (
          snapshot.error ||
          snapshot.initializationError ||
          snapshot.pendingQuestion
        )
          return finish(
            new Error(
              snapshot.error ||
                snapshot.initializationError ||
                "酒馆 Agent 请求了额外用户输入，当前流程暂不支持中途询问。",
            ),
          );
        if (["closed", "closing"].includes(snapshot.phase))
          return finish(new Error("酒馆任务已关闭"));
        if (snapshot.phase === "idle") {
          if (!text.trim()) return finish(new Error("酒馆 Agent 没有返回文本"));
          finish(undefined, {
            text,
            thinking,
            taskId: sent.taskId || session.identity.id,
            agentSession: { id: session.identity.id },
          });
        }
      };
      const timer = setTimeout(
        () => finish(new Error("酒馆任务超时")),
        5 * 60_000,
      );
      detach = session.subscribe(inspect);
      inspect();
    });
  }
  function runApplicationAgent(input: TavernAgentFlowRunAgentInput) {
    const key = input.workspacePath + ":" + input.agentRoleId;
    if (active.has(key)) return Promise.reject(new Error("该酒馆角色正在运行"));
    const pending = run(input).finally(() => active.delete(key));
    active.set(key, pending);
    return pending;
  }
  async function deleteApplicationAgentSessions(path: string) {
    if ([...active.keys()].some((key) => key.startsWith(path + ":")))
      throw new Error("请等待酒馆运行结束后再清空");
    const { workspace, prefix } = await scenePrefix(path);
    for (const session of await client.listSessions({
      workspaceId: workspace.id,
    })) {
      if (session.sceneId.startsWith(prefix))
        await client.deleteSession({
          workspaceId: workspace.id,
          chatId: session.chatId,
        });
    }
  }

  return {
    run: runApplicationAgent,
    deleteSessions: deleteApplicationAgentSessions,
  };
}
let runtime: ReturnType<typeof createApplicationAgentRuntime> | undefined;
const current = () =>
  (runtime ??= createApplicationAgentRuntime(getApplicationChatClient()));
export const runApplicationAgent = (input: TavernAgentFlowRunAgentInput) =>
  current().run(input);
export const deleteApplicationAgentSessions = (path: string) =>
  current().deleteSessions(path);
