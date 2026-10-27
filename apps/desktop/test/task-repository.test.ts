import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';

let database: Database.Database;
let repository: TaskRepository;
const now = new Date('2026-10-25T14:30:00.000Z');

beforeEach(() => {
  database = createDatabase(':memory:');
  repository = new TaskRepository(database, {
    clock: () => now,
    idGenerator: () => '11111111-1111-4111-8111-111111111111',
    timeZone: 'Asia/Shanghai',
  });
});

afterEach(() => database.close());

describe('TaskRepository', () => {
  it('persists raw text with device timestamps and pending status', () => {
    const task = repository.create('  明天联系小王确认稿件  ');
    expect(task).toMatchObject({
      rawText: '明天联系小王确认稿件',
      recordedAt: now.toISOString(),
      recordDate: '2026-10-25',
      timeZone: 'Asia/Shanghai',
      dueDate: null,
      dueTime: null,
      contact: null,
      parseStatus: 'pending',
      revision: 0,
    });
    expect(repository.list()).toHaveLength(1);
  });

  it('uses UUID idempotency and preserves raw text', () => {
    const first = repository.create('写周报');
    const second = repository.create('写周报');
    expect(second.id).toBe(first.id);
    expect(repository.list()).toHaveLength(1);
    expect(repository.get(first.id).rawText).toBe('写周报');
  });

  it('increments revision on manual edits', () => {
    const task = repository.create('写周报');
    const edited = repository.update(task.id, { title: '完成周报', contact: '小李' }, task.revision);
    expect(edited.revision).toBe(1);
    expect(edited.editedAt).toBe(now.toISOString());
    expect(edited.recordedAt).toBe(task.recordedAt);
  });

  it('rejects a stale parse result after a manual edit', () => {
    const task = repository.create('明天写周报');
    repository.update(task.id, { title: '手动标题' }, 0);
    expect(repository.applyParseResult(task.id, 0, {
      title: '模型标题', dueDate: '2026-10-26', dueTime: null, contact: null,
    })).toBeNull();
    expect(repository.get(task.id).title).toBe('手动标题');
  });

  it('accepts a current parse result without changing record timestamps', () => {
    const task = repository.create('明天上午十点写周报');
    const parsed = repository.applyParseResult(task.id, 0, {
      title: '写周报', dueDate: '2026-10-26', dueTime: '10:00', contact: null,
    });
    expect(parsed).toMatchObject({ parseStatus: 'succeeded', recordedAt: task.recordedAt, recordDate: task.recordDate });
  });
});
