export type PendingDangerAction = {
  title: string;
  description: string;
  confirmLabel: string;
  summary?: string;
  onConfirm: () => void;
};
