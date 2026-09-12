import type { ReactNode } from "react";

export const emptyValueText = "未设置";

export const EmptyPanelCard = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-dashed border-current/15 bg-current/[0.045] px-3 py-5 text-center text-xs leading-5 text-current opacity-70 dark:bg-current/[0.065]">
    {children}
  </div>
);
