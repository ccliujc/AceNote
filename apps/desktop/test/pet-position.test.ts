import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { clampPosition, defaultPosition, readPosition, writePosition } from '../src/main/pet-position';

const files: string[] = [];
afterEach(() => {
  for (const file of files.splice(0)) for (const suffix of ['', '.tmp']) rmSync(file + suffix, { force: true });
});

const area = { x: 0, y: 0, width: 1440, height: 900 };
const size = { width: 220, height: 220 };

describe('pet position', () => {
  it('defaults to the lower-right safe area without crossing bounds', () => {
    expect(defaultPosition(area, size)).toEqual({ x: 1196, y: 656 });
  });

  it('clamps negative and off-screen positions', () => {
    expect(clampPosition({ x: -90, y: -50 }, size, [area])).toEqual({ x: 0, y: 0 });
    expect(clampPosition({ x: 1300, y: 800 }, size, [area])).toEqual({ x: 1220, y: 680 });
    expect(clampPosition({ x: 3000, y: 3000 }, size, [area])).toEqual({ x: 1196, y: 656 });
  });

  it('persists position atomically and survives damaged files', () => {
    const file = join(tmpdir(), `${randomUUID()}.json`);
    files.push(file);
    expect(readPosition(file)).toBeNull();
    writePosition(file, { x: 31, y: 42 });
    expect(readPosition(file)).toEqual({ x: 31, y: 42 });
  });
});
