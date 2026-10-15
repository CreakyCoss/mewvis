import { join, resolve } from "node:path";
import { executeMedia } from "./request.js";
import { collectMedia, prepareMediaInput, readMediaFile } from "./files.js";
import { authorizeMediaPath, authorizeMediaUrl } from "./permissions.js";
import {
  redactMedia,
  type MediaArtifact,
  type MediaGenerationRequest,
  type MediaResult,
  type MediaRunContext,
} from "./types.js";

/** Entire generation workflow, independent of Server transport and engine-specific tool APIs. */
export async function runMediaGeneration(
  request: MediaGenerationRequest,
  context: MediaRunContext,
): Promise<MediaResult> {
  const {
    model,
    purpose,
    arguments: args,
    execution,
    protectedPaths,
  } = request;
  const connection = model.configuration.connection;
  const signal = AbortSignal.any([
    ...(context.signal ? [context.signal] : []),
    AbortSignal.timeout((args.timeoutSeconds ?? 1800) * 1000),
  ]);
  const directory = resolve(
    execution.workspacePath,
    args.outputDirectory ?? "generated-media",
  );
  const authorize = (path: string, action: "read" | "write") =>
    authorizeMediaPath(execution, protectedPaths, path, action);
  let stage = "preparing";
  let taskId: string | undefined;
  const outputs: MediaArtifact[] = [];
  const progress = (next: string, id?: string) => {
    stage = next;
    taskId = id ?? taskId;
    context.progress?.({
      stage,
      ...(taskId ? { taskId } : {}),
      outputs: [...outputs],
      message:
        (
          {
            preparing: "检查输入和文件权限",
            submitting: "正在请求媒体生成",
            running: "等待生成任务完成",
            collecting: "正在保存生成产物",
          } as Record<string, string>
        )[stage] ?? "等待媒体生成",
    });
  };
  const secrets = [connection.apiKey ?? ""];
  try {
    signal.throwIfAborted();
    await authorize(join(directory, ".media-output-check"), "write");
    const input = await prepareMediaInput(args.input, args.files, (path) =>
      readMediaFile(path, (path) => authorize(path, "read"), signal),
    );
    const transport = {
      signal,
      authorizeUrl: (url: URL) => authorizeMediaUrl(execution, url),
      fetch: context.fetch,
    };
    const generated = await executeMedia({
      purpose,
      context: {
        apiEndpoint: connection.apiEndpoint ?? "",
        auth: { apiKey: connection.apiKey ?? "" },
        model: { id: model.modelId },
        input,
      },
      parameters: args.parameters ?? {},
      transport,
      progress,
    });
    for (const output of generated) {
      outputs.push(
        await collectMedia(output, {
          directory,
          transport,
          authorize: (path) => authorize(path, "write"),
        }),
      );
      progress("collecting");
    }
    if (!outputs.some((output) => output.filePath))
      throw new Error(
        "接口没有返回可保存的图片或视频，请检查用途的响应提取规则",
      );
    return redactMedia(
      {
        status: "completed",
        modelId: model.modelId,
        purpose: purpose.type,
        ...(taskId ? { taskId } : {}),
        outputs,
      },
      secrets,
    );
  } catch (error) {
    return redactMedia(
      {
        status: signal.aborted ? "stopped" : "failed",
        modelId: model.modelId,
        purpose: purpose.type,
        stage,
        ...(taskId ? { taskId } : {}),
        outputs,
        error: signal.aborted
          ? "已停止等待，上游任务可能仍在执行。请勿自动重新提交生成请求。"
          : error instanceof Error
            ? error.message.slice(0, 2000)
            : "媒体生成失败",
        resubmitAutomatically: false,
      },
      secrets,
    );
  }
}
