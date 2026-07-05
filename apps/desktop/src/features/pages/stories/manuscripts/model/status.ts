export const storyManuscriptStatusOptions = [
  {
    status: "pending",
    label: "未收稿",
    shortLabel: "未",
    emptyText: "暂无未收稿件",
    manifestIdsKey: "pendingIds",
    badgeVariant: "default",
  },
  {
    status: "accepted",
    label: "已收稿",
    shortLabel: "收",
    emptyText: "暂无已收稿件",
    manifestIdsKey: "acceptedIds",
    badgeVariant: "outline",
  },
  {
    status: "rejected",
    label: "已退回",
    shortLabel: "退",
    emptyText: "暂无已退回件",
    manifestIdsKey: "rejectedIds",
    badgeVariant: "outline",
  },
] as const;

export type StoryManuscriptStatusOption = (typeof storyManuscriptStatusOptions)[number];
export type StoryManuscriptStatus = StoryManuscriptStatusOption["status"];
export type StoryManuscriptManifestIdsKey = StoryManuscriptStatusOption["manifestIdsKey"];

export const storyManuscriptStatuses = storyManuscriptStatusOptions.map(
  ({ status }) => status,
) as StoryManuscriptStatus[];

export const storyManuscriptStatusLabels = Object.fromEntries(
  storyManuscriptStatusOptions.map(({ status, label }) => [status, label]),
) as Record<StoryManuscriptStatus, string>;

export const storyManuscriptStatusOptionsByStatus = Object.fromEntries(
  storyManuscriptStatusOptions.map((option) => [option.status, option]),
) as Record<StoryManuscriptStatus, StoryManuscriptStatusOption>;
