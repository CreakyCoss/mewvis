import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  loadSkillsFromDir,
  ModelRegistry,
  SessionManager,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { Type, type Api, type Model } from "@earendil-works/pi-ai";

type ProviderInput = {
  id: string;
  name: string;
  vendor: string;
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
};

type ModelInput = {
  id: string;
  modelId: string;
  modelName: string;
};

type StartTaskCommand = {
  type: "start_task";
  taskId: string;
  workspacePath: string;
  prompt: string;
  provider: ProviderInput;
  model: ModelInput;
  allowedTools?: string[];
  bundledSkillsPath?: string | null;
  enabledSkills?: string[];
};

type AnswerQuestionCommand = {
  type: "answer_question";
  taskId: string;
  questionId: string;
  answer: string;
};

type BridgeCommand = StartTaskCommand | AnswerQuestionCommand;

type BridgeEvent =
  | { type: "started"; taskId: string }
  | {
    type: "question";
    taskId: string;
    questionId: string;
    question: string;
    context?: string | null;
    input?: AskUserInput;
  }
  | { type: "question_answered"; taskId: string; questionId: string; answer: string }
  | { type: "replace_text"; taskId: string; text: string }
  | { type: "text_delta"; taskId: string; delta: string }
  | { type: "thinking_delta"; taskId: string; delta: string }
  | { type: "thinking_end"; taskId: string; content: string }
  | { type: "tool_start"; taskId: string; toolName: string; args: unknown }
  | { type: "tool_update"; taskId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; taskId: string; toolName: string; isError: boolean; result: unknown }
  | { type: "done"; taskId: string; text: string }
  | { type: "error"; taskId?: string; message: string };

const writeEvent = (event: BridgeEvent) => {
  output.write(`${JSON.stringify(event)}\n`);
};

const pendingQuestions = new Map<string, (answer: string) => void>();

type AskUserOption = {
  value: string;
  label: string;
  description?: string;
};

type AskUserInput = {
  type: "text" | "select";
  label?: string;
  options?: AskUserOption[];
  selected?: string;
};

type ParsedAskUserCall = {
  question: string;
  context?: string | null;
  input?: AskUserInput;
};

const apiForProvider = (provider: string): Api => {
  if (provider === "anthropic") {
    return "anthropic-messages";
  }

  if (provider === "google") {
    return "google-generative-ai";
  }

  return "openai-completions";
};

const createRuntimeModel = (
  provider: ProviderInput,
  selectedModel: ModelInput,
): Model<Api> => {
  return {
    id: selectedModel.modelId,
    name: selectedModel.modelName || selectedModel.modelId,
    api: apiForProvider(provider.provider),
    provider: provider.vendor || provider.provider,
    baseUrl: provider.baseUrl ?? "",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 8192,
  };
};

const loadEnabledSkills = (command: StartTaskCommand): Skill[] => {
  const enabledNames = new Set(command.enabledSkills ?? []);
  if (!command.bundledSkillsPath || enabledNames.size === 0) {
    return [];
  }

  const { skills } = loadSkillsFromDir({
    dir: command.bundledSkillsPath,
    source: "novel-claw",
  });

  return skills.filter((skill) => enabledNames.has(skill.name));
};

const askUser = (
  taskId: string,
  question: string,
  context?: string | null,
  input?: AskUserInput,
) => {
  const questionId = randomUUID();

  writeEvent({
    type: "question",
    taskId,
    questionId,
    question,
    context: context ?? null,
    input,
  });

  return new Promise<string>((resolve) => {
    pendingQuestions.set(questionId, resolve);
  });
};

const decodeXmlText = (value: string) =>
  value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const extractXmlParameter = (text: string, name: string) => {
  const pattern = new RegExp(`<parameter\\s+name=["']${name}["']>([\\s\\S]*?)<\\/parameter>`, "i");
  const match = text.match(pattern);
  return match ? decodeXmlText(match[1].trim()) : undefined;
};

const normalizeAskUserInput = (value: unknown): AskUserInput | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as Partial<AskUserInput>;
  if (input.type !== "select" && input.type !== "text") {
    return undefined;
  }

  return {
    type: input.type,
    label: typeof input.label === "string" ? input.label : undefined,
    selected: typeof input.selected === "string" ? input.selected : undefined,
    options: Array.isArray(input.options)
      ? input.options
        .reduce<AskUserOption[]>((options, option) => {
          if (!option || typeof option !== "object") {
            return options;
          }
          const item = option as Partial<AskUserOption>;
          if (typeof item.value !== "string" || typeof item.label !== "string") {
            return options;
          }
          options.push({
            value: item.value,
            label: item.label,
            description: typeof item.description === "string" ? item.description : undefined,
          });
          return options;
        }, [])
      : undefined,
  };
};

const parseAskUserFunctionCall = (text: string): ParsedAskUserCall | null => {
  if (!text.includes("<invoke") || !text.includes("ask_user")) {
    return null;
  }

  const question = extractXmlParameter(text, "question");
  if (!question) {
    return null;
  }

  const context = extractXmlParameter(text, "context") ?? null;
  const inputText = extractXmlParameter(text, "input");
  let parsedInput: AskUserInput | undefined;
  if (inputText) {
    try {
      parsedInput = normalizeAskUserInput(JSON.parse(inputText));
    } catch {
      parsedInput = undefined;
    }
  }

  return {
    question,
    context,
    input: parsedInput,
  };
};

const createResourceLoader = async (command: StartTaskCommand) => {
  const enabledSkills = loadEnabledSkills(command);
  const loader = new DefaultResourceLoader({
    cwd: command.workspacePath,
    agentDir: getAgentDir(),
    noExtensions: true,
    noSkills: true,
    extensionFactories: [
      (pi) => {
        pi.registerTool({
          name: "ask_user",
          label: "Ask User",
          description: "Ask the user a question and wait for their answer. Use text for open-ended answers. Use select only when you provide at least two options.",
          parameters: Type.Object({
            question: Type.String({ description: "The question to show the user" }),
            context: Type.Optional(Type.String({ description: "Optional short context explaining why this is needed" })),
            input: Type.Optional(Type.Object({
              type: Type.Union([
                Type.Literal("text"),
                Type.Literal("select"),
              ], { description: "The UI control type to render for the answer" }),
              label: Type.Optional(Type.String({ description: "Short label shown above the control" })),
              options: Type.Optional(Type.Array(Type.Object({
                value: Type.String({ description: "Stable value returned to the agent when this option is selected" }),
                label: Type.String({ description: "Human readable option label" }),
                description: Type.Optional(Type.String({ description: "Optional helper text for this option" })),
              }), { description: "Required when type is select. Provide at least two options, optionally including { value: 'other', label: '请输入' } for free-form input." })),
              selected: Type.Optional(Type.String({ description: "Default selected option value" })),
            })),
          }),
          execute: async (_toolCallId, params) => {
            const answer = await askUser(command.taskId, params.question, params.context, params.input);

            return {
              content: [{ type: "text", text: answer }],
              details: {
                question: params.question,
                context: params.context ?? null,
                input: params.input ?? null,
                answer,
              },
            };
          },
        });
      },
    ],
    skillsOverride: () => ({
      skills: enabledSkills,
      diagnostics: [],
    }),
  });

  await loader.reload();
  return loader;
};

const runTask = async (command: StartTaskCommand) => {
  const apiKey = command.provider.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`${command.provider.name} 未配置 API Key`);
  }

  const model = createRuntimeModel(command.provider, command.model);
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(model.provider, apiKey);
  const resourceLoader = await createResourceLoader(command);

  const { session } = await createAgentSession({
    cwd: command.workspacePath,
    authStorage,
    modelRegistry: ModelRegistry.inMemory(authStorage),
    sessionManager: SessionManager.inMemory(command.workspacePath),
    resourceLoader,
    model,
    tools: command.allowedTools ?? ["read", "edit", "write", "ls", "find", "grep", "ask_user"],
  });

  let assistantText = "";
  let streamedText = "";
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        assistantText += event.assistantMessageEvent.delta;
        streamedText += event.assistantMessageEvent.delta;
        writeEvent({
          type: "text_delta",
          taskId: command.taskId,
          delta: event.assistantMessageEvent.delta,
        });
        return;
      }

      if (event.assistantMessageEvent.type === "thinking_delta") {
        writeEvent({
          type: "thinking_delta",
          taskId: command.taskId,
          delta: event.assistantMessageEvent.delta,
        });
        return;
      }

      if (event.assistantMessageEvent.type === "thinking_end") {
        writeEvent({
          type: "thinking_end",
          taskId: command.taskId,
          content: event.assistantMessageEvent.content,
        });
        return;
      }
    }

    if (event.type === "message_end") {
      const content = "content" in event.message && Array.isArray(event.message.content)
        ? event.message.content
        : [];
      const text = content
        .filter((item): item is { type: "text"; text: string } => item.type === "text")
        .map((item) => item.text)
        .join("")
        .trim();
      if (text) {
        assistantText = text;
      }
      const thinking = content
        .filter((item): item is { type: "thinking"; thinking: string } => item.type === "thinking")
        .map((item) => item.thinking)
        .join("")
        .trim();
      if (thinking) {
        writeEvent({
          type: "thinking_end",
          taskId: command.taskId,
          content: thinking,
        });
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      writeEvent({
        type: "tool_start",
        taskId: command.taskId,
        toolName: event.toolName,
        args: event.args,
      });
      return;
    }

    if (event.type === "tool_execution_update") {
      writeEvent({
        type: "tool_update",
        taskId: command.taskId,
        toolName: event.toolName,
        partialResult: event.partialResult,
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      writeEvent({
        type: "tool_end",
        taskId: command.taskId,
        toolName: event.toolName,
        isError: event.isError,
        result: event.result,
      });
    }
  });

  try {
    writeEvent({ type: "started", taskId: command.taskId });
    let nextPrompt: string | null = command.prompt;
    while (nextPrompt) {
      assistantText = "";
      streamedText = "";
      await session.prompt(nextPrompt);

      const askUserCall = parseAskUserFunctionCall(assistantText || streamedText);
      if (!askUserCall) {
        break;
      }

      writeEvent({
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
    writeEvent({
      type: "done",
      taskId: command.taskId,
      text: assistantText.trim(),
    });
  } finally {
    unsubscribe();
    session.dispose();
  }
};

const parseCommand = (line: string): BridgeCommand => {
  if (!line.trim()) {
    throw new Error("未收到 Agent bridge 命令");
  }

  const command = JSON.parse(line) as BridgeCommand;
  if (command.type !== "start_task" && command.type !== "answer_question") {
    throw new Error(`未知 Agent bridge 命令：${(command as { type?: string }).type}`);
  }

  return command;
};

const handleAnswer = (command: AnswerQuestionCommand) => {
  const resolve = pendingQuestions.get(command.questionId);
  if (!resolve) {
    writeEvent({
      type: "error",
      taskId: command.taskId,
      message: `未找到待回答的问题：${command.questionId}`,
    });
    return;
  }

  pendingQuestions.delete(command.questionId);
  writeEvent({
    type: "question_answered",
    taskId: command.taskId,
    questionId: command.questionId,
    answer: command.answer,
  });
  resolve(command.answer);
};

const readFollowUpCommands = async (
  reader: ReturnType<typeof createInterface>,
) => {
  for await (const line of reader) {
    const command = parseCommand(line);
    if (command.type === "answer_question") {
      handleAnswer(command);
      continue;
    }

    writeEvent({
      type: "error",
      taskId: command.taskId,
      message: "当前 Agent bridge 已有运行中的任务，无法启动新任务",
    });
  }
};

const main = async () => {
  const reader = createInterface({ input });
  const iterator = reader[Symbol.asyncIterator]();
  const line = await iterator.next();

  if (line.done) {
    throw new Error("未收到 Agent bridge 命令");
  }

  const command = parseCommand(line.value);
  if (command.type !== "start_task") {
    throw new Error("Agent bridge 首条命令必须是 start_task");
  }

  const followUpReader = readFollowUpCommands(reader).catch((error: unknown) => {
    writeEvent({
      type: "error",
      taskId: command.taskId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  await runTask(command);
  reader.close();
  await followUpReader;
};

main().catch((error: unknown) => {
  writeEvent({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
