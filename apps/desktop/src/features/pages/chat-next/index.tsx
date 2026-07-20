import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { WorkspaceDialog, type WorkspaceDialogHandle } from "./components/workspace-dialog";
import { WorkspacePicker } from "./components/workspace-picker";
import { useChatNextWorkspaceStore } from "./workspace-store";

export const ChatNextPage = () => {
  const workspaceStore = useChatNextWorkspaceStore();
  const workspaceDialogRef = useRef<WorkspaceDialogHandle>(null);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    void workspaceStore.loadWorkspaces();
  }, [workspaceStore.loadWorkspaces]);

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }
  };

  return (
    <main className="relative flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      <section
        aria-labelledby="chat-next-title"
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-y-auto px-4 py-8 sm:px-8"
      >
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex min-h-[calc(100vh-9rem)] flex-col items-center justify-center py-10">
            <div className="w-full space-y-7">
              <h1
                id="chat-next-title"
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
                    <span className="max-w-full min-w-0 truncate">{workspaceStore.currentWorkspace.name}</span>
                    <span className="shrink-0">&nbsp;中构建什么？</span>
                  </>
                ) : (
                  "我们应该构建什么？"
                )}
              </h1>

              <div className="space-y-3">
                <form className="mx-auto w-full max-w-[69rem]" onSubmit={submitPrompt}>
                  <InputGroup className="h-auto flex-col items-stretch overflow-hidden rounded-xl border-0 bg-card shadow-[0_14px_34px_-30px_rgb(15_23_42_/_0.34),0_2px_8px_-7px_rgb(15_23_42_/_0.18),0_1px_2px_rgb(15_23_42_/_0.06)] ring-1 ring-border/50 transition-shadow duration-200 has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/20 dark:bg-card">
                    <label htmlFor="chat-next-prompt" className="sr-only">
                      对话内容
                    </label>
                    <InputGroupTextarea
                      id="chat-next-prompt"
                      value={prompt}
                      rows={3}
                      placeholder={
                        workspaceStore.currentWorkspace
                          ? `询问关于 ${workspaceStore.currentWorkspace.name} 的任何问题`
                          : "输入问题"
                      }
                      className="max-h-48 min-h-28 w-full px-4 py-4 text-base leading-6 placeholder:text-muted-foreground/70"
                      onChange={(event) => setPrompt(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />

                    <InputGroupAddon
                      align="block-end"
                      className="min-h-12 justify-between gap-3 px-3 pt-0 pb-3 font-normal"
                    >
                      <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                        <KbdGroup>
                          <Kbd>Ctrl</Kbd>
                          <span>/</span>
                          <Kbd>⌘</Kbd>
                          <Kbd>Enter</Kbd>
                        </KbdGroup>
                        <span>发送</span>
                      </span>
                      <InputGroupButton
                        type="submit"
                        size="icon-sm"
                        variant="outline"
                        disabled={!prompt.trim()}
                        aria-label="发送消息"
                        className="size-10 cursor-pointer rounded-lg shadow-xs"
                      >
                        <SendIcon aria-hidden="true" />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </form>

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
