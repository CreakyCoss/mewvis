import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  text: string;
};

export const EmptyState = ({ icon, text }: EmptyStateProps) => (
  <div className="app-empty-state flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center">
    <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">{icon}</span>
    <div className="text-sm font-semibold text-foreground">{text}</div>
  </div>
);
