import { useEffect, useState } from "react";
import { getApplicationChatClient, type ApplicationChatOpenInput, type ApplicationChatSession } from "@mewvis/app-sdk/chat";

/** The transport and shared client are supplied once by the sandbox host. */
export function useApplicationChatSession(input: ApplicationChatOpenInput | null) {
  const key = JSON.stringify(input);
  const [entry, setEntry] = useState<{ key: string; session?: ApplicationChatSession; error?: string }>({ key: "" });
  useEffect(() => {
    let attached = true;
    if (input)
      void getApplicationChatClient()
        .openSession(input)
        .then(
          (session) => {
            if (attached) setEntry({ key, session });
          },
          (error) => {
            if (attached) setEntry({ key, error: String(error?.message ?? error) });
          },
        );
    return () => {
      attached = false;
    };
  }, [key]);
  return entry.key === key ? entry : { key };
}
