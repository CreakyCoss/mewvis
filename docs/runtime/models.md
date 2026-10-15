# 模型配置与编辑器预设

模型设置保留模型 ID 和显示名称。模型通过「获取模型」或手动输入添加，没有预置模型名单和模型同步脚本。各用途的「请求配置」集中展示地址、Key、协议和请求模型 ID，由一个「继承 Provider」勾选控制：勾选时清空所有覆盖值并禁用整个区域，取消后才允许编辑。`purpose.connection` 只保存覆盖字段，地址、Key 和协议留空时分别沿用所属 Provider；请求模型 ID 留空时沿用顶部模型 ID，不存在模型级公共连接。

## 获取模型时的能力信息

`discover_provider_models` 返回统一的 `DiscoveredProviderModel`：模型 ID、名称，以及可选的 `limits`、部分 `capabilities` 和思考等级值 `thinking.levels`。服务端的 `model-metadata.ts` 负责把不同协议的响应映射到这个结构；未返回的字段保持缺省，明确返回的 `false`、空列表与缺省分开处理。

| 接口                                                                                                            | 可读取的信息                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [OpenAI 标准模型列表](https://developers.openai.com/api/reference/resources/models/methods/list)                | 标准返回只有模型标识等基本信息；兼容服务明确提供扩展元数据时可额外读取                                  |
| [Anthropic 模型列表](https://platform.claude.com/docs/en/api/models/list)                                       | 输入和输出 token 限制、图片输入、思考支持、各 effort 等级的支持情况                                     |
| [Gemini 模型列表](https://ai.google.dev/api/models)                                                             | 输入和输出 token 限制、思考支持、生成方法；生成方法不用于猜测思考等级或具体输入输出模态                 |
| [OpenRouter 模型列表](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) | 上下文、输出限制、输入输出模态、思考与工具参数的支持情况；仅支持 reasoning 参数不代表返回了具体等级列表 |
| [MiniMax 模型列表](https://platform.minimax.io/docs/api-reference/models/anthropic/list-models) | 标准返回为 ID、名称等基础信息，不包含上下文等能力元数据 |

获取弹窗只展示接口返回的信息。添加新模型时，统一预设入口按字段使用「接口返回 → 对应供应商的型号预设 → 通用默认值」的优先级补齐信息。型号预设只匹配明确维护的模型 ID，不通过前缀猜测未知型号的能力。思考等级名称由通用定义补全，默认不选中等级；明确不支持思考时清除等级建议。同 ID 的已有模型不更新，保留用户的名称、参数和用途配置；已有模型可在「可调参数」中使用「恢复基础限制」应用当前型号预设。

MiniMax 型号预设参考[官方 Anthropic SDK 文档](https://platform.minimax.cn/docs/api-reference/text-anthropic-api)和 [Chat Completions 参数文档](https://platform.minimax.cn/docs/api-reference/text-chat-openai)：M2、M2.1、M2.5、M2.7（含文档列出的 highspeed 型号）上下文和最大输出均为 204,800 tokens；M3 和 M3.1-Flash-Preview 上下文为 1,000,000 tokens、最大输出为 524,288 tokens，并支持文字、图片和视频输入。M3.1-Flash-Preview 另提供五档思考深度建议。最大输出采用接口文档的上限，区别于文档推荐的请求输出预算（M2 系列 65,536、M3 系列 131,072）；思考内容也计入输出预算，用户可按需下调。

只返回部分 token 限制时，基础默认值会调整到有效范围。例如接口返回上下文 4096、未返回最大输出，基础最大输出会降到 4096。无效数字或相互矛盾的输出上限会忽略。输出模态可映射到对应生成用途；合同暂不支持的模态不伪装成文字对话。

## 用途与请求配置

一个模型可以配置多个用途，每个用途独立声明输入、输出、参数及格式约束。原生对话用途使用现有运行时适配器；HTTP / JSON 用途可以编辑输入 JSON Schema、请求方法、路径、请求头和请求体，以及直接返回或异步任务的结果解析规则。

每个用途的 `modelId` 可独立指定上游请求模型；未设置时使用顶部模型 ID。对话可继承 DeepSeek Provider，图片生成则单独配置 MiniMax 地址、Key 和 `image-01`。`{{model.id}}`、`{{auth.apiKey}}` 始终对应当前用途。继承 Provider 的连接并不继承它的对话请求格式，HTTP / JSON 用途继续使用自己的模板。切换或恢复模板保留连接和请求模型 ID。

删除模型、用途、参数、输出规则或思考等级均需要二次确认。删除 Provider 沿用原有确认流程。

参数支持默认值、调用时覆盖开关和 JSON Schema 约束。请求模板通过 `model`、`input`、`params`、`auth` 变量组合内容；整值变量保留原始 JSON 类型。返回配置通过 JSON Pointer 提取文本、JSON、URL 或 Base64 结果，也可声明业务成功条件、错误字段和任务查询规则。

通用合同、参数校验、请求组合、返回解析和本地预览位于 `@mewvis/chat-contracts/model-configuration`，不依赖供应商预设。本地预览隐藏凭据，不发送请求。已配置的 HTTP / JSON 图片生成、图片编辑和视频生成用途可由内置 `generate_media` 工具执行；原生用途继续使用各自的协议适配器。

完整配置随 `runtimeModel.configuration` 传入。提交时为每个用途固定已解析的连接和请求模型 ID，使媒体用途继承原 Provider，而不会误用已独立配置的对话连接。媒体工具只使用当前选中模型的用途；没有可执行媒体用途或禁用工具调用时，不注册媒体工具，也不自动调用其他模型。

调用方式、文件保存和执行边界见[媒体生成工具](media-generation.md)。

## 编辑器预设的维护

预设由设置页面自行维护，目录为 `apps/client/src/workbench/pages/settings/llm/edit/presets/`：

- `common.ts` 集中定义默认供应商、通用协议、用途、输入输出类型、思考等级名称、基础能力与限制，以及通用对话模板。
- `providers/` 按供应商拆分。每个文件声明一个完整的 `ProviderPreset`，同时维护连接信息、思考等级值、`models` 型号元数据（附官方来源）和用途模板。
- `types.ts` 定义原始预设类型，`resolve.ts` 的 `createEditorPresets` 统一处理通用定义和供应商定义，补全等级名称、合并协议选项、校验模板并建立匹配关系。
- 根 `index.ts` 注册各供应商，通过统一处理方法生成 `editorPresets`。编辑页面只使用这个入口获取连接建议、创建基础模型配置和应用用途模板。

数据流为「通用定义 + 各供应商定义 → `createEditorPresets` → `editorPresets` → 编辑页面」。供应商文件不引用处理模块或页面。添加模型时，处理后的基础能力、限制和思考等级建议会写入提交的数据，之后由用户自行修改。

新增供应商时，在 `providers/` 添加一个预设文件并在根 `index.ts` 注册。新增用途模板只需编辑对应供应商预设的 `templates`。供应商归属由统一处理方法建立，模板的 `match` 只描述模型 ID 匹配规则。界面按 `purpose.type` 列出模板；没有匹配模板时，用户仍可从自定义 HTTP / JSON 配置开始。

预设只用于初始填充、恢复和样例预览。应用模板会复制完整的 `ModelPurpose` 到模型配置中，`preset.id` 和 `preset.version` 仅记录来源。后续编辑、保存和读取使用这份副本，不依赖模板是否仍存在，也不会自动套用模板更新。用户配置保存在 SQLite 模型记录的 `configuration_json` 中，不加入预设目录。

新增供应商、请求字段、JSON 结构或格式约束通常只涉及模板数据。新增用途类型或传输方式仍需更新用途合同和适配能力，模板注册本身不会提供执行能力。

## 思考等级

思考等级按协议提供可编辑的基础建议，默认不选中任何等级。用户可以添加、删除等级，修改显示名称和接口值，并选择默认等级。等级值是字符串，可以选择通用建议或输入自定义值；空列表表示不提供等级选项，默认值为空表示不指定等级。恢复基础建议会将编辑器建议写入模型配置。

对话模型菜单显示已保存的等级，所选值随会话保存。切换模型使用新模型的默认值。运行请求只携带 `thinkingLevel`，不携带可选等级列表。Pi 适配层利用 SDK 等级映射传递自定义值，普通聊天、主 Agent 和子 Agent 共用；具体供应商是否接受该值由其接口决定。

## 运行时边界

运行时只消费提交的模型配置，不读取设置页面的预设。SDK 的 `runtime/models/list` 目录查询已移除；应用的 `chat.listModels()` 继续返回宿主已配置的模型信息。Pi 适配器仍可查询自身 SDK 的单个模型信息以兼容原生调用，不向设置页面提供模型目录。
