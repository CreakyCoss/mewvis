import type { FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceForm, WorkspaceGroup, WorkspaceSection } from "@/features/pages/workspace/types";

type WorkspaceFormDialogProps = {
  open: boolean;
  mode?: "create" | "edit";
  form: WorkspaceForm;
  groups: WorkspaceGroup[];
  sections: WorkspaceSection[];
  isSaving: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onFormChange: (updater: (current: WorkspaceForm) => WorkspaceForm) => void;
  onSubmit: () => Promise<unknown> | unknown;
};

export const WorkspaceFormDialog = ({
  open: isOpen,
  mode = "create",
  form,
  groups,
  sections,
  isSaving,
  error,
  onOpenChange,
  onFormChange,
  onSubmit,
}: WorkspaceFormDialogProps) => {
  const isEditing = mode === "edit";
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

  const visibleGroups = groups.length ? groups : sections.map(({ group }) => group);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border/60 bg-surface-raised/85 px-6 py-5 pr-14 text-left">
          <DialogTitle className="text-lg">{isEditing ? "编辑工作区" : "新增工作区"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "修改工作区信息并保存，保存时会校验并迁移 workspace.db。"
              : "填写工作区信息，并选择一个用于保存 workspace.db 的目录。"}
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="app-canvas min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
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
              <NativeSelect
                className="w-full"
                id="workspace-group"
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
                  <NativeSelectOption key={group.id} value={group.id}>
                    {group.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
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
                <Button type="button" variant="outline" onClick={chooseDirectory} title="选择目录">
                  <FolderOpen className="size-4" />
                  <span>选择</span>
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 bg-surface-raised/85 px-6 py-4">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (isEditing ? "正在保存" : "正在创建") : isEditing ? "保存工作区" : "创建工作区"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
