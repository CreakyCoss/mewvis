import { useEffect, useRef, useState } from "react";
import type { Design } from "./model";
import { errorText, type DesignRepository, type Project } from "./repository";
import { createSaveQueue } from "./save-queue";

export function useDesign(project: Project, repository: DesignRepository) {
  const [design, update] = useState(project.design);
  const [status, setStatus] = useState("已保存到工作区");
  const alive = useRef(true);
  const [queue] = useState(() =>
    createSaveQueue<Design>((value) => repository.save(project, value)),
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function save() {
    if (alive.current) setStatus("正在保存…");
    try {
      await queue.flush();
      if (alive.current) setStatus("已保存到工作区");
    } catch (error) {
      if (alive.current) setStatus(`保存失败：${errorText(error)}`);
      throw error;
    }
  }
  return {
    design,
    status,
    save,
    setDesign(value: Design) {
      update(value);
      queue.enqueue(value);
      void save().catch(() => {});
    },
  };
}
