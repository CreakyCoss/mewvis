export type StoryManuscriptSource =
  | "tavern"
  | "chat"
  | "manual"
  | "aiPolish"
  | "import";

export type StoryManuscriptDraftStatus = "pending" | "accepted" | "rejected";

export type StoryManuscriptSubmissionInput = {
  storyId: string;
  nodeId: string;
  branchId?: string;
  source: StoryManuscriptSource;
  sourceRunId?: string;
  sourceMessageIds?: string[];
  title?: string;
  content: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt?: number;
};

export type StoryManuscriptDraftUpdateInput = {
  title?: string;
  content?: string;
  summary?: string;
  branchId?: string | null;
  metadata?: Record<string, unknown>;
  updatedAt?: number;
};

export type StoryManuscriptDraft = {
  id: string;
  storyId: string;
  nodeId: string;
  branchId?: string;
  source: StoryManuscriptSource;
  sourceRunId?: string;
  sourceMessageIds: string[];
  title: string;
  content: string;
  summary: string;
  metadata: Record<string, unknown>;
  status: StoryManuscriptDraftStatus;
  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
  rejectedAt?: number;
};

export type StoryAcceptedManuscript = {
  id: string;
  draftId: string;
  storyId: string;
  nodeId: string;
  branchId?: string;
  title: string;
  content: string;
  summary: string;
  source: StoryManuscriptSource;
  sourceRunId?: string;
  sourceMessageIds: string[];
  acceptedAt: number;
};

export type StoryManuscriptInbox = {
  version: 1;
  drafts: StoryManuscriptDraft[];
  accepted: StoryAcceptedManuscript[];
};

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const trimText = (value: string | undefined) => value?.trim() ?? "";

export const createEmptyStoryManuscriptInbox = (): StoryManuscriptInbox => ({
  version: 1,
  drafts: [],
  accepted: [],
});

export const submitStoryManuscriptDraft = (
  inbox: StoryManuscriptInbox,
  input: StoryManuscriptSubmissionInput,
): {
  draft: StoryManuscriptDraft;
  inbox: StoryManuscriptInbox;
} => {
  const content = trimText(input.content);
  if (!content) {
    throw new Error("稿件内容不能为空。");
  }
  if (!trimText(input.storyId) || !trimText(input.nodeId)) {
    throw new Error("稿件必须绑定 storyId 和 nodeId。");
  }

  const createdAt = input.createdAt ?? Date.now();
  const draft: StoryManuscriptDraft = {
    id: createId("story-manuscript-draft"),
    storyId: input.storyId,
    nodeId: input.nodeId,
    branchId: trimText(input.branchId) || undefined,
    source: input.source,
    sourceRunId: trimText(input.sourceRunId) || undefined,
    sourceMessageIds: input.sourceMessageIds ?? [],
    title: trimText(input.title) || "未命名稿件",
    content,
    summary: trimText(input.summary),
    metadata: input.metadata ?? {},
    status: "pending",
    createdAt,
    updatedAt: createdAt,
  };

  return {
    draft,
    inbox: {
      ...inbox,
      drafts: [...inbox.drafts, draft],
    },
  };
};

export const updateStoryManuscriptDraft = (
  inbox: StoryManuscriptInbox,
  draftId: string,
  input: StoryManuscriptDraftUpdateInput,
): StoryManuscriptInbox => {
  const draft = inbox.drafts.find((item) => item.id === draftId);
  if (!draft) {
    throw new Error("找不到要更新的稿件。");
  }
  if (draft.status !== "pending") {
    throw new Error("只能编辑待确认稿件。");
  }

  const nextContent = input.content === undefined
    ? draft.content
    : trimText(input.content);
  if (!nextContent) {
    throw new Error("稿件内容不能为空。");
  }

  const updatedAt = input.updatedAt ?? Date.now();
  return {
    ...inbox,
    drafts: inbox.drafts.map((item) =>
      item.id === draftId
        ? {
            ...item,
            title: input.title === undefined
              ? item.title
              : trimText(input.title) || "未命名稿件",
            content: nextContent,
            summary: input.summary === undefined ? item.summary : trimText(input.summary),
            branchId: input.branchId === undefined
              ? item.branchId
              : trimText(input.branchId ?? "") || undefined,
            metadata: input.metadata ?? item.metadata,
            updatedAt,
          }
        : item
    ),
  };
};

export const acceptStoryManuscriptDraft = (
  inbox: StoryManuscriptInbox,
  draftId: string,
  {
    acceptedAt = Date.now(),
  }: {
    acceptedAt?: number;
  } = {},
): {
  accepted: StoryAcceptedManuscript;
  inbox: StoryManuscriptInbox;
} => {
  const draft = inbox.drafts.find((item) => item.id === draftId);
  if (!draft) {
    throw new Error("找不到要收稿的稿件。");
  }
  if (draft.status !== "pending") {
    throw new Error("只能收取待确认稿件。");
  }

  const accepted: StoryAcceptedManuscript = {
    id: createId("story-manuscript"),
    draftId: draft.id,
    storyId: draft.storyId,
    nodeId: draft.nodeId,
    branchId: draft.branchId,
    title: draft.title,
    content: draft.content,
    summary: draft.summary,
    source: draft.source,
    sourceRunId: draft.sourceRunId,
    sourceMessageIds: draft.sourceMessageIds,
    acceptedAt,
  };

  return {
    accepted,
    inbox: {
      ...inbox,
      drafts: inbox.drafts.map((item) =>
        item.id === draftId
          ? {
              ...item,
              status: "accepted" as const,
              acceptedAt,
              updatedAt: acceptedAt,
            }
          : item
      ),
      accepted: [...inbox.accepted, accepted],
    },
  };
};

export const rejectStoryManuscriptDraft = (
  inbox: StoryManuscriptInbox,
  draftId: string,
  {
    rejectedAt = Date.now(),
  }: {
    rejectedAt?: number;
  } = {},
): StoryManuscriptInbox => {
  const draft = inbox.drafts.find((item) => item.id === draftId);
  if (!draft) {
    throw new Error("找不到要退回的稿件。");
  }
  if (draft.status !== "pending") {
    throw new Error("只能退回待确认稿件。");
  }

  return {
    ...inbox,
    drafts: inbox.drafts.map((item) =>
      item.id === draftId
        ? {
            ...item,
            status: "rejected" as const,
            rejectedAt,
            updatedAt: rejectedAt,
          }
        : item
    ),
  };
};

export const listStoryManuscriptDrafts = (
  inbox: StoryManuscriptInbox,
  {
    storyId,
    nodeId,
    status,
  }: {
    storyId?: string;
    nodeId?: string;
    status?: StoryManuscriptDraftStatus;
  } = {},
) => inbox.drafts.filter((draft) =>
  (!storyId || draft.storyId === storyId) &&
  (!nodeId || draft.nodeId === nodeId) &&
  (!status || draft.status === status)
);
