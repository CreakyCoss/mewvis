import { stat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import {
  pickNativeFile,
  type NativePicker,
  type PickerOptions,
} from "../../infrastructure/dialogs/native-picker.js";
import {
  invalid,
  object,
  onlyKeys,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";

export class SystemDialogs {
  private active?: {
    abort: AbortController;
    done: Promise<string | string[] | null>;
  };
  private closed = false;
  private terminationError?: ServiceError;
  constructor(private readonly picker: NativePicker = pickNativeFile) {}

  async open(input: JsonObject, caller?: AbortSignal) {
    onlyKeys(input, [
      "title",
      "defaultPath",
      "directory",
      "multiple",
      "filters",
      "recursive",
      "canCreateDirectories",
    ]);
    for (const key of [
      "directory",
      "multiple",
      "recursive",
      "canCreateDirectories",
    ])
      if (input[key] !== undefined && typeof input[key] !== "boolean")
        invalid(`${key} 必须是布尔值`);
    const options: PickerOptions = {
      directory: input.directory === true,
      multiple: input.multiple === true,
    };
    for (const key of ["title", "defaultPath"] as const) {
      const value = input[key];
      if (value !== undefined) {
        if (
          typeof value !== "string" ||
          value.length > 4096 ||
          value.includes("\0")
        )
          invalid(`${key} 不合法`);
        if (value) options[key] = value;
      }
    }
    if (options.defaultPath && !isAbsolute(options.defaultPath))
      invalid("defaultPath 必须是绝对路径");
    if (input.filters !== undefined) {
      if (!Array.isArray(input.filters) || input.filters.length > 32)
        invalid("filters 不合法");
      options.filters = input.filters.map((value) => {
        const filter = object(value);
        onlyKeys(filter, ["name", "extensions"]);
        if (
          typeof filter.name !== "string" ||
          !filter.name ||
          filter.name.length > 200 ||
          /[|\r\n\0]/.test(filter.name)
        )
          invalid("筛选名称不合法");
        if (
          !Array.isArray(filter.extensions) ||
          !filter.extensions.length ||
          filter.extensions.length > 32 ||
          filter.extensions.some(
            (ext) =>
              typeof ext !== "string" || !/^(\*|[\w+-]{1,32})$/.test(ext),
          )
        )
          invalid("文件扩展名不合法");
        return { name: filter.name, extensions: filter.extensions as string[] };
      });
    }
    if (this.terminationError) throw this.terminationError;
    if (this.closed)
      throw new ServiceError(503, "SERVER_STOPPING", "服务正在退出");
    if (caller?.aborted)
      throw new ServiceError(499, "COMMAND_ABORTED", "选择已取消");
    if (this.active)
      throw new ServiceError(
        409,
        "DIALOG_BUSY",
        "已有文件选择窗口打开，请先完成或取消选择",
      );
    const abort = new AbortController();
    const cancel = () => abort.abort();
    caller?.addEventListener("abort", cancel, { once: true });
    const done = (async () => {
      if (options.defaultPath) {
        const info = await stat(options.defaultPath).catch(() => null);
        if (!info?.isDirectory())
          options.defaultPath = dirname(options.defaultPath);
      }
      const paths = await this.picker(options, abort.signal);
      if (abort.signal.aborted)
        throw new ServiceError(499, "COMMAND_ABORTED", "选择已取消");
      if (paths === null) return null;
      if (!paths.length || (!options.multiple && paths.length !== 1))
        throw new ServiceError(
          502,
          "DIALOG_INVALID_RESULT",
          "选择器返回数量不正确",
        );
      for (const path of paths) {
        if (!isAbsolute(path))
          throw new ServiceError(
            502,
            "DIALOG_INVALID_RESULT",
            "选择器未返回绝对路径",
          );
        const info = await stat(path);
        if (!(options.directory ? info.isDirectory() : info.isFile()))
          throw new ServiceError(
            400,
            "DIALOG_INVALID_SELECTION",
            "所选路径类型不符合要求",
          );
      }
      return options.multiple ? paths : paths[0];
    })();
    this.active = { abort, done };
    try {
      return await done;
    } catch (error) {
      if (
        error instanceof ServiceError &&
        error.code === "COMMAND_EXIT_UNCONFIRMED"
      )
        this.terminationError = error;
      throw error;
    } finally {
      caller?.removeEventListener("abort", cancel);
      this.active = undefined;
    }
  }
  async close() {
    this.closed = true;
    this.active?.abort.abort();
    await this.active?.done.catch(() => {});
    if (this.terminationError) throw this.terminationError;
  }
}
