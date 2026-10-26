import type {
  KnowledgeInput,
  KnowledgeMethod,
  KnowledgeMethodMap,
  KnowledgeOutput,
} from "./contracts.js";
import * as s from "./validation.js";

const opt = s.optional;
const baseId = { knowledgeBaseId: s.text };
const reference = { ...baseId, attachmentId: s.text };
const fileName = s.refine(
  s.text,
  (v) =>
    Array.from(v).length <= 255 &&
    !/[\\/\u0000-\u001f\u007f]/.test(v) &&
    ![".", ".."].includes(v),
);
const mediaType = s.refine(s.text, (v) =>
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(v),
);
const sha256 = s.refine(s.text, (v) => /^[a-f0-9]{64}$/.test(v));
const fields = { fileName, mediaType, sizeBytes: s.natural, sha256 };
const attachment = s.object(
  {
    id: s.text,
    ...baseId,
    ...fields,
    state: s.enumeration(["pending", "ready"]),
    createdAt: s.timestamp,
    updatedAt: s.timestamp,
  },
  true,
);
const url = s.refine(s.text, (v) => {
  if (v.length > 8192 || /[\u0000-\u0020\u007f]/.test(v)) return false;
  try {
    const parsed = new URL(v);
    return (
      ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash
    );
  } catch {
    return false;
  }
});
const headers = s.refine(
  s.metadata,
  (v) =>
    Object.keys(v).length <= 64 &&
    Object.entries(v).every(
      ([name, value]) =>
        /^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) &&
        ![
          "cookie",
          "set-cookie",
          "host",
          "connection",
          "proxy-authorization",
        ].includes(name.toLowerCase()) &&
        typeof value === "string" &&
        value.length <= 8192 &&
        !/[\u0000-\u001f\u007f]/.test(value),
    ),
);
const transfer = (method: "GET" | "PUT") =>
  s.union(
    s.object(
      {
        kind: s.literal("http"),
        url,
        method: s.literal(method),
        headers: opt(headers),
        expiresAt: s.timestamp,
      },
      true,
    ),
    s.object(
      {
        kind: s.literal("host"),
        token: s.refine(
          s.text,
          (v) => v.length <= 8192 && !/[\u0000-\u001f\u007f]/.test(v),
        ),
        expiresAt: s.timestamp,
      },
      true,
    ),
  );

export const attachmentDefinitions = {
  "attachments.list": {
    input: s.object({ ...baseId, cursor: opt(s.text), limit: opt(s.positive) }),
    output: s.object(
      { items: s.array(attachment), nextCursor: s.nullable(s.text) },
      true,
    ),
  },
  "attachments.get": { input: s.object(reference), output: attachment },
  "attachments.createUpload": {
    input: s.object({ ...baseId, ...fields }),
    output: s.object(
      {
        attachment: s.refine(attachment, (v) => v.state === "pending"),
        transfer: transfer("PUT"),
      },
      true,
    ),
    mutation: true,
  },
  "attachments.completeUpload": {
    input: s.object(reference),
    output: s.refine(attachment, (v) => v.state === "ready"),
    mutation: true,
  },
  "attachments.abortUpload": {
    input: s.object(reference),
    output: s.object({ ...reference, aborted: s.literal(true) }, true),
    mutation: true,
  },
  "attachments.createDownload": {
    input: s.object(reference),
    output: s.object({ ...reference, transfer: transfer("GET") }, true),
  },
  "attachments.delete": {
    input: s.object(reference),
    output: s.object({ ...reference, deleted: s.literal(true) }, true),
    mutation: true,
  },
} satisfies Record<
  Extract<keyof KnowledgeMethodMap, `attachments.${string}`>,
  {
    input: s.Rule;
    output: s.Rule;
    mutation?: boolean;
  }
>;

export function validateAttachmentResult<M extends KnowledgeMethod>(
  method: M,
  input: KnowledgeInput<M>,
  output: KnowledgeOutput<M>,
): void {
  const params = input as any;
  const result = output as any;
  const records =
    method === "attachments.list"
      ? result.items
      : [method === "attachments.createUpload" ? result.attachment : result];
  const fail = () => s.invalid("INVALID_RESPONSE", "response.attachmentScope");
  if (
    records.some(
      (record: any) => record.knowledgeBaseId !== params.knowledgeBaseId,
    )
  )
    fail();
  if (
    params.attachmentId !== undefined &&
    records.some(
      (record: any) =>
        (method === "attachments.get" || method === "attachments.completeUpload"
          ? record.id
          : record.attachmentId) !== params.attachmentId,
    )
  )
    fail();
  if (
    method === "attachments.createUpload" &&
    ["fileName", "mediaType", "sizeBytes", "sha256"].some(
      (key) => result.attachment[key] !== params[key],
    )
  )
    fail();
  if (
    method === "attachments.list" &&
    ((params.limit !== undefined && records.length > params.limit) ||
      new Set(records.map((record: any) => record.id)).size !== records.length)
  )
    fail();
}
