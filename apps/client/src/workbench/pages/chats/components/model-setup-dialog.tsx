import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { getLlmModelOptions } from "@/api/llm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "design-system/components/ui/alert-dialog";

export function ModelSetupDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void getLlmModelOptions({ refresh: true }).then(
      (models) => {
        if (active) setOpen(models.length === 0);
      },
      () => {
        // Loading failures are reported by the chat; they do not mean no LLM is configured.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>先配置一个聊天模型</AlertDialogTitle>
          <AlertDialogDescription>
            当前没有可用的模型。请前往模型设置添加模型服务和模型后开始聊天。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>稍后</AlertDialogCancel>
          <AlertDialogAction onClick={() => navigate("/settings/llm")}>去配置</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
