import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Pi's subagent example exposes single, parallel and chain modes. Isle uses SDK
// sessions instead of invoking a separately installed pi executable.
const readTools = ["read", "ls", "find", "grep"];
export const PI_SUBAGENT_ROLES = {
  scout: {
    prompt: "Explore the relevant files and return concise findings with file paths. Do not modify files.",
    tools: readTools,
  },
  planner: {
    prompt: "Inspect the relevant context and produce an actionable implementation plan. Do not modify files.",
    tools: readTools,
  },
  reviewer: {
    prompt: "Review the requested work. Report actionable issues with evidence and file paths. Do not modify files.",
    tools: readTools,
  },
  worker: {
    prompt: "Complete the delegated task using the available tools. Verify your work and report the result concisely.",
    tools: null,
  },
} as const;

export type PiSubagentRole = keyof typeof PI_SUBAGENT_ROLES;
export type PiSubagentTask = { agent: PiSubagentRole; task: string };
export type PiSubagentParams = {
  agent?: PiSubagentRole;
  task?: string;
  tasks?: PiSubagentTask[];
  chain?: PiSubagentTask[];
};
export type PiSubagentResult = {
  agent: PiSubagentRole;
  text: string;
  isError: boolean;
  usage?: { input: number; output: number; total: number; cost: number };
};
export type PiSubagentRunner = (
  task: PiSubagentTask,
  signal: AbortSignal | undefined,
  onProgress: (text: string) => void,
) => Promise<PiSubagentResult>;

const MAX_TASKS = 8;
const MAX_CONCURRENT = 4;
export const PI_SUBAGENT_OUTPUT_LIMIT = 12_000;
export const limitSubagentText = (text: string) =>
  text.length <= PI_SUBAGENT_OUTPUT_LIMIT
    ? text
    : `${text.slice(0, PI_SUBAGENT_OUTPUT_LIMIT)}\n[Subagent output truncated]`;

export const subagentAllowedTools = (parentTools: readonly string[], role: PiSubagentRole): string[] => {
  const roleTools: readonly string[] | null = PI_SUBAGENT_ROLES[role].tools;
  return parentTools.filter(
    (name) => name !== "subagent" && name !== "ask_user" && (!roleTools || roleTools.includes(name)),
  );
};

export const runPiSubagentTasks = async (
  params: PiSubagentParams,
  run: PiSubagentRunner,
  signal?: AbortSignal,
  onProgress: (index: number, text: string) => void = () => undefined,
): Promise<PiSubagentResult[]> => {
  const single = params.agent !== undefined || params.task !== undefined;
  if (Number(single) + Number(params.tasks !== undefined) + Number(params.chain !== undefined) !== 1) {
    throw new Error("Specify exactly one mode: agent + task, tasks, or chain.");
  }
  const tasks = params.tasks ?? params.chain ?? [{ agent: params.agent!, task: params.task! }];
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > MAX_TASKS) {
    throw new Error(`Subagent calls require 1-${MAX_TASKS} tasks.`);
  }
  for (const task of tasks) {
    if (!task || !Object.hasOwn(PI_SUBAGENT_ROLES, task.agent) || typeof task.task !== "string" || !task.task.trim()) {
      throw new Error("Each task requires agent (scout, planner, reviewer or worker) and a nonempty task.");
    }
  }
  signal?.throwIfAborted();
  const results: PiSubagentResult[] = [];
  const execute = async (task: PiSubagentTask, index: number) => {
    signal?.throwIfAborted();
    onProgress(index, `${task.agent}: started`);
    try {
      const result = await run(task, signal, (text) => onProgress(index, text));
      signal?.throwIfAborted();
      results[index] = { ...result, text: limitSubagentText(result.text) };
    } catch (error) {
      signal?.throwIfAborted();
      results[index] = { agent: task.agent, text: limitSubagentText(String(error)), isError: true };
    }
    onProgress(index, `${task.agent}: ${results[index].isError ? "failed" : "completed"}`);
  };

  if (params.chain) {
    let previous = "";
    for (const [index, task] of tasks.entries()) {
      const prompt = task.task.includes("{previous}")
        ? task.task.replaceAll("{previous}", previous)
        : `${task.task}${previous ? `\n\nPrevious agent result:\n${previous}` : ""}`;
      await execute({ ...task, task: prompt }, index);
      if (results[index].isError) break;
      previous = results[index].text;
    }
  } else {
    let next = 0;
    // Settle every worker before returning, including when the caller cancels.
    const settled = await Promise.allSettled(
      Array.from({ length: Math.min(tasks.length, MAX_CONCURRENT) }, async () => {
        while (next < tasks.length) {
          signal?.throwIfAborted();
          const index = next++;
          await execute(tasks[index], index);
        }
      }),
    );
    signal?.throwIfAborted();
    const failed = settled.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  return results;
};

export const registerPiSubagentTool = (pi: ExtensionAPI, run: PiSubagentRunner) => {
  const agent = Type.Union([
    Type.Literal("scout"),
    Type.Literal("planner"),
    Type.Literal("reviewer"),
    Type.Literal("worker"),
  ]);
  const task = Type.Object({ agent, task: Type.String({ minLength: 1 }) });
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Delegate to isolated Pi sessions using the same model and workspace. Use agent+task, tasks (up to 8, 4 concurrent), or chain ({previous} inserts prior output). Scout/planner/reviewer only read files. Workers inherit your tools. Children cannot delegate or ask the user; include all needed context. Parallel workers share files: assign separate files to avoid conflicts.",
    parameters: Type.Object({
      agent: Type.Optional(agent),
      task: Type.Optional(Type.String({ minLength: 1 })),
      tasks: Type.Optional(Type.Array(task, { minItems: 1, maxItems: MAX_TASKS })),
      chain: Type.Optional(Type.Array(task, { minItems: 1, maxItems: MAX_TASKS })),
    }),
    async execute(_id, params, signal, onUpdate) {
      const progress: Record<number, string> = {};
      const results = await runPiSubagentTasks(params, run, signal, (index, text) => {
        progress[index] = text.slice(-2000);
        onUpdate?.({
          content: [{ type: "text", text: Object.values(progress).join("\n") }],
          details: { progress: { ...progress } },
        });
      });
      const result = {
        content: [
          {
            type: "text",
            text: results
              .map(
                (result, index) => `[${index + 1}: ${result.agent}${result.isError ? " FAILED" : ""}]\n${result.text}`,
              )
              .join("\n\n"),
          },
        ],
        details: { results },
      } as const;
      // Pi marks tool failures from thrown errors, not an isError property.
      if (results.some((result) => result.isError)) {
        onUpdate?.({ content: [...result.content], details: result.details });
        throw new Error(result.content[0].text);
      }
      return { content: [...result.content], details: result.details };
    },
  });
};
