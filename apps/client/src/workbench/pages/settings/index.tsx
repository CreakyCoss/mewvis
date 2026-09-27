import { ChevronRight, Settings, Shield } from "lucide-react";
import { Link } from "react-router";
import { ScrollArea } from "design-system/components/ui/scroll-area";
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

export const SettingsPage = () => (
  <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
    <PageHeader title="设置" description="管理模型服务与工具执行环境" />
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
