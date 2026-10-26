import { setTimeout as delay } from "node:timers/promises";
import type { KnowledgeService } from "@mewvis/knowledge-service";

/** Only --demo invokes this, and only for an empty data space. These are real persisted sample documents. */
export async function seedKnowledgeDemo(
  service: KnowledgeService,
): Promise<void> {
  if ((await service.bases.list({ limit: 1 })).items.length) return;
  const base = await service.bases.create({
    name: "团队资料",
    description: "团队协作、权限说明与日常规范。",
  });
  const job = await service.documents.import({
    knowledgeBaseId: base.id,
    documents: [
      {
        externalId: "demo/team-guide",
        title: "团队协作指南.md",
        text: `# 团队协作指南

## 项目访问与权限

项目是团队协作的基本单元。成员可以在项目中查阅资料、参与讨论，并完成分配的任务。

新成员可向项目管理员申请访问权限。管理员审核后，成员即可查阅项目资料。

## 权限说明

不同角色拥有不同的资料访问范围。成员可以在项目设置中查看自己的权限。

- 阅读资料：查阅已经获得授权的项目内容。
- 编辑内容：创建、编辑和维护项目文档，并参与讨论。
- 管理成员：维护成员信息与对应的访问范围。

## 常见问题

如遇到无法访问的内容，请联系项目管理员确认授权范围。`,
        source: {
          uri: "urn:mewvis:demo:team-guide",
          mediaType: "text/markdown",
        },
      },
      {
        externalId: "demo/access",
        title: "项目权限说明.md",
        text: `# 项目权限说明

## 申请访问

新成员如需访问项目资料，请向项目管理员提交访问申请，说明加入原因。管理员会根据项目需要进行审核，审核通过后将授予对应的访问权限。

## 权限范围

阅读权限可以查阅已授权的项目内容。编辑权限可以创建和维护项目文档。成员可以在项目设置中查看自己的权限。

## 申请注意事项

提交申请前，请确认项目名称与所需权限。`,
        source: { uri: "urn:mewvis:demo:access", mediaType: "text/markdown" },
      },
    ],
  });
  const deadline = Date.now() + 30_000;
  for (;;) {
    const current = await service.jobs.get({
      knowledgeBaseId: base.id,
      jobId: job.id,
    });
    if (current.state === "succeeded") break;
    if (["failed", "cancelled", "partially_succeeded"].includes(current.state))
      throw new Error("示例资料导入失败，请查看任务详情。");
    if (Date.now() > deadline)
      throw new Error("示例资料仍在处理中，可重新启动后从任务查看。");
    await delay(25);
  }
  await service.bases.create({
    name: "产品手册",
    description: "产品功能、操作说明与常见问题。",
  });
  await service.bases.create({
    name: "项目档案",
    description: "项目记录与阶段资料。",
  });
}
