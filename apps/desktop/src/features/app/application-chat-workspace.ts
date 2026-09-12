import { createApplicationDataClient, ApplicationDataError } from "@isle/app-sdk/data";
import { createDesktopApplicationDataTransport } from "@/api/application-data";
import type { ApplicationPermission } from "@/api/apps";

/** Resolve a directory for Chat without enrolling it in the desktop workspace registry. */
export async function resolveApplicationChatWorkspace(
  application: { id: string; permissions: ApplicationPermission[] },
  workspaceId: string,
): Promise<string> {
  if (!application.permissions.includes("application-workspaces")) {
    throw new ApplicationDataError("PERMISSION_DENIED", "应用未声明 application-workspaces 权限");
  }
  const transport = createDesktopApplicationDataTransport(application.id);
  try {
    return (await createApplicationDataClient(transport).workspaces.get(workspaceId)).path;
  } finally {
    transport.dispose();
  }
}
