import { useEffect, useState } from "react";
import { WorkspaceChatPage } from "@/features/workspace-chat/components/page";
import { WorkspacesPage } from "@/features/workspaces/components/page";
import type { Workspace } from "@/features/workspaces/types";
import "./App.css";

const App = () => {
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(() => {
    const stored = sessionStorage.getItem("novel-claw:active-workspace");
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as Workspace;
    } catch {
      sessionStorage.removeItem("novel-claw:active-workspace");
      return null;
    }
  });

  useEffect(() => {
    if (activeWorkspace) {
      sessionStorage.setItem(
        "novel-claw:active-workspace",
        JSON.stringify(activeWorkspace),
      );
      return;
    }

    sessionStorage.removeItem("novel-claw:active-workspace");
  }, [activeWorkspace]);

  if (activeWorkspace) {
    return (
      <WorkspaceChatPage
        workspace={activeWorkspace}
        onBack={() => setActiveWorkspace(null)}
      />
    );
  }

  return <WorkspacesPage onOpenWorkspace={setActiveWorkspace} />;
};

export default App;
