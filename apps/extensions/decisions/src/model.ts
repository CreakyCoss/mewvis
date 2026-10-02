import type { ExtensionHostServices } from "@mewvis/extension-sdk/host";
export type ModelHost = Pick<ExtensionHostServices, "supports" | "tasks">;

/** Retry invalid structure once; transport errors and cancellation never become fallback decisions. */
export async function modelJSON<T>(
  host: ModelHost,
  signal: AbortSignal,
  title: string,
  systemPrompt: string,
  text: string,
  parse: (value: unknown) => T,
): Promise<T> {
  if (systemPrompt.length > 16384 || text.length > 95000)
    throw new Error("判断材料或规则过长，请缩短后重试。");
  if (!host.supports("tasks.run"))
    throw new Error("当前宿主不支持模型判断任务。");
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    const output = await host.tasks.run(
      {
        title,
        tools: "none",
        systemPrompt,
        text: `${attempt ? "上次输出格式不符合要求，请严格遵守 JSON 类型、字段和值范围。\n" : ""}${text}`,
      },
      { signal },
    );
    signal.throwIfAborted();
    try {
      if (output.text.length > 32000) throw new Error("输出过长");
      return parse(
        JSON.parse(
          output.text
            .trim()
            .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1"),
        ),
      );
    } catch (error) {
      if (attempt)
        throw new Error(
          "模型两次返回的结果均不符合格式，本次未生成有效判断。",
          { cause: error },
        );
    }
  }
  throw new Error("未生成结果");
}
