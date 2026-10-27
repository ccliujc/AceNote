import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { createDatabase } from '../src/main/database';

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { force: true });
});

describe('database migrations', () => {
  it('runs migrations idempotently and persists data after reopening', () => {
    const path = join(tmpdir(), `${randomUUID()}.sqlite`);
    paths.push(path);
    const first = createDatabase(path);
    first.prepare('SELECT version FROM schema_migrations').get();
    first.close();

    const second = createDatabase(path);
    expect(second.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 1 });
    expect(second.prepare("SELECT name FROM sqlite_master WHERE name = 'tasks'").get()).toEqual({ name: 'tasks' });
    second.close();
  });
});
