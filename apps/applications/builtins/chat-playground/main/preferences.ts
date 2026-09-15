import type { ApplicationStorage, ApplicationWorkspace } from "@isle/app-sdk/data";

const key = "playground.selection.v1";
type Selection = { version: 1; workspaceId: string; chats: Record<string, string> };
const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;

/** Business preferences only; chat contents remain in the selected workspace. */
export function createPlaygroundPreferences(storage: ApplicationStorage) {
  let selection: Selection = { version: 1, workspaceId: "", chats: {} };
  let loaded: Promise<void> | undefined;
  let pending = Promise.resolve();
  const save = () => {
    const snapshot = structuredClone(selection);
    // Preserve click order even if host requests complete at different speeds.
    const write = pending.then(() => storage.setItem(key, snapshot));
    pending = write.catch(() => {});
    return write;
  };
  return {
    async load() {
      loaded ??= storage
        .getItem<unknown>(key)
        .then((value) => {
          if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) return;
          const saved = value as Partial<Selection>;
          selection = {
            version: 1,
            workspaceId: validId(saved.workspaceId) ? saved.workspaceId : "",
            chats: Object.fromEntries(
              saved.chats && typeof saved.chats === "object" && !Array.isArray(saved.chats)
                ? Object.entries(saved.chats)
                    .filter(([id, chatId]) => validId(id) && validId(chatId))
                    .slice(-128)
                : [],
            ),
          };
        })
        .catch((error) => {
          loaded = undefined;
          throw error;
        });
      await loaded;
    },
    workspace(workspaces: readonly ApplicationWorkspace[]) {
      return (
        workspaces.find((item) => item.id === selection.workspaceId) ??
        workspaces.find((item) => item.isDefault) ??
        workspaces[0]
      );
    },
    chat(workspaceId: string) {
      return Object.hasOwn(selection.chats, workspaceId) ? selection.chats[workspaceId] : "";
    },
    async select(workspaceId: string, chatId?: string) {
      await this.load();
      selection.workspaceId = workspaceId;
      if (chatId !== undefined) {
        const entries = Object.entries(selection.chats).filter(([id]) => id !== workspaceId);
        if (chatId) entries.push([workspaceId, chatId]);
        selection.chats = Object.fromEntries(entries.slice(-128));
      }
      await save();
    },
  };
}
