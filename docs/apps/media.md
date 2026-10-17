# 宿主媒体处理

`@mewvis/app-sdk/media` 提供本地媒体信息读取与异步成片合成。应用宿主工具使用 `ctx.media`，应用页面使用 `getApplicationMediaClient()`。两端调用同一个 Server 服务，继承 `workspace-files` 权限和应用身份，不传 applicationId、workspaceId 或应用数据库标识。

## 调用

```ts
import { getApplicationMediaClient } from "@mewvis/app-sdk/media";

const media = getApplicationMediaClient();
const capability = await media.capabilities();
if (!capability.available) throw new Error(capability.reason);
const info = await media.probe("/projects/demo/voice.wav");
const job = await media.compose({
  requestId: crypto.randomUUID(),
  width: 1080,
  height: 1920,
  fps: 24,
  outputFilePath: "/projects/demo/exports/version-1.mp4",
  clips: [
    {
      visual: { kind: "image", filePath: "/projects/demo/frame.png" },
      duration: 4,
      audio: { filePath: "/projects/demo/voice.wav" },
    },
    {
      visual: { kind: "video", filePath: "/projects/demo/shot.mp4", start: 1 },
      duration: 5,
      sourceAudio: "keep",
      fit: "contain",
    },
  ],
});
const current = await media.get(job.id);
const history = await media.list({ limit: 20 });
// 用户点击取消：await media.cancel(job.id)
```

`compose` 返回任务，不等待编码完成。页面可每秒查询 `get`，显示 `phase`、0–1 的 `progress` 和最终状态；关闭页面不取消后台任务。同一应用可以在新连接中查询和取消自己的任务，其他应用无法访问。`requestId` 在应用内去重：相同参数返回原任务，改变参数会得到 `REQUEST_CONFLICT`，SDK 不自动重试。

成功结果 `job.output` 是可供现有文件预览 SDK 使用的普通 MP4 文件信息。应用自行决定素材归属、导出版本及项目记录；宿主不写应用项目 JSON。每次合成使用新输出路径，已存在的文件返回 `FILE_EXISTS`，不支持覆盖。取消在文件最终提交前有效；已经进入原子提交的任务返回实际完成状态。

## 时间轴规则

- 片段按 `clips` 顺序连接，`duration` 明确指定输出时长，`visual.start` / `audio.start` 指定输入截取起点。
- 图片在片段内持续显示。视频不足时长默认失败；调用者明确设置 `shortVideo: "freeze"` 才定格末帧补足。
- 单独音频超过片段时长默认失败，设置 `audio.trim: true` 才允许裁剪；较短音频以静音补足。
- `sourceAudio` 默认为 `mute`；`keep` 保留视频原声。提供独立音频时替代原声，避免重复配音。音量范围 0–4。
- `fit: "contain"` 等比缩放并留黑边，`cover` 等比裁切；输出固定为 MP4、H.264、AAC，统一像素比例、帧率及 48 kHz 双声道音频。
- 当前支持的输入扩展名由 `capabilities().inputs` 返回。首版最多 200 个片段、总时长 2 小时，单输入文件不超过 16 GiB，画面尺寸为偶数且不超过 4K 像素数，帧率 1–60。不提供字幕、转场或任意 FFmpeg 过滤器参数。

## 运行与权限

Server 使用本机 `ffmpeg`、`ffprobe`，FFmpeg 需提供 `libx264` 和 `aac` 编码器。可通过宿主环境变量 `MEWVIS_FFMPEG_PATH`、`MEWVIS_FFPROBE_PATH` 指定可信二进制路径，默认使用 Server 的 PATH。安装包目前不附带这两个二进制；缺少工具时 `capabilities` 明确返回不可用，合成任务返回 `CAPABILITY_UNAVAILABLE`。

所有输入和输出复用文件服务的同一个授权入口，限制在当前应用的数据目录或注册工作区，并遵守受保护文件、软链接和硬链接规则。输入经文件句柄检查后流式快照到宿主私有临时目录；FFmpeg 使用固定的本地格式及协议白名单，禁止模型传入命令、过滤器或网络 URL。成片校验后流式写入目标目录的临时文件，再原子提交；媒体字节不经过 JSON。

全局同时执行 2 个任务，队列最多 32 个，每个应用最多 4 个未结束任务。任务元数据保存于宿主数据目录的 `media/`，按应用身份隔离。编码、失败和取消均清理临时素材；停用应用会终止其任务。正常关闭或再次启动服务时，未完成任务标记为中断，不会自动恢复或重复编码。该能力独立于 Agent 和模型供应商。

实现位于 `apps/server/src/modules/media/`。SDK、原生工具和页面桥接共享同一任务服务。FFmpeg 行为参考其[过滤器文档](https://ffmpeg.org/ffmpeg-filters.html)、[协议白名单文档](https://ffmpeg.org/ffmpeg-protocols.html)和[容器读取选项](https://ffmpeg.org/ffmpeg-formats.html)。

## 验证

安装上述工具后运行 `pnpm --filter @mewvis/server test:media`，验证真实音画合成、时长策略、取消、跨应用隔离、文件保护、历史恢复和原生工具 RPC。`pnpm --filter @mewvis/app-sdk test` 验证 SDK 的错误、浏览器入口及传输行为。

页面端验证运行 `pnpm --filter client test:app-host:media:browser`，复用隔离的文件服务浏览器夹具，覆盖真实沙箱页面 → SDK → Server → FFmpeg → 文件预览；需要本机 Playwright。`MEWVIS_PLAYWRIGHT_MODULE` 可指定已安装的模块路径。测试不访问用户项目或模型供应商。
