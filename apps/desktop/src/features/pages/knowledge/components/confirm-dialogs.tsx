import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PendingDeleteTarget, PendingKnowledgeAction } from "../ui-state";

type DeleteConfirmDialogProps = {
  pendingDelete: PendingDeleteTarget | null;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export const DeleteConfirmDialog = ({
  pendingDelete,
  isDeleting,
  onOpenChange,
  onConfirm,
}: DeleteConfirmDialogProps) => (
  <AlertDialog
    open={pendingDelete !== null}
    onOpenChange={onOpenChange}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {pendingDelete?.kind === "source" ? "删除文件来源？" : "删除集合？"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {pendingDelete?.kind === "source"
            ? `将从知识库中删除“${pendingDelete.source.title}”。此操作不会删除原始导入文件，但会移除对应索引内容。`
            : `将删除集合“${pendingDelete?.collection.name ?? ""}”。已上传文件会保留，但这个集合与来源的关系会被移除。`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={isDeleting}
          onClick={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          {isDeleting ? "正在删除" : "确认删除"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

type KnowledgeActionConfirmDialogProps = {
  pendingAction: PendingKnowledgeAction;
  isRebuilding: boolean;
  isSavingEmbedding: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export const KnowledgeActionConfirmDialog = ({
  pendingAction,
  isRebuilding,
  isSavingEmbedding,
  onOpenChange,
  onConfirm,
}: KnowledgeActionConfirmDialogProps) => (
  <AlertDialog
    open={pendingAction !== null}
    onOpenChange={onOpenChange}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {pendingAction === "save-embedding"
            ? "保存 Embedding 模型配置？"
            : "重建知识库索引？"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {pendingAction === "save-embedding"
            ? "保存模型、地址或维度后，现有向量索引可能与新配置不一致。保存后请执行重建索引，系统会重新生成全部向量。"
            : "重建索引会重新读取已启用集合中的文件、重新生成向量并写入 sqlite-vec。资料较多时可能需要几分钟，期间知识库会显示全局加载状态。"}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isRebuilding || isSavingEmbedding}>
          取消
        </AlertDialogCancel>
        <AlertDialogAction
          variant={pendingAction === "rebuild-index" ? "destructive" : "default"}
          disabled={isRebuilding || isSavingEmbedding}
          onClick={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          {pendingAction === "save-embedding" ? "确认保存" : "确认重建"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
