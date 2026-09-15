import type { CommandRegistry } from "./registry.js";
import {
  object,
  onlyKeys,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";
export type ModuleCommands = Record<string, (input: JsonObject) => unknown>;
export function registerModule(
  registry: CommandRegistry,
  commands: ModuleCommands,
  bare: string[] = [],
) {
  for (const [name, handler] of Object.entries(commands))
    registry.register(name, async (args) => {
      try {
        if (bare.includes(name)) return await handler(args);
        onlyKeys(args, ["input"]);
        return await handler(object(args.input));
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        const e = error as NodeJS.ErrnoException & { errcode?: number };
        if (e.code === "ENOENT")
          throw new ServiceError(404, "NOT_FOUND", "文件或记录不存在");
        if (e.code === "EEXIST" || (e.errcode && (e.errcode & 255) === 19))
          throw new ServiceError(409, "CONFLICT", "记录或目标已存在");
        if (e.errcode && [5, 6].includes(e.errcode & 255))
          throw new ServiceError(503, "DATABASE_BUSY", "数据库正在使用");
        throw new ServiceError(
          500,
          "OPERATION_FAILED",
          "操作失败，请检查目标状态和访问权限",
        );
      }
    });
}
