import { isTauri } from "@tauri-apps/api/core";
import { open as nativeOpen, type OpenDialogOptions } from "@tauri-apps/plugin-dialog";
import { invokeNode } from "@/transport/http";

/** Open the OS chooser through the active backend. */
export async function openSystemDialog(
  input: OpenDialogOptions = {},
  signal?: AbortSignal,
): Promise<string | string[] | null> {
  if (signal?.aborted) return null;
  if (isTauri()) return nativeOpen(input);
  try {
    return await invokeNode<string | string[] | null>("open_system_dialog", { input }, signal);
  } catch (error) {
    if (signal?.aborted) return null;
    throw error;
  }
}
