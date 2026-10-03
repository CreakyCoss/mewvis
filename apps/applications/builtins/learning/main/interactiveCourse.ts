import { validateCourse } from "./course";
import { createExperimentPreset, type PresetId } from "./experimentPresets";

const lessons: {
  preset: PresetId;
  title: string;
  objective: string;
  text: string;
  example: string;
  takeaways: string[];
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}[] = [
  {
    preset: "quadratic",
    title: "从公式观察抛物线",
    objective: "通过控制变量，解释二次函数系数与图像的关系。",
    text: "二次函数可以写为 $y=ax^2+bx+c$。固定其他系数，改变一个系数，再观察曲线和数值。\n\n当 $a>0$ 时，抛物线开口向上；当 $a<0$ 时，开口向下。$c$ 是横坐标为零时的函数值。实验中可以保存多组观察，比较变化。",
    example: "保持 a=1、b=0，将 c 从 0 改为 2，图像向上平移 2 个单位。",
    takeaways: [
      "一次只改变一个变量，更容易解释变化。",
      "a 的符号影响开口方向，c 决定纵轴交点。",
    ],
    question: "保持 a、b 不变，把 c 增加 2，图像怎样变化？",
    options: ["向上平移 2 个单位", "开口方向反转"],
    answer: "A",
    explanation: "每一个 x 对应的 y 都增加 2。",
  },
  {
    preset: "ohm",
    title: "电压、电阻与电流",
    objective: "用不同输入控件探索欧姆定律，并计算功率。",
    text: "在这个理想电路模型中，闭合开关后有 $I=U/R$。固定电压时，电阻越大，电流越小。\n\n实验包含滑块、下拉选项和开关，功率由 $P=UI$ 计算。电流与功率的单位不同，可以切换曲线查看。",
    example:
      "电压 12 V、电阻 200 Ω、开关闭合时，电流为 0.06 A，功率为 0.72 W。",
    takeaways: [
      "电压不变，电阻增大一倍，电流减半。",
      "多个计算结果可以相互引用。",
    ],
    question: "电压不变，电阻从 200 Ω 变为 400 Ω，电流怎样变化？",
    options: ["增大一倍", "减半"],
    answer: "B",
    explanation: "根据 I=U/R，电阻增大一倍，电流减半。",
  },
  {
    preset: "cost",
    title: "收入、成本与利润",
    objective: "用多个相互关联的结果，找到满足目标的参数。",
    text: "总收入等于单价乘销量，总成本包括固定成本和按销量变化的成本。利润是收入与成本之差。\n\n在实验中保留一组价格和成本，通过调整销量，让利润进入目标区间。查看曲线交点，解释什么时候开始盈利。",
    example:
      "单价 20 元、单位成本 8 元、固定成本 1000 元时，销量 100 件对应利润 200 元。",
    takeaways: ["固定成本不随销量变化。", "利润等于收入减总成本。"],
    question: "收入和总成本相等时，利润是多少？",
    options: ["0", "固定成本"],
    answer: "A",
    explanation: "利润等于收入减成本，相等时为 0。",
  },
  {
    preset: "sine",
    title: "正弦曲线的变化",
    objective: "区分振幅、角频率和相位对曲线的影响。",
    text: "周期变化可以写为 $y=A\\sin(\\omega x+\\varphi)$。振幅控制上下起伏的幅度，角频率影响周期，相位影响横向位置。\n\n实验采用弧度。保持其他变量不变，逐个调整并保存观察，比较同一范围内出现的波峰数量。",
    example:
      "保持角频率和相位不变，把振幅 A 从 1 调到 2，波峰高度变为原来的 2 倍。",
    takeaways: [
      "振幅影响波峰与波谷的高度。",
      "角频率越大，同一范围内的周期越多。",
    ],
    question: "保持角频率和相位不变，将 A 增大一倍，哪个量增大一倍？",
    options: ["周期", "振幅"],
    answer: "B",
    explanation: "A 直接决定振幅，周期由角频率决定。",
  },
];
export const interactiveCourse = validateCourse({
  version: 2,
  id: "learning-interactive-models-v1",
  createdAt: 0,
  origin: "example",
  status: "ready",
  title: "公式与互动实验",
  description: "从抛物线到电路和成本，用可调模型连接公式、图像与观察。",
  level: "零基础",
  outline: {
    goal: "用可配置的实验观察变量关系，比较不同尝试并解释结果。",
    phases: [
      { title: "探索变化", summary: "用公式和输入变量观察结果。" },
      { title: "验证目标", summary: "建立关系、比较记录并检验目标。" },
    ],
  },
  lessons: lessons.map((lesson, index) => {
    const experiment = createExperimentPreset(lesson.preset);
    return {
      id: `interactive-${lesson.preset}`,
      title: lesson.title,
      objective: lesson.objective,
      blocks: [
        { id: `text-${index}`, type: "text", text: lesson.text },
        {
          id: `formula-${index}`,
          type: "formula",
          latex: "",
          caption: "本公式与动手实验中的计算模型保持同步。",
          experimentOutput: experiment.outputs[0].id,
          ...(lesson.preset === "ohm"
            ? {
                symbols: [
                  { symbol: "U", meaning: "电压", unit: "V" },
                  { symbol: "R", meaning: "电阻", unit: "Ω" },
                  { symbol: "I", meaning: "电流", unit: "A" },
                  {
                    symbol: "\\mathrm{closed}",
                    meaning: "开关状态：闭合为 1，断开为 0",
                    unit: "",
                  },
                ],
                steps: [
                  {
                    latex: String.raw`I = \frac{U}{R}`,
                    explanation: "示例：闭合开关，选择电压 12 V 和电阻 200 Ω。",
                  },
                  {
                    latex: String.raw`I = \frac{12}{200} = 0.06\,\mathrm{A}`,
                    explanation: "代入得到电流 0.06 A。",
                  },
                  {
                    latex: String.raw`P = UI = 12\times 0.06 = 0.72\,\mathrm{W}`,
                    explanation: "把电流代入功率关系式，得到功率 0.72 W。",
                  },
                ],
              }
            : {}),
        },
      ],
      experiment,
      example: lesson.example,
      takeaways: lesson.takeaways,
      questions: [
        {
          points: 1,
          question: lesson.question,
          options: lesson.options.map((label, i) => ({
            value: String.fromCharCode(65 + i),
            label,
          })),
          answer: lesson.answer,
          explanation: lesson.explanation,
        },
      ],
    };
  }),
});
