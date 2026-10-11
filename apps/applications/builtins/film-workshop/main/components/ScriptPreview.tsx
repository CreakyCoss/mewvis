// Adapted from AID Studio StudioScriptNodePreview.tsx (MIT); see THIRD_PARTY_NOTICES.md.
export function ScriptPreview({
  content,
  badge,
  viewLabel = "编辑剧本 →",
  onView,
}: {
  content: string;
  badge?: string;
  viewLabel?: string;
  onView: () => void;
}) {
  return (
    <div className="film-script-preview">
      {badge ? (
        <span className="film-script-preview__badge">{badge}</span>
      ) : null}
      <p className="film-script-preview__body">{content}</p>
      <div className="film-script-preview__fade" aria-hidden />
      <button
        type="button"
        className="film-script-preview__view"
        onClick={(event) => {
          event.stopPropagation();
          onView();
        }}
      >
        {viewLabel}
      </button>
    </div>
  );
}
