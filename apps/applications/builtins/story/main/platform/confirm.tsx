import { useEffect, useState } from "react";
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
type Request = { message: string; resolve(value: boolean): void };
let current: Request | null = null;
const listeners = new Set<() => void>();
export function confirm(message: string): Promise<boolean> {
  if (current) return Promise.reject(new Error("请先处理当前确认"));
  return new Promise((resolve) => {
    current = { message, resolve };
    listeners.forEach((fn) => fn());
  });
}
export function ConfirmationHost() {
  const [request, setRequest] = useState(current);
  useEffect(() => {
    const update = () => setRequest(current);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  const finish = (value: boolean) => {
    const pending = current;
    current = null;
    setRequest(null);
    pending?.resolve(value);
  };
  return (
    <AlertDialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) finish(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>清空酒馆运行数据</AlertDialogTitle>
          <AlertDialogDescription>{request?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>
            取消
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => finish(true)}>
            清空
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
