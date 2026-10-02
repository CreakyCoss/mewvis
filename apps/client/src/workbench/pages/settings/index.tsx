import { ChevronRight, Info, Settings, Shield } from "lucide-react";
import { Link } from "react-router";
import { Button } from "design-system/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { APP_DATA_DIR_NAME } from "@/product-config";
import { PageHeader } from "../page-header";

const settingsItems = [
  {
    to: "/settings/llm",
    title: "模型设置",
    description: "管理模型服务、凭据与可用模型",
    icon: Settings,
  },
  {
    to: "/settings/sandbox",
    title: "沙箱设置",
    description: "管理工具的执行方式与隔离环境",
    icon: Shield,
  },
];

const dataRoot = `~/${APP_DATA_DIR_NAME}`;

export const SettingsPage = () => (
  <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
    <PageHeader
      title="设置"
      description="管理模型服务与工具执行环境"
      titleAction={
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6 shrink-0 rounded-full text-muted-foreground/60 hover:bg-muted/70 hover:text-muted-foreground"
              aria-label="查看应用数据目录"
              title="应用数据目录"
            >
              <Info aria-hidden="true" className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            aria-label="应用数据目录"
            className="w-80 max-w-[calc(100vw-2rem)] gap-2"
          >
            <p className="text-sm font-medium">应用数据目录</p>
            <code className="select-text break-all text-xs leading-5">{dataRoot}</code>
            <p className="text-xs leading-5 text-muted-foreground">用于保存应用配置和本地数据。</p>
            <p className="text-xs leading-5 text-muted-foreground">
              <code>~</code> 表示用户主目录。自定义数据位置以实际配置为准。
            </p>
          </PopoverContent>
        </Popover>
      }
    />
    <ScrollArea className="min-h-0 flex-1">
      <nav aria-label="设置选项" className="w-full divide-y divide-border/70 border-y border-border/70">
        {settingsItems.map(({ to, title, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            aria-label={title}
            className="group grid min-h-24 w-full grid-cols-[1.5rem_minmax(0,1fr)_1rem] items-center gap-4 px-6 py-5 transition-colors hover:bg-accent/30 focus-visible:relative focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/25 focus-visible:outline-none lg:px-8 max-sm:gap-3"
          >
            <Icon aria-hidden="true" className="size-6 text-primary" />
            <span className="min-w-0">
              <span className="block text-base font-medium">{title}</span>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
        ))}
      </nav>
    </ScrollArea>
  </section>
);
