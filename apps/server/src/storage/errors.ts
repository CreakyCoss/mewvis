import { ServiceError } from "../shared/validation.js";

/** Keep SQL, parameters and credentials out of transport errors. Works for sync and async callers. */
export function databaseError(
  error: unknown,
  scope: "SETTINGS" | "WORKSPACE",
): ServiceError {
  if (error instanceof ServiceError) return error;
  const sqlite = error as { errcode?: number };
  const primary =
    typeof sqlite?.errcode === "number" ? sqlite.errcode & 0xff : undefined;
  const label = scope === "SETTINGS" ? "配置" : "工作区";
  if (primary === 19)
    return new ServiceError(
      409,
      `${scope}_CONFLICT`,
      `${label}记录重复或不满足约束，数据库写入已回滚`,
    );
  if (primary === 5 || primary === 6)
    return new ServiceError(
      503,
      `${scope}_BUSY`,
      `${label}数据库正在使用，请稍后重试`,
    );
  return new ServiceError(
    500,
    `${scope}_STORAGE_ERROR`,
    `${label}数据库读写失败`,
  );
}
