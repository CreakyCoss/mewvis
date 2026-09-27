import { ListTree, Pencil } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import type { StoryDocument } from "@story/project/types";
import { isJsonObject, storyDocumentData } from "../../story-document";
import { chapterLabel, type Chapter } from "./model";

const Field = ({ label, value }: { label: string; value: unknown }) => (
  <section className="sw-note-field">
    <h3>{label}</h3>
    <p>
      {typeof value === "string" && value.trim() ? (
        value
      ) : (
        <span className="text-muted-foreground">尚未填写</span>
      )}
    </p>
  </section>
);
export function ChapterNotes({
  chapter,
  document,
  mode,
  onEdit,
}: {
  chapter: Chapter;
  document: StoryDocument;
  mode: "plan" | "record";
  onEdit: () => void;
}) {
  const data = storyDocumentData(document) ?? {};
  const ending = isJsonObject(data.ending) ? data.ending : {};
  const beats = Array.isArray(data.beats)
    ? data.beats.filter(isJsonObject)
    : [];
  const summary = isJsonObject(data.summary) ? data.summary : {};
  const status =
    {
      draft: "草稿",
      locked: "已锁定",
      ready: "可写作",
      written: "已成文",
      review: "审查中",
      accepted: "已接受",
      published: "已发布",
    }[String(data.status)] ?? "草稿";
  return (
    <div className="sw-editor-stage">
      <article className="sw-paper sw-notes">
        <div className="sw-notes-heading">
          <span>
            <ListTree className="size-4" />
            {mode === "plan" ? "本章细纲" : "章节记录"} · {status}
          </span>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" />
            {mode === "plan" ? "编辑细纲" : "编辑记录"}
          </Button>
        </div>
        <h1>{chapterLabel(chapter)}</h1>
        {mode === "plan" ? (
          <>
            <Field label="核心事件" value={data.coreEvent} />
            <Field label="目标情绪" value={data.targetEmotion} />
            <Field label="开篇钩子" value={data.openingHook} />
            <section className="sw-note-field">
              <h3>本章节拍</h3>
              {beats.length ? (
                beats.map((beat, index) => (
                  <div className="sw-note-beat" key={String(beat.id || index)}>
                    <span>{index + 1}</span>
                    <p>{String(beat.summary || "尚未填写")}</p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">尚未安排节拍</p>
              )}
            </section>
            {Object.values(summary).some(
              (v) => typeof v === "string" && v.trim(),
            ) && (
              <section className="sw-note-field">
                <h3>情节推进</h3>
                {[
                  ["cause", "起因"],
                  ["development", "发展"],
                  ["turn", "转折"],
                  ["climax", "高潮"],
                  ["ending", "结尾"],
                ].map(([key, label]) =>
                  summary[key] ? (
                    <p key={key}>
                      <strong>{label}：</strong>
                      {String(summary[key])}
                    </p>
                  ) : null,
                )}
              </section>
            )}
            <Field label="本章兑现" value={data.payoff} />
            <Field label="结尾钩子" value={ending.unresolvedQuestion} />
            <Field label="下一章驱动力" value={ending.nextDrive} />
          </>
        ) : (
          <>
            <Field label="章节摘要" value={data.summary} />
            <section className="sw-note-field">
              <h3>正文记录</h3>
              <p>已写 {Number(data.wordCount || 0).toLocaleString()} 字</p>
              <p className="text-muted-foreground">
                正文编辑会自动更新字数。情节摘要、出场角色和状态变化可通过编辑记录维护。
              </p>
            </section>
          </>
        )}
      </article>
    </div>
  );
}
