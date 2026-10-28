import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ApplicationData } from "../../../../server/dist/modules/applications/data.js";
import { ApplicationFiles } from "../../../../server/dist/modules/files/application-files.js";
import { applicationDirectory } from "../../../../server/dist/modules/applications/packages.js";
import { applicationProtectedPaths } from "../../../../server/dist/modules/files/util.js";
import { EventHub } from "../../../../server/dist/infrastructure/events/event-hub.js";
import { createApplicationDataClient } from "../../../../../packages/app/sdk/data/index.js";
import { createApplicationFileClient } from "../../../../../packages/app/sdk/files/index.js";

// The application registry/picker are isolated fixtures; data, workspace registration,
// SQLite, file authorization, atomic writes and SDK clients use production code.
export async function createProjectHost(existingRoot) {
  const root =
    existingRoot ??
    (await realpath(await mkdtemp(join(tmpdir(), "gameplay-projects-"))));
  const applicationId = "@mewvis/gameplay-lab";
  const events = new EventHub();
  const packages = {
    path: join(root, "data/apps"),
    async authorize(id, permission) {
      const permissions = [
        "application-data",
        "application-workspaces",
        "workspace-files",
      ];
      if (
        id !== applicationId ||
        (permission && !permissions.includes(permission))
      ) {
        const error = new Error("未授权的验收应用");
        error.code = "PERMISSION_DENIED";
        throw error;
      }
      return { id, enabled: true, permissions };
    },
  };
  const projectsPath = join(root, "projects");
  await mkdir(projectsPath, { recursive: true });
  await mkdir(packages.path, { recursive: true });
  const data = new ApplicationData(packages, events);
  let choice = projectsPath;
  const unsubscribe = events.subscribe((event) => {
    if (event.name !== "application-workspace:interaction") return;
    if (event.payload.kind === "pick-directory")
      data.answer({ requestId: event.payload.requestId, value: choice });
    else data.answer({ requestId: event.payload.requestId, value: false });
  });
  const dataConnection = await data.connect(applicationId);
  const files = new ApplicationFiles(async (id) => {
    await packages.authorize(id, "workspace-files");
    const dataPath = applicationDirectory(packages.path, applicationId);
    const workspacePaths = await data.fileWorkspaces(applicationId);
    return {
      dataPath,
      workspacePaths,
      protectedPaths: applicationProtectedPaths(dataPath, workspacePaths),
    };
  }, events);
  const fileConnection = await files.connect(applicationId);
  const dataRequest = (request) => data.request(dataConnection, request);
  const fileRequest = async (request) => {
    try {
      return { ok: true, value: await files.request(fileConnection, request) };
    } catch (error) {
      return {
        ok: false,
        error: { code: error.code ?? "FILE_ERROR", message: error.message },
      };
    }
  };
  return {
    root,
    projectsPath,
    dataRequest,
    fileRequest,
    chooseDirectory(value) {
      choice = value;
    },
    data: createApplicationDataClient({ version: 1, request: dataRequest }),
    files: createApplicationFileClient({ version: 1, request: fileRequest }),
    async close(remove = true) {
      unsubscribe();
      data.close();
      await files.close();
      if (remove) await rm(root, { recursive: true, force: true });
    },
  };
}
