# 智能体头像

智能体配置库使用 16 个按用途设计的头像。它们采用柔和陶瓷质感的机器人半身插画，通过配色和职业道具区分用途。

客户端使用 256 × 256 WebP，文件保存在 [智能体头像资源目录](../../apps/client/src/assets/avatars/agents)。新增头像时保持相同尺寸与风格，并在注册表中添加 ID 和文件映射。

完整提示词、头像 ID 和文件映射记录在 [generation.json](../../apps/client/src/assets/avatars/agents/generation.json)。头像由 [头像注册表](../../apps/client/src/assets/avatars/index.ts) 注册，系统配置库通过同名头像 ID 引用。新建智能体默认使用 `agent-office`；在编辑页点击头像打开选择弹窗，点击候选头像后应用到当前草稿，保存智能体后生效。
