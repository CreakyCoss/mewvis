import type {
  ApplicationModelOption,
  ModelMediaPurpose,
  RuntimeModelModality,
} from "@mewvis/app-sdk/chat";

const purposeLabels: Record<ModelMediaPurpose["type"], string> = {
  "image-generation": "图片生成",
  "image-editing": "图片编辑",
  "video-generation": "视频生成",
  speech: "语音合成",
};
const modalityLabels: Record<RuntimeModelModality, string> = {
  text: "文字",
  image: "图片",
  video: "视频",
  audio: "音频",
};
const modalities = (values: RuntimeModelModality[]) =>
  values.map((value) => modalityLabels[value]).join("、");

export function ModelCapabilities({
  model,
  error,
}: {
  model?: Pick<ApplicationModelOption, "capabilities" | "mediaPurposes">;
  error?: string;
}) {
  const capabilities = model?.capabilities;
  const purposes = model?.mediaPurposes;
  const labels = [
    ...(capabilities?.input.includes("image") ? ["图片理解"] : []),
    ...(purposes?.map((purpose) => purposeLabels[purpose.type]) ?? []),
  ];
  return (
    <details className="lab-model-capabilities">
      <summary>
        <span>当前模型能力</span>
        <span className="lab-model-capability-summary">
          {error
            ? "模型信息加载失败"
            : !model
              ? "未选择模型"
              : purposes === undefined
                ? "宿主未提供媒体能力信息"
                : labels.join(" · ") || "文字对话"}
        </span>
      </summary>
      <div className="lab-model-capability-details">
        {error ? <p role="alert">{error}</p> : null}
        {capabilities && (
          <dl className="lab-facts">
            <dt>对话输入</dt>
            <dd>{modalities(capabilities.input)}</dd>
            <dt>对话输出</dt>
            <dd>{modalities(capabilities.output)}</dd>
            <dt>工具调用</dt>
            <dd>{capabilities.toolCalling ? "已启用" : "未启用"}</dd>
          </dl>
        )}
        {purposes?.length ? (
          <ul aria-label="已配置媒体用途">
            {purposes.map((purpose) => (
              <li key={purpose.type}>
                <strong>{purposeLabels[purpose.type]}</strong>
                <span>
                  {modalities(purpose.input)} → {modalities(purpose.output)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {purposes === undefined
              ? "媒体能力信息暂不可用。"
              : capabilities?.toolCalling === false
                ? "当前模型未启用工具调用，媒体生成不可用。"
                : "当前模型未配置可用的媒体生成用途。"}
          </p>
        )}
        {!!purposes?.length && (
          <p>根据当前模型配置展示；实际调用还需对应的工具授权。</p>
        )}
      </div>
    </details>
  );
}
