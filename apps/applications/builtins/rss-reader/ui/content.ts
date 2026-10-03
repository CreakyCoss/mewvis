import DOMPurify from "dompurify";
import { httpUrl, type Article } from "./model";

export function articleHtml(article: Article) {
  const source = article.contentHtml || article.content || article.summary;
  const clean = DOMPurify.sanitize(source, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "a",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "figure",
      "figcaption",
      "div",
      "span",
      "sup",
      "sub",
    ],
    ALLOWED_ATTR: ["href", "title", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
  });
  const template = document.createElement("template");
  template.innerHTML = clean;
  template.content.querySelectorAll("a").forEach((link) => {
    const href = httpUrl(
      link.getAttribute("href"),
      article.link || article.feedUrl,
    );
    if (href) link.setAttribute("href", href);
    else link.removeAttribute("href");
  });
  if (
    !template.content.querySelector("p,h1,h2,h3,ul,ol,pre,table,blockquote,div")
  ) {
    const paragraphs = template.content.textContent?.split(/\n\s*\n/) ?? [];
    template.innerHTML = "";
    for (const text of paragraphs) {
      const p = document.createElement("p");
      p.textContent = text;
      template.content.append(p);
    }
  }
  return template.innerHTML;
}
