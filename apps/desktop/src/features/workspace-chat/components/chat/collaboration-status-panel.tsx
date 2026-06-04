import { memo } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import type { AgentProfile } from "@/features/agent-settings/types";
import type { CollaborationPhase } from "../../page-types";

type CollaborationStatusPanelProps = {
  writerAgent: AgentProfile | null;
  reviewerAgent: AgentProfile | null;
  phase: CollaborationPhase;
};

const getCollaborationAgentStatus = (
  role: "writer" | "reviewer",
  phase: CollaborationPhase,
) => {
  const isWorking =
    (role === "writer" && (phase === "drafting" || phase === "revising")) ||
    (role === "reviewer" && phase === "reviewing");

  if (isWorking) {
    return {
      label: role === "writer"
        ? phase === "drafting" ? "写作中" : "修订中"
        : "审查中",
      state: "working",
    } as const;
  }

  return {
    label: phase === "idle" ? "摸鱼中" : "待命中",
    state: phase === "idle" ? "idle" : "waiting",
  } as const;
};

export const CollaborationStatusPanel = memo(({
  writerAgent,
  reviewerAgent,
  phase,
}: CollaborationStatusPanelProps) => {
  const items = [
    { role: "writer" as const, title: "写作", agent: writerAgent },
    { role: "reviewer" as const, title: "审查", agent: reviewerAgent },
  ];

  return (
    <div className="bg-transparent px-3 py-3">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Agent 协作状态</span>
        <span>{phase === "idle" ? "空闲" : "执行中"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const status = getCollaborationAgentStatus(item.role, phase);
          const avatar = resolveAgentAvatar(item.agent?.avatar);

          return (
            <div
              key={item.role}
              className="overflow-hidden rounded-md bg-card/70 shadow-xs"
            >
              <div className="px-2 pt-2 text-center">
                <div className="truncate text-xs font-medium text-foreground">
                  {item.agent?.name ?? "未选择"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {status.label}
                </div>
              </div>
              <div
                className={[
                  "agent-workstation",
                  status.state === "working" ? "is-working" : "is-idle",
                ].join(" ")}
              >
                <div className="agent-desk">
                  <div className="agent-monitor">
                    {status.state === "working" && (
                      <>
                        <span />
                        <span />
                        <span />
                      </>
                    )}
                  </div>
                  <div className="agent-keyboard" />
                  <div className="agent-note" />
                </div>
                <div className="agent-chair" />
                <div className="agent-worker">
                  <div className="agent-worker-head">
                    <img src={avatar.src} alt="" />
                  </div>
                  <div className="agent-worker-body" />
                  {status.state === "working" ? (
                    <>
                      <span className="agent-arm left" />
                      <span className="agent-arm right" />
                    </>
                  ) : (
                    <span className="agent-idle-bubble" />
                  )}
                </div>
                <div className="agent-shadow" />
                <div className="agent-role-tag">
                  {item.title}
                  {status.state === "working" && (
                    <span className="agent-status-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
CollaborationStatusPanel.displayName = "CollaborationStatusPanel";
