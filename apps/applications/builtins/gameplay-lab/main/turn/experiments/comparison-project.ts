import type { Project } from "../../projects/model";
import { simulatorKey } from "../../shared/contracts";
import { copy } from "../../shared/utils";
import {
  selectedSetup,
  type ExperimentSetup,
  type PlaytestConfig,
} from "../playtest/config";
import { newComparisonExperiment } from "../records/records";
import { assertSimulator, inferLegacySimulator } from "../simulators";
import {
  parameterPlan,
  versionPlan,
  type ParameterRef,
  type RuleVariant,
} from "./comparison";
export interface ComparisonRequest {
  mode: "versions" | "parameter";
  baseline: string;
  candidate?: string;
  scan?: { parameter: ParameterRef; from: number; to: number; step: number };
}
export function ruleSources(project: Project) {
  return [
    {
      id: "draft",
      name: "当前草稿",
      model: project.model,
      source: "draft" as const,
      simulator:
        project.simulator === undefined
          ? inferLegacySimulator(project.model)
          : project.simulator,
    },
    ...project.versions.map((v) => ({
      id: v.id,
      name: v.name,
      model: v.model,
      source: "version" as const,
      versionId: v.id,
      simulator:
        v.simulator === undefined ? inferLegacySimulator(v.model) : v.simulator,
    })),
  ];
}
export function prepareComparison(
  project: Project,
  config: PlaytestConfig,
  request: ComparisonRequest,
) {
  if (config.projectId !== project.id)
    throw new Error("场景配置与当前项目不匹配。");
  const sources = ruleSources(project),
    base = sources.find((s) => s.id === request.baseline);
  if (!base) throw new Error("基准版本已不存在，请重新选择。");
  const metadata = (
    s: ReturnType<typeof ruleSources>[number],
  ): Omit<RuleVariant, "id"> => ({
    name: s.source === "draft" ? "草稿快照" : s.name.slice(0, 300),
    source: s.source,
    ...(s.source === "version" ? { versionId: s.versionId } : {}),
    model: copy(s.model),
  });
  if (!base.simulator) throw new Error("基准规则尚未选择玩法模拟器。");
  assertSimulator(base.model, base.simulator);
  let plan;
  if (request.mode === "versions") {
    const candidate = sources.find((s) => s.id === request.candidate);
    if (!candidate) throw new Error("请选择候选版本，或先保存一个命名版本。");
    if (
      !candidate.simulator ||
      simulatorKey(candidate.simulator) !== simulatorKey(base.simulator)
    )
      throw new Error("规则对照需要相同的模拟器及版本。");
    assertSimulator(candidate.model, candidate.simulator);
    plan = versionPlan(metadata(base), metadata(candidate));
  } else {
    if (!request.scan) throw new Error("请选择参数和扫描范围。");
    const { model: _, ...source } = metadata(base);
    plan = parameterPlan(
      base.model,
      source,
      request.scan.parameter,
      request.scan.from,
      request.scan.to,
      request.scan.step,
    );
  }
  return newComparisonExperiment(
    project.id,
    base.model,
    selectedSetup(config, base.model, true) as ExperimentSetup,
    plan,
    base.simulator,
  );
}
