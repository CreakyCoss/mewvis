import { canPlace, isSolved, type Placements } from "./engine";
import { LEVELS } from "./levels";
export type Progress = {
  version: 1;
  current: number;
  completed: number[];
  boards: Record<string, Placements>;
};
export const freshProgress = (): Progress => ({
  version: 1,
  current: 1,
  completed: [],
  boards: {},
});
export function unlocked(progress: Progress, id: number) {
  return (
    id === 1 || (id <= LEVELS.length && progress.completed.includes(id - 1))
  );
}
export function restoreProgress(value: unknown): Progress {
  const result = freshProgress();
  if (!value || typeof value !== "object" || (value as Progress).version !== 1)
    return result;
  const raw = value as Progress;
  for (const level of LEVELS) {
    const board = raw.boards?.[level.id];
    if (!board || typeof board !== "object" || Array.isArray(board)) continue;
    const clean: Placements = {};
    for (const piece of level.pieces) {
      const pose = board[piece.id];
      if (
        pose &&
        typeof pose === "object" &&
        canPlace(level, clean, piece.id, pose)
      )
        clean[piece.id] = { x: pose.x, y: pose.y, rotation: pose.rotation };
    }
    result.boards[level.id] = clean;
  }
  // Completion is monotonic and contiguous. A replay need not preserve its solved board.
  for (const level of LEVELS) {
    if (
      (Array.isArray(raw.completed) && raw.completed.includes(level.id)) ||
      isSolved(level, result.boards[level.id] ?? {})
    )
      result.completed.push(level.id);
    else break;
  }
  if (
    Number.isInteger(raw.current) &&
    raw.current >= 1 &&
    unlocked(result, raw.current)
  )
    result.current = raw.current;
  return result;
}
export function updateBoard(
  progress: Progress,
  id: number,
  board: Placements,
): Progress {
  const completed = [...progress.completed];
  const level = LEVELS.find((l) => l.id === id);
  if (
    level &&
    unlocked(progress, id) &&
    isSolved(level, board) &&
    !completed.includes(id)
  )
    completed.push(id);
  return {
    ...progress,
    current: id,
    completed: completed.sort((a, b) => a - b),
    boards: { ...progress.boards, [id]: board },
  };
}
