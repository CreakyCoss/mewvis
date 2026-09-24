import { LoaderCircle, Pause, MessageCircleQuestion, ShieldCheck, type LucideIcon } from "lucide-react";
import { isChatBusy, type ChatSnapshot } from "@/chat/core";
import type { ChatActivity } from "@/workbench/pages/chats/workspace-store";

export const chatActivityPresentation = {
  pausing: { label: "暂停中", icon: Pause, className: "size-3.5 text-warning" },
  paused: { label: "已暂停", icon: Pause, className: "size-3.5 text-warning" },
  cancelling: { label: "取消中", icon: LoaderCircle, className: "size-3.5 animate-spin motion-reduce:animate-none" },
  running: {
    label: "处理中",
    icon: LoaderCircle,
    className: "size-3.5 animate-spin motion-reduce:animate-none",
  },
  "waiting-approval": {
    label: "待审批",
    icon: ShieldCheck,
    className: "size-3.5 text-warning",
  },
  "waiting-answer": {
    label: "待回答",
    icon: MessageCircleQuestion,
    className: "size-3.5 text-warning",
  },
} satisfies Record<ChatActivity, { label: string; icon: LucideIcon; className: string }>;

/** Waiting still occupies the turn; only a settled task has no activity. */
export function getChatActivity(snapshot: Readonly<ChatSnapshot>): ChatActivity | null {
  if (!isChatBusy(snapshot)) return null;
  if (snapshot.execution?.state === "cancelling") return "cancelling";
  if (snapshot.pendingApproval) return "waiting-approval";
  if (snapshot.pendingQuestion) return "waiting-answer";
  if (snapshot.execution?.state === "paused" || snapshot.execution?.state === "pausing")
    return snapshot.execution.state;
  return "running";
}
