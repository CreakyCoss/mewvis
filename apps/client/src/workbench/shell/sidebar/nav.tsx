import { Blocks, Bot, ChevronUp, Database, MessageSquarePlus, Puzzle, Settings, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import { cn } from "design-system/lib/utils";
import { APP_DISPLAY_NAME } from "@/product-config";

type MenuItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const menuItems: MenuItem[] = [
  { to: "/hub", label: "中枢", icon: Bot },
  { to: "/skills", label: "技能", icon: Wrench },
  { to: "/knowledge", label: "知识库", icon: Database },
  { to: "/extensions", label: "插件", icon: Puzzle },
  { to: "/settings", label: "设置", icon: Settings },
];

const linkClassName =
  (collapsed: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/25 focus-visible:outline-none",
      collapsed && "justify-center px-0",
      isActive &&
        "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary",
    );

export const PrimaryNav = ({ collapsed }: { collapsed: boolean }) => (
  <nav className={cn("space-y-1 pb-3", collapsed ? "px-2" : "px-2.5 xl:px-3")} aria-label="主导航">
    <NavLink to="/chat" end className={linkClassName(collapsed)} title={collapsed ? "新建对话" : undefined}>
      <MessageSquarePlus className="size-4 shrink-0" />
      <span className={collapsed ? "sr-only" : undefined}>新建对话</span>
    </NavLink>
    <NavLink to="/apps" className={linkClassName(collapsed)} title={collapsed ? "应用" : undefined}>
      <Blocks className="size-4 shrink-0" />
      <span className={collapsed ? "sr-only" : undefined}>应用</span>
    </NavLink>
  </nav>
);

export const UtilityNav = ({ collapsed }: { collapsed: boolean }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      className={cn(
        "mt-auto border-t border-sidebar-border bg-sidebar py-1.5",
        collapsed ? "px-2" : "px-2.5 xl:px-3 xl:py-2",
      )}
      aria-label="更多导航"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`打开 ${APP_DISPLAY_NAME} 菜单`}
            title={collapsed ? `${APP_DISPLAY_NAME} 菜单` : undefined}
            className={cn(
              "flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-normal text-muted-foreground transition-colors hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/35 focus-visible:outline-none data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground"
              aria-hidden="true"
            >
              {APP_DISPLAY_NAME.charAt(0)}
            </span>
            <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{APP_DISPLAY_NAME}</span>
            {!collapsed && <ChevronUp className="size-4 shrink-0" aria-hidden="true" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className={cn("p-1.5", collapsed ? "w-44" : "w-(--radix-dropdown-menu-trigger-width)")}
          aria-label={`${APP_DISPLAY_NAME} 菜单`}
        >
          {menuItems.map(({ to, label, icon: Icon }) => (
            <DropdownMenuItem
              key={to}
              onSelect={() => navigate(to)}
              aria-current={pathname === to || pathname.startsWith(`${to}/`) ? "page" : undefined}
              className={cn(
                "h-10 gap-2.5 px-3 text-sidebar-foreground",
                (pathname === to || pathname.startsWith(`${to}/`)) &&
                  "bg-sidebar-accent text-sidebar-primary font-medium",
              )}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
};
