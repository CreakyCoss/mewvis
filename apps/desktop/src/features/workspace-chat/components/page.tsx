import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  FileText,
  Folder,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Send,
  User,
  Wrench,
} from "lucide-react";
import type { CodingAgentEvent } from "@/ai/coding-agent/base";
import { createCodingAgentAdapter } from "@/ai/coding-agent/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { getLlmSettings } from "@/features/llm-settings/api";
import type { LlmProvider } from "@/features/llm-settings/types";
import { findDefaultProvider } from "@/features/llm-settings/utils";
import type { Workspace } from "@/features/workspaces/types";
import {
  chatWithLlm,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "../api";
import type {
  ChatMessage,
  ConversationMessage,
  WorkspaceFile,
  WorkspaceFileEntry,
} from "../types";

type WorkspaceChatPageProps = {
  workspace: Workspace;
  onBack: () => void;
};

const createMessageId = () => crypto.randomUUID();

const stringifyBrief = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);

  if (!text) {
    return "";
  }

  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
};

const describeAgentEvent = (event: CodingAgentEvent) => {
  if (event.type === "started") {
    return "Agent 已启动";
  }

  if (event.type === "tool_start") {
    return `调用工具 ${event.toolName}: ${stringifyBrief(event.args)}`;
  }

  if (event.type === "tool_update") {
    return `工具更新 ${event.toolName}: ${stringifyBrief(event.partialResult)}`;
  }

  if (event.type === "tool_end") {
    return `${event.isError ? "工具失败" : "工具完成"} ${event.toolName}: ${stringifyBrief(event.result)}`;
  }

  if (event.type === "stderr") {
    return `Agent 日志：${event.message}`;
  }

  if (event.type === "exit") {
    return event.success ? "Agent 任务已退出" : `Agent 任务异常退出：${event.code ?? "unknown"}`;
  }

  if (event.type === "error") {
    return `Agent 错误：${event.message}`;
  }

  if (event.type === "done") {
    return "Agent 任务完成";
  }

  return "";
};

const buildSystemPrompt = (
  workspace: Workspace,
  activeFile: WorkspaceFile | null,
) => {
  const fileContext = activeFile
    ? `\n\n当前打开文件：${activeFile.path}\n\n${activeFile.content.slice(0, 12000)}`
    : "";

  return [
    "你是 Novel Claw 的工作区 AI 助手。",
    `工作区名称：${workspace.name}`,
    `工作区路径：${workspace.path}`,
    "你可以帮助用户规划、写作、分析和修改项目文件。",
    "如果需要创建或修改文件，请明确说明目标路径和内容；用户可以在左侧文件编辑器中保存。",
    fileContext,
  ].join("\n");
};

export const WorkspaceChatPage = ({
  workspace,
  onBack,
}: WorkspaceChatPageProps) => {
  const codingAgent = useMemo(() => createCodingAgentAdapter(), []);
  const activeAgentTaskIdRef = useRef("");
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileError, setFileError] = useState("");
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [isFileSaving, setIsFileSaving] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatMode, setChatMode] = useState<"chat" | "agent">("chat");
  const [isSending, setIsSending] = useState(false);
  const [activeAgentTaskId, setActiveAgentTaskId] = useState("");
  const [agentEvents, setAgentEvents] = useState<CodingAgentEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);

  const loadLlmOptions = useCallback(async () => {
    setIsSettingsLoading(true);
    setSettingsError("");

    try {
      const settings = await getLlmSettings();
      const nextProviders = settings.providers;
      const defaultProvider = findDefaultProvider(nextProviders);

      setProviders(nextProviders);
      setSelectedProviderId((currentProviderId) => {
        const currentProvider = nextProviders.find((provider) => provider.id === currentProviderId);
        const nextProvider = currentProvider ?? defaultProvider;

        setSelectedModelId((currentModelId) => {
          const currentModel = nextProvider?.models.find((model) => model.id === currentModelId && model.isEnabled);
          const nextModel = currentModel ?? nextProvider?.models.find((model) => model.isEnabled);
          return nextModel?.id ?? "";
        });

        return nextProvider?.id ?? "";
      });
    } catch (caught) {
      setSettingsError(String(caught));
    } finally {
      setIsSettingsLoading(false);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setIsFilesLoading(true);
    setFileError("");

    try {
      const nextFiles = await listWorkspaceFiles(workspace.path);
      setFiles(nextFiles);
    } catch (caught) {
      setFileError(String(caught));
    } finally {
      setIsFilesLoading(false);
    }
  }, [workspace.path]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    void loadLlmOptions();
  }, [loadLlmOptions]);

  useEffect(() => {
    activeAgentTaskIdRef.current = activeAgentTaskId;
  }, [activeAgentTaskId]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    void codingAgent.subscribe((event) => {
      const currentTaskId = activeAgentTaskIdRef.current;
      if (currentTaskId && event.taskId !== currentTaskId) {
        return;
      }

      if (event.type !== "text_delta") {
        setAgentEvents((current) => [...current, event].slice(-80));
      }

      if (event.type === "done") {
        const assistantText = event.text.trim() || "Agent 任务已完成。";
        setMessages((current) => [
          ...current,
          {
            id: createMessageId(),
            role: "assistant",
            text: assistantText,
            createdAt: Date.now(),
          },
        ]);
        setConversation((current) => [
          ...current,
          {
            role: "assistant",
            content: assistantText,
            timestamp: Date.now(),
          },
        ]);
        setActiveAgentTaskId("");
        void loadFiles();
      }

      if (event.type === "error") {
        setChatError(event.message);
        setActiveAgentTaskId("");
      }

      if (event.type === "exit" && !event.success) {
        setChatError(`Agent 任务异常退出：${event.code ?? "unknown"}`);
        setActiveAgentTaskId("");
      }
    }).then((unsubscribe) => {
      cleanup = unsubscribe;
    });

    return () => {
      cleanup?.();
    };
  }, [codingAgent, loadFiles]);

  const selectableFiles = useMemo(
    () => files.filter((file) => !file.isDirectory),
    [files],
  );

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const selectedModels = useMemo(
    () => selectedProvider?.models.filter((model) => model.isEnabled) ?? [],
    [selectedProvider],
  );

  const selectedModel = useMemo(
    () => selectedModels.find((model) => model.id === selectedModelId)
      ?? selectedModels[0]
      ?? null,
    [selectedModelId, selectedModels],
  );

  useEffect(() => {
    if (!selectedProvider) {
      setSelectedModelId("");
      return;
    }

    if (!selectedModel || !selectedProvider.models.some((model) => model.id === selectedModel.id)) {
      setSelectedModelId(selectedProvider.models.find((model) => model.isEnabled)?.id ?? "");
    }
  }, [selectedModel, selectedProvider]);

  const openFile = async (path: string) => {
    setFileError("");

    try {
      const file = await readWorkspaceFile(workspace.path, path);
      setActiveFile(file);
      setFilePath(file.path);
      setFileContent(file.content);
    } catch (caught) {
      setFileError(String(caught));
    }
  };

  const prepareNewFile = () => {
    setActiveFile(null);
    setFilePath("");
    setFileContent("");
    setFileError("");
  };

  const saveFile = async () => {
    setIsFileSaving(true);
    setFileError("");

    try {
      const saved = await writeWorkspaceFile(workspace.path, filePath, fileContent);
      setActiveFile(saved);
      setFilePath(saved.path);
      setFileContent(saved.content);
      await loadFiles();
    } catch (caught) {
      setFileError(String(caught));
    } finally {
      setIsFileSaving(false);
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const text = prompt.trim();
    if (!text || isSending || activeAgentTaskId) {
      return;
    }

    const now = Date.now();
    const userMessage: ConversationMessage = {
      role: "user",
      content: text,
      timestamp: now,
    };
    const nextConversation = [...conversation, userMessage];
    const userUiMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      text,
      createdAt: now,
    };

    setPrompt("");
    setMessages((current) => [...current, userUiMessage]);
    setConversation(nextConversation);
    setIsSending(true);
    setChatError("");

    try {
      if (!selectedProvider || !selectedModel) {
        throw new Error("请选择要使用的 LLM 和模型");
      }

      if (chatMode === "agent") {
        setAgentEvents([]);
        const task = await codingAgent.startTask({
          workspacePath: workspace.path,
          prompt: text,
          provider: selectedProvider,
          model: selectedModel,
          allowedTools: ["read", "edit", "write"],
        });
        setActiveAgentTaskId(task.taskId);
        return;
      }

      const result = await chatWithLlm({
        provider: selectedProvider,
        model: selectedModel,
        systemPrompt: buildSystemPrompt(workspace, activeFile),
        messages: nextConversation,
      });
      const assistantText = result.text.trim();

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          text: assistantText,
          createdAt: Date.now(),
        },
      ]);
      setConversation((current) => [
        ...current,
        {
          role: "assistant",
          content: assistantText,
          timestamp: Date.now(),
        },
      ]);
    } catch (caught) {
      setChatError(String(caught));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="flex h-screen min-h-screen bg-background text-foreground">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-muted/20">
        <div className="border-b border-border px-4 py-4">
          <Button type="button" variant="ghost" onClick={onBack} className="mb-3 px-2">
            <ArrowLeft className="size-4" />
            <span>工作区</span>
          </Button>
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-lg font-semibold">{workspace.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{workspace.path}</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Folder className="size-4" />
              <span>文件</span>
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="刷新文件"
                onClick={() => void loadFiles()}
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="新建文件"
                onClick={prepareNewFile}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="h-56 border-b border-border">
            <div className="space-y-1 p-2">
              {isFilesLoading ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  正在读取文件
                </div>
              ) : selectableFiles.length ? (
                selectableFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[active=true]:bg-muted"
                    data-active={file.path === activeFile?.path}
                    onClick={() => void openFile(file.path)}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                  </button>
                ))
              ) : (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  暂无可编辑文件
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <Input
              value={filePath}
              onChange={(event) => setFilePath(event.currentTarget.value)}
              placeholder="例如：chapters/01.md"
            />
            <Textarea
              value={fileContent}
              onChange={(event) => setFileContent(event.currentTarget.value)}
              placeholder="选择文件或输入新文件内容"
              className="min-h-0 flex-1 resize-none font-mono text-sm"
            />
            {fileError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {fileError}
              </div>
            )}
            <Button
              type="button"
              onClick={() => void saveFile()}
              disabled={isFileSaving || !filePath.trim()}
            >
              {isFileSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              <span>{activeFile ? "保存修改" : "创建文件"}</span>
            </Button>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <MessageSquare className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold">AI 聊天</h2>
              <p className="text-xs text-muted-foreground">
                当前模型：{selectedProvider?.name ?? "未选择"} / {selectedModel?.modelName ?? "未选择"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 rounded-md border border-input bg-background p-0.5">
              <Button
                type="button"
                size="sm"
                variant={chatMode === "chat" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setChatMode("chat")}
              >
                <MessageSquare className="size-3.5" />
                <span>聊天</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={chatMode === "agent" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setChatMode("agent")}
              >
                <Wrench className="size-3.5" />
                <span>Agent</span>
              </Button>
            </div>
            <select
              className="h-9 max-w-48 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              value={selectedProviderId}
              disabled={isSettingsLoading || providers.length === 0}
              onChange={(event) => {
                const providerId = event.currentTarget.value;
                const provider = providers.find((item) => item.id === providerId);
                setSelectedProviderId(providerId);
                setSelectedModelId(provider?.models.find((model) => model.isEnabled)?.id ?? "");
              }}
            >
              {providers.length === 0 ? (
                <option value="">未配置 LLM</option>
              ) : (
                providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))
              )}
            </select>
            <select
              className="h-9 max-w-56 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              value={selectedModel?.id ?? ""}
              disabled={!selectedProvider || selectedModels.length === 0}
              onChange={(event) => setSelectedModelId(event.currentTarget.value)}
            >
              {selectedModels.length === 0 ? (
                <option value="">未启用模型</option>
              ) : (
                selectedModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.modelName || model.modelId}
                  </option>
                ))
              )}
            </select>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="刷新 LLM 配置"
              onClick={() => void loadLlmOptions()}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Badge variant={selectedProvider && selectedModel ? "secondary" : "outline"}>
              {selectedProvider && selectedModel
                ? chatMode === "agent" ? codingAgent.name : "后端请求"
                : "待配置"}
            </Badge>
            {activeAgentTaskId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void codingAgent.abortTask(activeAgentTaskId)}
              >
                停止
              </Button>
            )}
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/20 px-6 text-center">
                <Bot className="size-8 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="text-base font-medium">开始和工作区助手对话</h3>
                  <p className="text-sm text-muted-foreground">
                    选择文件后提问，助手会把当前文件内容纳入上下文。
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className="flex gap-3 data-[role=user]:justify-end"
                  data-role={message.role}
                >
                  {message.role === "assistant" && (
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Bot className="size-4" />
                    </div>
                  )}
                  <div
                    className="max-w-[78%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6 data-[role=assistant]:bg-muted data-[role=user]:bg-primary data-[role=user]:text-primary-foreground"
                    data-role={message.role}
                  >
                    {message.text}
                  </div>
                  {message.role === "user" && (
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <User className="size-4" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border px-6 py-4">
          {agentEvents.length > 0 && (
            <div className="mx-auto mb-3 max-w-4xl rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Wrench className="size-3.5" />
                <span>Agent 执行</span>
              </div>
              <div className="max-h-28 space-y-1 overflow-auto text-xs text-muted-foreground">
                {agentEvents.map((event, index) => (
                  <div key={`${event.taskId}-${event.type}-${index}`}>
                    {describeAgentEvent(event)}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(chatError || settingsError) && (
            <div className="mx-auto mb-3 max-w-4xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {chatError || settingsError}
            </div>
          )}
          <form
            action="#"
            className="mx-auto flex max-w-4xl items-end gap-2"
            onSubmit={(event) => void sendMessage(event)}
          >
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              placeholder="输入问题，或描述希望创建/修改的文件"
              rows={3}
              className="max-h-40 min-h-20 resize-none"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button type="submit" disabled={isSending || Boolean(activeAgentTaskId) || !prompt.trim()}>
              {isSending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              <span>发送</span>
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
};
