import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '../resources/pet');
const expected = ['ryoma-idle.png', 'ryoma-hit.png', 'ryoma-ace.png'];

describe('pet PNG assets', () => {
  it.each(expected)('%s is a 512x512 transparent PNG under 500KB', (file) => {
    const path = join(dir, file);
    const data = readFileSync(path);
    expect(data.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(data.readUInt32BE(16)).toBe(512);
    expect(data.readUInt32BE(20)).toBe(512);
    expect(data[25]).toBe(6);
    expect(statSync(path).size).toBeLessThan(500 * 1024);
  });

  it('contains all three pet mood assets', () => {
    expect(expected).toHaveLength(3);
  });
});
