// Adapted from AID Studio StudioStatusBadge.tsx (MIT); see THIRD_PARTY_NOTICES.md.
import type { StageStatus } from "../model";
const STATUS_LABEL: Record<StageStatus, string> = {
  empty: "待准备",
  draft: "待完善",
  ready: "已准备",
  blocked: "待接入",
};
export function StatusBadge({ status }: { status: StageStatus }) {
  return (
    <span className={`film-status film-status--${status}`}>
      <span className="film-status__dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
