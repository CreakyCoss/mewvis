## Mewvis 内置故事应用运行约定

本技能运行在 Mewvis 内置故事应用中。`story` 工具已经实现同版本 Story Contract；每次调用都必须带上系统提示给出的当前 `workspaceId`。不得猜测或访问其他工作区。
技能提到的 `references/...`、`scripts/...` 或 `../story-assistant/...` 资源由应用私有打包。需要读取时调用 `mewvis_story_skill_resource`，参数 `skillName` 使用当前技能名，`path` 使用文中相对路径；不要用普通 `read`、`find`、`grep` 或 shell 读取这些应用资源。
脚本资源用于说明确定性检查规则；当前应用不开放进程执行。需要质量检查时读取对应脚本规则并在当前文本上逐项检查，不得声称实际执行了脚本。
技能中的 `ask_user` 表示直接在当前聊天中向用户提出一个简短问题；它不是可调用工具。已有信息足够时直接继续，不要重复确认。
文中出现的 Mewvis 故事弹窗均指当前 Mewvis 故事助手。
