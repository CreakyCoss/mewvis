import { defineConfig } from "vitepress";
import { resolve } from "node:path";
import { tokenizeDocumentText } from "./search.mjs";
import {
  configureDocumentLinks,
  createSidebar,
  repositoryUrl,
  repositoryRoot,
  siteBase,
  siteUrl,
} from "./navigation.mjs";

export default defineConfig({
  title: "Mewvis 文档",
  description: "创建自己的 AI 应用，按需通过插件扩展。",
  lang: "zh-CN",
  base: siteBase,
  ignoreDeadLinks: [/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/],
  srcExclude: ["**/design-qa.md"],
  vite: {
    publicDir: resolve(repositoryRoot, "apps/client/public/assets/startup"),
  },
  rewrites: { "README.md": "index.md" },
  head: [
    [
      "link",
      { rel: "icon", type: "image/png", href: `${siteBase}brand-mark.png` },
    ],
  ],
  sitemap: { hostname: siteUrl },
  markdown: {
    anchor: {
      slugify: (title) =>
        title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, "")
          .replace(/\s/g, "-") || "section",
    },
    config: configureDocumentLinks,
  },
  themeConfig: {
    logo: "/brand-mark.png",
    siteTitle: "Mewvis 文档",
    nav: [
      { text: "快速开始", link: "/guide/desktop" },
      { text: "应用开发", link: "/apps/development" },
      { text: "插件开发", link: "/extensions/development" },
    ],
    sidebar: createSidebar(),
    outline: { level: [2, 3], label: "本页目录" },
    search: {
      provider: "local",
      options: {
        miniSearch: {
          options: {
            tokenize: tokenizeDocumentText,
          },
        },
        locales: {
          root: {
            translations: {
              button: { buttonText: "搜索文档", buttonAriaLabel: "搜索文档" },
              modal: {
                displayDetails: "显示详细结果",
                noResultsText: "没有找到相关内容",
                resetButtonTitle: "清除搜索",
                backButtonTitle: "关闭搜索",
                footer: {
                  selectText: "选择",
                  selectKeyAriaLabel: "回车键",
                  navigateText: "切换",
                  navigateUpKeyAriaLabel: "向上键",
                  navigateDownKeyAriaLabel: "向下键",
                  closeText: "关闭",
                  closeKeyAriaLabel: "退出键",
                },
              },
            },
          },
        },
      },
    },
    socialLinks: [{ icon: "github", link: repositoryUrl }],
    editLink: {
      pattern: `${repositoryUrl}/edit/main/docs/:path`,
      text: "在 GitHub 上编辑本页",
    },
    docFooter: { prev: "上一页", next: "下一页" },
    darkModeSwitchLabel: "外观",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式",
    sidebarMenuLabel: "章节目录",
    returnToTopLabel: "返回顶部",
    notFound: {
      title: "页面不存在",
      quote: "可以从章节目录或搜索中查找需要的内容。",
      linkLabel: "返回文档首页",
    },
    footer: { message: "Mewvis · 从想法到应用，触手可及" },
  },
});
