import {
  createEmptyStoryManuscriptInbox,
} from "./manuscript-inbox";
import type {
  StoryContextCharacter,
  StoryContextLorebookEntry,
  StoryContextScene,
} from "./context-package";
import type {
  StoryAsset,
  StoryState,
} from "./state";

type DefaultStoryBlueprint = {
  id: string;
  title: string;
  outline: string;
  goal: string;
  characters: StoryContextCharacter[];
  lorebookEntries: StoryContextLorebookEntry[];
  scenes: Array<Omit<StoryContextScene, "id">>;
};

const defaultStoryBlueprints: DefaultStoryBlueprint[] = [
  {
    id: "story-raincity-silent-manuscript",
    title: "雨城失语书",
    outline:
      "雨城连下四十九天雨，一本没有署名的手稿在旧杂志社、修书铺和停刊报馆之间流转。每当有人读完新章节，城里就会多一个失去声音的人。用户进入故事后，需要帮助角色在不被手稿诱导的前提下找回第一章、确认袁辞失声真相，并决定是否公开这部危险小说。",
    goal: "找回失踪第一章，保护袁辞和被手稿标记的作者，决定这部小说应被焚毁、封存还是改写。",
    characters: [
      {
        id: "rc-ji-ling",
        name: "纪泠",
        description: "旧杂志社编辑，习惯把情绪压进校样批注。她曾退回袁辞最后一部小说，之后城中开始出现没有署名的章节。",
        speakingStyle: "克制、短促，像在删改一句过长的病句；被逼问时会先引用稿件细节。",
        writingStyle: "用铅笔痕、雨水、页边批注和没说完的句子表现她的负罪感。",
        goals: "找回袁辞失踪前的第一章，确认自己是否间接害他失声。",
      },
      {
        id: "rc-yuan-ci",
        name: "袁辞",
        description: "失踪小说家，几乎无法发声，只能通过便签、敲击和被雨声覆盖的录音留下线索。",
        speakingStyle: "极少直接说话；用残句、删改符号和短促敲击表达意思。",
        writingStyle: "他的段落应带有断裂感，像一页被撕去中心的小说。",
        goals: "阻止手稿继续吞掉更多作者的声音，并找回自己真正的结尾。",
      },
      {
        id: "rc-su-yan",
        name: "苏砚",
        description: "停刊记者，追踪雨城失声事件多年。她相信失踪手稿背后有人为操纵，而不是单纯怪谈。",
        speakingStyle: "敏锐、带刺，常把问题拆成证据链。",
        writingStyle: "描写她时突出录音笔、旧报剪和突然收紧的目光。",
        goals: "证明失声事件与旧杂志社撤稿潮有关，拿到能公开发表的证据。",
      },
      {
        id: "rc-he-mu",
        name: "何牧",
        description: "装帧师，经营快倒闭的旧书修补铺。她知道哪些书页被替换过，却害怕承认自己参与过装订。",
        speakingStyle: "温和、绕开锋芒，习惯把危险说成工艺问题。",
        writingStyle: "用浆糊、线孔、纸纤维和手指伤口表现她的心虚。",
        goals: "保护书铺里寄放的孤本，同时弥补曾经替人装订失声手稿的错误。",
      },
    ],
    lorebookEntries: [
      {
        id: "story-raincity-lore-manuscript",
        title: "失语手稿",
        content: "一部被多名编辑和作者删改过的残稿，会把朗读者的声音写进空白处。",
        keywords: ["手稿", "失声", "袁辞"],
        enabled: true,
        alwaysOn: true,
      },
      {
        id: "story-raincity-lore-magazine",
        title: "雨城旧杂志社",
        content: "停刊前以文学栏目闻名，撤稿潮发生后多名作者离开城市。",
        keywords: ["旧杂志社", "纪泠"],
        enabled: true,
        alwaysOn: false,
      },
      {
        id: "story-raincity-lore-binding",
        title: "灰蓝装订线",
        content: "何牧认得这种线，它来自玻璃印刷厂地下库，常用于封存禁稿。",
        keywords: ["装订线", "何牧"],
        enabled: true,
        alwaysOn: false,
      },
      {
        id: "story-raincity-lore-list",
        title: "失声名单",
        content: "苏砚整理的名单按旧杂志栏目排序，不是按时间排序。",
        keywords: ["失声名单", "苏砚"],
        enabled: true,
        alwaysOn: false,
      },
    ],
    scenes: [
      {
        title: "雨棚下的退稿信",
        scene: "旧杂志社的天井滴着冷雨，四个人围着复印稿，等待用户决定先查页边批注、录音时间还是灰蓝装订线。",
        goal: "锁定第一章缺页的位置。",
        plot: "第一页不在杂志社，而被何牧修进一本旧书封底。",
        direction: "围绕复印稿的三个物证推进，不急于解释手稿来源。",
        transition: "找到灰蓝线来源后进入玻璃印刷厂。",
        memory: "初始节点，所有人尚未确认第一页在哪。",
      },
      {
        title: "玻璃印刷厂",
        scene: "废弃印刷厂的玻璃穹顶被雨打得发白，地下库门缝里露出灰蓝色线头。",
        goal: "确认装订线与禁稿库之间的关系。",
        plot: "地下库保存着被撤稿作者的原始录音。",
        direction: "让角色在工业废墟中验证证据，制造手稿主动改写现场的压迫感。",
        transition: "当录音恢复袁辞的一个完整句子后，转入失语楼顶。",
        memory: "第二节点，装订线成为关键证据。",
      },
      {
        title: "失语楼顶",
        scene: "楼顶积水倒映着整座雨城，手稿摊开后，空白页开始写出用户刚刚想到的句子。",
        goal: "决定焚毁、封存还是改写手稿。",
        plot: "真正的结尾必须由仍拥有声音的人主动承担代价。",
        direction: "把选择压力落在角色关系上，避免变成单纯解谜。",
        transition: "根据选择进入封存、公开或改写三种后续。",
        memory: "第三节点，故事进入价值抉择。",
      },
    ],
  },
  {
    id: "story-snowridge-sword-oath",
    title: "雪岭照夜剑",
    outline:
      "雪岭大雪封路，一封刻着照夜门旧誓的剑书重现驿站。林照夜、顾听雪、秋衡和净尘各自握着旧案一角。用户需要在夜袭前查明剑书原意，决定是护送、公开还是毁去它。",
    goal: "在门派追兵抵达前复核旧誓，保住林照夜的右手，并让秋衡看见旧案真相。",
    characters: [
      {
        id: "sx-lin-zhaoye",
        name: "林照夜",
        description: "被逐出师门的照夜剑传人，右手旧伤未愈，却仍记得剑书最后一式。",
        speakingStyle: "少言，句子像收鞘；不轻易承诺，一旦承诺就不退。",
        writingStyle: "写他的动作要有雪、剑鞘、旧伤和呼吸的节奏。",
        goals: "查清当年叛门真相，并保护剑书不落入追兵手中。",
      },
      {
        id: "sx-gu-tingxue",
        name: "顾听雪",
        description: "雪岭药庐传人，医术清冷，行事比刀锋更稳。她握着能证明旧案的药方残页。",
        speakingStyle: "平静、精确，常用药理和脉象比喻局势。",
        writingStyle: "以药香、银针、雪光和袖中残页表现她的判断。",
        goals: "保住林照夜的手，也保住雪岭药庐不被门派卷入。",
      },
      {
        id: "sx-qiu-heng",
        name: "秋衡",
        description: "照夜门年轻执法，奉命追回剑书。外表锋利，内心开始怀疑师门口供。",
        speakingStyle: "咄咄逼人但守江湖规矩，喜欢把话逼到一个是非句。",
        writingStyle: "写他时突出刀柄、雪靴、门规和目光里的迟疑。",
        goals: "带回剑书，同时确认林照夜是否真是叛徒。",
      },
      {
        id: "sx-jingchen",
        name: "净尘",
        description: "驿站扫雪僧，像旁观者，实则亲历旧案。他知道剑书誓约原本不是杀令。",
        speakingStyle: "温和，常用雪路、茶水和钟声作比。",
        writingStyle: "让他像一盏慢慢亮起的灯，不急于证明自己知道真相。",
        goals: "让旧誓约回到保护人的本意，而不是成为追杀令。",
      },
    ],
    lorebookEntries: [
      {
        id: "story-snowridge-lore-book",
        title: "照夜剑书",
        content: "照夜门旧誓载体，暗纹需在雪光下显现。",
        keywords: ["剑书", "照夜"],
        enabled: true,
        alwaysOn: true,
      },
      {
        id: "story-snowridge-lore-inn",
        title: "雪岭驿站",
        content: "山路要冲，二更后风雪会封住前后两道门。",
        keywords: ["驿站", "雪岭"],
        enabled: true,
        alwaysOn: false,
      },
      {
        id: "story-snowridge-lore-steles",
        title: "旧碑林",
        content: "记录照夜门最初守护雪岭百姓的誓言。",
        keywords: ["碑林", "旧誓"],
        enabled: true,
        alwaysOn: false,
      },
      {
        id: "story-snowridge-lore-prescription",
        title: "药方残页",
        content: "顾听雪保存的药方能证明当年毒案不是林照夜所为。",
        keywords: ["药方", "毒案"],
        enabled: true,
        alwaysOn: false,
      },
    ],
    scenes: [
      {
        title: "风雪驿站",
        scene: "炉火被门缝风压低，剑书在桌上显出第一道暗纹。",
        goal: "确认剑书和药方残页的矛盾。",
        plot: "追兵未至，门规已先压到桌面。",
        direction: "以驿站内的言语交锋和细微动作推进。",
        transition: "暗纹指向旧碑林。",
        memory: "第一节点，剑书刚出现。",
      },
      {
        title: "旧碑林",
        scene: "雪埋半截碑身，净尘拂开碑文，旧誓的字迹与剑书暗纹一一对应。",
        goal: "证明旧誓不是追杀令。",
        plot: "碑文缺的一角在秋衡令牌背面。",
        direction: "让秋衡开始动摇。",
        transition: "追兵夜袭迫使众人去断桥。",
        memory: "第二节点，旧誓可被复核。",
      },
      {
        title: "雪岭断桥",
        scene: "断桥下云雾翻卷，追兵火把在雪里排成一线。",
        goal: "决定带剑书入门派对质还是毁去它。",
        plot: "真正叛徒会逼林照夜强行使出伤手剑招。",
        direction: "把选择落在伤势、旧恩和门规之间。",
        transition: "进入门派对质或远走支线。",
        memory: "第三节点，夜袭后的抉择。",
      },
    ],
  },
  {
    id: "story-orbital-ashes-letter",
    title: "环轨余烬信",
    outline:
      "濒临坠毁的环轨站收到一封十二年前才应该送达的最后家书。蓝桥、米拉、任珂和伊森必须在轨道衰减前解码信号、修复推进环，并决定是否公开撤离事故真相。",
    goal: "解码余烬信，稳定环轨站，并决定蓝桥父亲的最后选择应如何被记入档案。",
    characters: [
      {
        id: "oa-lan-qiao",
        name: "蓝桥",
        description: "环轨站临时舰长，习惯把恐惧转成操作口令。她的父亲曾在十二年前的撤离中失踪。",
        speakingStyle: "冷静、指令式，但独处时句尾会露出迟疑。",
        writingStyle: "用仪表读数、舱壁震动和压低的呼吸写她的压力。",
        goals: "稳定环轨站，确认父亲最后信号是否真实。",
      },
      {
        id: "oa-mira",
        name: "米拉",
        description: "档案人格，外形投影像一名旧时代图书管理员。她保存着十二年前被删改的撤离日志。",
        speakingStyle: "礼貌、精确，偶尔像引用图书索引。",
        writingStyle: "让她的投影带有轻微延迟和数据噪声。",
        goals: "恢复被删改日志，同时避免核心档案被坠毁烧毁。",
      },
      {
        id: "oa-ren-ke",
        name: "任珂",
        description: "穿梭艇信使，带着最后一批实体信件抵达环轨站。他知道外部救援不会准时来。",
        speakingStyle: "轻快、带一点自嘲，用玩笑掩盖坏消息。",
        writingStyle: "通过宇航服划痕、信袋重量和故作轻松的动作写他。",
        goals: "把信送到真正收件人手上，并找机会让穿梭艇再飞一次。",
      },
      {
        id: "oa-yi-sen",
        name: "伊森",
        description: "老工程师，参与过环轨站第一版建造。他能听出舱壁里的裂纹，也记得当年被迫关闭的舱段。",
        speakingStyle: "慢、低、带旧时代工程师的固执。",
        writingStyle: "写他时突出工具声、舱壁回音和对旧系统的熟悉。",
        goals: "把环轨站撑到信号解码完成，弥补十二年前没能救下的人。",
      },
    ],
    lorebookEntries: [
      {
        id: "story-orbital-lore-station",
        title: "环轨站",
        content: "旧时代建造的高轨居住与档案设施，如今轨道衰减严重。",
        keywords: ["环轨站", "轨道衰减"],
        enabled: true,
        alwaysOn: true,
      },
      {
        id: "story-orbital-lore-letter",
        title: "余烬信",
        content: "十二年前撤离事故中被拆分的最后家书，混有证词和私人留言。",
        keywords: ["余烬信", "家书"],
        enabled: true,
        alwaysOn: false,
      },
      {
        id: "story-orbital-lore-mira",
        title: "米拉档案人格",
        content: "负责保存站内撤离日志的投影人格，部分权限被旧口令锁住。",
        keywords: ["米拉", "档案"],
        enabled: true,
        alwaysOn: false,
      },
      {
        id: "story-orbital-lore-old-module",
        title: "旧舱段",
        content: "十二年前被切断的撤离通道，伊森知道手动入口。",
        keywords: ["旧舱段", "伊森"],
        enabled: true,
        alwaysOn: false,
      },
    ],
    scenes: [
      {
        title: "主控室余烬信",
        scene: "主控室的星图不断闪烁，实体信袋在失重前兆里轻轻滑向桌沿。",
        goal: "确认第一段信号与实体信件是否一致。",
        plot: "信号并非外部发送，而是站内旧核心延迟释放。",
        direction: "工程危机与信件情感并行推进。",
        transition: "第一段校验完成后进入档案核心。",
        memory: "第一节点，余烬信开始解码。",
      },
      {
        title: "档案核心",
        scene: "档案核心像一座冷光图书馆，米拉的投影在一排排损坏日志间忽明忽暗。",
        goal: "恢复十二年前撤离日志。",
        plot: "被删改日志指出蓝桥父亲留下过手动口令。",
        direction: "让数据恢复带出伦理压力。",
        transition: "口令指向外舱走廊。",
        memory: "第二节点，档案开始反证官方记录。",
      },
      {
        title: "外舱走廊",
        scene: "外舱走廊只剩应急红光，行星云层在脚下旋转，倒计时每秒都像敲在舱壁上。",
        goal: "稳定推进环并决定是否公开最后一段信。",
        plot: "公开真相会动摇救援优先级，但隐瞒会让十二年前的人再次被抹去。",
        direction: "让选择同时影响生存和记忆。",
        transition: "进入公开、封存或转存支线。",
        memory: "第三节点，坠落倒计时逼近。",
      },
    ],
  },
];

const createDefaultStoryAsset = (
  workspaceId: string,
  blueprint: DefaultStoryBlueprint,
  timestamp: number,
): StoryAsset => {
  const stageId = `${blueprint.id}-stage-main`;
  const scenes = blueprint.scenes.map((scene, index) => ({
    ...scene,
    id: `${blueprint.id}-scene-${index + 1}`,
  }));
  const nodes = scenes.map((scene, index) => ({
    id: `${blueprint.id}-node-${index + 1}`,
    stageId,
    sceneId: scene.id,
    title: scene.title,
    type: index === scenes.length - 1 ? "ending" : "normal",
    pathRole: "main",
    status: index === 0 ? "ready" : "draft",
  }));

  return {
    id: blueprint.id,
    workspaceId,
    title: blueprint.title,
    outline: blueprint.outline,
    goal: blueprint.goal,
    userPersonaName: "我",
    characters: blueprint.characters,
    lorebookEntries: blueprint.lorebookEntries,
    scenes,
    graph: {
      entryNodeId: nodes[0]?.id ?? "",
      activeNodeId: nodes[0]?.id ?? "",
      stages: [{
        id: stageId,
        title: "主线",
        summary: blueprint.goal,
        order: 0,
      }],
      nodes,
      edges: nodes.slice(0, -1).map((node, index) => ({
        id: `${blueprint.id}-edge-${index + 1}-${index + 2}`,
        fromNodeId: node.id,
        toNodeId: nodes[index + 1]?.id ?? node.id,
        label: "继续",
        isDefault: true,
        priority: index,
      })),
    },
    manuscriptInbox: createEmptyStoryManuscriptInbox(),
    sourceRefs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const createDefaultStoryState = (
  workspaceId: string,
  timestamp = Date.now(),
): StoryState => {
  const stories = defaultStoryBlueprints.map((blueprint, index) =>
    createDefaultStoryAsset(workspaceId, blueprint, timestamp + index)
  );

  return {
    version: 1,
    activeStoryId: stories[0]?.id ?? "",
    stories,
  };
};
