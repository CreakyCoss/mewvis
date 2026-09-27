import { Blocks, Bot, ChevronRight, Database, House, Puzzle, Settings, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import { cn } from "design-system/lib/utils";
import { APP_DISPLAY_NAME } from "@/product-config";

type MenuItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const primaryNavItems: MenuItem[] = [
  { to: "/apps", label: "应用", icon: Blocks },
  { to: "/knowledge", label: "知识库", icon: Database },
  { to: "/agents", label: "智能体", icon: Bot },
  { to: "/skills", label: "技能", icon: Wrench },
  { to: "/extensions", label: "插件", icon: Puzzle },
];

const utilityMenuItems: MenuItem[] = [{ to: "/settings", label: "设置", icon: Settings }];

const matchesMenuRoute = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

const linkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex h-9 w-full items-center justify-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/25 focus-visible:outline-none",
    isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
  );

export const PrimaryNav = () => {
  const { pathname } = useLocation();
  const isHomeActive = pathname === "/chat" || pathname.startsWith("/chats/");

  return (
    <nav className="space-y-1 px-2 pb-3" aria-label="主导航">
      <Link
        to="/chat"
        className={linkClassName({ isActive: isHomeActive })}
        title="首页"
        aria-current={isHomeActive ? "page" : undefined}
      >
        <House className="size-4 shrink-0" />
        <span className="sr-only">首页</span>
      </Link>
      {primaryNavItems.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={linkClassName} title={label}>
          <Icon className="size-4 shrink-0" />
          <span className="sr-only">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export const UtilityNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMenuPageActive = utilityMenuItems.some(({ to }) => matchesMenuRoute(pathname, to));

  return (
    <nav className="mt-auto space-y-1 border-t border-sidebar-border bg-sidebar px-2 py-1.5" aria-label="更多导航">
      <NavLink to="/hub" className={linkClassName} title="中枢">
        <img
          src="/assets/startup/mewvis-i-dot.png"
          alt=""
          aria-hidden="true"
          width={20}
          height={20}
          className="size-5 shrink-0 object-contain"
          draggable={false}
        />
        <span className="sr-only">中枢</span>
      </NavLink>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`打开 ${APP_DISPLAY_NAME} 菜单`}
            title={`${APP_DISPLAY_NAME} 菜单`}
            className={cn(
              linkClassName({ isActive: isMenuPageActive }),
              "h-10 cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
            )}
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground"
              aria-hidden="true"
            >
              {APP_DISPLAY_NAME.charAt(0)}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="w-56 p-1.5"
          aria-label={`${APP_DISPLAY_NAME} 菜单`}
        >
          <DropdownMenuLabel className="flex items-center gap-2.5 px-3 py-2.5">
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[10px] font-semibold text-sidebar-primary-foreground"
              aria-hidden="true"
            >
              {APP_DISPLAY_NAME.charAt(0)}
            </span>
            <span className="min-w-0 truncate text-sm font-medium text-popover-foreground">{APP_DISPLAY_NAME}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-1.5 my-1.5" />
          {utilityMenuItems.map(({ to, label, icon: Icon }) => {
            const isActive = matchesMenuRoute(pathname, to);

            return (
              <DropdownMenuItem
                key={to}
                onSelect={() => navigate(to)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "min-h-10 gap-2.5 px-3",
                  isActive && "bg-sidebar-accent text-sidebar-primary font-medium",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="flex-1">{label}</span>
                <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
};
