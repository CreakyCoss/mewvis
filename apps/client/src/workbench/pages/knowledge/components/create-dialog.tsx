import { openSystemDialog as open } from "@/api/native";
import { FolderOpen, Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { saveKnowledgeCollection } from "@/api/knowledge";
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
import type { EmbeddingProfile } from "@/api/embedding";

type CreateDialogProps = {
  open: boolean;
  embeddingProfiles: EmbeddingProfile[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

const emptyDraft = () => ({
  name: "",
  description: "",
  sourceDirectory: "",
  embeddingProfileId: "",
});

const directoryName = (path: string) =>
  path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1) ?? "";

export const CreateDialog = ({ open: isOpen, embeddingProfiles, onOpenChange, onCreated }: CreateDialogProps) => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [isChoosingDirectory, setIsChoosingDirectory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraft({ ...emptyDraft(), embeddingProfileId: embeddingProfiles[0]?.id ?? "" });
    setError("");
  }, [embeddingProfiles, isOpen]);

  const chooseDirectory = async () => {
    setIsChoosingDirectory(true);
    setError("");
    try {
      const selected = await open({ multiple: false, directory: true, title: "选择知识库目录" });
      const path = typeof selected === "string" ? selected : null;
      if (!path) return;
      setDraft((current) => ({
        ...current,
        sourceDirectory: path,
        name: current.name.trim() ? current.name : directoryName(path),
      }));
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsChoosingDirectory(false);
    }
  };

  const createKnowledge = async () => {
    const name = draft.name.trim();
    if (!draft.sourceDirectory) {
      setError("请选择知识库目录");
      return;
    }
    if (!name) {
      setError("请输入知识库名称");
      return;
    }
    if (!draft.embeddingProfileId) {
      setError("请选择向量模型");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const library = await saveKnowledgeCollection({
        name,
        description: draft.description.trim() || null,
        sourceDirectory: draft.sourceDirectory,
        enabled: true,
        embeddingProfileId: draft.embeddingProfileId,
        order: null,
      });
      const created = [...library.collections]
        .filter((collection) => collection.sourceDirectory === draft.sourceDirectory)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
      if (!created) throw new Error("知识库已创建，但无法打开详情");
      onOpenChange(false);
      onCreated();
      navigate(`/knowledge/${created.id}`);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <DialogContent className="!flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14 text-left">
          <DialogTitle>新建知识库</DialogTitle>
          <DialogDescription>选择本地目录和向量模型，创建后即可建立可检索索引。</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-surface/35 px-6 py-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label>知识库目录</Label>
            <button
              type="button"
              className="mt-2 flex min-h-20 w-full items-center gap-3 rounded-xl border border-dashed border-input bg-card px-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/3 focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none"
              onClick={() => void chooseDirectory()}
              disabled={isChoosingDirectory || isSaving}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                {isChoosingDirectory ? (
                  <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
                ) : (
                  <FolderOpen className="size-5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {draft.sourceDirectory ? "已选择目录" : "选择一个本地目录"}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {draft.sourceDirectory || "目录中的支持文件将作为这个知识库的资料来源"}
                </span>
              </span>
            </button>
          </div>

          <div>
            <Label htmlFor="knowledge-create-name">知识库名称</Label>
            <Input
              id="knowledge-create-name"
              className="mt-2"
              value={draft.name}
              placeholder="例如：产品设计资料库"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="knowledge-create-description">描述</Label>
            <Textarea
              id="knowledge-create-description"
              className="mt-2 min-h-20 resize-none"
              value={draft.description}
              placeholder="简要说明这个知识库包含的内容（可选）"
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="knowledge-create-embedding">向量模型</Label>
            <NativeSelect
              id="knowledge-create-embedding"
              className="mt-2 w-full"
              value={draft.embeddingProfileId}
              disabled={embeddingProfiles.length === 0 || isSaving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, embeddingProfileId: event.currentTarget.value }))
              }
            >
              <NativeSelectOption value="" disabled>
                {embeddingProfiles.length ? "请选择向量模型" : "请先在设置中添加 Embedding 配置"}
              </NativeSelectOption>
              {embeddingProfiles.map((profile) => (
                <NativeSelectOption key={profile.id} value={profile.id}>
                  {profile.name} · {profile.modelId}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {embeddingProfiles.length === 0 && (
              <Button
                type="button"
                variant="link"
                className="mt-1 h-auto px-0 text-xs"
                onClick={() => navigate("/settings/embedding")}
              >
                前往 Embedding 设置
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void createKnowledge()}
            disabled={isSaving || !draft.sourceDirectory || !draft.name.trim() || !draft.embeddingProfileId}
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus className="size-4" />
            )}
            创建知识库
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
