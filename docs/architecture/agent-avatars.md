# 智能体头像

16 个按用途设计的智能体头像，使用内置 `image_gen` 分别生成。统一采用柔和陶瓷质感的机器人半身插画，通过配色和职业道具区分用途，不含文字或动物元素。

客户端使用 256 × 256 WebP，使用 `cwebp` 缩小并编码为质量 86 的图片。原始图片保留在生成工具的输出目录；应用引用的最终文件均保存在 [智能体头像资源目录](../../apps/client/src/assets/avatars/agents)。

完整提示词、头像 ID 和文件映射记录在 [generation.json](../../apps/client/src/assets/avatars/agents/generation.json)。头像由 [头像注册表](../../apps/client/src/assets/avatars/index.ts) 注册，系统配置库通过同名头像 ID 引用。新建智能体默认使用 `agent-office`，用户可在编辑页自行更换。
