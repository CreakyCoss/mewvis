import { useEffect, useState } from "react";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { ApplicationTool } from "@mewvis/app-sdk/tools";
import type { ApplicationDescriptor } from "@/api/applications";
import { listApplicationTools, saveApplicationToolPolicy } from "@/api/applications/tools";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "design-system/components/ui/dialog";

export function ApplicationToolPermissions({
  application,
  disabled,
}: {
  application: ApplicationDescriptor;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tools, setTools] = useState<ApplicationTool[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    void listApplicationTools(application.id)
      .then(
        (tools) => {
          if (active) setTools(tools);
        },
        (error) => {
          if (active) setError(String(error));
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, application.id, revision]);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveApplicationToolPolicy(
        application.id,
        tools.filter((tool) => tool.enabled).map((tool) => tool.name),
      );
      toast.success("工具授权已保存", { description: "后续调用及聊天下一轮将使用新的选择。" });
      setOpen(false);
    } catch (error) {
      setError(String(error));
    } finally {
      setSaving(false);
    }
  };
  const count = tools.filter((tool) => tool.enabled).length;
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!saving) setOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-xs text-muted-foreground"
          disabled={disabled || !application.enabled}
          title={application.enabled ? "选择允许应用使用的工具" : "启用应用后可设置工具"}
        >
          <Wrench className="size-3.5" />
          工具授权
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{application.name} · 工具授权</DialogTitle>
          <DialogDescription>
            选择此应用可以使用的工具。应用工具按声明风险和聊天权限档位审批，文件、网络及命令仍受权限声明和沙箱限制。
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive">
            <span>{error}</span>
            <Button variant="outline" size="sm" disabled={saving} onClick={() => setRevision((value) => value + 1)}>
              重试
            </Button>
          </div>
        )}
        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载工具…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-xs text-muted-foreground" role="status">
                已选择 <span className="font-medium tabular-nums text-foreground">{count}</span> / {tools.length}
              </span>
              <div className="flex items-center" role="group" aria-label="批量选择工具">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-8 px-2 text-xs font-normal"
                  disabled={saving || !!error || count === tools.length}
                  onClick={() => setTools((tools) => tools.map((tool) => ({ ...tool, enabled: true })))}
                >
                  全选
                </Button>
                <span className="mx-1 h-3 w-px bg-border" aria-hidden="true" />
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-8 px-2 text-xs font-normal"
                  disabled={saving || !!error || count === 0}
                  onClick={() => setTools((tools) => tools.map((tool) => ({ ...tool, enabled: false })))}
                >
                  取消全选
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border px-3">
              {(["host", "application"] as const).map((source) => (
                <fieldset key={source} className="py-3" disabled={saving || !!error}>
                  <legend className="pt-3 text-xs font-medium text-muted-foreground">
                    {source === "host" ? "宿主工具" : "应用自身工具"}
                  </legend>
                  {tools
                    .filter((tool) => tool.source === source)
                    .map((tool) => (
                      <label
                        key={tool.name}
                        className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-3 hover:bg-muted/50"
                      >
                        <Checkbox
                          className="mt-1"
                          checked={tool.enabled}
                          onCheckedChange={(enabled) =>
                            setTools((tools) =>
                              tools.map((item) =>
                                item.name === tool.name ? { ...item, enabled: enabled === true } : item,
                              ),
                            )
                          }
                        />
                        <span className="min-w-0 text-sm">
                          <span className="font-medium">{tool.label}</span>
                          {tool.source === "application" && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {tool.risk
                                ? `声明风险：${{ low: "低", medium: "中", high: "高" }[tool.risk]}`
                                : "未声明风险"}
                            </span>
                          )}
                          {tool.label !== tool.name && (
                            <span className="ml-2 text-xs text-muted-foreground">{tool.name}</span>
                          )}
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{tool.description}</span>
                        </span>
                      </label>
                    ))}
                  {!tools.some((tool) => tool.source === source) && (
                    <p className="py-3 text-sm text-muted-foreground">暂无工具</p>
                  )}
                </fieldset>
              ))}
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          保存后从下一轮生效；正在执行的任务继续使用本轮授权。后续新增工具需在此勾选。
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button disabled={loading || saving || !!error} onClick={() => void save()}>
            {saving && <Loader2 className="size-4 animate-spin" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
