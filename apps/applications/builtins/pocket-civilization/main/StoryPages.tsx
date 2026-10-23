import { useEffect, useState } from "react";
import { BookOpen, RotateCcw } from "lucide-react";
import { RESIDENTS, type World } from "./model";
import { isFinalJudgment } from "./day-draft";
import { Avatar, ClayButton } from "./Island";

const STAGES = { sprout: "花与小店的新尝试", pressure: "小路的难题", petition: "等你留个主意", agreement: "让约定成为日常", complete: "故事有了回音", changed: "法则翻到了下一页" };
export function StoryThreads({ world }: { world: World }) {
  const friendship = world.stories.friendship;
  if (!world.stories.flowers.length && friendship.stage === "unspoken") return <p className="writing-hint">故事会从居民的真实行动里慢慢长出来。</p>;
  return <section className="story-threads" aria-label="还在延续的故事"><h3 className="section-caption">故事还在往下长</h3>
    {[...world.stories.flowers].reverse().slice(0, 3).map((arc) => <details className="story-thread" key={arc.lawId}><summary><span>鲜花伞与一条小路<small>第{arc.startedDay}天开始 · {STAGES[arc.stage]}</small></span></summary>
      {arc.ending && <p className="story-ending">{arc.ending}</p>}<ol className="story-timeline">{arc.entries.map((entry) => <li key={entry.id}><small>第{entry.day}天</small><p>{entry.text}</p></li>)}</ol>
    </details>)}
    {friendship.stage !== "unspoken" && <details className="story-thread"><summary><span>把道歉变成日常<small>{friendship.stage === "friends" ? "从道歉走到信任" : "阿团正在用行动弥补"}</small></span></summary><ol className="story-timeline">{friendship.entries.map((entry) => <li key={entry.id}><small>第{entry.day}天</small><p>{entry.text}</p></li>)}</ol></details>}
    {world.petitions.some((p) => p.resolution) && <details className="story-thread"><summary><span>你留下的主意<small>每次选择，都有居民记得</small></span></summary>{world.petitions.filter((p) => p.resolution).slice(-6).map((petition) => <p className="story-choice-record" key={petition.id}><small>第{petition.resolvedDay}天 · {petition.title}</small>{petition.options.find((option) => option.id === petition.resolution)?.title}</p>)}</details>}
  </section>;
}

export function ReviewPage({ world, busy, resume, discard }: { world: World; busy: string; resume(note: string): void; discard(): void }) {
  const draft = world.dayDraft;
  const [note, setNote] = useState(draft?.note ?? "");
  useEffect(() => setNote(draft?.note ?? ""), [draft?.id]);
  if (!draft) return <><h2><BookOpen />明天还没写下</h2><p>目前没有待续的演绎。合上手册，去看看新的一天吧。</p></>;
  const completed = draft.judgments.filter(isFinalJudgment).length;
  const index = draft.judgments.findIndex((judgment) => !isFinalJudgment(judgment));
  const action = draft.actions[index], judgment = draft.judgments[index];
  return <><h2><BookOpen />明天的演绎草稿</h2><p className="draft-status">第{draft.day}天还没有发生<small>已完成{completed}/{draft.actions.length}件判断，库存、关系和日期尚未结算。</small></p>
    <ol className="draft-actions">{draft.actions.map((action, i) => <li key={action.residentId} aria-current={i === index ? "step" : undefined}><Avatar id={action.residentId} /><span><strong>{RESIDENTS[action.residentId].name}</strong><small>{action.text}</small></span><em>{isFinalJudgment(draft.judgments[i]) ? "已判断" : draft.judgments[i] ? "待复核" : "待判断"}</em></li>)}</ol>
    {action && <section className="review-evidence" aria-label="待复核的行动"><h3>停在{RESIDENTS[action.residentId].name}的这件事</h3><blockquote>“{action.speech}”</blockquote>
      {judgment && <><small className="section-caption">{judgment.status === "abstained" ? "智能判断暂时弃答" : "这次判断仍有争议"}</small><p className="event-reason">{judgment.reason}</p><p className="writing-hint">当前建议：{judgment.value ?? "信息不足，暂不判断"}。尚未采用。</p></>}
      <h3 className="section-caption">当事人知道的事</h3><ul className="event-consequences">{world.island.residents[action.residentId].knownFacts.slice(-5).map((fact) => <li key={fact}>{fact}</li>)}</ul>
      {!!world.island.residents[action.residentId].memories.length && <details><summary>翻看当事人的近期记忆</summary>{world.island.residents[action.residentId].memories.slice(-3).map((memory) => <p key={memory.eventId} className="writing-hint">第{memory.day}天 · {memory.text}</p>)}</details>}
      {draft.attempts.filter((attempt) => attempt.actionIndex === index).length > 1 && <details><summary>此前的复核依据</summary>{draft.attempts.filter((attempt) => attempt.actionIndex === index).slice(0, -1).slice(-3).map((attempt, i) => <p className="writing-hint" key={i}>{attempt.judgment.reason}</p>)}</details>}
      <label className="draft-label" htmlFor="review-note">给复核留一句说明（可不填）</label><textarea id="review-note" className="review-note" rows={3} maxLength={300} value={note} disabled={!!busy} onChange={(event) => setNote(event.target.value)} />
      <p className="writing-hint">说明你的理解，或指出已有材料中的线索。说明不会变成新的世界事实，仍需智能判断独立复核。</p>
    </section>}
    {draft.failure && <p className="book-error" role="status">上次中断：{draft.failure}</p>}
    <div className="draft-controls"><ClayButton disabled={!!busy} onClick={() => resume(note)}><RotateCcw size={18} />{completed === draft.actions.length ? "提交这一天" : judgment ? "复核并继续" : "继续演绎"}</ClayButton><button className="text-button" disabled={!!busy} onClick={discard}>放弃这份草稿</button></div>
    <p className="writing-hint">已完成的判断会保留。关闭手册或停止后，下次可从这里接着来。</p>
  </>;
}
