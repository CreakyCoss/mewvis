import { BookOpen, Bot, Database, Settings, Sparkles, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { To } from "react-router";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  to: To;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { id: "skills", to: "/skills", label: "技能广场", icon: Wrench },
  { id: "knowledge", to: "/knowledge", label: "知识库", icon: Database },
  {
    id: "stories",
    to: "/stories",
    label: "故事",
    icon: BookOpen,
  },
];

const linkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/25 focus-visible:outline-none",
    isActive &&
      "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary",
  );

export const PrimaryNav = () => (
  <nav className="space-y-1 px-2.5 pb-3 xl:px-3" aria-label="主导航">
    <Button
      asChild
      type="button"
      className="mb-2 h-10 w-full justify-start rounded-lg px-3 text-sm font-medium shadow-sm"
    >
      <NavLink to="/chat-next">
        <Sparkles className="size-4" />
        <span>新建对话</span>
      </NavLink>
    </Button>
    {navItems.map((item) => {
      const Icon = item.icon;

      return (
        <NavLink key={item.id} to={item.to} className={linkClassName}>
          <Icon className="size-4" />
          <span>{item.label}</span>
        </NavLink>
      );
    })}
  </nav>
);

export const UtilityNav = () => (
  <nav className="space-y-1 border-t border-sidebar-border bg-transparent p-2.5 xl:p-3" aria-label="辅助导航">
    <NavLink to="/hub" className={linkClassName}>
      <Bot className="size-4" />
      <span>中枢</span>
    </NavLink>
    <NavLink to="/settings" className={linkClassName}>
      <Settings className="size-4" />
      <span>设置</span>
    </NavLink>
  </nav>
);
