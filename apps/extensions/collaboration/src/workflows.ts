import { rolePrompt, type Role } from "./roles";
import { avatarSource } from "./roles/avatars";
import type { JsonObject } from "@isle/extension-sdk";
import type {
  ExtensionHostServices,
  ExtensionActivity,
  DecisionOutput,
  DecisionResult,
} from "@isle/extension-sdk/host";
export type Step = {
  id: string;
  name: string;
  roleId: string;
  instruction: string;
  input: "original" | "previous" | "all";
  /** Optional assessment of this step's output; no provider or policy identifiers. */
  judgment?: { question: string; output: DecisionOutput };
};
export type Workflow = {
  id: string;
  name: string;
  description: string;
  steps: Step[];
};
export function workflows(config: Readonly<JsonObject>): Workflow[] {
  const values = (config.workflows ?? []) as unknown as Workflow[];
  if (!Array.isArray(values) || values.length > 32)
    throw new Error("最多配置 32 个流程");
  const ids = new Set<string>();
  for (const flow of values) {
    if (
      !/^[a-z][a-z0-9_]{0,24}$/.test(flow.id) ||
      ids.has(flow.id) ||
      !flow.name.trim() ||
      !flow.steps.length ||
      flow.steps.length > 32
    )
      throw new Error("流程标识、名称或步骤无效");
    ids.add(flow.id);
    const steps = new Set<string>();
    for (const step of flow.steps) {
      if (
        steps.has(step.id) ||
        !step.id ||
        !step.name.trim() ||
        !step.roleId ||
        !["original", "previous", "all"].includes(step.input)
      )
        throw new Error("请为每个步骤填写名称并选择角色");
      steps.add(step.id);
      if (
        step.judgment &&
        (!step.judgment.question.trim() || step.judgment.question.length > 4000)
      )
        throw new Error("请填写判断问题（最多 4000 字）");
      const output = step.judgment?.output;
      if (output && output.type !== "boolean") {
        const labels =
          output.type === "choice"
            ? output.options
            : output.type === "score"
              ? output.levels
              : [];
        if (
          labels.length < 2 ||
          labels.length > 10 ||
          labels.some((label) => !label.trim() || label.length > 300) ||
          new Set(labels).size !== labels.length
        )
          throw new Error("判断选项或评分档位须为 2–10 个不重复的非空值");
      }
    }
  }
  return structuredClone(values);
}
/** Orchestration belongs to the plugin. The host executes one scoped role task at a time. */
export async function runWorkflow(
  flow: Workflow,
  text: string,
  configuredRoles: readonly Role[],
  host: ExtensionHostServices,
  signal: AbortSignal,
) {
  if (!text.trim()) throw new Error("请在流程命令后输入任务");
  const snapshot = structuredClone(flow);
  const roles = structuredClone(configuredRoles);
  for (const step of snapshot.steps)
    if (!roles.some((role) => role.id === step.roleId))
      throw new Error(`步骤“${step.name}”的插件角色已不存在，请重新配置`);
  const activity: ExtensionActivity = {
    id: crypto.randomUUID(),
    title: snapshot.name,
    state: "running",
    pausable: host.supports("activity.checkpoint"),
    steps: snapshot.steps.map((step) => ({
      id: step.id,
      title: step.name,
      actor: { name: roles.find((role) => role.id === step.roleId)!.name },
      state: "pending",
    })),
  };
  const results: string[] = [];
  const judgments: Array<{ stepId: string; result: DecisionResult }> = [];
  if (
    snapshot.steps.some((step) => step.judgment) &&
    !host.supports("decisions.evaluate")
  )
    throw new Error(
      "当前没有可用的判断能力提供者，请启用智能判断插件或配置宿主实现。",
    );
  const publish = () =>
    host.activity.publish(structuredClone(activity), { signal });
  await publish();
  try {
    for (const [index, step] of snapshot.steps.entries()) {
      signal.throwIfAborted();
      if (activity.pausable)
        await host.activity.checkpoint(activity.id, { signal });
      const role = roles.find((role) => role.id === step.roleId)!;
      activity.steps[index].state = "running";
      await publish();
      const context =
        step.input === "all"
          ? results.join("\n\n")
          : step.input === "previous"
            ? results.at(-1)
            : "";
      const prompt = [
        `用户任务：\n${text}`,
        `当前步骤：${step.name}`,
        step.instruction,
        context && `前序步骤结果：\n${context}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      if (prompt.length > 96000)
        throw new Error("步骤输入过长，请减少前序结果引用");
      const result = await host.tasks.run(
        {
          title: `${index + 1}. ${step.name} · ${role.name}`,
          avatar: avatarSource(role.avatar),
          systemPrompt: rolePrompt(role),
          text: prompt,
        },
        { signal },
      );
      let assessment = "";
      if (step.judgment) {
        if (result.text.length > 24000)
          throw new Error("步骤结果超过判断输入上限，请缩短输出。");
        activity.detail = `正在判断：${step.judgment.question}`;
        await publish();
        const decision = await host.decisions.evaluate(
          { input: result.text, ...step.judgment },
          { signal },
        );
        judgments.push({ stepId: step.id, result: decision });
        assessment = `\n\n判断结果（需复核或弃答时不可作为确定结论）：\n${JSON.stringify(decision, null, 2)}`;
        delete activity.detail;
      }
      results.push(`${step.name}\n${result.text}${assessment}`);
      activity.steps[index].state = "completed";
      await publish();
    }
    activity.state = "completed";
    activity.detail = "全部步骤完成";
    await publish();
    return { text: results.at(-1) ?? "", steps: results, judgments };
  } catch (error) {
    activity.state = signal.aborted ? "cancelled" : "failed";
    activity.detail = signal.aborted
      ? "执行已取消"
      : error instanceof Error
        ? error.message
        : String(error);
    for (const step of activity.steps)
      if (step.state === "running") step.state = activity.state;
    if (!signal.aborted) await publish().catch(() => {});
    throw error;
  }
}
