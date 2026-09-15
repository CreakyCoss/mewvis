import { useImperativeHandle, useState, type ChangeEvent, type Ref } from "react";
import { openSystemDialog as openDirectoryDialog } from "@/api/native";
import { FolderOpenIcon } from "lucide-react";
import type { Workspace } from "@/api/workspace";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceStore } from "../workspace-store";

export type WorkspaceDialogHandle = (workspace?: Workspace) => void;

type WorkspaceDialogProps = {
  bind: Ref<WorkspaceDialogHandle>;
};

const emptyWorkspaceForm = {
  name: "",
  description: "",
  path: "",
};

export const WorkspaceDialog = ({ bind }: WorkspaceDialogProps) => {
  const workspaceStore = useWorkspaceStore();
  const [isOpen, setIsOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState(emptyWorkspaceForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const resetDialog = () => {
    setWorkspace(null);
    setForm(emptyWorkspaceForm);
    setError("");
  };

  const open = (nextWorkspace?: Workspace) => {
    setWorkspace(nextWorkspace ?? null);
    setForm(
      nextWorkspace
        ? {
            name: nextWorkspace.name,
            description: nextWorkspace.description ?? "",
            path: nextWorkspace.path,
          }
        : emptyWorkspaceForm,
    );
    setError("");
    setIsOpen(true);
  };

  useImperativeHandle(bind, () => open);

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSaving) {
      return;
    }

    setIsOpen(nextOpen);
    if (!nextOpen) {
      resetDialog();
    }
  };

  const chooseDirectory = async () => {
    try {
      const selected = await openDirectoryDialog({
        directory: true,
        multiple: false,
        title: "选择工作区目录",
      });

      if (typeof selected === "string") {
        setForm((current) => ({ ...current, path: selected }));
        setError("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const updateFormField =
    (field: keyof typeof emptyWorkspaceForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.currentTarget.value;
      setForm((current) => ({ ...current, [field]: value }));
    };

  const saveWorkspace = async () => {
    setIsSaving(true);
    setError("");

    try {
      if (workspace) {
        await workspaceStore.updateWorkspace(workspace.id, form);
      } else {
        await workspaceStore.createWorkspace(form);
      }
      setIsOpen(false);
      resetDialog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="!flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={!isSaving}
      >
        <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
          <DialogTitle className="text-lg">{workspace ? "修改工作区" : "新建工作区"}</DialogTitle>
          <DialogDescription>
            {workspace
              ? "修改工作区名称和描述。工作区目录创建后不可修改。"
              : "填写工作区信息，并选择一个用于保存 workspace.db 的目录。创建后会自动切换到新工作区。"}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void saveWorkspace();
          }}
        >
          <div className="app-canvas min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="chat-home-workspace-dialog-name">工作区名称</Label>
              <Input
                id="chat-home-workspace-dialog-name"
                value={form.name}
                placeholder="例如：长篇小说项目"
                disabled={isSaving}
                required
                onChange={updateFormField("name")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chat-home-workspace-dialog-description">工作区描述</Label>
              <Textarea
                id="chat-home-workspace-dialog-description"
                value={form.description}
                placeholder="可填写项目主题、目标或备注"
                rows={3}
                disabled={isSaving}
                onChange={updateFormField("description")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chat-home-workspace-dialog-path">工作区目录</Label>
              <div className="flex gap-2">
                <Input
                  id="chat-home-workspace-dialog-path"
                  value={form.path}
                  placeholder="请选择目录"
                  disabled={isSaving}
                  readOnly={Boolean(workspace)}
                  aria-describedby={workspace ? "chat-home-workspace-dialog-path-help" : undefined}
                  className={workspace ? "bg-muted/50 text-muted-foreground" : undefined}
                  required
                  onChange={updateFormField("path")}
                />
                {!workspace && (
                  <Button
                    type="button"
                    variant="outline"
                    title="选择目录"
                    disabled={isSaving}
                    onClick={() => void chooseDirectory()}
                  >
                    <FolderOpenIcon aria-hidden="true" />
                    <span>选择</span>
                  </Button>
                )}
              </div>
              {workspace && (
                <p id="chat-home-workspace-dialog-path-help" className="text-xs leading-5 text-muted-foreground">
                  如需使用其他目录，请新建工作区。
                </p>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 bg-surface-raised/85 px-6 py-4">
            <Button type="submit" disabled={isSaving || !form.name.trim() || !form.path.trim()}>
              {isSaving && <Spinner aria-hidden="true" className="motion-reduce:animate-none" />}
              {isSaving ? "正在保存" : workspace ? "保存修改" : "创建工作区"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
