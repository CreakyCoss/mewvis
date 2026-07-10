import type { ReactNode } from "react";

export const emptyValueText = "未设置";

export const EmptyPanelCard = ({ children }: { children: ReactNode }) => (
  <div className="rounded-lg border border-current/10 bg-current/[0.045] dark:bg-current/[0.065] px-3 py-4 text-center text-xs leading-5 text-current opacity-70 shadow-sm">
    {children}
  </div>
);
