import { ServiceError, type JsonObject } from "../../shared/validation.js";

export type CommandHandler = (
  args: JsonObject,
  context?: { signal?: AbortSignal },
) => unknown | Promise<unknown>;

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  register(name: string, handler: CommandHandler) {
    if (this.handlers.has(name)) throw new Error(`命令重复注册：${name}`);
    this.handlers.set(name, handler);
  }

  get names() {
    return [...this.handlers.keys()];
  }

  invoke(
    name: string,
    args: JsonObject,
    context: { signal?: AbortSignal } = {},
  ) {
    const handler = this.handlers.get(name);
    if (!handler)
      throw new ServiceError(
        404,
        "COMMAND_NOT_FOUND",
        `尚未实现的命令：${name}`,
      );
    return handler(args, context);
  }
}
