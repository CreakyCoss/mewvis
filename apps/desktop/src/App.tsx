import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Database,
  Folder,
  FolderOpen,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import "./App.css";

type WorkspaceGroup = {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};

type Workspace = {
  id: string;
  name: string;
  description: string | null;
  path: string;
  isPinned: boolean;
  order: number;
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
};

type WorkspaceOverview = {
  configDbPath: string;
  groups: WorkspaceGroup[];
  workspaces: Workspace[];
};

type WorkspaceForm = {
  name: string;
  description: string;
  path: string;
  groupId: string;
};

const defaultForm: WorkspaceForm = {
  name: "",
  description: "",
  path: "",
  groupId: "default",
};

function App() {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [form, setForm] = useState<WorkspaceForm>(defaultForm);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadOverview() {
    setIsLoading(true);
    setError("");

    try {
      const data = await invoke<WorkspaceOverview>("get_workspace_overview");
      setOverview(data);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  const groupsWithWorkspaces = useMemo(() => {
    const groups = overview?.groups ?? [];
    const workspaces = overview?.workspaces ?? [];
    const defaultGroup = groups.find((group) => group.isDefault) ?? {
      id: "default",
      name: "默认分组",
      order: 0,
      isDefault: true,
      createdAt: 0,
      updatedAt: 0,
    };

    const knownGroupIds = new Set(groups.map((group) => group.id));
    const normalizedGroups = groups.length > 0 ? groups : [defaultGroup];

    return normalizedGroups.map((group) => {
      const items = workspaces
        .filter((workspace) => {
          if (workspace.groupId === group.id) {
            return true;
          }

          return (
            group.isDefault &&
            (!workspace.groupId || !knownGroupIds.has(workspace.groupId))
          );
        })
        .sort((left, right) => {
          if (left.isPinned !== right.isPinned) {
            return left.isPinned ? -1 : 1;
          }

          if (left.order !== right.order) {
            return left.order - right.order;
          }

          return right.createdAt - left.createdAt;
        });

      return { group, workspaces: items };
    });
  }, [overview]);

  async function chooseDirectory() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择工作区目录",
    });

    if (typeof selected === "string") {
      setForm((current) => ({ ...current, path: selected }));
    }
  }

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      await invoke("create_workspace", {
        input: {
          name: form.name,
          description: form.description,
          path: form.path,
          groupId: form.groupId,
        },
      });
      setForm(defaultForm);
      setIsDialogOpen(false);
      await loadOverview();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="size-4" />
              <span>配置数据库</span>
              <span className="max-w-[60vw] truncate">
                {overview?.configDbPath ?? "正在初始化"}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-normal">
              Novel Claw 工作区
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              type="button"
              disabled
              title="LLM 设置将在后续阶段实现"
            >
              <Settings className="size-4" />
              <span>LLM 设置</span>
            </Button>
            <Button type="button" onClick={() => setIsDialogOpen(true)}>
              <Plus className="size-4" />
              <span>新增工作区</span>
            </Button>
          </div>
        </header>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="flex-1 py-6">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              正在读取工作区
            </div>
          ) : overview?.workspaces.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-muted/30 px-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-md bg-background ring-1 ring-border">
                <FolderOpen className="size-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-medium">还没有工作区</h2>
                <p className="text-sm text-muted-foreground">
                  创建第一个工作区后，会在所选目录中初始化 workspace.db。
                </p>
              </div>
              <Button type="button" onClick={() => setIsDialogOpen(true)}>
                <Plus className="size-4" />
                <span>新增工作区</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {groupsWithWorkspaces.map(({ group, workspaces }) => (
                <section key={group.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {group.name}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {workspaces.length} 个工作区
                    </span>
                  </div>

                  {workspaces.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      当前分组暂无工作区
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {workspaces.map((workspace) => (
                        <article
                          key={workspace.id}
                          className="rounded-md border border-border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                              <Folder className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="truncate text-base font-medium">
                                  {workspace.name}
                                </h3>
                                {workspace.isPinned && (
                                  <Sparkles className="size-4 shrink-0 text-primary" />
                                )}
                              </div>
                              {workspace.description && (
                                <p className="line-clamp-2 text-sm text-muted-foreground">
                                  {workspace.description}
                                </p>
                              )}
                              <p className="truncate text-xs text-muted-foreground">
                                {workspace.path}
                              </p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增工作区</DialogTitle>
            <DialogDescription>
              填写工作区信息，并选择一个用于保存 workspace.db 的目录。
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={createWorkspace}>
            <div className="space-y-2">
              <Label htmlFor="workspace-name">工作区名称</Label>
              <Input
                id="workspace-name"
                value={form.name}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((current) => ({
                    ...current,
                    name: value,
                  }));
                }}
                placeholder="例如：长篇小说项目"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-description">工作区描述</Label>
              <Textarea
                id="workspace-description"
                value={form.description}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((current) => ({
                    ...current,
                    description: value,
                  }));
                }}
                placeholder="可填写项目主题、目标或备注"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-group">工作区分组</Label>
              <select
                id="workspace-group"
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={form.groupId}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((current) => ({
                    ...current,
                    groupId: value,
                  }));
                }}
              >
                {(overview?.groups.length ? overview.groups : groupsWithWorkspaces.map(({ group }) => group)).map(
                  (group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-path">工作区目录</Label>
              <div className="flex gap-2">
                <Input
                  id="workspace-path"
                  value={form.path}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({
                      ...current,
                      path: value,
                    }));
                  }}
                  placeholder="请选择目录"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={chooseDirectory}
                  title="选择目录"
                >
                  <FolderOpen className="size-4" />
                  <span>选择</span>
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "正在创建" : "创建工作区"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default App;
