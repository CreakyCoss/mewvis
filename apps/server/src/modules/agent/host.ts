import { existsSync, realpathSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { AgentRuntimeSupervisor } from "./runtime/supervisor.js";
import { sessionId } from "../../shared/session-id.js";
import {
  nonempty,
  object,
  onlyKeys,
  optionalString,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";

const queryCommands: Record<string, { method: string; result: string }> = {
  read_agent_runtime_session: {
    method: "session/read",
    result: "session_result",
  },
  get_agent_runtime_session: {
    method: "runtime/session/read",
    result: "runtime_session_result",
  },
  get_agent_runtime_session_debug: {
    method: "runtime/session/debug/read",
    result: "runtime_session_debug_result",
  },
  get_agent_runtime_collaboration_timeline: {
    method: "collaboration/timeline/read",
    result: "collaboration_timeline_result",
  },
};

export const commandNames = [
  "list_extension_commands",
  "execute_extension_command",
  "list_agent_runtime_tools",
  "run_agent_runtime_chat",
  "run_agent_runtime_agent",
  "run_agent_runtime_collaboration",
  "run_agent_runtime_collaboration_mode",
  "answer_agent_runtime_question",
  "answer_agent_runtime_approval",
  "abort_agent_runtime_agent",
  "resume_agent_runtime_agent",
  ...Object.keys(queryCommands),
  "list_agent_runtime_sessions",
  "summarize_agent_runtime_session",
  "release_agent_runtime_session",
  "delete_agent_runtime_session",
] as const;

function workspace(value: unknown): string {
  const path = nonempty(value, "workspacePath");
  if (!isAbsolute(path))
    throw new ServiceError(
      400,
      "INVALID_ARGUMENT",
      "workspacePath 必须是绝对路径",
    );
  try {
    const canonical = realpathSync(path);
    if (!statSync(canonical).isDirectory()) throw new Error("not a directory");
    return canonical;
  } catch {
    throw new ServiceError(
      400,
      "WORKSPACE_UNAVAILABLE",
      "工作区目录不存在或不可访问",
    );
  }
}

// Resolve existing symlinks even when the final session directory has not been created yet.
function canonicalTarget(path: string): string {
  const pending: string[] = [];
  let parent = resolve(path);
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (parent === next)
      throw new ServiceError(400, "INVALID_ARGUMENT", "无法解析会话路径");
    pending.unshift(parent.slice(next.length).replace(/^[/\\]/, ""));
    parent = next;
  }
  return resolve(realpathSync(parent), ...pending);
}

export class AgentRuntimeHost {
  constructor(
    readonly supervisor: AgentRuntimeSupervisor,
    private applicationSession?: (
      id: unknown,
    ) => Promise<{ access: unknown; resources: JsonObject }>,
    private resumeTask?: (taskId: string) => Promise<void>,
  ) {}

  private sessionPath(
    workspacePath: string,
    value: unknown,
    required = false,
  ): string | undefined {
    const raw = optionalString(value, "sessionRootDir");
    if (!raw) {
      if (required)
        throw new ServiceError(
          400,
          "INVALID_ARGUMENT",
          "sessionRootDir 不能为空",
        );
      return undefined;
    }
    if (isAbsolute(raw)) return canonicalTarget(raw);
    const parts = raw.split(sep);
    if (
      parts.some((part) => !part || part.startsWith(".") || part.includes(".."))
    ) {
      throw new ServiceError(
        400,
        "INVALID_ARGUMENT",
        "sessionRootDir 相对路径不合法",
      );
    }
    return canonicalTarget(
      join(workspacePath, this.supervisor.config.appDataDirName, raw),
    );
  }

  private underDataRoot(
    workspacePath: string,
    target: string,
    allowRoot = false,
  ) {
    // Reject a data-root symlink pointing outside the workspace as well as escaping session symlinks.
    const root = canonicalTarget(
      join(workspacePath, this.supervisor.config.appDataDirName),
    );
    const workspaceRelative = relative(workspacePath, root);
    const child = relative(root, target);
    if (
      workspaceRelative.startsWith(`..${sep}`) ||
      workspaceRelative === ".." ||
      isAbsolute(workspaceRelative) ||
      child.startsWith(`..${sep}`) ||
      child === ".." ||
      isAbsolute(child) ||
      (!allowRoot && !child)
    ) {
      throw new ServiceError(
        400,
        "INVALID_ARGUMENT",
        "会话路径必须位于工作区数据目录内，且不能是数据根目录",
      );
    }
  }

  private resources(
    workspacePath: string,
    value: unknown,
    collaboration: boolean,
  ): JsonObject {
    const resources =
      value == null ? {} : structuredClone(object(value, "resources"));
    onlyKeys(resources, ["tools", "skills", "mcp", "applications"]);
    if (resources.applications != null) {
      throw new ServiceError(
        400,
        "INVALID_ARGUMENT",
        "应用资源由 Server 按 applicationId 解析，不能直接注入",
      );
    }
    const skills =
      resources.skills == null ? {} : object(resources.skills, "skills");
    const requestedPaths = skills.paths ?? [];
    if (
      !Array.isArray(requestedPaths) ||
      !requestedPaths.every((path) => typeof path === "string")
    ) {
      throw new ServiceError(
        400,
        "INVALID_ARGUMENT",
        "skills.paths 必须是字符串数组",
      );
    }
    const candidates = [
      join(this.supervisor.config.dataDir, "skills"),
      join(workspacePath, this.supervisor.config.appDataDirName, "skills"),
      join(workspacePath, ".codex/skills"),
      join(workspacePath, ".agents/skills"),
    ].filter((path) => existsSync(path) && statSync(path).isDirectory());
    const bundled = this.supervisor.config.bundledSkillsPath;
    resources.skills = {
      ...skills,
      paths: [...candidates, ...requestedPaths],
      enabled: skills.enabled ?? [],
      bundledPath:
        bundled && existsSync(bundled) ? bundled : (skills.bundledPath ?? null),
    };
    resources.applications = null;
    if (collaboration) {
      const tools =
        resources.tools == null ? {} : object(resources.tools, "tools");
      resources.tools = {
        ...tools,
        allowed: tools.allowed ?? [
          "read",
          "edit",
          "write",
          "ls",
          "find",
          "grep",
          "ask_user",
        ],
      };
    }
    return resources;
  }

  /** Accepts the same command names and argument envelopes as Tauri invoke. */
  async invoke(name: string, args: JsonObject): Promise<unknown> {
    if (!commandNames.includes(name))
      throw new ServiceError(
        404,
        "COMMAND_NOT_FOUND",
        `尚未实现的命令：${name}`,
      );
    if (name === "resume_agent_runtime_agent") {
      onlyKeys(args, ["taskId"]);
      if (!this.resumeTask)
        throw new ServiceError(
          501,
          "HOST_UNSUPPORTED",
          "宿主未实现任务继续能力",
        );
      await this.resumeTask(nonempty(args.taskId, "taskId"));
      return null;
    }
    if (name === "abort_agent_runtime_agent") {
      onlyKeys(args, ["taskId"]);
      await this.supervisor.abort(nonempty(args.taskId, "taskId"));
      return null;
    }
    onlyKeys(args, ["input"]);
    const input = structuredClone(object(args.input ?? {}));
    if (name === "list_agent_runtime_tools") {
      onlyKeys(input, []);
      const { type: _type, ...result } = await this.supervisor.call(
        "agent/tools/list",
        {},
        ["agent_tools"],
      );
      return result;
    }
    if (
      name === "answer_agent_runtime_question" ||
      name === "answer_agent_runtime_approval"
    ) {
      const taskId = nonempty(input.taskId, "taskId");
      const method =
        name === "answer_agent_runtime_question"
          ? "agent/question/answer"
          : "agent/approval/answer";
      this.supervisor.answer(
        taskId,
        this.supervisor.protocol.command(method, { ...input, taskId }),
      );
      return null;
    }
    if (name === "run_agent_runtime_chat") {
      if (
        !Array.isArray(input.messages) ||
        !input.messages.some(
          (message) =>
            message &&
            typeof message.content === "string" &&
            message.content.trim(),
        )
      ) {
        throw new ServiceError(400, "INVALID_ARGUMENT", "消息不能为空");
      }
      const result = await this.supervisor.call(
        "agent/chat",
        { ...input, stream: input.stream ?? true },
        ["chat_result"],
        (event) => {
          if (
            input.streamId &&
            ["text_delta", "thinking_delta"].includes(String(event.type))
          ) {
            this.supervisor.events.publish("agent_runtime_chat_event", {
              streamId: input.streamId,
              event,
            });
          }
        },
      );
      return { text: result.text, thinking: result.thinking ?? null };
    }

    const workspacePath = workspace(input.workspacePath);
    input.workspacePath = workspacePath;
    if (
      name === "list_extension_commands" ||
      name === "execute_extension_command"
    ) {
      onlyKeys(
        input,
        name === "list_extension_commands"
          ? ["workspacePath", "chatId"]
          : ["workspacePath", "chatId", "taskId", "commandId", "arguments"],
      );
      const chatId = sessionId(input.chatId);
      const sessionRootDir = this.sessionPath(
        workspacePath,
        `chats/${chatId}/session`,
        true,
      )!;
      this.underDataRoot(workspacePath, sessionRootDir);
      this.supervisor.assertSessionAvailable(workspacePath, sessionRootDir);
      const target = {
        workspacePath,
        sessionRootDir,
        permissions: { mode: "ask" },
      };
      if (name === "list_extension_commands")
        return this.supervisor.call("extensions/commands/list", target, [
          "extension_commands_result",
        ]);
      const taskId = nonempty(input.taskId, "taskId");
      return this.supervisor.submit({
        taskId,
        workspacePath,
        sessionRootDir,
        sessionKey: `${workspacePath}|${sessionRootDir}`,
        command: this.supervisor.protocol.command(
          "extensions/commands/execute",
          {
            ...target,
            taskId,
            commandId: nonempty(input.commandId, "commandId"),
            arguments: object(input.arguments ?? {}),
          },
          taskId,
        ),
      });
    }
    if (name === "list_agent_runtime_sessions") {
      const rootDir =
        this.sessionPath(workspacePath, input.rootDir) ??
        canonicalTarget(
          join(workspacePath, this.supervisor.config.appDataDirName),
        );
      this.underDataRoot(workspacePath, rootDir, true);
      return this.supervisor.call(
        "runtime/sessions/list",
        { ...input, rootDir },
        ["runtime_sessions_result"],
      );
    }

    const isRun = [
      "run_agent_runtime_agent",
      "run_agent_runtime_collaboration",
      "run_agent_runtime_collaboration_mode",
    ].includes(name);
    const sessionRootDir = this.sessionPath(
      workspacePath,
      input.sessionRootDir,
      !isRun,
    );
    this.supervisor.assertSessionAvailable(workspacePath, sessionRootDir);
    input.sessionRootDir = sessionRootDir ?? null;
    if (isRun) {
      const isAgent = name === "run_agent_runtime_agent";
      const mode = name === "run_agent_runtime_collaboration_mode";
      let taskId: string;
      let sessionKey: string;
      let method: string;
      if (isAgent) {
        onlyKeys(input, [
          "taskId",
          "workspacePath",
          "chatId",
          "applicationId",
          "sessionRootDir",
          "agentRoleId",
          "userMessage",
          "systemPrompt",
          "requestContext",
          "runtimeInstruction",
          "bootstrapInstruction",
          "runtimeModel",
          "resources",
          "permissions",
        ]);
        const { applicationId, chatId, ...wire } = input;
        const application =
          applicationId != null
            ? await this.applicationSession?.(applicationId)
            : undefined;
        if (applicationId != null && !application)
          throw new ServiceError(
            403,
            "PERMISSION_DENIED",
            "应用会话授权不可用",
          );
        taskId = nonempty(input.taskId, "taskId");
        wire.taskId = taskId;
        wire.userMessage = nonempty(input.userMessage, "userMessage");
        wire.resources = this.resources(workspacePath, input.resources, false);
        if (application) {
          (wire.resources as JsonObject).applications = application.resources;
          wire.agentAccess = application.access;
        }
        sessionKey = `${workspacePath}|${sessionRootDir ?? optionalString(chatId, "chatId") ?? taskId}`;
        method = "agent/run";
        const command = this.supervisor.protocol.command(method, wire, taskId);
        return this.supervisor.submit({
          taskId,
          sessionKey,
          applicationId: optionalString(applicationId, "applicationId"),
          workspacePath,
          sessionRootDir,
          command,
        });
      }
      taskId = optionalString(input.requestId, "requestId") ?? randomUUID();
      input.requestId = taskId;
      input.resources = this.resources(workspacePath, input.resources, true);
      sessionKey = mode
        ? `${workspacePath}|collaboration-mode|${nonempty(input.mode, "mode")}|${sessionRootDir ?? taskId}`
        : `${workspacePath}|collaboration|${sessionRootDir ?? taskId}`;
      method = mode ? "collaboration/runMode" : "collaboration/run";
      const command = this.supervisor.protocol.command(method, input, taskId);
      return this.supervisor.submit({
        taskId,
        sessionKey,
        workspacePath,
        sessionRootDir,
        command,
      });
    }

    if (
      name === "release_agent_runtime_session" ||
      name === "delete_agent_runtime_session"
    ) {
      onlyKeys(input, ["workspacePath", "sessionRootDir"]);
      this.underDataRoot(workspacePath, sessionRootDir!);
      await this.supervisor.disposeSession(
        workspacePath,
        sessionRootDir!,
        name === "delete_agent_runtime_session"
          ? async () => {
              // Recheck after awaiting process exit, before deleting any files.
              const target = canonicalTarget(sessionRootDir!);
              this.underDataRoot(workspacePath, target);
              await rm(target, { recursive: true, force: true });
            }
          : undefined,
      );
      return null;
    }
    if (name === "summarize_agent_runtime_session") {
      onlyKeys(input, [
        "workspacePath",
        "sessionRootDir",
        "agentRoleId",
        "summaryInstruction",
        "maxSummaryChars",
        "runtimeModel",
      ]);
      const agentRoleId = optionalString(input.agentRoleId, "agentRoleId");
      return this.supervisor.call(
        agentRoleId ? "session/agent/summarize" : "session/summarize",
        {
          workspacePath,
          sessionRootDir,
          ...(agentRoleId ? { target: { scope: "agent", agentRoleId } } : {}),
          options: {
            summaryInstruction: input.summaryInstruction,
            maxSummaryChars: input.maxSummaryChars,
          },
          runtime: { model: input.runtimeModel },
        },
        ["session_mutation_result"],
      );
    }
    const query = queryCommands[name]!;
    return this.supervisor.call(query.method, input, [query.result]);
  }
}
