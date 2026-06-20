export type PendingDangerAction = {
  title: string;
  description: string;
  secondDescription: string;
  confirmLabel: string;
  summary?: string;
  onConfirm: () => void;
};
