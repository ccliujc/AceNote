import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { createDatabase } from '../src/main/database';

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
  }
});

describe('database migrations', () => {
  it('runs both migrations idempotently and persists data after reopening', () => {
    const path = join(tmpdir(), `${randomUUID()}.sqlite`);
    paths.push(path);
    const first = createDatabase(path);
    expect(first.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 3 });
    first.close();

    const second = createDatabase(path);
    expect(second.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 3 });
    expect(second.prepare("SELECT name FROM sqlite_master WHERE name = 'intake_events'").get()).toEqual({ name: 'intake_events' });
    second.close();
  });

  it('upgrades a version 1 capture database without losing existing fields', () => {
    const path = join(tmpdir(), `${randomUUID()}.sqlite`);
    paths.push(path);
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES (1, '2026-10-01T00:00:00Z');
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY, raw_text TEXT NOT NULL, title TEXT NOT NULL,
        recorded_at TEXT NOT NULL, record_date TEXT NOT NULL, due_date TEXT, due_time TEXT,
        time_zone TEXT NOT NULL, contact TEXT, parse_status TEXT NOT NULL, parse_error TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, edited_at TEXT, revision INTEGER NOT NULL
      );
      INSERT INTO tasks VALUES (
        '11111111-1111-4111-8111-111111111111', '旧任务原文', '旧任务',
        '2026-10-01T01:00:00Z', '2026-10-01', NULL, NULL, 'Asia/Shanghai', NULL,
        'succeeded', NULL, '2026-10-01T01:00:00Z', '2026-10-01T01:00:00Z', NULL, 1
      );
    `);
    legacy.close();

    const upgraded = createDatabase(path);
    expect(upgraded.prepare('SELECT raw_text, title, record_date, revision, status FROM tasks').get()).toEqual({
      raw_text: '旧任务原文', title: '旧任务', record_date: '2026-10-01', revision: 1, status: 'open',
    });
    expect(upgraded.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 3 });
    upgraded.close();
  });
});
