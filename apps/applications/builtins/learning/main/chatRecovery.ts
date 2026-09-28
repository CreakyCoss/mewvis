/** The host does not persist empty chats. Only a confirmed missing record is recoverable. */
export async function recoverMissingChat<T>(
  open: () => Promise<T>,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await open();
  } catch (error) {
    const message = error instanceof Error ? error.message : error;
    if (message !== "未找到聊天记录") throw error;
    return create();
  }
}
