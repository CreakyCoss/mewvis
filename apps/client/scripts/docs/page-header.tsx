import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { LayoutGrid, Plus, Puzzle, RefreshCw } from "lucide-react";
import { PageHeader, PageHeaderDescription, PageHeaderTitle } from "design-system/components/page-header";
import { Button } from "design-system/components/ui/button";
import "../../src/App.css";

function CustomHeader({ onAction }: { onAction: () => void }) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-4">
      <div>
        <PageHeaderTitle>完整自定义组件</PageHeaderTitle>
        <PageHeaderDescription>布局由调用方提供，文字仍使用共享组件。</PageHeaderDescription>
      </div>
      <Button onClick={onAction}>自定义操作</Button>
    </div>
  );
}

function HeaderPreview() {
  const [dark, setDark] = useState(false);
  const [titleSize, setTitleSize] = useState(18);
  const [options, setOptions] = useState({
    icon: false,
    description: true,
    back: false,
    actions: true,
    leading: false,
    content: false,
  });
  const [message, setMessage] = useState("操作反馈");
  return (
    <div className={dark ? "dark" : ""} style={{ "--page-header-title-size": `${titleSize}px` } as CSSProperties}>
      <main className="min-h-dvh bg-background p-4 text-foreground sm:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">PageHeader 组合预览</h1>
              <p className="mt-1 text-sm text-muted-foreground">统一字号、间距、图标与返回按钮，按需配置内容。</p>
            </div>
            <Button variant="outline" onClick={() => setDark(!dark)}>
              {dark ? "深色模式" : "浅色模式"}
            </Button>
          </div>
          <fieldset className="flex flex-wrap gap-x-5 gap-y-3 rounded-xl border border-border p-4">
            <legend className="px-2 text-sm font-medium">可选配置</legend>
            {(
              [
                ["icon", "显示图标"],
                ["description", "显示说明"],
                ["back", "显示返回按钮"],
                ["actions", "显示右侧操作"],
                ["leading", "自定义左侧组件"],
                ["content", "完整自定义组件"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(event) => setOptions({ ...options, [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              统一标题字号
              <input
                aria-label="统一标题字号"
                type="number"
                min={14}
                max={24}
                value={titleSize}
                onChange={(event) => setTitleSize(Math.max(14, Math.min(24, Number(event.target.value) || 18)))}
                className="w-16 rounded-md border border-border bg-background px-2 py-1"
              />
              px
            </label>
          </fieldset>
          <section aria-label="参数组合" className="overflow-hidden rounded-xl border border-border">
            <PageHeader
              title="应用"
              description={options.description && "为你的创作，选一件顺手的工具。"}
              icon={options.icon ? <LayoutGrid aria-hidden="true" className="size-5 text-primary" /> : undefined}
              showBack={options.back}
              backLabel="返回"
              onBack={() => setMessage("返回按钮已触发")}
              actions={
                options.actions ? (
                  <Button onClick={() => setMessage("右侧操作已触发")}>
                    <Plus className="size-4" />
                    新建
                  </Button>
                ) : undefined
              }
              leading={
                options.leading ? (
                  <div>
                    <PageHeaderTitle>自定义左侧</PageHeaderTitle>
                    <PageHeaderDescription>替换默认标题、图标与返回区域。</PageHeaderDescription>
                  </div>
                ) : undefined
              }
              content={options.content && <CustomHeader onAction={() => setMessage("自定义操作已触发")} />}
            />
            <div className="min-h-24 bg-surface/45 p-6 text-sm text-muted-foreground">页面内容</div>
          </section>
          <section aria-label="应用页原有样式" className="space-y-2">
            <h2 className="text-sm font-medium">应用：无图标、无返回按钮</h2>
            <div className="rounded-xl border border-border">
              <PageHeader
                title="应用"
                description="为你的创作，选一件顺手的工具。"
                variant="plain"
                actions={
                  <Button variant="ghost" size="icon" aria-label="刷新应用" onClick={() => setMessage("应用已刷新")}>
                    <RefreshCw className="size-3.5" />
                  </Button>
                }
              />
            </div>
          </section>
          <section aria-label="插件参数示例" className="space-y-2">
            <h2 className="text-sm font-medium">插件：显示图标和右侧操作，排版与应用一致</h2>
            <div className="overflow-hidden rounded-xl border border-border">
              <PageHeader
                title="插件"
                description="按需扩展 Agent 能力与应用界面"
                icon={<Puzzle />}
                variant="soft"
                actions={
                  <Button onClick={() => setMessage("添加插件已触发")}>
                    <Plus className="size-4" />
                    添加插件
                  </Button>
                }
              />
            </div>
          </section>
          <section aria-label="返回参数示例" className="space-y-2">
            <h2 className="text-sm font-medium">模型设置：由组件统一渲染返回按钮</h2>
            <div className="overflow-hidden rounded-xl border border-border">
              <PageHeader
                title="模型设置"
                description="管理模型服务、凭据与可用模型"
                showBack
                backLabel="返回设置"
                onBack={() => setMessage("返回设置已触发")}
              />
            </div>
          </section>
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        </div>
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<HeaderPreview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
