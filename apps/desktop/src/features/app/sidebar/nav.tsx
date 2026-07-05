import { BookOpen, Bot, Database, MessageSquarePlus, Settings, Wine, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { To } from "react-router";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavProps = {
  chatPath: string;
};

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
  {
    id: "tavern",
    to: "/tavern",
    label: "酒馆",
    icon: Wine,
  },
];

const linkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground",
    isActive && "bg-muted/55 text-foreground",
  );

export const PrimaryNav = ({ chatPath }: NavProps) => (
  <nav className="space-y-1 px-2.5 pb-2.5 xl:px-3 xl:pb-3" aria-label="主导航">
    <Button
      asChild
      type="button"
      variant="ghost"
      className="h-10 w-full justify-start rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted/55"
    >
      <NavLink to={chatPath}>
        <MessageSquarePlus className="size-4" />
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
  <nav className="space-y-1 bg-transparent p-2.5" aria-label="辅助导航">
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
