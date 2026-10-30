import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';

let database: Database.Database;
let repository: TaskRepository;
const now = new Date('2026-10-28T01:00:00.000Z');

beforeEach(() => {
  database = createDatabase(':memory:');
  repository = new TaskRepository(database, { clock: () => now, timeZone: 'Asia/Shanghai' });
});
afterEach(() => database.close());

describe('TaskRepository lifecycle', () => {
  it('completes atomically and counts by completion date', () => {
    const task = repository.create('写周报');
    const completed = repository.complete(task.id, task.revision);
    expect(completed).toMatchObject({
      status: 'completed', completedAt: now.toISOString(), completionDate: '2026-10-28', completionTimeZone: 'Asia/Shanghai',
    });
    expect(repository.dailyCompletionSummary('2026-10-28')).toEqual({ date: '2026-10-28', completedCount: 1 });
    expect(repository.listByRecordDate('2026-10-28')).toHaveLength(1);
    expect(repository.listByRecordDate('2026-10-28', 'open')).toHaveLength(0);
    expect(() => repository.complete(task.id, completed.revision)).toThrow('INVALID_TRANSITION');
  });

  it('archives and restores while keeping record dates independent', () => {
    const task = repository.create('联系小王');
    const archived = repository.archive(task.id, task.revision);
    expect(archived.status).toBe('archived');
    expect(repository.dailyCompletionSummary(task.recordDate).completedCount).toBe(0);
    const restored = repository.restore(task.id, archived.revision);
    expect(restored).toMatchObject({ status: 'open', archivedAt: null, completedAt: null });
    expect(restored.recordedAt).toBe(task.recordedAt);
  });

  it('clears completion metadata on restore and rejects stale revisions', () => {
    const task = repository.create('写周报');
    const completed = repository.complete(task.id, task.revision);
    expect(() => repository.archive(task.id, completed.revision)).toThrow('INVALID_TRANSITION');
    const restored = repository.restore(task.id, completed.revision);
    expect(restored).toMatchObject({ status: 'open', completionDate: null, completionTimeZone: null });
    expect(repository.dailyCompletionSummary('2026-10-28').completedCount).toBe(0);
    expect(() => repository.restore(task.id, 0)).toThrow('INVALID_TRANSITION');
    expect(() => repository.complete(task.id, 0)).toThrow('CONCURRENT_EDIT');
  });
});
