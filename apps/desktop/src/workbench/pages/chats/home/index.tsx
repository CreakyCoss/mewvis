import { useEffect, useRef } from "react";
import { WorkspaceDialog, type WorkspaceDialogHandle } from "../components/workspace-dialog";
import { WorkspacePicker } from "../components/workspace-picker";
import { EmptyComposer } from "@/chat/react";
import { HomeComposer } from "./chat";
import { useWorkspaceStore } from "../workspace-store";

export const ChatHomePage = () => {
  const workspaceStore = useWorkspaceStore();
  const workspaceDialogRef = useRef<WorkspaceDialogHandle>(null);
  useEffect(() => {
    void workspaceStore.loadWorkspaces();
  }, [workspaceStore.loadWorkspaces]);

  return (
    <main className="app-canvas relative flex h-full min-h-0 overflow-hidden text-foreground">
      <section
        aria-labelledby="chat-home-title"
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-y-auto px-4 py-8 sm:px-8"
      >
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex min-h-[calc(100vh-9rem)] flex-col items-center justify-center py-10">
            <div className="w-full space-y-7">
              <h1
                id="chat-home-title"
                className="mx-auto flex w-full max-w-[42rem] min-w-0 flex-wrap items-baseline justify-center text-center text-2xl font-semibold leading-tight tracking-normal text-foreground sm:text-3xl xl:text-4xl"
                title={
                  workspaceStore.currentWorkspace
                    ? `我们应该在 ${workspaceStore.currentWorkspace.name} 中构建什么？`
                    : "我们应该构建什么？"
                }
              >
                {workspaceStore.currentWorkspace ? (
                  <>
                    <span className="shrink-0">我们应该在&nbsp;</span>
                    <span className="max-w-full min-w-0 truncate text-primary">
                      {workspaceStore.currentWorkspace.name}
                    </span>
                    <span className="shrink-0">&nbsp;中构建什么？</span>
                  </>
                ) : (
                  "我们应该构建什么？"
                )}
              </h1>

              <div className="space-y-3">
                {workspaceStore.currentWorkspace ? (
                  <HomeComposer key={workspaceStore.currentWorkspace.id} workspace={workspaceStore.currentWorkspace} />
                ) : (
                  <EmptyComposer />
                )}

                <WorkspacePicker onCreateWorkspace={() => workspaceDialogRef.current?.()} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <WorkspaceDialog bind={workspaceDialogRef} />
    </main>
  );
};
