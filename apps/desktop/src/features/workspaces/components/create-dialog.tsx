import type { FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
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
import type {
  WorkspaceForm,
  WorkspaceGroup,
  WorkspaceSection,
} from "../types";

type CreateDialogProps = {
  open: boolean;
  form: WorkspaceForm;
  groups: WorkspaceGroup[];
  sections: WorkspaceSection[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (updater: (current: WorkspaceForm) => WorkspaceForm) => void;
  onSubmit: () => Promise<void>;
};

export const CreateDialog = ({
  open: isOpen,
  form,
  groups,
  sections,
  isSaving,
  onOpenChange,
  onFormChange,
  onSubmit,
}: CreateDialogProps) => {
  const chooseDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择工作区目录",
    });

    if (typeof selected === "string") {
      onFormChange((current) => ({ ...current, path: selected }));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  const visibleGroups = groups.length
    ? groups
    : sections.map(({ group }) => group);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="border border-border/70 shadow-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">新增工作区</DialogTitle>
          <DialogDescription>
            填写工作区信息，并选择一个用于保存 workspace.db 的目录。
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="workspace-name">工作区名称</Label>
            <Input
              id="workspace-name"
              value={form.name}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onFormChange((current) => ({
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
                onFormChange((current) => ({
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
                onFormChange((current) => ({
                  ...current,
                  groupId: value,
                }));
              }}
            >
              {visibleGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
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
                  onFormChange((current) => ({
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
  );
};
