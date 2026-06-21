import {
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  assignTavernRoleFacts,
  filterTavernFactEventsForAudience,
  isGeneratedTavernRoleAssignmentFactEvent,
  resolveTavernInformationView,
  type TavernInformationView,
} from "../../../../../core";
import { useTavernPageContext } from "../../../../context";
import {
  formatFactAudience,
  formatFactType,
  informationViewDescriptions,
  informationViewLabels,
  isHiddenFactEvent,
  isIdentityFactEvent,
} from "../helpers";
import {
  EmptyDetailState,
  PlotDataSheet,
  type PlotDataDialogProps,
} from "./shared";

export const ScriptReviewDialog = ({ bind, isBusy }: PlotDataDialogProps) => {
  const { activeRoom, roomCharacters, patchRoom } = useTavernPageContext();
  const characterNameById = new Map(roomCharacters.map((character) => [character.id, character.name]));
  const currentInformationView = activeRoom ? resolveTavernInformationView({
    policy: activeRoom.settings.informationPolicy,
    outcomeEvents: activeRoom.outcomeEvents,
  }) : "public";
  const reviewFactEvents = activeRoom ? filterTavernFactEventsForAudience({
    factEvents: activeRoom.factEvents,
    room: activeRoom,
    audience: currentInformationView === "director" ? { type: "director" } : { type: "user" },
  }) : [];
  const privateIntelEvents = activeRoom ? filterTavernFactEventsForAudience({
    factEvents: activeRoom.factEvents,
    room: activeRoom,
    audience: { type: "user" },
  }).filter((event) => event.visibleToUser || event.visibility !== "public") : [];
  const identityFactEvents = privateIntelEvents.filter(isIdentityFactEvent);
  const roleAssignment = activeRoom?.settings.informationPolicy.roleAssignment;
  const generatedRoleAssignmentCount = activeRoom?.factEvents.filter(isGeneratedTavernRoleAssignmentFactEvent).length ?? 0;

  const patchInformationView = (view: TavernInformationView) => {
    if (!activeRoom) {
      return;
    }
    patchRoom(activeRoom.id, {
      settings: {
        ...activeRoom.settings,
        informationPolicy: {
          ...activeRoom.settings.informationPolicy,
          uiDefaultView: view,
        },
      },
    });
  };
  const patchFactVisibleToUser = (factEventId: string, visibleToUser: boolean) => {
    if (!activeRoom) {
      return;
    }
    patchRoom(activeRoom.id, {
      factEvents: activeRoom.factEvents.map((event) => {
        if (event.id !== factEventId) {
          return event;
        }

        const nextEvent = { ...event };
        if (visibleToUser) {
          nextEvent.visibleToUser = true;
          nextEvent.revealWhen = nextEvent.revealWhen ?? "manual";
        } else {
          delete nextEvent.visibleToUser;
        }
        return nextEvent;
      }),
    });
  };
  const assignRoles = () => {
    if (!activeRoom) {
      return;
    }
    const roleFacts = assignTavernRoleFacts({
      room: activeRoom,
      characters: roomCharacters,
    });
    if (roleFacts.length === 0) {
      return;
    }

    patchRoom(activeRoom.id, {
      factEvents: [
        ...activeRoom.factEvents.filter((event) => !isGeneratedTavernRoleAssignmentFactEvent(event)),
        ...roleFacts,
      ],
      updatedAt: Date.now(),
    });
  };

  return (
    <PlotDataSheet
      bind={bind}
      title="剧本视角"
      description="切换公开、复盘和导演视角，管理可揭示事实。"
    >
      <div className="space-y-4">
        <div className="rounded-md border bg-background/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{informationViewLabels[currentInformationView]}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {informationViewDescriptions[currentInformationView]}
              </div>
            </div>
            {activeRoom?.outcomeEvents.some((event) => event.status === "applied") && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                已结局
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["public", "reveal", "director"] as const).map((view) => (
              <Button
                key={view}
                type="button"
                size="xs"
                variant={currentInformationView === view ? "default" : "outline"}
                disabled={isBusy}
                onClick={() => patchInformationView(view)}
              >
                {view === "public" && <EyeOff className="size-3.5" />}
                {view === "reveal" && <Eye className="size-3.5" />}
                {view === "director" && <ShieldCheck className="size-3.5" />}
                {informationViewLabels[view]}
              </Button>
            ))}
          </div>
        </div>

        {roleAssignment?.enabled && (
          <div className="rounded-md border bg-background/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">身份分配</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {roleAssignment.rolePool.length} 种身份，已生成 {generatedRoleAssignmentCount} 条身份事实
                </div>
              </div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={isBusy || roleAssignment.rolePool.length === 0}
                onClick={assignRoles}
              >
                <ShieldCheck className="size-3.5" />
                随机分配
              </Button>
            </div>
            {roleAssignment.rolePool.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {roleAssignment.rolePool.map((role) => (
                  <span
                    key={role.id}
                    className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    {role.label} x{role.count}
                    {role.factionId ? ` / ${role.factionLabel || role.factionId}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {identityFactEvents.length > 0 && (
          <div className="space-y-2 rounded-md border bg-background/60 p-3">
            <div className="text-sm font-medium">身份牌</div>
            {identityFactEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-md bg-muted/60 px-3 py-2 text-sm leading-6 text-muted-foreground"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-background px-1.5 py-0.5 text-[11px]">
                    {formatFactType(event.type)}
                  </span>
                  <span className="rounded-md bg-background px-1.5 py-0.5 text-[11px]">
                    仅你可见
                  </span>
                </div>
                <div className="whitespace-pre-wrap">{event.evidence}</div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              当前可见事实
            </div>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {reviewFactEvents.length} 条
            </span>
          </div>
          {reviewFactEvents.length > 0 ? (
            reviewFactEvents.slice().reverse().map((event) => {
              const hidden = isHiddenFactEvent(event);
              return (
                <div key={event.id} className="space-y-2 rounded-md border bg-background/60 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {formatFactType(event.type)}
                    </span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {event.visibility ?? "public"}
                    </span>
                    {event.visibleToUser && (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                        我的情报
                      </span>
                    )}
                    {event.revealWhen && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {event.revealWhen}
                      </span>
                    )}
                    {hidden && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {formatFactAudience(event, characterNameById)}
                      </span>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {event.evidence}
                  </div>
                  {hidden && currentInformationView === "director" && (
                    <Button
                      type="button"
                      size="xs"
                      variant={event.visibleToUser ? "ghost" : "outline"}
                      disabled={isBusy}
                      onClick={() => patchFactVisibleToUser(event.id, !event.visibleToUser)}
                    >
                      {event.visibleToUser ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                      {event.visibleToUser ? "移出我的情报" : "加入我的情报"}
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <EmptyDetailState>当前视角暂无可见事实。</EmptyDetailState>
          )}
        </div>
      </div>
    </PlotDataSheet>
  );
};
