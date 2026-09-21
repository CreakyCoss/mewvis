import { randomUUID } from "node:crypto";
import { defineExtension } from "@isle/extension-sdk";
import { z } from "zod";

const stateSchema = z
  .object({
    version: z.literal(1),
    selectedId: z.string().nullable(),
    items: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
          runId: z.string().nullable(),
          toolsCompleted: z.number().int().nonnegative(),
          toolsFailed: z.number().int().nonnegative(),
          lastTool: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

const idParameters = {
  type: "object",
    properties: { id: { type: "string", title: "任务 ID", minLength: 1 } },
  required: ["id"],
  additionalProperties: false,
};

/** A feature extension: explicit commands + persistent state + observations; no model tool. */
export default defineExtension({
  id: "isle.tasks",
  apiVersion: 1,
  setup(ctx) {
    const read = () => stateSchema.parse(ctx.session.get("tasks") ?? { version: 1, selectedId: null, items: [] });
    const write = (state: z.infer<typeof stateSchema>) => ctx.session.set("tasks", state);

    ctx.registerCommand({
      name: "add",
      description: "添加任务；通过 select 选择由下一轮 Agent 跟踪的任务。",
      parameters: {
        type: "object",
        properties: { title: { type: "string", title: "任务名称", minLength: 1, maxLength: 500 } },
        required: ["title"],
        additionalProperties: false,
      },
      async execute(input) {
        const title = (input.title as string).trim();
        if (!title) throw new Error("任务标题不能为空");
        const state = read();
        if (state.items.length >= (ctx.config.maxTasks as number)) throw new Error("已达到 maxTasks 配置的任务上限");
        const task = {
          id: randomUUID(),
          title,
          status: "pending" as const,
          runId: null,
          toolsCompleted: 0,
          toolsFailed: 0,
          lastTool: null,
        };
        state.items.push(task);
        write(state);
        return task;
      },
    });
    ctx.registerCommand({
      name: "list",
      description: "查看当前会话的任务与执行进度。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        return read();
      },
    });
    ctx.registerCommand({
      name: "select",
      description: "选择一个待执行任务，由下一轮 Agent 执行状态驱动它。",
      parameters: idParameters,
      async execute(input) {
        const state = read();
        const task = state.items.find((item) => item.id === input.id);
        if (!task || task.status !== "pending") throw new Error("只能选择存在且待执行的任务");
        state.selectedId = task.id;
        write(state);
        return task;
      },
    });
    ctx.registerCommand({
      name: "reset",
      description: "手动将任务恢复为待执行；可用于宿主崩溃后仍显示执行中的任务。",
      parameters: idParameters,
      async execute(input) {
        const state = read();
        const task = state.items.find((item) => item.id === input.id);
        if (!task) throw new Error("任务不存在");
        Object.assign(task, { status: "pending", runId: null, toolsCompleted: 0, toolsFailed: 0, lastTool: null });
        if (state.selectedId === task.id) state.selectedId = null;
        write(state);
        return task;
      },
    });

    ctx.on("run_started", (event) => {
      const state = read();
      const task = state.items.find((item) => item.id === state.selectedId && item.status === "pending");
      if (!task) return;
      task.status = "running";
      task.runId = event.taskId;
      state.selectedId = null;
      write(state);
    });
    ctx.on("tool_started", (event) => {
      const state = read();
      const task = state.items.find((item) => item.runId === event.taskId && item.status === "running");
      if (!task) return;
      task.lastTool = event.toolName;
      write(state);
    });
    ctx.on("tool_finished", (event) => {
      const state = read();
      const task = state.items.find((item) => item.runId === event.taskId && item.status === "running");
      if (!task) return;
      task.toolsCompleted++;
      if (event.isError) task.toolsFailed++;
      write(state);
    });
    ctx.on("run_finished", (event) => {
      const state = read();
      const task = state.items.find((item) => item.runId === event.taskId && item.status === "running");
      if (!task) return;
      task.status = event.status;
      write(state);
    });
  },
});
