import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface WorkArea extends Point, Size {}

export function clampPosition(point: Point, size: Size, areas: WorkArea[]): Point {
  const visible = areas.some((area) =>
    point.x + size.width > area.x && point.x < area.x + area.width
    && point.y + size.height > area.y && point.y < area.y + area.height);
  if (!visible && areas[0]) return defaultPosition(areas[0], size);
  const area = areas.find((item) => point.x >= item.x && point.x < item.x + item.width) ?? areas[0];
  if (!area) return point;
  return {
    x: Math.min(Math.max(point.x, area.x), area.x + area.width - size.width),
    y: Math.min(Math.max(point.y, area.y), area.y + area.height - size.height),
  };
}

export function defaultPosition(area: WorkArea, size: Size): Point {
  return {
    x: Math.max(area.x, area.x + area.width - size.width - 24),
    y: Math.max(area.y, area.y + area.height - size.height - 24),
  };
}

export function readPosition(path: string): Point | null {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<Point>;
    return Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x!, y: value.y! } : null;
  } catch {
    return null;
  }
}

export function writePosition(path: string, point: Point): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(point), 'utf8');
  renameSync(temporary, path);
}
