export function createLibrary(book) {
  const pages = new Map(book.pages.map((page) => [page.id, page]));
  const searchIndex = book.pages.map((page) => ({
    page,
    haystack: `${page.title}\n${page.id}\n${page.text}`.toLowerCase(),
  }));
  return {
    catalog: () => ({ title: book.title, language: book.language, entries: book.entries }),
    read(id) {
      const page = pages.get(id);
      if (!page) throw new Error("文档不存在，请从目录选择页面。");
      const { text: _text, ...document } = page;
      return document;
    },
    search(query) {
      if (typeof query !== "string" || query.length > 200) throw new Error("搜索关键词不能超过 200 个字符。");
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return { results: [], total: 0 };
      const matches = searchIndex.filter(({ haystack }) => terms.every((term) => haystack.includes(term)));
      matches.sort((a, b) => {
        const score = ({ page }) =>
          terms.reduce(
            (n, term) => n + (page.title.toLowerCase().includes(term) ? 10 : 0) + (page.id.includes(term) ? 2 : 0),
            0,
          );
        return score(b) - score(a);
      });
      return {
        total: matches.length,
        results: matches.slice(0, 30).map(({ page }) => {
          const start = Math.max(0, page.text.toLowerCase().indexOf(terms[0]) - 45);
          return {
            id: page.id,
            title: page.title,
            group: page.group,
            excerpt: (start ? "…" : "") + page.text.slice(start, start + 160).replace(/\s+/g, " "),
          };
        }),
      };
    },
  };
}
