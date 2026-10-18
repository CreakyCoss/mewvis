import { useState } from "react";
import { Image, RefreshCw, Video, Volume2 } from "lucide-react";
import type { ChatSnapshot } from "@mewvis/app-sdk/chat";
import {
  mediaExamples,
  mediaExampleUnavailableReason,
  mediaCode,
  type ChatPreset,
} from "../examples";
import { CodeExample, errorText } from "./Example";
import { ImageInputExamples } from "./ImageInputExamples";
import type { WorkspaceImage } from "../image-inputs";

const icons = {
  "image-generation": Image,
  "video-generation": Video,
  speech: Volume2,
};

export function MediaExamples({
  state,
  disabled,
  onApply,
  onRefresh,
  workspaceId,
  active,
}: {
  state: Readonly<ChatSnapshot>;
  disabled: boolean;
  onApply(example: ChatPreset, image?: WorkspaceImage): void;
  onRefresh(): Promise<void>;
  workspaceId: string;
  active: boolean;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const model = state.resources.models?.find(
    (model) => model.value === state.config.selectedModelId,
  );
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await onRefresh();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <section aria-label="多模态示例">
      <div className="lab-media-example-heading">
        <p className="lab-help">当前模型：{model?.label ?? "未选择"}</p>
        <button
          type="button"
          className="lab-button lab-quiet"
          disabled={disabled || refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw aria-hidden="true" />
          {refreshing ? "刷新中…" : "刷新模型与工具"}
        </button>
      </div>
      <p className="lab-help">
        选择示例填入草稿，可修改内容后发送。生成使用当前模型的用途配置，可能产生供应商费用。
      </p>
      <ImageInputExamples
        state={state}
        workspaceId={workspaceId}
        active={active}
        disabled={disabled || refreshing}
        onApply={onApply}
      />
      <h3>从文字生成媒体</h3>
      <div className="lab-media-example-list">
        {mediaExamples.map((example) => {
          const reason = mediaExampleUnavailableReason(state, example);
          const Icon = icons[example.mediaPurpose];
          return (
            <section
              className="lab-media-example"
              key={example.mediaPurpose}
              aria-label={`${example.label}示例`}
            >
              <div className="lab-section-heading">
                <h3>
                  <Icon aria-hidden="true" />
                  {example.label}
                </h3>
                <span
                  className={reason ? "lab-media-unavailable" : "lab-badge"}
                >
                  {reason ? "暂不可用" : "已配置"}
                </span>
              </div>
              <p>{example.description}</p>
              <blockquote>{example.request}</blockquote>
              {reason && <p className="lab-help">{reason}</p>}
              <button
                type="button"
                className="lab-button"
                disabled={disabled || refreshing || !!reason}
                onClick={() => onApply(example)}
              >
                填入{example.label}示例
              </button>
            </section>
          );
        })}
      </div>
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
      <CodeExample code={mediaCode} title="多模态生成接入代码" />
    </section>
  );
}
