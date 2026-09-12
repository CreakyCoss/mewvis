import type { AgentClient } from "@/agent-client/runtime";
import { resolveLlmModel } from "@/api/llm";
import { searchEnabledKnowledge } from "@/api/knowledge";
import { releaseAgentRuntimeSession } from "@/api/agent-runtime";
import { isTauri } from "@tauri-apps/api/core";
import type { ChatRuntime, ChatContextProvider } from "../core";
import type { createDesktopCatalog, ChatProfile } from "./catalog";
import { buildAgentPrompt } from "./context";
import type { ChatOrigin } from "@/api/chat";

export function createDesktopRuntime(
  client: AgentClient,
  workspacePath: string,
  chatId: string,
  catalog: ReturnType<typeof createDesktopCatalog>,
  readProfile: () => ChatProfile,
  origin: ChatOrigin,
) {
  const sessionRootDir = `chats/${chatId}/session`;
  const context: ChatContextProvider = {
    async prepare(turn, signal) {
      // A scene revision applies to the next turn; an in-flight preparation keeps its own context.
      const profile = readProfile();
      const details = catalog.getDetails();
      const { config, input } = turn;
      const collections = (details.resources.knowledgeCollections ?? []).filter((item) =>
        config.selectedKnowledgeCollectionIds.includes(item.value),
      );
      const knowledge = collections.length
        ? await searchEnabledKnowledge({
            collectionIds: collections.map((item) => item.value),
            query: input.text,
            maxResults: 8,
            minScore: 0,
          }).catch(() => null)
        : null;
      signal.throwIfAborted();
      const custom = await profile.context?.(turn, signal);
      signal.throwIfAborted();
      const prompt = buildAgentPrompt(
        profile.systemPrompt(workspacePath),
        {
          blocks: input.blocks ?? [],
          skills: details.skills.filter((skill) => config.selectedSkillKeys.includes(skill.key)),
          tools: (details.resources.tools ?? []).map((tool) => tool.value),
          agent: details.agents.find((agent) => agent.id === config.selectedAgentId) ?? null,
          knowledgeCollections: collections,
        },
        knowledge,
      );
      return {
        systemPrompt: custom?.systemPrompt ?? prompt.systemPrompt,
        requestContext: [prompt.requestContext, custom?.requestContext].filter(Boolean).join("\n\n"),
        runtimeInstruction: [prompt.runtimeInstruction, custom?.runtimeInstruction].filter(Boolean).join("\n\n"),
      };
    },
  };
  const runtime: ChatRuntime = {
    async authorize(_turn, signal) {
      await readProfile().authorize?.();
      signal.throwIfAborted();
    },
    subscribe: (listener) => client.events.subscribe(listener),
    async prepare(turn, signal) {
      const permissionMode = turn.config.permissionMode;
      if (!permissionMode) throw new Error("尚未选择执行权限。");
      const model = await resolveLlmModel(turn.config.selectedModelId, turn.config.thinkingLevel);
      signal.throwIfAborted();
      const details = catalog.getDetails();
      const agent = details.agents.find((item) => item.id === turn.config.selectedAgentId);
      const skills = details.skills
        .filter((skill) => turn.config.selectedSkillKeys.includes(skill.key))
        .map((skill) => skill.name);
      return {
        author: { name: agent?.name, avatar: agent?.avatar },
        async dispatch() {
          await readProfile().authorize?.();
          signal.throwIfAborted();
          const profile = readProfile();
          const tools = profile.resolveToolNames?.() ?? profile.allowedToolNames;
          await client.agent.run({
            taskId: turn.taskId,
            ...(origin.kind === "plugin" ? { pluginId: origin.pluginId } : {}),
            workspacePath,
            sessionRootDir,
            agentRoleId: chatId,
            userMessage: turn.input.text,
            ...turn.context,
            runtimeModel: model,
            permissions: {
              mode: permissionMode,
            },
            resources: {
              ...(tools ? { tools: { allowed: [...new Set(tools)] } } : {}),
              skills: { enabled: [...new Set(skills)] },
            },
          });
        },
      };
    },
    abort: (taskId) => client.tasks.abort(taskId),
    answer: (taskId, questionId, answer) => client.tasks.answerQuestion({ taskId, questionId, answer }),
    release: () =>
      typeof window !== "undefined" && isTauri()
        ? releaseAgentRuntimeSession({ workspacePath, sessionRootDir })
        : Promise.resolve(),
  };
  return { runtime, context };
}
