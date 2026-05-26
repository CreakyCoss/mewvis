import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  loadSkillsFromDir,
  ModelRegistry,
  SessionManager,
  type AgentSessionEvent,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { normalizeAllowedAgentTools } from "../../contracts/tools.js";
import type {
  AgentRunResult,
  StartTaskCommand,
} from "../../contracts/protocol.js";
import type { AgentRuntimeContext, AskUser, BaseAgent } from "../../contracts/runtime.js";
import { parsePiAskUserFunctionCall, registerPiAskUserTool } from "./tools/ask-user.js";
import { createPiRuntimeModel, requirePiApiKey, type PiModelSource } from "./model.js";

const PI_AGENT_MODEL_SOURCE = "input" satisfies PiModelSource;

export class PiAgent implements BaseAgent {
  readonly id = "pi";

  async run(command: StartTaskCommand, { askUser, emit }: AgentRuntimeContext): Promise<AgentRunResult> {
    const apiKey = requirePiApiKey(command.provider);
    const model = createPiRuntimeModel(command.provider, command.model, {
      modelSource: PI_AGENT_MODEL_SOURCE,
    });
    const authStorage = AuthStorage.inMemory();
    authStorage.setRuntimeApiKey(model.provider, apiKey);
    const resourceLoader = await this.createResourceLoader(command, askUser);

    const { session } = await createAgentSession({
      cwd: command.workspacePath,
      authStorage,
      modelRegistry: ModelRegistry.inMemory(authStorage),
      sessionManager: SessionManager.inMemory(command.workspacePath),
      resourceLoader,
      model,
      tools: normalizeAllowedAgentTools(command.allowedTools),
    });

    let assistantText = "";
    let streamedText = "";
    const unsubscribe = session.subscribe((event) => {
      switch (event.type) {
        case "agent_start":
        case "agent_end":
        case "turn_start":
        case "turn_end":
        case "message_start":
        case "queue_update":
        case "compaction_start":
        case "compaction_end":
        case "session_info_changed":
        case "thinking_level_changed":
        case "auto_retry_start":
        case "auto_retry_end":
          return;
        case "message_update":
          switch (event.assistantMessageEvent.type) {
            case "text_delta":
              assistantText += event.assistantMessageEvent.delta;
              streamedText += event.assistantMessageEvent.delta;
              emit({
                type: "text_delta",
                taskId: command.taskId,
                delta: event.assistantMessageEvent.delta,
              });
              return;
            case "thinking_delta":
              emit({
                type: "thinking_delta",
                taskId: command.taskId,
                delta: event.assistantMessageEvent.delta,
              });
              return;
            case "thinking_end":
              emit({
                type: "thinking_end",
                taskId: command.taskId,
                content: event.assistantMessageEvent.content,
              });
              return;
            case "start":
            case "text_start":
            case "text_end":
            case "thinking_start":
            case "toolcall_start":
            case "toolcall_delta":
            case "toolcall_end":
            case "done":
            case "error":
              return;
            default:
              this.assertNever(event.assistantMessageEvent);
          }
          return;
        case "message_end": {
          const text = this.getMessageText(event);
          if (text) {
            assistantText = text;
          }
          const thinking = this.getMessageThinking(event);
          if (thinking) {
            emit({
              type: "thinking_end",
              taskId: command.taskId,
              content: thinking,
            });
          }
          return;
        }
        case "tool_execution_start":
          emit({
            type: "tool_start",
            taskId: command.taskId,
            toolName: event.toolName,
            args: event.args,
          });
          return;
        case "tool_execution_update":
          emit({
            type: "tool_update",
            taskId: command.taskId,
            toolName: event.toolName,
            partialResult: event.partialResult,
          });
          return;
        case "tool_execution_end":
          emit({
            type: "tool_end",
            taskId: command.taskId,
            toolName: event.toolName,
            isError: event.isError,
            result: event.result,
          });
          return;
        default:
          this.assertNever(event);
      }
    });

    try {
      emit({ type: "started", taskId: command.taskId });
      let nextPrompt: string | null = command.prompt;
      while (nextPrompt) {
        assistantText = "";
        streamedText = "";
        await session.prompt(nextPrompt);

        const askUserCall = parsePiAskUserFunctionCall(assistantText || streamedText);
        if (!askUserCall) {
          break;
        }

        emit({
          type: "replace_text",
          taskId: command.taskId,
          text: "",
        });
        const answer = await askUser(
          command.taskId,
          askUserCall.question,
          askUserCall.context,
          askUserCall.input,
        );
        nextPrompt = `用户回答了你刚才的问题：${answer}\n\n请基于这个回答继续执行原任务。`;
      }
      const result = {
        text: assistantText.trim(),
      };
      emit({
        type: "done",
        taskId: command.taskId,
        text: result.text,
      });
      return result;
    } finally {
      unsubscribe();
      session.dispose();
    }
  }

  private async createResourceLoader(
    command: StartTaskCommand,
    askUser: AskUser,
  ) {
    const enabledSkills = this.loadEnabledSkills(command);
    const loader = new DefaultResourceLoader({
      cwd: command.workspacePath,
      agentDir: getAgentDir(),
      noExtensions: true,
      noSkills: true,
      extensionFactories: [
        (pi) => {
          registerPiAskUserTool(pi, command.taskId, askUser);
        },
      ],
      skillsOverride: () => ({
        skills: enabledSkills,
        diagnostics: [],
      }),
    });

    await loader.reload();
    return loader;
  }

  private loadEnabledSkills(command: StartTaskCommand): Skill[] {
    const enabledNames = new Set(command.enabledSkills ?? []);
    const paths = this.skillSourcePaths(command);
    if (paths.length === 0 || enabledNames.size === 0) {
      return [];
    }

    const skills = paths.flatMap((dir) =>
      loadSkillsFromDir({
        dir,
        source: "bridge",
      }).skills,
    );

    return skills.filter((skill) => enabledNames.has(skill.name));
  }

  private skillSourcePaths(command: StartTaskCommand) {
    const paths = [
      ...(Array.isArray(command.bundledSkillsPath)
        ? command.bundledSkillsPath
        : command.bundledSkillsPath
          ? [command.bundledSkillsPath]
          : []),
      ...(command.skillPaths ?? []),
    ];

    return [...new Set(paths.filter(Boolean))];
  }

  private getMessageText(event: Extract<AgentSessionEvent, { type: "message_end" }>) {
    const content = "content" in event.message && Array.isArray(event.message.content)
      ? event.message.content
      : [];
    return content
      .filter((item): item is { type: "text"; text: string } => item.type === "text")
      .map((item) => item.text)
      .join("")
      .trim();
  }

  private getMessageThinking(event: Extract<AgentSessionEvent, { type: "message_end" }>) {
    const content = "content" in event.message && Array.isArray(event.message.content)
      ? event.message.content
      : [];
    return content
      .filter((item): item is { type: "thinking"; thinking: string } => item.type === "thinking")
      .map((item) => item.thinking)
      .join("")
      .trim();
  }

  private assertNever(value: never): never {
    throw new Error(`Unhandled event: ${JSON.stringify(value)}`);
  }
}
