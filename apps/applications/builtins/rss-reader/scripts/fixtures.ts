import { normalizeArticles, type Feed } from "../ui/model";

export const demoFeeds: Feed[] = [
  {
    url: "https://example.com/indie.xml",
    name: "独立开发手记",
    category: "技术与产品",
  },
  { url: "https://example.com/design.xml", name: "设计现场", category: "设计" },
  {
    url: "https://example.com/weekly.xml",
    name: "开源周刊",
    category: "技术与产品",
  },
  { url: "https://example.com/life.xml", name: "慢读生活", category: "生活" },
  {
    url: "https://example.com/tools.xml",
    name: "工具观察",
    category: "技术与产品",
  },
];
const body = `<h2>先决定什么值得读</h2><p>每天打开阅读器，我们面对的往往不是信息不足，而是需要处理的内容太多。与其不断增加订阅，不如先整理自己的阅读目标。</p><p>把订阅源按主题归组，用未读列表处理新内容，把需要深入理解的文章留到稍后阅读。重要的观点可以加一条笔记，定期回顾。</p><blockquote><p>把值得再读的内容，留给未来的自己。</p></blockquote><h2>让阅读进入工作流</h2><p>好的阅读工具应该保留文章的结构和引用，让阅读、标记和整理自然衔接。留下来的，不只是链接，还有你自己的理解。</p><p>一个简单的习惯是，每次读完文章后写下一个想要尝试的行动，而不是急着打开下一篇。定期回顾这些行动，会发现阅读逐渐和真实的生活联系起来。</p><ul><li>用主题整理订阅，减少无目的的浏览。</li><li>把需要耐心阅读的内容留到稍后。</li><li>留下自己的观点，记住内容为什么值得读。</li></ul><h2>少一点堆积，多一点理解</h2><p>阅读无需变成另一份待办清单。我们可以有意识地选择，也可以允许自己跳过。重要的是给值得思考的内容足够的时间。</p><p>这篇内容仅用于展示阅读器的排版与交互。示例链接指向 example.com，不代表真实文章来源。</p>`;
const selections: [number, string, string][] = [
  [
    0,
    "把信息流变成自己的知识库",
    "收集只是开始。给内容一个去处，也给阅读留一点时间。",
  ],
  [
    1,
    "小团队如何维护一套设计系统",
    "从原则到落地，分享我们在真实项目中的经验与思考。",
  ],
  [
    4,
    "让工具安静一点，工作专注一点",
    "少一些打扰，多一些专注。让你效率翻倍的小改变。",
  ],
  [
    2,
    "本周值得关注的开源项目",
    "从开发工具到生产力应用，精选值得关注的开源项目。",
  ],
  [0, "写给长期创作者的工作流", "好的创作需要合适的节奏，也需要持续的积累。"],
  [3, "留一段时间，读一点长文章", "在碎片化的生活里，长文带来不一样的思考。"],
  [1, "从真实需求出发做产品设计", "从用户出发，让每一个细节都有意义。"],
  [0, "小而持久的个人项目", "给项目留一点空间，给自己留一点耐心。"],
  [2, "构建自己的自动化工具箱", "让重复的工作更简单。"],
  [1, "重新认识界面中的留白", "空间也是一种表达。"],
  [0, "好的工具如何融入日常", "让习惯引导工具，而不是反过来。"],
  [0, "把想法写下来之后", "从一个念头开始，逐渐做出东西。"],
  [3, "周末，去书店走一走", "偶尔，让自己离开屏幕。"],
  [4, "五个值得保留的小习惯", "给专注创造更好的条件。"],
  [2, "开源维护者的一天", "软件背后，是具体的人与生活。"],
  [0, "持续迭代的价值", "每天进步一点，就已足够。"],
  [1, "用原型更早发现问题", "把问题放在可以讨论的地方。"],
  [0, "为长期阅读建立索引", "让有用的内容更容易找回来。"],
  [0, "上周的阅读笔记", "已经读过，也仍值得重温。"],
  [1, "设计中的简单与复杂", "简单来自认真理解复杂。"],
];
export const demoEntries = selections.map(([source, title, summary], index) => {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setMinutes(-index * 40);
  return {
    source,
    guid: `demo-${index}`,
    title,
    summary,
    author: index === 0 ? "林舟" : "编辑部",
    pubDate: date.toISOString(),
    link: `https://example.com/articles/${index}`,
    content: body.replace(/<[^>]*>/g, " "),
    contentHtml: body,
  };
});
export function demoStorage() {
  const values: Record<string, unknown> = {};
  for (const feed of demoFeeds) {
    const source = demoFeeds.indexOf(feed);
    values["rss:feed:v1:" + encodeURIComponent(feed.url)] = {
      version: 1,
      feed,
      articles: normalizeArticles(
        demoEntries.filter((entry) => entry.source === source),
        feed,
      ),
      updated: Date.now(),
    };
  }
  selections.forEach(([source], index) => {
    const article = normalizeArticles(
      [demoEntries[index]],
      demoFeeds[source],
    )[0];
    values["rss:marks:v1:" + encodeURIComponent(article.id)] = {
      read: index >= 18,
      later: index >= 14,
      starred: index < 12,
    };
  });
  return values;
}
