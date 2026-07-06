export const resolveLedgerSessionRootDir = (chatId: string | null | undefined) => {
  const id = chatId?.trim().replace(/\.json$/, "");
  return id ? `chats/${id}/session` : null;
};

export const createAgentSessionRootDir = resolveLedgerSessionRootDir;
