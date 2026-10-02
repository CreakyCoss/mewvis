import { platform } from "@/platform";
import type { PathDialogOptions, PathSelection } from "@mewvis/client-platform";
import { invokeNode } from "@/transport/http";

/** Open the OS chooser through the active backend. */
export async function openSystemDialog(input: PathDialogOptions = {}, signal?: AbortSignal): Promise<PathSelection> {
  if (signal?.aborted) return null;
  try {
    const selection = platform.openDialog
      ? await platform.openDialog(input)
      : await invokeNode<PathSelection>("open_system_dialog", { input }, signal);
    return signal?.aborted ? null : selection;
  } catch (error) {
    if (signal?.aborted) return null;
    throw error;
  }
}
