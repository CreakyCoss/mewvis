import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type Project = {
  id: string;
  name: string;
  description: string | null;
  path: string;
  isDefault: boolean;
  isPinned: boolean;
  order: number;
};

type ProjectOverview = {
  workspaces: Project[];
};

const SELECTED_PROJECT_STORAGE_KEY = "chat-next.selected-project";

const previewOverview = (): ProjectOverview => ({
  workspaces: [
    {
      id: "chat-next-preview-default",
      name: "默认工作区",
      description: "Web 预览模式",
      path: "",
      isDefault: true,
      isPinned: true,
      order: 0,
    },
  ],
});

const getProjectOverview = async () => {
  if (!isTauri()) {
    return previewOverview();
  }

  return invoke<ProjectOverview>("get_workspace_overview");
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "项目列表加载失败，请重试。";
};

export const ChatNextPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [composerNotice, setComposerNotice] = useState("");
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const projectTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let disposed = false;

    const loadProjects = async () => {
      setIsProjectsLoading(true);
      setProjectsError("");

      try {
        const overview = await getProjectOverview();
        if (disposed) {
          return;
        }

        const nextProjects = [...overview.workspaces].sort(
          (left, right) =>
            Number(right.isPinned) - Number(left.isPinned) ||
            left.order - right.order ||
            left.name.localeCompare(right.name, "zh-CN"),
        );
        const storedProjectId = window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
        const fallbackProject = nextProjects.find((project) => project.isDefault) ?? nextProjects[0] ?? null;
        const nextSelectedProject = nextProjects.find((project) => project.id === storedProjectId) ?? fallbackProject;

        setProjects(nextProjects);
        setSelectedProjectId(nextSelectedProject?.id ?? null);
      } catch (error) {
        if (!disposed) {
          setProjects([]);
          setSelectedProjectId(null);
          setProjectsError(getErrorMessage(error));
        }
      } finally {
        if (!disposed) {
          setIsProjectsLoading(false);
        }
      }
    };

    void loadProjects();

    return () => {
      disposed = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!isProjectPickerOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectPickerRef.current?.contains(event.target)) {
        setIsProjectPickerOpen(false);
        setProjectSearch("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setIsProjectPickerOpen(false);
      setProjectSearch("");
      projectTriggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isProjectPickerOpen]);

  const defaultProject = projects.find((project) => project.isDefault) ?? null;
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? defaultProject;
  const selectedRealProject = selectedProject && !selectedProject.isDefault ? selectedProject : null;
  const normalizedSearch = projectSearch.trim().toLocaleLowerCase("zh-CN");
  const visibleProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          !project.isDefault &&
          (!normalizedSearch ||
            project.name.toLocaleLowerCase("zh-CN").includes(normalizedSearch) ||
            project.path.toLocaleLowerCase("zh-CN").includes(normalizedSearch)),
      ),
    [normalizedSearch, projects],
  );

  const chooseProject = (project: Project | null) => {
    const nextProjectId = project?.id ?? null;
    setSelectedProjectId(nextProjectId);
    setIsProjectPickerOpen(false);
    setProjectSearch("");
    setComposerNotice("");
    window.requestAnimationFrame(() => projectTriggerRef.current?.focus());

    if (nextProjectId) {
      window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, nextProjectId);
    } else {
      window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
    }
  };

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }

    setComposerNotice("主页面和项目选择已就绪，消息发送将在下一步接入。当前输入内容已为你保留。");
  };

  const projectLabel = selectedRealProject?.name ?? "不使用项目";

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
                  selectedRealProject ? `我们应该在 ${selectedRealProject.name} 中构建什么？` : "我们应该构建什么？"
                }
              >
                {selectedRealProject ? (
                  <>
                    <span className="shrink-0">我们应该在&nbsp;</span>
                    <span className="max-w-full min-w-0 truncate">{selectedRealProject.name}</span>
                    <span className="shrink-0">&nbsp;中构建什么？</span>
                  </>
                ) : (
                  "我们应该构建什么？"
                )}
              </h1>

              <div className="space-y-3">
                <form
                  className="relative mx-auto flex w-full max-w-[69rem] flex-col overflow-hidden rounded-xl bg-card shadow-[0_14px_34px_-30px_rgb(15_23_42_/_0.34),0_2px_8px_-7px_rgb(15_23_42_/_0.18),0_1px_2px_rgb(15_23_42_/_0.06)] ring-1 ring-border/50 transition-shadow duration-200 focus-within:ring-3 focus-within:ring-ring/20"
                  onSubmit={submitPrompt}
                >
                  <label htmlFor="chat-next-prompt" className="sr-only">
                    对话内容
                  </label>
                  <textarea
                    id="chat-next-prompt"
                    value={prompt}
                    rows={3}
                    placeholder={selectedRealProject ? `询问关于 ${selectedRealProject.name} 的任何问题` : "输入问题"}
                    className="max-h-48 min-h-28 w-full resize-none border-0 bg-transparent px-4 py-4 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground/70"
                    onChange={(event) => {
                      setPrompt(event.currentTarget.value);
                      setComposerNotice("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />

                  <div className="flex min-h-12 items-center justify-between gap-3 px-3 pb-3">
                    <span className="px-1 text-xs text-muted-foreground">Ctrl / ⌘ Enter 发送</span>
                    <button
                      type="submit"
                      disabled={!prompt.trim()}
                      aria-label="发送消息"
                      className="flex size-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-xs transition-colors duration-200 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m22 2-7 20-4-9-9-4Z" />
                        <path d="M22 2 11 13" />
                      </svg>
                    </button>
                  </div>
                </form>

                <div className="mx-auto flex w-full max-w-[69rem] flex-wrap items-start gap-3 px-1">
                  <div ref={projectPickerRef} className="relative min-w-0">
                    <button
                      ref={projectTriggerRef}
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={isProjectPickerOpen}
                      aria-controls="chat-next-project-picker"
                      title={selectedRealProject?.path || projectLabel}
                      disabled={isProjectsLoading}
                      className="flex h-11 max-w-72 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                      onClick={() => {
                        setIsProjectPickerOpen((open) => !open);
                        setProjectSearch("");
                      }}
                    >
                      {isProjectsLoading ? (
                        <svg
                          viewBox="0 0 24 24"
                          className="size-4 shrink-0 motion-safe:animate-spin"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          className="size-4 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path d="M3 7.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                          <path d="M3 7.5V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2.5" />
                        </svg>
                      )}
                      <span className="min-w-0 truncate">{isProjectsLoading ? "正在加载项目" : projectLabel}</span>
                      <svg
                        viewBox="0 0 24 24"
                        className={`size-3.5 shrink-0 transition-transform duration-200 ${isProjectPickerOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>

                    {isProjectPickerOpen && (
                      <div
                        id="chat-next-project-picker"
                        role="dialog"
                        aria-label="选择项目"
                        className="absolute top-[calc(100%+0.5rem)] left-0 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border/80 bg-popover p-2 text-popover-foreground shadow-xl"
                      >
                        <label htmlFor="chat-next-project-search" className="sr-only">
                          搜索项目
                        </label>
                        <div className="relative mb-2">
                          <svg
                            viewBox="0 0 24 24"
                            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                          </svg>
                          <input
                            id="chat-next-project-search"
                            type="search"
                            value={projectSearch}
                            autoFocus
                            placeholder="搜索项目"
                            className="h-11 w-full rounded-lg border border-transparent bg-muted/45 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring/40 focus:ring-2 focus:ring-ring/20"
                            onChange={(event) => setProjectSearch(event.currentTarget.value)}
                          />
                        </div>

                        <div className="max-h-64 space-y-1 overflow-y-auto">
                          {visibleProjects.length > 0 ? (
                            visibleProjects.map((project) => {
                              const isSelected = project.id === selectedRealProject?.id;

                              return (
                                <button
                                  key={project.id}
                                  type="button"
                                  aria-pressed={isSelected}
                                  title={project.path}
                                  className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                  onClick={() => chooseProject(project)}
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="size-4 shrink-0 text-muted-foreground"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    aria-hidden="true"
                                  >
                                    <path d="M3 7.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                                    <path d="M3 7.5V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2.5" />
                                  </svg>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{project.name}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{project.path}</span>
                                  </span>
                                  {isSelected && (
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="size-4 shrink-0 text-primary"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      aria-hidden="true"
                                    >
                                      <path d="m5 12 4 4L19 6" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                              {normalizedSearch ? "没有匹配的项目" : "还没有可选择的项目"}
                            </p>
                          )}
                        </div>

                        <div className="mt-2 border-t border-border/70 pt-2">
                          <button
                            type="button"
                            aria-pressed={!selectedRealProject}
                            className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            onClick={() => chooseProject(defaultProject)}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="size-4 shrink-0 text-muted-foreground"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              <path d="M3 7.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                              <path d="m8 12 8 8M16 12l-8 8" />
                            </svg>
                            <span className="min-w-0 flex-1 truncate">不使用项目</span>
                            {!selectedRealProject && (
                              <svg
                                viewBox="0 0 24 24"
                                className="size-4 shrink-0 text-primary"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                aria-hidden="true"
                              >
                                <path d="m5 12 4 4L19 6" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {projectsError && (
                    <div role="alert" className="flex min-h-11 items-center gap-2 text-sm text-destructive">
                      <span>{projectsError}</span>
                      <button
                        type="button"
                        className="h-9 cursor-pointer rounded-lg px-3 font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={() => setReloadKey((key) => key + 1)}
                      >
                        重试
                      </button>
                    </div>
                  )}
                </div>

                <p
                  aria-live="polite"
                  className="mx-auto min-h-5 w-full max-w-[69rem] px-1 text-sm text-muted-foreground"
                >
                  {composerNotice}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};
