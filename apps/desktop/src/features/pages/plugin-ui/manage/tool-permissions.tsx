import { useEffect, useState } from "react";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { PluginTool } from "@isle/plugin-sdk/tools";
import type { PluginDescriptor } from "@/api/plugins";
import { listPluginTools, savePluginToolPolicy } from "@/api/plugin-tools";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function PluginToolPermissions({ plugin, disabled }: { plugin: PluginDescriptor; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tools, setTools] = useState<PluginTool[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    void listPluginTools(plugin.id)
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
  }, [open, plugin.id, revision]);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await savePluginToolPolicy(
        plugin.id,
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
          variant="outline"
          size="sm"
          disabled={disabled || !plugin.enabled}
          title={plugin.enabled ? "选择允许插件使用的工具" : "启用插件后可设置工具"}
        >
          <Wrench className="size-3.5" />
          工具授权
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{plugin.name} · 工具授权</DialogTitle>
          <DialogDescription>
            选择此插件可以使用的宿主工具和自身工具。文件、网络及命令的访问范围仍由权限声明和当前权限档位控制。
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
            <div className="flex items-center gap-2 text-sm">
              <span className="mr-auto text-muted-foreground">
                已选择 {count} / {tools.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving || !!error}
                onClick={() => setTools((tools) => tools.map((tool) => ({ ...tool, enabled: true })))}
              >
                全选
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving || !!error}
                onClick={() => setTools((tools) => tools.map((tool) => ({ ...tool, enabled: false })))}
              >
                取消全选
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border px-3">
              {(["host", "plugin"] as const).map((source) => (
                <fieldset key={source} className="py-3" disabled={saving || !!error}>
                  <legend className="pt-3 text-xs font-medium text-muted-foreground">
                    {source === "host" ? "宿主工具" : "插件自身工具"}
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
