import type { WorkspaceRepository } from "./repository.js";
import type { WorkspaceInput } from "./types.js";
import {
  initializeWorkspaceDirectory,
  normalizeWorkspacePath,
} from "../../storage/workspace.js";
import {
  nonempty,
  onlyKeys,
  optionalString,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";

export class WorkspaceService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly defaultDirectory: string,
  ) {}

  private async defaultPath() {
    return normalizeWorkspacePath(this.defaultDirectory);
  }

  private input(input: JsonObject, update = false): WorkspaceInput {
    onlyKeys(input, [
      ...(update ? ["id"] : []),
      "name",
      "description",
      "path",
      "groupId",
    ]);
    return {
      name: nonempty(input.name, "工作区名称"),
      path: nonempty(input.path, "工作区目录"),
      description: optionalString(input.description, "description") ?? null,
      groupId: optionalString(input.groupId, "groupId") ?? null,
    };
  }

  private assertOrdinary(path: string, defaultPath: string) {
    if (path === defaultPath)
      throw new ServiceError(
        409,
        "DEFAULT_WORKSPACE_MANAGED",
        "默认工作区由系统管理，不能作为普通工作区创建或更新",
      );
  }

  private async prepare(input: WorkspaceInput, defaultPath: string) {
    const path = await normalizeWorkspacePath(input.path);
    this.assertOrdinary(path, defaultPath);
    const initialized = await initializeWorkspaceDirectory(path);
    this.assertOrdinary(initialized, defaultPath);
    return { ...input, path: initialized };
  }

  async list() {
    const path = await initializeWorkspaceDirectory(await this.defaultPath());
    return this.repository.list(path);
  }

  async create(value: JsonObject) {
    const input = this.input(value);
    const defaultPath = await this.defaultPath();
    return this.repository.create(
      await this.prepare(input, defaultPath),
      defaultPath,
    );
  }

  async update(value: JsonObject) {
    const id = nonempty(value.id, "工作区 ID");
    const input = this.input(value, true);
    const defaultPath = await this.defaultPath();
    this.repository.assertEditable(id, defaultPath);
    return this.repository.update(
      id,
      await this.prepare(input, defaultPath),
      defaultPath,
    );
  }

  async delete(value: JsonObject) {
    onlyKeys(value, ["id"]);
    const id = nonempty(value.id, "工作区 ID");
    return this.repository.delete(id, await this.defaultPath());
  }
}
