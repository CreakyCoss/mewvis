import { validateCourse } from "./course";
import { defaultExperiment } from "./richContent";

/** An opt-in example; never installed over an existing course. */
export const functionCourse = validateCourse({
  version: 2,
  id: "learning-function-graph",
  createdAt: 0,
  origin: "example",
  status: "ready",
  title: "用函数理解变化",
  description: "从坐标到函数，用公式、图解和动手实验理解斜率与截距。",
  level: "零基础",
  outline: {
    goal: "能用一次函数描述变化，并根据图像解释参数的含义。",
    phases: [
      { title: "认识函数", summary: "理解坐标、斜率与截距。" },
      { title: "应用函数", summary: "观察变化并解决实际问题。" },
    ],
  },
  lessons: [
    {
      id: "function-coordinates",
      title: "认识坐标系",
      objective: "用一对有序数描述平面上的位置。",
      content:
        "平面直角坐标系用两条互相垂直的数轴确定位置。横轴记录 x，纵轴记录 y。原点是两条轴的交点，坐标为 (0, 0)。\n\n点 (2, 5) 表示从原点向右移动 2 个单位，再向上移动 5 个单位。坐标的顺序有意义：(2, 5) 和 (5, 2) 通常是两个不同的点。",
      example:
        "在记录路程时，可以把横轴作为时间、纵轴作为路程。点 (2, 5) 就可以表示 2 小时行进了 5 千米。",
      takeaways: ["横坐标在前，纵坐标在后。", "坐标轴的交点是原点。"],
      questions: [
        {
          points: 1,
          question: "点 (2, 5) 的纵坐标是多少？",
          options: [
            { value: "A", label: "2" },
            { value: "B", label: "5" },
          ],
          answer: "B",
          explanation: "有序数对中的第二个数是纵坐标。",
        },
      ],
    },
    {
      id: "function-slope",
      title: "斜率与截距",
      objective: "调节参数，观察公式与图像的对应关系。",
      blocks: [
        {
          id: "slope-text",
          type: "text",
          text: "直线的变化，由**斜率 k** 和**截距 b** 共同决定。先读懂公式，再观察图像。\n\n固定 b，增大 k，直线会更陡；固定 k，改变 b，直线会沿纵向平移。",
        },
        {
          id: "slope-formula",
          type: "formula",
          latex: "y = kx + b",
          caption: "k 表示斜率，b 表示截距。当 x = 0 时，y = b。",
        },
        {
          id: "slope-diagram",
          type: "diagram",
          title: "从输入到输出",
          direction: "horizontal",
          nodes: [
            { label: "x", description: "输入" },
            { label: "× k", description: "控制倾斜程度" },
            { label: "+ b", description: "控制纵向位置" },
            { label: "y", description: "输出" },
          ],
          caption: "先乘斜率，再加截距。",
        },
      ],
      experiment: defaultExperiment(),
      example:
        "当 k = 1、b = 1 时，x = 2 对应 y = 1 × 2 + 1 = 3。若想让直线经过 (2, 5)，可以保持 b = 1，把 k 调整为 2。还有其他解吗？",
      takeaways: [
        "k 改变直线的倾斜程度。",
        "b 决定直线与 y 轴的交点。",
        "经过一个指定点的直线可以有多条。",
      ],
      questions: [
        {
          points: 1,
          question: "保持 k 不变，把 b 从 1 调整为 3，直线如何变化？",
          options: [
            { value: "A", label: "向上平移 2 个单位" },
            { value: "B", label: "倾斜程度变大" },
          ],
          answer: "A",
          explanation:
            "对于同一个 x，y 增加了 2，所以整条直线向上平移 2 个单位。",
        },
      ],
    },
    {
      id: "function-change",
      title: "从图像读懂变化",
      objective: "根据斜率的符号判断增减趋势。",
      content:
        "斜率描述 x 增加一个单位时 y 的变化量。当 k > 0，直线从左到右上升；当 k < 0，直线从左到右下降；当 k = 0，y 不随 x 改变。\n\n比较变化快慢时，还要看斜率的绝对值。绝对值越大，同样的横向变化对应的纵向变化越大。",
      example:
        "y = 2x + 1 中，x 每增加 1，y 增加 2。y = -2x + 1 中，x 每增加 1，y 减少 2。",
      takeaways: ["斜率的符号决定增减趋势。", "斜率的绝对值反映变化的快慢。"],
      questions: [
        {
          points: 1,
          question: "哪一个函数随 x 增加而减小？",
          options: [
            { value: "A", label: "y = 2x + 1" },
            { value: "B", label: "y = -2x + 1" },
          ],
          answer: "B",
          explanation: "B 的斜率为负数，图像从左到右下降。",
        },
      ],
    },
    {
      id: "function-apply",
      title: "用函数解决问题",
      objective: "把固定费用和按量费用写成一次函数。",
      content:
        "当总费用由固定部分和按量变化的部分组成时，可以用一次函数建立模型。把数量设为 x，总费用设为 y，单位费用对应斜率 k，固定费用对应截距 b。\n\n使用模型前，要说明适用范围。例如购买数量不能为负，也不一定能取小数。函数能帮助计算，但仍需要检查结果是否符合实际场景。",
      example:
        "某服务收取 10 元固定费用，每次使用再收 2 元。使用 x 次时，总费用 y = 2x + 10。使用 3 次需要 16 元。",
      takeaways: [
        "单位费用对应斜率。",
        "固定费用对应截距。",
        "应用函数时要检查数量的实际范围。",
      ],
      questions: [
        {
          points: 1,
          question: "y = 2x + 10 中的 10 表示什么？",
          options: [
            { value: "A", label: "每次使用的费用" },
            { value: "B", label: "固定费用" },
          ],
          answer: "B",
          explanation: "不论使用多少次，固定部分都是 10 元。",
        },
      ],
    },
  ],
});
