# 设计画布

`@mewvis/design-studio` 是独立的系统内置应用，源码位于 `apps/applications/builtins/design-studio`。默认启用，在影视工坊之后显示。编辑器支持文字、矩形、椭圆与本地图片，以及图层拖动、缩放、旋转、排序、隐藏、锁定、复制和 50 步撤销重做。

## 工作区

首页先「新增工作区」，填写设计名称并选择父目录；应用在该目录下独占创建一个设计文件夹。每个工作区对应一份设计。取消目录选择不会创建项目，同名目录不会被覆盖。也可以通过「打开工作区」选择本应用已有的设计目录。

```text
<workspace>/
├── design.json          # 设计结构，图片仅保存相对路径
├── assets/              # PNG、JPEG、WebP 原始图片与模板素材
├── exports/             # 高清 PNG 与自包含 HTML
└── .mewvis/             # 宿主管理的工作区标识
```

工作区列表来自公共工作区 SDK，设计内容直接从文件读取。打开工作区会校验格式，损坏或不可用的项目单独显示错误，不阻止其他项目使用。「移除」仅移除工作区登记，保留文件，之后可重新打开。备份或移动作品时应保留整个工作区，而不只复制 `design.json`。

编辑后自动保存，也可手动点击「保存设计」；返回列表前等待保存完成，失败则停留在编辑器。保存串行执行，合并等待中的改动，失败保留本地内容并提供重试。文件保存使用原子提交和修改时间校验；检测到外部编辑时拒绝覆盖，需先处理冲突并重新打开。

## 素材与导出

图片导入先校验可解码性，再将原始字节复制到当前工作区的 `assets/`；支持每张 10 MiB、4000 万像素以内的 PNG、JPEG 与 WebP。预览中的 Blob URL 仅驻留内存，设计文件保存受校验的素材相对路径。移除图层不删除素材文件，确保撤销后图片仍可恢复。

提供空白、介绍图、活动海报和 Mewvis 项目介绍四种起始模板。模板插画也会写入工作区素材目录。支持 16:9、1:1、3:4、9:16 与自定义画布，最多 50 个图层，设计结构上限 1 MiB，图片独立存储，不计入设计结构大小。

「导出高清 PNG」按比例将长边输出为 3840 像素；「导出 HTML」把使用中的可见素材内嵌，生成离开工作区也可独立打开的页面。导出结果原子写入当前工作区的 `exports/`，使用唯一文件名。预览、PNG 和 HTML 使用同一 Canvas 渲染逻辑，不依赖网络或 CDN。字体使用系统字体，跨系统字形可能不同。

## 接入与开发

应用仅声明 `application-workspaces` 和 `workspace-files`，直接使用公开工作区与文件 SDK，不需要工坊子视图、聊天或宿主专用业务命令。设计采用新的 `mewvis-design` / version 1 格式，不读取工坊业务存储，不提供旧作品迁移或旧 JSON 导入。

```sh
pnpm --filter @mewvis/design-studio check
pnpm --filter @mewvis/design-studio build
pnpm --filter @mewvis/design-studio test
pnpm --filter @mewvis/design-studio test:browser
pnpm --filter @mewvis/design-studio dev
```

`dev` 提供隔离的沙箱预览，工作区和文件保存在临时测试目录，目录选择使用测试适配，重启重置，不访问用户工作目录。浏览器验证需安装 Playwright，可通过 `MEWVIS_PLAYWRIGHT_MODULE` 指定模块位置，使用 `CHROME_PATH` 指定浏览器。真实目录选择和文件访问授权需在 Mewvis 中验证。
