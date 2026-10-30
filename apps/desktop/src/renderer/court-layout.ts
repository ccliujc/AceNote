export const MAX_COURT_BALLS = 24;

export interface CourtBall {
  x: number;
  y: number;
}

export function courtLayout(count: number): CourtBall[] {
  const visible = Math.min(Math.max(count, 0), MAX_COURT_BALLS);
  const columns = 6;
  return Array.from({ length: visible }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, visible - row * columns);
    const offset = (columns - rowCount) / 2;
    return {
      x: 8 + ((column + offset) * 84) / columns,
      y: 16 + row * 18,
    };
  });
}
