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
import type { PendingDeleteTarget } from "../ui-state";

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
  <AlertDialog open={pendingDelete !== null} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{pendingDelete?.kind === "source" ? "删除文件来源？" : "删除知识库？"}</AlertDialogTitle>
        <AlertDialogDescription>
          {pendingDelete?.kind === "source"
            ? `将从知识库中删除“${pendingDelete.source.title}”。此操作不会删除原始导入文件，但会移除对应索引内容。`
            : `将删除知识库“${pendingDelete?.collection.name ?? ""}”。已上传文件会保留，但这个知识库与来源的关系会被移除。`}
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

type RebuildIndexConfirmDialogProps = {
  open: boolean;
  isRebuilding: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export const RebuildIndexConfirmDialog = ({
  open,
  isRebuilding,
  onOpenChange,
  onConfirm,
}: RebuildIndexConfirmDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>重建知识库索引？</AlertDialogTitle>
        <AlertDialogDescription>
          重建索引会重新读取已启用知识库中的文件，并分别使用各知识库绑定的模型重新生成向量并写入
          sqlite-vec。资料较多时可能需要几分钟，期间知识库会显示全局加载状态。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isRebuilding}>取消</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={isRebuilding}
          onClick={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          确认重建
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
