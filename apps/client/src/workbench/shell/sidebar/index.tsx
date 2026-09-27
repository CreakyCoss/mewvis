import { PrimaryNav, UtilityNav } from "./nav";

export const AppSidebar = () => (
  <aside
    aria-label="全局导航"
    className="relative z-20 flex w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar pt-12 text-sidebar-foreground"
  >
    <PrimaryNav />
    <UtilityNav />
  </aside>
);
