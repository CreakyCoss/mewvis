import { defaultExperiment } from "./linearExperiment";
import {
  upgradeLinearExperiment,
  validateExperiment,
  type ExpressionExperiment,
  type NumericVariable,
} from "./experiments";

export const experimentPresets = [
  { id: "quadratic", label: "二次函数", description: "探索系数与抛物线" },
  { id: "linear", label: "一次函数", description: "让直线经过指定点" },
  { id: "sine", label: "三角函数", description: "观察振幅、频率和相位" },
  { id: "ohm", label: "欧姆定律", description: "电压、电阻与电流" },
  { id: "cost", label: "成本与收益", description: "比较收入、成本和利润" },
] as const;
export type PresetId = (typeof experimentPresets)[number]["id"];
function variable(
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  unit = "",
  control: "slider" | "number" = "slider",
): NumericVariable {
  return { id, label, min, max, step, initial, unit, control };
}
export function createExperimentPreset(
  id: PresetId = "quadratic",
): ExpressionExperiment {
  const base: ExpressionExperiment = {
    template: "expression",
    version: 1,
    task: "调节 a、b、c，观察抛物线的开口、位置和函数值。",
    variables: [
      variable("a", "二次项系数", -3, 3, 0.1, 1),
      variable("b", "一次项系数", -4, 4, 0.1, 0),
      variable("c", "常数项", -5, 5, 0.1, 0),
      variable("x", "观察位置", -5, 5, 0.1, 2, "", "number"),
    ],
    outputs: [
      { id: "y", label: "函数值", unit: "", expression: "a*x^2+b*x+c" },
    ],
    views: { values: true, graph: true, table: true },
    axis: { variable: "x", min: -5, max: 5, samples: 81 },
    goal: { mode: "explore" },
    hint: "一次只改变一个系数，记录两组参数，比较图像。",
    successMessage: "",
  };
  if (id === "linear") return upgradeLinearExperiment(defaultExperiment());
  if (id === "sine")
    Object.assign(base, {
      task: "分别改变振幅、频率和相位，观察正弦曲线如何变化。",
      variables: [
        variable("A", "振幅", 0, 4, 0.1, 1),
        variable("w", "角频率", 0, 4, 0.1, 1),
        variable("phi", "相位", -3.14, 3.14, 0.01, 0, "rad"),
        variable("x", "观察位置", -6.28, 6.28, 0.01, 0, "rad", "number"),
      ],
      outputs: [
        { id: "y", label: "函数值", unit: "", expression: "A*sin(w*x+phi)" },
      ],
      axis: { variable: "x", min: -6.28, max: 6.28, samples: 121 },
      hint: "先固定频率和相位，比较 A = 1 与 A = 2 时的图像。三角函数使用弧度。",
    });
  if (id === "ohm")
    Object.assign(base, {
      task: "改变电压、电阻或开关状态，观察电流和功率。",
      variables: [
        variable("U", "电压", 0, 24, 0.5, 12, "V"),
        {
          id: "R",
          label: "电阻",
          unit: "Ω",
          control: "select",
          initial: 200,
          options: [
            { label: "100 Ω", value: 100 },
            { label: "200 Ω", value: 200 },
            { label: "400 Ω", value: 400 },
          ],
        },
        {
          id: "closed",
          label: "闭合开关",
          unit: "",
          control: "toggle",
          initial: 1,
        },
      ],
      outputs: [
        { id: "I", label: "电流", unit: "A", expression: "closed*U/R" },
        { id: "P", label: "功率", unit: "W", expression: "U*I" },
      ],
      axis: { variable: "U", min: 0, max: 24, samples: 49 },
      hint: "固定电压，把电阻增大一倍，观察电流的变化。开关断开时，电流为 0。",
    });
  if (id === "cost")
    Object.assign(base, {
      task: "调节销量，使利润达到 0–500 元，比较收入、成本与利润。",
      variables: [
        variable("price", "单价", 1, 100, 1, 20, "元", "number"),
        variable("unitCost", "单位成本", 0, 20, 1, 8, "元"),
        variable("fixedCost", "固定成本", 0, 10000, 100, 1000, "元", "number"),
        variable("quantity", "销量", 0, 200, 1, 50, "件", "number"),
      ],
      outputs: [
        {
          id: "revenue",
          label: "收入",
          unit: "元",
          expression: "price*quantity",
        },
        {
          id: "cost",
          label: "总成本",
          unit: "元",
          expression: "fixedCost+unitCost*quantity",
        },
        { id: "profit", label: "利润", unit: "元", expression: "revenue-cost" },
      ],
      axis: { variable: "quantity", min: 0, max: 200, samples: 41 },
      goal: {
        mode: "target",
        kind: "range",
        output: "profit",
        value: 0,
        min: 0,
        max: 500,
        tolerance: 0.01,
        reference: { price: 20, unitCost: 8, fixedCost: 1000, quantity: 100 },
      },
      hint: "先保持单价与成本不变，尝试提高销量。",
      successMessage:
        "已达到利润目标。尝试改变单位成本，看看需要怎样调整销量。",
    });
  return validateExperiment(base) as ExpressionExperiment;
}
