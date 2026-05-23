#!/usr/bin/env node
/**
 * 晋江文学城排行榜采集脚本
 *
 * 配合 browser-cdp skill 使用。先启动 Chrome CDP 环境，再运行本脚本。
 * 采集策略：晋江页面为传统 HTML，通过 onebook.php 链接定位作品条目，
 * 按频道分组提取书名和作者。
 * 注：收藏数/营养液/积分等核心指标仅在作品详情页（需逐条访问），
 *     当前版本只提取榜单页可见数据（书名、作者、链接）。
 * 输出 Markdown 格式匹配 scan-output-format.md 规范。
 *
 * 用法：
 *   node jjwxc-rank-scraper.js --type 12              # 收入金榜
 *   node jjwxc-rank-scraper.js --type 7               # 月榜
 *   node jjwxc-rank-scraper.js --type 8               # 季度榜
 *   node jjwxc-rank-scraper.js --type 14              # 完结金榜
 *   node jjwxc-rank-scraper.js --type all             # 全部榜单
 *
 * 前置：
 *   bash ~/.claude/skills/browser-cdp/scripts/setup_cdp_chrome.sh 9222
 */

const fs = require("fs");
const path = require("path");
const { ab, sleep, evalJSON, scrollLoad, getArg } = require("../../shared/scripts/cdp-utils");

const BASE_URL = "https://www.jjwxc.net/topten.php";

const RANK_TYPES = [
  { id: "12", label: "收入金榜" },
  { id: "7", label: "月榜" },
  { id: "8", label: "季度榜" },
  { id: "14", label: "完结金榜" },
  { id: "15", label: "新手金榜" },
  { id: "17", label: "千字金榜" },
];

// ---------------------------------------------------------------------------
// 页面提取
// ---------------------------------------------------------------------------

/**
 * 提取晋江榜单数据。
 * 晋江页面按频道分组（古代言情、现代言情、纯爱等），
 * 每个频道下列出作品（书名链接到 onebook.php）。
 */
function extractRankData(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var result={channels:[]};" +
    // 找到所有指向 onebook.php 的作品链接
    "var bookLinks=Array.from(document.querySelectorAll('a[href*=\"onebook.php\"]'));" +
    "if(!bookLinks.length){" +
    // 兜底：查找任何指向作品页的链接
    "  bookLinks=Array.from(document.querySelectorAll('a[href*=\"novelid\"]'));" +
    "}" +
    "if(!bookLinks.length)return result;" +
    // 找到页面主体内容区域
    "var body=document.querySelector('body');" +
    // 用频道标题分割。晋江频道标题通常用 <h>、<b>、<td> 包含频道名
    // 常见频道关键词
    "var channelKeywords=['古代言情','现代言情','仙侠','科幻','游戏','奇幻','武侠','悬疑','纯爱','百合','无CP','衍生','言情','耽美','古风','青春'];" +
    // 建立 bookLink → 所属频道的映射
    // 向上遍历找到频道标题
    "var currentChannel='';" +
    "var channelMap={};" +
    // 策略：遍历所有元素，维护当前频道名
    "var allEls=document.querySelectorAll('tr,div,h1,h2,h3,h4,h5,td,th,b,font');" +
    "for(var i=0;i<allEls.length;i++){" +
    "  var el=allEls[i];" +
    "  var text=el.textContent.trim();" +
    // 检测频道标题
    "  for(var k=0;k<channelKeywords.length;k++){" +
    "    if(text.indexOf(channelKeywords[k])>=0&&text.length<30){" +
    "      currentChannel=text;" +
    "      if(!channelMap[currentChannel])channelMap[currentChannel]=[];" +
    "      break" +
    "    }" +
    "  }" +
    // 检测这个元素内是否有作品链接
    "  var links=el.querySelectorAll('a[href*=\"onebook.php\"],a[href*=\"novelid\"]');" +
    "  if(links.length>0&&currentChannel){" +
    "    links.forEach(function(a){" +
    "      var novelId=(a.getAttribute('href')||'').match(/novelid=(\\d+)/);" +
    "      novelId=novelId?novelId[1]:'';" +
    "      var title=a.textContent.trim();" +
    "      if(!title||title.length>50)return;" +
    // 作者通常在同级或相邻元素
    "      var parent=el;" +
    "      var authorLink=parent.querySelector('a[href*=\"authorid\"]');" +
    "      var author=authorLink?authorLink.textContent.trim():'';" +
    "      if(!author){" +
    "        var parentText=parent.textContent.replace(/\\s+/g,' ').trim();" +
    "        var m=parentText.match(/作者[：:]?\\s*([^\\s,，]+|\\S+)/);" +
    "        author=m?m[1]:''" +
    "      }" +
    "      var href=a.getAttribute('href')||'';" +
    "      var url=href.indexOf('http')===0?href:'https://www.jjwxc.net/'+href.replace(/^\\.\\//,'');" +
    "      channelMap[currentChannel].push({title:title,author:author,url:url,novelId:novelId})" +
    "    })" +
    "  }" +
    "}" +
    // 如果没检测到频道分组，把所有书放到一个默认组
    "var foundAny=Object.values(channelMap).some(function(arr){return arr.length>0});" +
    "if(!foundAny){" +
    "  currentChannel='全站';" +
    "  channelMap[currentChannel]=[];" +
    "  bookLinks.forEach(function(a){" +
    "    var novelId=(a.getAttribute('href')||'').match(/novelid=(\\d+)/);" +
    "    novelId=novelId?novelId[1]:'';" +
    "    var title=a.textContent.trim();" +
    "    var href=a.getAttribute('href')||'';" +
    "    var url=href.indexOf('http')===0?href:'https://www.jjwxc.net/'+href.replace(/^\\.\\//,'');" +
    "    channelMap[currentChannel].push({title:title,author:'',url:url,novelId:novelId})" +
    "  })" +
    "}" +
    // 转换为数组输出
    "for(var name in channelMap){" +
    "  if(channelMap[name].length>0){" +
    "    result.channels.push({name:name,books:channelMap[name]})" +
    "  }" +
    "}" +
    "return result" +
    "})())";
  return evalJSON(port, js);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const PORT = parseInt(getArg(args, "--port") || "9222", 10);
const OUTDIR = getArg(args, "--outdir") || ".";
const RANKTYPE = getArg(args, "--type") || "12";
const CHANNEL = getArg(args, "--channel") || "0";

function scrapeRank(port, rankTypeId, channelId) {
  const rt = RANK_TYPES.find((r) => r.id === rankTypeId);
  if (!rt) {
    console.log(`  ⚠ 未知榜单类型: ${rankTypeId}`);
    return null;
  }

  const url = `${BASE_URL}?orderstr=${rankTypeId}&t=${channelId}`;
  const chLabel = channelId === "0" ? "全站" : `频道${channelId}`;
  console.log(`\n→ 采集 晋江${rt.label}（${chLabel}）...`);
  console.log(`  URL: ${url}`);

  ab(port, "open", url);
  sleep(4000);

  const data = extractRankData(port);
  if (!data?.channels?.length) {
    console.log("  ⚠ 未提取到数据");
    return null;
  }

  let totalBooks = 0;
  data.channels.forEach((ch) => (totalBooks += ch.books.length));
  console.log(
    `  ✓ 提取 ${data.channels.length} 个频道，共 ${totalBooks} 本`
  );

  const now = new Date().toISOString();
  const lines = [
    `# 晋江 · ${rt.label}`,
    "",
    `- 来源：${url}`,
    `- 抓取时间：${now}`,
    `- 频道数：${data.channels.length}`,
    `- 总条目数：${totalBooks}`,
    "",
    "---",
    "",
  ];

  for (const ch of data.channels) {
    lines.push(`## ${ch.name} — ${ch.books.length} 本`, "");
    for (let i = 0; i < ch.books.length; i++) {
      const b = ch.books[i];
      lines.push(`### #${i + 1} ${b.title}`);
      if (b.author) lines.push(`*${b.author}*`);
      if (b.url) lines.push(`[作品页](${b.url})`);
      lines.push("");
    }
    lines.push("---", "");
  }

  return lines.join("\n");
}

function main() {
  const rankTypes =
    RANKTYPE === "all" ? RANK_TYPES.map((r) => r.id) : [RANKTYPE];
  const channels = [CHANNEL]; // 晋江频道 ID 需从页面获取，默认全站

  for (const rt of rankTypes) {
    for (const ch of channels) {
      const content = scrapeRank(PORT, rt, ch);
      if (!content) continue;

      const rtInfo = RANK_TYPES.find((r) => r.id === rt);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const chLabel = ch === "0" ? "全站" : `频道${ch}`;
      const filename = `晋江${rtInfo.label}_${chLabel}_${date}.md`;
      const filepath = path.join(OUTDIR, filename);
      fs.writeFileSync(filepath, content, "utf-8");
      console.log(`  ✓ 已保存: ${filepath}`);
    }
  }
}

main();
