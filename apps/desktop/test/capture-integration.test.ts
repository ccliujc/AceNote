import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../src/main/database';
import { TaskRepository } from '../src/main/task-repository';
import { createHttpParser, ParseQueue } from '../src/main/parse-queue';
import { CaptureService } from '../src/main/capture-service';

const result = { title: '确认稿件', dueDate: '2026-10-26', dueTime: '15:00', contact: '小王' };
let database: Database.Database;
let repository: TaskRepository;

beforeEach(() => {
  database = createDatabase(':memory:');
  repository = new TaskRepository(database, { timeZone: 'Asia/Shanghai' });
});
afterEach(() => {
  database.close();
  vi.unstubAllGlobals();
});

describe('capture offline recovery', () => {
  it('keeps raw text through failure and resumes once without duplication', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const firstQueue = new ParseQueue(repository, createHttpParser());
    const service = new CaptureService(repository, firstQueue);
    const task = await service.submitTask('明天下午三点联系小王确认稿件');
    await firstQueue.idle();
    expect(repository.get(task.id)).toMatchObject({ rawText: '明天下午三点联系小王确认稿件', parseStatus: 'failed' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ requestId: task.id, result }), { status: 200 })));
    const resumedQueue = new ParseQueue(repository, createHttpParser());
    resumedQueue.resume();
    await resumedQueue.idle();

    expect(repository.list()).toHaveLength(1);
    expect(repository.get(task.id)).toMatchObject({ ...result, parseStatus: 'succeeded', recordedAt: task.recordedAt });
  });
});
