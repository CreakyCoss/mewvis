# 模型配置与编辑器预设

模型设置保留模型 ID 和显示名称。模型通过「获取模型」或手动输入添加，不会自动往 Provider 写入预设型号名单，也没有模型同步脚本。各用途的「请求配置」集中展示地址、Key、协议和请求模型 ID，由一个「继承 Provider」勾选控制：勾选时清空所有覆盖值并禁用整个区域，取消后才允许编辑。跨供应商模板使用独立连接，编辑器禁用继承开关并要求填写对应供应商的 Key。`purpose.connection` 只保存覆盖字段，普通用途的地址、Key 和协议留空时分别沿用所属 Provider；请求模型 ID 留空时沿用顶部模型 ID，不存在模型级公共连接。

## 获取模型时的能力信息

`discover_provider_models` 返回统一的 `DiscoveredProviderModel`：模型 ID、名称，以及可选的 `limits`、部分 `capabilities` 和思考等级值 `thinking.levels`。服务端的 `model-metadata.ts` 负责把不同协议的响应映射到这个结构；未返回的字段保持缺省，明确返回的 `false`、空列表与缺省分开处理。

| 接口                                                                                                            | 可读取的信息                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [OpenAI 标准模型列表](https://developers.openai.com/api/reference/resources/models/methods/list)                | 标准返回只有模型标识等基本信息；兼容服务明确提供扩展元数据时可额外读取                                  |
| [Anthropic 模型列表](https://platform.claude.com/docs/en/api/models/list)                                       | 输入和输出 token 限制、图片输入、思考支持、各 effort 等级的支持情况                                     |
| [Gemini 模型列表](https://ai.google.dev/api/models)                                                             | 输入和输出 token 限制、思考支持、生成方法；生成方法不用于猜测思考等级或具体输入输出模态                 |
| [OpenRouter 模型列表](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) | 上下文、输出限制、输入输出模态、思考与工具参数的支持情况；仅支持 reasoning 参数不代表返回了具体等级列表 |
| [MiniMax 模型列表](https://platform.minimax.io/docs/api-reference/models/anthropic/list-models)                 | 标准返回为 ID、名称等基础信息，不包含上下文等能力元数据                                                 |

获取弹窗只展示接口返回的信息。添加新模型时，统一预设入口按字段使用「接口返回 → 对应供应商的型号预设 → 通用默认值」的优先级补齐基础信息。型号预设只匹配明确维护的单个模型 ID，不通过前缀猜测未知型号的能力。命中预设时，新增模型会带入该型号全部用途的默认模板；同一用途有多个模板时使用标记 `isDefault` 的一项，未标记时使用列表中的第一项。媒体模板保留自己的输入输出及 Schema，不按模型的全局模态列表裁剪。手动新增时，在完成型号输入后填入预设，避免输入过程中的型号前缀误触发。未命中的手动新增型号默认只有对话用途。思考等级名称由通用定义补全，默认不选中等级；明确不支持思考时清除等级建议。同 ID 的已有模型不更新，保留用户的名称、参数和用途配置；已有模型可在「可调参数」中使用「恢复基础限制」应用当前型号预设。

MiniMax 型号预设参考[官方 Anthropic SDK 文档](https://platform.minimax.cn/docs/api-reference/text-anthropic-api)和 [Chat Completions 参数文档](https://platform.minimax.cn/docs/api-reference/text-chat-openai)：M3 和 M3.1-Flash-Preview 上下文为 1,000,000 tokens、最大输出为 524,288 tokens，并支持文字、图片和视频输入。M3.1-Flash-Preview 另提供五档思考深度建议。最大输出采用接口文档的上限，区别于文档推荐的请求输出预算 131,072；思考内容也计入输出预算，用户可按需下调。M2 系列已从新建预设中移除。

只返回部分 token 限制时，基础默认值会调整到有效范围。例如接口返回上下文 4096、未返回最大输出，基础最大输出会降到 4096。无效数字或相互矛盾的输出上限会忽略。输出模态可映射到对应生成用途；合同暂不支持的模态不伪装成文字对话。

## 用途与请求配置

一个模型可以配置多个用途，每个用途独立声明输入、输出、参数及格式约束。原生对话用途使用现有运行时适配器；HTTP / JSON 用途可以编辑输入 JSON Schema、请求方法、路径、请求头和请求体，以及直接返回或异步任务的结果解析规则。

每个用途的 `modelId` 可独立指定上游请求模型；未设置时使用顶部模型 ID。对话可继承 DeepSeek Provider，再通过「添加用途 → 图像生成 → 基础模板」选择 MiniMax 的 `image-01`。编辑器自动填入该用途的 MiniMax 地址、请求模型 ID 和模板，Key 由用户填写，不沿用 DeepSeek Key。跨供应商模板要求独立填写地址、Key 和请求模型 ID，清空字段会阻止提交，避免意外继承当前 Provider。`{{model.id}}`、`{{auth.apiKey}}` 始终对应当前用途。继承 Provider 的连接并不继承它的对话请求格式，HTTP / JSON 用途继续使用自己的模板。

切换到另一个型号模板时填入其请求模型 ID；供应商相同时保留已编辑的连接，切换到其他供应商时重新填入官方地址并清空用途 Key；切回当前 Provider 的模板则恢复连接继承。切换原生对话型号模板也会填入目标型号的限制与思考等级。恢复当前模板或切换为自定义 HTTP / JSON 时保留连接和请求模型 ID。已有配置重新打开时读取保存的副本，不会补回已删除的用途或覆盖用户参数。

删除模型、用途、参数、输出规则或思考等级均需要二次确认。删除 Provider 沿用原有确认流程。

参数支持默认值、调用时覆盖开关和 JSON Schema 约束。请求模板通过 `model`、`input`、`params`、`auth` 变量组合内容；整值变量保留原始 JSON 类型。返回配置通过 JSON Pointer 提取文本、JSON、URL 或 Base64 结果，也可声明业务成功条件、错误字段和任务查询规则。

通用合同、参数校验、请求组合、返回解析和本地预览位于 `@mewvis/chat-contracts/model-configuration`，不依赖供应商预设。本地预览隐藏凭据，不发送请求。已配置的 HTTP / JSON 图片生成、图片编辑、视频生成和语音合成用途可由内置 `generate_media` 工具执行；原生用途继续使用各自的协议适配器。语音合成提供 MiniMax `speech-2.8-hd`、`speech-2.8-turbo` 模板，使用[非流式 HTTP 接口](https://platform.minimax.io/docs/api-reference/speech-t2a-http)返回音频 URL，保存后可在聊天中播放。

完整配置随 `runtimeModel.configuration` 传入。提交时为每个用途固定已解析的连接和请求模型 ID，使媒体用途继承原 Provider，而不会误用已独立配置的对话连接。媒体工具只使用当前选中模型的用途；没有可执行媒体用途或禁用工具调用时，不注册媒体工具，也不自动调用其他模型。

调用方式、文件保存和执行边界见[媒体生成工具](media-generation.md)。

## 编辑器预设的维护

预设由设置页面自行维护，目录为 `apps/client/src/workbench/pages/settings/llm/edit/presets/`：

- `common.ts` 集中定义默认供应商、通用协议、用途、输入输出类型、思考等级名称、基础能力与限制，以及通用对话模板。
- `providers/` 每个供应商一个文件。`ProviderPreset.models` 是单型号列表，每项 `ModelPreset` 包含一个 `modelId`、显示名称、官方文档 `sourceUrls`、限制、按协议维护的思考等级值，以及属于该型号的 `templates`。不再维护供应商级模板或型号分组。
- `PurposePreset` 包含稳定的模板 ID、版本、名称、接口文档、样例输入、可选的默认标记及完整 `purpose` 配置；类型直接由 `purpose.type` 声明。型号能力从各用途的默认模板汇总，不重复维护一份型号级能力配置。
- `types.ts` 定义原始预设类型，`resolve.ts` 的 `createEditorPresets` 统一处理通用定义和供应商定义，补全等级名称、合并协议选项、校验重复型号和模板、确定每种用途的默认项，并为编辑器生成带供应商和型号归属的模板列表。
- 根 `index.ts` 注册各供应商，通过统一处理方法生成 `editorPresets`。编辑页面只使用这个入口获取连接建议、创建基础模型配置和应用用途模板。

数据流为「通用定义 + 各供应商定义 → `createEditorPresets` → `editorPresets` → 编辑页面」。供应商文件不引用处理模块或页面。添加模型时，处理后的基础能力、限制和思考等级建议会写入提交的数据，之后由用户自行修改。

新增供应商时，在 `providers/` 添加一个预设文件并在根 `index.ts` 注册。新增或删除型号只需增删其 `models` 列表项；新增用途模板编辑该型号的 `templates`。界面按 `purpose.type` 筛选，显示「供应商 · 型号 · 模板名称」，允许给当前模型添加其他供应商的用途。没有匹配模板时，用户仍可从自定义 HTTP / JSON 配置开始。

当前媒体预设按官方 API 文档维护：

| 供应商  | 型号                                            | 模板                                                                                                                                                                                                                                      |
| ------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI  | `gpt-image-2.5-sunburst`、`gpt-image-2.5-flare` | [文生图](https://developers.openai.com/api/reference/resources/images/methods/generate)、[JSON 图片编辑](https://developers.openai.com/api/reference/resources/images/methods/edit)                                                       |
| MiniMax | `image-01`                                      | [文生图](https://platform.minimax.io/docs/api-reference/image-generation-t2i)、[人物参考图生成](https://platform.minimax.io/docs/api-reference/image-generation-i2i)                                                                      |
| MiniMax | `MiniMax-H3`、`MiniMax-H3-Max`                  | [文生视频、图生视频、首尾帧生视频](https://platform.minimax.io/docs/api-reference/video-generation-v2-create)，[任务轮询](https://platform.minimax.io/docs/api-reference/video-generation-v2-query)；两个型号分别声明分辨率及持续时间范围 |
| 智谱    | `glm-image`                                     | [文生图](https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image)                                                                                                                                                             |
| 智谱    | `cogvideox-3`                                   | [文生视频、图生视频、首尾帧生视频](https://docs.bigmodel.cn/cn/guide/models/video-generation/cogvideox-3)，[任务轮询](https://docs.bigmodel.cn/api-reference/模型-api/查询异步结果)                                                       |

多模态对话预设还包括 DeepSeek Flash、MiniMax M3 系列、Kimi K3/K2.6、MiMo V2.5 和 GLM 5.3 Flash/FlashX。官方声明的音频、视频输入可保留在用途能力中，当前聊天桥接仍只放行文字和图片。预设不会自行赋予型号文档没有声明的生成能力；语音合成通过媒体工具执行，语音转写、实时通信和上传接口尚未接入。

### 型号维护与清理

核对日期：2026-10-16。预设面向新建配置，优先保留官方当前推荐的型号；官方列为历史型号、已宣布退役或已被新建指南的推荐型号替代时，移除对应列表项。不仅凭版本号大小或发布时间判断型号是否过时。

| 供应商   | 本次核对与处理                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MiniMax  | [官方模型概览](https://platform.minimax.cn/docs/guides/models-intro)将 M2/M2.1 列为历史型号，M2.5/M2.7 系列于 2026-10-19 停止向新用户开放、2026-11-18 正式下线；移除全部 M2 系列及 highspeed 变体。保留 M3、M3.1-Flash-Preview、image-01、H3/H3-Max；M3.1-Flash-Preview 当前仅通过 M Plan 和 MiniMax Code 提供。                                                                           |
| OpenAI   | [弃用公告](https://developers.openai.com/api/docs/deprecations)明确 GPT Image 1.5 将于 2026-12-01 下线，移除其预设；GPT Image 2 仍可调用，但[当前图片指南](https://developers.openai.com/api/docs/guides/image-generation)主推 2.5 Sunburst/Flare，因此新建图片预设仅保留这两个型号。GPT-5.5 仍在[官方型号页](https://developers.openai.com/api/docs/models/gpt-5.5)提供，保留其对话预设。 |
| DeepSeek | [官方模型列表](https://api-docs.deepseek.com/quick_start/pricing/)当前使用 deepseek-flash 和 deepseek-v4-pro，均保留。                                                                                                                                                                                                                                                                     |
| Kimi     | [官方快速开始](https://platform.kimi.com/docs/get-api-key)优先推荐 K3，同时仍明确提供 K2.6 作为通用场景选项，均保留。                                                                                                                                                                                                                                                                      |
| MiMo     | [MiMo V2.5 官方型号页](https://mimo.mi.com/models/zh-CN/mimo-v2.5)仍将其作为原生全模态感知型号提供，保留。                                                                                                                                                                                                                                                                                 |
| 智谱     | [官方推荐列表](https://docs.bigmodel.cn/cn/guide/start/model-overview)仍包含 GLM 5.3 Flash/FlashX、GLM-Image、CogVideoX-3，均保留。                                                                                                                                                                                                                                                        |

清理只移除编辑器候选项，不重命名、替换或迁移用户已保存的模型及用途快照。旧型号仍可手动输入；接口提供的能力元数据仍按原有规则使用，运行时继续执行已保存的配置。

预设只用于初始填充、恢复和样例预览。应用模板会复制完整的 `ModelPurpose` 到模型配置中，`preset.id` 和 `preset.version` 仅记录来源。后续编辑、保存和读取使用这份副本，不依赖模板是否仍存在，也不会自动套用模板更新。用户配置保存在 SQLite 模型记录的 `configuration_json` 中，不加入预设目录。

新增供应商、请求字段、JSON 结构或格式约束通常只涉及模板数据。新增用途类型或传输方式仍需更新用途合同和适配能力，模板注册本身不会提供执行能力。

## 思考等级

思考等级按协议提供可编辑的基础建议，默认不选中任何等级。用户可以添加、删除等级，修改显示名称和接口值，并选择默认等级。等级值是字符串，可以选择通用建议或输入自定义值；空列表表示不提供等级选项，默认值为空表示不指定等级。恢复基础建议会将编辑器建议写入模型配置。

对话模型菜单显示已保存的等级，所选值随会话保存。切换模型使用新模型的默认值。运行请求只携带 `thinkingLevel`，不携带可选等级列表。Pi 适配层利用 SDK 等级映射传递自定义值，普通聊天、主 Agent 和子 Agent 共用；具体供应商是否接受该值由其接口决定。

## 运行时边界

运行时只消费提交的模型配置，不读取设置页面的预设。SDK 的 `runtime/models/list` 目录查询已移除；应用的 `chat.listModels()` 继续返回宿主已配置的模型信息。Pi 适配器仍可查询自身 SDK 的单个模型信息以兼容原生调用，不向设置页面提供模型目录。
